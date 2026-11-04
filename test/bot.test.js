import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { DEV, SESSIONS, TIMEFRAMES } from "../config.js";
import { aggregateM30 } from "../indicators/indicators.js";

// Load the bot class without running the production entry point or accessing the broker.
function createBot({ strategy, tradingService, calcIndicators, clock = Date } = {}) {
    const source = fs.readFileSync(new URL("../bot.js", import.meta.url), "utf8")
        .replace(/^import .*;\n/gm, "")
        .replace(/\nconst bot = new TradingBot\(\);[\s\S]*$/, "\nnew TradingBot();");
    const logger = { info() {}, warn() {}, error() {}, debug() {} };

    return vm.runInNewContext(source, {
        DEV, SESSIONS, TIMEFRAMES, logger,
        Strategy: { getTimeframe: () => "h1", ...strategy },
        tradingService,
        calcIndicators,
        aggregateM30,
        Date: clock, Promise, setTimeout, setInterval,
    });
}

test("bot selects configured sessions and removes overlap duplicates", () => {
    const bot = createBot();
    assert.deepEqual(Array.from(bot.getActiveSymbols("2026-11-02T23:00:00Z")),
        ["USDJPY", "GBPUSD", "AUDJPY", "EURUSD", "USDCHF"]);
    assert.deepEqual(Array.from(bot.getActiveSymbols("2026-11-03T01:00:00Z")),
        ["USDJPY", "GBPUSD", "AUDJPY", "EURUSD", "USDCHF", "AUDUSD", "EURJPY"]);
    assert.equal(bot.getActiveSymbols("invalid").length, 0);
});

test("bot keeps the M15 schedule and two-second candle-close delay", () => {
    const start = Date.parse("2026-11-04T01:00:00Z");
    for (const [offset, expected] of [[0, 2000], [1999, 1], [2000, 900000], [3000, 899000], [899999, 2001]]) {
        class Clock extends Date { static now() { return start + offset; } }
        const bot = createBot({ clock: Clock });
        assert.equal(bot.getInitialIntervalMs(), expected);
        assert.equal(bot.getRepeatIntervalMs(), 900000);
    }
});

test("bot sends only closed candles to the strategy and analyzes each H1 candle once", async () => {
    const now = Date.now();
    const makeCandles = (interval) => [
        { timestamp: new Date(now - 3 * interval).toISOString(), close: 1 },
        { timestamp: new Date(now - 2 * interval).toISOString(), close: 2 },
        { timestamp: new Date(now - interval / 2).toISOString(), close: 3 },
    ];
    const candles = { h1: makeCandles(3_600_000), m15: makeCandles(900_000), m5: makeCandles(300_000) };
    let calls = 0;
    const bot = createBot({
        strategy: { getSignal(context) {
            calls++;
            for (const rows of Object.values(context.candles)) assert.equal(rows.length, 2);
            return { symbol: context.symbol, signal: "bullish" };
        } },
        calcIndicators: async (rows) => ({ count: rows.length }),
    });

    const candidate = await bot.analyzeSymbol("EURUSD", candles);
    assert.equal(candidate.symbol, "EURUSD");
    assert.equal(candidate.signal, "bullish");
    assert.equal(candidate.indicators.h1.count, 2);
    assert.equal(await bot.analyzeSymbol("EURUSD", candles), null);
    assert.equal(calls, 1);
});

test("bot passes valid candidates to trading after account refresh", async () => {
    let refreshed = false;
    let submitted;
    const bot = createBot({ tradingService: { async updateAccountInfo() { refreshed = true; }, processCandidates(candidates) {
        assert.equal(refreshed, true);
        submitted = candidates;
        return "processed";
    } } });
    bot.getActiveSymbols = () => ["EURUSD", "GBPUSD"];
    bot.fetchAllCandles = async (symbol) => symbol;
    bot.analyzeSymbol = async (symbol) => symbol === "EURUSD" ? { symbol, signal: "bullish" } : null;

    assert.equal(await bot.analyzeAllSymbols(), "processed");
    assert.deepEqual(JSON.parse(JSON.stringify(submitted)), [{ symbol: "EURUSD", signal: "bullish" }]);
});

test("M30 processing retains no-signal market context and uses a half-hour deduplication key", async () => {
    const candle = (time) => ({ timestamp: `2026-11-04T${time}:00Z`, open: 100, high: 101, low: 99, close: 100.2, spread: 0.01, volume: 10 });
    let now = Date.parse("2026-11-04T12:00:02Z");
    class Clock extends Date { static now() { return now; } }
    const bot = createBot({ clock: Clock, strategy: {
        getTimeframe: () => "m30",
        getSignal: ({ symbol }) => ({ symbol, signal: null }),
    }, calcIndicators: async () => ({ atr: 1 }) });
    const candles = { h1: [candle("10:00"), candle("11:00")], m5: [candle("11:50"), candle("11:55")],
        m15: [candle("11:30"), candle("11:45"), candle("12:00"), candle("12:15")] };
    const first = await bot.analyzeSymbol("EURUSD", candles);
    assert.equal(first.timeframe, "m30");
    assert.equal(first.signal, null);
    assert.equal(first.decisionTime, Date.parse("2026-11-04T12:00:00Z"));
    assert.equal(first.candles.m30.length, 1);
    now = Date.parse("2026-11-04T12:15:02Z");
    assert.equal(await bot.analyzeSymbol("EURUSD", candles), null);
    now = Date.parse("2026-11-04T12:30:02Z");
    const next = await bot.analyzeSymbol("EURUSD", candles);
    assert.equal(next.decisionTime, Date.parse("2026-11-04T12:30:00Z"));
});
