import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { DEV, SESSIONS, TIMEFRAMES } from "../config.js";

// Load the bot class without running the production entry point or accessing the broker.
function createBot({ strategy, tradingService, calcIndicators, clock = Date } = {}) {
    const source = fs.readFileSync(new URL("../bot.js", import.meta.url), "utf8")
        .replace(/^import .*;\n/gm, "")
        .replace(/\nconst bot = new TradingBot\(\);[\s\S]*$/, "\nnew TradingBot();");
    const logger = { info() {}, warn() {}, error() {}, debug() {} };

    return vm.runInNewContext(source, {
        DEV, SESSIONS, TIMEFRAMES, logger,
        Strategy: strategy,
        tradingService,
        calcIndicators,
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
