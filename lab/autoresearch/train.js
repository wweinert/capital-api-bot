import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { discoverSymbols, evaluate, prepare, RESEARCH_PROTOCOL, validateCandidateConfig } from "./prepare.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SERIES_SYMBOLS = ["AUDCAD", "AUDJPY", "AUDUSD", "EURAUD", "EURCHF", "EURGBP", "EURJPY", "EURUSD", "GBPAUD", "GBPCHF", "GBPJPY", "GBPUSD", "NZDJPY", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"];
export const DAILY_PROTOCOL = Object.freeze({
  ...RESEARCH_PROTOCOL,
  schemaVersion: 12,
  train: Object.freeze({ fromWeek: "2026-W07", toWeek: "2026-W19" }),
  validation: Object.freeze({ fromWeek: "2026-W20", toWeek: "2026-W32" }),
  evaluationEndExclusive: "2026-08-10T00:00:00.000Z",
  minimumCoverageEnd: "2026-08-07T20:00:00.000Z",
  lockedTest: "none-available-period-already-inspected-walk-forward-development-only",
  primaryMetric: "dailyObjective",
  execution: `${RESEARCH_PROTOCOL.execution}; weekday-only entries and forced daily flat`,
});

// AUTORESEARCH MUTABLE REGION START
// Change one coherent idea per experiment. The evaluator, split, and output
// code below this region are fixed for the duration of an experiment series.
export const CANDIDATE = {
  name: "m15-greenred-h1-trend-runner-v4-baseline",
  signalFamily: "greenred-mtf",
  method: "custom",
  rankByScore: true,
  signalTimeframe: "M15",
  triggerVariant: "any",
  confirmationMode: "higher",
  confirmationFrames: ["H1"],
  filterMode: "price",
  filterAgreement: "all",
  minTrendStrengthAtr: 0,
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
  hold: 480,
  breakEvenR: 0,
  trailATR: 0,
  trailR: 0,
  runnerMode: "none",
  cooldown: 30,
  maxDaily: 3,
  maxTotalDaily: 0,
  maxTotalPerSession: 5,
  maxPositions: 5,
  maxLossesPerSymbolDay: 3,
  maxLossesPerSymbolSession: 2,
  pendingOffsetAtr: 0,
  pendingExpiryMinutes: 60,
  weekdaysOnly: true,
  dailyFlat: true,
  dailyCloseMinuteUtc: 1440,
};

const MASK = Object.freeze({ FAST_EMA: 1 << 0, SLOW_EMA: 1 << 1, PRICE_EMA: 1 << 2, MACD: 1 << 3, EMA_SLOPE: 1 << 4, RSI: 1 << 5 });

function frameFilterPass(event, side, frame, config) {
  const mask = event[`${side}${frame}Mask`] ?? 0;
  const emaVotes = [MASK.FAST_EMA, MASK.SLOW_EMA, MASK.PRICE_EMA, MASK.EMA_SLOPE].filter((bit) => mask & bit).length;
  const ema = emaVotes >= 3;
  const rsi = Boolean(mask & MASK.RSI);
  const macd = Boolean(mask & MASK.MACD);
  const direction = side === "buy" ? 1 : -1;
  const price = direction * (event[`${frame}CloseTrend2Atr`] ?? 0) >= (config.minTrendStrengthAtr ?? 0);
  if (config.filterMode === "price") return price;
  if (config.filterMode === "ema") return ema;
  if (config.filterMode === "rsi") return rsi;
  if (config.filterMode === "macd") return macd;
  if (config.filterMode === "ema-rsi") return ema && rsi;
  if (config.filterMode === "ema-macd") return ema && macd;
  return (event[`${side}${frame}Score`] ?? 0) >= 4;
}

function confirmationPass(event, side, config) {
  const frames = config.confirmationFrames ?? [];
  if (!frames.length) return true;
  const passed = frames.filter((frame) => frameFilterPass(event, side, frame, config)).length;
  return config.filterAgreement === "all" ? passed === frames.length : passed >= Math.ceil(frames.length / 2);
}

function triggerName(config) {
  const suffix = config.triggerVariant === "one" ? "GreenRed1" : config.triggerVariant === "two" ? "GreenRed2" : "GreenRed";
  return `${config.signalTimeframe}${suffix}`;
}

export function decide(event, side, config) {
  return Boolean(event[`${side}${triggerName(config)}`]) && confirmationPass(event, side, config);
}

export function rank(event, side, config = CANDIDATE) {
  const scores = (config.confirmationFrames ?? []).map((frame) => event[`${side}${frame}Score`] ?? 0);
  const confidence = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);
  const signalAtr = event[`${config.signalTimeframe}SignalAtr`] ?? event.atr;
  return 100 * confidence - event.spread / Math.max(signalAtr, Number.EPSILON);
}

CANDIDATE.decide = decide;
CANDIDATE.rank = rank;

const SESSION_BASKETS = Object.freeze({
  asia: { allowedSessions: ["asia"] },
  london: { allowedSessions: ["london"] },
  overlap: { allowedSessions: ["overlap"] },
  newYork: { allowedSessions: ["newYork"] },
  offHours: { allowedSessions: ["offHours"] },
});

function candidateVariant(name, overrides = {}) {
  const candidate = {
    ...CANDIDATE,
    name,
    rewardRisk: 2,
    pendingOffsetAtr: 0,
    ...overrides,
  };
  candidate.rewardRisk = 2;
  if (!Object.hasOwn(overrides, "symbols") && name !== "baseline-replay") delete candidate.symbols;
  delete candidate.tpATR;
  candidate.decide = decide;
  candidate.rank = rank;
  return candidate;
}

const FILTERS = Object.freeze([
  { key: "price-0", filterMode: "price", minTrendStrengthAtr: 0 },
  { key: "price-010", filterMode: "price", minTrendStrengthAtr: 0.1 },
  { key: "price-025", filterMode: "price", minTrendStrengthAtr: 0.25 },
  { key: "price-050", filterMode: "price", minTrendStrengthAtr: 0.5 },
  { key: "ema", filterMode: "ema" },
  { key: "rsi", filterMode: "rsi" },
  { key: "macd", filterMode: "macd" },
  { key: "ema-rsi", filterMode: "ema-rsi" },
  { key: "ema-macd", filterMode: "ema-macd" },
  { key: "composite", filterMode: "composite" },
]);

const RUNNERS = Object.freeze([
  { key: "fixed-2r", runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "always-be1-trail050r", runnerMode: "always", breakEvenR: 1, trailR: 0.5 },
  { key: "fast15-be1-trail050r", runnerMode: "fast-1r", runnerFastMinutes: 15, breakEvenR: 1, trailR: 0.5 },
  { key: "fast30-be1-trail050r", runnerMode: "fast-1r", runnerFastMinutes: 30, breakEvenR: 1, trailR: 0.5 },
  { key: "fast60-be1-trail050r", runnerMode: "fast-1r", runnerFastMinutes: 60, breakEvenR: 1, trailR: 0.5 },
  { key: "body025-be1-trail050r", runnerMode: "signal-body", runnerSignalBodyAtr: 0.25, breakEvenR: 1, trailR: 0.5 },
  { key: "body050-be1-trail050r", runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5 },
  { key: "body075-be1-trail050r", runnerMode: "signal-body", runnerSignalBodyAtr: 0.75, breakEvenR: 1, trailR: 0.5 },
]);

const GLOBAL_SEARCH_SEEDS = Object.freeze(RUNNERS.flatMap((runner) => FILTERS.map((filter) => candidateVariant(
  `global-${filter.key}-any-${runner.key}`,
  {
    ...filter,
    ...runner,
    triggerVariant: "any",
    symbols: SERIES_SYMBOLS,
    maxPositions: 5,
  },
))));

const PAIR_MATRIX_SESSIONS = Object.freeze({
  asia: ["asia"],
  london: ["london"],
  overlap: ["overlap"],
  newYork: ["newYork"],
  offHours: ["offHours"],
});

export const SEARCH_SEEDS = Object.freeze([
  ...GLOBAL_SEARCH_SEEDS,
  ...RUNNERS.filter((runner) => ["fixed-2r", "always-be1-trail050r", "fast30-be1-trail050r", "body050-be1-trail050r"].includes(runner.key)).flatMap((runner) =>
    FILTERS.filter((filter) => ["price-0", "price-025", "ema", "rsi", "macd", "ema-rsi", "ema-macd"].includes(filter.key)).flatMap((filter) =>
      Object.entries(PAIR_MATRIX_SESSIONS).flatMap(([session, allowedSessions]) => SERIES_SYMBOLS.map((symbol) => candidateVariant(
        `pairmatrix-${session}-${symbol}-${filter.key}-any-${runner.key}`,
        { ...filter, ...runner, triggerVariant: "any", sessionWindows: [[0, 0]], allowedSessions, symbols: [symbol], maxPositions: 1 },
      ))))),
]);
// AUTORESEARCH MUTABLE REGION END

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function datasetFingerprint(coverage) {
  return sha256(JSON.stringify(coverage));
}

function parseArgs(argv) {
  const options = { json: false, check: false, daily: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--check") options.check = true;
    else if (arg === "--daily") options.daily = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dataset") options.dataset = argv[++i];
    else if (arg === "--symbols") options.symbols = argv[++i]?.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
    else if (arg === "--search-seconds") options.searchSeconds = Number(argv[++i]);
    else if (arg === "--report") options.report = argv[++i];
    else if (arg === "--candidate-report") options.candidateReport = argv[++i];
    else if (arg === "--candidate-symbols") options.candidateSymbols = argv[++i]?.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node lab/autoresearch/train.js --dataset <directory> [options]

Options:
  --symbols EURUSD,GBPUSD  Override the candidate symbol list
  --json                    Print the complete machine-readable result
  --check                   Validate configuration and dataset availability
  --daily                   Use the daily-first W07-W32 development protocol
  --search-seconds 1200     Load data once and evaluate candidates for this budget
  --report path.json        Write one search report (requires --search-seconds)
  --candidate-report path   Re-evaluate the winner stored in a search report
  --candidate-symbols list  Override only the stored candidate's symbol list
  -h, --help                Show this help

AUTORESEARCH_DATASET_DIR may be used instead of --dataset. Evaluation is
offline. Daily mode stops before ${DAILY_PROTOCOL.evaluationEndExclusive}; its
entire period is development evidence and is not a fresh locked test.`);
}

function fixedSummary(result, metadata) {
  return {
    candidate: metadata.candidateName ?? CANDIDATE.name,
    candidateSha256: metadata.candidateSha256,
    evaluatorSha256: metadata.evaluatorSha256,
    datasetFingerprint: metadata.datasetFingerprint,
    symbols: metadata.symbols,
    objective: result.objective,
    qualified: result.qualified,
    status: result.status,
    profitFactor: result.profitFactor,
    maxDrawdownR: result.maxDrawdownR,
    maxDrawdownPct: result.maxDDPct,
    entries: result.entries,
    returnPct: result.returnPct,
    risk: result.risk,
    activeDayPct: result.activeDayPct,
    train: result.folds.train,
    validation: result.folds.validation,
    dailyFolds: result.dailyFolds,
    gates: result.gates,
    evaluationSeconds: metadata.evaluationSeconds,
  };
}

function serializableCandidate(candidate) {
  return Object.fromEntries(Object.entries(candidate).filter(([, value]) => typeof value !== "function"));
}

function candidateFingerprint(candidate) {
  return sha256(JSON.stringify(serializableCandidate(candidate)));
}

function searchCandidate(seed, iteration) {
  if (iteration < SEARCH_SEEDS.length) return SEARCH_SEEDS[iteration];
  return candidateVariant(`search-space-sentinel-${iteration}`, serializableCandidate(SEARCH_SEEDS[0]));
}

export function runSearch(datasetDir, requestedSymbols, searchSeconds, protocol = RESEARCH_PROTOCOL) {
  if (!(Number.isFinite(searchSeconds) && searchSeconds > 0)) throw new Error("--search-seconds must be a positive number.");
  checkCandidate(datasetDir, requestedSymbols);
  const prepareStarted = performance.now();
  const prepared = prepare(datasetDir, requestedSymbols, { protocol, strictWindow: protocol.primaryMetric === "dailyObjective" });
  const evaluatorSource = fs.readFileSync(path.join(HERE, "prepare.js"));
  const metadata = {
    evaluatorSha256: sha256(evaluatorSource),
    datasetFingerprint: datasetFingerprint(prepared.coverage),
    symbols: requestedSymbols,
    coverage: prepared.coverage,
    preparedEvents: prepared.events.length,
    preparationSeconds: (performance.now() - prepareStarted) / 1000,
  };
  const started = performance.now();
  const deadline = started + searchSeconds * 1000;
  const iterations = [];
  const exploredCandidates = new Set();
  let terminationReason = "time-budget";
  let best = null;
  let profitLeader = null;
  for (let iteration = 0; performance.now() < deadline || iteration === 0; iteration += 1) {
    const candidate = searchCandidate(CANDIDATE, iteration, best, iterations);
    const comparableCandidate = serializableCandidate(candidate);
    delete comparableCandidate.name;
    const explorationFingerprint = sha256(JSON.stringify(comparableCandidate));
    if (exploredCandidates.has(explorationFingerprint)) {
      terminationReason = "search-space-exhausted";
      break;
    }
    exploredCandidates.add(explorationFingerprint);
    validateCandidateConfig(candidate);
    const evaluatedAt = performance.now();
    const result = evaluate(prepared, candidate);
    const evaluationSeconds = (performance.now() - evaluatedAt) / 1000;
    const summary = fixedSummary(result, { ...metadata, evaluationSeconds, candidateName: candidate.name, candidateSha256: candidateFingerprint(candidate) });
    const record = { iteration: iteration + 1, elapsedSeconds: +((performance.now() - started) / 1000).toFixed(1), candidate: serializableCandidate(candidate), summary };
    iterations.push(record);
    const eligibleWinner = candidate.name.startsWith("global-") || candidate.name.startsWith("portfolio-five-");
    const portfolioCandidate = candidate.name.startsWith("portfolio-five-");
    const portfolioBest = best?.candidate.name.startsWith("portfolio-five-") ?? false;
    const improves = eligibleWinner && (!best || (portfolioCandidate && !portfolioBest) || (portfolioCandidate === portfolioBest && ((summary.qualified && !best.summary.qualified) || (summary.qualified === best.summary.qualified && summary.objective > best.summary.objective))));
    if (improves) best = { candidate, summary, result };
    if (portfolioCandidate && summary.qualified && (!profitLeader || summary.returnPct > profitLeader.summary.returnPct)) profitLeader = { candidate, summary, result };
    console.log(`[search ${record.iteration}] ${candidate.name} objective=${summary.objective.toFixed(4)} qualified=${summary.qualified} validationR=${summary.validation.totalR.toFixed(3)} entries=${summary.entries} best=${best?.candidate.name ?? "pending-portfolio"}`);
  }
  return {
    generatedAt: new Date().toISOString(),
    protocol,
    search: { requestedSeconds: searchSeconds, actualSeconds: +((performance.now() - started) / 1000).toFixed(1), iterations: iterations.length, uniqueCandidates: exploredCandidates.size, terminationReason },
    metadata,
    legacyEvidencePolicy: "Reports were used only to seed hypotheses and identify invalid assumptions; their inspected forward periods were not reused as holdout.",
    knownLimitations: [
      "Signals are evaluated every 15 minutes from a freshly closed M15 Green-Red candle, with the last closed H1 candle as the only trend-filter timeframe. Pending breakout entries and stops use the M15 signal candle.",
      "The control exit is fixed at 2R. Runner variants are evaluated once price reaches 1R: the stop moves to breakeven, the 2R target is removed, and a 0.5R trailing stop is updated from completed M1 monitoring bars. Fast-1R and signal-body rules are historical-candle momentum proxies, not tick/order-flow measurements.",
      "Pair/session diagnostics and any derived session baskets are selected on already-inspected development train/validation evidence; they require genuinely new forward confirmation.",
      "The evaluator does not yet apply broker-specific minimum deal size, minimum stop distance, gap/slippage stress, financing, or guaranteed-stop premiums.",
      "Repeated search iterations select against the development validation fold; only the external human-controlled locked test can provide a fresh confirmation.",
      "EMA, RSI, MACD, and price-direction filters are derived only from historical candles; they are not historical broker client-position or order-flow data.",
      "Session labels shift with Europe/London and America/New_York daylight-saving offsets, but broker holidays, exceptional hours, and instrument-specific trading breaks are not modeled.",
      "Daily activity is attributed to the entry trading day, with Sunday UTC activity mapped to Monday; weekly P/L remains attributed by exit week.",
    ],
    iterations,
    winner: { candidate: serializableCandidate(best.candidate), summary: best.summary, result: best.result },
    profitLeader: profitLeader ? { candidate: serializableCandidate(profitLeader.candidate), summary: profitLeader.summary, result: profitLeader.result } : null,
  };
}

function printSummary(summary) {
  console.log("---");
  console.log(`objective:             ${summary.objective.toFixed(4)}`);
  console.log(`qualified:             ${summary.qualified}`);
  console.log(`status:                ${summary.status}`);
  console.log(`r_profit_factor:       ${summary.profitFactor.toFixed(3)}`);
  console.log(`max_drawdown_r:        ${summary.maxDrawdownR.toFixed(3)}`);
  console.log(`max_drawdown_pct:      ${summary.maxDrawdownPct.toFixed(1)}`);
  console.log(`entries:               ${summary.entries}`);
  console.log(`return_pct:            ${summary.returnPct.toFixed(2)}`);
  console.log(`train_total_r:         ${summary.train.totalR.toFixed(3)}`);
  console.log(`validation_total_r:    ${summary.validation.totalR.toFixed(3)}`);
  console.log(`train_positive_weeks:  ${summary.train.positiveWeekPct.toFixed(1)}`);
  console.log(`validation_pos_weeks:  ${summary.validation.positiveWeekPct.toFixed(1)}`);
  console.log(`train_positive_days:   ${summary.dailyFolds.train.positiveActiveDayPct.toFixed(1)}`);
  console.log(`validation_pos_days:   ${summary.dailyFolds.validation.positiveActiveDayPct.toFixed(1)}`);
  console.log(`train_active_days:     ${summary.dailyFolds.train.activeMarketDayPct.toFixed(1)}`);
  console.log(`validation_active_days:${summary.dailyFolds.validation.activeMarketDayPct.toFixed(1)}`);
  console.log(`evaluation_seconds:    ${summary.evaluationSeconds.toFixed(1)}`);
  console.log(`candidate_sha256:      ${summary.candidateSha256}`);
  console.log(`evaluator_sha256:      ${summary.evaluatorSha256}`);
  console.log(`dataset_fingerprint:   ${summary.datasetFingerprint}`);
}

export function checkCandidate(datasetDir, requestedSymbols = SERIES_SYMBOLS) {
  validateCandidateConfig(CANDIDATE);
  const available = discoverSymbols(datasetDir);
  const missing = requestedSymbols.filter((symbol) => !available.includes(symbol));
  if (missing.length) throw new Error(`Dataset is missing complete timeframe sets for: ${missing.join(", ")}`);
  return { available, requestedSymbols };
}

export function runExperiment(datasetDir, requestedSymbols = SERIES_SYMBOLS, protocol = RESEARCH_PROTOCOL, candidate = CANDIDATE) {
  checkCandidate(datasetDir, requestedSymbols);
  validateCandidateConfig(candidate);
  const started = performance.now();
  const prepared = prepare(datasetDir, requestedSymbols, { protocol, strictWindow: protocol.primaryMetric === "dailyObjective" });
  const result = evaluate(prepared, candidate);
  const evaluationSeconds = (performance.now() - started) / 1000;
  const evaluatorSource = fs.readFileSync(path.join(HERE, "prepare.js"));
  const metadata = {
    candidateSha256: candidateFingerprint(candidate),
    candidateName: candidate.name,
    evaluatorSha256: sha256(evaluatorSource),
    datasetFingerprint: datasetFingerprint(prepared.coverage),
    symbols: requestedSymbols,
    coverage: prepared.coverage,
    evaluationSeconds,
  };
  return { summary: fixedSummary(result, metadata), metadata, result };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const datasetDir = path.resolve(options.dataset ?? process.env.AUTORESEARCH_DATASET_DIR ?? "");
  if (!options.dataset && !process.env.AUTORESEARCH_DATASET_DIR) throw new Error("Pass --dataset or set AUTORESEARCH_DATASET_DIR.");
  const symbols = options.symbols ?? SERIES_SYMBOLS;
  const protocol = options.daily ? DAILY_PROTOCOL : RESEARCH_PROTOCOL;
  if (options.check) {
    const checked = checkCandidate(datasetDir, symbols);
    const prepared = prepare(datasetDir, symbols, { protocol, strictWindow: options.daily });
    console.log(JSON.stringify({ ok: true, protocol, datasetDir, evaluatorSha256: sha256(fs.readFileSync(path.join(HERE, "prepare.js"))), datasetFingerprint: datasetFingerprint(prepared.coverage), events: prepared.events.length, coverage: prepared.coverage, ...checked }, null, 2));
    return;
  }
  if (options.searchSeconds != null) {
    const output = runSearch(datasetDir, symbols, options.searchSeconds, protocol);
    if (options.report) {
      const reportPath = path.resolve(options.report);
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`);
      console.log(`report: ${reportPath}`);
    }
    console.log(JSON.stringify({ search: output.search, winner: output.winner.summary, profitLeader: output.profitLeader?.summary ?? null }, null, 2));
    return;
  }
  let candidate = CANDIDATE;
  if (options.candidateReport) {
    const stored = JSON.parse(fs.readFileSync(path.resolve(options.candidateReport), "utf8"));
    if (!stored?.winner?.candidate) throw new Error("Candidate report does not contain winner.candidate.");
    candidate = { ...stored.winner.candidate, ...(options.candidateSymbols ? { symbols: options.candidateSymbols } : {}), decide, rank };
  }
  const output = runExperiment(datasetDir, symbols, protocol, candidate);
  if (options.json) console.log(JSON.stringify({ protocol, candidate: serializableCandidate(candidate), ...output }, null, 2));
  else printSummary(output.summary);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`autoresearch failed: ${error.message}`);
    process.exitCode = 1;
  });
}
