import fs from "fs";
import path from "path";
import { BEST_ADAPTIVE_HLLH_PROFILE, PROFILES, RISK, SESSIONS } from "../config.js";
import shouldEnter from "../strategies/entry.js";
import {
    advanceHigherLowLowerHighDetector,
    createHigherLowLowerHighConfig,
    createHigherLowLowerHighState,
    prepareHigherLowLowerHighContext,
} from "./lib/strategies/higherLowLowerHigh.js";

const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
const REPORT_DIR = path.join(process.cwd(), "backtest", "reports", "compare");
const HISTORY_MONTHS = Number(process.env.HISTORY_MONTHS || 6);
const START_CAPITAL = Number(process.env.START_CAPITAL || 500);
const START_TIMESTAMP = process.env.START_TIMESTAMP ? Date.parse(process.env.START_TIMESTAMP) : null;
const END_TIMESTAMP = process.env.END_TIMESTAMP ? Date.parse(process.env.END_TIMESTAMP) : null;
const IGNORE_PROFILE_SESSIONS = process.env.IGNORE_PROFILE_SESSIONS === "1";
const SIGNAL_ENGINE = process.env.SIGNAL_ENGINE || "live";
const EXECUTION_TIMEFRAME = process.env.EXECUTION_TIMEFRAME || "M5";
const SCORE_SELECTION = process.env.SCORE_SELECTION || "score";
const MANAGEMENT_RISK_BASIS = process.env.MANAGEMENT_RISK_BASIS || "actual";
const EXIT_MODE = process.env.EXIT_MODE || "adaptive";
const DIRECTION_MODE = process.env.DIRECTION_MODE || "both";
const REVERSE_SIGNALS = process.env.REVERSE_SIGNALS === "1";
const STOP_BUFFER_PIPS = number(process.env.STOP_BUFFER_PIPS);
const MAX_HOLD_MINUTES = number(process.env.MAX_HOLD_MINUTES) ?? RISK.MAX_HOLD_TIME;
const MIN_STOP_PIPS = number(process.env.MIN_STOP_PIPS);
const MAX_STOP_PIPS = number(process.env.MAX_STOP_PIPS);
const ACTIVATION_R = number(process.env.ACTIVATION_R);
const TRAIL_R = number(process.env.TRAIL_R);
const BREAKEVEN_R = number(process.env.BREAKEVEN_R);
const SAFETY_TAKE_PROFIT_R = number(process.env.SAFETY_TAKE_PROFIT_R);
const MIN_STOP_SPREAD_RATIO = number(process.env.MIN_STOP_SPREAD_RATIO) ?? 0;
const MAX_SPREAD_PIPS = number(process.env.MAX_SPREAD_PIPS);
const MIN_SIGNAL_SCORE = number(process.env.MIN_SIGNAL_SCORE);
const MIN_BODY_RATIO = number(process.env.MIN_BODY_RATIO);
const MIN_STRUCTURE_SEQUENCE = number(process.env.MIN_STRUCTURE_SEQUENCE);
const SAVE_REPORT = process.env.SAVE_REPORT !== "0";
const SUMMARY_ONLY = process.env.SUMMARY_ONLY === "1";
const REQUESTED_SYMBOLS = process.env.PORTFOLIO_SYMBOLS
    ? new Set(process.env.PORTFOLIO_SYMBOLS.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))
    : null;
const SESSION_PRIORITY = ["LONDON", "NY", "TOKYO", "SYDNEY"];
const M15_MS = 15 * 60 * 1000;
const M5_MS = 5 * 60 * 1000;

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function side(row, name, field) {
    return number(row?.[`${field}${name[0].toUpperCase()}${name.slice(1)}`] ?? row?.[name]?.[field] ?? row?.[field]);
}

function normalize(row) {
    const timestamp = row?.timestamp ?? row?.snapshotTimeUTC;
    return {
        timestamp,
        tsMs: Date.parse(timestamp),
        open: side(row, "bid", "open"),
        high: side(row, "bid", "high"),
        low: side(row, "bid", "low"),
        close: side(row, "bid", "close"),
        askOpen: side(row, "ask", "open"),
        askHigh: side(row, "ask", "high"),
        askLow: side(row, "ask", "low"),
        askClose: side(row, "ask", "close"),
    };
}

function load(symbol, timeframe) {
    const file = path.join(DATA_DIR, `${symbol}_${timeframe}.jsonl`);
    if (!fs.existsSync(file)) throw new Error(`Missing history: ${file}`);
    return fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => normalize(JSON.parse(line)))
        .filter((row) => Number.isFinite(row.tsMs) && [row.open, row.high, row.low, row.close, row.askOpen, row.askHigh, row.askLow, row.askClose].every(Number.isFinite))
        .sort((a, b) => a.tsMs - b.tsMs);
}

function startOfLastMonths(endMs, months) {
    const start = new Date(endMs);
    start.setUTCMonth(start.getUTCMonth() - months);
    return start.getTime();
}

function minuteOfDay(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function activeSession(timestamp) {
    const minute = minuteOfDay(timestamp);
    return SESSION_PRIORITY.find((name) => {
        const { START, END } = SESSIONS[name];
        return START < END ? minute >= START && minute < END : minute >= START || minute < END;
    });
}

function pipSize(symbol) {
    return symbol.endsWith("JPY") ? 0.01 : 0.0001;
}

function leverage(symbol) {
    return symbol.includes("USD") ? 30 : 20;
}

function quoteCurrency(symbol) {
    return symbol.slice(3, 6);
}

function priceDecimals(symbol) {
    return symbol.includes("JPY") ? 3 : 5;
}

function roundPrice(price, symbol) {
    return Number(price.toFixed(priceDecimals(symbol)));
}

function rowAtOrBefore(rows, timestamp) {
    let low = 0;
    let high = rows.length - 1;
    let found = null;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (rows[middle].tsMs <= timestamp) {
            found = rows[middle];
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return found;
}

function quotePerEur(symbol, timestamp, history) {
    const quote = quoteCurrency(symbol);
    if (quote === "EUR") return 1;
    const direct = history.get(`EUR${quote}`);
    const row = direct ? rowAtOrBefore(direct, timestamp) : null;
    if (Number.isFinite(row?.close) && row.close > 0) return row.close;

    const eurusd = rowAtOrBefore(history.get("EURUSD") || [], timestamp)?.close;
    if (quote === "CAD") {
        const usdcad = rowAtOrBefore(history.get("USDCAD") || [], timestamp)?.close;
        return Number.isFinite(eurusd) && Number.isFinite(usdcad) ? eurusd * usdcad : null;
    }
    if (quote === "NZD") {
        const nzdusd = rowAtOrBefore(history.get("NZDUSD") || [], timestamp)?.close;
        return Number.isFinite(eurusd) && Number.isFinite(nzdusd) && nzdusd > 0 ? eurusd / nzdusd : null;
    }
    return null;
}

function positionSize({ symbol, balance, entry, stop, quoteRate }) {
    const riskDistance = Math.abs(entry - stop);
    const requestedRiskEur = balance * RISK.PER_TRADE;
    const rawSize = (requestedRiskEur * quoteRate) / riskDistance;
    const marginBudget = (balance * RISK.MARGIN_RESERVE_PCT) / RISK.MAX_POSITIONS;
    const marginFor = (size) => (size * entry) / quoteRate / leverage(symbol);
    const rawMargin = marginFor(rawSize);
    const scaledSize = rawMargin > marginBudget ? rawSize * (marginBudget / rawMargin) : rawSize;
    const size = Math.floor(scaledSize / 100) * 100;
    if (size < 100) return null;

    return {
        size,
        marginCapHit: rawMargin > marginBudget,
        effectiveRiskEur: (size * riskDistance) / quoteRate,
    };
}

function scoreSignal(signal, bid, ask, symbol) {
    const spreadPips = Math.max(0, ask - bid) / pipSize(symbol);
    const spreadRatio = signal.stopPips > 0 ? spreadPips / signal.stopPips : 1;
    const bodyRatio = Number(signal.signalBodyRatio) || 0;
    const structureSequence = Number(signal.structureSequence) || 0;
    return bodyRatio * 60 + Math.min(structureSequence, 3) * 10 - Math.min(spreadRatio, 1) * 20;
}

function runtimeProfile(profile) {
    return {
        ...profile,
        minStopDistancePips: MIN_STOP_PIPS ?? profile.minStopDistancePips,
        maxStopPips: MAX_STOP_PIPS ?? profile.maxStopPips,
        safetyTakeProfitR: SAFETY_TAKE_PROFIT_R ?? profile.safetyTakeProfitR,
        managementProfile: {
            ...profile.managementProfile,
            activationR: ACTIVATION_R ?? profile.managementProfile.activationR,
            trailR: TRAIL_R ?? profile.managementProfile.trailR,
            breakevenR: BREAKEVEN_R ?? profile.managementProfile.breakevenR,
        },
    };
}

function researchSignalMap(symbol, rows, profile) {
    const config = createHigherLowLowerHighConfig(profile);
    const context = prepareHigherLowLowerHighContext(rows, config);
    const state = createHigherLowLowerHighState(config);
    const signals = new Map();
    const pip = pipSize(symbol);

    for (let index = 0; index < context.rows.length; index += 1) {
        const step = advanceHigherLowLowerHighDetector({ context, state, index });
        for (const event of step.events) {
            if (event.type !== "signal_candidate") continue;
            const candidate = event.candidate;
            const side = candidate.side === "LONG" ? "BUY" : "SELL";
            const stop = side === "BUY" ? candidate.signalRow.low - pip * 2 : candidate.signalRow.high + pip * 2;
            const stopPips = Math.abs(candidate.signalRow.close - stop) / pip;
            if (stopPips < profile.minStopDistancePips || stopPips > profile.maxStopPips) continue;
            const range = candidate.signalRow.high - candidate.signalRow.low;
            signals.set(candidate.signalTimestamp, {
                signal: side,
                sl: stop,
                stopPips,
                signalBodyRatio: range > 0 ? Math.abs(candidate.signalRow.close - candidate.signalRow.open) / range : 0,
                structureSequence: candidate.sequence,
                signalTimestamp: candidate.signalTimestamp,
            });
        }
    }

    return signals;
}

function exitPrice(position, row, reason) {
    if (reason === "daily_forced_close_utc" || reason === "weekend_flat" || reason === "max_hold_time") {
        return position.side === "BUY" ? row.open : row.askOpen;
    }
    return reason === "take_profit" ? position.target : position.stop;
}

function closePosition(position, row, reason, timestamp, history, balance) {
    const exit = exitPrice(position, row, reason);
    const quoteRate = quotePerEur(position.symbol, timestamp, history) ?? position.entryQuotePerEur;
    const pnlQuote = position.side === "BUY" ? (exit - position.entry) * position.size : (position.entry - exit) * position.size;
    const pnlEur = pnlQuote / quoteRate;
    return {
        trade: {
            ...position,
            exitTimestamp: new Date(timestamp).toISOString(),
            exit,
            exitReason: reason,
            pnlEur,
            pnlR: pnlEur / position.initialRiskEur,
            balanceAfter: balance + pnlEur,
        },
        balance: balance + pnlEur,
    };
}

function summary(trades) {
    let grossWin = 0;
    let grossLoss = 0;
    let totalPnl = 0;
    let totalR = 0;
    let wins = 0;
    let marginCapHits = 0;
    let riskPct = 0;
    let targetR = 0;
    let holdMinutes = 0;
    let peakBalance = START_CAPITAL;
    let maxDrawdownPct = 0;
    const reasons = {};
    const bySide = { BUY: { trades: 0, wins: 0, pnlEur: 0 }, SELL: { trades: 0, wins: 0, pnlEur: 0 } };

    for (const trade of trades) {
        const sideStats = bySide[trade.side];
        sideStats.trades += 1;
        sideStats.pnlEur += trade.pnlEur;
        if (trade.pnlEur > 0) sideStats.wins += 1;
        totalPnl += trade.pnlEur;
        totalR += trade.pnlR;
        riskPct += trade.initialRiskPct;
        targetR += trade.targetR;
        holdMinutes += (Date.parse(trade.exitTimestamp) - Date.parse(trade.entryTimestamp)) / 60_000;
        peakBalance = Math.max(peakBalance, trade.balanceAfter);
        maxDrawdownPct = Math.max(maxDrawdownPct, ((peakBalance - trade.balanceAfter) / peakBalance) * 100);
        reasons[trade.exitReason] = (reasons[trade.exitReason] || 0) + 1;
        if (trade.marginCapHit) marginCapHits += 1;
        if (trade.pnlEur > 0) {
            wins += 1;
            grossWin += trade.pnlEur;
        } else if (trade.pnlEur < 0) {
            grossLoss += Math.abs(trade.pnlEur);
        }
    }

    return {
        trades: trades.length,
        winRatePct: trades.length ? (wins / trades.length) * 100 : 0,
        profitFactor: grossLoss ? grossWin / grossLoss : null,
        netPnlEur: totalPnl,
        netR: totalR,
        expectancyR: trades.length ? totalR / trades.length : 0,
        avgRiskPct: trades.length ? riskPct / trades.length : 0,
        avgTargetR: trades.length ? targetR / trades.length : 0,
        avgHoldMinutes: trades.length ? holdMinutes / trades.length : 0,
        maxDrawdownPct,
        marginCapHits,
        exitReasons: reasons,
        bySide,
    };
}

const availableM15Symbols = new Set(
    fs
        .readdirSync(DATA_DIR)
        .filter((name) => name.endsWith("_M15.jsonl"))
        .map((name) => name.replace("_M15.jsonl", "")),
);
const symbols = (REQUESTED_SYMBOLS ? [...REQUESTED_SYMBOLS] : Object.keys(PROFILES)).filter(
    (symbol) => availableM15Symbols.has(symbol) && fs.existsSync(path.join(DATA_DIR, `${symbol}_${EXECUTION_TIMEFRAME}.jsonl`)),
);
const profiles = new Map(
    symbols.map((symbol) => [
        symbol,
        runtimeProfile(
            PROFILES[symbol] || {
                ...BEST_ADAPTIVE_HLLH_PROFILE,
                sessions: SESSION_PRIORITY,
            },
        ),
    ]),
);
const directConversions = symbols.map((symbol) => `EUR${quoteCurrency(symbol)}`).filter((symbol) => availableM15Symbols.has(symbol));
const conversionSymbols = [...new Set([...directConversions, "EURUSD", "USDCAD", "NZDUSD"].filter((symbol) => availableM15Symbols.has(symbol)))];
const rawM15 = new Map([...new Set([...symbols, ...conversionSymbols])].map((symbol) => [symbol, load(symbol, "M15")]));
const rawM5 = new Map(symbols.map((symbol) => [symbol, load(symbol, EXECUTION_TIMEFRAME)]));
const availableEnd = Math.min(...[...rawM15.values(), ...rawM5.values()].map((rows) => rows.at(-1)?.tsMs));
const commonEnd = Number.isFinite(END_TIMESTAMP) ? Math.min(availableEnd, END_TIMESTAMP) : availableEnd;
const startMs = Number.isFinite(START_TIMESTAMP) ? START_TIMESTAMP : startOfLastMonths(commonEnd, HISTORY_MONTHS);
const m15 = new Map([...rawM15].map(([symbol, rows]) => [symbol, rows.filter((row) => row.tsMs >= startMs - M15_MS && row.tsMs <= commonEnd)]));
const m5 = new Map([...rawM5].map(([symbol, rows]) => [symbol, rows.filter((row) => row.tsMs >= startMs && row.tsMs <= commonEnd)]));
const m15ByTimestamp = new Map(symbols.map((symbol) => [symbol, new Map(m15.get(symbol).map((row, index) => [row.tsMs, index]))]));
const m5ByTimestamp = new Map(symbols.map((symbol) => [symbol, new Map(m5.get(symbol).map((row) => [row.tsMs, row]))]));
const researchSignals =
    SIGNAL_ENGINE === "research"
        ? new Map(symbols.map((symbol) => [symbol, researchSignalMap(symbol, m15.get(symbol), profiles.get(symbol))]))
        : null;
const timestamps = [...new Set(symbols.flatMap((symbol) => m5.get(symbol).map((row) => row.tsMs)))].sort((a, b) => a - b);

let balance = START_CAPITAL;
let position = null;
const trades = [];
const signals = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
const rejected = { beforeDailyClose: 0, fridayCutoff: 0, crossedStop: 0, noConversion: 0, noSize: 0, occupied: 0 };

for (const timestamp of timestamps) {
    const date = new Date(timestamp);
    const minute = minuteOfDay(timestamp);
    const isFriday = date.getUTCDay() === 5;

    if (position) {
        const row = m5ByTimestamp.get(position.symbol).get(timestamp);
        if (row && timestamp > position.entryMs) {
            const dailyClose = RISK.DAILY_FORCED_CLOSE_UTC && minute >= RISK.DAILY_CLOSE_MINUTE_UTC;
            const weekendClose = RISK.WEEKEND_FLAT && isFriday && date.getUTCHours() >= RISK.FRIDAY_CLOSE_HOUR_UTC;
            const timedOut = timestamp - position.entryMs >= MAX_HOLD_MINUTES * 60_000;
            const stopHit = position.side === "BUY" ? row.low <= position.stop : row.askHigh >= position.stop;
            const targetHit = position.side === "BUY" ? row.high >= position.target : row.askLow <= position.target;
            let reason = null;

            if (dailyClose) reason = "daily_forced_close_utc";
            else if (weekendClose) reason = "weekend_flat";
            else if (timedOut) reason = "max_hold_time";
            else if (stopHit) reason = position.stop === position.initialStop ? "stop_loss" : "adaptive_trailing_stop";
            else if (targetHit) reason = "take_profit";

            if (reason) {
                const closed = closePosition(position, row, reason, timestamp, rawM15, balance);
                balance = closed.balance;
                trades.push(closed.trade);
                position = null;
            } else {
                if (!position.management) continue;
                const currentPrice = position.side === "BUY" ? row.close : row.askClose;
                const currentR = position.side === "BUY" ? (currentPrice - position.entry) / position.managementRiskDistance : (position.entry - currentPrice) / position.managementRiskDistance;
                const { activationR, trailR, breakevenR } = position.management;
                if (position.trailingActive) {
                    const favorablePrice = position.side === "BUY" ? row.high : row.askLow;
                    const trailing = position.side === "BUY" ? favorablePrice - position.managementRiskDistance * trailR : favorablePrice + position.managementRiskDistance * trailR;
                    const desired = position.side === "BUY" ? Math.max(position.stop, trailing) : Math.min(position.stop, trailing);
                    position.stop = roundPrice(desired, position.symbol);
                } else if (currentR >= Math.min(activationR, breakevenR)) {
                    const breakeven = currentR >= breakevenR ? position.entry : null;
                    const trailing = currentR >= activationR ? position.side === "BUY" ? currentPrice - position.managementRiskDistance * trailR : currentPrice + position.managementRiskDistance * trailR : null;
                    const desired = position.side === "BUY" ? Math.max(position.stop, breakeven ?? -Infinity, trailing ?? -Infinity) : Math.min(position.stop, breakeven ?? Infinity, trailing ?? Infinity);
                    if ((position.side === "BUY" && desired > position.stop) || (position.side === "SELL" && desired < position.stop)) {
                        position.stop = roundPrice(desired, position.symbol);
                        position.trailingActive = currentR >= activationR;
                    }
                }
            }
        }
    }

    if (timestamp % M15_MS !== 0) continue;
    if (position) {
        rejected.occupied += 1;
        continue;
    }
    if (RISK.DAILY_LAST_ENTRY_MINUTE_UTC <= minute) {
        rejected.beforeDailyClose += 1;
        continue;
    }
    if (isFriday && date.getUTCHours() >= RISK.FRIDAY_LAST_ENTRY_HOUR_UTC) {
        rejected.fridayCutoff += 1;
        continue;
    }

    const session = activeSession(timestamp);
    if (!session) continue;
    const signalBarTimestamp = timestamp - M15_MS;
    const candidates = [];

    for (const symbol of symbols) {
        const profile = profiles.get(symbol);
        if (!profile.enabled || (!IGNORE_PROFILE_SESSIONS && !profile.sessions.includes(session))) continue;
        const index = m15ByTimestamp.get(symbol).get(signalBarTimestamp);
        if (!Number.isInteger(index)) continue;
        const bars = m15.get(symbol).slice(Math.max(0, index - 199), index + 1);
        const bar = m15.get(symbol)[index];
        const signal =
            SIGNAL_ENGINE === "research"
                ? researchSignals.get(symbol).get(bar.timestamp) || { signal: null }
                : shouldEnter({ bars, symbol, profile });
        if (!signal.signal) continue;
        if (REVERSE_SIGNALS) signal.signal = signal.signal === "BUY" ? "SELL" : "BUY";
        if (DIRECTION_MODE !== "both" && signal.signal !== DIRECTION_MODE) continue;
        if (STOP_BUFFER_PIPS !== null) {
            const buffer = STOP_BUFFER_PIPS * pipSize(symbol);
            signal.sl = signal.signal === "BUY" ? bar.low - buffer : bar.high + buffer;
            signal.stopPips = Math.abs(bar.close - signal.sl) / pipSize(symbol);
        }
        if (signal.stopPips < profile.minStopDistancePips || signal.stopPips > profile.maxStopPips) continue;
        signals[symbol] += 1;
        const score = scoreSignal(signal, bar.close, bar.askClose, symbol);
        const spreadPips = Math.max(0, bar.askClose - bar.close) / pipSize(symbol);
        if (MIN_SIGNAL_SCORE !== null && score < MIN_SIGNAL_SCORE) continue;
        if (MIN_BODY_RATIO !== null && Number(signal.signalBodyRatio || 0) < MIN_BODY_RATIO) continue;
        if (MIN_STRUCTURE_SEQUENCE !== null && Number(signal.structureSequence || 0) < MIN_STRUCTURE_SEQUENCE) continue;
        if (MAX_SPREAD_PIPS !== null && spreadPips > MAX_SPREAD_PIPS) continue;
        if (MIN_STOP_SPREAD_RATIO > 0 && signal.stopPips < spreadPips * MIN_STOP_SPREAD_RATIO) continue;
        candidates.push({ symbol, profile, signal, bid: bar.close, ask: bar.askClose, score });
    }

    if (!candidates.length) continue;
    candidates.sort((left, right) => {
        if (SCORE_SELECTION === "score") return right.score - left.score || left.symbol.localeCompare(right.symbol);
        return left.symbol.localeCompare(right.symbol);
    });
    const candidate = candidates[0];
    const entry = candidate.signal.signal === "BUY" ? candidate.ask : candidate.bid;
    const stop = roundPrice(candidate.signal.sl, candidate.symbol);
    if ((candidate.signal.signal === "BUY" && stop >= entry) || (candidate.signal.signal === "SELL" && stop <= entry)) {
        rejected.crossedStop += 1;
        continue;
    }
    const quoteRate = quotePerEur(candidate.symbol, timestamp, rawM15);
    if (!(Number.isFinite(quoteRate) && quoteRate > 0)) {
        rejected.noConversion += 1;
        continue;
    }
    const sizing = positionSize({ symbol: candidate.symbol, balance, entry, stop, quoteRate });
    if (!sizing) {
        rejected.noSize += 1;
        continue;
    }

    const riskDistance = Math.abs(entry - stop);
    const structuralRiskDistance = Math.abs(candidate.bid - stop);
    const managementRiskDistance = MANAGEMENT_RISK_BASIS === "structural" ? structuralRiskDistance : riskDistance;
    const target = roundPrice(candidate.signal.signal === "BUY" ? entry + riskDistance * candidate.profile.safetyTakeProfitR : entry - riskDistance * candidate.profile.safetyTakeProfitR, candidate.symbol);
    position = {
        symbol: candidate.symbol,
        side: candidate.signal.signal,
        entryMs: timestamp,
        entryTimestamp: new Date(timestamp).toISOString(),
        entry,
        stop,
        initialStop: stop,
        target,
        size: sizing.size,
        entryQuotePerEur: quoteRate,
        initialRiskDistance: riskDistance,
        managementRiskDistance,
        initialRiskEur: sizing.effectiveRiskEur,
        initialRiskPct: sizing.effectiveRiskEur / balance,
        targetR: Math.abs(target - entry) / riskDistance,
        marginCapHit: sizing.marginCapHit,
        management: EXIT_MODE === "adaptive" ? candidate.profile.managementProfile : null,
        trailingActive: false,
    };
}

if (position) {
    const row = m5.get(position.symbol).at(-1);
    const closed = closePosition(position, row, "end_of_data", row.tsMs, rawM15, balance);
    balance = closed.balance;
    trades.push(closed.trade);
}

const result = {
    generatedAt: new Date().toISOString(),
    period: { start: new Date(startMs).toISOString(), end: new Date(commonEnd).toISOString(), months: HISTORY_MONTHS },
    startCapital: START_CAPITAL,
    endCapital: balance,
    returnPct: ((balance - START_CAPITAL) / START_CAPITAL) * 100,
    symbols,
    summary: summary(trades),
    signals,
    rejected,
    researchParameters: {
        signalEngine: SIGNAL_ENGINE,
        executionTimeframe: EXECUTION_TIMEFRAME,
        scoreSelection: SCORE_SELECTION,
        managementRiskBasis: MANAGEMENT_RISK_BASIS,
        exitMode: EXIT_MODE,
        directionMode: DIRECTION_MODE,
        reverseSignals: REVERSE_SIGNALS,
        stopBufferPips: STOP_BUFFER_PIPS,
        maxHoldMinutes: MAX_HOLD_MINUTES,
        ignoreProfileSessions: IGNORE_PROFILE_SESSIONS,
        minStopPips: MIN_STOP_PIPS,
        maxStopPips: MAX_STOP_PIPS,
        activationR: ACTIVATION_R,
        trailR: TRAIL_R,
        breakevenR: BREAKEVEN_R,
        safetyTakeProfitR: SAFETY_TAKE_PROFIT_R,
        minStopSpreadRatio: MIN_STOP_SPREAD_RATIO,
        maxSpreadPips: MAX_SPREAD_PIPS,
        minSignalScore: MIN_SIGNAL_SCORE,
        minBodyRatio: MIN_BODY_RATIO,
        minStructureSequence: MIN_STRUCTURE_SEQUENCE,
    },
    liveConfiguration: { risk: RISK, profiles: Object.fromEntries(profiles), sessionPriority: SESSION_PRIORITY },
    executionModel: {
        entry: "Each M15 close, using the same closed-candle HLLH signal and concurrent score selection as services/trading.js. BUY fills at M15 ask close, SELL at bid close.",
        exits: `SL and broker TP use ${EXECUTION_TIMEFRAME} bid/ask extremes. Adaptive R activation evaluates every ${EXECUTION_TIMEFRAME} close; after activation, the broker-native trailing stop follows new extremes.`,
        forcedFlat: `Daily close uses the ${EXECUTION_TIMEFRAME} opening quote at 23:50 UTC; Friday close uses the first ${EXECUTION_TIMEFRAME} opening quote at or after 20:00 UTC.`,
        knownLimits: "Historical broker order rejections, exact tick order inside an M5 candle, monitor scheduling drift, and live conversion-rate API timing cannot be reconstructed exactly.",
    },
};

let output = null;
if (SAVE_REPORT) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    output = path.join(REPORT_DIR, `current-system-six-months-${result.generatedAt.replaceAll(/[:.]/g, "-")}.json`);
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
}

const printable = SUMMARY_ONLY
    ? { output, period: result.period, startCapital: result.startCapital, endCapital: result.endCapital, returnPct: result.returnPct, summary: result.summary, researchParameters: result.researchParameters }
    : { output, ...result };
console.log(JSON.stringify(printable, null, 2));
