import fs from "node:fs";

// Research-only working-order search.  It does not import or modify bot.js.
const dataset = process.env.CAPITAL_DATASET_DIR || "/private/tmp/capital-research-2026-07-23";
const seconds = Number(process.env.SEARCH_SECONDS || 1200);
const symbols = (process.env.RESEARCH_SYMBOLS || "EURUSD,GBPUSD,EURGBP,AUDUSD,USDCAD").split(",").map((v) => v.trim()).filter(Boolean);
process.env.RESEARCH_SYMBOLS = symbols.join(",");
const { prepare, evaluate } = await import("./prepare.js");
let state = Number(process.env.SEARCH_SEED || 25072026) >>> 0;
const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const reports = [
  "backtest/autoresearch/reports/trading-autoresearch-error-aware-close-execution-2026-07-25.json",
  "backtest/autoresearch/reports/trading-autoresearch-unconstrained-profit-2026-07-25.json",
  "backtest/autoresearch/reports/trading-autoresearch-daily-activity-profit-2026-07-24.json",
].map(read);
const allCandidates = (report) => [report.leaderboard, report.valid, report.highestPnLActive].flatMap((values) => values ?? []);
const seedMap = new Map();
for (const config of reports.flatMap(allCandidates).map((value) => value.config).filter(Boolean)) seedMap.set(JSON.stringify(config), config);
const seeds = [...seedMap.values()].slice(0, 100);
if (!seeds.length) throw new Error("No pending-order research seeds found.");

const sessions = [[0, 480], [420, 780], [480, 780], [600, 900], [780, 1020], [900, 1200], [480, 1020]];
const mutate = () => {
  const config = structuredClone(pick(seeds));
  delete config.currencyProfiles; delete config.sessionProfiles; delete config.regimeProfiles; delete config.regimeThresholds;
  config.symbols = symbols; config.objectiveMode = "adaptive-walk-forward"; config.startCapital = 500; config.capitalMode = "compound";
  config.maxAllowedDrawdownPct = 20; config.dailyLossLimitPct = 0.05; config.flatAtMinute = 1320;
  config.signalDelayMinutes = 0; config.entryOnSignalClose = true; config.slippagePips = pick([0.5, 1, 1.5, 2]);
  config.pendingOrderType = pick(["STOP", "STOP", "LIMIT"]);
  config.pendingOffsetATR = config.pendingOrderType === "STOP" ? pick([0, 0.1, 0.2, 0.3, 0.5]) : pick([0.1, 0.2, 0.3, 0.5, 0.75]);
  config.pendingTtlMinutes = pick([10, 15, 20, 30, 45, 60, 90, 120]);
  config.maxPendingOrders = pick([1, 2, 3, 5]); config.cancelPendingOnOpposite = true; config.replacePendingOnSameSignal = true;
  config.frames = pick([["M5", "M15", "H1"], ["M15", "H1", "H4"], ["M5", "M15", "H1", "H4"]]);
  config.method = pick(["mtf-weighted", "mtf-weighted", "mtf-majority", "mtf-strict"]);
  config.weights = config.frames.length === 4 ? pick([[1, 2, 2, 3], [1, 1, 2, 3]]) : pick([[1, 2, 3], [1, 2, 2], [2, 2, 2]]);
  config.tfMin = pick([2.3, 2.6, 2.9, 3.2]); config.alignMin = config.method === "mtf-strict" ? config.frames.length : pick([2, 2, 3]);
  config.threshold = pick([10, 12, 14, 16, 18]); config.trigger = pick(["any", "any", "Reclaim", "Cross", "RSI", "BB", "Breakout"]);
  config.componentWeights = (config.componentWeights ?? [1, 1, 1, 1, 1, 1]).map((value) => Math.max(0, value + pick([-0.5, 0, 0, 0.5])));
  if (!config.componentWeights.some(Boolean)) config.componentWeights[0] = 1;
  const window = pick(sessions); config.session = `utc-${window[0]}-${window[1]}`; config.sessionWindows = [window];
  config.stopATR = pick([1.25, 1.5, 1.75, 2, 2.25]); config.rewardRisk = pick([2, 2.5, 3, 3.5, 4]); config.tpATR = +(config.stopATR * config.rewardRisk).toFixed(2);
  config.dynamicReward = pick([true, true, false]); config.dynamicScore = pick([3.5, 4, 4.5]); config.highRewardRisk = pick([3, 4, 5]);
  config.partialR = pick([0, 0, 1.25, 1.5]); config.partialFraction = config.partialR ? pick([0.25, 0.5]) : 0; config.moveStopOnPartial = config.partialR > 0 && pick([true, false]);
  config.breakEvenR = pick([0, 0, 1.5, 2]); config.trailATR = pick([0, 0.5, 0.75, 1]); config.hold = pick([180, 240, 360, 480]);
  config.cooldown = pick([0, 15, 30, 60]); config.maxDaily = pick([1, 2, 3, 4, 6]); config.maxTotalDaily = pick([0, 2, 3, 4, 6]); config.maxPositions = pick([1, 2, 3]); config.riskDivisor = pick([3.5, 4, 4.5, 5, 6]);
  config.minAtrPct = pick([0.0002, 0.00035, 0.0005, 0.00075]); config.minBbWidthPct = pick([0.0005, 0.00075, 0.001]); config.minEmaDistPct = pick([0.0002, 0.0003, 0.0005]);
  return config;
};

const prepared = prepare(dataset), results = [];
const assess = (config, kind) => {
  const metrics = evaluate(prepared, config), p = metrics.pendingStats;
  const robust = metrics.entries >= 60 && metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 20
    && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.test.pnl > 0
    && p.activated >= 60 && p.expired + p.canceledOpposite > 0;
  const score = robust
    ? metrics.pnl * 18 + metrics.folds.validation.pnl * 16 + metrics.folds.test.pnl * 22 - metrics.maxDDPct * 16
    : -1_000_000 + metrics.pnl;
  return { kind, config, metrics, robust, score: +score.toFixed(2) };
};
for (const seed of seeds) {
  const config = { ...structuredClone(seed), symbols, pendingOrderType: "STOP", pendingOffsetATR: 0.2, pendingTtlMinutes: 30, maxPendingOrders: 3, cancelPendingOnOpposite: true, replacePendingOnSameSignal: true, signalDelayMinutes: 0, entryOnSignalClose: true, slippagePips: 1, flatAtMinute: 1320, dailyLossLimitPct: 0.05, startCapital: 500, capitalMode: "compound", maxAllowedDrawdownPct: 20 };
  results.push(assess(config, "seed"));
}
const started = Date.now();
while ((Date.now() - started) / 1000 < seconds) {
  results.push(assess(mutate(), "mutation"));
  if (results.length % 10 === 0) {
    const best = results.reduce((winner, value) => !winner || value.score > winner.score ? value : winner, null);
    console.error(`experiments=${results.length} elapsed=${((Date.now() - started) / 1000).toFixed(1)} type=${best.config.pendingOrderType} pnl=${best.metrics.pnl} test=${best.metrics.folds.test.pnl} entries=${best.metrics.entries}`);
  }
}
results.sort((left, right) => right.score - left.score);
const validated = results.filter((value) => value.kind === "mutation" && value.robust);
const directComparisons = validated.slice(0, 25).map((value) => ({
  pending: value,
  direct: assess({ ...structuredClone(value.config), pendingOrderType: "none" }, "direct-comparison"),
}));
const report = {
  generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: results.length,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  executionModel: "M1 OHLC: stop entries include adverse gap/slippage, limit entries get no price improvement, exits cannot happen in the activation minute, SL takes priority when SL and TP share a bar. Orders expire by TTL, are canceled on opposite/replacement signal, at EOD, or if capacity/risk guard is reached.",
  admission: "RR>=2, 500 EUR compounding, 0.5-2 pip adverse entry slippage, same-day flat at 22:00 UTC, 5% realized daily-loss guard, at least 60 activated entries, PF>=1.05, DD<=20%, and positive train/validation/test P/L.",
  leaderboard: results.slice(0, 50), validated: validated.slice(0, 25), directComparisons,
};
const output = process.env.REPORT_PATH || "backtest/autoresearch/reports/trading-autoresearch-pending-orders-2026-07-25.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: results.length, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
