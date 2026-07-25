import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
let seed = Number(process.env.SEARCH_SEED || 20072026) >>> 0;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];

const allSymbols = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const universes = [
  allSymbols,
  ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD"],
  ["EURJPY", "USDJPY", "AUDUSD", "AUDJPY", "NZDUSD", "NZDJPY"],
  ["EURUSD", "GBPUSD", "AUDUSD", "USDJPY", "EURJPY"],
  ["USDJPY", "EURJPY", "AUDJPY", "NZDJPY"],
];
// UTC windows; static session boundaries are intentional so every historical
// decision uses only information available at that timestamp.
const sessions = [
  { name: "all", windows: [[0, 0]] },
  { name: "tokyo", windows: [[0, 540]] },
  { name: "tokyo-open", windows: [[0, 180]] },
  { name: "london-open", windows: [[480, 660]] },
  { name: "london-core", windows: [[480, 780]] },
  { name: "new-york-open", windows: [[780, 960]] },
  { name: "london-new-york-overlap", windows: [[780, 1020]] },
  { name: "new-york-core", windows: [[780, 1260]] },
  { name: "london-new-york", windows: [[480, 1020]] },
  { name: "sydney", windows: [[1320, 420]] },
];
const frameSets = [["M5", "M15", "H1"], ["M15", "H1", "H4"], ["M5", "M15", "H1", "H4"]];

const randomUniverse = () => {
  if (random() < 0.45) return [...pick(universes)];
  const chosen = allSymbols.filter(() => random() < 0.55);
  while (chosen.length < 3) {
    const symbol = pick(allSymbols);
    if (!chosen.includes(symbol)) chosen.push(symbol);
  }
  return chosen.sort((a, b) => allSymbols.indexOf(a) - allSymbols.indexOf(b));
};

const makeConfig = () => {
  const frames = pick(frameSets);
  const method = pick(["mtf-majority", "mtf-weighted", "mtf-strict", "mtf-hierarchical"]);
  const componentWeights = Array.from({ length: 6 }, () => pick([0, 0.5, 1, 1.5, 2, 3]));
  if (!componentWeights.some(Boolean)) componentWeights[0] = 1;
  const maxScore = componentWeights.reduce((sum, weight) => sum + weight, 0);
  const weights = frames.map(() => pick([0.5, 1, 1.5, 2, 3]));
  const tfMin = +(maxScore * pick([0.45, 0.55, 0.65, 0.75, 0.85])).toFixed(2);
  const stopATR = pick([1, 1.25, 1.5, 2]);
  const rewardRisk = pick([2, 2.5, 3, 4]);
  const session = pick(sessions);
  return {
    mtf: true,
    objectiveMode: "session-compound",
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
    threshold: +(maxScore * weights.reduce((sum, weight) => sum + weight, 0) * pick([0.45, 0.55, 0.65, 0.75])).toFixed(2),
    highMin: tfMin,
    lowMin: +(maxScore * pick([0.35, 0.45, 0.55, 0.65])).toFixed(2),
    trigger: pick(["any", "Cross", "Reclaim", "BB", "RSI", "Breakout"]),
    hold: pick([120, 240, 480, 720, 1440]),
    stopATR,
    tpATR: +(stopATR * rewardRisk).toFixed(2),
    rewardRisk,
    cooldown: pick([15, 30, 60, 120, 240]),
    maxDaily: pick([1, 2, 3]),
    maxTotalDaily: pick([1, 2, 3, 4]),
    maxPositions: 1,
    riskDivisor: pick([5, 7.5, 10, 15]),
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
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} session=${best.config.session} selection=${best.metrics.selectionReturnPct}% forward=${best.metrics.forwardReturnPct}% dd=${best.metrics.maxDDPct}%`);
  }
}

results.sort((a, b) => b.metrics.objective - a.metrics.objective);
const qualified = results.filter(({ metrics }) => (
  metrics.selectionReturnPct > 0 && metrics.profitFactor >= 1.04 && metrics.maxDDPct <= 20
  && metrics.selectionPrecision.trades >= 45 && (metrics.holdoutPrecision.trades < 12 || metrics.forwardReturnPct >= -2)
));
const report = {
  generatedAt: new Date().toISOString(),
  searchSeconds: +((Date.now() - started) / 1000).toFixed(1),
  experiments: iterations,
  testedSymbols: allSymbols,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  selectionEndWeek: "2026-W22",
  holdoutStartWeek: "2026-W23",
  riskGuardrail: "Compounding from EUR 500; reject candidates over 20% maximum drawdown.",
  leaderboard: results.slice(0, 40),
  qualified: qualified.slice(0, 20),
};
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-session-compound.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0], qualified: report.qualified.length }, null, 2));
