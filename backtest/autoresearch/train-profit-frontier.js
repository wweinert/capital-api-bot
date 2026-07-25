import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seedReport = process.env.SEED_REPORT || "backtest/autoresearch/reports/trading-autoresearch-currency-profiles-2026-07-20.json";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
let seed = Number(process.env.SEARCH_SEED || 26072026) >>> 0;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];

const source = JSON.parse(fs.readFileSync(seedReport, "utf8"));
const baseSeed = source.baseline.config;
const currencySeed = source.leaderboard.find((result) => result.kind === "mutation")?.config;
const seeds = [baseSeed, currencySeed].filter(Boolean);

const mutateProfile = (profile) => {
  profile.tfMinDelta += pick([-0.2, -0.1, 0, 0.1, 0.2]);
  profile.rewardRiskDelta += pick([-0.5, 0, 0.5]);
  profile.highRewardRiskDelta += pick([-1, 0, 1]);
  profile.stopAtrMultiplier *= pick([0.9, 1, 1.1]);
  profile.atrMultiplier *= pick([0.9, 1, 1.1]);
  profile.bbWidthMultiplier *= pick([0.9, 1, 1.1]);
  profile.componentWeightMultipliers = profile.componentWeightMultipliers.map((value) => Math.max(0.6, Math.min(1.4, value * pick([0.9, 1, 1.1]))));
};

const makeConfig = () => {
  const config = structuredClone(pick(seeds));
  config.componentWeights = config.componentWeights.map((value) => Math.max(0, value + pick([-0.5, 0, 0, 0.5])));
  if (!config.componentWeights.some(Boolean)) config.componentWeights[0] = 1;
  config.tfMin = +(config.tfMin + pick([-0.3, -0.15, 0, 0.15, 0.3])).toFixed(2);
  config.stopATR = pick([1.25, 1.5, 1.75, 2]); config.rewardRisk = pick([2, 2.5, 3]); config.tpATR = +(config.stopATR * config.rewardRisk).toFixed(2);
  config.highRewardRisk = pick([4, 5]); config.dynamicScore = pick([4, 4.5, 5]); config.breakEvenR = pick([1.5, 2]); config.hold = pick([720, 1440]);
  config.riskDivisor = pick([3, 3.5, 4, 4.5, 5]); config.cooldown = pick([15, 30, 60]); config.maxDaily = pick([1, 2]); config.maxTotalDaily = pick([1, 2]);
  config.minAtrPct = pick([0.00035, 0.0005, 0.00075]); config.minBbWidthPct = pick([0.00075, 0.001, 0.0015]); config.minEmaDistPct = pick([0.0003, 0.0005, 0.0008]);
  if (config.currencyProfiles) Object.values(config.currencyProfiles).forEach(mutateProfile);
  if (config.sessionProfiles) {
    for (const [name, profile] of Object.entries(config.sessionProfiles)) {
      if (name === "offHours") continue;
      profile.tfMin += pick([-0.2, 0, 0.2]); profile.rewardRisk = pick([2, 2.5, 3]); profile.highRewardRisk = pick([3, 4, 5]); profile.breakEvenR = pick([1.5, 2]); profile.hold = pick([480, 720, 1440]);
      if (name !== "overlap" && random() < 0.15) profile.enabled = !profile.enabled;
    }
    config.sessionProfiles.overlap.enabled = true;
  }
  if (config.regimeProfiles) {
    config.regimeProfiles.trend.tfMin += pick([-0.2, 0, 0.2]); config.regimeProfiles.trend.rewardRisk = pick([2, 2.5, 3]);
    config.regimeProfiles.trendExpansion.tfMin += pick([-0.2, 0, 0.2]); config.regimeProfiles.trendExpansion.highRewardRisk = pick([4, 5]);
    config.regimeProfiles.volatileRange.enabled = pick([true, false]);
  }
  return config;
};

const score = (metrics) => {
  const validationPenalty = metrics.folds.validation.pnl <= 0 ? Math.abs(metrics.folds.validation.pnl) * 4 : 0;
  const trainPenalty = metrics.folds.train.pnl <= 0 ? Math.abs(metrics.folds.train.pnl) * 3 : 0;
  const ddPenalty = metrics.maxDDPct > 20 ? (metrics.maxDDPct - 20) * 10 : 0;
  return metrics.selectionReturnPct * 4 + metrics.folds.validation.pnl * 2 + metrics.profitFactor * 5 - validationPenalty - trainPenalty - ddPenalty;
};

const prepared = prepare(dataset);
const started = Date.now();
const results = seeds.map((config, index) => ({ kind: `seed_${index + 1}`, config, metrics: evaluate(prepared, config) }));
for (const result of results) result.score = score(result.metrics);
let iterations = results.length;
while ((Date.now() - started) / 1000 < seconds) {
  const config = makeConfig(), metrics = evaluate(prepared, config);
  results.push({ kind: "mutation", config, metrics, score: score(metrics) }); iterations += 1;
  if (iterations % 10 === 0) {
    const best = results.reduce((winner, result) => !winner || result.score > winner.score ? result : winner, null);
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} score=${best.score.toFixed(1)} selection=${best.metrics.selectionReturnPct}% validation=${best.metrics.folds.validation.pnl} test=${best.metrics.folds.test.pnl} dd=${best.metrics.maxDDPct}%`);
  }
}
results.sort((a, b) => b.score - a.score);
const validated = results.filter(({ metrics }) => metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 20 && metrics.entries >= 55 && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.validation.positiveWeeks >= 4);
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations, seeds: results.filter((result) => result.kind.startsWith("seed")), period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, folds: { train: "2026-W03…W14", validation: "2026-W15…W22", test: "2026-W23…W26 (not used in ranking)" }, leaderboard: results.slice(0, 50), validated: validated.slice(0, 25) };
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-profit-frontier.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
