import fs from "fs";
import path from "path";
import { EXIT_PROFILE_DEFINITIONS } from "./exitProfiles.js";
import { MANAGEMENT_PROFILE_DEFINITIONS } from "./managementProfiles.js";
import { enforceLiveResearchRiskGuards, RISK_PROFILE_DEFINITIONS } from "./riskProfiles.js";
import {
    appendIntradayResult,
    baselineCandidate,
    ensureIntradayDirs,
    INTRADAY_REPORT_DIR,
    parseArgs,
    resolveIntradaySymbols,
    runIntradayExperiment,
    saveIntradayCandidate,
} from "./runIntradayExperiment.js";
import { generateIntradayReport } from "./runIntradayReport.js";

function rng(seed) {
    let value = Number(seed || 20260505) >>> 0;
    return function next() {
        value += 0x6d2b79f5;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(next, values) {
    return values[Math.floor(next() * values.length)];
}

function maybe(next, probability = 0.5) {
    return next() < probability;
}

function buildStrategyFamily(index, next) {
    const family = pick(next, [
        "hllh_continuation",
        "opening_range_breakout",
        "donchian_breakout",
        "ema_trend_pullback",
        "momentum_continuation",
        "mean_reversion_intraday",
        "liquidity_sweep_reversal",
        "volatility_squeeze_breakout",
        "session_momentum",
        "simple_baseline",
    ]);
    const common = { family };
    if (family === "hllh_continuation") {
        return {
            ...common,
            setupMode: pick(next, ["aggressive", "confirmed"]),
            pivotWindow: pick(next, [1, 2, 3]),
            signalMode: pick(next, ["simple", "strict"]),
            stopVariant: pick(next, ["signal_candle_extreme_with_buffer_1pip", "signal_candle_extreme_with_buffer_2pip", "structure_pivot_with_buffer_2pip"]),
            maxSignalWaitBars: pick(next, [4, 6, 8, 10, 12]),
        };
    }
    if (family === "opening_range_breakout") {
        return {
            ...common,
            session: pick(next, ["asian", "london", "ny"]),
            rangeMinutes: pick(next, [15, 30, 60]),
            breakoutBufferPips: pick(next, [0.5, 1, 1.5, 2, 3]),
            falseBreakFilter: pick(next, ["none", "close_outside"]),
            maxEntriesPerSession: pick(next, [1, 2]),
            onlyTradeFirstBreakout: maybe(next, 0.75),
        };
    }
    if (family === "donchian_breakout") {
        return {
            ...common,
            lookbackBars: pick(next, [8, 12, 20, 32]),
            atrFilter: maybe(next),
            minAtrPct: pick(next, [0, 0.00035, 0.0005, 0.0008]),
            trendFilter: pick(next, ["none", "ema20_50"]),
        };
    }
    if (family === "ema_trend_pullback") {
        return {
            ...common,
            emaFast: pick(next, [8, 13, 20]),
            emaSlow: pick(next, [20, 34, 50]),
            pullbackDepth: pick(next, ["touch_fast", "between_fast_slow"]),
            confirmationMode: pick(next, ["close_reclaim", "strong_candle"]),
        };
    }
    if (family === "momentum_continuation") {
        return {
            ...common,
            impulseAtrMultiplier: pick(next, [1, 1.25, 1.5, 2, 2.5]),
            followThroughBars: pick(next, [1, 2, 3]),
            avoidAfterTooLargeCandle: maybe(next, 0.65),
        };
    }
    if (family === "mean_reversion_intraday") {
        return {
            ...common,
            rsiLow: pick(next, [20, 25, 30]),
            rsiHigh: pick(next, [70, 75, 80]),
            bollingerDeviation: pick(next, [1.8, 2, 2.2]),
            maxTrendStrength: pick(next, [0.003, 0.005, 0.008]),
            target: pick(next, ["ema20", "bb_middle"]),
        };
    }
    if (family === "liquidity_sweep_reversal") {
        return {
            ...common,
            sweepBufferPips: pick(next, [0.5, 1, 1.5, 2, 3]),
            rejectionCandleMode: pick(next, ["close_back_inside", "wick_reject"]),
            confirmationBars: pick(next, [0, 1, 2]),
        };
    }
    if (family === "volatility_squeeze_breakout") {
        return {
            ...common,
            compressionLookback: pick(next, [12, 20, 32, 48]),
            breakoutBufferPips: pick(next, [0.5, 1, 1.5, 2]),
            maxCompressionAtr: pick(next, [3.5, 4, 5, 6]),
            atrExpansion: pick(next, [1.05, 1.1, 1.2, 1.35]),
        };
    }
    if (family === "session_momentum") {
        return {
            ...common,
            session: pick(next, ["london", "ny"]),
            minAtrPct: pick(next, [0, 0.00035, 0.0005]),
            trendFilter: pick(next, ["ema8_20", "ema20_50"]),
        };
    }
    return {
        ...common,
        subtype: pick(next, ["ema_cross", "rsi_mean_reversion", "breakout_baseline"]),
        lookbackBars: pick(next, [8, 12, 20]),
    };
}

function buildExitProfile(next) {
    const kind = pick(next, Object.keys(EXIT_PROFILE_DEFINITIONS));
    const common = {
        kind,
        stopModel: pick(next, ["candle", "atr", "fixed_pips"]),
        stopAtrMultiplier: pick(next, [0.8, 1, 1.2, 1.5, 2]),
        stopPips: pick(next, [6, 8, 10, 12, 15, 20]),
        minStopPips: pick(next, [1.5, 2, 3]),
        maxStopPips: pick(next, [12, 18, 25, 35]),
        noOvernight: true,
    };
    if (kind === "fixed_r") return { ...common, tpR: pick(next, [1, 1.5, 2, 3, 5]) };
    if (kind === "partial_take_profit") {
        return {
            ...common,
            tpR: pick(next, [3, 5, 8]),
            partialAtR: pick(next, [0.5, 1, 1.5]),
            partialClosePct: pick(next, [0.3, 0.5, 0.7]),
            moveStopToBreakevenAfterPartial: maybe(next, 0.8),
            runnerTrail: pick(next, ["r_trail", "atr_trail", "ema_trail"]),
        };
    }
    if (kind === "breakeven_after_r") return { ...common, tpR: pick(next, [1.5, 2, 3, 5]), breakevenR: pick(next, [0.5, 0.8, 1, 1.5]) };
    if (kind === "adaptive_r_trail") return { ...common, tpR: pick(next, [3, 5, 8, null]), activationR: pick(next, [0.5, 0.8, 1, 1.5, 2]), trailR: pick(next, [0.4, 0.6, 0.8, 1, 1.5]), breakevenR: pick(next, [0.5, 0.8, 1, 1.2]) };
    if (kind === "atr_trailing") return { ...common, tpR: pick(next, [3, 5, 8, null]), activateAfterR: pick(next, [0.5, 1, 1.5, 2]), atrMultiplier: pick(next, [1, 1.5, 2, 3]) };
    if (kind === "candle_low_high_trail") return { ...common, tpR: pick(next, [3, 5, null]), activateAfterR: pick(next, [0.5, 1, 1.5]), lookbackBars: pick(next, [1, 2, 3, 5]) };
    if (kind === "ema_exit") return { ...common, tpR: pick(next, [2, 3, 5]), emaPeriod: pick(next, [8, 13, 20, 34]) };
    if (kind === "momentum_decay_exit") return { ...common, tpR: pick(next, [2, 3, 5]), minProfitR: pick(next, [0.5, 1, 1.5]), decayBars: pick(next, [1, 2, 3]) };
    if (kind === "time_based_exit") return { ...common, tpR: pick(next, [1.5, 2, 3, 5]), maxHoldBars: pick(next, [4, 8, 12, 24, 48, 96]) };
    return { ...common, tpR: pick(next, [3, 5, 8]), reachedR: pick(next, [1, 1.5, 2, 3]), givebackPct: pick(next, [0.3, 0.4, 0.5, 0.6]) };
}

function buildManagementProfile(next) {
    const kind = pick(next, Object.keys(MANAGEMENT_PROFILE_DEFINITIONS));
    if (kind === "fast_cut") return { kind, adverseBars: pick(next, [1, 2, 3]), maxAdverseR: pick(next, [0.4, 0.6, 0.8]) };
    if (kind === "protect_profit") return { kind, minProfitR: pick(next, [0.8, 1, 1.5, 2]), givebackPct: pick(next, [0.35, 0.45, 0.6]) };
    if (kind === "momentum_watch") return { kind, minProfitR: pick(next, [0.5, 1, 1.5]), closeAgainstBars: pick(next, [1, 2, 3]) };
    if (kind === "session_flat") return { kind, closeBeforeSessionEndMinutes: pick(next, [15, 30, 60]), maxHoldBars: pick(next, [12, 24, 48]) };
    if (kind === "daily_flat") return { kind, closeMinuteUTC: pick(next, [20 * 60 + 45, 21 * 60, 21 * 60 + 30]), maxHoldBars: pick(next, [24, 48, 96]) };
    return { kind: "passive", maxHoldBars: pick(next, [12, 24, 48, 96]) };
}

function buildRiskProfile(next) {
    const safeProfiles = Object.values(RISK_PROFILE_DEFINITIONS).map((profile) => enforceLiveResearchRiskGuards(profile));
    const base = { ...pick(next, safeProfiles) };
    base.riskPerTrade = pick(next, [0.01, 0.02, 0.03]);
    base.maxPositions = 1;
    return enforceLiveResearchRiskGuards(base);
}

function buildCandidate(index, next) {
    return {
        label: `intraday_${String(index).padStart(5, "0")}`,
        strategyFamily: buildStrategyFamily(index, next),
        entryProfile: {
            signalTimeframe: "M15",
            executionTimeframe: pick(next, ["M5", "M1"]),
            entryMode: pick(next, ["next_open", "lower_tf_pullback", "lower_tf_breakout", "lower_tf_momentum_confirm"]),
            entryWindowBars: pick(next, [3, 6, 9, 12]),
            pullbackPips: pick(next, [1, 2, 3, 4]),
            breakoutBufferPips: pick(next, [0.3, 0.5, 1, 1.5]),
            momentumAtrMultiplier: pick(next, [0.35, 0.45, 0.6, 0.8]),
            stopBufferPips: pick(next, [0.5, 1, 1.5, 2]),
        },
        exitProfile: buildExitProfile(next),
        managementProfile: buildManagementProfile(next),
        riskProfile: buildRiskProfile(next),
        notes: "Intraday lab candidate: M15 signal + lower-timeframe entry + exit + management + risk.",
    };
}

function scoreKey(mode) {
    if (mode === "maxProfit") return "maxProfit";
    if (mode === "profitWithControl") return "profitWithControl";
    if (mode === "stable") return "stable";
    return "aggressiveIntraday";
}

function metric(result, key) {
    return Number(result?.metrics?.[key] ?? -Infinity);
}

function score(result, key) {
    return Number(result?.scores?.[key] ?? result?.score ?? -Infinity);
}

function beats(current, result, getter) {
    if (!result) return false;
    if (!current) return true;
    return getter(result) > getter(current);
}

const args = parseArgs();
const mode = String(args.mode || "aggressiveIntraday");
const selectedKey = scoreKey(mode);
const minutes = Number(args.minutes || 30);
const maxExperiments = Number(args.maxExperiments || 100000);
const days = Number(args.days || 90);
const seed = Number(args.seed || 20260505);
const symbols = resolveIntradaySymbols(args.symbols);
const next = rng(seed);
const startedAt = Date.now();
const deadline = startedAt + Math.max(1, minutes) * 60_000;
const runId = new Date().toISOString().replace(/[:.]/g, "-");

ensureIntradayDirs();

const leaders = {
    selectedScore: null,
    endCapital: null,
    rawPnl: null,
    aggressiveIntraday: null,
    maxProfit: null,
    dd40: null,
    dd60: null,
    dd80: null,
    highRiskProfit: null,
    byFamily: {},
    byExit: {},
};
const kept = [];

function record(name, result, subdir, tag) {
    const candidatePath = saveIntradayCandidate(result, { subdir, tag });
    const stored = { ...result, candidatePath };
    leaders[name] = stored;
    kept.push(stored);
    kept.sort((a, b) => score(b, selectedKey) - score(a, selectedKey));
    kept.length = Math.min(kept.length, 50);
}

function recordNested(group, key, result, subdir, tag) {
    const current = leaders[group][key];
    if (!beats(current, result, (item) => metric(item, "endCapital"))) return;
    const candidatePath = saveIntradayCandidate(result, { subdir, tag: `${tag}-${key}` });
    leaders[group][key] = { ...result, candidatePath };
}

function consider(result) {
    if (beats(leaders.selectedScore, result, (item) => score(item, selectedKey))) record("selectedScore", result, mode, `best-${selectedKey}`);
    if (beats(leaders.endCapital, result, (item) => metric(item, "endCapital"))) record("endCapital", result, mode, "best-endCapital");
    if (beats(leaders.rawPnl, result, (item) => metric(item, "rawPnl"))) record("rawPnl", result, mode, "best-rawPnl");
    if (beats(leaders.aggressiveIntraday, result, (item) => score(item, "aggressiveIntraday"))) record("aggressiveIntraday", result, "aggressiveIntraday", "best-aggressiveIntraday");
    if (beats(leaders.maxProfit, result, (item) => score(item, "maxProfit"))) record("maxProfit", result, "maxProfit", "best-maxProfit");
    if (metric(result, "maxDrawdownPct") < 40 && beats(leaders.dd40, result, (item) => metric(item, "endCapital"))) record("dd40", result, "profitWithControl", "best-maxDD-lt40");
    if (metric(result, "maxDrawdownPct") < 60 && beats(leaders.dd60, result, (item) => metric(item, "endCapital"))) record("dd60", result, "aggressiveIntraday", "best-maxDD-lt60");
    if (metric(result, "maxDrawdownPct") < 80 && beats(leaders.dd80, result, (item) => metric(item, "endCapital"))) record("dd80", result, "high-risk", "best-maxDD-lt80");
    if (metric(result, "rawPnl") > 0 && metric(result, "maxDrawdownPct") >= 40 && beats(leaders.highRiskProfit, result, (item) => metric(item, "endCapital"))) record("highRiskProfit", result, "high-risk", "best-high-risk-profit");
    recordNested("byFamily", result.strategyFamily, result, "family", "best-family");
    recordNested("byExit", result.exitProfile.kind, result, "exit", "best-exit");
}

const baseline = runIntradayExperiment({ candidate: baselineCandidate(), symbols, days, mode });
appendIntradayResult(baseline);
saveIntradayCandidate(baseline, { subdir: mode, tag: "baseline" });
consider(baseline);

let completed = 0;
while (Date.now() < deadline && completed < maxExperiments) {
    const candidate = buildCandidate(completed + 1, next);
    const result = runIntradayExperiment({ candidate, symbols, days, mode });
    appendIntradayResult(result);
    consider(result);
    completed += 1;
    if (completed % Number(args.logEvery || 25) === 0) {
        console.log(
            [
                `completed=${completed}`,
                `bestEnd=${leaders.endCapital?.metrics?.endCapital ?? "n/a"}`,
                `bestScore=${leaders.selectedScore ? score(leaders.selectedScore, selectedKey).toFixed(2) : "n/a"}`,
                `last=${result.experimentId}`,
                `family=${result.strategyFamily}`,
                `end=${result.metrics.endCapital}`,
                `dd=${result.metrics.maxDrawdownPct}`,
                `trades=${result.metrics.trades}`,
            ].join("\t"),
        );
    }
}

const summaryPath = path.join(INTRADAY_REPORT_DIR, `intraday_search_${runId}.json`);
const summary = {
    generatedAt: new Date().toISOString(),
    seed,
    mode,
    selectedKey,
    minutes,
    elapsedMinutes: (Date.now() - startedAt) / 60_000,
    completed,
    symbols,
    days,
    previousReference: { startCapital: 500, endCapital: 1076.09, experimentId: "search_17764_6887c14e7e41" },
    baseline,
    leaders,
    kept,
};
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
const reportPath = generateIntradayReport({ sourcePath: summaryPath, mode });
console.log(
    JSON.stringify(
        {
            summaryPath,
            reportPath,
            completed,
            mode,
            bestEndCapital: leaders.endCapital?.metrics,
            bestScore: leaders.selectedScore?.metrics,
            previousReference: summary.previousReference,
        },
        null,
        2,
    ),
);
