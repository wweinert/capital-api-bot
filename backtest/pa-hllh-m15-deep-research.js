import fs from "fs";
import path from "path";
import { HLLH_SYMBOL_PROFILES } from "../config.js";
import {
    createHigherLowLowerHighConfig,
    createHigherLowLowerHighState,
    prepareHigherLowLowerHighContext,
    advanceHigherLowLowerHighDetector,
    pipSizeForSymbol,
} from "./lib/strategies/higherLowLowerHigh.js";
import { loadDatasetRows, round } from "./lib/higherLowLowerHighResearch.js";
import {
    buildPendingEntry,
    buildTradeFromSignal,
    maybeActivatePendingEntry,
    maybeCloseTrade,
    maybeRejectSmallStop,
    closeTrade,
    scenarioId,
    shouldDailyForceClose,
} from "./lib/simulators/priceActionTradeCore.js";
import {
    buildExitReasonDistribution,
    buildLosingStreakStats,
    buildStopDistanceStats,
    summarizeTrades,
} from "./lib/reporting/higherLowLowerHighMetrics.js";

const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
const REPORT_DIR = path.join(process.cwd(), "backtest", "reports", "compare");
const START_CAPITAL = 500;
const RISK_PCT = 0.03;
const MARGIN_CAP_PCT = 0.7;
const LEVERAGE = 30;
const TIMEFRAME = "M15";
const MIN_PATTERN_TRADES = 20;

const symbols = fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(`_${TIMEFRAME}.jsonl`))
    .map((name) => name.slice(0, -`_${TIMEFRAME}.jsonl`.length))
    .sort();

function lastMonths(rows, months = 5) {
    if (!rows.length) return rows;
    const end = rows[rows.length - 1].tsMs;
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - months);
    return rows.filter((row) => row.tsMs >= start.getTime() && row.tsMs <= end);
}

function weekendBlocked(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    return (day === 5 && hour >= 18) || day === 6 || (day === 0 && hour < 22);
}

function minuteOfDayUTC(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function candidateBlocked(candidate, config, symbol, pipSize) {
    const ts = candidate?.signalTimestamp || candidate?.signalRow?.timestamp;
    if (!ts) return true;
    if (weekendBlocked(ts)) return true;
    if (minuteOfDayUTC(ts) >= 23 * 60 + 30) return true;

    const hour = new Date(ts).getUTCHours();
    if (Array.isArray(config.avoidHoursUTC) && config.avoidHoursUTC.map(Number).includes(hour)) return true;

    return false;
}

function tradeBlockedByStop(trade, config, pipSize) {
    const maxStopPips = Number(config.maxStopPips);
    if (!(Number.isFinite(maxStopPips) && maxStopPips > 0)) return false;
    const stopPips = Number(trade?.riskDistance) / pipSize;
    return Number.isFinite(stopPips) && stopPips > maxStopPips;
}

function runFastScenario(rows, config, meta) {
    const context = prepareHigherLowLowerHighContext(rows, config);
    const state = createHigherLowLowerHighState(config);
    const pipSize = pipSizeForSymbol(meta.symbol);
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

        const detectorStep = advanceHigherLowLowerHighDetector({ context, state, index });
        for (const event of detectorStep.events) {
            if (event.type !== "signal_candidate") continue;
            const candidate = event.candidate;
            if (candidateBlocked(candidate, config, meta.symbol, pipSize)) continue;

            if (config.entryMode === "entry_on_close") {
                const trade = buildTradeFromSignal({
                    candidate,
                    entryIndex: index,
                    entryPrice: row.close,
                    config,
                    pipSize,
                });
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

    const summary = summarizeTrades(trades);
    return {
        symbol: meta.symbol,
        timeframe: TIMEFRAME,
        scenarioId: scenarioId(config),
        config,
        summary,
        diagnostics: {
            stopDistanceDistribution: buildStopDistanceStats(trades, meta.symbol, config.realismStopThresholdPips),
            exitReasonDistribution: buildExitReasonDistribution(trades, simulationStats),
            losingStreak: buildLosingStreakStats(trades),
            detectorStats: state.stats,
            simulationStats,
        },
        trades,
        score: scoreCandidate(summary),
    };
}

function scoreCandidate(summary) {
    const trades = Number(summary.trades || 0);
    if (trades < MIN_PATTERN_TRADES) return -1e9 + trades;
    const totalR = Number(summary.totalR || 0);
    const expectancy = Number(summary.expectancyR || 0);
    const pf = Number.isFinite(summary.profitFactor) ? Math.min(summary.profitFactor, 6) : 0;
    const drawdown = Number(summary.maxDrawdownR || 0);
    return totalR + expectancy * 30 + pf * 4 - drawdown * 1.2;
}

function buildBroadGrid() {
    const scenarios = [];
    for (const setupMode of ["aggressive", "confirmed"]) {
        for (const pivotWindow of [2, 3]) {
            for (const signalMode of ["simple", "strict"]) {
                for (const entryMode of ["entry_on_close", "entry_on_break"]) {
                    for (const stopVariant of [
                        "signal_candle_extreme_with_buffer_1pip",
                        "signal_candle_extreme_with_buffer_2pip",
                        "signal_candle_extreme_with_buffer_3pip",
                        "signal_candle_extreme_with_range_buffer_25",
                        "signal_candle_extreme_with_range_buffer_40",
                        "structure_pivot_with_buffer_2pip",
                    ]) {
                        for (const exitVariant of ["fixed_r_1_5", "fixed_r_2", "fixed_r_3", "fixed_r_4", "time_exit_3"]) {
                            scenarios.push(
                                createHigherLowLowerHighConfig({
                                    setupMode,
                                    pivotWindow,
                                    signalMode,
                                    entryMode,
                                    stopVariant,
                                    exitVariant,
                                    timeframe: TIMEFRAME,
                                    maxSignalWaitBars: 11,
                                    entryBreakMaxBars: 3,
                                    minStopDistancePips: 2,
                                    dailyForcedCloseUTC: true,
                                    maxStopPips: null,
                                }),
                            );
                        }
                    }
                }
            }
        }
    }
    return scenarios;
}

function refineGrid(best, profile = {}) {
    const scenarios = [];
    const bases = best.slice(0, 8).map((item) => item.config);
    const avoidHourSets = [[], Array.isArray(profile.avoidHoursUTC) ? profile.avoidHoursUTC : []];
    for (const base of bases) {
        for (const maxSignalWaitBars of [6, 8, 11, 14]) {
            for (const maxStopPips of [12, 18, 25, null]) {
                for (const avoidHoursUTC of avoidHourSets) {
                    scenarios.push(
                        createHigherLowLowerHighConfig({
                            ...base,
                            maxSignalWaitBars,
                            maxStopPips,
                            avoidHoursUTC,
                            dailyForcedCloseUTC: true,
                        }),
                    );
                }
            }
        }
    }
    const byKey = new Map();
    for (const scenario of scenarios) {
        byKey.set(JSON.stringify(scenario), scenario);
    }
    return [...byKey.values()];
}

function capitalCurve(trades, symbol) {
    const ordered = [...trades].sort((a, b) => Date.parse(a.entryTimestamp) - Date.parse(b.entryTimestamp));
    let balance = START_CAPITAL;
    let peak = START_CAPITAL;
    let maxDrawdownAbs = 0;
    let maxDrawdownPct = 0;
    let marginAdjustedTrades = 0;
    let skippedByMargin = 0;

    for (const trade of ordered) {
        const riskDistance = Number(trade.riskDistance);
        const entryPrice = Number(trade.entryPrice);
        if (!(Number.isFinite(riskDistance) && riskDistance > 0 && Number.isFinite(entryPrice) && entryPrice > 0)) continue;

        const riskCash = balance * RISK_PCT;
        const marginPrice = symbol.endsWith("JPY") ? entryPrice / 100 : entryPrice;
        const neededUnits = riskCash / riskDistance;
        const maxUnits = (balance * MARGIN_CAP_PCT * LEVERAGE) / marginPrice;
        const minUnits = 100;
        if (maxUnits < minUnits) {
            skippedByMargin += 1;
            continue;
        }
        const riskScale = Math.min(1, maxUnits / neededUnits);
        if (riskScale < 0.999) marginAdjustedTrades += 1;
        const pnl = Number(trade.pnlR || 0) * riskCash * riskScale;
        balance += pnl;
        peak = Math.max(peak, balance);
        const drawdown = peak - balance;
        maxDrawdownAbs = Math.max(maxDrawdownAbs, drawdown);
        maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? drawdown / peak : 0);
    }

    return {
        startCapital: START_CAPITAL,
        endCapital: balance,
        rawPnl: balance - START_CAPITAL,
        returnPct: (balance - START_CAPITAL) / START_CAPITAL,
        maxDrawdownAbs,
        maxDrawdownPct,
        marginAdjustedTrades,
        skippedByMargin,
    };
}

function mondayWeekKey(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    date.setUTCHours(0, 0, 0, 0);
    return date.toISOString().slice(0, 10);
}

function weeklyBreakdown(trades, symbol) {
    const buckets = new Map();
    for (const trade of trades) {
        const key = mondayWeekKey(trade.entryTimestamp);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(trade);
    }
    return [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, weekTrades]) => ({
            weekStart,
            ...summarizeTrades(weekTrades),
            ...capitalCurve(weekTrades, symbol),
        }));
}

function toRow(result) {
    const s = result.summary;
    const c = capitalCurve(result.trades, result.symbol);
    return {
        symbol: result.symbol,
        scenarioId: result.scenarioId,
        trades: s.trades,
        winRate: round(s.winRate * 100, 2),
        totalR: round(s.totalR, 2),
        expectancyR: round(s.expectancyR, 3),
        profitFactor: round(s.profitFactor, 2),
        maxDrawdownR: round(s.maxDrawdownR, 2),
        endCapital: round(c.endCapital, 2),
        returnPct: round(c.returnPct * 100, 2),
        marginAdjustedTrades: c.marginAdjustedTrades,
        exitStop: result.diagnostics.exitReasonDistribution.stop,
        exitTp: result.diagnostics.exitReasonDistribution.takeProfit,
        exitDaily: result.diagnostics.exitReasonDistribution.other,
    };
}

function csv(rows) {
    if (!rows.length) return "";
    const keys = Object.keys(rows[0]);
    return [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

const broadGrid = buildBroadGrid();
const symbolResults = [];
const topScenarios = [];

for (const symbol of symbols) {
    const rows = lastMonths(loadDatasetRows({ dataDir: DATA_DIR, symbol, timeframe: TIMEFRAME }), 5);
    const broad = broadGrid
        .map((scenario) => runFastScenario(rows, scenario, { symbol }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
    const refined = refineGrid(broad, HLLH_SYMBOL_PROFILES[symbol])
        .map((scenario) => runFastScenario(rows, scenario, { symbol }))
        .sort((a, b) => b.score - a.score);
    const best = refined[0] || broad[0];
    symbolResults.push({ symbol, rows: rows.length, from: rows[0]?.timestamp ?? null, to: rows[rows.length - 1]?.timestamp ?? null, best: toRow(best), bestConfig: best.config });
    topScenarios.push(...refined.slice(0, 5));
    console.log(`${symbol} rows=${rows.length} best=${best.scenarioId} totalR=${round(best.summary.totalR, 2)} trades=${best.summary.trades}`);
}

const ranked = topScenarios.sort((a, b) => {
    const capitalDelta = capitalCurve(b.trades, b.symbol).endCapital - capitalCurve(a.trades, a.symbol).endCapital;
    return Math.abs(capitalDelta) > 1e-9 ? capitalDelta : b.score - a.score;
});
const best = ranked[0];
const bestCapital = capitalCurve(best.trades, best.symbol);
const report = {
    generatedAt: new Date().toISOString(),
    assumptions: {
        timeframe: TIMEFRAME,
        startCapital: START_CAPITAL,
        riskPct: RISK_PCT,
        maxPositions: 1,
        marginCapPct: MARGIN_CAP_PCT,
        leverage: LEVERAGE,
        dailyForcedCloseUTC: true,
        costs: "disabled: no spread, slippage, swap or overnight fees",
        entryTiming: "closed M15 candle; live scheduler aligned to candle close + 5s",
    },
    symbolsTested: symbols.length,
    scenariosBroadPerSymbol: broadGrid.length,
    best: {
        ...toRow(best),
        config: best.config,
        diagnostics: best.diagnostics,
        capital: bestCapital,
        weekly: weeklyBreakdown(best.trades, best.symbol),
    },
    symbolResults: symbolResults.sort((a, b) => b.best.endCapital - a.best.endCapital),
    topScenarios: ranked.slice(0, 30).map((item) => ({ ...toRow(item), config: item.config })),
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonPath = path.join(REPORT_DIR, `pa_hllh_m15_deep_research_${stamp}.json`);
const weeklyPath = path.join(REPORT_DIR, `pa_hllh_m15_deep_research_${stamp}.weekly.csv`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(weeklyPath, csv(report.best.weekly));

console.log(JSON.stringify({ jsonPath, weeklyPath, best: report.best }, null, 2));
