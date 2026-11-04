import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { PORTFOLIO, RISK, TIMEFRAMES } from "../config.js";
import { calcIndicators, aggregateM30 } from "../indicators/indicators.js";

function createService(api = {}) {
    const source = fs.readFileSync(new URL("../services/trading.js", import.meta.url), "utf8")
        .replace(/^import[\s\S]*?;\n/gm, "")
        .replace("export default new TradingService();", "new TradingService();");
    return vm.runInNewContext(source, {
        RISK, PORTFOLIO, TIMEFRAMES, Date, Promise, calcIndicators, aggregateM30,
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
        const candidate = { symbol: "USDJPY", signal, decisionTime: Date.now(), candles: { h1: [{ high: 101, low: 99 }] } };
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
        const result = await service.executeCandidate({ symbol: "USDJPY", signal: "bullish", decisionTime: Date.now(), candles: { h1: [{ high: 101, low: 99 }] } });
        assert.equal(result, false);
        assert.equal(service.availableMargin, 900);
        assert.equal(placed, !crossed);
    }
});

test("M30 protection restores the original risk after a restart and a tightened stop", async () => {
    let historyCalls = 0;
    const updates = [];
    const openedAt = Date.parse("2026-11-04T11:33:00Z");
    const service = createService({
        getAccountActivity: async () => {
            historyCalls++;
            return [{ dealId: "order", epic: "EURUSD", type: "WORKING_ORDER", status: "CREATED", dateUTC: "2026-11-04T11:30:05",
                details: { direction: "BUY", level: 100, stopLevel: 99, profitLevel: 101.5 } }];
        },
        getHistorical: async () => ({ prices: Array.from({ length: 60 }, (_, index) => ({
            timestamp: new Date(Date.now() - (60 - index) * 300_000).toISOString(),
            open: 101.1, close: 101.2, high: 101.4, low: 101.05, volume: 100,
        })) }),
        updatePositionProtection: async (...args) => { updates.push(args); return { dealReference: "updated" }; },
        getDealConfirmation: async () => ({ dealStatus: "ACCEPTED" }),
    });
    service.getDynamicStepTimeframe = async (symbol, direction, time, timeframe) => {
        assert.equal(timeframe, "m30");
        assert.equal(time, Date.parse("2026-11-04T11:30:00Z"));
        return "M5";
    };
    const position = { symbol: "EURUSD", dealId: "position", workingOrderId: "order", direction: "BUY", openedAt,
        entryPrice: 100, stopLoss: 100.8, takeProfit: 101.5, currentPrice: 101.2, trailingStop: false };
    await service.updateDynamicStopIfNeeded(position);
    assert.equal(service.dynamicPlanByDeal.get("position").riskDistance, 1);
    assert.equal(updates.length, 1);
    assert.equal(updates[0][0], "position");
    assert.ok(Math.abs(updates[0][1] - 100.9975) < 1e-8);
    assert.equal(updates[0][2], 101.5);
    await service.updateDynamicStopIfNeeded({ ...position, stopLoss: updates[0][1] });
    assert.equal(historyCalls, 1);
    assert.equal(updates.length, 1);
});

test("entry policy rejects weekends, 20:00 and Friday 18:00", async () => {
    for (const [time, expected] of [["2026-11-04T19:59:00Z", 1], ["2026-11-04T20:00:00Z", 0],
        ["2026-11-06T18:00:00Z", 0], ["2026-11-07T06:00:00Z", 0]]) {
        class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } }
        const service = createService({ Date: Clock, getAccountTransactions: async () => [] });
        service.accountBalance = 1000;
        assert.equal((await service.getAllowedCandidates([{ symbol: "EURUSD" }])).length, expected);
    }
});

test("restoration refuses old H1 1.5R orders instead of treating them as M30", async () => {
    const service = createService({ getAccountActivity: async () => [{ dealId: "old-order", epic: "EURUSD",
        type: "WORKING_ORDER", status: "CREATED", dateUTC: "2026-11-04T06:00:05",
        details: { direction: "BUY", level: 100, stopLevel: 99, profitLevel: 101.5 } }] });
    service.getDynamicStepTimeframe = () => { throw new Error("must not restore an unsupported legacy order"); };
    assert.equal(await service.restoreProtectionPlan({ symbol: "EURUSD", workingOrderId: "old-order", direction: "BUY",
        openedAt: Date.parse("2026-11-04T06:05:00Z") }), null);
});

test("M30 execution passes its reduced risk and caches the accepted order protection", async () => {
    let requestedRisk;
    let payload;
    const service = createService({
        getMarketDetails: async () => ({ snapshot: { bid: 100, offer: 100.05 } }),
        placeOrder: async (order) => { payload = order; return { dealReference: "new-order" }; },
        getDealConfirmation: async () => ({ dealStatus: "ACCEPTED", dealId: "order-id" }),
    });
    service.positionSize = async (balance, entry, stop, symbol, risk) => {
        requestedRisk = risk;
        return { size: 100, availableMargin: 900, marginRequired: 200 };
    };
    const candidate = { symbol: "EURUSD", signal: "bullish", timeframe: "m30", decisionTime: Date.now(),
        candles: { m30: [{ high: 101, low: 99 }, { open: 100, high: 101, low: 99, close: 100.2, spread: 0.05 }] },
        indicators: { h1: { atr: 1, ema20: 101, ema50: 100 }, m30: { atr: 1, atrRegime: 1, efficiency6: 0.4 } } };
    assert.equal(await service.executeCandidate(candidate), true);
    assert.equal(requestedRisk, 0.0075);
    const plan = service.getOrderPlan(candidate);
    assert.equal(payload.profitLevel, plan.target);
    assert.equal(service.dynamicPlanByDeal.get("order-id").riskDistance, plan.riskDistance);
    await service.updateDynamicStopIfNeeded({ symbol: "EURUSD", dealId: "filled-position", workingOrderId: "order-id", direction: "BUY",
        entryPrice: plan.entry, stopLoss: plan.stop, takeProfit: plan.target, currentPrice: plan.entry });
    assert.equal(service.dynamicPlanByDeal.get("filled-position").riskDistance, plan.riskDistance);
    assert.equal(service.dynamicPlanByDeal.has("order-id"), false);
});

test("M30 ranking does not apply the H1-only rating threshold", async () => {
    const service = createService();
    service.syncOpenTradesFromBroker = async () => {};
    service.getAllowedCandidates = async (rows) => rows;
    service.executeCandidate = async () => true;
    const candidate = { symbol: "EURUSD", signal: "bullish", timeframe: "m30", decisionTime: 1000,
        candles: { m30: [{ high: 101, low: 99 }, { open: 100, high: 101, low: 99, close: 100, spread: 0.2 }] },
        indicators: { h1: { atr: 1, ema20: 100, ema50: 100 }, m30: { atr: 1, atrRegime: 1, efficiency6: 0 } } };
    assert.ok(service.rateCandidate(candidate) < -0.833014);
    assert.equal((await service.processCandidates([candidate], ["EURUSD"])).length, 1);
});
