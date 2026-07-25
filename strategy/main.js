/**
 * Signal-only implementation of the max-profit research baseline.
 *
 * `indicators` must be calculated by indicators.js (or its caller) from
 * closed candles. This module never calculates indicators, places orders,
 * determines size, or manages an open position.
 */
export const STRATEGY_CONFIG = Object.freeze({
    symbols: ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD"],
    sessionUtc: [13 * 60, 17 * 60],
    minimumFrameScore: 2.9,
    weights: [0, 1, 0, 1.5, 2.5, 1.5],
    minimumAtrPct: 0.00075,
    minimumBbWidthPct: 0.0005,
    minimumEmaDistancePct: 0.0005,
});

const number = (value) => Number.isFinite(value);
const noSignal = (reason, diagnostics = {}) => ({ signal: null, reason, diagnostics });

function inTradingSession(timestamp) {
    const time = timestamp instanceof Date ? timestamp.getTime() : typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
    if (!Number.isFinite(time)) return false;
    const date = new Date(time);
    const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
    return minute >= STRATEGY_CONFIG.sessionUtc[0] && minute < STRATEGY_CONFIG.sessionUtc[1];
}

/**
 * Required shape for each M5/M15/H1 frame:
 * { close, ema9, ema21, emaFast, emaSlow, emaFastPrev3, rsi, macd }
 *
 * emaFast/emaSlow are EMA50/EMA200 from indicators.js. `emaFastPrev3` must
 * be supplied by the indicator layer from three closed bars earlier.
 */
function frameScore(frame, side) {
    if (
        !frame ||
        ![frame.close, frame.ema9, frame.ema21, frame.emaFast, frame.emaSlow, frame.emaFastPrev3, frame.rsi, frame.macd?.histogram].every(
            number,
        )
    )
        return null;
    const buy = side === "buy";
    const conditions = [
        buy ? frame.ema9 > frame.ema21 : frame.ema9 < frame.ema21,
        buy ? frame.emaFast > frame.emaSlow : frame.emaFast < frame.emaSlow,
        buy ? frame.close > frame.emaFast : frame.close < frame.emaFast,
        buy ? frame.macd.histogram > 0 : frame.macd.histogram < 0,
        buy ? frame.emaFast > frame.emaFastPrev3 : frame.emaFast < frame.emaFastPrev3,
        buy ? frame.rsi >= 45 && frame.rsi <= 70 : frame.rsi >= 30 && frame.rsi <= 55,
    ];
    return conditions.reduce((total, enabled, index) => total + (enabled ? STRATEGY_CONFIG.weights[index] : 0), 0);
}

/**
 * Required M1 trigger shape:
 * { bullCross, bearCross, bullReclaim, bearReclaim, bullBB, bearBB,
 *   bullRSI, bearRSI, bullBreakout, bearBreakout }
 *
 * These are derived by the indicator layer from closed M1 candles. Keeping
 * them outside this file prevents signal code from duplicating indicator work.
 */
function hasTrigger(m1, side) {
    const names =
        side === "buy"
            ? ["bullCross", "bullReclaim", "bullBB", "bullRSI", "bullBreakout"]
            : ["bearCross", "bearReclaim", "bearBB", "bearRSI", "bearBreakout"];
    return names.some((name) => m1?.[name] === true);
}

function passesMarketFilters(m1, m15) {
    if (!m1?.bb || ![m1.close, m15?.close, m15?.atr, m15?.emaFast, m15?.emaSlow].every(number)) return null;
    const filters = {
        atrPct: m15.atr / m15.close,
        bbWidthPct: (m1.bb.upper - m1.bb.lower) / m1.close,
        emaDistancePct: Math.abs(m15.emaFast - m15.emaSlow) / m15.close,
    };
    return {
        filters,
        passed:
            filters.atrPct >= STRATEGY_CONFIG.minimumAtrPct &&
            filters.bbWidthPct >= STRATEGY_CONFIG.minimumBbWidthPct &&
            filters.emaDistancePct >= STRATEGY_CONFIG.minimumEmaDistancePct,
    };
}

/**
 * Returns only an entry decision: `buy`, `sell`, or `null`.
 *
 * @param {{symbol: string, timestamp: string|number|Date, indicators: {
 *   m1: object, m5: object, m15: object, h1: object
 * }}} input
 */
export function generateSignal({ symbol, timestamp, indicators } = {}) {
    const normalizedSymbol = symbol?.toUpperCase();
    if (!STRATEGY_CONFIG.symbols.includes(normalizedSymbol)) return noSignal("symbol_not_enabled", { symbol });
    if (!inTradingSession(timestamp)) return noSignal("outside_overlap_session");
    if (!indicators?.m1 || !indicators?.m5 || !indicators?.m15 || !indicators?.h1) return noSignal("missing_indicator_context");

    const market = passesMarketFilters(indicators.m1, indicators.m15);
    if (!market) return noSignal("incomplete_indicator_context");
    if (!market.passed) return noSignal("market_filter_rejected", market.filters);

    const assess = (side) => {
        const scores = {
            M5: frameScore(indicators.m5, side),
            M15: frameScore(indicators.m15, side),
            H1: frameScore(indicators.h1, side),
        };
        return {
            scores,
            trigger: hasTrigger(indicators.m1, side),
            passed:
                Object.values(scores).every((score) => number(score) && score >= STRATEGY_CONFIG.minimumFrameScore) &&
                hasTrigger(indicators.m1, side),
        };
    };

    const buy = assess("buy");
    const sell = assess("sell");
    const signal = buy.passed ? "buy" : sell.passed ? "sell" : null;
    return signal
        ? { signal, reason: "strict_mtf_baseline", diagnostics: { market: market.filters, buy, sell } }
        : noSignal("score_or_trigger_rejected", { market: market.filters, buy, sell });
}

export default generateSignal;
