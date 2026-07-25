import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
let seed = Number(process.env.SEARCH_SEED || 24072026) >>> 0;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];

const allSymbols = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const universes = [allSymbols, ["AUDJPY", "NZDUSD", "GBPUSD", "EURUSD"], ["AUDUSD", "AUDJPY", "NZDUSD", "NZDJPY", "USDJPY"], ["EURUSD", "GBPUSD", "EURGBP", "USDCAD"]];
const sessions = [
  { name: "all", windows: [[0, 0]] }, { name: "tokyo", windows: [[0, 540]] }, { name: "london-core", windows: [[480, 780]] },
  { name: "new-york-open", windows: [[780, 960]] }, { name: "london-new-york-overlap", windows: [[780, 1020]] }, { name: "new-york-core", windows: [[780, 1260]] }, { name: "london-new-york", windows: [[480, 1020]] },
];
const frameSets = [["M5", "M15", "H1"], ["M15", "H1", "H4"], ["M5", "M15", "H1", "H4"]];
const randomUniverse = () => {
  if (random() < 0.55) return [...pick(universes)];
  const selected = allSymbols.filter(() => random() < 0.55);
  while (selected.length < 3) { const symbol = pick(allSymbols); if (!selected.includes(symbol)) selected.push(symbol); }
  return selected.sort((a, b) => allSymbols.indexOf(a) - allSymbols.indexOf(b));
};

const makeConfig = () => {
  const frames = pick(frameSets), method = pick(["mtf-majority", "mtf-weighted", "mtf-strict", "mtf-hierarchical"]);
  const componentWeights = Array.from({ length: 6 }, () => pick([0, 0.5, 1, 1.5, 2, 3]));
  if (!componentWeights.some(Boolean)) componentWeights[0] = 1;
  const maxScore = componentWeights.reduce((sum, value) => sum + value, 0), stopATR = pick([1, 1.25, 1.5, 2]), session = pick(sessions);
  const partialR = pick([0, 1, 1.25, 1.5, 2]);
  return {
    mtf: true, objectiveMode: "adaptive-walk-forward", startCapital: 500, capitalMode: "compound", maxAllowedDrawdownPct: 20,
    symbols: randomUniverse(), session: session.name, sessionWindows: session.windows, method, frames, componentWeights, weights: frames.map(() => pick([0.5, 1, 1.5, 2, 3])),
    tfMin: +(maxScore * pick([0.45, 0.55, 0.65, 0.75, 0.85])).toFixed(2), alignMin: pick(method === "mtf-strict" ? [frames.length] : [Math.max(2, frames.length - 1), frames.length]),
    threshold: +(maxScore * pick([1.5, 2, 2.5, 3])).toFixed(2), highMin: +(maxScore * pick([0.45, 0.55, 0.65])).toFixed(2), lowMin: +(maxScore * pick([0.35, 0.45, 0.55])).toFixed(2),
    trigger: pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]), hold: pick([240, 480, 720, 1440]), stopATR, rewardRisk: pick([2, 2.5, 3]), dynamicReward: random() < 0.6, dynamicScore: pick([3.5, 4, 4.5, 5]), highRewardRisk: pick([3, 4, 5]),
    breakEvenR: pick([0, 1, 1.5, 2]), trailATR: pick([0, 0.5, 1, 1.5]), partialR, partialFraction: partialR ? pick([0.25, 0.5, 0.75]) : 0, moveStopOnPartial: random() < 0.7,
    cooldown: pick([15, 30, 60, 120, 240]), maxDaily: pick([1, 2, 3]), maxTotalDaily: pick([1, 2, 3, 4]), maxPositions: 1, riskDivisor: pick([4, 5, 7.5, 10]),
    minAtrPct: pick([undefined, 0.00035, 0.0005, 0.00075, 0.001]), minBbWidthPct: pick([undefined, 0.00075, 0.001, 0.0015, 0.002]), minEmaDistPct: pick([undefined, 0.0002, 0.0003, 0.0005, 0.0008]),
  };
};

const prepared = prepare(dataset);
const started = Date.now(), results = [];
let iterations = 0;
while ((Date.now() - started) / 1000 < seconds || iterations === 0) {
  const config = makeConfig(), metrics = evaluate(prepared, config);
  results.push({ config, metrics }); iterations += 1;
  if (iterations % 20 === 0) {
    const best = results.reduce((winner, result) => !winner || result.metrics.objective > winner.metrics.objective ? result : winner, null);
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} session=${best.config.session} train=${best.metrics.folds.train.pnl} validation=${best.metrics.folds.validation.pnl} test=${best.metrics.folds.test.pnl} partial=${best.metrics.partialExits} dd=${best.metrics.maxDDPct}%`);
  }
}
results.sort((a, b) => b.metrics.objective - a.metrics.objective);
const validated = results.filter(({ metrics }) => metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 20 && metrics.entries >= 55 && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.validation.positiveWeeks >= 4);
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations, testedSymbols: allSymbols, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, folds: { train: "2026-W03…W14", validation: "2026-W15…W22", test: "2026-W23…W26 (not used in ranking)" }, leaderboard: results.slice(0, 50), validated: validated.slice(0, 25) };
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-partial-exits.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
