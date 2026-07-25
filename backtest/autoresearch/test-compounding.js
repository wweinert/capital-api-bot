import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const sourceReport = process.env.SOURCE_REPORT || "/tmp/trading-autoresearch-entry-rr2-universe-10m.json";
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-compounding-500.json";
const report = JSON.parse(fs.readFileSync(sourceReport, "utf8"));
const candidate = report.leaderboard
  .filter(({ metrics }) => metrics.selection.totalR > 0 && metrics.holdout.totalR > 0 && metrics.selectionPrecision.tradesPerDay <= 3)
  .sort((a, b) => b.metrics.profitFactor - a.metrics.profitFactor)[0];

if (!candidate) throw new Error("No positive selection/holdout candidate found");
if (candidate.config.tpATR < 2 * candidate.config.stopATR) throw new Error("Candidate violates minimum 1:2 reward/risk");

const prepared = prepare(dataset, candidate.config.symbols);
const fixed = evaluate(prepared, { ...candidate.config, startCapital: 500, capitalMode: "fixed" });
const compound = evaluate(prepared, { ...candidate.config, startCapital: 500, capitalMode: "compound" });

let runningBalance = compound.startCapital;
const monthlyEquity = Object.entries(compound.monthly).map(([month, values]) => {
  const startBalance = runningBalance;
  runningBalance += values.pnl;
  return { month, startBalance: +startBalance.toFixed(2), ...values, endBalance: +runningBalance.toFixed(2), returnPct: +(100 * values.pnl / startBalance).toFixed(2) };
});

const result = {
  generatedAt: new Date().toISOString(),
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  config: candidate.config,
  fixed,
  compound: { ...compound, monthlyEquity },
};
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, period: result.period, config: result.config, fixed: { finalBalance: fixed.finalBalance, returnPct: fixed.returnPct, maxDDPct: fixed.maxDDPct }, compound: { finalBalance: compound.finalBalance, returnPct: compound.returnPct, maxDDPct: compound.maxDDPct, profitFactor: compound.profitFactor, trades: compound.trades, monthlyEquity } }, null, 2));
