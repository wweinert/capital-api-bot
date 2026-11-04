import assert from "node:assert/strict";
import test from "node:test";
import Strategy from "../strategies/strategies.js";
import trading from "../services/trading.js";
import { calcIndicators, aggregateM30 } from "../indicators/indicators.js";

function context(symbol = "USDJPY") {
    const m30 = Array.from({ length: 80 }, (_, index) => ({
        timestamp: new Date(Date.parse("2026-11-04T11:30:00Z") - (79 - index) * 1_800_000).toISOString(),
        open: 100, high: 100.4, low: 99.6, close: 100.2, spread: 0.05, volume: 100,
    }));
    const m15 = Array.from({ length: 20 }, (_, index) => ({
        timestamp: new Date(Date.parse("2026-11-04T11:45:00Z") - (19 - index) * 900_000).toISOString(),
        open: 100, high: 100.2, low: 99.9, close: 100.05,
    }));
    m15[18] = { ...m15[18], open: 99.5, high: 100, low: 98, close: 99.8 };
    m15[19] = { ...m15[19], open: 100, high: 101.2, low: 99.8, close: 101 };
    return { symbol, signal: "bullish", timeframe: "m30", decisionTime: Date.now(),
        candles: { m30, m15, m5: [], h1: [{ open: 100, close: 99 }, { open: 100, close: 99 }] },
        indicators: { h1: { atr: 1, ema20: 101, ema50: 100, efficiency6: 0.1 }, m15: { atr: 1 },
            m30: { atr: 1, atrRegime: 1, efficiency6: 0.4, atrLow60: 0.7, atrHigh60: 1.3, volumeRatio20: 1 } } };
}

test("decision timeframe switches at 08:00, ends at 20:00 and respects Friday/weekends", () => {
    for (const [time, expected] of [
        ["2026-11-04T07:59:00Z", "h1"], ["2026-11-04T08:00:00Z", "m30"],
        ["2026-11-04T19:59:00Z", "m30"], ["2026-11-04T20:00:00Z", null],
        ["2026-11-06T17:59:00Z", "m30"], ["2026-11-06T18:00:00Z", null],
        ["2026-11-07T06:00:00Z", null], ["2026-11-08T06:00:00Z", null],
    ]) assert.equal(Strategy.getTimeframe(Date.parse(time)), expected);
});

test("M30 uses the M15 wave without an H1 color-flip or matching M5 wave", () => {
    const candidate = context();
    assert.deepEqual(Strategy.getSignal(candidate), { symbol: "USDJPY", signal: "bullish" });
    const inverse = structuredClone(candidate);
    for (const row of inverse.candles.m15) {
        const { open, high, low, close } = row;
        Object.assign(row, { open: 200 - open, high: 200 - low, low: 200 - high, close: 200 - close });
    }
    assert.equal(Strategy.getSignal(inverse).signal, "bearish");
});

test("M30 admission rejects missing history, volume, excessive spread, body and ATR", () => {
    for (const invalidate of [
        c => { c.candles.m30 = c.candles.m30.slice(-74); },
        c => { c.indicators.m30.volumeRatio20 = null; },
        c => { c.indicators.m30.volumeRatio20 = 0.49; },
        c => { c.indicators.m30.atrLow60 = 1.01; },
        c => { c.indicators.m30.atrHigh60 = 0.99; },
        c => { c.candles.m30.at(-1).spread = 0.251; },
        c => { c.candles.m30.at(-1).spread = null; },
        c => { c.candles.m30.at(-1).close = 100.751; },
    ]) {
        const candidate = context();
        invalidate(candidate);
        assert.equal(Strategy.getSignal(candidate).signal, null);
    }
});

test("pair ranking includes active symbols that have no trade signal", () => {
    const candidates = ["A", "B", "C", "D"].map((symbol, index) => {
        const candidate = context(symbol);
        candidate.decisionTime = 1000;
        candidate.indicators.m30.efficiency6 = index * 0.2;
        candidate.signal = index === 0 ? "bullish" : null;
        return candidate;
    });
    assert.equal(trading.selectActivePairs(candidates, ["A", "B", "C", "D"]).length, 0);
    candidates[1].signal = "bullish";
    assert.deepEqual(trading.selectActivePairs(candidates, ["A", "B", "C", "D"]).map(c => c.symbol), ["B"]);
    assert.equal(trading.selectActivePairs(candidates.slice(0, 3), ["A", "B", "C", "D"]).length, 0);
});

test("M30 order geometry, adaptive risk and step mode match the frozen formulas", () => {
    const candidate = context();
    const plan = trading.getOrderPlan(candidate);
    assert.ok(Math.abs(plan.entry - 100.45) < 1e-10);
    assert.ok(Math.abs(plan.stop - 99.55) < 1e-10);
    assert.ok(Math.abs(plan.target - (100.45 + 0.9 * 1.73)) < 1e-10);
    assert.equal(plan.riskPct, 0.0075);
    assert.equal(plan.stepTimeframe, "M15");
    assert.equal(plan.expiresAt, candidate.decisionTime + 45 * 60_000);
    candidate.indicators.m30.efficiency6 = 0;
    candidate.indicators.m30.atrRegime = 2;
    candidate.candles.m30.at(-1).spread = 0.2;
    assert.equal(trading.getOrderPlan(candidate).riskPct, 0.0075 * 0.5 * 0.75 * 0.75);
    assert.equal(trading.getOrderPlan(candidate).stepTimeframe, "M5");
    candidate.decisionTime = Date.now() - 46 * 60_000;
    assert.equal(trading.getOrderPlan(candidate), null);
});

test("SELL M30 plans mirror protection and keep the target inside the 1–2R bounds", () => {
    const candidate = context();
    candidate.signal = "bearish";
    let plan = trading.getOrderPlan(candidate);
    assert.ok(Math.abs(plan.entry - 99.55) < 1e-10);
    assert.ok(Math.abs(plan.stop - 100.45) < 1e-10);
    assert.ok(Math.abs(plan.target - (99.55 - 0.9 * 1.43)) < 1e-10);
    candidate.indicators.h1.ema20 = 90;
    plan = trading.getOrderPlan(candidate);
    assert.ok(Math.abs((plan.entry - plan.target) / plan.riskDistance - 2) < 1e-10);
    candidate.indicators.h1.ema20 = 110;
    plan = trading.getOrderPlan(candidate);
    assert.ok(Math.abs((plan.entry - plan.target) / plan.riskDistance - 1) < 1e-10);
});

test("M30 aggregation rejects incomplete, misaligned and nonconsecutive halves", () => {
    const bar = (time, close, volume) => ({ timestamp: `2026-11-04T${time}:00Z`, open: 100, high: 102, low: 99, close, spread: 0.02, volume });
    const rows = [bar("10:00", 101, 10), bar("10:15", 102, 20), bar("10:45", 103, 30), bar("11:00", 104, 40)];
    const result = aggregateM30(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].timestamp, rows[0].timestamp);
    assert.equal(result[0].close, 102);
    assert.equal(result[0].volume, 30);
});

test("ATR quantiles and volume normalization exclude the current candle", async () => {
    const bars = Array.from({ length: 100 }, () => ({ close: 100, high: 101, low: 99, volume: 10 }));
    bars.at(-1).high = 200;
    bars.at(-1).volume = 20;
    const values = await calcIndicators(bars);
    assert.equal(values.atrLow60, 2);
    assert.equal(values.atrHigh60, 2);
    assert.equal(values.volumeRatio20, 2);
    assert.ok(values.atrRegime > 1);
});
