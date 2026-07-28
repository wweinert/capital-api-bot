import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

// Direction is frozen to the qualified score/M15/H1 model. This search only
// varies trade management and post-signal execution, including pending orders.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
const symbols = (process.env.RESEARCH_SYMBOLS || "")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
let seed = Number(process.env.SEARCH_SEED || 20260731) >>> 0;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];
const prepared = prepare(dataset, symbols.length ? symbols : undefined);

const direction = {
  method: "scoring-gated", objectiveMode: "direction", rankByScore: true,
  minSignalScore: 3, useM15Gate: true, minM15Trend: 1,
  useH1Gate: true, minH1Trend: 3, useH4Gate: false, minH4Trend: 2,
  useSetupGate: false, minSetupScore: 3, useTriggerGate: false, trigger: "any",
  sessionWindows: [[780, 1260]], minAtrPct: 0.0005, minBbWidthPct: 0.0007, minEmaDistPct: null,
  cooldown: 30, maxDaily: 4, maxTotalDaily: 12, maxPositions: 5, riskDivisor: 10,
};
const baseline = {
  ...direction, entryMode: "market", stopATR: 2.5, tpATR: 5, hold: 120,
  breakEvenR: 0, trailATR: 0, trailTimeframe: "m1", partialR: 0, partialFraction: 0,
};

function candidate() {
  const stopATR = pick([1.5, 2, 2.5, 3, 3.5, 4]);
  const rewardRisk = pick([2, 2.5, 3, 4, 6, 10]);
  const trail = pick([false, true, true, true]);
  const partial = pick([false, false, true]);
  const entryMode = pick(["market", "market", "continuation", "pullback", "adaptive-pending"]);
  return {
    ...direction,
    entryMode,
    pendingKind: pick(["continuation", "pullback"]),
    pendingBelowScore: pick([4, 5, 6]),
    pendingOffsetAtr: pick([0.1, 0.2, 0.35, 0.5, 0.75, 1]),
    pendingExpiryMinutes: pick([5, 15, 30, 60, 120]),
    stopATR, tpATR: stopATR * rewardRisk,
    hold: pick([60, 120, 180, 240, 360, 480]),
    breakEvenR: trail ? pick([0.25, 0.5, 0.75, 1, 1.25]) : 0,
    trailATR: trail ? pick([0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1]) : 0,
    trailTimeframe: "m1",
    partialR: partial ? pick([0.5, 0.75, 1, 1.25]) : 0,
    partialFraction: partial ? pick([0.25, 0.5, 0.6]) : 0,
    moveStopOnPartial: partial,
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
  generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations,
  symbols: prepared.symbols, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  directionFrozen: direction, baseline: results[0], qualifiedCount: qualified.length, leaderboard: qualified.slice(0, 20),
  pendingModel: "Limit/stop pending orders fill only when a subsequent M1 high/low crosses the requested level; management starts on the following M1 bar.",
  trailingModel: "Trailing stop updates once per completed M1 using its high/low and a distance expressed as M1 ATR; it is not a tick-by-tick broker simulation.",
};
const output = process.env.REPORT_PATH || "/tmp/trading-exit-results.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, qualifiedCount: qualified.length, best: qualified[0] || null }, null, 2));
