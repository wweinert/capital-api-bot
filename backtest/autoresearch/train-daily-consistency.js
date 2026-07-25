import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

// Ranking uses only W03…W22.  W23…W26 stays a locked out-of-sample check.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seedReport = process.env.SEED_REPORT || "backtest/autoresearch/reports/trading-autoresearch-profit-frontier-2026-07-20-r2.json";
const seconds = Number(process.env.SEARCH_SECONDS || 900);
let state = Number(process.env.SEARCH_SEED || 22072026) >>> 0;
const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];

const source = JSON.parse(fs.readFileSync(seedReport, "utf8"));
const seeds = source.seeds.map((result) => result.config).filter(Boolean);
if (!seeds.length) throw new Error(`No seed configurations in ${seedReport}`);

const isoWeek = (day) => {
  const date = new Date(`${day}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
  const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - week1) / 86_400_000 - 3 + (week1.getUTCDay() + 6) % 7) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const dailyConsistency = (metrics) => {
  const byWeek = new Map();
  for (const day of metrics.daily) {
    const week = isoWeek(day.day); if (week < "2026-W03" || week >= "2026-W23") continue;
    const value = byWeek.get(week) ?? { week, activeDays: 0, positiveDays: 0, pnl: 0, entries: 0 };
    value.activeDays += day.entries > 0 ? 1 : 0; value.positiveDays += day.pnl > 0 ? 1 : 0;
    value.pnl += day.pnl; value.entries += day.entries; byWeek.set(week, value);
  }
  const weeks = [...byWeek.values()].map((week) => ({ ...week, pnl: +week.pnl.toFixed(2), qualifies: week.activeDays >= 3 && week.positiveDays >= 3 }));
  const qualifiedWeeks = weeks.filter((week) => week.qualifies).length, activeWeeks = weeks.filter((week) => week.activeDays >= 3).length;
  const activeDays = weeks.reduce((sum, week) => sum + week.activeDays, 0), positiveDays = weeks.reduce((sum, week) => sum + week.positiveDays, 0);
  const totalPnl = weeks.reduce((sum, week) => sum + week.pnl, 0), worstWeek = Math.min(...weeks.map((week) => week.pnl));
  // Trades must be frequent, but gains must be spread over days rather than
  // coming from one outsized take-profit.  No holdout value enters this score.
  const profitable = totalPnl > 0 && metrics.profitFactor >= 1.03;
  const quality = qualifiedWeeks * 48 + activeWeeks * 8 + positiveDays * 2 + activeDays * 0.75 + totalPnl * 2 - Math.max(0, -worstWeek) * 0.8 - Math.max(0, metrics.maxDDPct - 30) * 12;
  // Green-day frequency never compensates for a losing strategy.
  const score = profitable ? quality : -10_000 + totalPnl;
  return { weeks, qualifiedWeeks, activeWeeks, activeDays, positiveDays, totalPnl: +totalPnl.toFixed(2), worstWeek: +worstWeek.toFixed(2), profitable, score: +score.toFixed(3) };
};

const staticSetup = (config) => {
  delete config.currencyProfiles; delete config.sessionProfiles; delete config.regimeProfiles; delete config.regimeThresholds;
  config.session = "active-day"; config.sessionWindows = [[420, 1260]]; // 07:00–21:00 UTC
};

const makeConfig = () => {
  const config = structuredClone(pick(seeds));
  config.objectiveMode = "adaptive-walk-forward"; config.startCapital = 500; config.capitalMode = "compound";
  config.maxAllowedDrawdownPct = 30;
  if (random() < 0.55) staticSetup(config);
  const preset = pick([
    { frames: ["M5", "M15", "H1"], method: "mtf-majority", tfMin: pick([2.4, 2.7, 3]), alignMin: 2 },
    { frames: ["M15", "H1", "H4"], method: "mtf-strict", tfMin: pick([3.4, 3.7, 4]), alignMin: 3 },
    { frames: ["M5", "M15", "H1", "H4"], method: "mtf-majority", tfMin: pick([2.5, 2.8, 3.1]), alignMin: pick([2, 3]) },
  ]);
  Object.assign(config, preset);
  config.componentWeights = config.componentWeights.map((value) => Math.max(0, value + pick([-0.5, 0, 0, 0.5])));
  if (!config.componentWeights.some(Boolean)) config.componentWeights[0] = 1;
  config.stopATR = pick([1.25, 1.5, 1.75, 2]); config.rewardRisk = pick([2, 2.5, 3]); config.tpATR = +(config.stopATR * config.rewardRisk).toFixed(2);
  config.dynamicReward = pick([true, true, false]); config.dynamicScore = pick([3.5, 4, 4.5]); config.highRewardRisk = pick([3, 4, 5]);
  config.breakEvenR = pick([1, 1.5, 2]); config.hold = pick([360, 480, 720, 1440]); config.trailATR = pick([0, 0, 0.75, 1]);
  // Lower divisor means larger position sizing.  The search keeps an explicit
  // 30% drawdown cap rather than treating higher risk as unlimited risk.
  config.riskDivisor = pick([2.5, 3, 3.5, 4]);
  config.cooldown = pick([0, 15, 30, 60]); config.maxDaily = pick([1, 2, 3]); config.maxTotalDaily = pick([1, 2, 3]); config.maxPositions = pick([1, 1, 2]);
  config.minAtrPct = pick([0.00025, 0.00035, 0.0005, 0.00075]); config.minBbWidthPct = pick([0.0005, 0.00075, 0.001, 0.0015]); config.minEmaDistPct = pick([0.0002, 0.0003, 0.0005, 0.0008]);
  return config;
};

const prepared = prepare(dataset), started = Date.now();
const results = seeds.map((config, index) => { const metrics = evaluate(prepared, config); return { kind: `seed_${index + 1}`, config, metrics, daily: dailyConsistency(metrics) }; });
let iterations = results.length;
while ((Date.now() - started) / 1000 < seconds) {
  const config = makeConfig(), metrics = evaluate(prepared, config);
  results.push({ kind: "mutation", config, metrics, daily: dailyConsistency(metrics) }); iterations += 1;
  if (iterations % 10 === 0) {
    const best = results.reduce((winner, result) => !winner || result.daily.score > winner.daily.score ? result : winner, null);
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} score=${best.daily.score} qualified=${best.daily.qualifiedWeeks}/20 active=${best.daily.activeDays} positive=${best.daily.positiveDays} pnl=${best.daily.totalPnl} test=${best.metrics.folds.test.pnl}`);
  }
}
results.sort((a, b) => b.daily.score - a.daily.score);
const validated = results.filter(({ metrics, daily }) => metrics.profitFactor >= 1.03 && metrics.maxDDPct <= 30 && metrics.entries >= 80 && daily.activeWeeks >= 14 && daily.qualifiedWeeks >= 7 && daily.positiveDays >= 35);
const report = {
  generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  ranking: "Pre-test W03…W22 only: seeks >=3 active and >=3 positive close-PnL days per trading week. W23…W26 is locked.",
  leaderboard: results.slice(0, 50), validated: validated.slice(0, 25), highestPnL: [...results].sort((a, b) => b.metrics.pnl - a.metrics.pnl).slice(0, 10),
};
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-daily-consistency.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
