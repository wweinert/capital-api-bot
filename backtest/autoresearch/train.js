import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
let seed = Number(process.env.SEARCH_SEED || 15072026) >>> 0;
const rnd = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const prepared = prepare(dataset);

const baseline = { method: "additive", threshold: 3, context: "m15", trigger: "any", trendMin: 0, setupMin: 0, wTrend: 1, wSetup: 1, wTrigger: 1, hold: 120, stopATR: 2.5, tpATR: 3, cooldown: 0, maxDaily: 99, maxPositions: 5, riskDivisor: 5 };
const candidates = [baseline];
const make = () => {
  const method = pick(["gated", "weighted", "additive"]);
  return { method, threshold: method === "additive" ? pick([3, 4, 5]) : method === "weighted" ? pick([4, 5, 6, 7, 8, 9]) : 0,
    context: pick(["m15", "h1", "both"]), trigger: pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]), trendMin: pick([1, 2, 3]), setupMin: pick([1, 2, 3]),
    wTrend: pick([0.5, 1, 1.5, 2]), wSetup: pick([0.5, 1, 1.5, 2]), wTrigger: pick([0.5, 1, 1.5, 2]),
    hold: pick([120, 240, 480, 720]), stopATR: pick([1.5, 2, 2.5, 3]), tpATR: pick([2, 3, 4, 5]), cooldown: pick([0, 15, 30, 60]), maxDaily: pick([1, 2, 3, 6]), maxPositions: pick([1, 2, 3, 5]), riskDivisor: pick([5, 10, 20]) };
};

const started = Date.now(), results = []; let iterations = 0;
while ((Date.now() - started) / 1000 < seconds || iterations === 0) {
  const config = candidates.shift() ?? make(); const metrics = evaluate(prepared, config); results.push({ config, metrics }); iterations += 1;
  if (iterations % 25 === 0) console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} best=${Math.max(...results.map((r) => r.metrics.objective)).toFixed(3)}`);
}
results.sort((a, b) => b.metrics.objective - a.metrics.objective);
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, baseline: results.find((r) => r.config === baseline), leaderboard: results.slice(0, 20) };
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-results.json"; fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, baseline: report.baseline, best: report.leaderboard[0] }, null, 2));
