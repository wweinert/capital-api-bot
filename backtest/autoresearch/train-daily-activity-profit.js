import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 1200);
const symbols = (process.env.RESEARCH_SYMBOLS || "EURUSD,GBPUSD,EURGBP,AUDUSD,USDCAD").split(",").map((value) => value.trim()).filter(Boolean);
const activeFloor = Number(process.env.ACTIVE_DAYS_MIN || 85);
const maximizeActiveProfit = process.env.OBJECTIVE === "active-profit";
const unconstrainedProfit = process.env.OBJECTIVE === "unconstrained-profit";
const errorAwareProfit = process.env.OBJECTIVE === "error-aware-profit";
const liveFrequency = process.env.LIVE_FREQUENCY === "1";
const minAverageEntries = Number(process.env.MIN_AVERAGE_DAILY_ENTRIES || 0);
const maxAverageEntries = Number(process.env.MAX_AVERAGE_DAILY_ENTRIES || Infinity);
const seedLimit = Number(process.env.SEED_LIMIT || 60);
let state = Number(process.env.SEARCH_SEED || 24072026) >>> 0;
const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const reports = [
  "backtest/autoresearch/reports/trading-autoresearch-unconstrained-profit-2026-07-25.json",
  "backtest/autoresearch/reports/trading-autoresearch-daily-activity-profit-2026-07-24.json",
  "backtest/autoresearch/reports/trading-autoresearch-actual-five-rr2-2026-07-23.json",
  "backtest/autoresearch/reports/trading-autoresearch-confirmed-reversal-2026-07-23.json",
  "backtest/autoresearch/reports/trading-autoresearch-position-management-2026-07-23.json",
].map(read);
const candidates = (report) => [report.leaderboard, report.validated, report.prevalidated, report.testPositive, report.outOfSamplePassed, report.highestPnL].flatMap((items) => items ?? []);
const rawSeedMap = new Map();
for (const config of reports.flatMap(candidates).map((result) => result.config).filter(Boolean)) rawSeedMap.set(JSON.stringify(config), config);
const rawSeeds = [...rawSeedMap.values()].slice(0, seedLimit);
// Partial exits increase green-day frequency in some regimes, but previous
// ablations found several profit leaders only after they were removed. Seed
// both forms so the search can decide under the chosen objective.
const seeds = rawSeeds.flatMap((config) => [config, { ...structuredClone(config), partialR: 0, partialFraction: 0, moveStopOnPartial: false }]);
if (!seeds.length) throw new Error("No research seeds found.");

const isoWeek = (day) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
  const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const number = 1 + Math.round(((date - week1) / 86_400_000 - 3 + (week1.getUTCDay() + 6) % 7) / 7);
  return `${date.getUTCFullYear()}-W${String(number).padStart(2, "0")}`;
};

const activity = (metrics) => {
  const days = metrics.daily.filter((day) => isoWeek(day.day) >= "2026-W04" && isoWeek(day.day) < "2026-W23");
  const active = days.filter((day) => day.entries > 0).length;
  const green = days.filter((day) => day.pnl > 0).length;
  const red = days.filter((day) => day.pnl < 0).length;
  const entries = days.reduce((sum, day) => sum + day.entries, 0);
  const averageEntries = entries / Math.max(active, 1);
  const pnl = days.reduce((sum, day) => sum + day.pnl, 0);
  const worst = Math.min(...days.map((day) => day.pnl));
  const weekly = new Map();
  for (const day of days) {
    const key = isoWeek(day.day), current = weekly.get(key) ?? { active: 0, green: 0, pnl: 0 };
    current.active += day.entries > 0 ? 1 : 0; current.green += day.pnl > 0 ? 1 : 0; current.pnl += day.pnl;
    weekly.set(key, current);
  }
  const activeWeeks = [...weekly.values()].filter((week) => week.active >= 4).length;
  const threeGreenWeeks = [...weekly.values()].filter((week) => week.green >= 3 && week.pnl > 0).length;
  const profitableAcrossFolds = metrics.profitFactor >= 1.05 && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.test.pnl > 0;
  const valid = (unconstrainedProfit || errorAwareProfit)
    ? metrics.entries >= 80 && metrics.maxDDPct <= (errorAwareProfit ? 20 : 25) && profitableAcrossFolds
    : active >= activeFloor && activeWeeks >= 15 && averageEntries >= minAverageEntries && averageEntries <= maxAverageEntries && metrics.maxDDPct <= 20 && profitableAcrossFolds;
  // Activity is a hard admission rule. Within admitted candidates, maximize
  // profit while retaining a preference for green days and a small penalty for
  // severe red days.
  const score = valid
    ? errorAwareProfit
      ? metrics.pnl * 17 + metrics.folds.validation.pnl * 14 + metrics.folds.test.pnl * 20 - metrics.maxDDPct * 16
      : unconstrainedProfit
      ? metrics.pnl * 18 + metrics.folds.validation.pnl * 12 + metrics.folds.test.pnl * 18 - metrics.maxDDPct * 12
      : maximizeActiveProfit
      ? metrics.pnl * 16 + metrics.folds.test.pnl * 16 + green * 22 + active * 12 + threeGreenWeeks * 18 - red * 10 - Math.max(0, -worst)
      : metrics.pnl * 8 + green * 45 + active * 20 + metrics.folds.test.pnl * 8 + threeGreenWeeks * 35 - red * 20 - Math.max(0, -worst) * 2
    : -1_000_000 + metrics.pnl;
  return { active, green, red, entries, averageEntries: +averageEntries.toFixed(2), greenRate: +(100 * green / Math.max(active, 1)).toFixed(1), pnl: +pnl.toFixed(2), worstDay: +worst.toFixed(2), activeWeeks, threeGreenWeeks, valid, score: +score.toFixed(2) };
};

const mutate = () => {
  const config = structuredClone(pick(seeds));
  delete config.currencyProfiles; delete config.sessionProfiles; delete config.regimeProfiles; delete config.regimeThresholds;
  config.symbols = symbols;
  config.objectiveMode = "adaptive-walk-forward"; config.startCapital = 500; config.capitalMode = "compound"; config.maxAllowedDrawdownPct = unconstrainedProfit ? 25 : 20;
  config.frames = pick([["M5", "M15", "H1"], ["M15", "H1", "H4"], ["M5", "M15", "H1", "H4"]]);
  config.method = pick(["mtf-weighted", "mtf-weighted", "mtf-majority", "mtf-strict"]);
  config.weights = pick([[1, 2, 3], [1.5, 3, 1], [2, 2, 2], [1, 2, 2, 3]]);
  config.tfMin = pick([2.3, 2.6, 2.9, 3.2]); config.alignMin = config.method === "mtf-strict" ? config.frames.length : pick([2, 2, 3]);
  config.threshold = pick([12, 14, 16, 18]); config.trigger = pick(["any", "any", "Reclaim", "Cross", "RSI", "BB"]);
  config.componentWeights = (config.componentWeights ?? [1, 1, 1, 1, 1, 1]).map((value) => Math.max(0, value + pick([-0.5, 0, 0, 0.5])));
  if (!config.componentWeights.some(Boolean)) config.componentWeights[0] = 1;
  const window = pick(unconstrainedProfit ? [[0, 480], [480, 780], [780, 1020], [1020, 1260], [420, 1260], [0, 1440]] : [[480, 780], [780, 1020], [1020, 1260], [480, 1020]]);
  config.session = `utc-${window[0]}-${window[1]}`; config.sessionWindows = [window];
  config.stopATR = pick(unconstrainedProfit ? [1.25, 1.5, 1.75, 2, 2.25] : [1.5, 1.75, 2]); config.rewardRisk = pick(unconstrainedProfit ? [2, 2.5, 3, 3.5, 4] : [2, 2, 2.5, 3]); config.tpATR = +(config.stopATR * config.rewardRisk).toFixed(2);
  config.dynamicReward = pick([true, true, false]); config.dynamicScore = pick([3.5, 4, 4.5]); config.highRewardRisk = pick([3, 4, 5]);
  config.partialR = pick([0, 0, 1.25, 1.5]); config.partialFraction = config.partialR ? pick([0.25, 0.5]) : 0; config.moveStopOnPartial = config.partialR > 0 && pick([true, false]);
  config.breakEvenR = pick([0, 0, 1.5, 2]); config.trailATR = pick([0, 0.5, 0.75, 1]); config.hold = pick([180, 240, 360, 480]);
  config.flipEnabled = pick([false, true, true]); config.flipMinLossR = pick([0.5, 0.75, 1]); config.flipMaxPerDay = pick([1, 1, 2]);
  if (liveFrequency) { config.cooldown = 0; config.maxDaily = 99; config.maxTotalDaily = 0; config.maxPositions = 5; config.dailyLossLimitPct = 0.05; }
  else if (unconstrainedProfit || errorAwareProfit) { config.cooldown = pick([0, 15, 30, 60]); config.maxDaily = pick([1, 2, 3, 4, 6]); config.maxTotalDaily = pick([0, 2, 3, 4, 6]); config.maxPositions = pick(errorAwareProfit ? [1, 2] : [1, 2, 3]); }
  else { config.cooldown = pick([0, 15, 30]); config.maxDaily = pick([2, 3]); config.maxTotalDaily = pick([2, 3]); config.maxPositions = pick([1, 2]); }
  config.riskDivisor = pick(unconstrainedProfit ? [3, 3.5, 4, 4.5, 5, 6] : errorAwareProfit ? [3.5, 4, 4.5, 5, 6] : [4, 5, 6]);
  if (errorAwareProfit) { config.signalDelayMinutes = 0; config.entryOnSignalClose = true; config.slippagePips = pick([0.5, 1, 1.5, 2]); config.flatAtMinute = 1320; config.dailyLossLimitPct = 0.05; }
  config.minAtrPct = pick([0.0002, 0.00035, 0.0005, 0.00075]); config.minBbWidthPct = pick([0.0005, 0.00075, 0.001]); config.minEmaDistPct = pick([0.0002, 0.0003, 0.0005]);
  return config;
};

const prepared = prepare(dataset), results = [];
const assess = (config, kind) => { const metrics = evaluate(prepared, config); return { kind, config, metrics, activity: activity(metrics) }; };
for (const seed of seeds) {
  const config = { ...seed, symbols };
  if (liveFrequency) Object.assign(config, { cooldown: 0, maxDaily: 99, maxTotalDaily: 0, maxPositions: 5, dailyLossLimitPct: 0.05 });
  if (errorAwareProfit) Object.assign(config, { signalDelayMinutes: 0, entryOnSignalClose: true, slippagePips: 1, flatAtMinute: 1320, dailyLossLimitPct: 0.05, maxAllowedDrawdownPct: 20 });
  results.push(assess(config, "seed"));
}
const started = Date.now();
while ((Date.now() - started) / 1000 < seconds) {
  results.push(assess(mutate(), "mutation"));
  if (results.length % 10 === 0) {
    const best = results.reduce((winner, result) => !winner || result.activity.score > winner.activity.score ? result : winner, null);
    console.error(`experiments=${results.length} elapsed=${((Date.now() - started) / 1000).toFixed(1)} active=${best.activity.active} green=${best.activity.green} pnl=${best.metrics.pnl} test=${best.metrics.folds.test.pnl}`);
  }
}
results.sort((left, right) => right.activity.score - left.activity.score);
const valid = results.filter((result) => result.kind === "mutation" && result.activity.valid);
const report = {
  generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: results.length,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  ranking: errorAwareProfit
    ? "Error-aware profit frontier: close-of-signal-candle entry with 0.5-2 pip adverse slippage, conservative stop fills, mandatory same-day flat close, 5% daily realized-loss guard, RR>=2, positive train/validation/test and drawdown <=20%."
    : unconstrainedProfit
    ? "Strategy-independent profit frontier: RR>=2, at least 80 entries, PF>=1.05, drawdown <=25%, and positive train/validation/test; ranks total plus forward P/L."
    : `Requires >=${activeFloor} active days and >=15 weeks with four active days across W04-W22, RR>=2, positive train/validation/test and PF>=1.05; ${liveFrequency ? `average daily entries must be ${minAverageEntries}…${maxAverageEntries}, with no daily entry cap and five concurrent positions. ` : ""}Then ${maximizeActiveProfit ? "prioritizes total and forward P/L" : "balances P/L with green-day frequency"}.`,
  leaderboard: results.slice(0, 50), valid: valid.slice(0, 25), highestPnLActive: [...results].filter((result) => result.activity.active >= activeFloor && result.activity.valid).sort((left, right) => right.metrics.pnl - left.metrics.pnl).slice(0, 25),
};
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-daily-activity-profit.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: results.length, best: report.leaderboard[0], valid: report.valid.length }, null, 2));
