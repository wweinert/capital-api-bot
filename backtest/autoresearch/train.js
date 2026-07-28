import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
const symbols = (process.env.RESEARCH_SYMBOLS || "")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
let seed = Number(process.env.SEARCH_SEED || 15072026) >>> 0;
const rnd = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const prepared = prepare(dataset, symbols.length ? symbols : undefined);

const baseline = { method: "additive", threshold: 3, context: "m15", trigger: "any", trendMin: 0, setupMin: 0, wTrend: 1, wSetup: 1, wTrigger: 1, hold: 120, stopATR: 2.5, tpATR: 3, cooldown: 0, maxDaily: 99, maxPositions: 5, riskDivisor: 5 };
const candidates = [baseline];
const sessionWindows = [
  [[480, 1260]], // London through New York
  [[480, 1020]], // London and its overlap with New York
  [[780, 1260]], // overlap and New York
  [[480, 780]],  // London only
];
const make = () => {
  const method = pick(["scoring-gated", "scoring-gated", "scoring-weighted"]);
  return {
    method,
    rankByScore: true,
    minSignalScore: pick([3, 4, 5, 6]),
    minM15Trend: pick([1, 2, 3]),
    minH1Trend: pick([1, 2, 3]),
    minH4Trend: pick([3, 4, 5, 6]),
    minSetupScore: pick([0, 1, 2, 3]),
    trigger: pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]),
    wBase: pick([0.5, 1, 1.5, 2]), wM15: pick([0.5, 1, 1.5, 2]),
    wH1: pick([0.5, 1, 1.5, 2]), wH4: pick([0.5, 1, 1.5, 2]),
    wSetup: pick([0.5, 1, 1.5, 2]), wTrigger: pick([0.5, 1, 1.5, 2]),
    weightedThreshold: pick([12, 15, 18, 21, 24, 27]),
    sessionWindows: pick(sessionWindows),
    minAtrPct: pick([null, 0.0002, 0.00035, 0.0005]),
    minBbWidthPct: pick([null, 0.0004, 0.0007, 0.001]),
    minEmaDistPct: pick([null, 0.0001, 0.00025, 0.0004]),
    hold: pick([30, 60, 120, 180, 240]),
    stopATR: pick([1, 1.25, 1.5, 2, 2.5]),
    tpATR: pick([1.5, 2, 2.5, 3, 4, 5]),
    breakEvenR: pick([0, 0.75, 1, 1.25]),
    trailATR: pick([0, 0.75, 1, 1.25, 1.5]),
    cooldown: pick([15, 30, 60, 90, 120]),
    maxDaily: pick([1, 2, 3]), maxTotalDaily: pick([1, 2, 3, 4]),
    maxPositions: 1, riskDivisor: pick([10, 20, 30]),
  };
};

const started = Date.now(), results = []; let iterations = 0;
while ((Date.now() - started) / 1000 < seconds || iterations === 0) {
  const config = candidates.shift() ?? make(); const metrics = evaluate(prepared, config); results.push({ config, metrics }); iterations += 1;
  if (iterations % 25 === 0) console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} best=${Math.max(...results.map((r) => r.metrics.objective)).toFixed(3)}`);
}
results.sort((a, b) => b.metrics.objective - a.metrics.objective);
const qualified = results.filter((result) => result.metrics.qualified);
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, symbols: prepared.symbols, baseline: results.find((r) => r.config === baseline), qualifiedCount: qualified.length, leaderboard: qualified.slice(0, 20), rejectedSample: results.filter((result) => !result.metrics.qualified).slice(0, 5) };
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-results.json"; fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, qualifiedCount: report.qualifiedCount, baseline: report.baseline, best: report.leaderboard[0] || null }, null, 2));
