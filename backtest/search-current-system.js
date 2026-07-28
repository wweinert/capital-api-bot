import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const BACKTEST = path.join(ROOT, "backtest", "current-system-six-months.js");
const REPORT_DIR = path.join(ROOT, "backtest", "reports", "compare");
const SEARCH_RUNS = Number(process.env.SEARCH_RUNS || 120);
const TARGET_PORTFOLIO = process.env.TARGET_PORTFOLIO || null;
const FORCE_DIRECTION = process.env.FORCE_DIRECTION || null;
const WIDE_STOPS = process.env.WIDE_STOPS === "1";
const SEARCH_TIMEFRAMES = String(process.env.SEARCH_TIMEFRAMES || "M5")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
const TRAIN = {
    start: process.env.TRAIN_START || "2025-12-21T22:00:00.000Z",
    end: process.env.TRAIN_END || "2026-04-01T00:00:00.000Z",
};
const VALIDATION = {
    start: process.env.VALIDATION_START || "2026-04-01T00:00:00.000Z",
    end: process.env.VALIDATION_END || "2026-06-29T12:55:00.000Z",
};
const FULL = { start: TRAIN.start, end: VALIDATION.end };

const portfolios = TARGET_PORTFOLIO
    ? [TARGET_PORTFOLIO]
    : [
    "GBPAUD,EURAUD,EURJPY,GBPUSD",
    "GBPJPY,GBPAUD,EURAUD,GBPUSD,EURJPY,AUDJPY",
    "GBPAUD,EURAUD,EURJPY",
    "GBPAUD,EURAUD,GBPUSD",
    "EURAUD,EURJPY,GBPUSD",
    "GBPAUD,EURAUD",
    "GBPAUD,EURJPY",
    "EURAUD,EURJPY",
    "EURJPY,GBPUSD",
    "GBPAUD",
    "EURAUD",
    "EURJPY",
    "GBPUSD",
      ];

let seed = 6702;
function random() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
}

function pick(values) {
    return values[Math.floor(random() * values.length)];
}

function candidate(index) {
    if (index === 0) {
        return {
            portfolio: portfolios[0],
            sessions: "all",
            riskBasis: "actual",
            executionTimeframe: SEARCH_TIMEFRAMES[0],
            exitMode: "adaptive",
            directionMode: FORCE_DIRECTION || "both",
            reverseSignals: false,
            stopBufferPips: 2,
            maxHoldMinutes: 1440,
            scoreSelection: "score",
            minStopPips: 2,
            maxStopPips: 12,
            activationR: 1,
            trailR: 0.5,
            breakevenR: 1,
            minStopSpreadRatio: 0,
            maxSpreadPips: null,
            minSignalScore: null,
            minBodyRatio: null,
            minStructureSequence: null,
        };
    }

    const activationR = pick([0.5, 0.75, 1, 1.25, 1.5]);
    const minStopPips = pick(WIDE_STOPS ? [10, 15, 20, 25, 30] : [2, 4, 6, 8, 10]);
    const maxStopPips = pick(WIDE_STOPS ? [30, 40, 50, 60, 80] : [12, 16, 20, 24, 30, 40]);
    const exitMode = pick(["adaptive", "fixed", "fixed"]);
    return {
        portfolio: pick(portfolios),
        sessions: pick(["all", "all", "profile"]),
        riskBasis: pick(["actual", "structural"]),
        executionTimeframe: pick(SEARCH_TIMEFRAMES),
        exitMode,
        directionMode: FORCE_DIRECTION || pick(["both", "both", "BUY", "SELL"]),
        reverseSignals: pick([false, false, false, true]),
        stopBufferPips: pick(WIDE_STOPS ? [10, 15, 20, 25, 30] : [2, 3, 5, 8, 10]),
        maxHoldMinutes: pick([60, 120, 240, 480, 1440]),
        scoreSelection: pick(["score", "score", "alphabetical"]),
        minStopPips,
        maxStopPips: Math.max(minStopPips, maxStopPips),
        activationR,
        trailR: pick([0.25, 0.5, 0.75, 1, 1.25]),
        breakevenR: pick([Math.min(activationR, 0.5), Math.min(activationR, 0.75), activationR]),
        takeProfitR: exitMode === "fixed" ? pick([2, 2.5, 3, 4, 5, 6]) : 20,
        minStopSpreadRatio: pick([0, 1.5, 2, 2.5, 3]),
        maxSpreadPips: pick([null, null, 2, 3, 4]),
        minSignalScore: pick([null, null, 10, 20, 30, 40]),
        minBodyRatio: pick([null, null, 0.25, 0.4, 0.55]),
        minStructureSequence: pick([null, null, 1, 2]),
    };
}

function environment(config, period) {
    const env = {
        ...process.env,
        SAVE_REPORT: "0",
        SUMMARY_ONLY: "1",
        START_CAPITAL: "500",
        START_TIMESTAMP: period.start,
        END_TIMESTAMP: period.end,
        PORTFOLIO_SYMBOLS: config.portfolio,
        IGNORE_PROFILE_SESSIONS: config.sessions === "all" ? "1" : "0",
        SIGNAL_ENGINE: "live",
        EXECUTION_TIMEFRAME: config.executionTimeframe,
        SCORE_SELECTION: config.scoreSelection,
        MANAGEMENT_RISK_BASIS: config.riskBasis,
        EXIT_MODE: config.exitMode,
        DIRECTION_MODE: config.directionMode,
        REVERSE_SIGNALS: config.reverseSignals ? "1" : "0",
        STOP_BUFFER_PIPS: String(config.stopBufferPips),
        MAX_HOLD_MINUTES: String(config.maxHoldMinutes),
        MIN_STOP_PIPS: String(config.minStopPips),
        MAX_STOP_PIPS: String(config.maxStopPips),
        ACTIVATION_R: String(config.activationR),
        TRAIL_R: String(config.trailR),
        BREAKEVEN_R: String(config.breakevenR),
        SAFETY_TAKE_PROFIT_R: String(config.takeProfitR ?? 20),
        MIN_STOP_SPREAD_RATIO: String(config.minStopSpreadRatio),
    };

    if (config.maxSpreadPips !== null) env.MAX_SPREAD_PIPS = String(config.maxSpreadPips);
    else delete env.MAX_SPREAD_PIPS;
    if (config.minSignalScore !== null) env.MIN_SIGNAL_SCORE = String(config.minSignalScore);
    else delete env.MIN_SIGNAL_SCORE;
    if (config.minBodyRatio !== null) env.MIN_BODY_RATIO = String(config.minBodyRatio);
    else delete env.MIN_BODY_RATIO;
    if (config.minStructureSequence !== null) env.MIN_STRUCTURE_SEQUENCE = String(config.minStructureSequence);
    else delete env.MIN_STRUCTURE_SEQUENCE;
    return env;
}

function run(config, period) {
    const processResult = spawnSync(process.execPath, [BACKTEST], {
        cwd: ROOT,
        env: environment(config, period),
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
    });
    if (processResult.status !== 0) {
        throw new Error(processResult.stderr || `Backtest failed with code ${processResult.status}`);
    }
    const result = JSON.parse(processResult.stdout);
    return {
        endCapital: result.endCapital,
        returnPct: result.returnPct,
        ...result.summary,
    };
}

function objective(result) {
    if (!result || result.trades < 30 || result.endCapital <= 0) return Number.NEGATIVE_INFINITY;
    const growth = Math.log(result.endCapital / 500);
    const drawdownPenalty = Math.max(0, result.maxDrawdownPct - 35) / 100;
    return growth - drawdownPenalty;
}

const unique = new Map();
for (let index = 0; unique.size < SEARCH_RUNS; index += 1) {
    const config = candidate(index);
    unique.set(JSON.stringify(config), config);
}

const trainingResults = [];
let completed = 0;
for (const config of unique.values()) {
    const training = run(config, TRAIN);
    trainingResults.push({ config, training, trainingObjective: objective(training) });
    completed += 1;
    if (completed % 10 === 0 || completed === unique.size) {
        const best = [...trainingResults].sort((left, right) => right.trainingObjective - left.trainingObjective)[0];
        console.log(
            `[Search] ${completed}/${unique.size} best train end=${best.training.endCapital.toFixed(2)} PF=${Number(best.training.profitFactor || 0).toFixed(2)} DD=${best.training.maxDrawdownPct.toFixed(1)}%`,
        );
    }
}

const finalists = trainingResults
    .filter((item) => Number.isFinite(item.trainingObjective))
    .sort((left, right) => right.trainingObjective - left.trainingObjective)
    .slice(0, 12)
    .map((item) => {
        const validation = run(item.config, VALIDATION);
        const full = run(item.config, FULL);
        const validationObjective = objective(validation);
        return {
            ...item,
            validation,
            full,
            validationObjective,
            robustObjective: Math.min(item.trainingObjective, validationObjective),
        };
    })
    .sort((left, right) => right.robustObjective - left.robustObjective || right.full.endCapital - left.full.endCapital);

const report = {
    generatedAt: new Date().toISOString(),
    searchRuns: unique.size,
    periods: { training: TRAIN, validation: VALIDATION, full: FULL },
    objective: "maximize the weaker of training and validation log-growth after a drawdown penalty; minimum 30 trades",
    best: finalists[0] || null,
    finalists,
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
const output = path.join(REPORT_DIR, `current-system-search-${report.generatedAt.replaceAll(/[:.]/g, "-")}.json`);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, best: report.best }, null, 2));
