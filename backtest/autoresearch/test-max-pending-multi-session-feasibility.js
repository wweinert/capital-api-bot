import fs from "node:fs";

// Execution-feasibility audit of the selected session portfolio.  This does
// not search for a new leader: it freezes London=NZDUSD and overlap=the five
// original pairs, then stresses realistic execution assumptions.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const source = JSON.parse(fs.readFileSync("backtest/autoresearch/reports/trading-autoresearch-unconstrained-max-profit-pending-ablation-2026-07-25.json", "utf8"));
const winner = source.variants?.[0];
if (!winner?.config) throw new Error("Missing raw max-profit pending winner.");
const overlap = winner.config.symbols, london = ["NZDUSD"], universe = [...new Set([...overlap, ...london])];
process.env.RESEARCH_SYMBOLS = universe.join(",");
const { prepare, evaluate } = await import("./prepare.js");
const prepared = prepare(dataset);
const profile = (symbols, window, label) => ({ symbols, session: label, sessionWindows: [window], enabled: true });
const combined = {
  ...structuredClone(winner.config), symbols: universe,
  sessionProfiles: {
    london: profile(london, [480, 780], "utc-480-780"),
    overlap: profile(overlap, [780, 1020], "utc-780-1020"),
  },
};
const scenarios = [
  { id: "reproduction", label: "Original modelling assumptions", patch: {} },
  { id: "strict_1pip", label: "1-pip adverse entry slippage + EOD + daily loss guard", patch: { signalDelayMinutes: 0, entryOnSignalClose: true, slippagePips: 1, flatAtMinute: 1320, dailyLossLimitPct: 0.05, maxAllowedDrawdownPct: 20 } },
  { id: "strict_2pip", label: "2-pip adverse entry slippage + EOD + daily loss guard", patch: { signalDelayMinutes: 0, entryOnSignalClose: true, slippagePips: 2, flatAtMinute: 1320, dailyLossLimitPct: 0.05, maxAllowedDrawdownPct: 20 } },
  { id: "delay_1m_2pip", label: "One-minute delayed availability + 2-pip slippage", patch: { signalDelayMinutes: 1, entryOnSignalClose: true, slippagePips: 2, flatAtMinute: 1320, dailyLossLimitPct: 0.05, maxAllowedDrawdownPct: 20 } },
];
const results = scenarios.map((scenario) => ({ id: scenario.id, label: scenario.label, config: { ...combined, ...scenario.patch }, metrics: evaluate(prepared, { ...combined, ...scenario.patch }) }));
const output = process.env.REPORT_PATH || "backtest/autoresearch/reports/trading-autoresearch-max-pending-multi-session-feasibility-2026-07-25.json";
fs.writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), baseline: { config: winner.config, metrics: winner.metrics }, selectedPortfolio: { london, overlap }, period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, methodology: "Conservative M1 OHLC simulator: fixed spread cost, adverse stop-gap fills, no exit in the activation minute, SL priority on ambiguous bars. The feasibility scenarios add explicit slippage, timing delay, day flat close and realized daily-loss guard without optimizing any parameter.", results }, null, 2)}\n`);
console.log(JSON.stringify({ output, results: results.map((result) => ({ id: result.id, pnl: result.metrics.pnl, final: result.metrics.finalBalance, ret: result.metrics.returnPct, pf: result.metrics.profitFactor, dd: result.metrics.maxDDPct, entries: result.metrics.entries, folds: result.metrics.folds, pending: result.metrics.pendingStats })) }, null, 2));
