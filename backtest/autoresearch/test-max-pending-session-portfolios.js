import fs from "node:fs";

// This test is deliberately anchored to the exact raw winner from
// unconstrained-max-profit-pending-ablation, not to a stricter re-evaluation.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const universe = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const sessions = [
  { id: "asia", label: "Asia", window: [0, 480] },
  { id: "london", label: "London", window: [480, 780] },
  { id: "overlap", label: "London-NewYork overlap", window: [780, 1020] },
  { id: "new_york", label: "New York", window: [1020, 1260] },
];
const sourcePath = "backtest/autoresearch/reports/trading-autoresearch-unconstrained-max-profit-pending-ablation-2026-07-25.json";
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const winner = source.variants?.[0];
if (!winner?.config) throw new Error("Missing raw max-profit pending-order winner.");
const currentFive = winner.config.symbols;
process.env.RESEARCH_SYMBOLS = universe.join(",");
const { prepare, evaluate } = await import("./prepare.js");
const prepared = prepare(dataset);

const configFor = (session, symbols, portfolio) => ({
  ...structuredClone(winner.config), symbols,
  session: `utc-${session.window[0]}-${session.window[1]}`, sessionWindows: [session.window],
  maxPositions: portfolio ? winner.config.maxPositions : 1,
  maxPendingOrders: portfolio ? (winner.config.maxPendingOrders ?? winner.config.maxPositions) : 1,
});
const summarize = (symbols, config) => {
  const metrics = evaluate(prepared, config);
  return {
    symbols, metrics,
    // Selection intentionally excludes the final test period.
    selectionScore: +(metrics.folds.train.pnl + 2 * metrics.folds.validation.pnl + metrics.profitFactor * 25 - metrics.maxDDPct * 3).toFixed(3),
    qualifies: metrics.entries >= 25 && metrics.profitFactor >= 1.03 && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0,
  };
};

const sessionResults = [];
for (const session of sessions) {
  const pairs = universe.map((symbol) => summarize([symbol], configFor(session, [symbol], false))).sort((a, b) => b.selectionScore - a.selectionScore);
  const eligible = pairs.filter((pair) => pair.qualifies);
  const ranked = eligible.length ? eligible : pairs.filter((pair) => pair.metrics.entries > 0);
  const portfolios = [];
  for (let n = 1; n <= Math.min(5, ranked.length); n += 1) {
    const symbols = ranked.slice(0, n).map((pair) => pair.symbols[0]);
    portfolios.push(summarize(symbols, configFor(session, symbols, true)));
  }
  portfolios.push(summarize(currentFive, configFor(session, currentFive, true)));
  portfolios.push(summarize(universe, configFor(session, universe, true)));
  portfolios.sort((a, b) => b.selectionScore - a.selectionScore);
  sessionResults.push({ session, pairs, eligiblePairs: eligible.map((pair) => pair.symbols[0]), portfolios, winner: portfolios[0] });
}
const report = {
  generatedAt: new Date().toISOString(), sourcePath,
  baseline: { label: winner.label, config: winner.config, metrics: winner.metrics },
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  methodology: "Exact raw max-profit pending-order winner is held fixed. Only the UTC session and permitted symbols vary. Pair and portfolio selection uses train/validation P/L, PF and drawdown only; final test weeks remain held out. No strict-execution overlay is added in this run.",
  sessions: sessionResults,
};
const output = process.env.REPORT_PATH || "backtest/autoresearch/reports/trading-autoresearch-max-pending-session-portfolios-2026-07-25.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, baseline: { pnl: winner.metrics.pnl, finalBalance: winner.metrics.finalBalance }, sessions: sessionResults.map(({ session, eligiblePairs, winner: selected }) => ({ session: session.id, eligiblePairs, selected: selected.symbols, metrics: { pnl: selected.metrics.pnl, finalBalance: selected.metrics.finalBalance, pf: selected.metrics.profitFactor, dd: selected.metrics.maxDDPct, folds: selected.metrics.folds } })) }, null, 2));
