import fs from "node:fs";

// Fixed ablation of the report named by the user. It deliberately keeps that
// report's signal, pairs, sizing and position-management settings unchanged;
// only the entry mechanism becomes a working order.
const dataset = process.env.CAPITAL_DATASET_DIR || "/private/tmp/capital-research-2026-07-23";
const sourcePath = "backtest/autoresearch/reports/trading-autoresearch-unconstrained-profit-2026-07-25.json";
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const sourceSection = process.env.SOURCE_SECTION || "valid";
const sourceIndex = Number(process.env.SOURCE_INDEX || 0);
const sourceCandidate = source[sourceSection]?.[sourceIndex] ?? source.valid?.[0] ?? source.leaderboard?.[0];
if (!sourceCandidate?.config) throw new Error("No source configuration found in unconstrained-profit report.");
const base = structuredClone(sourceCandidate.config);
process.env.RESEARCH_SYMBOLS = base.symbols.join(",");
const { prepare, evaluate } = await import("./prepare.js");
const prepared = prepare(dataset);

const summarize = (label, config) => {
  const metrics = evaluate(prepared, config);
  return {
    label, config, metrics,
    robust: metrics.entries >= 80 && metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 25
      && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.test.pnl > 0,
  };
};
const direct = summarize("direct", { ...base, pendingOrderType: "none" });
const variants = [direct];
const ttls = [5, 10, 15, 20, 30, 45, 60, 90, 120];
for (const [type, offsets] of [["STOP", [0, 0.05, 0.1, 0.2, 0.3, 0.5]], ["LIMIT", [0.1, 0.2, 0.3, 0.5, 0.75, 1]]]) {
  for (const pendingOffsetATR of offsets) for (const pendingTtlMinutes of ttls) {
    variants.push(summarize(`${type}-${pendingOffsetATR}atr-${pendingTtlMinutes}m`, {
      ...base, pendingOrderType: type, pendingOffsetATR, pendingTtlMinutes,
      maxPendingOrders: base.maxPositions, cancelPendingOnOpposite: true, replacePendingOnSameSignal: true,
    }));
  }
}
const score = (result) => result.robust
  ? result.metrics.pnl * 18 + result.metrics.folds.validation.pnl * 14 + result.metrics.folds.test.pnl * 20 - result.metrics.maxDDPct * 12
  : -1_000_000 + result.metrics.pnl;
variants.sort((a, b) => score(b) - score(a));
const strict = (result) => summarize(`${result.label}-strict-execution`, {
  ...result.config, signalDelayMinutes: 0, entryOnSignalClose: true, slippagePips: 1,
  flatAtMinute: 1320, dailyLossLimitPct: 0.05, maxAllowedDrawdownPct: 20,
});
const topPending = variants.filter((result) => result.label !== "direct").slice(0, 20);
const strictComparisons = [strict(direct), ...topPending.map(strict)].sort((a, b) => score(b) - score(a));
const report = {
  generatedAt: new Date().toISOString(), sourcePath, sourceSection, sourceIndex, period: source.period,
  methodology: "The original unconstrained-profit leader is held fixed. Only entry mode varies: direct, STOP confirmation, or LIMIT pullback. Working orders expire after TTL, are canceled on opposite/replacement signal, and are limited to the original max-position count. The strict comparison additionally applies 1-pip adverse entry slippage, same-day flat close at 22:00 UTC and 5% realized daily-loss guard.",
  sourceCandidate: { config: base, originalMetrics: sourceCandidate.metrics },
  variants, validated: variants.filter((result) => result.robust), strictComparisons,
};
const output = process.env.REPORT_PATH || "backtest/autoresearch/reports/trading-autoresearch-unconstrained-pending-ablation-2026-07-25.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, variants: variants.length, validated: report.validated.length, winner: variants[0], strictWinner: strictComparisons[0] }, null, 2));
