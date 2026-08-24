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
  schemaVersion: 14,
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
  name: "audusd-sydney-m15-greenred-control",
  signalFamily: "intraday-multi-pattern",
  method: "custom",
  rankByScore: true,
  rankAtTimestampLimit: 1,
  symbols: ["AUDUSD"],
  signalKind: "greenred",
  signalTimeframe: "M15",
  triggerVariant: "any",
  confirmationFrames: [],
  filterMode: "none",
  filterAgreement: "all",
  minTrendStrengthAtr: 0,
  minImpulseAtr: 0,
  minSwingGapAtr: 0,
  minSignalBodyAtr: 0,
  maxRetrace: 1,
  previousSessionMode: "none",
  previousSessionRoomAtr: 0,
  dayContext: "none",
  minDayMoveAtr: 0,
  minSessionAgeMinutes: 0,
  sessionWindows: [[0, 0]],
  allowedSessions: ["offHours", "asia"],
  fixedSessionLabel: "sydney",
  sydneyStartMinute: 8 * 60,
  sydneyEndMinute: 17 * 60,
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
  maxTotalPerSession: 3,
  maxPositions: 1,
  maxLossesPerSymbolDay: 2,
  maxLossesPerSymbolSession: 2,
  pendingOffsetAtr: 0,
  pendingExpiryMinutes: 60,
  weekdaysOnly: true,
  dailyFlat: true,
  dailyCloseMinuteUtc: 1320,
};

const MASK = Object.freeze({ FAST_EMA: 1 << 0, SLOW_EMA: 1 << 1, PRICE_EMA: 1 << 2, MACD: 1 << 3, EMA_SLOPE: 1 << 4, RSI: 1 << 5 });
const SYDNEY_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function frameFilterPass(event, side, frame, config) {
  if (config.filterMode === "none") return true;
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

function atomicSignalPass(event, side, config) {
  if (config.signalKind === "event-signal") {
    return Boolean(event[`${side}${config.signalTimeframe}${config.signalPattern}`]);
  }
  if (config.signalKind === "price-action") {
    return Boolean(event[`${side}M15PriceAction`]) &&
      (event[`${side}M15ImpulseAtr`] ?? 0) >= config.minImpulseAtr &&
      (event[`${side}M15SwingGapAtr`] ?? 0) >= config.minSwingGapAtr &&
      (event[`${side}M15SignalBodyAtr`] ?? 0) >= config.minSignalBodyAtr &&
      (event[`${side}M15Retrace`] ?? Number.POSITIVE_INFINITY) <= config.maxRetrace;
  }
  if (config.signalKind === "discretionary") {
    if (!event[`${side}M15Discretionary`]) return false;
    if (config.requireImpulse && !event[`${side}M15DiscretionaryImpulse`]) return false;
    if (config.requireSwing && !event[`${side}M15DiscretionarySwing`]) return false;
    if (config.requireBreakout && !event[`${side}M15DiscretionaryBreakout`]) return false;
    return (event[`${side}M15DiscretionarySignalBodyAtr`] ?? 0) >= config.minSignalBodyAtr;
  }
  if (config.signalKind === "london-close-break") return Boolean(event[`${side}LondonOpeningCloseBreak`]);
  return Boolean(event[`${side}${triggerName(config)}`]);
}

function signalPass(event, side, config) {
  if (config.signalKind === "combination") {
    return config.signalComponents.every((component) => atomicSignalPass(event, side, component));
  }
  return atomicSignalPass(event, side, config);
}

function intradayContextPass(event, side, config) {
  if ((event.SessionAgeMinutes ?? 0) < config.minSessionAgeMinutes) return false;
  if (config.previousSessionMode === "room" &&
      (event[`${side}M15PreviousSessionRoomAtr`] ?? 0) < config.previousSessionRoomAtr) return false;
  if (config.previousSessionMode === "breakout" && !event[`${side}M15PreviousSessionBreakout`]) return false;
  const direction = side === "buy" ? 1 : -1;
  const directedDayMove = direction * (event.M1DayMoveAtr ?? 0);
  if (config.dayContext === "continuation" && directedDayMove < config.minDayMoveAtr) return false;
  if (config.dayContext === "reversal" && directedDayMove > -config.minDayMoveAtr) return false;
  return true;
}

function sydneySessionPass(event, config) {
  if (!Number.isFinite(config.sydneyStartMinute) || !Number.isFinite(config.sydneyEndMinute)) return true;
  const parts = Object.fromEntries(
    SYDNEY_FORMATTER.formatToParts(new Date(event.t)).map(({ type, value }) => [type, value]),
  );
  const localMinute = Number(parts.hour) * 60 + Number(parts.minute);
  const start = config.sydneyStartMinute;
  const end = config.sydneyEndMinute;
  if (![localMinute, start, end].every(Number.isFinite)) return false;
  return start < end
    ? localMinute >= start && localMinute < end
    : localMinute >= start || localMinute < end;
}

export function decide(event, side, config) {
  return sydneySessionPass(event, config) &&
    signalPass(event, side, config) &&
    confirmationPass(event, side, config) &&
    intradayContextPass(event, side, config);
}

export function rank(event, side, config = CANDIDATE) {
  const scores = (config.confirmationFrames ?? []).map((frame) => event[`${side}${frame}Score`] ?? 0);
  const confidence = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);
  const signalAtr = event[`${config.signalTimeframe}SignalAtr`] ?? event.atr;
  const priceActionQuality = (event[`${side}M15ImpulseAtr`] ?? 0) + (event[`${side}M15SignalBodyAtr`] ?? 0);
  return 100 * confidence + 10 * priceActionQuality - event.spread / Math.max(signalAtr, Number.EPSILON);
}

CANDIDATE.decide = decide;
CANDIDATE.rank = rank;

function candidateVariant(name, overrides = {}) {
  const candidate = {
    ...CANDIDATE,
    name,
    pendingOffsetAtr: 0,
    ...overrides,
  };
  delete candidate.tpATR;
  candidate.decide = decide;
  candidate.rank = rank;
  return candidate;
}

const SIGNAL_TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4", "D1"];
const GREEN_RED_SIGNALS = [
  ...SIGNAL_TIMEFRAMES.map((signalTimeframe) => ({
    key: `${signalTimeframe.toLowerCase()}-gr-control`,
    signalKind: "greenred",
    signalTimeframe,
    triggerVariant: "any",
  })),
  { key: "m15-gr-one-control", signalKind: "greenred", signalTimeframe: "M15", triggerVariant: "one" },
  { key: "m15-gr-two-control", signalKind: "greenred", signalTimeframe: "M15", triggerVariant: "two" },
];

const PRICE_ACTION_SIGNALS = SIGNAL_TIMEFRAMES.flatMap((signalTimeframe) =>
  ["Engulfing", "PinBar", "InsideBreak", "OutsideBar", "Momentum", "Breakout20"].map((signalPattern) => ({
    key: `${signalTimeframe.toLowerCase()}-${signalPattern.toLowerCase()}`,
    signalKind: "event-signal",
    signalTimeframe,
    signalPattern,
  })),
);

const INDICATOR_SIGNALS = ["M5", "M15", "H1", "H4"].flatMap((signalTimeframe) =>
  ["EmaCross", "EmaReclaim", "BollingerReentry", "RsiReversal", "MacdCross"].map((signalPattern) => ({
    key: `${signalTimeframe.toLowerCase()}-${signalPattern.toLowerCase()}`,
    signalKind: "event-signal",
    signalTimeframe,
    signalPattern,
  })),
);

const signalComponent = (signalKind, signalTimeframe, signalPattern, extra = {}) => ({
  signalKind,
  signalTimeframe,
  signalPattern,
  ...extra,
});

// Explicit intersections answer a different question from a single trigger
// plus a trend filter: did two independently defined entry events occur on
// the same causal decision candle? Sparse combinations are retained as
// negative evidence instead of being silently replaced with Green-Red.
const COMBINATION_SIGNALS = Object.freeze([
  {
    key: "m15-engulfing-momentum",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("event-signal", "M15", "Engulfing"),
      signalComponent("event-signal", "M15", "Momentum"),
    ],
  },
  {
    key: "m15-insidebreak-momentum",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("event-signal", "M15", "InsideBreak"),
      signalComponent("event-signal", "M15", "Momentum"),
    ],
  },
  {
    key: "m15-breakout20-momentum",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("event-signal", "M15", "Breakout20"),
      signalComponent("event-signal", "M15", "Momentum"),
    ],
  },
  {
    key: "m15-pinbar-bollinger",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("event-signal", "M15", "PinBar"),
      signalComponent("event-signal", "M15", "BollingerReentry"),
    ],
  },
  {
    key: "m15-engulfing-ema-reclaim",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("event-signal", "M15", "Engulfing"),
      signalComponent("event-signal", "M15", "EmaReclaim"),
    ],
  },
  {
    key: "m15-momentum-macd-cross",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("event-signal", "M15", "Momentum"),
      signalComponent("event-signal", "M15", "MacdCross"),
    ],
  },
  {
    key: "m15-greenred-ema-reclaim",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("greenred", "M15"),
      signalComponent("event-signal", "M15", "EmaReclaim"),
    ],
  },
  {
    key: "m15-greenred-macd-cross",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("greenred", "M15"),
      signalComponent("event-signal", "M15", "MacdCross"),
    ],
  },
  {
    key: "m15-pa-balanced-ema-reclaim",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("price-action", "M15", null, { minImpulseAtr: 1, minSwingGapAtr: 0.1, minSignalBodyAtr: 0.2, maxRetrace: 0.75 }),
      signalComponent("event-signal", "M15", "EmaReclaim"),
    ],
  },
  {
    key: "m15-pa-balanced-macd-cross",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("price-action", "M15", null, { minImpulseAtr: 1, minSwingGapAtr: 0.1, minSignalBodyAtr: 0.2, maxRetrace: 0.75 }),
      signalComponent("event-signal", "M15", "MacdCross"),
    ],
  },
  {
    key: "m5-momentum-m15-ema-reclaim",
    signalKind: "combination",
    signalTimeframe: "M5",
    signalComponents: [
      signalComponent("event-signal", "M5", "Momentum"),
      signalComponent("event-signal", "M15", "EmaReclaim"),
    ],
  },
  {
    key: "m15-momentum-h1-macd-cross",
    signalKind: "combination",
    signalTimeframe: "M15",
    signalComponents: [
      signalComponent("event-signal", "M15", "Momentum"),
      signalComponent("event-signal", "H1", "MacdCross"),
    ],
  },
]);

const SIGNALS = Object.freeze([
  ...GREEN_RED_SIGNALS,
  ...PRICE_ACTION_SIGNALS,
  ...INDICATOR_SIGNALS,
  ...COMBINATION_SIGNALS,
  { key: "pa-loose", signalKind: "price-action", minImpulseAtr: 0, minSwingGapAtr: 0, minSignalBodyAtr: 0, maxRetrace: 1 },
  { key: "pa-balanced", signalKind: "price-action", minImpulseAtr: 1, minSwingGapAtr: 0.1, minSignalBodyAtr: 0.2, maxRetrace: 0.75 },
  { key: "pa-strong", signalKind: "price-action", minImpulseAtr: 1.5, minSwingGapAtr: 0.25, minSignalBodyAtr: 0.3, maxRetrace: 0.65 },
  { key: "disc-impulse", signalKind: "discretionary", requireImpulse: true, requireSwing: false, requireBreakout: false, minSignalBodyAtr: 0.15 },
  { key: "disc-swing", signalKind: "discretionary", requireImpulse: true, requireSwing: true, requireBreakout: false, minSignalBodyAtr: 0.15 },
  { key: "london-close-break", signalKind: "london-close-break", entryEventPrefix: "LondonOpeningCloseBreak", stopEventPrefix: "LondonOpeningCloseBreak", stopMode: "event-level" },
]);

const CONTEXTS = Object.freeze([
  { key: "none", confirmationFrames: [], filterMode: "none" },
  { key: "previous-session-room", confirmationFrames: [], filterMode: "none", previousSessionMode: "room", previousSessionRoomAtr: 0.5 },
  { key: "day-continuation", confirmationFrames: [], filterMode: "none", dayContext: "continuation", minDayMoveAtr: 0.1 },
  { key: "h1-price25", confirmationFrames: ["H1"], filterMode: "price", minTrendStrengthAtr: 0.25 },
  { key: "h1-ema", confirmationFrames: ["H1"], filterMode: "ema" },
  { key: "h1-rsi", confirmationFrames: ["H1"], filterMode: "rsi" },
  { key: "h1-macd", confirmationFrames: ["H1"], filterMode: "macd" },
  { key: "h1-ema-macd-room", confirmationFrames: ["H1"], filterMode: "ema-macd", previousSessionMode: "room", previousSessionRoomAtr: 0.25 },
  { key: "h1-ema-rsi-day", confirmationFrames: ["H1"], filterMode: "ema-rsi", dayContext: "continuation", minDayMoveAtr: 0.1 },
  { key: "h4-price25", confirmationFrames: ["H4"], filterMode: "price", minTrendStrengthAtr: 0.25 },
  { key: "h4-ema", confirmationFrames: ["H4"], filterMode: "ema" },
  { key: "h4-macd", confirmationFrames: ["H4"], filterMode: "macd" },
  { key: "d1-price", confirmationFrames: ["D1"], filterMode: "price", minTrendStrengthAtr: 0 },
  { key: "h1-h4-price", confirmationFrames: ["H1", "H4"], filterMode: "price", minTrendStrengthAtr: 0, filterAgreement: "majority" },
  { key: "h4-d1-price", confirmationFrames: ["H4", "D1"], filterMode: "price", minTrendStrengthAtr: 0, filterAgreement: "majority" },
  { key: "h1-h4-d1-price", confirmationFrames: ["H1", "H4", "D1"], filterMode: "price", minTrendStrengthAtr: 0, filterAgreement: "majority" },
  { key: "m15-h1-ema", confirmationFrames: ["M15", "H1"], filterMode: "ema", filterAgreement: "majority" },
  { key: "m5-m15-h1-price", confirmationFrames: ["M5", "M15", "H1"], filterMode: "price", minTrendStrengthAtr: 0, filterAgreement: "majority" },
  { key: "six-frame-price", confirmationFrames: ["M1", "M5", "M15", "H1", "H4", "D1"], filterMode: "price", minTrendStrengthAtr: 0, filterAgreement: "majority" },
]);

const SESSIONS = Object.freeze([
  { key: "sydney-full-0800-1700", sydneyStartMinute: 8 * 60, sydneyEndMinute: 17 * 60 },
  { key: "sydney-open-0800-1100", sydneyStartMinute: 8 * 60, sydneyEndMinute: 11 * 60 },
  { key: "sydney-morning-0800-1300", sydneyStartMinute: 8 * 60, sydneyEndMinute: 13 * 60 },
  { key: "sydney-core-0800-1400", sydneyStartMinute: 8 * 60, sydneyEndMinute: 14 * 60 },
  { key: "sydney-mid-1000-1500", sydneyStartMinute: 10 * 60, sydneyEndMinute: 15 * 60 },
  { key: "sydney-late-1100-1700", sydneyStartMinute: 11 * 60, sydneyEndMinute: 17 * 60 },
  { key: "sydney-close-1400-1700", sydneyStartMinute: 14 * 60, sydneyEndMinute: 17 * 60 },
  { key: "sydney-preopen-0700-1000", sydneyStartMinute: 7 * 60, sydneyEndMinute: 10 * 60 },
]);

const EXITS = Object.freeze([
  { key: "candle-rr1-60", stopMode: "signal-candle", rewardRisk: 1, hold: 60, runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "candle-rr125-120", stopMode: "signal-candle", rewardRisk: 1.25, hold: 120, runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "candle-rr15-120", stopMode: "signal-candle", rewardRisk: 1.5, hold: 120, runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "candle-rr125-180", stopMode: "signal-candle", rewardRisk: 1.25, hold: 180, runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "candle-rr15-240", stopMode: "signal-candle", rewardRisk: 1.5, hold: 240, runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "candle-rr2-480", stopMode: "signal-candle", rewardRisk: 2, hold: 480, runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "candle-rr25-480", stopMode: "signal-candle", rewardRisk: 2.5, hold: 480, runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "atr15-rr15-240", stopMode: "atr", stopATR: 1.5, rewardRisk: 1.5, hold: 240, runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "atr1-rr125-120", stopMode: "atr", stopATR: 1, rewardRisk: 1.25, hold: 120, runnerMode: "none", breakEvenR: 0, trailR: 0 },
  { key: "runner-be1-trail05", stopMode: "signal-candle", rewardRisk: 2, hold: 480, runnerMode: "always", breakEvenR: 1, trailR: 0.5 },
]);

const EXECUTION_POLICIES = Object.freeze([
  { key: "risk1-daily3", riskPct: 0.01, maxDaily: 3, maxTotalPerSession: 3, maxLossesPerSymbolDay: 2, maxLossesPerSymbolSession: 2 },
  { key: "risk3-daily3", riskPct: 0.03, maxDaily: 3, maxTotalPerSession: 3, maxLossesPerSymbolDay: 2, maxLossesPerSymbolSession: 2 },
]);

function stableSearchOrder(candidate) {
  let hash = 2166136261;
  for (const character of candidate.name) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export const SEARCH_SEEDS = Object.freeze([
  ...["AUDUSD", "AUDCAD", "NZDUSD", "NZDJPY", "EURAUD"].flatMap((symbol) =>
    EXECUTION_POLICIES.flatMap((execution) => EXITS.flatMap((exit) => SESSIONS.flatMap((session) =>
      SIGNALS.filter((signal) => signal.signalKind !== "london-close-break").flatMap((signal) => CONTEXTS.map((context) => candidateVariant(
        `global-sydney-${symbol.toLowerCase()}-${exit.key}-${execution.key}-${session.key}-${signal.key}-${context.key}`,
        { ...exit, ...execution, ...session, ...signal, ...context, symbols: [symbol] },
      ))))))),
].sort((left, right) => stableSearchOrder(left) - stableSearchOrder(right)));
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
    if (eligibleWinner && summary.qualified && (!profitLeader || summary.returnPct > profitLeader.summary.returnPct)) profitLeader = { candidate, summary, result };
    console.log(`[search ${record.iteration}] ${candidate.name} objective=${summary.objective.toFixed(4)} qualified=${summary.qualified} validationR=${summary.validation.totalR.toFixed(3)} entries=${summary.entries} best=${best?.candidate.name ?? "pending-portfolio"}`);
  }
  return {
    generatedAt: new Date().toISOString(),
    protocol,
    search: { requestedSeconds: searchSeconds, actualSeconds: +((performance.now() - started) / 1000).toFixed(1), iterations: iterations.length, uniqueCandidates: exploredCandidates.size, terminationReason },
    metadata,
    legacyEvidencePolicy: "Reports were used only to seed hypotheses and identify invalid assumptions; their inspected forward periods were not reused as holdout.",
    knownLimitations: [
      "Decision points occur every 15 minutes. M1 and M5 triggers are therefore sampled only when their close aligns with that fixed decision clock; higher-timeframe triggers occur only on their own closed-candle boundaries.",
      "The declared matrix includes Green-Red controls, engulfing, pin-bar, inside-break, outside-bar, momentum, 20-bar breakout, structural continuation, opening-range breakout, EMA cross/reclaim, Bollinger re-entry, RSI reversal, and MACD cross, alone and with causal multi-timeframe/session context.",
      "Pending entries use the selected signal timeframe. Fixed-target, ATR-stop, and runner variants are historical-candle proxies, not tick/order-flow measurements.",
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
