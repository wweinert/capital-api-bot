import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const reportPath = process.env.REPORT_PATH || "/tmp/trading-autoresearch-mtf-10m.json";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const bestSelection = report.leaderboard[0];
const robust = report.leaderboard.find(({ metrics }) => metrics.selection.totalR > 0 && metrics.holdout.totalR > 0);
const prepared = prepare(dataset);

const analyze = (entry) => {
  if (!entry) return null;
  const metrics = evaluate(prepared, entry.config);
  const months = Object.entries(metrics.monthly).map(([month, values]) => ({ month, ...values }));
  return {
    config: entry.config,
    totalPnl: metrics.pnl,
    bestMonth: months.reduce((best, month) => !best || month.pnl > best.pnl ? month : best, null),
    worstMonth: months.reduce((worst, month) => !worst || month.pnl < worst.pnl ? month : worst, null),
    months,
  };
};

console.log(JSON.stringify({ robust: analyze(robust), bestSelection: analyze(bestSelection) }, null, 2));
