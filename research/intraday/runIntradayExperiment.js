import crypto from "crypto";
import fs from "fs";
import path from "path";
import { loadDatasetRows, round } from "../../backtest/lib/higherLowLowerHighResearch.js";
import { pipSizeForSymbol } from "../../backtest/lib/strategies/higherLowLowerHigh.js";
import { configHash, parseArgs, stableStringify } from "../experimentTarget.js";
import { buildSignals } from "./strategyFamilies.js";
import { exitProfileId } from "./exitProfiles.js";
import { managementProfileId } from "./managementProfiles.js";
import { riskProfileId, RISK_PROFILE_DEFINITIONS } from "./riskProfiles.js";
import { rejectionReasonFor, riskFlagsFor, scoreIntradayExperiment, scoreSet } from "./scoreIntradayExperiment.js";

export const INTRADAY_DIR = path.join(process.cwd(), "research", "intraday");
export const INTRADAY_CANDIDATE_DIR = path.join(INTRADAY_DIR, "candidates");
export const INTRADAY_REPORT_DIR = path.join(INTRADAY_DIR, "reports");
export const INTRADAY_RESULTS_PATH = path.join(INTRADAY_DIR, "results.tsv");
export const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
export const PRICE_LOG_DIR = path.join(process.cwd(), "backtest", "prices");
export const START_CAPITAL = 500;
export const PREVIOUS_REFERENCE_END_CAPITAL = 1076.09;

export { parseArgs };

const TSV_COLUMNS = [
    "timestamp",
    "experimentId",
    "configHash",
    "strategyFamily",
    "entryProfile",
    "exitProfile",
    "managementProfile",
    "riskProfile",
    "symbols",
    "timeframes",
    "dateRange",
    "trades",
    "winRate",
    "profitFactor",
    "expectancyR",
    "maxDrawdownPct",
    "startCapital",
    "endCapital",
    "rawPnl",
    "averageHoldBars",
    "score",
    "scoreMode",
    "riskFlags",
    "notes",
    "rejectionReason",
];

const ROW_CACHE = new Map();
const SPREAD_CACHE = new Map();

export function ensureIntradayDirs() {
    fs.mkdirSync(INTRADAY_CANDIDATE_DIR, { recursive: true });
    for (const subdir of ["maxProfit", "aggressiveIntraday", "profitWithControl", "stable", "high-risk", "family", "exit"]) {
        fs.mkdirSync(path.join(INTRADAY_CANDIDATE_DIR, subdir), { recursive: true });
    }
    fs.mkdirSync(INTRADAY_REPORT_DIR, { recursive: true });
    if (!fs.existsSync(INTRADAY_RESULTS_PATH)) fs.writeFileSync(INTRADAY_RESULTS_PATH, `${TSV_COLUMNS.join("\t")}\n`);
}

export function availableSymbols() {
    if (!fs.existsSync(DATA_DIR)) return [];
    const bySymbol = new Map();
    for (const name of fs.readdirSync(DATA_DIR)) {
        const match = name.match(/^([A-Z0-9]+)_(M1|M5|M15|H1)\.jsonl$/);
        if (!match) continue;
        if (!bySymbol.has(match[1])) bySymbol.set(match[1], new Set());
        bySymbol.get(match[1]).add(match[2]);
    }
    return [...bySymbol.entries()]
        .filter(([, frames]) => frames.has("M15") || frames.has("M5"))
        .map(([symbol, frames]) => ({ symbol, timeframes: [...frames].sort() }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function resolveIntradaySymbols(input) {
    if (input) {
        return String(input)
            .split(",")
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean);
    }
    return availableSymbols().map((item) => item.symbol);
}

function loadRows(symbol, timeframe, days) {
    const key = `${symbol}|${timeframe}|${days}`;
    if (ROW_CACHE.has(key)) return ROW_CACHE.get(key);
    const rows = loadDatasetRows({ dataDir: DATA_DIR, symbol, timeframe });
    if (!rows.length) {
        ROW_CACHE.set(key, []);
        return [];
    }
    const end = rows[rows.length - 1].tsMs;
    const start = end - Math.max(1, Number(days || 90)) * 86_400_000;
    const sliced = enrichRows(rows.filter((row) => row.tsMs >= start && row.tsMs <= end));
    ROW_CACHE.set(key, sliced);
    return sliced;
}

function ema(prev, value, period) {
    const alpha = 2 / (period + 1);
    return prev === null ? value : value * alpha + prev * (1 - alpha);
}

function enrichRows(rows) {
    const periods = [8, 13, 20, 34, 50];
    const emaState = Object.fromEntries(periods.map((period) => [period, null]));
    let atr = null;
    let avgGain = null;
    let avgLoss = null;
    const closes = [];
    return rows.map((row, index) => {
        const out = { ...row };
        for (const period of periods) {
            emaState[period] = ema(emaState[period], row.close, period);
            out[`ema${period}`] = emaState[period];
        }
        const prev = rows[index - 1] || row;
        const tr = Math.max(row.high - row.low, Math.abs(row.high - prev.close), Math.abs(row.low - prev.close));
        atr = atr === null ? tr : (atr * 13 + tr) / 14;
        out.atr = atr;
        out.atrPct = row.close ? atr / row.close : 0;
        const delta = row.close - prev.close;
        const gain = Math.max(0, delta);
        const loss = Math.max(0, -delta);
        avgGain = avgGain === null ? gain : (avgGain * 13 + gain) / 14;
        avgLoss = avgLoss === null ? loss : (avgLoss * 13 + loss) / 14;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out.rsi14 = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
        closes.push(row.close);
        if (closes.length > 20) closes.shift();
        const mean = closes.reduce((sum, value) => sum + value, 0) / closes.length;
        const variance = closes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / closes.length;
        const std = Math.sqrt(variance);
        out.bbMiddle = mean;
        out.bbUpper = mean + std * 2;
        out.bbLower = mean - std * 2;
        out.body = Math.abs(row.close - row.open);
        out.range = row.high - row.low;
        return out;
    });
}

function readJsonl(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return fs
        .readFileSync(filePath, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

function spreadPips(symbol) {
    if (SPREAD_CACHE.has(symbol)) return SPREAD_CACHE.get(symbol);
    const pip = pipSizeForSymbol(symbol);
    const rows = readJsonl(path.join(PRICE_LOG_DIR, `${symbol}.jsonl`));
    const spreads = rows
        .map((row) => {
            const direct = Number(row.spread);
            if (Number.isFinite(direct) && direct >= 0) return direct > pip * 20 ? direct : direct / pip;
            const bid = Number(row.bid);
            const ask = Number(row.ask);
            if (Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid) return (ask - bid) / pip;
            return null;
        })
        .filter((value) => Number.isFinite(value) && value >= 0 && value < 80);
    const value = spreads.length ? spreads.reduce((sum, item) => sum + item, 0) / spreads.length : symbol.includes("JPY") ? 2.4 : 1.4;
    SPREAD_CACHE.set(symbol, value);
    return value;
}

function rowIndexAfter(rows, tsMs) {
    let lo = 0;
    let hi = rows.length - 1;
    let found = rows.length;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rows[mid].tsMs > tsMs) {
            found = mid;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    return found;
}

function minuteUTC(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function dayKey(timestamp) {
    return String(timestamp || "").slice(0, 10);
}

function sessionName(timestamp) {
    const minute = minuteUTC(timestamp);
    if (minute >= 0 && minute < 7 * 60) return "asian";
    if (minute >= 7 * 60 && minute < 12 * 60) return "london";
    if (minute >= 13 * 60 && minute < 20 * 60) return "ny";
    return "off_session";
}

function buildStop(signal, entryPrice, row, exitProfile, pip) {
    const stop = Number(signal.suggestedStopPrice);
    let riskDistance = null;
    if (Number.isFinite(stop)) riskDistance = signal.side === "LONG" ? entryPrice - stop : stop - entryPrice;
    if (!(riskDistance > 0)) {
        const fixedPips = Number(exitProfile.stopPips || 10);
        riskDistance = fixedPips * pip;
    }
    if (exitProfile.stopModel === "atr" && row.atr > 0) riskDistance = row.atr * Number(exitProfile.stopAtrMultiplier || 1.2);
    if (exitProfile.stopModel === "fixed_pips") riskDistance = Number(exitProfile.stopPips || 10) * pip;
    const minRisk = Number(exitProfile.minStopPips || 2) * pip;
    const maxRisk = Number(exitProfile.maxStopPips || 35) * pip;
    riskDistance = Math.min(maxRisk, Math.max(minRisk, riskDistance));
    return signal.side === "LONG" ? entryPrice - riskDistance : entryPrice + riskDistance;
}

function priceAtR(trade, r) {
    return trade.side === "LONG" ? trade.entryPrice + trade.riskDistance * r : trade.entryPrice - trade.riskDistance * r;
}

function favorableR(trade, row) {
    const price = trade.side === "LONG" ? row.high : row.low;
    const move = trade.side === "LONG" ? price - trade.entryPrice : trade.entryPrice - price;
    return trade.riskDistance > 0 ? move / trade.riskDistance : 0;
}

function currentR(trade, price) {
    const move = trade.side === "LONG" ? price - trade.entryPrice : trade.entryPrice - price;
    return trade.riskDistance > 0 ? move / trade.riskDistance : 0;
}

function closeTrade(trade, row, index, price, reason, pip, warnings = []) {
    const grossR = currentR(trade, price);
    const costR = (trade.spreadPips + trade.slippagePips) / Math.max(0.1, trade.riskDistance / pip);
    const finalR = grossR - costR;
    const pnlR = trade.partialTaken ? trade.partialClosePct * trade.partialAtR + (1 - trade.partialClosePct) * finalR : finalR;
    return {
        ...trade,
        exitTimestamp: row.timestamp,
        exitIndex: index,
        exitPrice: price,
        exitReason: reason,
        pnlR,
        grossR,
        costR,
        holdBars: index - trade.entryIndex,
        warnings,
    };
}

function shouldCloseByManagement(trade, row, index, managementProfile) {
    const kind = managementProfile.kind;
    const rNow = currentR(trade, row.close);
    if (kind === "fast_cut" && index - trade.entryIndex >= Number(managementProfile.adverseBars || 2) && rNow <= -Number(managementProfile.maxAdverseR || 0.6)) {
        return "fast_cut_adverse";
    }
    if (kind === "protect_profit" && trade.maxFavorableR >= Number(managementProfile.minProfitR || 1)) {
        const giveback = trade.maxFavorableR > 0 ? (trade.maxFavorableR - rNow) / trade.maxFavorableR : 0;
        if (giveback >= Number(managementProfile.givebackPct || 0.45)) return "management_profit_protection";
    }
    if (kind === "momentum_watch" && trade.maxFavorableR >= Number(managementProfile.minProfitR || 1)) {
        const against = trade.side === "LONG" ? row.close < row.open && row.close < row.ema8 : row.close > row.open && row.close > row.ema8;
        if (against) trade.againstBars = (trade.againstBars || 0) + 1;
        else trade.againstBars = 0;
        if (trade.againstBars >= Number(managementProfile.closeAgainstBars || 2)) return "management_momentum_decay";
    }
    if (kind === "daily_flat" && minuteUTC(row.timestamp) >= Number(managementProfile.closeMinuteUTC || 21 * 60)) return "daily_flat";
    return null;
}

function simulateSignalTrade({ signal, entryRows, monitorRows, exitProfile, managementProfile, slippagePips = 0.2 }) {
    const pip = pipSizeForSymbol(signal.symbol);
    const entryIndex = rowIndexAfter(monitorRows, signal.signalRow.tsMs);
    if (entryIndex >= monitorRows.length) return null;
    const entryRow = monitorRows[entryIndex];
    const entryPrice = entryRow.open;
    const stopPrice = buildStop(signal, entryPrice, entryRow, exitProfile, pip);
    const riskDistance = signal.side === "LONG" ? entryPrice - stopPrice : stopPrice - entryPrice;
    if (!(riskDistance > pip * 0.5)) return null;
    const trade = {
        symbol: signal.symbol,
        side: signal.side,
        family: signal.family,
        reason: signal.reason,
        session: signal.session || sessionName(signal.signalTimestamp),
        signalTimestamp: signal.signalTimestamp,
        entryTimestamp: entryRow.timestamp,
        entryIndex,
        entryPrice,
        stopPrice,
        initialStopPrice: stopPrice,
        riskDistance,
        takeProfit: exitProfile.tpR ? priceAtR({ side: signal.side, entryPrice, riskDistance }, exitProfile.tpR) : null,
        spreadPips: spreadPips(signal.symbol),
        slippagePips,
        maxFavorableR: 0,
        partialTaken: false,
        partialAtR: Number(exitProfile.partialAtR || 0),
        partialClosePct: Number(exitProfile.partialClosePct || 0),
    };
    const maxHoldBars = Number(exitProfile.maxHoldBars || managementProfile.maxHoldBars || 96);
    const warnings = [];
    for (let index = entryIndex + 1; index < monitorRows.length; index += 1) {
        const row = monitorRows[index];
        if (dayKey(row.timestamp) !== dayKey(trade.entryTimestamp) && (exitProfile.noOvernight ?? true)) {
            return closeTrade(trade, monitorRows[index - 1], index - 1, monitorRows[index - 1].close, "no_overnight_flat", pip, warnings);
        }
        trade.maxFavorableR = Math.max(trade.maxFavorableR, favorableR(trade, row));
        if (exitProfile.kind === "breakeven_after_r" && trade.maxFavorableR >= Number(exitProfile.breakevenR || 1)) {
            trade.stopPrice = trade.side === "LONG" ? Math.max(trade.stopPrice, trade.entryPrice) : Math.min(trade.stopPrice, trade.entryPrice);
        }
        if (exitProfile.kind === "adaptive_r_trail" && trade.maxFavorableR >= Number(exitProfile.activationR || 1)) {
            const newStop = priceAtR(trade, Math.max(Number(exitProfile.breakevenR || 0), trade.maxFavorableR - Number(exitProfile.trailR || 1)));
            trade.stopPrice = trade.side === "LONG" ? Math.max(trade.stopPrice, newStop) : Math.min(trade.stopPrice, newStop);
        }
        if (exitProfile.kind === "atr_trailing" && trade.maxFavorableR >= Number(exitProfile.activateAfterR || 1) && row.atr > 0) {
            const newStop = trade.side === "LONG" ? row.close - row.atr * Number(exitProfile.atrMultiplier || 2) : row.close + row.atr * Number(exitProfile.atrMultiplier || 2);
            trade.stopPrice = trade.side === "LONG" ? Math.max(trade.stopPrice, newStop) : Math.min(trade.stopPrice, newStop);
        }
        if (exitProfile.kind === "candle_low_high_trail" && trade.maxFavorableR >= Number(exitProfile.activateAfterR || 1)) {
            const lookback = Math.max(1, Number(exitProfile.lookbackBars || 2));
            const slice = monitorRows.slice(Math.max(entryIndex, index - lookback), index);
            if (slice.length) {
                const newStop = trade.side === "LONG" ? Math.min(...slice.map((item) => item.low)) : Math.max(...slice.map((item) => item.high));
                trade.stopPrice = trade.side === "LONG" ? Math.max(trade.stopPrice, newStop) : Math.min(trade.stopPrice, newStop);
            }
        }
        if (exitProfile.kind === "partial_take_profit" && !trade.partialTaken && trade.maxFavorableR >= Number(exitProfile.partialAtR || 1)) {
            trade.partialTaken = true;
            if (exitProfile.moveStopToBreakevenAfterPartial) trade.stopPrice = trade.entryPrice;
        }
        if (exitProfile.kind === "profit_protection_exit" && trade.maxFavorableR >= Number(exitProfile.reachedR || 2)) {
            const rNow = currentR(trade, row.close);
            const giveback = (trade.maxFavorableR - rNow) / Math.max(0.1, trade.maxFavorableR);
            if (giveback >= Number(exitProfile.givebackPct || 0.4)) return closeTrade(trade, row, index, row.close, "profit_protection_exit", pip, warnings);
        }
        const stopHit = trade.side === "LONG" ? row.low <= trade.stopPrice : row.high >= trade.stopPrice;
        const tpHit = trade.takeProfit ? (trade.side === "LONG" ? row.high >= trade.takeProfit : row.low <= trade.takeProfit) : false;
        if (stopHit && tpHit) warnings.push("same_candle_ambiguity_conservative_stop_first");
        if (stopHit) return closeTrade(trade, row, index, trade.stopPrice, trade.stopPrice === trade.entryPrice ? "breakeven_stop" : "stop_loss_or_trailing_stop", pip, warnings);
        if (tpHit) return closeTrade(trade, row, index, trade.takeProfit, "take_profit", pip, warnings);
        if (exitProfile.kind === "ema_exit") {
            const ema = row[`ema${exitProfile.emaPeriod || 20}`];
            if (Number.isFinite(ema) && ((trade.side === "LONG" && row.close < ema) || (trade.side === "SHORT" && row.close > ema))) return closeTrade(trade, row, index, row.close, "ema_exit", pip, warnings);
        }
        if (exitProfile.kind === "momentum_decay_exit" && trade.maxFavorableR >= Number(exitProfile.minProfitR || 1)) {
            const against = trade.side === "LONG" ? row.close < row.open : row.close > row.open;
            if (against) trade.decayBars = (trade.decayBars || 0) + 1;
            else trade.decayBars = 0;
            if (trade.decayBars >= Number(exitProfile.decayBars || 2)) return closeTrade(trade, row, index, row.close, "momentum_decay_exit", pip, warnings);
        }
        const managementReason = shouldCloseByManagement(trade, row, index, managementProfile);
        if (managementReason) return closeTrade(trade, row, index, row.close, managementReason, pip, warnings);
        if (index - entryIndex >= maxHoldBars) return closeTrade(trade, row, index, row.close, "time_based_exit", pip, warnings);
    }
    return closeTrade(trade, monitorRows[monitorRows.length - 1], monitorRows.length - 1, monitorRows[monitorRows.length - 1].close, "end_of_data", pip, warnings);
}

function summarizeTrades(trades) {
    const wins = trades.filter((trade) => trade.pnlR > 0);
    const losses = trades.filter((trade) => trade.pnlR < 0);
    const grossWin = wins.reduce((sum, trade) => sum + trade.pnlR, 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnlR, 0));
    return {
        trades: trades.length,
        winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
        expectancyR: trades.length ? trades.reduce((sum, trade) => sum + trade.pnlR, 0) / trades.length : 0,
        averageHoldBars: trades.length ? trades.reduce((sum, trade) => sum + Number(trade.holdBars || 0), 0) / trades.length : 0,
    };
}

function simulatePortfolio(tradeCandidates, riskProfile, days) {
    const sorted = tradeCandidates.sort((a, b) => Date.parse(a.entryTimestamp) - Date.parse(b.entryTimestamp) || a.symbol.localeCompare(b.symbol));
    let balance = START_CAPITAL;
    let peak = START_CAPITAL;
    let maxDrawdownPct = 0;
    let lossStreak = 0;
    const accepted = [];
    const open = [];
    const daily = new Map();
    const symbolCounts = {};
    const familyCounts = {};
    const exitCounts = {};
    const sessionCounts = {};

    function closeMatured(nowMs) {
        open.sort((a, b) => Date.parse(a.exitTimestamp) - Date.parse(b.exitTimestamp));
        while (open.length && Date.parse(open[0].exitTimestamp) <= nowMs) {
            const item = open.shift();
            balance += item.pnlCash;
            peak = Math.max(peak, balance);
            maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? ((peak - balance) / peak) * 100 : 0);
            lossStreak = item.pnlCash < 0 ? lossStreak + 1 : 0;
            const day = dayKey(item.exitTimestamp);
            const state = daily.get(day) || { pnl: 0, trades: 0, bySymbol: {} };
            state.pnl += item.pnlCash;
            daily.set(day, state);
        }
    }

    for (const candidate of sorted) {
        const entryMs = Date.parse(candidate.entryTimestamp);
        closeMatured(entryMs);
        const day = dayKey(candidate.entryTimestamp);
        const state = daily.get(day) || { pnl: 0, trades: 0, bySymbol: {} };
        if (state.trades >= Number(riskProfile.maxTradesPerDay || 999)) continue;
        if ((state.bySymbol[candidate.symbol] || 0) >= Number(riskProfile.maxTradesPerSymbolPerDay || 999)) continue;
        if (state.pnl <= -balance * Number(riskProfile.dailyStopLossPct || 1)) continue;
        if (state.pnl >= balance * Number(riskProfile.dailyTakeProfitLockPct || 99)) continue;
        if (lossStreak >= Number(riskProfile.stopAfterLosses || 999)) continue;
        if (open.length >= Number(riskProfile.maxPositions || 1)) continue;
        if (open.some((trade) => trade.symbol === candidate.symbol)) continue;
        const drawdownPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
        const riskMultiplier = drawdownPct >= Number(riskProfile.reduceRiskAfterDrawdownPct || 999) ? Number(riskProfile.reducedRiskMultiplier || 0.5) : 1;
        const riskCash = balance * Number(riskProfile.riskPerTrade || 0.03) * riskMultiplier;
        const pnlCash = riskCash * candidate.pnlR;
        const acceptedTrade = { ...candidate, riskCash, pnlCash, balanceAtEntry: balance };
        accepted.push(acceptedTrade);
        open.push(acceptedTrade);
        state.trades += 1;
        state.bySymbol[candidate.symbol] = (state.bySymbol[candidate.symbol] || 0) + 1;
        daily.set(day, state);
        symbolCounts[candidate.symbol] = (symbolCounts[candidate.symbol] || 0) + 1;
        familyCounts[candidate.family] = (familyCounts[candidate.family] || 0) + 1;
        exitCounts[candidate.exitProfileKind] = (exitCounts[candidate.exitProfileKind] || 0) + 1;
        sessionCounts[candidate.session] = (sessionCounts[candidate.session] || 0) + 1;
    }
    closeMatured(Infinity);
    const summary = summarizeTrades(accepted);
    return {
        trades: accepted,
        metrics: {
            ...summary,
            startCapital: START_CAPITAL,
            endCapital: balance,
            rawPnl: balance - START_CAPITAL,
            maxDrawdownPct,
            days,
        },
        counts: { symbolCounts, familyCounts, exitCounts, sessionCounts },
    };
}

export function baselineCandidate() {
    return {
        label: "intraday_reference_hllh_1076",
        strategyFamily: {
            family: "hllh_continuation",
            setupMode: "confirmed",
            pivotWindow: 2,
            signalMode: "strict",
            stopVariant: "structure_pivot_with_buffer_2pip",
        },
        entryProfile: { timeframe: "M15", entryMode: "next_open" },
        exitProfile: { kind: "fixed_r", tpR: 5, stopModel: "candle", minStopPips: 2, maxStopPips: 25, noOvernight: true },
        managementProfile: { kind: "passive", maxHoldBars: 96 },
        riskProfile: RISK_PROFILE_DEFINITIONS.aggressive_3pct,
        notes: "Reference shape based on previous HLLH AutoSearch best; not applied to live config.",
    };
}

function candidateId(candidate, symbols, days) {
    return crypto.createHash("sha256").update(stableStringify({ candidate, symbols, days })).digest("hex").slice(0, 12);
}

export function runIntradayExperiment({ candidate = baselineCandidate(), symbols = resolveIntradaySymbols(), days = 90, mode = "aggressiveIntraday" } = {}) {
    ensureIntradayDirs();
    const entryTimeframe = candidate.entryProfile?.timeframe || "M15";
    let globalFrom = null;
    let globalTo = null;
    const tradeCandidates = [];
    const warnings = new Set(["live_parity_risk"]);
    const timeframesUsed = new Set([entryTimeframe]);

    for (const symbol of symbols) {
        const entryRows = loadRows(symbol, entryTimeframe, days);
        if (!entryRows.length) continue;
        const monitorTimeframe = fs.existsSync(path.join(DATA_DIR, `${symbol}_M5.jsonl`)) ? "M5" : entryTimeframe;
        timeframesUsed.add(monitorTimeframe);
        const monitorRows = loadRows(symbol, monitorTimeframe, days);
        if (!monitorRows.length) continue;
        globalFrom = globalFrom === null ? entryRows[0].tsMs : Math.min(globalFrom, entryRows[0].tsMs);
        globalTo = globalTo === null ? entryRows.at(-1).tsMs : Math.max(globalTo, entryRows.at(-1).tsMs);
        const signals = buildSignals({ symbol, rows: entryRows, familyConfig: candidate.strategyFamily });
        for (const signal of signals) {
            const trade = simulateSignalTrade({
                signal,
                entryRows,
                monitorRows,
                exitProfile: candidate.exitProfile,
                managementProfile: candidate.managementProfile || {},
            });
            if (trade) {
                trade.exitProfileKind = candidate.exitProfile.kind;
                trade.managementProfileKind = candidate.managementProfile?.kind || "passive";
                trade.riskProfileKind = candidate.riskProfile?.kind || "custom";
                tradeCandidates.push(trade);
                if (trade.warnings?.includes("same_candle_ambiguity_conservative_stop_first")) warnings.add("same_candle_ambiguity_conservative");
            }
        }
    }

    const portfolio = simulatePortfolio(tradeCandidates, candidate.riskProfile || RISK_PROFILE_DEFINITIONS.aggressive_3pct, days);
    const metrics = {
        trades: portfolio.metrics.trades,
        winRate: round(portfolio.metrics.winRate, 2),
        profitFactor: round(portfolio.metrics.profitFactor, 3),
        expectancyR: round(portfolio.metrics.expectancyR, 4),
        maxDrawdownPct: round(portfolio.metrics.maxDrawdownPct, 2),
        startCapital: START_CAPITAL,
        endCapital: round(portfolio.metrics.endCapital, 2),
        rawPnl: round(portfolio.metrics.rawPnl, 2),
        averageHoldBars: round(portfolio.metrics.averageHoldBars, 2),
        days,
    };
    const scores = scoreSet(metrics);
    const score = scoreIntradayExperiment(metrics, mode);
    const riskFlags = riskFlagsFor(metrics, [...warnings]);
    const hash = candidateId(candidate, symbols, days);
    const experimentId = `${candidate.label || "intraday"}_${hash}`;

    return {
        timestamp: new Date().toISOString(),
        experimentId,
        configHash: hash,
        candidate,
        strategyFamily: candidate.strategyFamily.family,
        entryProfile: candidate.entryProfile,
        exitProfile: candidate.exitProfile,
        managementProfile: candidate.managementProfile,
        riskProfile: candidate.riskProfile,
        symbols,
        timeframes: [...timeframesUsed].sort(),
        dateRange: {
            from: globalFrom ? new Date(globalFrom).toISOString() : null,
            to: globalTo ? new Date(globalTo).toISOString() : null,
            days,
        },
        metrics,
        score: round(score, 4),
        scoreMode: mode,
        scores: {
            maxProfit: round(scores.maxProfit, 4),
            aggressiveIntraday: round(scores.aggressiveIntraday, 4),
            profitWithControl: round(scores.profitWithControl, 4),
            stable: round(scores.stable, 4),
        },
        riskFlags,
        rejectionReason: rejectionReasonFor(metrics, [...warnings]),
        counts: portfolio.counts,
        sampleTrades: portfolio.trades.slice(0, 20).map((trade) => ({
            symbol: trade.symbol,
            family: trade.family,
            session: trade.session,
            side: trade.side,
            entryTimestamp: trade.entryTimestamp,
            exitTimestamp: trade.exitTimestamp,
            exitReason: trade.exitReason,
            pnlR: round(trade.pnlR, 3),
            pnlCash: round(trade.pnlCash, 2),
        })),
        realism: {
            entryTiming: "signal candle closes, entry on next monitoring candle open",
            monitoring: "M5 when available, otherwise entry timeframe",
            spread: "average from backtest/prices when available, static fallback otherwise",
            slippagePips: 0.2,
            sameCandleAmbiguity: "conservative: stop is evaluated before take-profit",
            noLookahead: true,
            limitations: ["no true bid/ask historical candle stream", "portfolio margin model simplified to risk-cash sizing", "M1 monitoring only used later if explicitly added"],
        },
    };
}

function tsvEscape(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

export function appendIntradayResult(result) {
    ensureIntradayDirs();
    const row = {
        timestamp: result.timestamp,
        experimentId: result.experimentId,
        configHash: result.configHash,
        strategyFamily: result.strategyFamily,
        entryProfile: `${result.entryProfile?.timeframe || ""}:${result.entryProfile?.entryMode || ""}`,
        exitProfile: exitProfileId(result.exitProfile),
        managementProfile: managementProfileId(result.managementProfile),
        riskProfile: riskProfileId(result.riskProfile),
        symbols: result.symbols.join(","),
        timeframes: result.timeframes.join(","),
        dateRange: `${result.dateRange.from || "unknown"}..${result.dateRange.to || "unknown"}`,
        trades: result.metrics.trades,
        winRate: result.metrics.winRate,
        profitFactor: result.metrics.profitFactor,
        expectancyR: result.metrics.expectancyR,
        maxDrawdownPct: result.metrics.maxDrawdownPct,
        startCapital: result.metrics.startCapital,
        endCapital: result.metrics.endCapital,
        rawPnl: result.metrics.rawPnl,
        averageHoldBars: result.metrics.averageHoldBars,
        score: result.score,
        scoreMode: result.scoreMode,
        riskFlags: result.riskFlags.join(","),
        notes: result.candidate.notes || "",
        rejectionReason: result.rejectionReason,
    };
    fs.appendFileSync(INTRADAY_RESULTS_PATH, `${TSV_COLUMNS.map((key) => tsvEscape(row[key])).join("\t")}\n`);
}

export function saveIntradayCandidate(result, { subdir = null, tag = null } = {}) {
    ensureIntradayDirs();
    const dir = subdir ? path.join(INTRADAY_CANDIDATE_DIR, subdir) : INTRADAY_CANDIDATE_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${tag ? `${tag}__` : ""}${result.experimentId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    return filePath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = parseArgs();
    const mode = String(args.mode || "aggressiveIntraday");
    const days = Number(args.days || 90);
    const symbols = resolveIntradaySymbols(args.symbols);
    const result = runIntradayExperiment({ candidate: baselineCandidate(), symbols, days, mode });
    const candidatePath = saveIntradayCandidate(result, { subdir: mode, tag: "baseline" });
    appendIntradayResult(result);
    console.log(JSON.stringify({ experimentId: result.experimentId, candidatePath, symbols: result.symbols, metrics: result.metrics, scores: result.scores, riskFlags: result.riskFlags }, null, 2));
}
