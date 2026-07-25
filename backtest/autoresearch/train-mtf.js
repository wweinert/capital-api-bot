import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
let seed = Number(process.env.SEARCH_SEED || 17072026) >>> 0;
const rnd = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(rnd() * values.length)];
const prepared = prepare(dataset);
const frameSets = [["M5", "M15", "H1"], ["M15", "H1", "H4"], ["M5", "M15", "H1", "H4"]];

const make = () => {
  const frames = pick(frameSets), method = pick(["mtf-majority", "mtf-weighted", "mtf-strict", "mtf-hierarchical"]);
  const weights = frames.map(() => pick([0.5, 1, 1.5, 2]));
  const tfMin = pick([3, 4, 5]);
  return {
    mtf: true, method, frames, weights, tfMin,
    alignMin: pick(method === "mtf-strict" ? [frames.length] : [Math.max(2, frames.length - 1), frames.length]),
    threshold: pick([frames.length * 3, frames.length * 4, frames.length * 5, frames.length * 6]),
    highMin: pick([3, 4, 5]), lowMin: pick([2, 3, 4, 5]),
    trigger: pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]),
    hold: pick([120, 240, 480, 720]), stopATR: pick([1.5, 2, 2.5, 3]), tpATR: pick([2, 3, 4, 5]),
    cooldown: pick([0, 15, 30, 60, 120]), maxDaily: pick([1, 2, 3, 6]), maxPositions: pick([1, 2, 3, 5]), riskDivisor: pick([5, 10, 20]),
  };
};

const started = Date.now(), results = []; let iterations = 0;
while ((Date.now() - started) / 1000 < seconds || iterations === 0) {
  const config = make(), metrics = evaluate(prepared, config); results.push({ config, metrics }); iterations += 1;
  if (iterations % 25 === 0) console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} best=${Math.max(...results.map((r) => r.metrics.objective)).toFixed(3)}`);
}
results.sort((a, b) => b.metrics.objective - a.metrics.objective);
const report = {
  generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, leaderboard: results.slice(0, 30),
};
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-mtf-results.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0] }, null, 2));
