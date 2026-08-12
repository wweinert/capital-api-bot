import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { discoverSymbols, evaluate, prepare, RESEARCH_PROTOCOL, validateCandidateConfig } from "./prepare.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SERIES_SYMBOLS = ["AUDCAD", "AUDJPY", "AUDUSD", "EURAUD", "EURCHF", "EURGBP", "EURJPY", "EURUSD", "GBPAUD", "GBPCHF", "GBPJPY", "GBPUSD", "NZDJPY", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"];
const SESSIONS = ["asia", "london", "overlap", "newYork", "offHours"];

export const PROTOCOL = Object.freeze({
  ...RESEARCH_PROTOCOL,
  schemaVersion: 13,
  train: Object.freeze({ fromWeek: "2026-W07", toWeek: "2026-W19" }),
  validation: Object.freeze({ fromWeek: "2026-W20", toWeek: "2026-W33" }),
  evaluationEndExclusive: "2026-08-11T10:00:00.000Z",
  minimumCoverageEnd: "2026-08-10T00:00:00.000Z",
  lockedTest: "none-available-entire-period-is-inspected-development-evidence",
  primaryMetric: "dailyObjective",
  sizing: "EUR 500 fixed upside and balance-sensitive downside; <=3% position risk, <=15% open risk; 90% margin divided into five equal per-position budgets",
  execution: `${RESEARCH_PROTOCOL.execution}; M15 structural price action, H1 causal trend, spread veto, pending invalidation, 24-hour maximum hold`,
});

const BASE = Object.freeze({
  name: "m15-price-action-h1-portfolio-baseline",
  signalFamily: "m15-impulse-pullback-resumption",
  method: "custom",
  rankByScore: true,
  rankAtTimestampLimit: 1,
  signalTimeframe: "M15",
  sessionWindows: [[0, 0]],
  minAtrPct: null,
  minBbWidthPct: null,
  minEmaDistPct: null,
  entryMode: "signal-breakout",
  riskPct: 0.01,
  marginUtilization: 0.9,
  stopATR: 1.5,
  stopMode: "signal-candle",
  stopBufferAtr: 0.05,
  rewardRisk: 2,
  hold: 1440,
  breakEvenR: 0,
  trailATR: 0,
  trailR: 0,
  runnerMode: "none",
  partialRunner: false,
  partialR: 0,
  partialFraction: 0,
  moveStopOnPartial: false,
  cooldown: 30,
  maxDaily: 3,
  maxPositions: 5,
  maxLossesPerSymbolDay: 3,
  maxLossesPerSymbolSession: 2,
  pendingOffsetAtr: 0,
  pendingExpiryMinutes: 60,
  weekdaysOnly: true,
  dailyFlat: false,
  dailyCloseMinuteUtc: 1440,
});

const MASK = Object.freeze({ FAST_EMA: 1 << 0, SLOW_EMA: 1 << 1, PRICE_EMA: 1 << 2, MACD: 1 << 3, EMA_SLOPE: 1 << 4 });

function trendPass(event, side, config) {
  if (config.trendMode === "none") return true;
  const mask = event[`${side}H1Mask`] ?? 0;
  const emaVotes = [MASK.FAST_EMA, MASK.SLOW_EMA, MASK.PRICE_EMA, MASK.EMA_SLOPE].filter((bit) => mask & bit).length;
  const ema = emaVotes >= 3, macd = Boolean(mask & MASK.MACD);
  const pullback = Boolean(event[`${side}H1PullbackStructure`]);
  const trend = Boolean(event[`${side}H1TrendStructure`]);
  if (config.trendMode === "swing") return pullback;
  if (config.trendMode === "swing-trend") return trend;
  if (config.trendMode === "swing-ema") return pullback && ema;
  if (config.trendMode === "swing-macd") return pullback && macd;
  if (config.trendMode === "swing-ema-macd") return pullback && ema && macd;
  return ema && macd;
}

function activePortfolioProfile(event, config) {
  return config.pairSessionProfiles?.[event.symbol]?.[event.session] ?? null;
}

export function decide(event, side, config) {
  if (config.portfolioMode && !activePortfolioProfile(event, config)) return false;
  if (!event[`${side}M15PriceAction`]) return false;
  const impulse = event[`${side}M15ImpulseAtr`], gap = event[`${side}M15SwingGapAtr`];
  const retrace = event[`${side}M15Retrace`], body = event[`${side}M15SignalBodyAtr`];
  return event[`${side}M15PullbackBars`] <= config.maxPullbackBars &&
    Number.isFinite(impulse) && impulse >= config.minImpulseAtr &&
    Number.isFinite(gap) && gap >= config.minSwingGapAtr &&
    Number.isFinite(retrace) && retrace >= config.minRetrace && retrace <= config.maxRetrace &&
    Number.isFinite(body) && body >= config.minSignalBodyAtr &&
    event.M15SpreadAtr <= config.maxSpreadAtr && trendPass(event, side, config);
}

export function rank(event, side, config) {
  if (config.trendMode === "none") {
    return 12 * event[`${side}M15ImpulseAtr`] + 8 * event[`${side}M15SwingGapAtr`] +
      4 * event[`${side}M15SignalBodyAtr`] - 20 * event.M15SpreadAtr;
  }
  const mask = event[`${side}H1Mask`] ?? 0;
  const indicatorVotes = [MASK.FAST_EMA, MASK.SLOW_EMA, MASK.PRICE_EMA, MASK.MACD, MASK.EMA_SLOPE].filter((bit) => mask & bit).length;
  return 100 * indicatorVotes + 12 * event[`${side}M15ImpulseAtr`] + 8 * event[`${side}M15SwingGapAtr`] +
    4 * event[`${side}M15SignalBodyAtr`] - 20 * event.M15SpreadAtr;
}

const PATTERNS = Object.freeze([
  { key: "loose", maxPullbackBars: 6, minImpulseAtr: 0.5, minSwingGapAtr: 0, minRetrace: 0.10, maxRetrace: 0.95, minSignalBodyAtr: 0, maxSpreadAtr: 1.75 },
  { key: "balanced", maxPullbackBars: 4, minImpulseAtr: 0.75, minSwingGapAtr: 0.10, minRetrace: 0.20, maxRetrace: 0.85, minSignalBodyAtr: 0.10, maxSpreadAtr: 1.50 },
  { key: "prominent", maxPullbackBars: 6, minImpulseAtr: 1.25, minSwingGapAtr: 0.25, minRetrace: 0.25, maxRetrace: 0.75, minSignalBodyAtr: 0.20, maxSpreadAtr: 1.25 },
]);

const TRENDS = Object.freeze([
  { key: "swing", trendMode: "swing" },
  { key: "swing-trend", trendMode: "swing-trend" },
  { key: "swing-ema", trendMode: "swing-ema" },
  { key: "swing-macd", trendMode: "swing-macd" },
  { key: "swing-ema-macd", trendMode: "swing-ema-macd" },
  { key: "ema-macd-control", trendMode: "ema-macd" },
]);

const EXITS = Object.freeze([
  { key: "fixed-2r", runnerMode: "none", breakEvenR: 0, trailATR: 0, partialRunner: false, partialR: 0, partialFraction: 0 },
  { key: "be1-trail-3atr", runnerMode: "always", breakEvenR: 1, trailATR: 3, partialRunner: false, partialR: 0, partialFraction: 0 },
  { key: "fast30-be1-trail-3atr", runnerMode: "fast-1r", runnerFastMinutes: 30, breakEvenR: 1, trailATR: 3, partialRunner: false, partialR: 0, partialFraction: 0 },
  { key: "half-at-2r-runner-3atr", runnerMode: "none", breakEvenR: 0, trailATR: 3, partialRunner: true, partialR: 2, partialFraction: 0.5, moveStopOnPartial: true },
]);

function candidate(name, overrides = {}) {
  return { ...BASE, name, ...overrides, decide, rank };
}

function matrixCandidate(symbol, session, pattern, trend, exit) {
  return candidate(`pair-${session}-${symbol}-${pattern.key}-${trend.key}-${exit.key}`, {
    ...pattern, ...trend, ...exit, patternKey: pattern.key, trendKey: trend.key, exitKey: exit.key,
    symbols: [symbol], allowedSessions: [session], rankAtTimestampLimit: 1,
  });
}

function buildSearchSpace(trends = TRENDS) {
  const values = [];
  // Coverage-first seeds guarantee at least three interpretations for every
  // pair/session before the wider Cartesian refinement begins.
  for (const session of SESSIONS) for (const symbol of SERIES_SYMBOLS) {
    for (const trend of trends.slice(0, Math.min(3, trends.length))) {
      values.push(matrixCandidate(symbol, session, PATTERNS[1], trend, EXITS[0]));
      values.push(matrixCandidate(symbol, session, PATTERNS[0], trend, EXITS[0]));
    }
  }
  for (const session of SESSIONS) for (const symbol of SERIES_SYMBOLS) for (const pattern of PATTERNS) for (const trend of trends) for (const exit of EXITS) {
    values.push(matrixCandidate(symbol, session, pattern, trend, exit));
  }
  for (const pattern of PATTERNS) for (const trend of trends) for (const exit of EXITS) {
    values.push(candidate(`global-${pattern.key}-${trend.key}-${exit.key}`, { ...pattern, ...trend, ...exit,
      patternKey: pattern.key, trendKey: trend.key, exitKey: exit.key, symbols: SERIES_SYMBOLS, rankAtTimestampLimit: 5 }));
  }
  const seen = new Set();
  return values.filter((value) => { const key = fingerprint(value, true); if (seen.has(key)) return false; seen.add(key); return true; });
}

function serializable(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== "function"));
}

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function fingerprint(value, omitName = false) { const copy = serializable(value); if (omitName) delete copy.name; return sha256(JSON.stringify(copy)); }

function summary(result, value) {
  return { name: value.name, candidateSha256: fingerprint(value), objective: result.objective, qualified: result.qualified,
    finalBalance: result.finalBalance, returnPct: result.returnPct, profitFactor: result.profitFactor, entries: result.entries,
    partialExits: result.partialExits, maxDrawdownR: result.maxDrawdownR, maxDrawdownPct: result.maxDDPct,
    risk: result.risk, train: result.folds.train, validation: result.folds.validation, dailyFolds: result.dailyFolds,
    gates: result.gates, recent: result.recent, sessionStats: result.sessionStats };
}

function trainingScore(record) {
  const train = record.summary.train;
  return train.positiveWeekPct + 4 * train.totalR / Math.max(train.weeks, 1) + Math.min(train.entries, 50) / 10;
}

function bestCells(records, exitOnly = null) {
  const selected = new Map();
  for (const record of records) {
    const value = record.candidate;
    if (!value.symbols || value.symbols.length !== 1 || !value.allowedSessions || (exitOnly && value.exitKey !== exitOnly)) continue;
    const key = `${value.allowedSessions[0]}:${value.symbols[0]}`;
    const current = selected.get(key);
    if (!current || trainingScore(record) > trainingScore(current)) selected.set(key, record);
  }
  return [...selected.values()];
}

function selectSessionProfiles(cells, requireTrainingGate) {
  const selected = {};
  for (const session of SESSIONS) {
    const eligible = cells.filter((record) => record.candidate.allowedSessions[0] === session && (!requireTrainingGate || (
      record.summary.train.totalR > 0 && record.summary.train.positiveWeekPct >= 50 && record.summary.train.entries >= 12
    ))).sort((a, b) => trainingScore(b) - trainingScore(a)).slice(0, 5);
    selected[session] = eligible;
  }
  return selected;
}

function profileMap(selection) {
  const output = {};
  for (const [session, records] of Object.entries(selection)) for (const record of records) {
    const symbol = record.candidate.symbols[0], profile = serializable(record.candidate);
    for (const key of ["name", "symbols", "allowedSessions", "riskPct", "marginUtilization", "maxPositions", "rankAtTimestampLimit", "pairSessionProfiles", "portfolioMode"]) delete profile[key];
    output[symbol] ??= {}; output[symbol][session] = profile;
  }
  return output;
}

function portfolioCandidate(name, selection, riskPct) {
  const pairSessionProfiles = profileMap(selection);
  const symbols = [...new Set(Object.values(selection).flat().map((record) => record.candidate.symbols[0]))];
  return candidate(name, { ...PATTERNS[1], ...TRENDS[5], ...EXITS[0], portfolioMode: true, pairSessionProfiles, symbols,
    riskPct, maxPositions: 5, rankAtTimestampLimit: 5, maxDaily: 3 });
}

function portfolioSelectionSummary(selection) {
  return Object.fromEntries(Object.entries(selection).map(([session, records]) => [session, records.map((record) => ({
    symbol: record.candidate.symbols[0], pattern: record.candidate.patternKey, trend: record.candidate.trendKey,
    exit: record.candidate.exitKey, trainingScore: +trainingScore(record).toFixed(3), train: record.summary.train,
    validation: record.summary.validation, profitFactor: record.summary.profitFactor, returnPct: record.summary.returnPct,
  }))]));
}

function parseArgs(argv) {
  const options = { searchSeconds: 1200, check: false, m15Only: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dataset") options.dataset = argv[++i];
    else if (argv[i] === "--report") options.report = argv[++i];
    else if (argv[i] === "--search-seconds") options.searchSeconds = Number(argv[++i]);
    else if (argv[i] === "--check") options.check = true;
    else if (argv[i] === "--m15-only") options.m15Only = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return options;
}

function preflight(datasetDir, trends = TRENDS) {
  const available = discoverSymbols(datasetDir), missing = SERIES_SYMBOLS.filter((symbol) => !available.includes(symbol));
  if (missing.length) throw new Error(`Missing complete six-timeframe data: ${missing.join(", ")}`);
  validateCandidateConfig(candidate("preflight", { ...PATTERNS[1], ...trends[0], ...EXITS[0] }));
  return available;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dataset) throw new Error("Pass --dataset.");
  const trends = options.m15Only ? [{ key: "m15-only", trendMode: "none" }] : TRENDS;
  const protocol = options.m15Only ? Object.freeze({
    ...PROTOCOL,
    schemaVersion: 14,
    execution: `${RESEARCH_PROTOCOL.execution}; M15-only structural price action, no H1 entry filter or rank input, spread veto, pending invalidation, 24-hour maximum hold`,
  }) : PROTOCOL;
  const datasetDir = path.resolve(options.dataset), available = preflight(datasetDir, trends);
  const preparedAt = performance.now();
  const prepared = prepare(datasetDir, SERIES_SYMBOLS, { protocol, strictWindow: true });
  const evaluatorSha256 = sha256(fs.readFileSync(path.join(HERE, "prepare.js")));
  const datasetFingerprint = sha256(JSON.stringify(prepared.coverage));
  if (options.check) {
    console.log(JSON.stringify({ ok: true, protocol: PROTOCOL, available, evaluatorSha256, datasetFingerprint,
      events: prepared.events.length, coverage: prepared.coverage, searchSpace: buildSearchSpace(trends).length }, null, 2));
    return;
  }
  const space = buildSearchSpace(trends), started = performance.now(), deadline = started + options.searchSeconds * 1000, records = [];
  for (let index = 0; index < space.length && (performance.now() < deadline || index === 0); index += 1) {
    const value = space[index], evaluatedAt = performance.now(), result = evaluate(prepared, value);
    const record = { iteration: index + 1, elapsedSeconds: +((performance.now() - started) / 1000).toFixed(1),
      evaluationSeconds: +((performance.now() - evaluatedAt) / 1000).toFixed(3), candidate: serializable(value), summary: summary(result, value) };
    records.push(record);
    if ((index + 1) % 50 === 0) console.log(`[price-action ${index + 1}/${space.length}] ${value.name} trainR=${record.summary.train.totalR} validationR=${record.summary.validation.totalR}`);
  }

  const tunedCells = bestCells(records), fixedCells = bestCells(records, "fixed-2r");
  const selections = {
    trainQualifiedTuned: selectSessionProfiles(tunedCells, true),
    trainQualifiedFixed2R: selectSessionProfiles(fixedCells, true),
    forcedFiveTuned: selectSessionProfiles(tunedCells, false),
  };
  const portfolioSpecs = [];
  for (const riskPct of [0.01, 0.02, 0.03]) {
    portfolioSpecs.push(portfolioCandidate(`portfolio-train-qualified-tuned-risk-${100 * riskPct}`, selections.trainQualifiedTuned, riskPct));
    portfolioSpecs.push(portfolioCandidate(`portfolio-train-qualified-fixed2r-risk-${100 * riskPct}`, selections.trainQualifiedFixed2R, riskPct));
  }
  portfolioSpecs.push(portfolioCandidate("portfolio-forced-five-tuned-risk-1", selections.forcedFiveTuned, 0.01));
  portfolioSpecs.push(portfolioCandidate("portfolio-forced-five-tuned-risk-3", selections.forcedFiveTuned, 0.03));
  const portfolios = portfolioSpecs.map((value) => { const result = evaluate(prepared, value); return { candidate: serializable(value), summary: summary(result, value), result }; });

  const stablePostSearchCells = records.filter((record) => record.candidate.symbols?.length === 1 &&
    record.summary.train.totalR > 0 && record.summary.validation.totalR > 0 && record.summary.profitFactor >= 1.1 &&
    record.summary.train.positiveWeekPct >= 50 && record.summary.validation.positiveWeekPct >= 50 && record.summary.entries >= 40)
    .sort((a, b) => b.summary.objective - a.summary.objective).slice(0, 100);
  const output = {
    generatedAt: new Date().toISOString(), protocol,
    specification: {
      signal: "M15 directional impulse, 1-6 opposite candles, first resumption candle, causal lower-high/higher-low",
      trend: options.m15Only
        ? "M15 structure alone determines direction; H1 and every other timeframe are excluded from entry filtering and signal ranking"
        : "last closed H1 causal swing structure with optional EMA/MACD support; EMA+MACD without confirmed swing retained as control",
      execution: "pending at M15 executable breakout, stop beyond signal candle on executable bid/ask side plus 0.05 ATR; cancel if stop is breached before fill",
      exits: EXITS, risk: "EUR 500; 1/2/3% requested tests; <=3% per position, <=15% portfolio; 90% margin / five equal budgets; one position per symbol",
      sessions: "DST-aware Asia, London, London/New York overlap, New York, and off-hours",
    },
    metadata: { evaluatorSha256, datasetFingerprint, coverage: prepared.coverage, preparedEvents: prepared.events.length,
      preparationSeconds: +((started - preparedAt) / 1000).toFixed(1), requestedSearchSeconds: options.searchSeconds,
      searchSeconds: +((performance.now() - started) / 1000).toFixed(1), searchSpace: space.length, evaluatedCandidates: records.length,
      exhaustive: records.length === space.length },
    limitations: [
      "All dates have already been inspected and are development evidence, not a fresh locked test.",
      "Pair/session tuning is selected from the train fold only; validation remains a walk-forward diagnostic but is not externally locked.",
      ...(options.m15Only ? ["This final variant intentionally removes H1 confirmation; H1 fields may remain in prepared events but are not read by its decision or ranking functions."] : []),
      "M1 OHLC replay is conservative SL-first and uses recorded bid/ask, but broker minimum distance/size, gaps, slippage, financing, holidays, and guaranteed-stop costs are not modeled.",
      "Fixed-upside sizing avoids compounding gains during candidate selection; position size contracts when balance falls below EUR 500.",
    ],
    records, selections: Object.fromEntries(Object.entries(selections).map(([key, value]) => [key, portfolioSelectionSummary(value)])),
    stablePostSearchCells: stablePostSearchCells.map((record) => ({ candidate: record.candidate, summary: record.summary })),
    portfolios,
  };
  if (options.report) {
    const report = path.resolve(options.report); fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, `${JSON.stringify(output, null, 2)}\n`); console.log(`report: ${report}`);
  }
  console.log(JSON.stringify({ metadata: output.metadata, selections: output.selections,
    stablePostSearchCells: output.stablePostSearchCells.length,
    portfolios: portfolios.map((item) => item.summary) }, null, 2));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`price-action research failed: ${error.stack ?? error.message}`); process.exitCode = 1; }
}
