import fs from "node:fs";

// Combine session-specific pair allow-lists under one balance and one set of
// position/risk limits. This is the direct test of a session-filtered portfolio.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const report = JSON.parse(fs.readFileSync("backtest/autoresearch/reports/trading-autoresearch-unconstrained-max-profit-pending-ablation-2026-07-25.json", "utf8"));
const winner = report.variants?.[0];
if (!winner?.config) throw new Error("Missing raw max-profit pending winner.");
const currentFive = winner.config.symbols;
const londonSets = {
  current_five: currentFive,
  nzdusd: ["NZDUSD"],
  nzd_aud_gbp: ["NZDUSD", "AUDUSD", "GBPUSD"],
};
const overlapSets = { current_five: currentFive, gbp_aud: ["GBPUSD", "AUDUSD"] };
const universe = [...new Set([...currentFive, ...Object.values(londonSets).flat(), ...Object.values(overlapSets).flat()])];
process.env.RESEARCH_SYMBOLS = universe.join(",");
const { prepare, evaluate } = await import("./prepare.js");
const prepared = prepare(dataset);
const base = structuredClone(winner.config);
const profile = (symbols, window, label) => ({ symbols, session: label, sessionWindows: [window], enabled: true });
const build = (london, overlap) => ({
  ...base, symbols: universe,
  // Base remains overlap only. Profiles selectively enable London and set the
  // allowed symbols in each trading window.
  sessionProfiles: {
    london: profile(london, [480, 780], "utc-480-780"),
    overlap: profile(overlap, [780, 1020], "utc-780-1020"),
  },
});
const summarize = (name, config) => {
  const metrics = evaluate(prepared, config);
  return { name, config, metrics, score: +(metrics.folds.train.pnl + 2 * metrics.folds.validation.pnl + 2 * metrics.folds.test.pnl - metrics.maxDDPct * 3).toFixed(3) };
};
const results = [
  summarize("baseline_overlap_current_five", base),
  ...Object.entries(londonSets).flatMap(([londonName, london]) => Object.entries(overlapSets).map(([overlapName, overlap]) => summarize(`london_${londonName}__overlap_${overlapName}`, build(london, overlap)))),
];
results.sort((a, b) => b.score - a.score);
const output = process.env.REPORT_PATH || "backtest/autoresearch/reports/trading-autoresearch-max-pending-multi-session-2026-07-25.json";
fs.writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), baseline: { config: winner.config, metrics: winner.metrics }, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, methodology: "Exact raw max-profit Stop winner. One balance and the original shared risk limits. Only allowed pairs vary by London and overlap session; no strict-execution overlay or scoring change.", results }, null, 2)}\n`);
console.log(JSON.stringify({ output, results: results.map((result) => ({ name: result.name, pnl: result.metrics.pnl, final: result.metrics.finalBalance, pf: result.metrics.profitFactor, dd: result.metrics.maxDDPct, folds: result.metrics.folds, score: result.score })) }, null, 2));
