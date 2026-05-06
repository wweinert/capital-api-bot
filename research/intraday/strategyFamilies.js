import {
    createHigherLowLowerHighConfig,
    createHigherLowLowerHighState,
    pipSizeForSymbol,
    prepareHigherLowLowerHighContext,
    advanceHigherLowLowerHighDetector,
} from "../../backtest/lib/strategies/higherLowLowerHigh.js";
import { buildStopPrice } from "../../backtest/lib/simulators/priceActionTradeCore.js";

export const STRATEGY_FAMILIES = {
    hllh_continuation: "HLLH / price-action continuation",
    opening_range_breakout: "Opening Range Breakout",
    donchian_breakout: "Donchian / channel breakout",
    ema_trend_pullback: "EMA trend pullback",
    momentum_continuation: "Momentum continuation",
    mean_reversion_intraday: "Mean reversion intraday",
    liquidity_sweep_reversal: "Liquidity sweep / previous high-low reversal",
    volatility_squeeze_breakout: "Volatility squeeze breakout",
    session_momentum: "Session momentum strategy",
    simple_baseline: "Simple baseline controls",
};

function minuteUTC(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function inWindow(row, startMinute, endMinute) {
    const minute = minuteUTC(row.timestamp);
    return startMinute <= endMinute ? minute >= startMinute && minute <= endMinute : minute >= startMinute || minute <= endMinute;
}

function dayKey(row) {
    return String(row?.timestamp || "").slice(0, 10);
}

function signal({ symbol, side, row, index, family, profile, reason, suggestedStopPrice = null, entryTriggerPrice = null, session = null }) {
    return {
        symbol,
        side,
        signalTimestamp: row.timestamp,
        signalIndex: index,
        signalRow: row,
        family,
        profile,
        reason,
        suggestedStopPrice,
        entryTriggerPrice,
        session,
        key: `${family}|${symbol}|${side}|${row.timestamp}|${reason}`,
    };
}

function previousHigh(rows, index, lookback) {
    let value = -Infinity;
    for (let i = Math.max(0, index - lookback); i < index; i += 1) value = Math.max(value, rows[i].high);
    return value;
}

function previousLow(rows, index, lookback) {
    let value = Infinity;
    for (let i = Math.max(0, index - lookback); i < index; i += 1) value = Math.min(value, rows[i].low);
    return value;
}

function sessionWindow(session) {
    if (session === "asian") return { start: 0, rangeStart: 0, rangeEnd: 60, tradeStart: 60, end: 7 * 60 };
    if (session === "ny") return { start: 13 * 60, rangeStart: 13 * 60, rangeEnd: 14 * 60, tradeStart: 14 * 60, end: 20 * 60 };
    return { start: 7 * 60, rangeStart: 7 * 60, rangeEnd: 8 * 60, tradeStart: 8 * 60, end: 12 * 60 };
}

export function buildSignals({ symbol, rows, familyConfig }) {
    const family = familyConfig.family;
    if (family === "hllh_continuation") return hllhSignals({ symbol, rows, familyConfig });
    if (family === "opening_range_breakout") return openingRangeBreakoutSignals({ symbol, rows, familyConfig });
    if (family === "donchian_breakout") return donchianSignals({ symbol, rows, familyConfig });
    if (family === "ema_trend_pullback") return emaPullbackSignals({ symbol, rows, familyConfig });
    if (family === "momentum_continuation") return momentumSignals({ symbol, rows, familyConfig });
    if (family === "mean_reversion_intraday") return meanReversionSignals({ symbol, rows, familyConfig });
    if (family === "liquidity_sweep_reversal") return liquiditySweepSignals({ symbol, rows, familyConfig });
    if (family === "volatility_squeeze_breakout") return squeezeBreakoutSignals({ symbol, rows, familyConfig });
    if (family === "session_momentum") return sessionMomentumSignals({ symbol, rows, familyConfig });
    return simpleBaselineSignals({ symbol, rows, familyConfig });
}

function hllhSignals({ symbol, rows, familyConfig }) {
    const pipSize = pipSizeForSymbol(symbol);
    const config = createHigherLowLowerHighConfig({
        setupMode: familyConfig.setupMode || "confirmed",
        pivotWindow: familyConfig.pivotWindow || 2,
        signalMode: familyConfig.signalMode || "strict",
        entryMode: "entry_on_close",
        stopVariant: familyConfig.stopVariant || "structure_pivot_with_buffer_2pip",
        exitVariant: "fixed_r_2",
        maxSignalWaitBars: familyConfig.maxSignalWaitBars || 8,
    });
    const context = prepareHigherLowLowerHighContext(rows, config);
    const state = createHigherLowLowerHighState(config);
    const out = [];
    for (let index = 0; index < context.rows.length; index += 1) {
        const step = advanceHigherLowLowerHighDetector({ context, state, index });
        for (const event of step.events) {
            if (event.type !== "signal_candidate") continue;
            const candidate = event.candidate;
            out.push(
                signal({
                    symbol,
                    side: candidate.side,
                    row: candidate.signalRow,
                    index,
                    family: "hllh_continuation",
                    profile: familyConfig,
                    reason: "hllh_candidate",
                    suggestedStopPrice: buildStopPrice(candidate.side, candidate.signalRow, config.stopVariant, pipSize, candidate),
                }),
            );
        }
    }
    return out;
}

function openingRangeBreakoutSignals({ symbol, rows, familyConfig }) {
    const pip = pipSizeForSymbol(symbol);
    const session = familyConfig.session || "london";
    const rangeMinutes = Number(familyConfig.rangeMinutes || 30);
    const buffer = Number(familyConfig.breakoutBufferPips || 1) * pip;
    const win = sessionWindow(session);
    const rangeEnd = win.rangeStart + rangeMinutes;
    const out = [];
    const dayState = new Map();
    for (let index = 1; index < rows.length; index += 1) {
        const row = rows[index];
        const key = dayKey(row);
        if (!dayState.has(key)) dayState.set(key, { high: -Infinity, low: Infinity, traded: false });
        const state = dayState.get(key);
        const minute = minuteUTC(row.timestamp);
        if (minute >= win.rangeStart && minute < rangeEnd) {
            state.high = Math.max(state.high, row.high);
            state.low = Math.min(state.low, row.low);
            continue;
        }
        if (minute < rangeEnd || minute > win.end || !Number.isFinite(state.high) || !Number.isFinite(state.low)) continue;
        if (familyConfig.onlyTradeFirstBreakout && state.traded) continue;
        const prev = rows[index - 1];
        if (row.close > state.high + buffer && prev.close <= state.high + buffer) {
            state.traded = true;
            out.push(signal({ symbol, side: "LONG", row, index, family: "opening_range_breakout", profile: familyConfig, reason: `${session}_orb_long`, suggestedStopPrice: state.low, session }));
        } else if (row.close < state.low - buffer && prev.close >= state.low - buffer) {
            state.traded = true;
            out.push(signal({ symbol, side: "SHORT", row, index, family: "opening_range_breakout", profile: familyConfig, reason: `${session}_orb_short`, suggestedStopPrice: state.high, session }));
        }
    }
    return out;
}

function donchianSignals({ symbol, rows, familyConfig }) {
    const lookback = Number(familyConfig.lookbackBars || 20);
    const out = [];
    for (let index = lookback + 1; index < rows.length; index += 1) {
        const row = rows[index];
        if (familyConfig.atrFilter && !(row.atrPct >= familyConfig.minAtrPct)) continue;
        const high = previousHigh(rows, index, lookback);
        const low = previousLow(rows, index, lookback);
        if (row.close > high) out.push(signal({ symbol, side: "LONG", row, index, family: "donchian_breakout", profile: familyConfig, reason: `donchian_${lookback}_high`, suggestedStopPrice: low }));
        if (row.close < low) out.push(signal({ symbol, side: "SHORT", row, index, family: "donchian_breakout", profile: familyConfig, reason: `donchian_${lookback}_low`, suggestedStopPrice: high }));
    }
    return out;
}

function emaPullbackSignals({ symbol, rows, familyConfig }) {
    const out = [];
    const fastKey = `ema${familyConfig.emaFast || 8}`;
    const slowKey = `ema${familyConfig.emaSlow || 34}`;
    for (let index = 2; index < rows.length; index += 1) {
        const row = rows[index];
        const prev = rows[index - 1];
        if (!(Number.isFinite(row[fastKey]) && Number.isFinite(row[slowKey]))) continue;
        const bullishTrend = row[fastKey] > row[slowKey];
        const bearishTrend = row[fastKey] < row[slowKey];
        if (bullishTrend && prev.low <= prev[fastKey] && row.close > row.open && row.close > row[fastKey]) {
            out.push(signal({ symbol, side: "LONG", row, index, family: "ema_trend_pullback", profile: familyConfig, reason: "ema_bull_pullback", suggestedStopPrice: Math.min(prev.low, row.low) }));
        }
        if (bearishTrend && prev.high >= prev[fastKey] && row.close < row.open && row.close < row[fastKey]) {
            out.push(signal({ symbol, side: "SHORT", row, index, family: "ema_trend_pullback", profile: familyConfig, reason: "ema_bear_pullback", suggestedStopPrice: Math.max(prev.high, row.high) }));
        }
    }
    return out;
}

function momentumSignals({ symbol, rows, familyConfig }) {
    const out = [];
    const multiplier = Number(familyConfig.impulseAtrMultiplier || 1.5);
    for (let index = 20; index < rows.length; index += 1) {
        const row = rows[index];
        const body = Math.abs(row.close - row.open);
        if (!(row.atr > 0 && body >= row.atr * multiplier)) continue;
        if (familyConfig.avoidAfterTooLargeCandle && body > row.atr * 3.5) continue;
        if (row.close > row.open) out.push(signal({ symbol, side: "LONG", row, index, family: "momentum_continuation", profile: familyConfig, reason: "bull_impulse", suggestedStopPrice: row.low }));
        if (row.close < row.open) out.push(signal({ symbol, side: "SHORT", row, index, family: "momentum_continuation", profile: familyConfig, reason: "bear_impulse", suggestedStopPrice: row.high }));
    }
    return out;
}

function meanReversionSignals({ symbol, rows, familyConfig }) {
    const out = [];
    const lowRsi = Number(familyConfig.rsiLow || 25);
    const highRsi = Number(familyConfig.rsiHigh || 75);
    for (let index = 30; index < rows.length; index += 1) {
        const row = rows[index];
        if (!(Number.isFinite(row.rsi14) && Number.isFinite(row.bbUpper) && Number.isFinite(row.bbLower))) continue;
        if (Math.abs(row.ema20 - row.ema50) / row.close > Number(familyConfig.maxTrendStrength || 0.006)) continue;
        if (row.close < row.bbLower && row.rsi14 <= lowRsi) out.push(signal({ symbol, side: "LONG", row, index, family: "mean_reversion_intraday", profile: familyConfig, reason: "rsi_bb_long", suggestedStopPrice: row.low - row.atr * 0.5 }));
        if (row.close > row.bbUpper && row.rsi14 >= highRsi) out.push(signal({ symbol, side: "SHORT", row, index, family: "mean_reversion_intraday", profile: familyConfig, reason: "rsi_bb_short", suggestedStopPrice: row.high + row.atr * 0.5 }));
    }
    return out;
}

function liquiditySweepSignals({ symbol, rows, familyConfig }) {
    const out = [];
    const pip = pipSizeForSymbol(symbol);
    const buffer = Number(familyConfig.sweepBufferPips || 1) * pip;
    let prevDay = null;
    let currentDay = null;
    let dayHigh = -Infinity;
    let dayLow = Infinity;
    for (let index = 1; index < rows.length; index += 1) {
        const row = rows[index];
        const key = dayKey(row);
        if (key !== currentDay) {
            if (currentDay) prevDay = { high: dayHigh, low: dayLow };
            currentDay = key;
            dayHigh = row.high;
            dayLow = row.low;
            continue;
        }
        if (prevDay) {
            if (row.high > prevDay.high + buffer && row.close < prevDay.high) out.push(signal({ symbol, side: "SHORT", row, index, family: "liquidity_sweep_reversal", profile: familyConfig, reason: "sweep_prev_high_reject", suggestedStopPrice: row.high + buffer }));
            if (row.low < prevDay.low - buffer && row.close > prevDay.low) out.push(signal({ symbol, side: "LONG", row, index, family: "liquidity_sweep_reversal", profile: familyConfig, reason: "sweep_prev_low_reject", suggestedStopPrice: row.low - buffer }));
        }
        dayHigh = Math.max(dayHigh, row.high);
        dayLow = Math.min(dayLow, row.low);
    }
    return out;
}

function squeezeBreakoutSignals({ symbol, rows, familyConfig }) {
    const out = [];
    const lookback = Number(familyConfig.compressionLookback || 20);
    const buffer = Number(familyConfig.breakoutBufferPips || 1) * pipSizeForSymbol(symbol);
    for (let index = lookback + 1; index < rows.length; index += 1) {
        const recent = rows.slice(index - lookback, index);
        const range = Math.max(...recent.map((row) => row.high)) - Math.min(...recent.map((row) => row.low));
        const avgAtr = recent.reduce((sum, row) => sum + Number(row.atr || 0), 0) / recent.length;
        if (!(avgAtr > 0 && range < avgAtr * Number(familyConfig.maxCompressionAtr || 5))) continue;
        const row = rows[index];
        const high = Math.max(...recent.map((item) => item.high));
        const low = Math.min(...recent.map((item) => item.low));
        if (row.close > high + buffer && row.atr > avgAtr * Number(familyConfig.atrExpansion || 1.1)) out.push(signal({ symbol, side: "LONG", row, index, family: "volatility_squeeze_breakout", profile: familyConfig, reason: "squeeze_break_high", suggestedStopPrice: low }));
        if (row.close < low - buffer && row.atr > avgAtr * Number(familyConfig.atrExpansion || 1.1)) out.push(signal({ symbol, side: "SHORT", row, index, family: "volatility_squeeze_breakout", profile: familyConfig, reason: "squeeze_break_low", suggestedStopPrice: high }));
    }
    return out;
}

function sessionMomentumSignals({ symbol, rows, familyConfig }) {
    const out = [];
    const session = familyConfig.session || "london";
    const win = sessionWindow(session);
    for (let index = 20; index < rows.length; index += 1) {
        const row = rows[index];
        if (!inWindow(row, win.start, win.end)) continue;
        if (row.ema8 > row.ema20 && row.close > row.ema8 && row.close > row.open && row.atrPct >= Number(familyConfig.minAtrPct || 0)) out.push(signal({ symbol, side: "LONG", row, index, family: "session_momentum", profile: familyConfig, reason: `${session}_long_momentum`, suggestedStopPrice: row.low, session }));
        if (row.ema8 < row.ema20 && row.close < row.ema8 && row.close < row.open && row.atrPct >= Number(familyConfig.minAtrPct || 0)) out.push(signal({ symbol, side: "SHORT", row, index, family: "session_momentum", profile: familyConfig, reason: `${session}_short_momentum`, suggestedStopPrice: row.high, session }));
    }
    return out;
}

function simpleBaselineSignals({ symbol, rows, familyConfig }) {
    const out = [];
    const subtype = familyConfig.subtype || "ema_cross";
    for (let index = 35; index < rows.length; index += 1) {
        const row = rows[index];
        const prev = rows[index - 1];
        if (subtype === "ema_cross") {
            if (prev.ema8 <= prev.ema20 && row.ema8 > row.ema20) out.push(signal({ symbol, side: "LONG", row, index, family: "simple_baseline", profile: familyConfig, reason: "ema_cross_long", suggestedStopPrice: row.low - row.atr }));
            if (prev.ema8 >= prev.ema20 && row.ema8 < row.ema20) out.push(signal({ symbol, side: "SHORT", row, index, family: "simple_baseline", profile: familyConfig, reason: "ema_cross_short", suggestedStopPrice: row.high + row.atr }));
        } else if (subtype === "rsi_mean_reversion") {
            if (row.rsi14 < 25) out.push(signal({ symbol, side: "LONG", row, index, family: "simple_baseline", profile: familyConfig, reason: "rsi_baseline_long", suggestedStopPrice: row.low - row.atr }));
            if (row.rsi14 > 75) out.push(signal({ symbol, side: "SHORT", row, index, family: "simple_baseline", profile: familyConfig, reason: "rsi_baseline_short", suggestedStopPrice: row.high + row.atr }));
        } else {
            const high = previousHigh(rows, index, Number(familyConfig.lookbackBars || 12));
            const low = previousLow(rows, index, Number(familyConfig.lookbackBars || 12));
            if (row.close > high) out.push(signal({ symbol, side: "LONG", row, index, family: "simple_baseline", profile: familyConfig, reason: "breakout_baseline_long", suggestedStopPrice: low }));
            if (row.close < low) out.push(signal({ symbol, side: "SHORT", row, index, family: "simple_baseline", profile: familyConfig, reason: "breakout_baseline_short", suggestedStopPrice: high }));
        }
    }
    return out;
}
