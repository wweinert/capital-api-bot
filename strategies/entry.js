import { PROFILES } from "../config.js";

// Все HLLH-профили сейчас используют одну стратегию. Позже TradingService
// передаст сюда профиль конкретной пары, но безопасный baseline уже доступен.
export const ENTRY_RESEARCH_PROFILE = Object.values(PROFILES)[0];

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function candle(bar) {
    return {
        timestamp: bar?.timestamp ?? bar?.t ?? null,
        open: number(bar?.open ?? bar?.o),
        high: number(bar?.high ?? bar?.h),
        low: number(bar?.low ?? bar?.l),
        close: number(bar?.close ?? bar?.c),
    };
}

function isPivotLow(bars, index, window) {
    const low = bars[index]?.low;
    if (!Number.isFinite(low)) return false;

    for (let offset = 1; offset <= window; offset += 1) {
        if (!(low < bars[index - offset]?.low && low < bars[index + offset]?.low)) {
            return false;
        }
    }

    return true;
}

function isPivotHigh(bars, index, window) {
    const high = bars[index]?.high;
    if (!Number.isFinite(high)) return false;

    for (let offset = 1; offset <= window; offset += 1) {
        if (!(high > bars[index - offset]?.high && high > bars[index + offset]?.high)) {
            return false;
        }
    }

    return true;
}

function pipSize(symbol) {
    return String(symbol || "")
        .toUpperCase()
        .endsWith("JPY")
        ? 0.01
        : 0.0001;
}

function signalFromCandle(side, signalCandle, symbol, profile, pivot) {
    const entry = signalCandle.close;
    const pip = pipSize(symbol);
    const buffer = profile.stopVariant === "signal_candle_extreme_with_buffer_2pip" ? pip * 2 : pip;
    const stopLoss = side === "BUY" ? signalCandle.low - buffer : signalCandle.high + buffer;
    const riskDistance = Math.abs(entry - stopLoss);
    const stopPips = riskDistance / pip;
    const minimumStopPips = Number(profile.minStopDistancePips ?? 2);
    const maximumStopPips = Number(profile.maxStopPips ?? 12);

    if (stopPips < minimumStopPips) return { signal: null, reason: "stop_too_tight" };
    if (stopPips > maximumStopPips) return { signal: null, reason: "stop_too_wide" };

    const safetyR = Number(profile.safetyTakeProfitR ?? profile.takeProfitR ?? 20);
    const takeProfit = side === "BUY" ? entry + riskDistance * safetyR : entry - riskDistance * safetyR;

    return {
        signal: side,
        reason: "hllh_signal",
        entry,
        sl: stopLoss,
        tp: takeProfit,
        stopPips,
        signalTimestamp: signalCandle.timestamp,
        strategyContext: {
            strategy: "HLLH",
            timeframe: profile.timeframe,
            setupMode: profile.setupMode,
            pivotWindow: profile.pivotWindow,
            signalMode: profile.signalMode,
            entryMode: profile.entryMode,
            stopVariant: profile.stopVariant,
            exitVariant: profile.exitVariant,
            expectedStopPrice: stopLoss,
            signalTimestamp: signalCandle.timestamp,
            pivotTimestamp: pivot.timestamp,
            managementProfile: profile.managementProfile,
        },
    };
}

// `bars` must contain closed M15 candles only, oldest to newest.
export function shouldEnter({ bars, symbol, profile = ENTRY_RESEARCH_PROFILE }) {
    const candles = Array.isArray(bars) ? bars.map(candle) : [];
    const window = Number(profile?.pivotWindow ?? 2);
    const waitBars = Number(profile?.maxSignalWaitBars ?? 8);
    const requiredSequence = profile?.setupMode === "confirmed" ? 2 : 1;

    if (candles.length < window * 2 + 1) {
        return { signal: null, reason: "not_enough_bars" };
    }

    let previousLow = null;
    let previousHigh = null;
    let longArm = null;
    let shortArm = null;
    const lastIndex = candles.length - 1;

    for (let index = 0; index <= lastIndex; index += 1) {
        if (longArm && index > longArm.expiresAt) longArm = null;
        if (shortArm && index > shortArm.expiresAt) shortArm = null;

        const pivotIndex = index - window;
        if (pivotIndex >= window) {
            const pivotCandle = candles[pivotIndex];

            if (isPivotLow(candles, pivotIndex, window)) {
                const sequence = previousLow && pivotCandle.low > previousLow.price ? previousLow.sequence + 1 : 0;
                if (sequence >= requiredSequence) {
                    longArm = {
                        pivot: { price: pivotCandle.low, timestamp: pivotCandle.timestamp },
                        expiresAt: index + waitBars,
                    };
                }
                previousLow = { price: pivotCandle.low, sequence };
            }

            if (isPivotHigh(candles, pivotIndex, window)) {
                const sequence = previousHigh && pivotCandle.high < previousHigh.price ? previousHigh.sequence + 1 : 0;
                if (sequence >= requiredSequence) {
                    shortArm = {
                        pivot: { price: pivotCandle.high, timestamp: pivotCandle.timestamp },
                        expiresAt: index + waitBars,
                    };
                }
                previousHigh = { price: pivotCandle.high, sequence };
            }
        }

        const current = candles[index];
        const isBullish = current.close > current.open;
        const isBearish = current.close < current.open;

        if (longArm && isBullish) {
            if (index === lastIndex) return signalFromCandle("BUY", current, symbol, profile, longArm.pivot);
            longArm = null;
        }

        if (shortArm && isBearish) {
            if (index === lastIndex) return signalFromCandle("SELL", current, symbol, profile, shortArm.pivot);
            shortArm = null;
        }
    }

    return { signal: null, reason: "no_hllh_signal" };
}

export default shouldEnter;
