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

test("daily limits keep the four-session strategy continuous", () => {
    assert.equal(RISK.DAILY_FORCED_CLOSE_UTC, false);
    assert.equal(RISK.DAILY_LAST_ENTRY_MINUTE_UTC, 24 * 60);
    assert.equal(RISK.WEEKEND_FLAT, true);
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
    assert.ok(Number.isFinite(indicators.ema20Previous3));
    assert.ok(Number.isFinite(indicators.ema50));
});

test("signal rating rejects incomplete data and prefers the stronger candidate", () => {
    const candidate = (symbol, close, spread, overrides = {}, indicatorOverrides = {}) => {
        const rows = Array.from({ length: 60 }, (_, index) => ({
            open: 1.1 + index * 0.0001,
            high: 1.101 + index * 0.0001,
            low: 1.099 + index * 0.0001,
            close: 1.1005 + index * 0.0001,
            spread,
        }));
        Object.assign(rows.at(-1), { open: 1.105, high: 1.106, low: 1.1045, close, ...overrides });
        return {
            symbol,
            signal: "bullish",
            candles: { h1: rows },
            indicators: { h1: {
                atr: 0.002,
                ema20: 1.1048,
                ema50: 1.104,
                ema20Previous3: 1.1045,
                ...indicatorOverrides,
            } },
        };
    };

    const stronger = tradingService.rateCandidate(candidate(
        "EURUSD",
        1.1053,
        0.00005,
        { low: 1.104 },
        { ema20: 1.105, ema50: 1.1035, ema20Previous3: 1.104 },
    ));
    const weaker = tradingService.rateCandidate(candidate("EURUSD", 1.1057, 0.0003));

    assert.ok(Number.isFinite(stronger));
    assert.ok(stronger > weaker);
    assert.equal(tradingService.rateCandidate({ symbol: "EURUSD", signal: "bullish" }), null);
});

test("dynamic stop moves to break-even and follows only closed-candle extremes", () => {
    const buyStop = tradingService.calculateDynamicStop({
        direction: "BUY",
        entryPrice: 1.1,
        currentStop: 1.09,
        currentPrice: 1.111,
        riskDistance: 0.01,
        candle: { low: 1.108 },
        atr: 0.004,
    });
    const sellStop = tradingService.calculateDynamicStop({
        direction: "SELL",
        entryPrice: 1.1,
        currentStop: 1.11,
        currentPrice: 1.089,
        riskDistance: 0.01,
        candle: { high: 1.092 },
        atr: 0.004,
    });

    assert.ok(Math.abs(buyStop - 1.1074) < 1e-10);
    assert.ok(Math.abs(sellStop - 1.0926) < 1e-10);
    assert.equal(tradingService.calculateDynamicStop({
        direction: "BUY",
        entryPrice: 1.1,
        currentStop: 1.108,
        currentPrice: 1.111,
        riskDistance: 0.01,
        candle: { low: 1.108 },
        atr: 0.004,
    }), null);
    assert.equal(tradingService.calculateDynamicStop({
        direction: "BUY",
        entryPrice: 1.1,
        currentStop: 1.09,
        currentPrice: 1.109,
        riskDistance: 0.01,
    }), null);
});

test("dynamic manager ignores positions created with the previous 1.5R target", async () => {
    const dealId = "legacy-position";

    await tradingService.updateDynamicStopIfNeeded({
        symbol: "EURUSD",
        dealId,
        direction: "BUY",
        entryPrice: 1.1,
        stopLoss: 1.09,
        takeProfit: 1.115,
        currentPrice: 1.112,
        trailingStop: false,
    });

    assert.equal(tradingService.dynamicPlanByDeal.has(dealId), false);
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
