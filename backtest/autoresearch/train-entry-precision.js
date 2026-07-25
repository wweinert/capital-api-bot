import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 120);
let seed = Number(process.env.SEARCH_SEED || 18072026) >>> 0;
const rnd = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(rnd() * values.length)];
const prepared = prepare(dataset);
const frameSets = [["M5", "M15", "H1"], ["M15", "H1", "H4"], ["M5", "M15", "H1", "H4"]];

const make = () => {
  const frames = pick(frameSets), method = pick(["mtf-majority", "mtf-weighted", "mtf-strict", "mtf-hierarchical"]);
  const componentWeights = Array.from({ length: 6 }, () => pick([0, 0.5, 1, 1.5, 2, 3]));
  if (componentWeights.every((weight) => weight === 0)) componentWeights[0] = 1;
  const maximumScore = componentWeights.reduce((sum, weight) => sum + weight, 0);
  const weights = frames.map(() => pick([0.5, 1, 1.5, 2, 3]));
  const tfMin = +(maximumScore * pick([0.45, 0.55, 0.65, 0.75, 0.85])).toFixed(2);
  const stopATR = pick([1, 1.5, 2, 2.5, 3]);
  const tpATR = pick([1, 1.5, 2, 2.5, 3, 4].filter((value) => value >= stopATR));
  return {
    mtf: true, objectiveMode: "entry-precision", requirePositiveExpectancy: true, method, frames, componentWeights, weights, tfMin,
    alignMin: pick(method === "mtf-strict" ? [frames.length] : [Math.max(2, frames.length - 1), frames.length]),
    threshold: +(maximumScore * weights.reduce((sum, weight) => sum + weight, 0) * pick([0.45, 0.55, 0.65, 0.75])).toFixed(2),
    highMin: tfMin, lowMin: +(maximumScore * pick([0.35, 0.45, 0.55, 0.65])).toFixed(2),
    trigger: pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]),
    hold: pick([120, 240, 480, 720, 1440]), stopATR, tpATR,
    cooldown: pick([15, 30, 60, 120, 240]), maxDaily: pick([1, 2, 3]), maxPositions: 1, riskDivisor: 10,
  };
};

const started = Date.now(), results = []; let iterations = 0;
while ((Date.now() - started) / 1000 < seconds || iterations === 0) {
  const config = make(), metrics = evaluate(prepared, config); results.push({ config, metrics }); iterations += 1;
  if (iterations % 25 === 0) {
    const best = results.reduce((winner, result) => !winner || result.metrics.objective > winner.metrics.objective ? result : winner, null);
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} win=${best.metrics.selectionPrecision.winRate}% tp=${best.metrics.selectionPrecision.tpRate}% per_day=${best.metrics.selectionPrecision.tradesPerDay}`);
  }
}
results.sort((a, b) => b.metrics.objective - a.metrics.objective);
const report = {
  generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, leaderboard: results.slice(0, 30),
};
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-entry-precision.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0] }, null, 2));
