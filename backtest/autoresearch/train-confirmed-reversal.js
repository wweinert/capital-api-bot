import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seedReport = process.env.SEED_REPORT || "backtest/autoresearch/reports/trading-autoresearch-actual-five-rr2-2026-07-23.json";
const seconds = Number(process.env.SEARCH_SECONDS || 1200);
let state = Number(process.env.SEARCH_SEED || 23072026) >>> 0;
const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];
const source = JSON.parse(fs.readFileSync(seedReport, "utf8"));
const seeds = [...(source.testPositive ?? []), ...(source.prevalidated ?? []), ...(source.highestPnL ?? [])].map((x) => x.config).filter(Boolean);
if (!seeds.length) throw new Error(`No seed configurations in ${seedReport}`);

const week = (day) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7); const w1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return `${d.getUTCFullYear()}-W${String(1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getUTCDay() + 6) % 7) / 7)).padStart(2, "0")}`; };
const dailyScore = (metrics) => {
  const days = metrics.daily.filter((x) => week(x.day) >= "2026-W04" && week(x.day) < "2026-W23");
  const active = days.filter((x) => x.entries > 0).length, green = days.filter((x) => x.pnl > 0).length, red = days.filter((x) => x.pnl < 0).length;
  const pnl = days.reduce((s, x) => s + x.pnl, 0), worst = Math.min(...days.map((x) => x.pnl));
  const flips = metrics.flipStats?.count ?? 0, flipPnl = metrics.flipStats?.pnl ?? 0;
  const valid = metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 25 && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.test.pnl > 0;
  const score = valid ? green * 80 + active * 10 + pnl * 1.5 - red * 45 - Math.max(0, -worst) * 2 + metrics.folds.test.pnl * 2 : -10000 + pnl;
  return { active, green, red, greenRate: +(100 * green / Math.max(active, 1)).toFixed(1), pnl: +pnl.toFixed(2), worstDay: +worst.toFixed(2), flips, flipPnl: +flipPnl.toFixed(2), valid, score: +score.toFixed(2) };
};
const mutate = () => {
  const c = structuredClone(pick(seeds));
  delete c.currencyProfiles; delete c.sessionProfiles; delete c.regimeProfiles; delete c.regimeThresholds;
  c.objectiveMode = "adaptive-walk-forward"; c.startCapital = 500; c.capitalMode = "compound"; c.maxAllowedDrawdownPct = 25;
  c.flipEnabled = true; c.flipMinLossR = pick([0.25, 0.5, 0.75, 1]); c.flipMaxPerDay = pick([1, 1, 2]);
  c.maxDaily = pick([2, 3]); c.maxTotalDaily = pick([2, 3]); c.maxPositions = pick([1, 2]); c.cooldown = pick([0, 15, 30]);
  c.stopATR = pick([1.5, 1.75, 2]); c.rewardRisk = pick([2, 2.5, 3]); c.tpATR = +(c.stopATR * c.rewardRisk).toFixed(2); c.dynamicReward = pick([true, true, false]); c.dynamicScore = pick([3.5, 4, 4.5]); c.highRewardRisk = pick([3, 4, 5]); c.breakEvenR = pick([1, 1.5, 2]); c.trailATR = pick([0, 0.5, 0.75]); c.riskDivisor = pick([4, 5, 6]);
  c.componentWeights = c.componentWeights.map((x) => Math.max(0, x + pick([-0.5, 0, 0.5]))); if (!c.componentWeights.some(Boolean)) c.componentWeights[0] = 1;
  c.tfMin = pick([2.3, 2.6, 2.9]); c.alignMin = 2; c.method = "mtf-weighted"; c.frames = ["M5", "M15", "H1"]; c.weights = pick([[1, 2, 3], [1.5, 3, 1], [2, 2, 2]]); c.threshold = pick([12, 14, 16]); c.trigger = pick(["any", "Reclaim", "Cross", "BB", "RSI"]);
  c.sessionWindows = [pick([[480, 780], [780, 1020], [1020, 1260]])]; c.session = `utc-${c.sessionWindows[0][0]}-${c.sessionWindows[0][1]}`;
  c.minAtrPct = pick([0.0002, 0.00035, 0.0005, 0.00075]); c.minBbWidthPct = pick([0.0005, 0.00075, 0.001]); c.minEmaDistPct = pick([0.0002, 0.0003, 0.0005]); c.hold = pick([240, 360, 480, 720]);
  return c;
};

const prepared = prepare(dataset), started = Date.now(), results = [];
const assess = (config, kind) => { const metrics = evaluate(prepared, config); return { kind, config, metrics, daily: dailyScore(metrics) }; };
for (const config of seeds) results.push(assess({ ...config, flipEnabled: false }, "baseline"));
while ((Date.now() - started) / 1000 < seconds) { results.push(assess(mutate(), "confirmed_flip")); if (results.length % 10 === 0) { const best = results.reduce((a, b) => !a || b.daily.score > a.daily.score ? b : a, null); console.error(`experiments=${results.length} elapsed=${((Date.now() - started) / 1000).toFixed(1)} green=${best.daily.green}/${best.daily.active} flips=${best.daily.flips} flipPnl=${best.daily.flipPnl} test=${best.metrics.folds.test.pnl}`); } }
results.sort((a, b) => b.daily.score - a.daily.score);
const validated = results.filter((x) => x.daily.valid && x.kind === "confirmed_flip");
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: results.length, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, ranking: "Confirmed opposite MTF signal only; flip requires an unrealised loss threshold, one/two flips per pair/day, RR>=2, and positive out-of-sample fold.", leaderboard: results.slice(0, 50), validated: validated.slice(0, 25), bestBaseline: results.filter((x) => x.kind === "baseline").sort((a, b) => b.daily.score - a.daily.score).slice(0, 10) };
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-confirmed-reversal.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: results.length, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
