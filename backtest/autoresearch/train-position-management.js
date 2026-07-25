import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 1200);
let state = Number(process.env.SEARCH_SEED || 24072027) >>> 0;
const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
const pick = (xs) => xs[Math.floor(random() * xs.length)];
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const reports = [
  process.env.SEED_REPORT || "backtest/autoresearch/reports/trading-autoresearch-actual-five-rr2-2026-07-23.json",
  "backtest/autoresearch/reports/trading-autoresearch-confirmed-reversal-2026-07-23.json",
].map(read);
const seeds = reports.flatMap((r) => [...(r.testPositive ?? []), ...(r.prevalidated ?? []), ...(r.validated ?? []), ...(r.highestPnL ?? []), ...(r.leaderboard ?? [])]).map((x) => x.config).filter(Boolean);
if (!seeds.length) throw new Error("No management seeds.");
const week = (day) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7); const w1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return `${d.getUTCFullYear()}-W${String(1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getUTCDay() + 6) % 7) / 7)).padStart(2, "0")}`; };
const daily = (m) => {
  const d = m.daily.filter((x) => week(x.day) >= "2026-W04" && week(x.day) < "2026-W23"), active = d.filter((x) => x.entries > 0).length, green = d.filter((x) => x.pnl > 0).length, red = d.filter((x) => x.pnl < 0).length;
  const pnl = d.reduce((s, x) => s + x.pnl, 0), worst = Math.min(...d.map((x) => x.pnl));
  const valid = m.profitFactor >= 1.05 && m.maxDDPct <= 25 && m.folds.train.pnl > 0 && m.folds.validation.pnl > 0 && m.folds.test.pnl > 0;
  return { active, green, red, greenRate: +(100 * green / Math.max(active, 1)).toFixed(1), pnl: +pnl.toFixed(2), worstDay: +worst.toFixed(2), valid,
    score: +(valid ? green * 90 + active * 8 + pnl * 1.8 + m.folds.test.pnl * 2 - red * 40 - Math.max(0, -worst) * 2 : -10000 + pnl).toFixed(2) };
};
const mutate = () => {
  const c = structuredClone(pick(seeds));
  delete c.currencyProfiles; delete c.sessionProfiles; delete c.regimeProfiles; delete c.regimeThresholds;
  c.objectiveMode = "adaptive-walk-forward"; c.startCapital = 500; c.capitalMode = "compound"; c.maxAllowedDrawdownPct = 25;
  c.frames = ["M5", "M15", "H1"]; c.method = "mtf-weighted"; c.weights = pick([[1, 2, 3], [1.5, 3, 1], [2, 2, 2]]); c.tfMin = pick([2.3, 2.6, 2.9]); c.alignMin = 2; c.threshold = pick([12, 14, 16]); c.trigger = pick(["any", "Reclaim", "Cross", "BB", "RSI"]);
  c.componentWeights = c.componentWeights.map((x) => Math.max(0, x + pick([-0.5, 0, 0.5]))); if (!c.componentWeights.some(Boolean)) c.componentWeights[0] = 1;
  const window = pick([[480, 780], [780, 1020], [1020, 1260]]); c.session = `utc-${window[0]}-${window[1]}`; c.sessionWindows = [window];
  c.stopATR = pick([1.5, 1.75, 2]); c.rewardRisk = pick([2, 2.5, 3]); c.tpATR = +(c.stopATR * c.rewardRisk).toFixed(2); c.dynamicReward = pick([true, true, false]); c.dynamicScore = pick([3.5, 4, 4.5]); c.highRewardRisk = pick([3, 4, 5]);
  c.partialR = pick([0, 1, 1.25, 1.5, 2]); c.partialFraction = c.partialR ? pick([0.25, 0.5, 0.75]) : 0; c.moveStopOnPartial = c.partialR > 0 && pick([true, true, false]); c.breakEvenR = pick([0, 1, 1.5, 2]); c.trailATR = pick([0, 0.5, 0.75, 1, 1.25]); c.hold = pick([180, 240, 360, 480, 720]);
  c.flipEnabled = pick([false, true, true]); c.flipMinLossR = pick([0.25, 0.5, 0.75, 1]); c.flipMaxPerDay = pick([1, 1, 2]); c.cooldown = pick([0, 15, 30]); c.maxDaily = pick([2, 3]); c.maxTotalDaily = pick([2, 3]); c.maxPositions = pick([1, 2]); c.riskDivisor = pick([4, 5, 6]);
  c.minAtrPct = pick([0.0002, 0.00035, 0.0005, 0.00075]); c.minBbWidthPct = pick([0.0005, 0.00075, 0.001]); c.minEmaDistPct = pick([0.0002, 0.0003, 0.0005]);
  return c;
};
const prepared = prepare(dataset), started = Date.now(), results = [];
const assess = (config, kind) => { const metrics = evaluate(prepared, config); return { kind, config, metrics, daily: daily(metrics) }; };
for (const config of seeds) results.push(assess(config, "seed"));
while ((Date.now() - started) / 1000 < seconds) { results.push(assess(mutate(), "management")); if (results.length % 10 === 0) { const b = results.reduce((a, x) => !a || x.daily.score > a.daily.score ? x : a, null); console.error(`experiments=${results.length} elapsed=${((Date.now() - started) / 1000).toFixed(1)} green=${b.daily.green}/${b.daily.active} pnl=${b.metrics.pnl} test=${b.metrics.folds.test.pnl} partial=${b.metrics.partialExits} flips=${b.metrics.flipStats.count}`); } }
results.sort((a, b) => b.daily.score - a.daily.score);
const validated = results.filter((x) => x.kind === "management" && x.daily.valid);
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: results.length, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, ranking: "Daily green active days first, then total/forward P&L. Tests partial TP, break-even, ATR trail, timed exit and confirmed reversal; all entries RR>=2.", leaderboard: results.slice(0, 50), validated: validated.slice(0, 25), highestPnL: [...results].sort((a, b) => b.metrics.pnl - a.metrics.pnl).slice(0, 15) };
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-position-management.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: results.length, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
