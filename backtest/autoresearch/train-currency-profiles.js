import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
let seed = Number(process.env.SEARCH_SEED || 25072026) >>> 0;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];
const symbols = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const groups = ["europe", "jpy", "commodity", "cad"];

const baseline = {
  mtf: true, objectiveMode: "adaptive-walk-forward", startCapital: 500, capitalMode: "compound", maxAllowedDrawdownPct: 20,
  symbols, session: "london-new-york-overlap", sessionWindows: [[780, 1020]], method: "mtf-strict", frames: ["M15", "H1", "H4"], componentWeights: [0.5, 1.5, 0, 1.5, 1, 1.5], weights: [1.5, 3, 1],
  tfMin: 3.9, alignMin: 3, threshold: 24.75, highMin: 3.9, lowMin: 2.7, trigger: "any", hold: 1440, stopATR: 1.5, rewardRisk: 2.5, tpATR: 3.75,
  dynamicReward: true, dynamicScore: 4.5, highRewardRisk: 5, breakEvenR: 2, trailATR: 0, cooldown: 30, maxDaily: 2, maxTotalDaily: 1, maxPositions: 1, riskDivisor: 4,
  minAtrPct: 0.0005, minBbWidthPct: 0.00075, minEmaDistPct: 0.0005,
};

const groupProfile = () => ({
  enabled: random() < 0.95,
  tfMinDelta: pick([-0.35, -0.2, 0, 0.2, 0.35]), rewardRiskDelta: pick([-0.5, 0, 0.5]), highRewardRiskDelta: pick([-1, 0, 1]),
  stopAtrMultiplier: pick([0.9, 1, 1.1]), breakEvenR: pick([undefined, 1.5, 2]), atrMultiplier: pick([0.9, 1, 1.1]), bbWidthMultiplier: pick([0.9, 1, 1.1]),
  componentWeightMultipliers: Array.from({ length: 6 }, () => pick([0.8, 0.9, 1, 1.1, 1.2])),
});

const withSessionProfiles = (config) => {
  const enabled = ["asia", "london", "overlap", "newYork"].filter((name) => name === "overlap" || random() < 0.65);
  return {
    ...config, session: "dynamic", sessionWindows: [[0, 0]],
    sessionProfiles: {
      asia: { enabled: enabled.includes("asia"), tfMin: +(config.tfMin * pick([0.95, 1, 1.05])).toFixed(2), rewardRisk: pick([2, 2.5]), highRewardRisk: pick([3, 4]), breakEvenR: pick([1.5, 2]), hold: pick([480, 720]) },
      london: { enabled: enabled.includes("london"), tfMin: +(config.tfMin * pick([0.95, 1, 1.05])).toFixed(2), rewardRisk: pick([2, 2.5, 3]), highRewardRisk: pick([3, 4, 5]), breakEvenR: pick([1.5, 2]), hold: pick([720, 1440]) },
      overlap: { enabled: true, tfMin: +(config.tfMin * pick([0.85, 0.95, 1])).toFixed(2), rewardRisk: pick([2.5, 3]), highRewardRisk: pick([4, 5]), breakEvenR: pick([1.5, 2]), hold: pick([720, 1440]) },
      newYork: { enabled: enabled.includes("newYork"), tfMin: +(config.tfMin * pick([0.95, 1, 1.05])).toFixed(2), rewardRisk: pick([2, 2.5, 3]), highRewardRisk: pick([3, 4, 5]), breakEvenR: pick([1.5, 2]), hold: pick([480, 720, 1440]) },
      offHours: { enabled: false },
    },
  };
};

const withRegimes = (config) => ({
  ...config,
  regimeThresholds: { highAtrPct: pick([0.0005, 0.00075, 0.001]), wideBbWidthPct: pick([0.001, 0.0015, 0.002]), trendEmaDistPct: pick([0.0003, 0.0005, 0.0008]) },
  regimeProfiles: {
    trendExpansion: { enabled: true, tfMin: +(config.tfMin * pick([0.8, 0.9, 1])).toFixed(2), rewardRisk: pick([2.5, 3]), highRewardRisk: pick([4, 5]), breakEvenR: 2, hold: pick([720, 1440]) },
    trend: { enabled: true, tfMin: +(config.tfMin * pick([0.9, 1, 1.1])).toFixed(2), rewardRisk: pick([2, 2.5, 3]), highRewardRisk: pick([3, 4, 5]), breakEvenR: pick([1.5, 2]) },
    volatileRange: { enabled: pick([true, false]), tfMin: +(config.tfMin * pick([1, 1.1, 1.2])).toFixed(2), rewardRisk: 2, highRewardRisk: pick([3, 4]), breakEvenR: pick([1, 1.5]), hold: pick([240, 480]) },
    quietRange: { enabled: false, tfMin: +(config.tfMin * 1.15).toFixed(2), rewardRisk: 2, highRewardRisk: 3, breakEvenR: 1, hold: 240 },
  },
});

const makeConfig = () => {
  let config = structuredClone(baseline);
  config.componentWeights = config.componentWeights.map((value) => Math.max(0, value + pick([-0.5, 0, 0, 0.5])));
  if (!config.componentWeights.some(Boolean)) config.componentWeights[0] = 1;
  config.tfMin = +(config.tfMin + pick([-0.4, -0.2, 0, 0.2, 0.4])).toFixed(2);
  config.stopATR = pick([1.25, 1.5, 1.75, 2]); config.rewardRisk = pick([2, 2.5, 3]); config.tpATR = +(config.stopATR * config.rewardRisk).toFixed(2);
  config.highRewardRisk = pick([4, 5]); config.dynamicScore = pick([4, 4.5, 5]); config.breakEvenR = pick([1.5, 2]); config.hold = pick([720, 1440]);
  config.riskDivisor = pick([3.5, 4, 5]); config.cooldown = pick([15, 30, 60]); config.maxDaily = pick([1, 2]); config.maxTotalDaily = pick([1, 2]);
  config.minAtrPct = pick([0.00035, 0.0005, 0.00075]); config.minBbWidthPct = pick([0.00075, 0.001, 0.0015]); config.minEmaDistPct = pick([0.0003, 0.0005, 0.0008]);
  config.currencyProfiles = Object.fromEntries(groups.map((group) => [group, groupProfile()]));
  if (!Object.values(config.currencyProfiles).some((profile) => profile.enabled)) config.currencyProfiles.jpy.enabled = true;
  if (random() < 0.65) config = withSessionProfiles(config);
  if (random() < 0.7) config = withRegimes(config);
  return config;
};

const prepared = prepare(dataset);
const started = Date.now(), results = [{ config: baseline, metrics: evaluate(prepared, baseline), kind: "baseline" }];
let iterations = 1;
while ((Date.now() - started) / 1000 < seconds) {
  const config = makeConfig(), metrics = evaluate(prepared, config);
  results.push({ config, metrics, kind: "mutation" }); iterations += 1;
  if (iterations % 10 === 0) {
    const best = results.reduce((winner, result) => !winner || result.metrics.objective > winner.metrics.objective ? result : winner, null);
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} kind=${best.kind} train=${best.metrics.folds.train.pnl} validation=${best.metrics.folds.validation.pnl} test=${best.metrics.folds.test.pnl} dd=${best.metrics.maxDDPct}%`);
  }
}
results.sort((a, b) => b.metrics.objective - a.metrics.objective);
const validated = results.filter(({ metrics }) => metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 20 && metrics.entries >= 55 && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.validation.positiveWeeks >= 4);
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations, baseline: results.find((result) => result.kind === "baseline"), period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, folds: { train: "2026-W03…W14", validation: "2026-W15…W22", test: "2026-W23…W26 (not used in ranking)" }, leaderboard: results.slice(0, 50), validated: validated.slice(0, 25) };
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-currency-profiles.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, baseline: report.baseline.metrics, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
