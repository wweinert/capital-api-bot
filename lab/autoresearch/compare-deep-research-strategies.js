import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSymbols, evaluate, prepare } from "./prepare.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROTOCOL = Object.freeze({
  schemaVersion: 17,
  train: Object.freeze({ fromWeek: "2026-W07", toWeek: "2026-W19" }),
  validation: Object.freeze({ fromWeek: "2026-W20", toWeek: "2026-W32" }),
  evaluationEndExclusive: "2026-08-10T00:00:00.000Z",
  minimumCoverageEnd: "2026-08-07T20:00:00.000Z",
  lockedTest: "none-available-entire-period-is-inspected-development-evidence",
  primaryMetric: "dailyObjective",
  startCapital: 500,
  leverage: Object.freeze({ usdPairs: 30, crosses: 20 }),
  risk: Object.freeze({ maxPerPositionPct: 0.03, maxPortfolioPct: 0.15, marginUtilization: 0.9 }),
  sizing: "EUR 500 fixed upside and balance-sensitive downside; <=3% position risk, <=15% open risk; 90% margin divided across five slots",
  execution: "closed-candle signals, next-M1 execution, historical bid/ask, conservative SL-first ambiguity, same-day flat",
});

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const serializable = (candidate) => Object.fromEntries(Object.entries(candidate).filter(([, value]) => typeof value !== "function"));
const resultSummary = (name, result, extra = {}) => ({
  name,
  ...extra,
  qualified: result.qualified,
  finalBalance: result.finalBalance,
  returnPct: result.returnPct,
  profitFactor: result.profitFactor,
  entries: result.entries,
  winRate: result.precision.winRate,
  tradesPerDay: result.precision.tradesPerDay,
  maxDrawdownPct: result.maxDDPct,
  maxDrawdownR: result.maxDrawdownR,
  train: result.folds.train,
  validation: result.folds.validation,
  dailyFolds: result.dailyFolds,
  recent: result.recent,
  gates: result.gates,
  sessionStats: result.sessionStats,
  symbolStats: result.symbolStats,
});

const BASE = Object.freeze({
  signalFamily: "deep-research-comparison",
  method: "custom",
  rankByScore: false,
  rankAtTimestampLimit: 1,
  signalTimeframe: "M1",
  sessionWindows: [[0, 0]],
  entryMode: "market",
  riskPct: 0.01,
  marginUtilization: 0.9,
  stopATR: 1.5,
  stopMode: "atr",
  stopBufferAtr: 0,
  rewardRisk: 2,
  hold: 120,
  breakEvenR: 0,
  trailATR: 0,
  trailR: 0,
  runnerMode: "none",
  cooldown: 30,
  maxDaily: 20,
  maxPositions: 1,
  maxLossesPerSymbolDay: 3,
  maxLossesPerSymbolSession: 2,
  pendingOffsetAtr: 0,
  pendingExpiryMinutes: 30,
  weekdaysOnly: true,
  dailyFlat: true,
  dailyCloseMinuteUtc: 22 * 60,
});

const levelPass = (event, side, config, timeframe) => {
  const roundRoom = event[`${side}${timeframe}RoundRoomAtr`];
  const sessionRoom = event[`${side}${timeframe}PreviousSessionRoomAtr`];
  const roundBreakout = event[`${side}${timeframe}RoundBreakout`];
  const sessionBreakout = event[`${side}${timeframe}PreviousSessionBreakout`];
  if (config.minRoundRoomAtr != null && roundRoom < config.minRoundRoomAtr && !(config.allowRoundBreakout && roundBreakout)) return false;
  if (config.minSessionRoomAtr != null && sessionRoom < config.minSessionRoomAtr && !(config.allowSessionBreakout && sessionBreakout)) return false;
  return true;
};

const sameDayDecide = (event, side, config) => {
  const direction = side === "buy" ? 1 : -1;
  return Boolean(event[`${side}M1GreenRed`]) &&
    direction * event.M1DayMoveAtr >= config.minDayMoveAtr &&
    event.SessionAgeMinutes >= 30 &&
    levelPass(event, side, config, "M1");
};

const sameDayRank = (event, side) => 10 * Math.abs(event.M1DayMoveAtr) - event.M15SpreadAtr + event[`${side}M1RoundRoomAtr`];
const sameDayCandidate = (name, overrides = {}) => ({
  ...BASE,
  name,
  symbols: ["AUDJPY"],
  sessionWindows: [[0, 8 * 60]],
  fixedSessionLabel: "asia",
  minDayMoveAtr: 0.05,
  decide: sameDayDecide,
  rank: sameDayRank,
  ...overrides,
});

const MASK = Object.freeze({ FAST_EMA: 1 << 0, SLOW_EMA: 1 << 1, PRICE_EMA: 1 << 2, MACD: 1 << 3, EMA_SLOPE: 1 << 4 });
const overlapDecide = (event, side, config) => {
  if (!event[`${side}M15GreenRed`] || !levelPass(event, side, config, "M15")) return false;
  const mask = event[`${side}H1Mask`] ?? 0;
  const emaVotes = [MASK.FAST_EMA, MASK.SLOW_EMA, MASK.PRICE_EMA, MASK.EMA_SLOPE].filter((bit) => mask & bit).length;
  return emaVotes >= 3 && Boolean(mask & MASK.MACD);
};
const overlapCandidate = (name, overrides = {}) => ({
  ...BASE,
  name,
  symbols: ["AUDJPY"],
  allowedSessions: ["overlap"],
  signalTimeframe: "M15",
  entryMode: "signal-breakout",
  stopMode: "signal-candle",
  stopBufferAtr: 0.05,
  pendingExpiryMinutes: 60,
  hold: 480,
  maxDaily: 3,
  maxTotalPerSession: 5,
  maxPositions: 1,
  dailyCloseMinuteUtc: 1440,
  decide: overlapDecide,
  rank: (event) => -event.M15SpreadAtr,
  ...overrides,
});

const openingRangeDecide = (event, side, config) => Boolean(event[`${side}${config.openingPrefix}`]);
const openingRangeCandidate = (name, symbols, overrides = {}) => ({
  ...BASE,
  name,
  symbols,
  signalTimeframe: "M15",
  entryMode: "signal-breakout",
  entryEventPrefix: "LondonOpeningRange",
  stopMode: "event-level",
  stopEventPrefix: "LondonOpeningRange",
  pendingExpiryMinutes: 600,
  hold: 720,
  cooldown: 0,
  maxDaily: 1,
  maxPositions: 5,
  maxLossesPerSymbolDay: 1,
  maxLossesPerSymbolSession: 1,
  allowStraddle: true,
  rankByScore: true,
  rankAtTimestampLimit: 5,
  openingPrefix: "LondonOpeningRange",
  decide: openingRangeDecide,
  rank: (event) => -event.M15SpreadAtr,
  ...overrides,
});

const fixDecide = (event, side, config) => {
  if (!event[config.fixField]) return false;
  const usdSide = event.symbol.endsWith("USD") ? "buy" : event.symbol.startsWith("USD") ? "sell" : null;
  return side === usdSide;
};
const fixCandidate = (name, symbols, fixField, hold) => ({
  ...BASE,
  name,
  symbols,
  signalTimeframe: "M1",
  fixField,
  hold,
  rewardRisk: 20,
  cooldown: 0,
  maxDaily: 3,
  maxPositions: 5,
  maxLossesPerSymbolDay: 3,
  maxLossesPerSymbolSession: 3,
  rankByScore: true,
  rankAtTimestampLimit: 5,
  decide: fixDecide,
  rank: (event) => -event.M15SpreadAtr,
});

function evaluateSet(prepared, candidates, family) {
  return candidates.map((candidate) => {
    const started = performance.now();
    const result = evaluate(prepared, candidate);
    return {
      family,
      candidate: serializable(candidate),
      summary: resultSummary(candidate.name, result, { evaluationSeconds: +((performance.now() - started) / 1000).toFixed(3) }),
    };
  });
}

function plateauSummary(records) {
  const eligible = records.filter((record) => record.summary.entries >= 100);
  return {
    evaluated: records.length,
    withAtLeast100Entries: eligible.length,
    positiveBothFolds: eligible.filter((record) => record.summary.train.totalR > 0 && record.summary.validation.totalR > 0).length,
    profitFactorAboveOne: eligible.filter((record) => record.summary.profitFactor > 1).length,
    medianProfitFactor: eligible.length ? +eligible.map((record) => record.summary.profitFactor).sort((a, b) => a - b)[Math.floor(eligible.length / 2)].toFixed(3) : 0,
    medianValidationR: eligible.length ? +eligible.map((record) => record.summary.validation.totalR).sort((a, b) => a - b)[Math.floor(eligible.length / 2)].toFixed(3) : 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => args[args.indexOf(flag) + 1];
  const datasetDir = path.resolve(value("--dataset") ?? "");
  const reportPath = path.resolve(value("--report") ?? "/private/tmp/deep-research-strategy-comparison-2026-08-13.json");
  if (!value("--dataset")) throw new Error("Pass --dataset <directory>.");
  const allSymbols = discoverSymbols(datasetDir);
  const usdSymbols = allSymbols.filter((symbol) => symbol.startsWith("USD") || symbol.endsWith("USD"));
  const microSymbols = [...new Set(["AUDJPY", "EURJPY", ...usdSymbols, "EURCHF", "USDCAD"])].filter((symbol) => allSymbols.includes(symbol));
  const evaluatorSha256 = sha256(fs.readFileSync(path.join(HERE, "prepare.js")));
  const strategyScriptSha256 = sha256(fs.readFileSync(fileURLToPath(import.meta.url)));

  if (args.includes("--overlap-stress-only")) {
    const runner = overlapCandidate("AUDJPY_OVERLAP_M15_H1_EMA_MACD_BODY_RUNNER", { runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5 });
    const prepared = prepare(datasetDir, ["AUDJPY", "EURJPY"], { protocol: PROTOCOL, strictWindow: true, decisionTimeframe: "M15" });
    const executionStress = evaluateSet(prepared, [
      runner,
      overlapCandidate("overlap-runner-entry-slip-002R", { runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5, entrySlippageR: 0.02 }),
      overlapCandidate("overlap-runner-entry-slip-005R", { runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5, entrySlippageR: 0.05 }),
      overlapCandidate("overlap-runner-entry-slip-010R", { runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5, entrySlippageR: 0.1 }),
      overlapCandidate("overlap-runner-stop-slip-005R", { runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5, stopSlippageR: 0.05 }),
      overlapCandidate("overlap-runner-stop-slip-010R", { runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5, stopSlippageR: 0.1 }),
    ], "audjpy-overlap-execution-stress");
    const spreadStress = [];
    for (const spreadMultiplier of [1.25, 1.5, 2]) {
      console.log(`Preparing overlap spread x${spreadMultiplier} stress...`);
      const stressed = prepare(datasetDir, ["AUDJPY", "EURJPY"], { protocol: PROTOCOL, strictWindow: true, decisionTimeframe: "M15", spreadMultiplier });
      spreadStress.push(...evaluateSet(stressed, [runner], "audjpy-overlap-spread-stress").map((record) => ({ ...record, spreadMultiplier })));
    }
    const report = { generatedAt: new Date().toISOString(), protocol: PROTOCOL,
      metadata: { evaluatorSha256, strategyScriptSha256, datasetFingerprint: sha256(JSON.stringify(prepared.coverage)), coverage: prepared.coverage },
      limitations: ["The entire W07-W32 period is already inspected development evidence.", "Historical bid/ask is stressed mechanically; gaps, financing and broker minimum distance/size are not modeled."],
      results: { executionStress, spreadStress } };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Report: ${reportPath}`);
    for (const group of Object.values(report.results)) for (const record of group) console.log(`${record.summary.name}\t${record.summary.returnPct}%\tPF ${record.summary.profitFactor}\t${record.summary.entries} entries\tV ${record.summary.validation.totalR}R`);
    return;
  }

  console.log(`Preparing M1 evidence for ${microSymbols.length} symbols...`);
  const preparedM1 = prepare(datasetDir, microSymbols, { protocol: PROTOCOL, strictWindow: true, decisionTimeframe: "M1", lightweightM1: true });
  console.log(`Preparing M15 evidence for ${allSymbols.length} symbols...`);
  const preparedM15 = prepare(datasetDir, allSymbols, { protocol: PROTOCOL, strictWindow: true, decisionTimeframe: "M15" });

  const baseline = sameDayCandidate("AUDJPY_ASIA_M1_DAY_PULLBACK_V1");
  const sameDay = evaluateSet(preparedM1, [baseline], "same-day-baseline");
  const plateauCandidates = [];
  for (const minDayMoveAtr of [0.03, 0.05, 0.08, 0.1]) {
    for (const stopATR of [1.25, 1.5, 1.75]) {
      for (const hold of [60, 90, 120, 180]) plateauCandidates.push(sameDayCandidate(`plateau-day${minDayMoveAtr}-stop${stopATR}-hold${hold}`, { minDayMoveAtr, stopATR, hold }));
    }
  }
  const plateau = evaluateSet(preparedM1, plateauCandidates, "same-day-parameter-plateau");
  const levelCandidates = [
    sameDayCandidate("same-day-round-room-025", { minRoundRoomAtr: 0.25 }),
    sameDayCandidate("same-day-round-room-050", { minRoundRoomAtr: 0.5 }),
    sameDayCandidate("same-day-round-room-100", { minRoundRoomAtr: 1 }),
    sameDayCandidate("same-day-round-room-050-or-break", { minRoundRoomAtr: 0.5, allowRoundBreakout: true }),
    sameDayCandidate("same-day-session-room-050", { minSessionRoomAtr: 0.5 }),
    sameDayCandidate("same-day-session-room-100", { minSessionRoomAtr: 1 }),
    sameDayCandidate("same-day-session-room-050-or-break", { minSessionRoomAtr: 0.5, allowSessionBreakout: true }),
    sameDayCandidate("same-day-round-and-session-room-050", { minRoundRoomAtr: 0.5, minSessionRoomAtr: 0.5 }),
  ];
  const levels = evaluateSet(preparedM1, levelCandidates, "same-day-level-extensions");
  const executionCandidates = [
    sameDayCandidate("same-day-entry-slip-005R", { entrySlippageR: 0.05 }),
    sameDayCandidate("same-day-entry-slip-010R", { entrySlippageR: 0.1 }),
    sameDayCandidate("same-day-stop-slip-005R", { stopSlippageR: 0.05 }),
    sameDayCandidate("same-day-stop-slip-010R", { stopSlippageR: 0.1 }),
    sameDayCandidate("same-day-entry-delay-1m", { entryDelayMinutes: 1 }),
    sameDayCandidate("same-day-entry-delay-2m", { entryDelayMinutes: 2 }),
  ];
  const executionStress = evaluateSet(preparedM1, executionCandidates, "same-day-execution-stress");
  const spreadStress = [];
  for (const spreadMultiplier of [1.25, 1.5, 2]) {
    console.log(`Preparing AUDJPY spread x${spreadMultiplier} stress...`);
    const stressed = prepare(datasetDir, ["AUDJPY", "EURJPY"], { protocol: PROTOCOL, strictWindow: true, decisionTimeframe: "M1", lightweightM1: true, spreadMultiplier });
    spreadStress.push(...evaluateSet(stressed, [baseline], "same-day-spread-stress").map((record) => ({ ...record, spreadMultiplier })));
  }

  const overlap = evaluateSet(preparedM15, [
    overlapCandidate("AUDJPY_OVERLAP_M15_H1_EMA_MACD_FIXED2R"),
    overlapCandidate("AUDJPY_OVERLAP_M15_H1_EMA_MACD_BODY_RUNNER", { runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5 }),
    overlapCandidate("overlap-runner-round-room-050", { runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5, minRoundRoomAtr: 0.5, allowRoundBreakout: true }),
    overlapCandidate("overlap-runner-session-room-050", { runnerMode: "signal-body", runnerSignalBodyAtr: 0.5, breakEvenR: 1, trailR: 0.5, minSessionRoomAtr: 0.5, allowSessionBreakout: true }),
  ], "audjpy-overlap");

  const openingRange = evaluateSet(preparedM15, [
    openingRangeCandidate("GMT_0700_RANGE_OCO_1R", allSymbols, { openingPrefix: "Gmt0700Range", entryEventPrefix: "Gmt0700Range", stopEventPrefix: "Gmt0700Range", rewardRisk: 1 }),
    openingRangeCandidate("GMT_0700_RANGE_OCO_2R", allSymbols, { openingPrefix: "Gmt0700Range", entryEventPrefix: "Gmt0700Range", stopEventPrefix: "Gmt0700Range", rewardRisk: 2 }),
    openingRangeCandidate("GMT_0700_RANGE_OCO_ATR_STOP_2R", allSymbols, { openingPrefix: "Gmt0700Range", entryEventPrefix: "Gmt0700Range", stopMode: "atr", stopEventPrefix: null, rewardRisk: 2 }),
    openingRangeCandidate("LONDON_LOCAL_0700_RANGE_OCO_2R", allSymbols, { rewardRisk: 2 }),
    openingRangeCandidate("LONDON_0700_CLOSE_BREAK_2R", allSymbols, { allowStraddle: false, openingPrefix: "LondonOpeningCloseBreak", entryEventPrefix: "LondonOpeningCloseBreak", stopEventPrefix: "LondonOpeningCloseBreak", pendingExpiryMinutes: 60 }),
  ], "opening-range");

  const fixes = evaluateSet(preparedM1, [
    fixCandidate("TOKYO_FIX_REVERSAL_30M", usdSymbols, "TokyoFix", 30),
    fixCandidate("TOKYO_FIX_REVERSAL_60M", usdSymbols, "TokyoFix", 60),
    fixCandidate("ECB_FIX_REVERSAL_30M", usdSymbols, "EcbFix", 30),
    fixCandidate("ECB_FIX_REVERSAL_60M", usdSymbols, "EcbFix", 60),
    fixCandidate("LONDON_FIX_REVERSAL_30M", usdSymbols, "LondonFix", 30),
    fixCandidate("LONDON_FIX_REVERSAL_60M", usdSymbols, "LondonFix", 60),
  ], "fx-fix-reversal");

  const report = {
    generatedAt: new Date().toISOString(),
    protocol: PROTOCOL,
    metadata: {
      evaluatorSha256,
      strategyScriptSha256,
      datasetFingerprint: sha256(JSON.stringify(preparedM15.coverage)),
      allSymbols,
      usdSymbols,
      preparedM1Events: preparedM1.events.length,
      preparedM15Events: preparedM15.events.length,
      coverage: preparedM15.coverage,
    },
    specification: {
      sameDay: "AUDJPY 00:00-08:00 UTC; >=0.05 M15 ATR from UTC-day open; M1 one/two-candle counter-move then resumption; market next M1; 1.5 ATR stop; 2R; 120m; two-loss Asia breaker.",
      overlap: "AUDJPY DST-aware overlap; closed M15 GreenRed one/two-candle resumption; last closed H1 EMA majority plus MACD; STOP beyond signal extreme; 2R or body>=0.5ATR runner after +1R.",
      levels: "50-pip round-number room and previous completed-session high/low room are causal vetoes measured in M15 ATR; breakout variants permit a just-confirmed crossing.",
      openingRange: "Literal 07:00-08:00 GMT and DST-aware 07:00-08:00 Europe/London ranges; OCO STOP orders from 08:00, plus one confirmed-M15-close London-local variant; ambiguous same-M1 touches of both OCO sides are discarded.",
      fxFix: "Post-fix USD reversal at Tokyo 09:55, ECB 14:15 Frankfurt, London 16:00 London; executable next-M1 market entry; 1.5 ATR protection; 30/60m time exit.",
    },
    limitations: [
      "All train and validation weeks are already inspected development evidence; none is a fresh holdout.",
      "Historical bid/ask is used, but gaps, financing, guaranteed-stop premiums and exact broker minimum size/distance are not modeled.",
      "FX candle volume is tick volume, not centralized order-book volume.",
      "Opening-range rules in the source were underspecified; both literal OCO and close-confirmed variants are reported instead of selecting one after seeing results.",
      "Fix reversal uses a retail liquidity-taking implementation, not the liquidity-provider execution studied in the academic paper.",
      "Economic-news blackout cannot be tested without a point-in-time historical calendar and is not silently approximated.",
    ],
    conclusionsMustUseHumanReview: true,
    plateauSummary: plateauSummary(plateau),
    results: { sameDay, plateau, levels, executionStress, spreadStress, overlap, openingRange, fixes },
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);
  for (const group of Object.values(report.results)) {
    for (const record of group) console.log(`${record.summary.name}\t${record.summary.returnPct}%\tPF ${record.summary.profitFactor}\t${record.summary.entries} entries\tV ${record.summary.validation.totalR}R`);
  }
}

main().catch((error) => {
  console.error(`deep-research comparison failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
