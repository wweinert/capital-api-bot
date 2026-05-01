import { ATR, BollingerBands, RSI } from "technicalindicators";
import { normalizeRows, pipSizeForSymbol } from "../backtest/lib/strategies/higherLowLowerHigh.js";

export const BB_MEAN_REVERSION_STRATEGY_ID = "BB_MEAN_REVERSION";

export const BB_MEAN_REVERSION_CONFIG = {
    timeframe: "H1",
    rsiExtreme: 36,
    takeProfitR: 1.25,
    stopAtrMultiplier: 0.15,
    minStopBufferPips: 2,
    managementProfile: {
        mode: "none",
    },
};

function stableH1Rows(candles = {}) {
    const rows = normalizeRows(candles?.h1Candles);
    return rows.length > 1 ? rows.slice(0, -1) : rows;
}

function last(series) {
    return Array.isArray(series) && series.length ? series[series.length - 1] : null;
}

function indicatorSnapshot(rows) {
    const closes = rows.map((row) => row.close);
    const highs = rows.map((row) => row.high);
    const lows = rows.map((row) => row.low);

    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
    const rsi = RSI.calculate({ period: 14, values: closes });
    const atr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

    return {
        currentBb: last(bb),
        previousBb: bb.length > 1 ? bb[bb.length - 2] : null,
        currentRsi: last(rsi),
        currentAtr: last(atr),
    };
}

function buildSignalContext({ symbol, side, rows, config }) {
    const current = rows[rows.length - 1];
    const previous = rows[rows.length - 2];
    const pipSize = pipSizeForSymbol(symbol);
    const { currentAtr } = indicatorSnapshot(rows);
    const stopBuffer = Math.max(pipSize * config.minStopBufferPips, Number(currentAtr || 0) * config.stopAtrMultiplier);
    const expectedStopPrice = side === "LONG" ? Math.min(previous.low, current.low) - stopBuffer : Math.max(previous.high, current.high) + stopBuffer;
    const normalizedCandidateId = [
        BB_MEAN_REVERSION_STRATEGY_ID,
        symbol,
        side,
        current.timestamp,
        `rsi${config.rsiExtreme}`,
        `r${config.takeProfitR}`,
    ].join("|");

    return {
        strategyType: BB_MEAN_REVERSION_STRATEGY_ID,
        symbol,
        side,
        direction: side === "LONG" ? "BUY" : "SELL",
        timeframe: config.timeframe,
        signalTimestamp: current.timestamp,
        normalizedCandidateId,
        expectedStopPrice,
        takeProfitR: config.takeProfitR,
        managementProfile: { ...config.managementProfile },
        signalCandle: {
            timestamp: current.timestamp,
            open: current.open,
            high: current.high,
            low: current.low,
            close: current.close,
        },
    };
}

export function createBollingerMeanReversionStrategy(overrides = {}) {
    const config = { ...BB_MEAN_REVERSION_CONFIG, ...overrides };

    return {
        id: BB_MEAN_REVERSION_STRATEGY_ID,
        name: "bollingerMeanReversion",
        config,

        evaluate({ symbol, candles } = {}) {
            const rows = stableH1Rows(candles);
            if (rows.length < 25) {
                return {
                    signal: null,
                    reason: "bbmr_insufficient_h1_history",
                    context: { strategyType: BB_MEAN_REVERSION_STRATEGY_ID },
                };
            }

            const current = rows[rows.length - 1];
            const previous = rows[rows.length - 2];
            const { currentBb, previousBb, currentRsi, currentAtr } = indicatorSnapshot(rows);
            if (!currentBb || !previousBb || !Number.isFinite(currentRsi) || !Number.isFinite(currentAtr)) {
                return {
                    signal: null,
                    reason: "bbmr_missing_indicators",
                    context: { strategyType: BB_MEAN_REVERSION_STRATEGY_ID },
                };
            }

            const longSignal =
                previous.close < previousBb.lower &&
                current.close > currentBb.lower &&
                current.close > current.open &&
                currentRsi <= config.rsiExtreme;

            if (longSignal) {
                return {
                    signal: "BUY",
                    reason: "bb_mean_reversion_long",
                    context: buildSignalContext({ symbol, side: "LONG", rows, config }),
                };
            }

            const shortSignal =
                previous.close > previousBb.upper &&
                current.close < currentBb.upper &&
                current.close < current.open &&
                currentRsi >= 100 - config.rsiExtreme;

            if (shortSignal) {
                return {
                    signal: "SELL",
                    reason: "bb_mean_reversion_short",
                    context: buildSignalContext({ symbol, side: "SHORT", rows, config }),
                };
            }

            return {
                signal: null,
                reason: "bbmr_no_reversion_signal",
                context: { strategyType: BB_MEAN_REVERSION_STRATEGY_ID },
            };
        },
    };
}
