import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { RISK } from "../config.js";

function createMonitor(overrides = {}) {
    const source = fs.readFileSync(new URL("../monitors.js", import.meta.url), "utf8")
        .replace(/^import .*;\n/gm, "")
        .replace("export default new TradeMonitor();", "new TradeMonitor();");
    return vm.runInNewContext(source, {
        RISK, Date, Promise,
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        ...overrides,
    });
}

test("monitor normalizes timestamps without changing their meaning", () => {
    const monitor = createMonitor();
    const timestamp = Date.parse("2026-11-04T05:00:00Z");
    for (const value of [timestamp, timestamp / 1000, "2026-11-04T05:00:00", "2026/11/04 05:00:00", "2026-11-04T06:00:00+01:00"])
        assert.equal(monitor.parseOpenTimeMs(value), timestamp);
    assert.ok(Number.isNaN(monitor.parseOpenTimeMs("invalid")));
});

test("monitor forwards broker position and liquidation price to trading", async () => {
    const calls = [];
    const monitor = createMonitor({
        getOpenPositions: async () => ({ positions: [{
            market: { epic: "EURUSD", bid: 1.11, offer: 1.12 },
            position: { dealId: "deal", direction: "SELL", level: 1.1, stopLevel: 1.13, profitLevel: 1.025, createdDateUTC: "2026-11-04T05:00:00", trailingStop: false },
        }] }),
        tradingService: {
            resolveMarketPrice: (direction, bid, ask) => direction === "BUY" ? bid : ask,
            updateDynamicStopIfNeeded: async (position) => calls.push(position),
        },
    });
    await monitor.dynamicStopCheck();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].symbol, "EURUSD");
    assert.equal(calls[0].currentPrice, 1.12);
    assert.equal(calls[0].openedAt, Date.parse("2026-11-04T05:00:00Z"));
});

test("monitor serializes its cycle and keeps the protection-check order", async () => {
    const callbacks = [];
    const monitor = createMonitor({ setInterval: (callback) => { callbacks.push(callback); return callbacks.length; }, clearInterval() {} });
    const calls = [];
    for (const name of ["dynamicStopCheck", "weekendFlatCheck", "dailyFlatCheck", "maxHoldCheck"])
        monitor[name] = async () => calls.push(name);
    await monitor.startMonitorOpenTrades({});
    assert.equal(callbacks.length, 1, "startup schedules only the trade-protection monitor");
    await callbacks[0]();
    assert.deepEqual(calls, ["dynamicStopCheck", "weekendFlatCheck", "dailyFlatCheck", "maxHoldCheck"]);
    monitor.monitorInProgress = true;
    await callbacks[0]();
    assert.equal(calls.length, 4);
});

test("timeout closes only positions beyond the configured holding limit", async () => {
    const calls = [];
    const monitor = createMonitor({
        getOpenPositions: async () => ({ positions: [
            { position: { dealId: "old", openTime: Date.now() - (RISK.MAX_HOLD_TIME + 1) * 60_000 } },
            { position: { dealId: "new", openTime: Date.now() } },
            { position: { dealId: "invalid", openTime: "invalid" } },
        ] }),
        tradingService: { closePosition: async (...args) => calls.push(args) },
    });
    await monitor.maxHoldCheck({});
    assert.deepEqual(calls, [["old", "timeout"]]);
});

test("daily and weekend boundaries cancel orders before closing positions", async () => {
    for (const [method, timestamp, enabled] of [
        ["dailyFlatCheck", "2026-11-04T20:59:00Z", false],
        ["dailyFlatCheck", "2026-11-04T21:00:00Z", true],
        ["weekendFlatCheck", "2026-11-06T19:59:00Z", false],
        ["weekendFlatCheck", "2026-11-06T20:00:00Z", true],
    ]) {
        class Clock extends Date { constructor() { super(timestamp); } }
        const actions = [];
        const monitor = createMonitor({
            Date: Clock,
            RISK: { ...RISK, DAILY_FORCED_CLOSE_UTC: true },
            getWorkingOrders: async () => ({ workingOrders: [{ workingOrderData: { dealId: "pending", epic: "EURUSD" } }] }),
            cancelWorkingOrder: async (id) => actions.push(`cancel:${id}`),
            getOpenPositions: async () => ({ positions: [{ position: { dealId: "position" }, market: { epic: "EURUSD" } }] }),
            tradingService: { dailyCloseMinute: 21 * 60, closePosition: async (id) => actions.push(`close:${id}`) },
        });
        await monitor[method]({ delay: async () => {} });
        assert.deepEqual(actions, enabled ? ["cancel:pending", "close:position"] : []);
    }
});
