import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
let seed = Number(process.env.SEARCH_SEED || 21072026) >>> 0;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];

const allSymbols = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const universes = [
  allSymbols,
  ["AUDUSD", "AUDJPY", "NZDJPY", "USDJPY"],
  ["AUDUSD", "NZDUSD", "USDJPY", "EURJPY", "AUDJPY", "NZDJPY"],
  ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD"],
  ["EURUSD", "GBPUSD", "AUDUSD", "USDJPY", "EURJPY"],
];
const sessions = [
  { name: "all", windows: [[0, 0]] },
  { name: "tokyo", windows: [[0, 540]] },
  { name: "london-open", windows: [[480, 660]] },
  { name: "london-core", windows: [[480, 780]] },
  { name: "new-york-open", windows: [[780, 960]] },
  { name: "london-new-york-overlap", windows: [[780, 1020]] },
  { name: "new-york-core", windows: [[780, 1260]] },
  { name: "london-new-york", windows: [[480, 1020]] },
];
const frameSets = [["M5", "M15", "H1"], ["M15", "H1", "H4"], ["M5", "M15", "H1", "H4"]];

const randomUniverse = () => {
  if (random() < 0.55) return [...pick(universes)];
  const selected = allSymbols.filter(() => random() < 0.52);
  while (selected.length < 3) {
    const symbol = pick(allSymbols);
    if (!selected.includes(symbol)) selected.push(symbol);
  }
  return selected.sort((a, b) => allSymbols.indexOf(a) - allSymbols.indexOf(b));
};

const makeConfig = () => {
  const frames = pick(frameSets);
  const method = pick(["mtf-majority", "mtf-weighted", "mtf-strict", "mtf-hierarchical"]);
  const componentWeights = Array.from({ length: 6 }, () => pick([0, 0.5, 1, 1.5, 2, 3]));
  if (!componentWeights.some(Boolean)) componentWeights[0] = 1;
  const maxScore = componentWeights.reduce((sum, value) => sum + value, 0);
  const weights = frames.map(() => pick([0.5, 1, 1.5, 2, 3]));
  const tfMin = +(maxScore * pick([0.45, 0.55, 0.65, 0.75, 0.85])).toFixed(2);
  const stopATR = pick([1, 1.25, 1.5, 2]);
  const rewardRisk = pick([2, 2.5, 3]);
  const dynamicReward = random() < 0.6;
  const session = pick(sessions);
  return {
    mtf: true,
    objectiveMode: "adaptive-walk-forward",
    startCapital: 500,
    capitalMode: "compound",
    maxAllowedDrawdownPct: 20,
    symbols: randomUniverse(),
    session: session.name,
    sessionWindows: session.windows,
    method,
    frames,
    componentWeights,
    weights,
    tfMin,
    alignMin: pick(method === "mtf-strict" ? [frames.length] : [Math.max(2, frames.length - 1), frames.length]),
    threshold: +(maxScore * weights.reduce((sum, value) => sum + value, 0) * pick([0.45, 0.55, 0.65, 0.75])).toFixed(2),
    highMin: tfMin,
    lowMin: +(maxScore * pick([0.35, 0.45, 0.55, 0.65])).toFixed(2),
    trigger: pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]),
    hold: pick([120, 240, 480, 720, 1440]),
    stopATR,
    rewardRisk,
    tpATR: +(stopATR * rewardRisk).toFixed(2),
    dynamicReward,
    dynamicScore: pick([3.5, 4, 4.5, 5]),
    highRewardRisk: pick([3, 4, 5]),
    breakEvenR: pick([0, 0, 1, 1.5, 2]),
    trailATR: pick([0, 0, 0.5, 1, 1.5]),
    cooldown: pick([15, 30, 60, 120, 240]),
    maxDaily: pick([1, 2, 3]),
    maxTotalDaily: pick([1, 2, 3, 4]),
    maxPositions: 1,
    riskDivisor: pick([4, 5, 7.5, 10, 15]),
    minAtrPct: pick([undefined, 0.00035, 0.0005, 0.00075, 0.001]),
    minBbWidthPct: pick([undefined, 0.00075, 0.001, 0.0015, 0.002]),
    minEmaDistPct: pick([undefined, 0.0002, 0.0003, 0.0005, 0.0008]),
  };
};

const prepared = prepare(dataset);
const started = Date.now();
const results = [];
let iterations = 0;
while ((Date.now() - started) / 1000 < seconds || iterations === 0) {
  const config = makeConfig();
  const metrics = evaluate(prepared, config);
  results.push({ config, metrics });
  iterations += 1;
  if (iterations % 25 === 0) {
    const best = results.reduce((winner, result) => !winner || result.metrics.objective > winner.metrics.objective ? result : winner, null);
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} session=${best.config.session} train=${best.metrics.folds.train.pnl} validation=${best.metrics.folds.validation.pnl} test=${best.metrics.folds.test.pnl} dd=${best.metrics.maxDDPct}%`);
  }
}

results.sort((a, b) => b.metrics.objective - a.metrics.objective);
const validated = results.filter(({ metrics }) => (
  metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 20 && metrics.selectionPrecision.trades >= 55
  && metrics.folds.validation.pnl > 0 && metrics.folds.validation.positiveWeeks >= 4
));
const report = {
  generatedAt: new Date().toISOString(),
  searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations,
  testedSymbols: allSymbols,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  folds: { train: "2026-W03…W14", validation: "2026-W15…W22", test: "2026-W23…W26 (not used in ranking)" },
  riskGuardrail: "Compounding from EUR 500; candidates over 20% maximum drawdown are penalized.",
  leaderboard: results.slice(0, 50),
  validated: validated.slice(0, 25),
};
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-adaptive-walk-forward.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
