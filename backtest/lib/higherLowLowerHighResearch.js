import fs from "fs";
import path from "path";
import {
    candleRange,
    closeLocation,
    createHigherLowLowerHighConfig,
    detectLocalPivots,
    isBearish,
    isBullish,
    normalizeRows,
    pipSizeForSymbol,
    signalPasses,
    toNum,
} from "./strategies/higherLowLowerHigh.js";
import {
    buildExitReasonDistribution,
    buildLosingStreakStats,
    buildRDistribution,
    buildStopDistanceStats,
    buildTradeDiagnostics,
    monthlyBreakdown,
    scoreScenario,
    summarizeTrades,
} from "./reporting/higherLowLowerHighMetrics.js";
import { simulatePriceActionTradeScenario } from "./simulators/priceActionTradeSimulator.js";

export const DEFAULT_DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
const DAY_MS = 24 * 60 * 60 * 1000;

export function round(value, digits = 6) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

export function loadDatasetRows({ dataDir = DEFAULT_DATA_DIR, symbol, timeframe }) {
    const filePath = path.join(dataDir, `${symbol}_${timeframe}.jsonl`);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    return normalizeRows(raw.split("\n").filter(Boolean).map((line) => JSON.parse(line)));
}

export function sliceLastDays(rows, days = 90) {
    if (!rows.length) return { rows: [], from: null, to: null };
    const endTs = rows[rows.length - 1].tsMs;
    const startTs = endTs - Math.max(1, Number(days || 90)) * DAY_MS;
    const sliced = rows.filter((row) => row.tsMs >= startTs && row.tsMs <= endTs);
    return {
        rows: sliced,
        from: new Date(startTs).toISOString(),
        to: new Date(endTs).toISOString(),
    };
}

export function runScenario(rows, config, meta = {}) {
    return simulatePriceActionTradeScenario(rows, config, meta);
}

export function buildScenarioGrid() {
    const scenarios = [];
    const setupModes = ["aggressive", "confirmed"];
    const pivotWindows = [2, 3];
    const signalModes = ["simple", "strict"];
    const entryModes = ["entry_on_close", "entry_on_break"];
    const stopVariants = [
        "signal_candle_extreme",
        "signal_candle_extreme_with_buffer_1pip",
        "signal_candle_extreme_with_buffer_2pip",
        "signal_candle_extreme_with_small_atr",
    ];
    const exitVariants = [
        "two_signal_candles_size",
        "fixed_r_1_5",
        "fixed_r_2",
        "fixed_r_3",
        "time_exit_2",
        "time_exit_3",
        "time_exit_4",
    ];

    for (const setupMode of setupModes) {
        for (const pivotWindow of pivotWindows) {
            for (const signalMode of signalModes) {
                for (const entryMode of entryModes) {
                    for (const stopVariant of stopVariants) {
                        for (const exitVariant of exitVariants) {
                            scenarios.push(
                                createHigherLowLowerHighConfig({
                                    setupMode,
                                    pivotWindow,
                                    signalMode,
                                    entryMode,
                                    stopVariant,
                                    exitVariant,
                                    maxSignalWaitBars: pivotWindow + 8,
                                    entryBreakMaxBars: 3,
                                    realismStopThresholdPips: 2,
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

function fingerprintWithoutStop(config) {
    return [
        config.setupMode,
        config.pivotWindow,
        config.signalMode,
        config.entryMode,
        config.exitVariant,
    ].join("|");
}

function compareTradeRescues(baseTrades, bufferTrades) {
    const baseByKey = new Map(baseTrades.map((trade) => [trade.key, trade]));
    const bufferByKey = new Map(bufferTrades.map((trade) => [trade.key, trade]));
    let rescued = 0;
    let bufferMadeWorse = 0;

    for (const [key, baseTrade] of baseByKey.entries()) {
        const bufferedTrade = bufferByKey.get(key);
        if (!bufferedTrade) continue;
        const baseIsStop = String(baseTrade.exitReason || "").startsWith("stop_loss");
        const bufferIsStop = String(bufferedTrade.exitReason || "").startsWith("stop_loss");
        if (baseIsStop && !bufferIsStop && Number(bufferedTrade.pnlR || 0) > Number(baseTrade.pnlR || 0)) rescued += 1;
        if (!baseIsStop && bufferIsStop && Number(bufferedTrade.pnlR || 0) < Number(baseTrade.pnlR || 0)) bufferMadeWorse += 1;
    }

    return { rescued, bufferMadeWorse };
}

export function analyzeBufferImpact(results) {
    const grouped = new Map();
    for (const result of results) {
        const key = fingerprintWithoutStop(result.config);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(result);
    }

    const comparisons = [];
    const targets = [
        "signal_candle_extreme_with_buffer_1pip",
        "signal_candle_extreme_with_buffer_2pip",
        "signal_candle_extreme_with_small_atr",
    ];

    for (const targetStop of targets) {
        let compared = 0;
        let improved = 0;
        let worsened = 0;
        let deltaTotalR = 0;
        let deltaExpectancyR = 0;
        let deltaProfitFactor = 0;
        let rescued = 0;
        let bufferMadeWorse = 0;

        for (const group of grouped.values()) {
            const noBuffer = group.find((item) => item.config.stopVariant === "signal_candle_extreme");
            const target = group.find((item) => item.config.stopVariant === targetStop);
            if (!noBuffer || !target) continue;
            compared += 1;
            const totalRDelta = Number(target.summary.totalR || 0) - Number(noBuffer.summary.totalR || 0);
            const expectancyDelta = Number(target.summary.expectancyR || 0) - Number(noBuffer.summary.expectancyR || 0);
            const pfDelta = Number(target.summary.profitFactor || 0) - Number(noBuffer.summary.profitFactor || 0);
            deltaTotalR += totalRDelta;
            deltaExpectancyR += expectancyDelta;
            deltaProfitFactor += pfDelta;
            if (totalRDelta > 0) improved += 1;
            if (totalRDelta < 0) worsened += 1;
            const tradeImpact = compareTradeRescues(noBuffer.trades, target.trades);
            rescued += tradeImpact.rescued;
            bufferMadeWorse += tradeImpact.bufferMadeWorse;
        }

        comparisons.push({
            stopVariant: targetStop,
            comparedScenarios: compared,
            improvedScenarios: improved,
            worsenedScenarios: worsened,
            avgDeltaTotalR: compared ? deltaTotalR / compared : null,
            avgDeltaExpectancyR: compared ? deltaExpectancyR / compared : null,
            avgDeltaProfitFactor: compared ? deltaProfitFactor / compared : null,
            rescuedTrades: rescued,
            bufferMadeWorse,
        });
    }

    return comparisons;
}

export function summarizeTimeframe(results) {
    const summaries = results.map((item) => ({
        symbol: item.symbol,
        timeframe: item.timeframe,
        bestScenarioId: item.best.scenarioId,
        bestConfig: item.best.config,
        ...item.best.summary,
    }));
    const profitable = summaries.filter((item) => Number(item.totalR || 0) > 0);
    return {
        cases: summaries.length,
        profitableCases: profitable.length,
        summaries,
        avgExpectancyR: summaries.length
            ? summaries.reduce((sum, item) => sum + Number(item.expectancyR || 0), 0) / summaries.length
            : null,
        avgProfitFactor: summaries.length
            ? summaries.reduce((sum, item) => sum + Number(item.profitFactor || 0), 0) / summaries.length
            : null,
    };
}

export function summarizeSymbol(results) {
    const byTimeframe = results.map((item) => ({
        timeframe: item.timeframe,
        bestScenarioId: item.best.scenarioId,
        bestConfig: item.best.config,
        ...item.best.summary,
    }));
    const ranked = [...results].sort((a, b) => b.best.score - a.best.score);
    return {
        symbol: results[0]?.symbol || null,
        bestTimeframe: ranked[0]?.timeframe || null,
        bestScenarioId: ranked[0]?.best?.scenarioId || null,
        byTimeframe,
    };
}

export {
    buildExitReasonDistribution,
    buildLosingStreakStats,
    buildRDistribution,
    buildStopDistanceStats,
    buildTradeDiagnostics,
    candleRange,
    closeLocation,
    createHigherLowLowerHighConfig,
    detectLocalPivots,
    isBearish,
    isBullish,
    monthlyBreakdown,
    normalizeRows,
    pipSizeForSymbol,
    scoreScenario,
    signalPasses,
    summarizeTrades,
    toNum,
};
