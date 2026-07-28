import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

// Direction-only search.  Exit and sizing knobs deliberately remain fixed:
// the experiment answers whether a score plus market context can select the
// right side often enough, with a hard minimum 1:2 TP/SL ratio.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
const symbols = (process.env.RESEARCH_SYMBOLS || "")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
let seed = Number(process.env.SEARCH_SEED || 20260730) >>> 0;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];
const prepared = prepare(dataset, symbols.length ? symbols : undefined);

const sessions = [
  [[0, 1440]],
  [[480, 1260]],
  [[480, 1020]],
  [[780, 1260]],
];

const baseline = {
  method: "scoring-gated", objectiveMode: "direction", rankByScore: true,
  minSignalScore: 3, useM15Gate: true, minM15Trend: 1,
  useH1Gate: true, minH1Trend: 1, useH4Gate: true, minH4Trend: 3,
  useSetupGate: false, minSetupScore: 0, useTriggerGate: false, trigger: "any",
  sessionWindows: sessions[0], minAtrPct: null, minBbWidthPct: null, minEmaDistPct: null,
  stopATR: 2.5, tpATR: 5, hold: 120, breakEvenR: 0, trailATR: 0,
  cooldown: 0, maxDaily: 8, maxTotalDaily: 12, maxPositions: 5, riskDivisor: 10,
};

function candidate() {
  const method = pick(["scoring-gated", "scoring-gated", "scoring-weighted"]);
  return {
    method, objectiveMode: "direction", rankByScore: true,
    minSignalScore: pick([2, 3, 4, 5]),
    useM15Gate: pick([true, true, false]), minM15Trend: pick([1, 2, 3]),
    useH1Gate: pick([true, true, false]), minH1Trend: pick([1, 2, 3]),
    useH4Gate: pick([true, false, false]), minH4Trend: pick([2, 3, 4, 5]),
    useSetupGate: pick([true, false, false]), minSetupScore: pick([1, 2, 3]),
    useTriggerGate: pick([true, false]), trigger: pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]),
    wBase: pick([0.5, 1, 1.5, 2]), wM15: pick([0.5, 1, 1.5, 2]),
    wH1: pick([0.5, 1, 1.5, 2]), wH4: pick([0.5, 1, 1.5, 2]),
    wSetup: pick([0.5, 1, 1.5, 2]), wTrigger: pick([0.5, 1, 1.5, 2]),
    weightedThreshold: pick([7, 10, 13, 16, 19, 22]),
    sessionWindows: pick(sessions),
    minAtrPct: pick([null, null, 0.0002, 0.00035, 0.0005]),
    minBbWidthPct: pick([null, null, 0.0004, 0.0007, 0.001]),
    minEmaDistPct: pick([null, null, 0.0001, 0.00025, 0.0004]),
    // Fixed exit model: current ATR stop, mandatory 2R TP, current two-hour cap.
    stopATR: 2.5, tpATR: 5, hold: 120, breakEvenR: 0, trailATR: 0,
    cooldown: pick([0, 15, 30, 60]), maxDaily: pick([4, 6, 8]),
    maxTotalDaily: pick([5, 8, 12]), maxPositions: 5, riskDivisor: 10,
  };
}

const started = Date.now();
const results = [{ config: baseline, metrics: evaluate(prepared, baseline) }];
let iterations = 1;
while ((Date.now() - started) / 1000 < seconds || iterations === 0) {
  const config = candidate();
  results.push({ config, metrics: evaluate(prepared, config) });
  iterations += 1;
  if (iterations % 25 === 0) {
    const qualified = results.filter((result) => result.metrics.qualified);
    const best = qualified.sort((left, right) => right.metrics.objective - left.metrics.objective)[0];
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} qualified=${qualified.length} best=${best ? best.metrics.objective.toFixed(3) : "none"}`);
  }
}

const qualified = results.filter((result) => result.metrics.qualified).sort((left, right) => right.metrics.objective - left.metrics.objective);
const report = {
  generatedAt: new Date().toISOString(),
  searchSeconds: +((Date.now() - started) / 1000).toFixed(1),
  experiments: iterations, symbols: prepared.symbols,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  fixedExit: "stop=2.5 ATR, take-profit=5 ATR (2R), max hold=120 minutes; only entry direction/filtering varies",
  baseline: results[0], qualifiedCount: qualified.length, leaderboard: qualified.slice(0, 20),
};
const output = process.env.REPORT_PATH || "/tmp/trading-direction-results.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, qualifiedCount: qualified.length, best: qualified[0] || null }, null, 2));
