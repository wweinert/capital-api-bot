import crypto from "crypto";
import { ACTIVE_INTRADAY_PROFILE, DEFAULT_INTRADAY_PROFILE_ID, TRADING_STRATEGY_MODE } from "../config.js";
import { pipSizeForSymbol } from "../backtest/lib/strategies/higherLowLowerHigh.js";

export const SESSION_MOMENTUM_INTRADAY_STRATEGY_ID = "SESSION_MOMENTUM_INTRADAY";

function toNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

function toTimestamp(value) {
    if (!value) return null;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeCandle(candle) {
    if (!candle) return null;
    const open = toNumber(candle.open ?? candle.openPrice?.bid ?? candle.openPrice?.ask);
    const high = toNumber(candle.high ?? candle.highPrice?.bid ?? candle.highPrice?.ask);
    const low = toNumber(candle.low ?? candle.lowPrice?.bid ?? candle.lowPrice?.ask);
    const close = toNumber(candle.close ?? candle.closePrice?.bid ?? candle.closePrice?.ask);
    const timestamp = toTimestamp(candle.timestamp ?? candle.snapshotTimeUTC ?? candle.snapshotTime);
    if (![open, high, low, close].every(Number.isFinite) || !timestamp) return null;
    return { timestamp, tsMs: Date.parse(timestamp), open, high, low, close };
}

function liveClosedRows(candles = {}, timeframe = "M15") {
    const keyByTimeframe = {
        M15: "m15Candles",
        M5: "m5Candles",
        M1: "m1Candles",
        H1: "h1Candles",
    };
    const key = keyByTimeframe[String(timeframe || "M15").toUpperCase()] || "m15Candles";
    const rows = Array.isArray(candles?.[key]) ? candles[key].map(normalizeCandle).filter(Boolean) : [];
    return rows.length > 1 ? rows.slice(0, -1) : rows;
}

function ema(prev, value, period) {
    const alpha = 2 / (period + 1);
    return prev === null ? value : value * alpha + prev * (1 - alpha);
}

function enrichRows(rows) {
    let ema8 = null;
    let ema20 = null;
    let atr = null;
    return rows.map((row, index) => {
        ema8 = ema(ema8, row.close, 8);
        ema20 = ema(ema20, row.close, 20);
        const prev = rows[index - 1] || row;
        const tr = Math.max(row.high - row.low, Math.abs(row.high - prev.close), Math.abs(row.low - prev.close));
        atr = atr === null ? tr : (atr * 13 + tr) / 14;
        return {
            ...row,
            ema8,
            ema20,
            atr,
            atrPct: row.close ? atr / row.close : 0,
        };
    });
}

function minuteUTC(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function sessionWindow(session) {
    if (session === "asian") return { start: 0, end: 7 * 60 };
    if (session === "ny") return { start: 13 * 60, end: 20 * 60 };
    return { start: 7 * 60, end: 12 * 60 };
}

function inWindow(timestamp, startMinute, endMinute) {
    const minute = minuteUTC(timestamp);
    return startMinute <= endMinute ? minute >= startMinute && minute <= endMinute : minute >= startMinute || minute <= endMinute;
}

function stopPriceFor({ side, entryPrice, symbol, exitProfile }) {
    const pip = pipSizeForSymbol(symbol);
    let riskDistance = Number(exitProfile.stopPips || 10) * pip;
    const minRisk = Number(exitProfile.minStopPips || 2) * pip;
    const maxRisk = Number(exitProfile.maxStopPips || 35) * pip;
    riskDistance = Math.min(maxRisk, Math.max(minRisk, riskDistance));
    return side === "LONG" ? entryPrice - riskDistance : entryPrice + riskDistance;
}

function stableSignalId({ symbol, side, row, profileId, reason }) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify({ profileId, family: "session_momentum", symbol, side, timestamp: row.timestamp, reason }))
        .digest("hex")
        .slice(0, 16);
}

function spreadPips(symbol, bid, ask) {
    const pip = pipSizeForSymbol(symbol);
    const spread = Math.abs(Number(ask) - Number(bid));
    return Number.isFinite(spread) && pip > 0 ? spread / pip : null;
}

function buildRuntimeManagementProfile(profile) {
    return {
        mode: "adaptive_trail_r",
        activationR: profile.exitProfile.activationR,
        trailR: profile.exitProfile.trailR,
        breakevenR: profile.exitProfile.breakevenR,
        timeframe: profile.entryProfile.timeframe,
        profileKind: profile.managementProfile.kind,
        protectProfit: {
            minProfitR: profile.managementProfile.minProfitR,
            givebackPct: profile.managementProfile.givebackPct,
        },
    };
}

export function createSessionMomentumIntradayStrategy({ profile = ACTIVE_INTRADAY_PROFILE } = {}) {
    const profileId = profile?.id || DEFAULT_INTRADAY_PROFILE_ID;
    return {
        id: SESSION_MOMENTUM_INTRADAY_STRATEGY_ID,
        name: "sessionMomentumIntraday",
        profile,

        evaluate({ symbol, candles, bid, ask } = {}) {
            if (TRADING_STRATEGY_MODE !== "intraday_lab") {
                return { signal: null, reason: "intraday_lab_mode_disabled", context: { strategyMode: TRADING_STRATEGY_MODE, profileId } };
            }
            if (profile.strategyFamily.family !== "session_momentum") {
                return { signal: null, reason: "unsupported_intraday_family", context: { strategyMode: TRADING_STRATEGY_MODE, profileId, strategyFamily: profile.strategyFamily.family } };
            }

            const timeframe = profile.entryProfile.timeframe || "M15";
            const rows = enrichRows(liveClosedRows(candles, timeframe));
            const row = rows[rows.length - 1];
            if (rows.length < 21 || !row) {
                return {
                    signal: null,
                    reason: "intraday_insufficient_timeframe_history",
                    context: { strategyMode: TRADING_STRATEGY_MODE, profileId, strategyFamily: "session_momentum", timeframe, rows: rows.length },
                };
            }

            const session = profile.strategyFamily.session || "ny";
            const win = sessionWindow(session);
            const currentSpreadPips = spreadPips(symbol, bid, ask);
            const baseContext = {
                strategyMode: TRADING_STRATEGY_MODE,
                profileId,
                strategyFamily: "session_momentum",
                timeframe,
                entryMode: profile.entryProfile.entryMode,
                exitProfile: profile.exitProfile,
                managementProfile: profile.managementProfile,
                riskProfile: profile.riskProfile,
                currentBid: Number.isFinite(Number(bid)) ? Number(bid) : null,
                currentAsk: Number.isFinite(Number(ask)) ? Number(ask) : null,
                currentSpreadPips,
                latestClosedCandle: row,
            };

            if (!inWindow(row.timestamp, win.start, win.end)) {
                return { signal: null, reason: "intraday_outside_session", context: { ...baseContext, session, sessionWindowUTC: win } };
            }
            if (row.atrPct < Number(profile.strategyFamily.minAtrPct || 0)) {
                return { signal: null, reason: "intraday_atr_filter_block", context: { ...baseContext, atrPct: row.atrPct, minAtrPct: profile.strategyFamily.minAtrPct } };
            }

            let side = null;
            let reason = null;
            if (row.ema8 > row.ema20 && row.close > row.ema8 && row.close > row.open) {
                side = "LONG";
                reason = `${session}_long_momentum`;
            } else if (row.ema8 < row.ema20 && row.close < row.ema8 && row.close < row.open) {
                side = "SHORT";
                reason = `${session}_short_momentum`;
            }
            if (!side) {
                return {
                    signal: null,
                    reason: "intraday_no_session_momentum",
                    context: { ...baseContext, session, ema8: row.ema8, ema20: row.ema20 },
                };
            }

            const direction = side === "LONG" ? "BUY" : "SELL";
            const liveEntryPrice = direction === "BUY" && Number.isFinite(Number(ask)) ? Number(ask) : direction === "SELL" && Number.isFinite(Number(bid)) ? Number(bid) : row.close;
            const expectedStopPrice = stopPriceFor({ side, entryPrice: liveEntryPrice, symbol, exitProfile: profile.exitProfile });
            const normalizedCandidateId = stableSignalId({ symbol, side, row, profileId, reason });
            return {
                signal: direction,
                reason,
                context: {
                    ...baseContext,
                    side,
                    direction,
                    session,
                    signalTimestamp: row.timestamp,
                    normalizedCandidateId,
                    expectedEntryPrice: liveEntryPrice,
                    expectedStopPrice,
                    takeProfitR: profile.exitProfile.tpR,
                    safetyTakeProfitR: profile.exitProfile.tpR,
                    runtimeEntryTiming: "next_open_live_approximation",
                    researchManagementProfile: profile.managementProfile,
                    runtimeManagementProfile: buildRuntimeManagementProfile(profile),
                    managementProfile: buildRuntimeManagementProfile(profile),
                    candidateContext: {
                        ema8: row.ema8,
                        ema20: row.ema20,
                        atr: row.atr,
                        atrPct: row.atrPct,
                        closeAboveOpen: row.close > row.open,
                        closeBelowOpen: row.close < row.open,
                    },
                },
            };
        },
    };
}
