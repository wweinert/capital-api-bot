import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

// Selection is W04…W22: W03 is partial in the available history.  W23…W26
// is never used in the ranking and is reported only after a candidate wins.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seedReport = process.env.SEED_REPORT || "backtest/autoresearch/reports/trading-autoresearch-profit-frontier-2026-07-20-r2.json";
const seconds = Number(process.env.SEARCH_SECONDS || 1200);
let state = Number(process.env.SEARCH_SEED || 22072027) >>> 0;
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

const dailyProfit = (metrics) => {
  const byWeek = new Map();
  for (const day of metrics.daily) {
    const week = isoWeek(day.day); if (week < "2026-W04" || week >= "2026-W23") continue;
    const value = byWeek.get(week) ?? { week, activeDays: 0, positiveDays: 0, losingDays: 0, pnl: 0, entries: 0 };
    value.activeDays += day.entries > 0 ? 1 : 0; value.positiveDays += day.pnl > 0 ? 1 : 0; value.losingDays += day.pnl < 0 ? 1 : 0;
    value.pnl += day.pnl; value.entries += day.entries; byWeek.set(week, value);
  }
  const weeks = [...byWeek.values()].map((week) => ({ ...week, pnl: +week.pnl.toFixed(2), qualifies: week.activeDays >= 3 && week.positiveDays >= 3, allGreen: week.activeDays >= 5 && week.positiveDays >= 5 && week.pnl > 0 }));
  const activeDays = weeks.reduce((sum, week) => sum + week.activeDays, 0), positiveDays = weeks.reduce((sum, week) => sum + week.positiveDays, 0), losingDays = weeks.reduce((sum, week) => sum + week.losingDays, 0);
  const qualifiedWeeks = weeks.filter((week) => week.qualifies).length, allGreenWeeks = weeks.filter((week) => week.allGreen).length, activeWeeks = weeks.filter((week) => week.activeDays >= 3).length;
  const pnl = weeks.reduce((sum, week) => sum + week.pnl, 0), worstWeek = Math.min(...weeks.map((week) => week.pnl));
  const greenRate = activeDays ? positiveDays / activeDays : 0;
  const profitable = pnl > 0 && metrics.profitFactor >= 1.03;
  // First satisfy profitability. Then reward green-day frequency and the 3/5
  // weekly target, while preserving a meaningful preference for high P/L.
  const quality = pnl * 2.2 + greenRate * 520 + qualifiedWeeks * 52 + allGreenWeeks * 120 + activeWeeks * 8 - losingDays * 4 - Math.max(0, -worstWeek) * 0.5 - Math.max(0, metrics.maxDDPct - 30) * 15;
  return { weeks, activeDays, positiveDays, losingDays, greenRate: +(100 * greenRate).toFixed(1), qualifiedWeeks, allGreenWeeks, activeWeeks, pnl: +pnl.toFixed(2), worstWeek: +worstWeek.toFixed(2), profitable, score: +(profitable ? quality : -10_000 + pnl).toFixed(3) };
};

const useStaticSession = (config) => {
  delete config.currencyProfiles; delete config.sessionProfiles; delete config.regimeProfiles; delete config.regimeThresholds;
  const window = pick([[0, 480], [480, 780], [780, 1020], [1020, 1260], [420, 1260]]);
  config.session = `utc-${window[0]}-${window[1]}`; config.sessionWindows = [window];
};

const makeConfig = () => {
  const config = structuredClone(pick(seeds));
  config.objectiveMode = "adaptive-walk-forward"; config.startCapital = 500; config.capitalMode = "compound"; config.maxAllowedDrawdownPct = 30;
  if (random() < 0.65) useStaticSession(config);
  const preset = pick([
    { frames: ["M5", "M15", "H1"], method: "mtf-majority", tfMin: pick([2.3, 2.6, 2.9]), alignMin: 2 },
    { frames: ["M15", "H1", "H4"], method: "mtf-strict", tfMin: pick([3.4, 3.7, 4]), alignMin: 3 },
    { frames: ["M5", "M15", "H1", "H4"], method: "mtf-majority", tfMin: pick([2.4, 2.7, 3]), alignMin: pick([2, 3]) },
    { frames: ["M5", "M15", "H1"], method: "mtf-weighted", tfMin: pick([2.2, 2.5, 2.8]), alignMin: 2, weights: pick([[1, 2, 3], [1.5, 3, 1], [2, 2, 2]]), threshold: pick([12, 14, 16]) },
  ]);
  Object.assign(config, preset);
  config.componentWeights = config.componentWeights.map((value) => Math.max(0, value + pick([-0.5, 0, 0, 0.5])));
  if (!config.componentWeights.some(Boolean)) config.componentWeights[0] = 1;
  config.trigger = pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]);
  config.stopATR = pick([1.25, 1.5, 1.75, 2]); config.rewardRisk = pick([2, 2.5, 3]); config.tpATR = +(config.stopATR * config.rewardRisk).toFixed(2);
  config.dynamicReward = pick([true, true, false]); config.dynamicScore = pick([3.5, 4, 4.5, 5]); config.highRewardRisk = pick([3, 4, 5]);
  config.breakEvenR = pick([1, 1.5, 2]); config.trailATR = pick([0, 0, 0.5, 0.75, 1]); config.hold = pick([240, 360, 480, 720, 1440]);
  config.riskDivisor = pick([2.5, 3, 3.5, 4]); config.cooldown = pick([0, 15, 30, 60]); config.maxDaily = pick([1, 2, 3]); config.maxTotalDaily = pick([1, 2, 3]); config.maxPositions = pick([1, 1, 2]);
  config.minAtrPct = pick([0.0002, 0.00035, 0.0005, 0.00075]); config.minBbWidthPct = pick([0.0005, 0.00075, 0.001, 0.0015]); config.minEmaDistPct = pick([0.0002, 0.0003, 0.0005, 0.0008]);
  return config;
};

const prepared = prepare(dataset), started = Date.now();
const results = seeds.map((config, index) => { const metrics = evaluate(prepared, config); return { kind: `seed_${index + 1}`, config, metrics, daily: dailyProfit(metrics) }; });
let iterations = results.length;
while ((Date.now() - started) / 1000 < seconds) {
  const config = makeConfig(), metrics = evaluate(prepared, config);
  results.push({ kind: "mutation", config, metrics, daily: dailyProfit(metrics) }); iterations += 1;
  if (iterations % 10 === 0) {
    const best = results.reduce((winner, result) => !winner || result.daily.score > winner.daily.score ? result : winner, null);
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} score=${best.daily.score} green=${best.daily.positiveDays}/${best.daily.activeDays} q=${best.daily.qualifiedWeeks}/19 allGreen=${best.daily.allGreenWeeks} pnl=${best.daily.pnl} test=${best.metrics.folds.test.pnl}`);
  }
}
results.sort((a, b) => b.daily.score - a.daily.score);
const prevalidated = results.filter(({ metrics, daily }) => metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 30 && metrics.entries >= 80 && daily.activeWeeks >= 15 && daily.qualifiedWeeks >= 8 && daily.pnl > 0);
const outOfSamplePassed = prevalidated.filter(({ metrics }) => metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.test.pnl > 0);
const report = {
  generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  ranking: "W04…W22 only. Ranks net P/L, active days, positive close-PnL days, >=3 green days/week; W23…W26 excluded.",
  leaderboard: results.slice(0, 50), prevalidated: prevalidated.slice(0, 25), outOfSamplePassed: outOfSamplePassed.slice(0, 25), highestPnL: [...results].sort((a, b) => b.metrics.pnl - a.metrics.pnl).slice(0, 10),
};
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-daily-profit-frontier.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0], prevalidated: report.prevalidated.length, outOfSamplePassed: report.outOfSamplePassed.length }, null, 2));
