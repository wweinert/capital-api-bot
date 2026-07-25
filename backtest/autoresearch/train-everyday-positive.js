import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seedReport = process.env.SEED_REPORT || "backtest/autoresearch/reports/trading-autoresearch-daily-portfolio-2026-07-22.json";
const seconds = Number(process.env.SEARCH_SECONDS || 1200);
let state = Number(process.env.SEARCH_SEED || 22072030) >>> 0;
const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];
const source = JSON.parse(fs.readFileSync(seedReport, "utf8"));
const seeds = [...(source.testPositive ?? []), ...(source.prevalidated ?? []), ...(source.highestPnL ?? [])].map((result) => result.config).filter(Boolean);
if (!seeds.length) throw new Error(`No seed configurations in ${seedReport}`);
const isoWeek = (day) => { const date = new Date(`${day}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7); const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4)); const week = 1 + Math.round(((date - week1) / 86_400_000 - 3 + (week1.getUTCDay() + 6) % 7) / 7); return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`; };
const strictDaily = (metrics) => {
  const days = metrics.daily.filter((day) => { const week = isoWeek(day.day); return week >= "2026-W04" && week < "2026-W23"; });
  const active = days.filter((day) => day.entries > 0).length, green = days.filter((day) => day.entries > 0 && day.pnl > 0).length, failures = days.length - green, noTrade = days.length - active, red = days.filter((day) => day.pnl < 0).length;
  const pnl = days.reduce((sum, day) => sum + day.pnl, 0), worstDay = Math.min(...days.map((day) => day.pnl));
  const profitable = pnl > 0 && metrics.profitFactor >= 1.03;
  // A failed day receives a much larger penalty than additional P/L. This
  // prevents the search from substituting one large win for daily regularity.
  const score = profitable ? green * 120 + active * 12 + pnl * 1.5 - failures * 80 - noTrade * 100 - red * 25 - Math.max(0, -worstDay) * 2 : -10_000 + pnl;
  return { days: days.length, active, green, failures, noTrade, red, pnl: +pnl.toFixed(2), worstDay: +worstDay.toFixed(2), perfect: green === days.length, profitable, score: +score.toFixed(3) };
};
const makeConfig = () => {
  const config = structuredClone(pick(seeds)); delete config.currencyProfiles; delete config.sessionProfiles; delete config.regimeProfiles; delete config.regimeThresholds;
  config.objectiveMode = "adaptive-walk-forward"; config.startCapital = 500; config.capitalMode = "compound"; config.maxAllowedDrawdownPct = 25;
  const window = pick([[420, 1260], [480, 780], [780, 1020], [1020, 1260]]); config.session = `utc-${window[0]}-${window[1]}`; config.sessionWindows = [window];
  const preset = pick([
    { frames: ["M5", "M15", "H1"], method: "mtf-majority", tfMin: pick([2.2, 2.5, 2.8]), alignMin: 2 },
    { frames: ["M5", "M15", "H1"], method: "mtf-weighted", tfMin: pick([2.2, 2.5, 2.8]), alignMin: 2, weights: pick([[1, 2, 3], [1.5, 3, 1], [2, 2, 2]]), threshold: pick([12, 14, 16]) },
    { frames: ["M15", "H1", "H4"], method: "mtf-strict", tfMin: pick([3.4, 3.7, 4]), alignMin: 3 },
  ]); Object.assign(config, preset);
  config.componentWeights = config.componentWeights.map((value) => Math.max(0, value + pick([-0.5, 0, 0, 0.5]))); if (!config.componentWeights.some(Boolean)) config.componentWeights[0] = 1;
  config.trigger = pick(["any", "Reclaim", "Cross", "BB", "RSI", "Breakout"]); config.stopATR = pick([1.25, 1.5, 1.75, 2]); config.rewardRisk = pick([2, 2.5, 3]); config.tpATR = +(config.stopATR * config.rewardRisk).toFixed(2); config.dynamicReward = pick([true, true, false]); config.dynamicScore = pick([3.5, 4, 4.5]); config.highRewardRisk = pick([3, 4, 5]); config.breakEvenR = pick([1, 1.5, 2]); config.trailATR = pick([0, 0.5, 0.75, 1]); config.hold = pick([240, 360, 480, 720]);
  config.maxPositions = pick([1, 2, 3]); config.maxTotalDaily = pick([1, 2, 3]); config.maxDaily = pick([1, 2]); config.riskDivisor = pick([4, 5, 6]); config.cooldown = pick([0, 15, 30]); config.minAtrPct = pick([0.0002, 0.00035, 0.0005, 0.00075]); config.minBbWidthPct = pick([0.0005, 0.00075, 0.001, 0.0015]); config.minEmaDistPct = pick([0.0002, 0.0003, 0.0005, 0.0008]);
  return config;
};
const prepared = prepare(dataset), started = Date.now();
const results = seeds.map((config, index) => { const metrics = evaluate(prepared, config); return { kind: `seed_${index + 1}`, config, metrics, daily: strictDaily(metrics) }; });
let iterations = results.length;
while ((Date.now() - started) / 1000 < seconds) { const config = makeConfig(), metrics = evaluate(prepared, config); results.push({ kind: "mutation", config, metrics, daily: strictDaily(metrics) }); iterations += 1; if (iterations % 10 === 0) { const best = results.reduce((winner, result) => !winner || result.daily.score > winner.daily.score ? result : winner, null); console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} green=${best.daily.green}/${best.daily.days} active=${best.daily.active} failures=${best.daily.failures} pnl=${best.daily.pnl} test=${best.metrics.folds.test.pnl}`); } }
results.sort((a, b) => b.daily.score - a.daily.score);
const prevalidated = results.filter(({ metrics, daily }) => metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 25 && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && daily.active >= 85 && daily.green >= 60);
const testPositive = prevalidated.filter(({ metrics }) => metrics.folds.test.pnl > 0);
const perfect = results.filter(({ daily }) => daily.perfect);
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, ranking: "Strict W04…W22: every business day must have an entry and positive realized P/L. W23…W26 excluded from ranking.", leaderboard: results.slice(0, 50), prevalidated: prevalidated.slice(0, 25), testPositive: testPositive.slice(0, 25), perfect: perfect.slice(0, 25) };
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-everyday-positive.json"; fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0], prevalidated: report.prevalidated.length, testPositive: report.testPositive.length, perfect: report.perfect.length }, null, 2));
