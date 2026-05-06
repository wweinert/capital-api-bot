import crypto from "crypto";
import fs from "fs";
import path from "path";
import { ANALYSIS, HLLH_SYMBOL_PROFILES } from "../config.js";
import {
    createHigherLowLowerHighConfig,
    createHigherLowLowerHighState,
    normalizeRows,
    pipSizeForSymbol,
    prepareHigherLowLowerHighContext,
    advanceHigherLowLowerHighDetector,
} from "../backtest/lib/strategies/higherLowLowerHigh.js";
import {
    buildPendingEntry,
    buildTradeFromSignal,
    closeTrade,
    maybeActivatePendingEntry,
    maybeCloseTrade,
    maybeRejectSmallStop,
    scenarioId,
    shouldDailyForceClose,
} from "../backtest/lib/simulators/priceActionTradeCore.js";
import { loadDatasetRows, round } from "../backtest/lib/higherLowLowerHighResearch.js";
import { summarizeTrades } from "../backtest/lib/reporting/higherLowLowerHighMetrics.js";
import { buildPenalties, rejectionReasonFor, riskFlagsFor, scoreExperiment, scoreSet } from "./scoreExperiment.js";

export const RESEARCH_DIR = path.join(process.cwd(), "research");
export const CANDIDATE_DIR = path.join(RESEARCH_DIR, "candidates");
export const REPORT_DIR = path.join(RESEARCH_DIR, "reports");
export const RESULTS_PATH = path.join(RESEARCH_DIR, "results.tsv");
export const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
export const PRICE_LOG_DIR = path.join(process.cwd(), "backtest", "prices");
export const TRADE_LOG_DIR = path.join(process.cwd(), "backtest", "logs");
export const TIMEFRAME = "M15";
export const START_CAPITAL = 500;
export const RISK_PCT = 0.03;
export const MARGIN_CAP_PCT = 0.7;

const TSV_COLUMNS = [
    "timestamp",
    "experimentId",
    "configHash",
    "symbols",
    "dateRange",
    "strategyName",
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
    "notes",
    "rejectionReason",
];
const SPREAD_STATS_CACHE = new Map();

export function ensureResearchDirs() {
    fs.mkdirSync(CANDIDATE_DIR, { recursive: true });
    for (const name of ["robust", "balanced", "aggressive", "max-profit", "high-risk"]) {
        fs.mkdirSync(path.join(CANDIDATE_DIR, name), { recursive: true });
    }
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    if (!fs.existsSync(RESULTS_PATH)) {
        fs.writeFileSync(RESULTS_PATH, `${TSV_COLUMNS.join("\t")}\n`);
    }
}

export function parseArgs(argv = process.argv.slice(2)) {
    const args = {};
    for (const item of argv) {
        if (!item.startsWith("--")) continue;
        const [key, rawValue] = item.slice(2).split("=");
        args[key] = rawValue === undefined ? true : rawValue;
    }
    return args;
}

export function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

export function configHash(config) {
    return crypto.createHash("sha256").update(stableStringify(config)).digest("hex").slice(0, 12);
}

export function liveSymbols() {
    const fromAnalysis = Array.isArray(ANALYSIS?.SYMBOLS) ? ANALYSIS.SYMBOLS : [];
    return fromAnalysis.length ? fromAnalysis : Object.keys(HLLH_SYMBOL_PROFILES).filter((symbol) => HLLH_SYMBOL_PROFILES[symbol]?.enabled);
}

export function baselineOverrides() {
    return {
        label: "baseline_live_config",
        overrides: {},
        changedKnobs: 0,
        notes: "Current live HLLH symbol profiles from config.js",
    };
}

export function resolveSymbols(input) {
    if (!input) return liveSymbols();
    return String(input)
        .split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean);
}

export function mergeProfile(symbol, overrides = {}) {
    const base = HLLH_SYMBOL_PROFILES[symbol] || {};
    const mergedManagementProfile = {
        ...(base.managementProfile || {}),
        ...(overrides.managementProfile || {}),
    };
    return createHigherLowLowerHighConfig({
        ...base,
        ...overrides,
        managementProfile: mergedManagementProfile,
    });
}

export function loadRowsBySymbol({ symbols = liveSymbols(), days = 90 } = {}) {
    const out = new Map();
    let globalFrom = null;
    let globalTo = null;
    for (const symbol of symbols) {
        const rows = loadDatasetRows({ dataDir: DATA_DIR, symbol, timeframe: TIMEFRAME });
        if (!rows.length) {
            out.set(symbol, []);
            continue;
        }
        const end = rows[rows.length - 1].tsMs;
        const start = end - Math.max(1, Number(days || 90)) * 86_400_000;
        const sliced = rows.filter((row) => row.tsMs >= start && row.tsMs <= end);
        if (sliced[0]?.tsMs) globalFrom = globalFrom === null ? sliced[0].tsMs : Math.min(globalFrom, sliced[0].tsMs);
        if (sliced.at(-1)?.tsMs) globalTo = globalTo === null ? sliced.at(-1).tsMs : Math.max(globalTo, sliced.at(-1).tsMs);
        out.set(symbol, sliced);
    }
    return {
        rowsBySymbol: out,
        dateRange: {
            from: globalFrom ? new Date(globalFrom).toISOString() : null,
            to: globalTo ? new Date(globalTo).toISOString() : null,
            days,
        },
    };
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
    const cutoff = config.entryCutoffMinuteUTC === null || config.entryCutoffMinuteUTC === undefined ? 23 * 60 + 30 : Number(config.entryCutoffMinuteUTC);
    if (Number.isFinite(cutoff) && minuteOfDayUTC(ts) >= cutoff) return true;
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

export function runSymbolScenario(symbol, rows, config) {
    const context = prepareHigherLowLowerHighContext(normalizeRows(rows), config);
    const state = createHigherLowLowerHighState(config);
    const pipSize = pipSizeForSymbol(symbol);
    const trades = [];
    const simulationStats = {
        breakEntryExpiredCount: 0,
        breakEntryInvalidatedCount: 0,
        stopBelowMinDistanceCount: 0,
    };
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
                    openTrade = trade;
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

    return trades.map((trade) => ({ ...trade, symbol, pipSize, scenarioId: scenarioId(config) }));
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

function spreadStats(symbol) {
    if (SPREAD_STATS_CACHE.has(symbol)) return SPREAD_STATS_CACHE.get(symbol);
    const rows = readJsonl(path.join(PRICE_LOG_DIR, `${symbol}.jsonl`));
    const pipSize = pipSizeForSymbol(symbol);
    const spreads = rows
        .map((row) => {
            const direct = Number(row.spread);
            if (Number.isFinite(direct) && direct >= 0) return direct > pipSize * 20 ? direct : direct / pipSize;
            const bid = Number(row.bid);
            const ask = Number(row.ask);
            if (Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid) return (ask - bid) / pipSize;
            return null;
        })
        .filter((value) => Number.isFinite(value) && value >= 0 && value < 100);
    if (!spreads.length) {
        const fallback = { avg: symbol.includes("JPY") ? 2.5 : 1.5, source: "fallback_static" };
        SPREAD_STATS_CACHE.set(symbol, fallback);
        return fallback;
    }
    const stats = {
        avg: spreads.reduce((sum, value) => sum + value, 0) / spreads.length,
        source: "price_logs",
        samples: spreads.length,
    };
    SPREAD_STATS_CACHE.set(symbol, stats);
    return stats;
}

function tradeCostPips(trade) {
    return spreadStats(trade.symbol).avg;
}

function costAdjustedR(trade) {
    const stopPips = Number(trade.riskDistance) / Number(trade.pipSize);
    if (!(Number.isFinite(stopPips) && stopPips > 0)) return Number(trade.pnlR || 0);
    return Number(trade.pnlR || 0) - tradeCostPips(trade) / stopPips;
}

function rowAtOrBefore(rowsBySymbol, symbol, tsMs) {
    const rows = rowsBySymbol.get(symbol) || [];
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

function syntheticEurQuote(rowsBySymbol, quote, tsMs) {
    if (quote === "EUR") return 1;
    const direct = rowAtOrBefore(rowsBySymbol, `EUR${quote}`, tsMs)?.close;
    if (Number.isFinite(direct) && direct > 0) return direct;
    if (quote === "CAD") {
        const eurusd = rowAtOrBefore(rowsBySymbol, "EURUSD", tsMs)?.close;
        const usdcad = rowAtOrBefore(rowsBySymbol, "USDCAD", tsMs)?.close;
        if (Number.isFinite(eurusd) && Number.isFinite(usdcad)) return eurusd * usdcad;
    }
    if (quote === "NZD") {
        const eurusd = rowAtOrBefore(rowsBySymbol, "EURUSD", tsMs)?.close;
        const nzdusd = rowAtOrBefore(rowsBySymbol, "NZDUSD", tsMs)?.close;
        if (Number.isFinite(eurusd) && Number.isFinite(nzdusd) && nzdusd > 0) return eurusd / nzdusd;
    }
    return null;
}

function leverageForSymbol(symbol) {
    return symbol.includes("USD") ? 30 : 20;
}

function positionModel(balance, trade, pnlRNet, rowsBySymbol) {
    const base = trade.symbol.slice(0, 3);
    const quote = trade.symbol.slice(3, 6);
    const tsMs = Date.parse(trade.entryTimestamp);
    const eurQuote = syntheticEurQuote(rowsBySymbol, quote, tsMs);
    if (!(Number.isFinite(eurQuote) && eurQuote > 0)) return null;

    const riskDistance = Number(trade.riskDistance);
    const entryPrice = Number(trade.entryPrice);
    if (!(Number.isFinite(riskDistance) && riskDistance > 0 && Number.isFinite(entryPrice) && entryPrice > 0)) return null;

    const targetRisk = balance * RISK_PCT;
    const rawUnits = (targetRisk * eurQuote) / riskDistance;
    const notionalEur = base === "EUR" ? rawUnits : (rawUnits * entryPrice) / eurQuote;
    const leverage = leverageForSymbol(trade.symbol);
    const maxMargin = balance * MARGIN_CAP_PCT;
    const rawMargin = notionalEur / leverage;
    const riskScale = rawMargin > maxMargin ? maxMargin / rawMargin : 1;
    const pnlEur = targetRisk * riskScale * pnlRNet;
    return { targetRisk, rawUnits, rawMargin, riskScale, effectiveRiskPct: RISK_PCT * riskScale, pnlEur };
}

export function simulatePortfolio(tradesBySymbol, rowsBySymbol, symbols) {
    const candidates = symbols
        .flatMap((symbol) => tradesBySymbol.get(symbol) || [])
        .map((trade) => ({ ...trade, pnlRNet: costAdjustedR(trade), costPipsApplied: tradeCostPips(trade) }))
        .sort((a, b) => Date.parse(a.entryTimestamp) - Date.parse(b.entryTimestamp) || a.symbol.localeCompare(b.symbol));

    let balance = START_CAPITAL;
    let peak = START_CAPITAL;
    let maxDrawdownAbs = 0;
    let maxDrawdownPct = 0;
    let openUntil = 0;
    let holdBarsSum = 0;
    let skippedNoConversion = 0;
    const accepted = [];
    const symbolCounts = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));

    for (const trade of candidates) {
        const entryMs = Date.parse(trade.entryTimestamp);
        if (entryMs <= openUntil) continue;
        const model = positionModel(balance, trade, trade.pnlRNet, rowsBySymbol);
        if (!model) {
            skippedNoConversion += 1;
            continue;
        }
        balance += model.pnlEur;
        peak = Math.max(peak, balance);
        const drawdown = peak - balance;
        maxDrawdownAbs = Math.max(maxDrawdownAbs, drawdown);
        maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? drawdown / peak : 0);
        openUntil = Date.parse(trade.exitTimestamp);
        holdBarsSum += Number(trade.holdBars || 0);
        symbolCounts[trade.symbol] = (symbolCounts[trade.symbol] || 0) + 1;
        accepted.push({ ...trade, ...model, balanceAfter: balance });
    }

    const summary = summarizeTrades(accepted.map((trade) => ({ ...trade, pnlR: trade.pnlRNet })));
    return {
        trades: accepted,
        summary,
        startCapital: START_CAPITAL,
        endCapital: balance,
        rawPnl: balance - START_CAPITAL,
        maxDrawdownAbs,
        maxDrawdownPct,
        averageHoldBars: accepted.length ? holdBarsSum / accepted.length : 0,
        skippedNoConversion,
        symbolCounts,
    };
}

function actualTradesForToday(symbols, today = new Date().toISOString().slice(0, 10)) {
    const trades = [];
    for (const symbol of symbols) {
        const entries = readJsonl(path.join(TRADE_LOG_DIR, `${symbol}.jsonl`));
        for (const entry of entries) {
            const openedAt = entry.openedAt || entry.timestamp;
            if (String(openedAt || "").slice(0, 10) !== today) continue;
            trades.push({
                symbol,
                dealId: entry.dealId || null,
                signal: entry.signal || null,
                openedAt,
                status: entry.status || null,
                closeReason: entry.closeReason || null,
                normalizedCandidateId: entry.strategyContext?.normalizedCandidateId || null,
            });
        }
    }
    return trades.sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt)));
}

function simulatedTradesForToday(portfolioTrades, today = new Date().toISOString().slice(0, 10)) {
    return portfolioTrades
        .filter((trade) => String(trade.entryTimestamp || "").slice(0, 10) === today)
        .map((trade) => ({
            symbol: trade.symbol,
            side: trade.side,
            entryTimestamp: trade.entryTimestamp,
            exitTimestamp: trade.exitTimestamp,
            exitReason: trade.exitReason,
            pnlRNet: round(trade.pnlRNet, 3),
        }));
}

export function runExperiment({ candidate = baselineOverrides(), symbols = liveSymbols(), days = 90, today = new Date().toISOString().slice(0, 10), mode = "robust" } = {}) {
    const { rowsBySymbol, dateRange } = loadRowsBySymbol({ symbols: [...new Set([...symbols, "EURUSD", "USDCAD", "NZDUSD"])], days });
    const tradesBySymbol = new Map();
    const resolvedConfigs = {};

    for (const symbol of symbols) {
        const config = mergeProfile(symbol, candidate.overrides || {});
        resolvedConfigs[symbol] = config;
        tradesBySymbol.set(symbol, runSymbolScenario(symbol, rowsBySymbol.get(symbol) || [], config));
    }

    const portfolio = simulatePortfolio(tradesBySymbol, rowsBySymbol, symbols);
    const metrics = {
        trades: portfolio.summary.trades,
        winRatePct: round((portfolio.summary.winRate || 0) * 100, 2),
        profitFactor: Number.isFinite(portfolio.summary.profitFactor) ? portfolio.summary.profitFactor : null,
        expectancyR: portfolio.summary.expectancyR,
        maxDrawdownPct: portfolio.maxDrawdownPct * 100,
        startCapital: START_CAPITAL,
        endCapital: portfolio.endCapital,
        rawPnl: portfolio.rawPnl,
        averageHoldBars: portfolio.averageHoldBars,
    };
    const penalties = buildPenalties({
        metrics,
        symbolCounts: portfolio.symbolCounts,
        changedKnobs: candidate.changedKnobs || 0,
    });
    const scores = scoreSet(metrics, penalties);
    const score = scoreExperiment(metrics, penalties, mode);
    const hash = configHash({ symbols, overrides: candidate.overrides || {}, days });
    const experimentId = `${candidate.label || "candidate"}_${hash}`;

    return {
        timestamp: new Date().toISOString(),
        experimentId,
        configHash: hash,
        strategyName: "PA_HIGHER_LOW_LOWER_HIGH",
        symbols,
        dateRange,
        candidate,
        resolvedConfigs,
        metrics: {
            trades: metrics.trades,
            winRate: metrics.winRatePct,
            profitFactor: round(metrics.profitFactor, 3),
            expectancyR: round(metrics.expectancyR, 4),
            maxDrawdownPct: round(metrics.maxDrawdownPct, 2),
            startCapital: START_CAPITAL,
            endCapital: round(metrics.endCapital, 2),
            rawPnl: round(metrics.rawPnl, 2),
            averageHoldBars: round(metrics.averageHoldBars, 2),
        },
        score: round(score, 4),
        scores: {
            robust: round(scores.robust, 4),
            balanced: round(scores.balanced, 4),
            aggressive: round(scores.aggressive, 4),
            maxProfit: round(scores.maxProfit, 4),
        },
        mode,
        riskFlags: riskFlagsFor(metrics),
        penalties,
        rejectionReason: rejectionReasonFor(metrics, penalties),
        symbolCounts: portfolio.symbolCounts,
        todayComparison: {
            date: today,
            simulatedTrades: simulatedTradesForToday(portfolio.trades, today),
            actualTrades: actualTradesForToday(symbols, today),
        },
    };
}

function tsvEscape(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

export function appendResult(result) {
    ensureResearchDirs();
    const row = {
        timestamp: result.timestamp,
        experimentId: result.experimentId,
        configHash: result.configHash,
        symbols: result.symbols.join(","),
        dateRange: `${result.dateRange.from || "unknown"}..${result.dateRange.to || "unknown"}`,
        strategyName: result.strategyName,
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
        notes: result.candidate.notes || "",
        rejectionReason: result.rejectionReason,
    };
    fs.appendFileSync(RESULTS_PATH, `${TSV_COLUMNS.map((key) => tsvEscape(row[key])).join("\t")}\n`);
}

export function saveCandidate(result, { subdir = null, tag = null } = {}) {
    ensureResearchDirs();
    const dir = subdir ? path.join(CANDIDATE_DIR, subdir) : CANDIDATE_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${tag ? `${tag}__` : ""}${result.experimentId}.json`);
    fs.writeFileSync(
        filePath,
        JSON.stringify(
            {
                generatedAt: result.timestamp,
                experimentId: result.experimentId,
                configHash: result.configHash,
                symbols: result.symbols,
                dateRange: result.dateRange,
                candidate: result.candidate,
                resolvedConfigs: result.resolvedConfigs,
                metrics: result.metrics,
                score: result.score,
                scores: result.scores,
                mode: result.mode,
                riskFlags: result.riskFlags,
                penalties: result.penalties,
                rejectionReason: result.rejectionReason,
                symbolCounts: result.symbolCounts,
            },
            null,
            2,
        ),
    );
    return filePath;
}
