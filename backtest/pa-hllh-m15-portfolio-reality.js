import fs from "fs";
import path from "path";
import {
    advanceHigherLowLowerHighDetector,
    createHigherLowLowerHighConfig,
    createHigherLowLowerHighState,
    normalizeRows,
    pipSizeForSymbol,
    prepareHigherLowLowerHighContext,
} from "./lib/strategies/higherLowLowerHigh.js";
import { loadDatasetRows, round } from "./lib/higherLowLowerHighResearch.js";
import {
    buildPendingEntry,
    buildTradeFromSignal,
    closeTrade,
    maybeActivatePendingEntry,
    maybeCloseTrade,
    maybeRejectSmallStop,
    shouldDailyForceClose,
    scenarioId,
} from "./lib/simulators/priceActionTradeCore.js";

const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
const DECISION_LOG_DIR = path.join(process.cwd(), "backtest", "decision-logs");
const REPORT_DIR = path.join(process.cwd(), "backtest", "reports", "compare");
const TIMEFRAME = "M15";
const START_CAPITAL = 500;
const RISK_PCT = 0.03;
const MARGIN_CAP_PCT = 0.7;
const COST_MODEL = process.env.COST_MODEL || (process.env.COST_PIPS !== undefined ? "fixed" : "decision_logs");
const COST_PIPS = Number(process.env.COST_PIPS || 0);
const SPREAD_STAT = process.env.SPREAD_STAT || "avg";
const FALLBACK_SPREAD_PIPS = Number(process.env.FALLBACK_SPREAD_PIPS || 1.5);
const SLIPPAGE_PIPS_PER_SIDE = Number(process.env.SLIPPAGE_PIPS_PER_SIDE || 0);
const OVERNIGHT_COST_PIPS_PER_NIGHT = Number(process.env.OVERNIGHT_COST_PIPS_PER_NIGHT || 0.5);
const GRID_MODE = process.env.GRID_MODE || "focused";
const PORTFOLIO_SIZES = String(process.env.PORTFOLIO_SIZES || "3,4")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
const MAX_SYMBOLS_PER_CONFIG = Number(process.env.MAX_SYMBOLS_PER_CONFIG || (GRID_MODE === "deep" ? 8 : 99));

const ALL_SYMBOLS = fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(`_${TIMEFRAME}.jsonl`))
    .map((name) => name.slice(0, -`_${TIMEFRAME}.jsonl`.length))
    .sort();
const SYMBOLS = [
    "AUDJPY",
    "AUDUSD",
    "EURAUD",
    "EURGBP",
    "EURJPY",
    "EURUSD",
    "GBPAUD",
    "GBPJPY",
    "GBPUSD",
    "NZDJPY",
    "NZDUSD",
    "USDCAD",
    "USDCHF",
    "USDJPY",
].filter((symbol) => ALL_SYMBOLS.includes(symbol));

function lastMonths(rows, months = 5) {
    if (!rows.length) return rows;
    const end = rows[rows.length - 1].tsMs;
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - months);
    return rows.filter((row) => row.tsMs >= start.getTime() && row.tsMs <= end);
}

const DATA = new Map(SYMBOLS.map((symbol) => [symbol, lastMonths(loadDatasetRows({ dataDir: DATA_DIR, symbol, timeframe: TIMEFRAME }), 5)]));

function percentile(values, pct) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * pct)));
    return sorted[index];
}

function spreadFromDecisionLogEntry(entry, symbol) {
    const pipSize = pipSizeForSymbol(symbol);
    const bid = Number(entry?.snapshot?.bid ?? entry?.bid);
    const ask = Number(entry?.snapshot?.ask ?? entry?.snapshot?.offer ?? entry?.ask ?? entry?.offer);
    if (Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid) return (ask - bid) / pipSize;

    const spread = Number(entry?.snapshot?.spread ?? entry?.spread);
    if (Number.isFinite(spread) && spread >= 0) {
        return spread > 0.1 ? spread : spread / pipSize;
    }
    return null;
}

function loadDecisionLogSpreadStats() {
    if (!fs.existsSync(DECISION_LOG_DIR)) return {};
    const stats = {};
    for (const file of fs.readdirSync(DECISION_LOG_DIR).filter((name) => name.endsWith(".jsonl"))) {
        const symbol = path.basename(file, ".jsonl").toUpperCase();
        const spreads = [];
        const raw = fs.readFileSync(path.join(DECISION_LOG_DIR, file), "utf-8");
        for (const line of raw.split("\n")) {
            if (!line.trim()) continue;
            try {
                const entry = JSON.parse(line);
                const spreadPips = spreadFromDecisionLogEntry(entry, symbol);
                if (Number.isFinite(spreadPips) && spreadPips >= 0 && spreadPips < 100) spreads.push(spreadPips);
            } catch {
                // Ignore malformed diagnostic rows.
            }
        }
        if (!spreads.length) continue;
        const sum = spreads.reduce((acc, value) => acc + value, 0);
        stats[symbol] = {
            source: "decision_logs",
            count: spreads.length,
            avg: sum / spreads.length,
            p50: percentile(spreads, 0.5),
            p75: percentile(spreads, 0.75),
            p90: percentile(spreads, 0.9),
            p95: percentile(spreads, 0.95),
            min: Math.min(...spreads),
            max: Math.max(...spreads),
        };
    }
    return stats;
}

const DECISION_LOG_SPREAD_STATS = loadDecisionLogSpreadStats();

function spreadStatsForSymbol(symbol) {
    if (DECISION_LOG_SPREAD_STATS[symbol]) return DECISION_LOG_SPREAD_STATS[symbol];
    if (symbol.includes("JPY") && DECISION_LOG_SPREAD_STATS.USDJPY) {
        return { ...DECISION_LOG_SPREAD_STATS.USDJPY, source: "fallback_usdjpy_decision_logs" };
    }
    if (symbol.endsWith("USD") && DECISION_LOG_SPREAD_STATS.EURUSD) {
        return { ...DECISION_LOG_SPREAD_STATS.EURUSD, source: "fallback_eurusd_decision_logs" };
    }
    if (symbol.startsWith("GBP") && DECISION_LOG_SPREAD_STATS.GBPUSD) {
        return { ...DECISION_LOG_SPREAD_STATS.GBPUSD, source: "fallback_gbpusd_decision_logs" };
    }
    return {
        source: "fallback_static",
        count: 0,
        avg: FALLBACK_SPREAD_PIPS,
        p50: FALLBACK_SPREAD_PIPS,
        p75: FALLBACK_SPREAD_PIPS,
        p90: FALLBACK_SPREAD_PIPS,
        p95: FALLBACK_SPREAD_PIPS,
        min: FALLBACK_SPREAD_PIPS,
        max: FALLBACK_SPREAD_PIPS,
    };
}

function roundTripCostPips(symbol) {
    if (COST_MODEL === "fixed") return COST_PIPS;
    if (COST_MODEL === "none") return 0;
    const stats = spreadStatsForSymbol(symbol);
    const spread = Number(stats?.[SPREAD_STAT]);
    const appliedSpread = Number.isFinite(spread) && spread >= 0 ? spread : FALLBACK_SPREAD_PIPS;
    return appliedSpread + SLIPPAGE_PIPS_PER_SIDE * 2;
}

function utcDayStartMs(timestamp) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return null;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function overnightDays(trade) {
    const entryDay = utcDayStartMs(trade.entryTimestamp);
    const exitDay = utcDayStartMs(trade.exitTimestamp);
    if (!Number.isFinite(entryDay) || !Number.isFinite(exitDay)) return 0;
    return Math.max(0, Math.floor((exitDay - entryDay) / 86_400_000));
}

function tradeCostPips(trade) {
    return roundTripCostPips(trade.symbol) + overnightDays(trade) * OVERNIGHT_COST_PIPS_PER_NIGHT;
}

function rowAtOrBefore(symbol, tsMs) {
    const rows = DATA.get(symbol) || [];
    let lo = 0;
    let hi = rows.length - 1;
    let found = null;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rows[mid].tsMs <= tsMs) {
            found = rows[mid];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found;
}

function syntheticEurQuote(quote, tsMs) {
    if (quote === "EUR") return 1;
    const direct = rowAtOrBefore(`EUR${quote}`, tsMs)?.close;
    if (Number.isFinite(direct) && direct > 0) return direct;
    if (quote === "CAD") {
        const eurusd = rowAtOrBefore("EURUSD", tsMs)?.close;
        const usdcad = rowAtOrBefore("USDCAD", tsMs)?.close;
        if (Number.isFinite(eurusd) && Number.isFinite(usdcad)) return eurusd * usdcad;
    }
    if (quote === "NZD") {
        const eurusd = rowAtOrBefore("EURUSD", tsMs)?.close;
        const nzdusd = rowAtOrBefore("NZDUSD", tsMs)?.close;
        if (Number.isFinite(eurusd) && Number.isFinite(nzdusd) && nzdusd > 0) return eurusd / nzdusd;
    }
    return null;
}

function parseSymbol(symbol) {
    return { base: symbol.slice(0, 3), quote: symbol.slice(3, 6) };
}

function leverageForSymbol(symbol) {
    return symbol.includes("USD") ? 30 : 20;
}

function minuteOfDayUTC(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function weekendBlocked(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    return (day === 5 && hour >= 18) || day === 6 || (day === 0 && hour < 22);
}

function signalBlocked(candidate, config) {
    const ts = candidate?.signalTimestamp || candidate?.signalRow?.timestamp;
    if (!ts) return true;
    if (weekendBlocked(ts)) return true;
    const entryCutoffMinuteUTC = config.entryCutoffMinuteUTC === null || config.entryCutoffMinuteUTC === undefined ? null : Number(config.entryCutoffMinuteUTC);
    if (Number.isFinite(entryCutoffMinuteUTC) && minuteOfDayUTC(ts) >= entryCutoffMinuteUTC) return true;
    const hour = new Date(ts).getUTCHours();
    const avoidHours = Array.isArray(config.avoidHoursUTC) ? config.avoidHoursUTC.map(Number) : [];
    return avoidHours.includes(hour);
}

function tradeBlockedByStop(trade, config, pipSize) {
    const maxStopPips = Number(config.maxStopPips);
    if (!(Number.isFinite(maxStopPips) && maxStopPips > 0)) return false;
    const stopPips = Number(trade?.riskDistance) / pipSize;
    return Number.isFinite(stopPips) && stopPips > maxStopPips;
}

function runFastScenario(symbol, config) {
    const rows = normalizeRows(DATA.get(symbol) || []);
    const context = prepareHigherLowLowerHighContext(rows, config);
    const state = createHigherLowLowerHighState(config);
    const pipSize = pipSizeForSymbol(symbol);
    const trades = [];
    const simulationStats = { breakEntryExpiredCount: 0, breakEntryInvalidatedCount: 0, stopBelowMinDistanceCount: 0 };
    let openTrade = null;
    let pendingEntry = null;

    for (let index = 0; index < context.rows.length; index += 1) {
        const row = context.rows[index];
        if (openTrade) {
            const previousRow = context.rows[index - 1] || null;
            if (shouldDailyForceClose(openTrade, previousRow, row, config)) {
                trades.push(closeTrade(openTrade, index - 1, previousRow, previousRow.close, "daily_forced_close_utc", pipSize));
                openTrade = null;
                continue;
            }
            const closedTrade = maybeCloseTrade(openTrade, row, index, pipSize);
            if (closedTrade) {
                trades.push(closedTrade);
                openTrade = null;
                continue;
            }
            continue;
        }

        if (pendingEntry) {
            const activation = maybeActivatePendingEntry(pendingEntry, row, index, pipSize, simulationStats);
            if (activation.status === "entered" && activation.trade) {
                if (!tradeBlockedByStop(activation.trade, config, pipSize) && !maybeRejectSmallStop(activation.trade, config, pipSize, simulationStats)) {
                    openTrade = activation.trade;
                }
                pendingEntry = null;
                continue;
            }
            if (activation.status === "expired" || activation.status === "invalidated") {
                pendingEntry = null;
            } else {
                continue;
            }
        }

        const step = advanceHigherLowLowerHighDetector({ context, state, index });
        for (const event of step.events) {
            if (event.type !== "signal_candidate") continue;
            const candidate = event.candidate;
            if (signalBlocked(candidate, config)) continue;
            if (config.entryMode === "entry_on_close") {
                const trade = buildTradeFromSignal({ candidate, entryIndex: index, entryPrice: row.close, config, pipSize });
                if (trade && !tradeBlockedByStop(trade, config, pipSize) && !maybeRejectSmallStop(trade, config, pipSize, simulationStats)) {
                    trades.push({ ...trade, symbol, pipSize });
                    openTrade = trades.pop();
                    break;
                }
            } else {
                pendingEntry = buildPendingEntry(candidate, config, pipSize);
                break;
            }
        }
    }

    if (openTrade && context.rows.length) {
        const lastIndex = context.rows.length - 1;
        const lastRow = context.rows[lastIndex];
        trades.push(closeTrade(openTrade, lastIndex, lastRow, lastRow.close, "end_of_data", pipSize));
    }
    return trades.map((trade) => ({ ...trade, symbol, pipSize }));
}

function costAdjustedR(trade, costPips) {
    const stopPips = Number(trade.riskDistance) / Number(trade.pipSize);
    if (!(Number.isFinite(stopPips) && stopPips > 0)) return Number(trade.pnlR || 0);
    return Number(trade.pnlR || 0) - costPips / stopPips;
}

function positionModel(balance, trade, pnlRNet) {
    const { base, quote } = parseSymbol(trade.symbol);
    const tsMs = Date.parse(trade.entryTimestamp);
    const eurQuote = syntheticEurQuote(quote, tsMs);
    if (!(Number.isFinite(eurQuote) && eurQuote > 0)) return null;

    const riskDistance = Number(trade.riskDistance);
    const entryPrice = Number(trade.entryPrice);
    const targetRisk = balance * RISK_PCT;
    const rawUnits = (targetRisk * eurQuote) / riskDistance;
    const notionalEur = base === "EUR" ? rawUnits : (rawUnits * entryPrice) / eurQuote;
    const leverage = leverageForSymbol(trade.symbol);
    const maxMargin = balance * MARGIN_CAP_PCT;
    const rawMargin = notionalEur / leverage;
    const riskScale = rawMargin > maxMargin ? maxMargin / rawMargin : 1;
    const pnlEur = targetRisk * riskScale * pnlRNet;
    return {
        leverage,
        targetRisk,
        rawUnits,
        rawMargin,
        riskScale,
        effectiveRiskPct: RISK_PCT * riskScale,
        pnlEur,
    };
}

function summarizeTrades(trades) {
    let wins = 0;
    let losses = 0;
    let totalR = 0;
    let grossWinR = 0;
    let grossLossR = 0;
    let equityR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    for (const trade of trades) {
        const r = Number(trade.pnlRNet || 0);
        totalR += r;
        equityR += r;
        peakR = Math.max(peakR, equityR);
        maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR);
        if (r > 0) {
            wins += 1;
            grossWinR += r;
        } else if (r < 0) {
            losses += 1;
            grossLossR += Math.abs(r);
        }
    }
    return {
        trades: trades.length,
        wins,
        losses,
        winRate: trades.length ? wins / trades.length : 0,
        totalR,
        expectancyR: trades.length ? totalR / trades.length : 0,
        profitFactor: grossLossR > 0 ? grossWinR / grossLossR : null,
        maxDrawdownR,
    };
}

function simulatePortfolio(symbols, tradesBySymbol) {
    const candidates = symbols
        .flatMap((symbol) => tradesBySymbol.get(symbol) || [])
        .map((trade) => {
            const costPipsApplied = tradeCostPips(trade);
            return { ...trade, costPipsApplied, pnlRNet: costAdjustedR(trade, costPipsApplied) };
        })
        .sort((a, b) => Date.parse(a.entryTimestamp) - Date.parse(b.entryTimestamp) || a.symbol.localeCompare(b.symbol));

    let balance = START_CAPITAL;
    let peak = START_CAPITAL;
    let maxDrawdownAbs = 0;
    let maxDrawdownPct = 0;
    let openUntil = 0;
    let marginAdjustedTrades = 0;
    let skippedNoConversion = 0;
    let effectiveRiskPctSum = 0;
    let costPipsSum = 0;
    let overnightTradeCount = 0;
    let overnightDaysSum = 0;
    let holdBarsSum = 0;
    const accepted = [];
    const symbolCounts = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));

    for (const trade of candidates) {
        const entryMs = Date.parse(trade.entryTimestamp);
        if (entryMs <= openUntil) continue;
        const model = positionModel(balance, trade, trade.pnlRNet);
        if (!model) {
            skippedNoConversion += 1;
            continue;
        }
        if (model.riskScale < 0.999) marginAdjustedTrades += 1;
        effectiveRiskPctSum += model.effectiveRiskPct;
        costPipsSum += trade.costPipsApplied;
        const nights = overnightDays(trade);
        if (nights > 0) overnightTradeCount += 1;
        overnightDaysSum += nights;
        holdBarsSum += Number(trade.holdBars || 0);
        balance += model.pnlEur;
        peak = Math.max(peak, balance);
        const dd = peak - balance;
        maxDrawdownAbs = Math.max(maxDrawdownAbs, dd);
        maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? dd / peak : 0);
        openUntil = Date.parse(trade.exitTimestamp);
        symbolCounts[trade.symbol] = (symbolCounts[trade.symbol] || 0) + 1;
        accepted.push({ ...trade, ...model, balanceAfter: balance });
    }

    const summary = summarizeTrades(accepted);
    return {
        symbols,
        trades: accepted,
        summary,
        startCapital: START_CAPITAL,
        endCapital: balance,
        pnl: balance - START_CAPITAL,
        returnPct: (balance - START_CAPITAL) / START_CAPITAL,
        maxDrawdownAbs,
        maxDrawdownPct,
        marginAdjustedTrades,
        skippedNoConversion,
        avgEffectiveRiskPct: accepted.length ? effectiveRiskPctSum / accepted.length : 0,
        avgCostPips: accepted.length ? costPipsSum / accepted.length : 0,
        overnightTradeCount,
        overnightDaysSum,
        avgHoldBars: accepted.length ? holdBarsSum / accepted.length : 0,
        symbolCounts,
    };
}

function mondayWeekKey(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    date.setUTCHours(0, 0, 0, 0);
    return date.toISOString().slice(0, 10);
}

function weeklyTable(result) {
    const weeks = new Map();
    for (const trade of result.trades) {
        const key = mondayWeekKey(trade.entryTimestamp);
        if (!weeks.has(key)) {
            weeks.set(key, {
                weekStart: key,
                symbols: new Set(),
                startEUR: trade.balanceAfter - trade.pnlEur,
                endEUR: trade.balanceAfter - trade.pnlEur,
                trades: [],
                peak: trade.balanceAfter - trade.pnlEur,
                maxDrawdownAbs: 0,
                maxDrawdownPct: 0,
                marginAdjustedTrades: 0,
                effectiveRiskPctSum: 0,
                costPipsSum: 0,
                overnightTradeCount: 0,
                overnightDaysSum: 0,
                holdBarsSum: 0,
            });
        }
        const week = weeks.get(key);
        week.symbols.add(trade.symbol);
        week.endEUR = trade.balanceAfter;
        week.peak = Math.max(week.peak, trade.balanceAfter);
        const dd = week.peak - trade.balanceAfter;
        week.maxDrawdownAbs = Math.max(week.maxDrawdownAbs, dd);
        week.maxDrawdownPct = Math.max(week.maxDrawdownPct, week.peak > 0 ? dd / week.peak : 0);
        if (trade.riskScale < 0.999) week.marginAdjustedTrades += 1;
        week.effectiveRiskPctSum += trade.effectiveRiskPct;
        week.costPipsSum += trade.costPipsApplied || 0;
        const nights = overnightDays(trade);
        if (nights > 0) week.overnightTradeCount += 1;
        week.overnightDaysSum += nights;
        week.holdBarsSum += Number(trade.holdBars || 0);
        week.trades.push(trade);
    }
    return [...weeks.values()].map((week) => {
        const summary = summarizeTrades(week.trades);
        return {
            weekStart: week.weekStart,
            pairs: [...week.symbols].sort().join("|"),
            startEUR: round(week.startEUR, 2),
            endEUR: round(week.endEUR, 2),
            pnlEUR: round(week.endEUR - week.startEUR, 2),
            returnPct: round(((week.endEUR / week.startEUR) - 1) * 100, 2),
            trades: summary.trades,
            wins: summary.wins,
            losses: summary.losses,
            winRatePct: round(summary.winRate * 100, 2),
            netRAfterCost: round(summary.totalR, 2),
            expectancyR: round(summary.expectancyR, 3),
            profitFactor: round(summary.profitFactor, 2),
            maxDrawdownR: round(summary.maxDrawdownR, 2),
            weekMaxDdEUR: round(week.maxDrawdownAbs, 2),
            weekMaxDdPct: round(week.maxDrawdownPct * 100, 2),
            avgEffectiveRiskPct: round((week.effectiveRiskPctSum / Math.max(1, week.trades.length)) * 100, 3),
            avgCostPips: round(week.costPipsSum / Math.max(1, week.trades.length), 3),
            overnightTrades: week.overnightTradeCount,
            overnightDays: week.overnightDaysSum,
            avgHoldBars: round(week.holdBarsSum / Math.max(1, week.trades.length), 2),
            marginAdjustedTrades: week.marginAdjustedTrades,
        };
    });
}

function combinations(items, size) {
    const out = [];
    function visit(start, combo) {
        if (combo.length === size) {
            out.push([...combo]);
            return;
        }
        for (let index = start; index <= items.length - (size - combo.length); index += 1) {
            combo.push(items[index]);
            visit(index + 1, combo);
            combo.pop();
        }
    }
    visit(0, []);
    return out;
}

function candidateConfigs() {
    if (GRID_MODE === "deep") return deepCandidateConfigs();
    const configs = [];
    const push = (overrides) =>
        configs.push(
            createHigherLowLowerHighConfig({
                setupMode: "aggressive",
                pivotWindow: 2,
                signalMode: "simple",
                entryMode: "entry_on_close",
                stopVariant: "signal_candle_extreme_with_buffer_2pip",
                exitVariant: "time_exit_3",
                timeframe: TIMEFRAME,
                maxSignalWaitBars: 14,
                entryBreakMaxBars: 3,
                minStopDistancePips: 2,
                dailyForcedCloseUTC: true,
                entryCutoffMinuteUTC: 23 * 60 + 30,
                maxStopPips: 12,
                avoidHoursUTC: [],
                ...overrides,
            }),
        );

    push({ pivotWindow: 2, signalMode: "simple", entryMode: "entry_on_close", stopVariant: "signal_candle_extreme_with_buffer_2pip", exitVariant: "time_exit_3", maxStopPips: 12 });
    push({ pivotWindow: 3, signalMode: "simple", entryMode: "entry_on_close", stopVariant: "signal_candle_extreme_with_buffer_2pip", exitVariant: "time_exit_3", maxStopPips: 12 });
    push({ pivotWindow: 2, signalMode: "simple", entryMode: "entry_on_close", stopVariant: "signal_candle_extreme_with_buffer_2pip", exitVariant: "fixed_r_4", maxStopPips: 12 });
    push({ pivotWindow: 3, signalMode: "simple", entryMode: "entry_on_close", stopVariant: "signal_candle_extreme_with_buffer_2pip", exitVariant: "fixed_r_4", maxStopPips: 12 });
    push({ pivotWindow: 2, signalMode: "strict", entryMode: "entry_on_break", stopVariant: "signal_candle_extreme_with_buffer_2pip", exitVariant: "fixed_r_2", maxStopPips: 18 });
    push({ pivotWindow: 2, signalMode: "strict", entryMode: "entry_on_break", stopVariant: "signal_candle_extreme_with_range_buffer_40", exitVariant: "fixed_r_2", maxStopPips: 18 });
    push({ pivotWindow: 2, signalMode: "strict", entryMode: "entry_on_break", stopVariant: "signal_candle_extreme_with_range_buffer_25", exitVariant: "fixed_r_3", maxStopPips: 25, setupMode: "confirmed" });
    push({ pivotWindow: 2, signalMode: "simple", entryMode: "entry_on_break", stopVariant: "signal_candle_extreme_with_buffer_1pip", exitVariant: "fixed_r_4", maxStopPips: 18 });
    push({ pivotWindow: 2, signalMode: "simple", entryMode: "entry_on_break", stopVariant: "signal_candle_extreme_with_buffer_1pip", exitVariant: "time_exit_3", maxStopPips: 18 });
    push({ pivotWindow: 3, signalMode: "simple", entryMode: "entry_on_close", stopVariant: "signal_candle_extreme_with_buffer_1pip", exitVariant: "time_exit_3", maxStopPips: 12 });

    const byId = new Map();
    for (const config of configs) byId.set(`${scenarioId(config)}|${config.maxStopPips}|${config.maxSignalWaitBars}`, config);
    return [...byId.values()];
}

function deepCandidateConfigs() {
    const configs = [];
    const setupModes = ["aggressive", "confirmed"];
    const pivotWindows = [2, 3];
    const signalModes = ["simple", "strict"];
    const entryModes = ["entry_on_close", "entry_on_break"];
    const stopVariants = [
        "signal_candle_extreme_with_buffer_2pip",
        "signal_candle_extreme_with_range_buffer_40",
        "structure_pivot_with_buffer_2pip",
    ];
    const exitVariants = [
        "fixed_r_2",
        "fixed_r_3",
        "fixed_r_4",
        "time_exit_3",
        "time_exit_8",
        "adaptive_trail_1r_0_5",
        "adaptive_trail_1r_1",
        "adaptive_trail_2r_1",
    ];
    const waitBars = [8, 14];
    const breakBars = [3];
    const maxStopPipsOptions = [12, 18];
    const dailyModes = [
        { dailyForcedCloseUTC: true, entryCutoffMinuteUTC: 23 * 60 + 30, holdingMode: "daily_flat" },
        { dailyForcedCloseUTC: false, entryCutoffMinuteUTC: 23 * 60 + 30, holdingMode: "overnight_cutoff_2330" },
    ];

    for (const setupMode of setupModes) {
        for (const pivotWindow of pivotWindows) {
            for (const signalMode of signalModes) {
                for (const entryMode of entryModes) {
                    for (const stopVariant of stopVariants) {
                        for (const exitVariant of exitVariants) {
                            for (const maxSignalWaitBars of waitBars) {
                                for (const entryBreakMaxBars of breakBars) {
                                    if (entryMode === "entry_on_close" && entryBreakMaxBars !== 3) continue;
                                    for (const maxStopPips of maxStopPipsOptions) {
                                        for (const dailyMode of dailyModes) {
                                            configs.push(
                                                createHigherLowLowerHighConfig({
                                                    setupMode,
                                                    pivotWindow,
                                                    signalMode,
                                                    entryMode,
                                                    stopVariant,
                                                    exitVariant,
                                                    timeframe: TIMEFRAME,
                                                    maxSignalWaitBars,
                                                    entryBreakMaxBars,
                                                    minStopDistancePips: 2,
                                                    dailyForcedCloseUTC: dailyMode.dailyForcedCloseUTC,
                                                    entryCutoffMinuteUTC: dailyMode.entryCutoffMinuteUTC,
                                                    holdingMode: dailyMode.holdingMode,
                                                    maxStopPips,
                                                    avoidHoursUTC: [],
                                                }),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    const byId = new Map();
    for (const config of configs) byId.set(JSON.stringify(config), config);
    return [...byId.values()];
}

function csv(rows) {
    if (!rows.length) return "";
    const keys = Object.keys(rows[0]);
    return [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

const configs = candidateConfigs();
const top = [];

for (const config of configs) {
    const id = `${scenarioId(config)}|${config.holdingMode || (config.dailyForcedCloseUTC ? "daily_flat" : "overnight")}|cutoff${config.entryCutoffMinuteUTC ?? "none"}|wait${config.maxSignalWaitBars}|break${config.entryBreakMaxBars}|maxStop${config.maxStopPips}`;
    const tradesBySymbol = new Map(SYMBOLS.map((symbol) => [symbol, runFastScenario(symbol, config)]));
    const viableSymbols = SYMBOLS.filter((symbol) => (tradesBySymbol.get(symbol) || []).length >= 30)
        .map((symbol) => {
            const quick = summarizeTrades((tradesBySymbol.get(symbol) || []).map((trade) => ({ ...trade, pnlRNet: costAdjustedR(trade, tradeCostPips({ ...trade, symbol })) })));
            return { symbol, score: quick.totalR + quick.expectancyR * 25 - quick.maxDrawdownR * 0.8 };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SYMBOLS_PER_CONFIG)
        .map((item) => item.symbol);
    const portfolios = PORTFOLIO_SIZES.flatMap((size) => combinations(viableSymbols, size));
    let bestForConfig = null;
    for (const symbols of portfolios) {
        const result = simulatePortfolio(symbols, tradesBySymbol);
        if (result.summary.trades < 30) continue;
        if (symbols.some((symbol) => Number(result.symbolCounts?.[symbol] || 0) < 10)) continue;
        if (!bestForConfig || result.endCapital > bestForConfig.endCapital) bestForConfig = result;
    }
    if (bestForConfig) {
        top.push({ configId: id, config, ...bestForConfig });
        top.sort((a, b) => b.endCapital - a.endCapital);
        top.length = Math.min(top.length, 30);
    }
    console.log(`${id} best=${bestForConfig?.symbols?.join(",") || "none"} end=${round(bestForConfig?.endCapital, 2)} trades=${bestForConfig?.summary?.trades || 0}`);
}

const best = top[0];
const weekly = weeklyTable(best);
const report = {
    generatedAt: new Date().toISOString(),
    assumptions: {
        timeframe: TIMEFRAME,
        startCapital: START_CAPITAL,
        compoundRiskPct: RISK_PCT,
        maxOpenPositions: 1,
        marginCapPct: MARGIN_CAP_PCT,
        leverageUsdPairs: 30,
        leverageCrossPairs: 20,
        costModel: COST_MODEL,
        fixedRoundTripCostPips: COST_MODEL === "fixed" ? COST_PIPS : null,
        decisionLogSpreadStat: COST_MODEL === "decision_logs" ? SPREAD_STAT : null,
        fallbackSpreadPips: COST_MODEL === "decision_logs" ? FALLBACK_SPREAD_PIPS : null,
        slippagePipsPerSide: COST_MODEL === "decision_logs" ? SLIPPAGE_PIPS_PER_SIDE : null,
        overnightCostPipsPerNight: OVERNIGHT_COST_PIPS_PER_NIGHT,
        gridMode: GRID_MODE,
        maxSymbolsPerConfig: MAX_SYMBOLS_PER_CONFIG,
        decisionLogSpreadStats: Object.fromEntries(Object.entries(DECISION_LOG_SPREAD_STATS).map(([symbol, stats]) => [symbol, { ...stats, avg: round(stats.avg, 3) }])),
        appliedSpreadSources: Object.fromEntries(SYMBOLS.map((symbol) => [symbol, spreadStatsForSymbol(symbol).source])),
        swap: "zero because daily forced close is enabled",
        dailyFlat: "entries blocked after 23:30 UTC; forced close on UTC day rollover",
    },
    best: {
        configId: best.configId,
        config: best.config,
        symbols: best.symbols,
        summary: {
            trades: best.summary.trades,
            wins: best.summary.wins,
            losses: best.summary.losses,
            winRatePct: round(best.summary.winRate * 100, 2),
            netRAfterCost: round(best.summary.totalR, 2),
            expectancyR: round(best.summary.expectancyR, 3),
            profitFactor: round(best.summary.profitFactor, 2),
            maxDrawdownR: round(best.summary.maxDrawdownR, 2),
            startCapital: START_CAPITAL,
            endCapital: round(best.endCapital, 2),
            pnl: round(best.pnl, 2),
            returnPct: round(best.returnPct * 100, 2),
            maxDrawdownAbs: round(best.maxDrawdownAbs, 2),
            maxDrawdownPct: round(best.maxDrawdownPct * 100, 2),
            marginAdjustedTrades: best.marginAdjustedTrades,
            avgEffectiveRiskPct: round(best.avgEffectiveRiskPct * 100, 3),
            avgCostPips: round(best.avgCostPips, 3),
            overnightTradeCount: best.overnightTradeCount,
            overnightDaysSum: best.overnightDaysSum,
            avgHoldBars: round(best.avgHoldBars, 2),
            symbolCounts: best.symbolCounts,
        },
        weekly,
    },
    topPortfolios: top.map((item) => ({
        configId: item.configId,
        symbols: item.symbols,
        trades: item.summary.trades,
        winRatePct: round(item.summary.winRate * 100, 2),
        netRAfterCost: round(item.summary.totalR, 2),
        profitFactor: round(item.summary.profitFactor, 2),
        endCapital: round(item.endCapital, 2),
        returnPct: round(item.returnPct * 100, 2),
        maxDrawdownPct: round(item.maxDrawdownPct * 100, 2),
        avgEffectiveRiskPct: round(item.avgEffectiveRiskPct * 100, 3),
        avgCostPips: round(item.avgCostPips, 3),
        overnightTradeCount: item.overnightTradeCount,
        overnightDaysSum: item.overnightDaysSum,
        avgHoldBars: round(item.avgHoldBars, 2),
    })),
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const costLabel = COST_MODEL === "fixed" ? `cost${String(COST_PIPS).replace(".", "p")}` : `${COST_MODEL}_${SPREAD_STAT}_slip${String(SLIPPAGE_PIPS_PER_SIDE).replace(".", "p")}`;
const base = `pa_hllh_m15_portfolio_${GRID_MODE}_${costLabel}_overnight${String(OVERNIGHT_COST_PIPS_PER_NIGHT).replace(".", "p")}_${stamp}`;
const jsonPath = path.join(REPORT_DIR, `${base}.json`);
const weeklyPath = path.join(REPORT_DIR, `${base}.weekly.csv`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(weeklyPath, csv(weekly));
console.log(JSON.stringify({ jsonPath, weeklyPath, best: report.best.summary, symbols: report.best.symbols, configId: report.best.configId }, null, 2));
