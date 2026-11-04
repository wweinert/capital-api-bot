import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { PORTFOLIO, RISK, TIMEFRAMES } from "../config.js";

function createService(api = {}) {
    const source = fs.readFileSync(new URL("../services/trading.js", import.meta.url), "utf8")
        .replace(/^import[\s\S]*?;\n/gm, "")
        .replace("export default new TradingService();", "new TradingService();");
    return vm.runInNewContext(source, {
        RISK, PORTFOLIO, TIMEFRAMES, Date, Promise,
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        setTimeout: (callback) => callback(),
        ...api,
    });
}

test("account refresh retries missing responses and keeps optional margin", async () => {
    let calls = 0;
    const service = createService({ getAccountInfo: async () => {
        calls++;
        return calls === 1 ? {} : { accounts: [{ balance: { balance: 1200 } }] };
    } });
    service.availableMargin = 800;
    await service.updateAccountInfo();
    assert.equal(calls, 2);
    assert.equal(service.accountBalance, 1200);
    assert.equal(service.availableMargin, 800);
});

test("account refresh stops after three empty or failed responses", async () => {
    for (const fails of [false, true]) {
        let calls = 0;
        const service = createService({ getAccountInfo: async () => {
            calls++;
            if (fails) throw new Error("offline");
            return {};
        } });
        service.accountBalance = 1000;
        service.availableMargin = 900;
        await service.updateAccountInfo();
        assert.equal(calls, 3);
        assert.equal(service.accountBalance, 1000);
        assert.equal(service.availableMargin, 900);
    }
});

test("selection ranks candidates and counts pending orders as occupied positions", async () => {
    const service = createService();
    service.syncOpenTradesFromBroker = async () => {};
    service.getAllowedCandidates = async (candidates) => candidates;
    service.rateCandidate = (candidate) => candidate.rating;
    const executed = [];
    service.executeCandidate = async (candidate) => { executed.push(candidate.symbol); return true; };
    const candidates = [
        { symbol: "EURUSD", rating: -0.5 },
        { symbol: "GBPUSD", rating: 0.2 },
        { symbol: "AUDUSD", rating: -0.9 },
    ];
    await service.processCandidates(candidates);
    assert.deepEqual(executed, ["GBPUSD"]);
    assert.deepEqual(Array.from(service.openTrades), ["GBPUSD"]);
    await service.processCandidates(candidates);
    assert.deepEqual(executed, ["GBPUSD"]);
});

test("selection admits the exact rating boundary and rejects lower ratings", async () => {
    for (const rating of [-0.833014, -0.833015, NaN]) {
        const service = createService();
        service.syncOpenTradesFromBroker = async () => {};
        service.getAllowedCandidates = async (candidates) => candidates;
        service.rateCandidate = () => rating;
        let executed = false;
        service.executeCandidate = async () => { executed = true; return true; };
        await service.processCandidates([{ symbol: "EURUSD" }]);
        assert.equal(executed, rating === -0.833014);
    }
});

test("execution preserves BUY and SELL entry, protection and margin reservation", async () => {
    for (const signal of ["bullish", "bearish"]) {
        let payload;
        const service = createService({
            getMarketDetails: async () => ({ snapshot: { bid: 100, offer: 100.01 } }),
            placeOrder: async (order) => { payload = order; return { dealReference: "order" }; },
            getDealConfirmation: async () => ({ dealStatus: "ACCEPTED" }),
        });
        service.positionSize = async () => ({ size: 100, availableMargin: 900, marginRequired: 200 });
        const candidate = { symbol: "USDJPY", signal, candles: { h1: [{ high: 101, low: 99 }] } };
        assert.equal(await service.executeCandidate(candidate), true);
        const buy = signal === "bullish";
        const entry = buy ? 101.03 : 98.97;
        const stop = buy ? 98.97 : 101.03;
        const distance = Math.abs(entry - stop);
        assert.equal(payload.direction, buy ? "BUY" : "SELL");
        assert.equal(payload.level, entry);
        assert.equal(payload.stopLevel, stop);
        assert.equal(payload.profitLevel, buy ? entry + 2.5 * distance : entry - 2.5 * distance);
        assert.equal(service.availableMargin, 700);
        assert.ok(Math.abs(Date.parse(`${payload.goodTillDate}Z`) - Date.now() - 45 * 60_000) < 2000);
    }
});

test("rejected or crossed orders do not reserve margin", async () => {
    for (const crossed of [false, true]) {
        let placed = false;
        const service = createService({
            getMarketDetails: async () => ({ snapshot: { bid: crossed ? 102 : 100, offer: crossed ? 102.01 : 100.01 } }),
            placeOrder: async () => { placed = true; return { dealReference: "order" }; },
            getDealConfirmation: async () => ({ dealStatus: "REJECTED", reason: "test" }),
        });
        service.availableMargin = 900;
        service.positionSize = async () => ({ size: 100, availableMargin: 900, marginRequired: 200 });
        const result = await service.executeCandidate({ symbol: "USDJPY", signal: "bullish", candles: { h1: [{ high: 101, low: 99 }] } });
        assert.equal(result, false);
        assert.equal(service.availableMargin, 900);
        assert.equal(placed, !crossed);
    }
});
