import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

// The final four weeks are a locked test set.  Ranking only uses W03…W22,
// subdivided into five consecutive four-week blocks to avoid a single lucky
// month dominating selection.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const seedReport = process.env.SEED_REPORT || "backtest/autoresearch/reports/trading-autoresearch-profit-frontier-2026-07-20-r2.json";
const seconds = Number(process.env.SEARCH_SECONDS || 600);
let state = Number(process.env.SEARCH_SEED || 21072026) >>> 0;
const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(random() * values.length)];

const source = JSON.parse(fs.readFileSync(seedReport, "utf8"));
const seeds = source.seeds.map((result) => result.config).filter(Boolean);
if (!seeds.length) throw new Error(`No seed configurations in ${seedReport}`);

const blocks = [["2026-W03", "2026-W06"], ["2026-W07", "2026-W10"], ["2026-W11", "2026-W14"], ["2026-W15", "2026-W18"], ["2026-W19", "2026-W22"]];
const stability = (metrics) => {
  const values = blocks.map(([from, to]) => {
    const weeks = metrics.weekly.filter(({ week }) => week >= from && week <= to);
    const pnl = weeks.reduce((sum, week) => sum + week.pnl, 0);
    return { from, to, pnl: +pnl.toFixed(2), positiveWeeks: weeks.filter((week) => week.pnl > 0).length };
  });
  const pnl = values.map((block) => block.pnl), sorted = [...pnl].sort((a, b) => a - b);
  const total = pnl.reduce((sum, value) => sum + value, 0), median = sorted[Math.floor(sorted.length / 2)], worst = sorted[0];
  const positiveBlocks = pnl.filter((value) => value > 0).length;
  // A good total still matters, but a negative block is expensive.  This score
  // deliberately never reads W23…W26.
  const score = total + median * 2 + worst * 1.5 + positiveBlocks * 14 - Math.max(0, metrics.maxDDPct - 15) * 7;
  return { values, total: +total.toFixed(2), median: +median.toFixed(2), worst: +worst.toFixed(2), positiveBlocks, score: +score.toFixed(3) };
};

const mutateProfile = (profile) => {
  profile.tfMinDelta = +(profile.tfMinDelta + pick([-0.2, -0.1, 0, 0.1, 0.2])).toFixed(2);
  profile.rewardRiskDelta += pick([-0.5, 0, 0.5]);
  profile.highRewardRiskDelta += pick([-1, 0, 1]);
  profile.stopAtrMultiplier *= pick([0.9, 1, 1.1]);
  profile.atrMultiplier *= pick([0.9, 1, 1.1]);
  profile.bbWidthMultiplier *= pick([0.9, 1, 1.1]);
  profile.componentWeightMultipliers = profile.componentWeightMultipliers.map((value) => Math.max(0.6, Math.min(1.4, value * pick([0.9, 1, 1.1]))));
};

const makeConfig = () => {
  const config = structuredClone(pick(seeds));
  config.objectiveMode = "adaptive-walk-forward";
  config.componentWeights = config.componentWeights.map((value) => Math.max(0, value + pick([-0.5, 0, 0, 0.5])));
  if (!config.componentWeights.some(Boolean)) config.componentWeights[0] = 1;
  config.tfMin = +(config.tfMin + pick([-0.3, -0.15, 0, 0.15, 0.3])).toFixed(2);
  config.stopATR = pick([1.25, 1.5, 1.75, 2]);
  config.rewardRisk = pick([2, 2.5, 3]); config.tpATR = +(config.stopATR * config.rewardRisk).toFixed(2);
  config.highRewardRisk = pick([4, 5]); config.dynamicScore = pick([4, 4.5, 5]); config.breakEvenR = pick([1.5, 2]);
  config.hold = pick([720, 1440]); config.riskDivisor = pick([3.5, 4, 4.5, 5]);
  config.cooldown = pick([15, 30, 60]); config.maxDaily = pick([1, 2]); config.maxTotalDaily = pick([1, 2]);
  config.minAtrPct = pick([0.00035, 0.0005, 0.00075]); config.minBbWidthPct = pick([0.00075, 0.001, 0.0015]); config.minEmaDistPct = pick([0.0003, 0.0005, 0.0008]);
  if (config.currencyProfiles) Object.values(config.currencyProfiles).forEach(mutateProfile);
  if (config.sessionProfiles) {
    for (const [name, profile] of Object.entries(config.sessionProfiles)) {
      if (name === "offHours") continue;
      profile.tfMin += pick([-0.2, 0, 0.2]); profile.rewardRisk = pick([2, 2.5, 3]); profile.highRewardRisk = pick([3, 4, 5]); profile.breakEvenR = pick([1.5, 2]); profile.hold = pick([480, 720, 1440]);
      if (name !== "overlap" && random() < 0.1) profile.enabled = !profile.enabled;
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

const prepared = prepare(dataset), started = Date.now();
const results = seeds.map((config, index) => {
  const metrics = evaluate(prepared, config); return { kind: `seed_${index + 1}`, config, metrics, stability: stability(metrics) };
});
let iterations = results.length;
while ((Date.now() - started) / 1000 < seconds) {
  const config = makeConfig(), metrics = evaluate(prepared, config);
  results.push({ kind: "mutation", config, metrics, stability: stability(metrics) }); iterations += 1;
  if (iterations % 10 === 0) {
    const best = results.reduce((winner, result) => !winner || result.stability.score > winner.stability.score ? result : winner, null);
    console.error(`experiments=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} robust=${best.stability.score} blocks=${best.stability.positiveBlocks}/5 total=${best.stability.total} worst=${best.stability.worst} test=${best.metrics.folds.test.pnl}`);
  }
}
results.sort((a, b) => b.stability.score - a.stability.score);
const validated = results.filter(({ metrics, stability: s }) => metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 20 && metrics.entries >= 55 && s.positiveBlocks >= 4 && s.worst >= -20);
const report = {
  generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), experiments: iterations,
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  ranking: "Five pre-test blocks W03…W22; W23…W26 excluded from rank and shown only after selection.", blocks,
  leaderboard: results.slice(0, 50), validated: validated.slice(0, 25), highestPnL: [...results].sort((a, b) => b.metrics.pnl - a.metrics.pnl).slice(0, 10),
};
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-robust-weekly.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, experiments: iterations, best: report.leaderboard[0], validated: report.validated.length }, null, 2));
