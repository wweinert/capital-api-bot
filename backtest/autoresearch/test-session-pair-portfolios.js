import fs from "node:fs";

// Research-only: rank individual pairs, then construct per-session portfolios
// from train/validation only. The final four-week test is held out from pair
// selection to reduce selection bias.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const symbols = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const sessions = [
  { id: "asia", label: "Asia", window: [0, 480] },
  { id: "london", label: "London", window: [480, 780] },
  { id: "overlap", label: "London-NewYork overlap", window: [780, 1020] },
  { id: "new_york", label: "New York", window: [1020, 1260] },
];
const sourcePath = "backtest/autoresearch/reports/trading-autoresearch-unconstrained-profit-2026-07-25.json";
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const sourceCandidate = source.highestPnLActive?.[0];
if (!sourceCandidate?.config) throw new Error("Missing max-profit source candidate.");
const currentSymbols = sourceCandidate.config.symbols;
process.env.RESEARCH_SYMBOLS = symbols.join(",");
const { prepare, evaluate } = await import("./prepare.js");
const prepared = prepare(dataset);

const base = {
  ...structuredClone(sourceCandidate.config), startCapital: 500, capitalMode: "compound",
  pendingOrderType: "STOP", pendingOffsetATR: 0.5, pendingTtlMinutes: 45,
  cancelPendingOnOpposite: true, replacePendingOnSameSignal: true,
  signalDelayMinutes: 0, entryOnSignalClose: true, slippagePips: 1,
  flatAtMinute: 1320, dailyLossLimitPct: 0.05, maxAllowedDrawdownPct: 20,
};
const configure = (session, selected, portfolio) => ({
  ...base, symbols: selected, session: `utc-${session.window[0]}-${session.window[1]}`,
  sessionWindows: [session.window], maxPositions: portfolio ? 3 : 1,
  maxPendingOrders: portfolio ? 3 : 1,
});
const summarize = (symbolSet, metrics) => ({
  symbols: symbolSet, metrics,
  admission: metrics.entries >= 30 && metrics.profitFactor >= 1.03 && metrics.maxDDPct <= 20
    && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0,
  // Pair ranking does not look at test P/L. Test is reported only afterwards.
  selectionScore: +(
    metrics.folds.train.pnl + 2 * metrics.folds.validation.pnl
    + metrics.profitFactor * 25 - metrics.maxDDPct * 3
  ).toFixed(3),
});

const results = [];
const referencePortfolios = [];
for (const session of sessions) {
  const pairs = symbols.map((symbol) => summarize([symbol], evaluate(prepared, configure(session, [symbol], false))));
  pairs.sort((a, b) => b.selectionScore - a.selectionScore);
  const admitted = pairs.filter((pair) => pair.admission);
  const ranked = admitted.length ? admitted : pairs.filter((pair) => pair.metrics.entries > 0);
  const portfolios = [];
  for (let n = 1; n <= Math.min(5, ranked.length); n += 1) {
    const selected = ranked.slice(0, n).map((pair) => pair.symbols[0]);
    portfolios.push(summarize(selected, evaluate(prepared, configure(session, selected, true))));
  }
  portfolios.sort((a, b) => b.selectionScore - a.selectionScore);
  results.push({ session, pairs, admittedPairs: admitted.map((pair) => pair.symbols[0]), portfolios, selectedPortfolio: portfolios[0] ?? null });
  referencePortfolios.push({
    session,
    currentFive: summarize(currentSymbols, evaluate(prepared, configure(session, currentSymbols, true))),
    expandedTen: summarize(symbols, evaluate(prepared, configure(session, symbols, true))),
  });
}
const report = {
  generatedAt: new Date().toISOString(), sourcePath, sourceCandidate: { config: sourceCandidate.config, metrics: sourceCandidate.metrics },
  period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() },
  executionModel: "Max-profit strategy plus STOP 0.5 ATR / TTL 45m. One-pip adverse entry slippage, conservative stop gaps, same-day close at 22:00 UTC, 5% realized daily-loss guard. Per-pair selection uses train and validation only; test results are held out.",
  sessions: results, referencePortfolios,
};
const output = process.env.REPORT_PATH || "backtest/autoresearch/reports/trading-autoresearch-session-pair-portfolios-2026-07-25.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, sessions: results.map(({ session, admittedPairs, selectedPortfolio }) => ({ session: session.id, admittedPairs, selected: selectedPortfolio?.symbols, metrics: selectedPortfolio?.metrics && { pnl: selectedPortfolio.metrics.pnl, pf: selectedPortfolio.metrics.profitFactor, dd: selectedPortfolio.metrics.maxDDPct, folds: selectedPortfolio.metrics.folds } })), referencePortfolios: referencePortfolios.map(({ session, currentFive, expandedTen }) => ({ session: session.id, currentFive: { pnl: currentFive.metrics.pnl, pf: currentFive.metrics.profitFactor, dd: currentFive.metrics.maxDDPct, folds: currentFive.metrics.folds }, expandedTen: { pnl: expandedTen.metrics.pnl, pf: expandedTen.metrics.profitFactor, dd: expandedTen.metrics.maxDDPct, folds: expandedTen.metrics.folds } })) }, null, 2));
