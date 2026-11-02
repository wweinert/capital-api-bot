import assert from "node:assert/strict";
import test from "node:test";

import { PORTFOLIO, RISK, SESSIONS } from "../config.js";
import { calcIndicators } from "../indicators/indicators.js";
import tradingService from "../services/trading.js";
import Strategy from "../strategies/strategies.js";

function lowerTimeframeRows(count, direction) {
    const rows = Array.from({ length: count }, (_, index) => ({
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString(),
        open: 100,
        high: 100.2,
        low: 99.9,
        close: 100.05,
    }));
    const pivot = count - 2;

    if (direction === "BUY") {
        rows[pivot] = { ...rows[pivot], open: 99.5, high: 100, low: 98, close: 99.8 };
        rows[count - 1] = { ...rows[count - 1], open: 100, high: 101.2, low: 99.8, close: 101 };
    } else {
        rows[pivot] = { ...rows[pivot], open: 100.5, high: 102, low: 100, close: 100.2 };
        rows[count - 1] = { ...rows[count - 1], open: 100, high: 100.2, low: 98.8, close: 99 };
    }

    return rows;
}

function strategyContext(direction, hour = 6, body = 0.5) {
    const previous = direction === "BUY" ? { open: 101, close: 100.8 } : { open: 99, close: 99.2 };
    const current = direction === "BUY" ? { open: 100, close: 100 + body } : { open: 100, close: 100 - body };

    return {
        symbol: "TEST",
        indicators: {
            h1: { atr: 1, ema20: direction === "BUY" ? 101 : 99, ema50: 100 },
            m5: { atr: 1 },
            m15: { atr: 1 },
        },
        candles: {
            h1: [
                { timestamp: new Date(Date.UTC(2026, 0, 1, hour - 1)).toISOString(), high: 101.2, low: 98.8, ...previous },
                { timestamp: new Date(Date.UTC(2026, 0, 1, hour)).toISOString(), high: 101.2, low: 98.8, ...current },
            ],
            m5: lowerTimeframeRows(50, direction),
            m15: lowerTimeframeRows(20, direction),
        },
    };
}

function activeSymbols(time) {
    const date = new Date(`2026-11-02T${time}:00Z`);
    const current = date.getUTCHours() * 60 + date.getUTCMinutes();
    const symbols = [];

    for (const session of Object.values(SESSIONS)) {
        const toMinutes = (value) => {
            const [hours, minutes] = value.split(":").map(Number);
            return hours * 60 + minutes;
        };
        const start = toMinutes(session.START);
        const end = toMinutes(session.END);
        const active = start < end ? current >= start && current < end : current >= start || current < end;
        if (active) for (const symbol of session.SYMBOLS) if (!symbols.includes(symbol)) symbols.push(symbol);
    }

    return symbols;
}

test("strategy requires matching M5/M15 wave, H1 reversal and trend", () => {
    assert.deepEqual(Strategy.getSignal(strategyContext("BUY")), { symbol: "TEST", signal: "bullish" });
    assert.deepEqual(Strategy.getSignal(strategyContext("SELL")), { symbol: "TEST", signal: "bearish" });

    const disagreement = strategyContext("BUY");
    disagreement.candles.m15 = lowerTimeframeRows(20, "SELL");
    assert.equal(Strategy.getSignal(disagreement).signal, null);
});

test("strategy rejects late and oversized H1 signals", () => {
    assert.equal(Strategy.getSignal(strategyContext("BUY", 8)).signal, null);
    assert.equal(Strategy.getSignal(strategyContext("BUY", 6, 0.8)).signal, null);
});

test("session overlap preserves configured symbol priority without duplicates", () => {
    assert.deepEqual(activeSymbols("23:00"), ["USDJPY", "GBPUSD", "AUDJPY", "EURUSD", "USDCHF"]);
    assert.deepEqual(activeSymbols("01:00"), ["USDJPY", "GBPUSD", "AUDJPY", "EURUSD", "USDCHF", "AUDUSD", "EURJPY"]);
    assert.equal(activeSymbols("14:00").length, 8);
    assert.deepEqual(activeSymbols("21:30"), []);
});

test("indicators return finite ATR and EMA values", async () => {
    const bars = Array.from({ length: 60 }, (_, index) => ({
        close: 1 + index * 0.001,
        high: 1.002 + index * 0.001,
        low: 0.998 + index * 0.001,
    }));
    const indicators = await calcIndicators(bars);

    assert.ok(indicators.atr > 0);
    assert.ok(Number.isFinite(indicators.ema20));
    assert.ok(Number.isFinite(indicators.ema50));
});

test("position sizing respects risk and margin caps", async (context) => {
    const originalQuotePerEur = tradingService.getQuotePerEur;
    const originalLeverage = tradingService.leverageForSymbol;
    context.after(() => {
        tradingService.getQuotePerEur = originalQuotePerEur;
        tradingService.leverageForSymbol = originalLeverage;
    });

    tradingService.getQuotePerEur = async () => 1.1;
    tradingService.leverageForSymbol = async () => 30;
    tradingService.setAvailableMargin(1000);

    const sizing = await tradingService.positionSize(1000, 1.1, 1.09, "EURUSD", RISK.PER_TRADE);

    assert.ok(sizing.size >= 100);
    assert.ok(sizing.effectiveRiskPct <= RISK.PER_TRADE);
    assert.ok(sizing.marginRequired <= 1000 * PORTFOLIO.MARGIN_USAGE);
});
