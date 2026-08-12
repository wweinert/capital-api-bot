import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { discoverSymbols, evaluate, prepare, RESEARCH_PROTOCOL, validateCandidateConfig } from "./prepare.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYMBOLS = ["AUDCAD", "AUDJPY", "AUDUSD", "EURAUD", "EURCHF", "EURGBP", "EURJPY", "EURUSD", "GBPAUD", "GBPCHF", "GBPJPY", "GBPUSD", "NZDJPY", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"];
const MASK = Object.freeze({ FAST_EMA: 1 << 0, SLOW_EMA: 1 << 1, PRICE_EMA: 1 << 2, MACD: 1 << 3, EMA_SLOPE: 1 << 4 });

export const PROTOCOL = Object.freeze({
  ...RESEARCH_PROTOCOL,
  schemaVersion: 15,
  train: Object.freeze({ fromWeek: "2026-W07", toWeek: "2026-W19" }),
  validation: Object.freeze({ fromWeek: "2026-W20", toWeek: "2026-W33" }),
  evaluationEndExclusive: "2026-08-11T10:00:00.000Z",
  minimumCoverageEnd: "2026-08-10T00:00:00.000Z",
  lockedTest: "none-available-entire-period-is-inspected-development-evidence",
  primaryMetric: "dailyObjective",
  sizing: "EUR 500 fixed upside and balance-sensitive downside; <=3% position risk, <=15% open risk; 90% margin split across five slots",
  execution: `${RESEARCH_PROTOCOL.execution}; causal London-local Asia/Frankfurt ranges; sweep/rejection then M15 displacement-pullback-resumption; six-hour maximum hold`,
});

const BASE = Object.freeze({
  name: "session-liquidity-sweep",
  signalFamily: "session-liquidity-sweep-displacement-pullback",
  method: "custom",
  rankByScore: true,
  rankAtTimestampLimit: 5,
  signalTimeframe: "M15",
  sessionWindows: [[0, 0]],
  allowedSessions: ["london"],
  entryMode: "signal-breakout",
  pendingOffsetAtr: 0,
  pendingExpiryMinutes: 60,
  stopMode: "event-level",
  stopBufferAtr: 0.05,
  stopATR: 1.5,
  targetMode: "event-level",
  rewardRisk: 1.6,
  riskPct: 0.01,
  marginUtilization: 0.9,
  hold: 360,
  breakEvenR: 0,
  trailATR: 0,
  trailR: 0,
  runnerMode: "none",
  partialRunner: false,
  partialR: 0,
  partialFraction: 0,
  moveStopOnPartial: false,
  cooldown: 60,
  maxDaily: 1,
  maxPositions: 5,
  maxLossesPerSymbolDay: 1,
  maxLossesPerSymbolSession: 1,
  weekdaysOnly: true,
  dailyFlat: false,
  dailyCloseMinuteUtc: 1440,
});

const PATTERNS = Object.freeze([
  { key: "loose", maxSweepAgeMinutes: 180, maxPullbackBars: 6, minSweepDepthAtr: 0,
    minImpulseAtr: 0.5, minSwingGapAtr: 0, minRetrace: 0.10, maxRetrace: 0.95, minSignalBodyAtr: 0, maxSpreadAtr: 0.20, minRangeR: 0.75 },
  { key: "balanced", maxSweepAgeMinutes: 135, maxPullbackBars: 4, minSweepDepthAtr: 0.03,
    minImpulseAtr: 0.75, minSwingGapAtr: 0.10, minRetrace: 0.20, maxRetrace: 0.85, minSignalBodyAtr: 0.10, maxSpreadAtr: 0.15, minRangeR: 1.0 },
  { key: "prominent", maxSweepAgeMinutes: 90, maxPullbackBars: 4, minSweepDepthAtr: 0.08,
    minImpulseAtr: 1.25, minSwingGapAtr: 0.25, minRetrace: 0.25, maxRetrace: 0.75, minSignalBodyAtr: 0.20, maxSpreadAtr: 0.10, minRangeR: 1.25 },
]);
const SOURCES = Object.freeze([{ key: "asia", prefix: "AsiaSweep" }, { key: "frankfurt", prefix: "FrankfurtSweep" }]);
const TRENDS = Object.freeze([{ key: "none", mode: "none" }, { key: "h1-swing", mode: "h1-swing" }, { key: "h1-ema-macd", mode: "h1-ema-macd" }]);
const EXITS = Object.freeze([
  { key: "opposite-range", targetMode: "event-level", rewardRisk: 1.6 },
  { key: "fixed-1.6r", targetMode: "fixed-r", rewardRisk: 1.6 },
]);

function trendPass(event, side, mode) {
  if (mode === "none") return true;
  if (mode === "h1-swing") return Boolean(event[`${side}H1PullbackStructure`]);
  const mask = event[`${side}H1Mask`] ?? 0;
  const emaVotes = [MASK.FAST_EMA, MASK.SLOW_EMA, MASK.PRICE_EMA, MASK.EMA_SLOPE].filter((bit) => mask & bit).length;
  return emaVotes >= 3 && Boolean(mask & MASK.MACD);
}

export function decide(event, side, config) {
  const prefix = config.sweepPrefix;
  if (!(event.londonLocalMinute >= 8 * 60 && event.londonLocalMinute < 12 * 60)) return false;
  if (!event[`${side}${prefix}`] || !event[`${side}M15PriceAction`]) return false;
  const age = event[`${side}${prefix}AgeMinutes`], rejectionAge = event[`${side}${prefix.replace("Sweep", "Rejection")}AgeMinutes`];
  const depth = event[`${side}${prefix}DepthAtr`];
  if (!(Number.isFinite(age) && age >= 0 && age <= config.maxSweepAgeMinutes &&
        Number.isFinite(rejectionAge) && rejectionAge >= 0 && rejectionAge <= config.maxSweepAgeMinutes &&
        Number.isFinite(depth) && depth >= config.minSweepDepthAtr)) return false;
  const impulse = event[`${side}M15ImpulseAtr`], gap = event[`${side}M15SwingGapAtr`];
  const retrace = event[`${side}M15Retrace`], body = event[`${side}M15SignalBodyAtr`];
  if (!(event[`${side}M15PullbackBars`] <= config.maxPullbackBars && impulse >= config.minImpulseAtr &&
        gap >= config.minSwingGapAtr && retrace >= config.minRetrace && retrace <= config.maxRetrace &&
        body >= config.minSignalBodyAtr && event.M15SpreadAtr <= config.maxSpreadAtr && trendPass(event, side, config.trendMode))) return false;
  if (config.targetMode === "event-level") {
    const entry = side === "buy" ? event.M15SignalAskHigh : event.M15SignalLow;
    const stop = event[`${side}${prefix}Stop`] + (side === "buy" ? -1 : 1) * config.stopBufferAtr * event.M15SignalAtr;
    const target = event[`${side}${prefix}Target`];
    const risk = side === "buy" ? entry - stop : stop - entry;
    const reward = side === "buy" ? target - entry : entry - target;
    if (!(risk > 0 && reward / risk >= config.minRangeR)) return false;
  }
  return true;
}

export function rank(event, side, config) {
  const prefix = config.sweepPrefix;
  const trendBonus = config.trendMode === "none" ? 0 : 10;
  return trendBonus + 10 * event[`${side}M15ImpulseAtr`] + 6 * event[`${side}M15SwingGapAtr`] +
    4 * event[`${side}${prefix}DepthAtr`] - 20 * event.M15SpreadAtr;
}

function candidate(name, source, pattern, trend, exit, overrides = {}) {
  return { ...BASE, name, ...pattern, ...exit, sweepPrefix: source.prefix, stopEventPrefix: source.prefix,
    targetEventPrefix: source.prefix, sourceKey: source.key, patternKey: pattern.key, trendKey: trend.key,
    exitKey: exit.key, trendMode: trend.mode, decide, rank, ...overrides };
}

function serializable(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== "function")); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function fingerprint(value) { return sha256(JSON.stringify(serializable(value))); }
function trainScore(result) {
  const train = result.folds.train;
  return train.positiveWeekPct + 4 * train.totalR / Math.max(train.weeks, 1) + Math.min(train.entries, 50) / 10 - train.maxDrawdownR;
}
function summarize(result, value) {
  return { name: value.name, candidateSha256: fingerprint(value), objective: result.objective, qualified: result.qualified,
    finalBalance: result.finalBalance, returnPct: result.returnPct, profitFactor: result.profitFactor, entries: result.entries,
    maxDrawdownR: result.development.maxDrawdownR, maxDrawdownPct: result.maxDDPct, risk: result.risk,
    train: result.folds.train, validation: result.folds.validation, dailyFolds: result.dailyFolds,
    gates: result.gates, recent: result.recent, symbolStats: result.symbolStats, sessionStats: result.sessionStats };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dataset") options.dataset = argv[++i];
    else if (argv[i] === "--report") options.report = argv[++i];
    else if (argv[i] === "--check") options.check = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dataset) throw new Error("Pass --dataset.");
  const datasetDir = path.resolve(options.dataset), available = discoverSymbols(datasetDir);
  const missing = SYMBOLS.filter((symbol) => !available.includes(symbol));
  if (missing.length) throw new Error(`Missing complete six-timeframe data: ${missing.join(", ")}`);
  const preparedAt = performance.now();
  const prepared = prepare(datasetDir, SYMBOLS, { protocol: PROTOCOL, strictWindow: true });
  const evaluatorSha256 = sha256(fs.readFileSync(path.join(HERE, "prepare.js")));
  const datasetFingerprint = sha256(JSON.stringify(prepared.coverage));
  const searchSpace = [];
  for (const source of SOURCES) for (const pattern of PATTERNS) for (const trend of TRENDS) for (const exit of EXITS) {
    searchSpace.push(candidate(`global-${source.key}-${pattern.key}-${trend.key}-${exit.key}`, source, pattern, trend, exit, { symbols: SYMBOLS }));
  }
  validateCandidateConfig(searchSpace[0]);
  if (options.check) {
    console.log(JSON.stringify({ ok: true, protocol: PROTOCOL, evaluatorSha256, datasetFingerprint,
      available, preparedEvents: prepared.events.length, searchSpace: searchSpace.length }, null, 2));
    return;
  }
  const started = performance.now(), records = [];
  for (const value of searchSpace) {
    const result = evaluate(prepared, value);
    records.push({ candidate: serializable(value), trainScore: +trainScore(result).toFixed(4), summary: summarize(result, value) });
  }
  // Freeze the common rule on train only, then ask which symbols contributed
  // on train. Validation never participates in either choice.
  records.sort((a, b) => b.trainScore - a.trainScore);
  const best = records[0].candidate;
  const source = SOURCES.find((item) => item.key === best.sourceKey), pattern = PATTERNS.find((item) => item.key === best.patternKey);
  const trend = TRENDS.find((item) => item.key === best.trendKey), exit = EXITS.find((item) => item.key === best.exitKey);
  const pairRecords = SYMBOLS.map((symbol) => {
    const value = candidate(`pair-${symbol}-${source.key}-${pattern.key}-${trend.key}-${exit.key}`, source, pattern, trend, exit,
      { symbols: [symbol], maxPositions: 1, rankAtTimestampLimit: 1 });
    const result = evaluate(prepared, value);
    return { symbol, candidate: serializable(value), trainScore: +trainScore(result).toFixed(4), summary: summarize(result, value) };
  }).sort((a, b) => b.trainScore - a.trainScore);
  const selectedPairs = pairRecords.filter((item) => item.summary.train.totalR > 0 && item.summary.train.positiveWeekPct >= 50 && item.summary.train.entries >= 12)
    .slice(0, 5).map((item) => item.symbol);
  const commonRuleRiskRuns = [0.01, 0.03].map((riskPct) => {
    const value = candidate(`common-train-rule-risk-${100 * riskPct}`, source, pattern, trend, exit,
      { symbols: SYMBOLS, riskPct, maxPositions: 5, rankAtTimestampLimit: 5 });
    return { candidate: serializable(value), summary: summarize(evaluate(prepared, value), value) };
  });
  const portfolioRuns = [];
  for (const riskPct of [0.01, 0.03]) {
    if (!selectedPairs.length) break;
    const value = candidate(`train-selected-portfolio-risk-${100 * riskPct}`, source, pattern, trend, exit,
      { symbols: selectedPairs, riskPct, maxPositions: 5, rankAtTimestampLimit: 5 });
    portfolioRuns.push({ candidate: serializable(value), summary: summarize(evaluate(prepared, value), value) });
  }
  const output = {
    generatedAt: new Date().toISOString(), protocol: PROTOCOL,
    specification: {
      ranges: "Asia 00:00-07:00 and Frankfurt 07:00-08:00 Europe/London; entries 08:00-12:00 Europe/London",
      signal: "range boundary sweep and close back inside; M15 directional displacement, 1-6 candle correction, first resumption candle",
      entry: "60-minute pending order at executable M15 resumption-candle extreme",
      stop: "beyond the recorded sweep extreme plus 0.05 M15 ATR",
      exits: "opposite source-range boundary or the video's explicit 1.6R control; six-hour time exit",
      risk: "EUR 500; search at 1%; requested 3% rerun; <=3% position and <=15% portfolio risk; five margin slots",
    },
    metadata: { evaluatorSha256, datasetFingerprint, coverage: prepared.coverage, preparedEvents: prepared.events.length,
      preparationSeconds: +((started - preparedAt) / 1000).toFixed(1), searchSeconds: +((performance.now() - started) / 1000).toFixed(1),
      searchSpace: searchSpace.length, exhaustive: true },
    limitations: [
      "Every evaluated date is already-inspected development evidence; there is no fresh locked test.",
      "The author chooses supply/demand, order-block, and volume-profile zones visually. Session boundaries are the only reproducible zone proxy in this experiment.",
      "Tick volume in FX is not centralized traded volume, so the discretionary volume-profile node was not used as a causal entry filter.",
      "Pair selection and common parameters use train only; validation is walk-forward evidence, not an external holdout.",
      "Recorded bid/ask and conservative SL-first M1 replay are used, but slippage, gaps, financing, broker minimum size/distance, and holidays remain unmodeled.",
    ],
    bestTrainRule: records[0], commonRuleRiskRuns, selectedPairs, pairRecords, portfolioRuns, records,
  };
  if (options.report) {
    const report = path.resolve(options.report);
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`report: ${report}`);
  }
  console.log(JSON.stringify({ metadata: output.metadata, bestTrainRule: output.bestTrainRule,
    commonRuleRiskRuns, selectedPairs, portfolioRuns }, null, 2));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`session sweep research failed: ${error.stack ?? error.message}`); process.exitCode = 1; }
}
