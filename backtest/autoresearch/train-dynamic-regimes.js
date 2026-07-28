import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
let seed = Number(process.env.SEARCH_SEED || 22072026) >>> 0;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];

const allSymbols = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const universes = [
  allSymbols,
  ["AUDJPY", "NZDUSD", "GBPUSD", "EURUSD"],
  ["AUDUSD", "AUDJPY", "NZDUSD", "NZDJPY", "USDJPY"],
  ["EURUSD", "GBPUSD", "EURGBP", "USDCAD"],
];
const frameSets = [["M5", "M15", "H1"], ["M15", "H1", "H4"], ["M5", "M15", "H1", "H4"]];
const randomUniverse = () => {
  if (random() < 0.55) return [...pick(universes)];
  const selected = allSymbols.filter(() => random() < 0.55);
  while (selected.length < 3) { const symbol = pick(allSymbols); if (!selected.includes(symbol)) selected.push(symbol); }
  return selected.sort((a, b) => allSymbols.indexOf(a) - allSymbols.indexOf(b));
};

const profile = (enabled, tfMin, options = {}) => ({ enabled, tfMin, ...options });

const makeConfig = () => {
  const frames = pick(frameSets), method = pick(["mtf-majority", "mtf-weighted", "mtf-strict", "mtf-hierarchical"]);
  const componentWeights = Array.from({ length: 6 }, () => pick([0, 0.5, 1, 1.5, 2, 3]));
  if (!componentWeights.some(Boolean)) componentWeights[0] = 1;
  const maxScore = componentWeights.reduce((sum, value) => sum + value, 0);
  const baseTfMin = +(maxScore * pick([0.45, 0.55, 0.65, 0.75])).toFixed(2);
  const stopATR = pick([1, 1.25, 1.5, 2]);
  const enabledSessions = ["asia", "london", "overlap", "newYork"].filter(() => random() < 0.72);
  if (!enabledSessions.length) enabledSessions.push("overlap");
  const config = {
    mtf: true, objectiveMode: "adaptive-walk-forward", startCapital: 500, capitalMode: "compound", maxAllowedDrawdownPct: 20,
    symbols: randomUniverse(), sessionWindows: [[0, 0]], method, frames, componentWeights,
    weights: frames.map(() => pick([0.5, 1, 1.5, 2, 3])), tfMin: baseTfMin,
    alignMin: pick(method === "mtf-strict" ? [frames.length] : [Math.max(2, frames.length - 1), frames.length]),
    threshold: +(maxScore * pick([1.5, 2, 2.5, 3])).toFixed(2), highMin: baseTfMin, lowMin: +(maxScore * pick([0.35, 0.45, 0.55])).toFixed(2),
    trigger: pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]), hold: pick([240, 480, 720, 1440]), stopATR,
    rewardRisk: pick([2, 2.5, 3]), dynamicReward: true, dynamicScore: pick([3.5, 4, 4.5, 5]), highRewardRisk: pick([3, 4, 5]),
    breakEvenR: pick([0, 1, 1.5, 2]), trailATR: pick([0, 0.5, 1]), cooldown: pick([15, 30, 60, 120]),
    maxDaily: pick([1, 2, 3]), maxTotalDaily: pick([1, 2, 3]), maxPositions: 1, riskDivisor: pick([4, 5, 7.5, 10]),
    minAtrPct: pick([undefined, 0.00035, 0.0005, 0.00075]), minBbWidthPct: pick([undefined, 0.00075, 0.001, 0.0015]), minEmaDistPct: pick([undefined, 0.0002, 0.0003, 0.0005]),
    regimeThresholds: { highAtrPct: pick([0.0005, 0.00075, 0.001]), wideBbWidthPct: pick([0.001, 0.0015, 0.002]), trendEmaDistPct: pick([0.0003, 0.0005, 0.0008]) },
  };
  const sessionOptions = (name) => profile(enabledSessions.includes(name), +(baseTfMin * pick(name === "overlap" ? [0.8, 0.9, 1, 1.1] : [0.9, 1, 1.1, 1.2])).toFixed(2), {
    rewardRisk: pick(name === "asia" ? [2, 2.5] : [2, 2.5, 3]), highRewardRisk: pick(name === "overlap" ? [4, 5] : [3, 4, 5]),
    breakEvenR: pick([0, 1, 1.5, 2]), hold: pick(name === "asia" ? [240, 480, 720] : [480, 720, 1440]),
    minAtrPct: pick([config.minAtrPct, 0.00035, 0.0005, 0.00075]), minBbWidthPct: pick([config.minBbWidthPct, 0.00075, 0.001, 0.0015]),
  });
  config.sessionProfiles = { asia: sessionOptions("asia"), london: sessionOptions("london"), overlap: sessionOptions("overlap"), newYork: sessionOptions("newYork"), offHours: { enabled: false } };
  config.regimeProfiles = {
    trendExpansion: profile(true, +(baseTfMin * pick([0.75, 0.85, 0.95, 1])).toFixed(2), { rewardRisk: pick([2.5, 3]), highRewardRisk: pick([4, 5]), breakEvenR: pick([1.5, 2]), hold: pick([720, 1440]) }),
    trend: profile(true, +(baseTfMin * pick([0.9, 1, 1.1])).toFixed(2), { rewardRisk: pick([2, 2.5, 3]), highRewardRisk: pick([3, 4, 5]), breakEvenR: pick([1, 1.5, 2]) }),
    volatileRange: profile(pick([true, true, false]), +(baseTfMin * pick([1, 1.1, 1.2])).toFixed(2), { rewardRisk: pick([2, 2.5]), highRewardRisk: pick([3, 4]), breakEvenR: pick([0, 1, 1.5]), hold: pick([120, 240, 480]) }),
    quietRange: profile(pick([true, false, false]), +(baseTfMin * pick([1.05, 1.15, 1.25])).toFixed(2), { rewardRisk: 2, highRewardRisk: pick([2.5, 3]), breakEvenR: pick([0, 1]), hold: pick([120, 240, 480]) }),
  };
  return config;
};

const prepared = prepare(dataset);
const started = Date.now(), results = [];
let iterations = 0;
while ((Date.now() - started) / 1000 < seconds || iterations === 0) {
  const config = makeConfig(), metrics = evaluate(prepared, config);
  results.push({ config, metrics }); iterations += 1;
  if (iterations % 25 === 0) {
    const best = results.reduce((winner, result) => !winner || result.metrics.objective > winner.metrics.objective ? result : winner, null);
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} train=${best.metrics.folds.train.pnl} validation=${best.metrics.folds.validation.pnl} test=${best.metrics.folds.test.pnl} dd=${best.metrics.maxDDPct}% sessions=${JSON.stringify(best.metrics.sessionStats)}`);
  }
}
results.sort((a, b) => b.metrics.objective - a.metrics.objective);
const validated = results.filter(({ metrics }) => metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 20 && metrics.selectionPrecision.trades >= 55 && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.validation.positiveWeeks >= 4);
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations, testedSymbols: allSymbols, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, folds: { train: "2026-W03…W14", validation: "2026-W15…W22", test: "2026-W23…W26 (not used in ranking)" }, leaderboard: results.slice(0, 50), validated: validated.slice(0, 25) };
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-dynamic-regimes.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
