import fs from "node:fs";

// Lightweight confirmation: no pair selection or search, only the exact
// max-profit STOP profile applied to the current five versus expanded ten.
const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const expanded = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const sessions = [
  { id: "asia", window: [0, 480] }, { id: "london", window: [480, 780] },
  { id: "overlap", window: [780, 1020] }, { id: "new_york", window: [1020, 1260] },
];
const source = JSON.parse(fs.readFileSync("backtest/autoresearch/reports/trading-autoresearch-unconstrained-profit-2026-07-25.json", "utf8"));
const candidate = source.highestPnLActive?.[0];
if (!candidate?.config) throw new Error("Missing max-profit source candidate.");
process.env.RESEARCH_SYMBOLS = expanded.join(",");
const { prepare, evaluate } = await import("./prepare.js");
const prepared = prepare(dataset);
const base = { ...structuredClone(candidate.config), startCapital: 500, capitalMode: "compound", pendingOrderType: "STOP", pendingOffsetATR: 0.5, pendingTtlMinutes: 45, cancelPendingOnOpposite: true, replacePendingOnSameSignal: true, signalDelayMinutes: 0, entryOnSignalClose: true, slippagePips: 1, flatAtMinute: 1320, dailyLossLimitPct: 0.05, maxAllowedDrawdownPct: 20, maxPositions: 3, maxPendingOrders: 3 };
const brief = (symbols, session) => {
  const config = { ...base, symbols, session: `utc-${session.window[0]}-${session.window[1]}`, sessionWindows: [session.window] };
  const metrics = evaluate(prepared, config);
  return { symbols, metrics, admission: metrics.profitFactor >= 1.05 && metrics.maxDDPct <= 20 && metrics.folds.train.pnl > 0 && metrics.folds.validation.pnl > 0 && metrics.folds.test.pnl > 0 };
};
const currentFive = candidate.config.symbols;
const results = sessions.map((session) => ({ session, currentFive: brief(currentFive, session), expandedTen: brief(expanded, session) }));
const report = { generatedAt: new Date().toISOString(), period: { start: new Date(prepared.start).toISOString(), end: new Date(prepared.end).toISOString() }, methodology: "Exact max-profit STOP profile, strict execution (1 pip adverse entry slippage, conservative stop fills, 22:00 UTC flat close, 5% realized daily-loss guard). No pair selection or optimization: compares the fixed original five against fixed expanded ten in four UTC sessions.", results };
const output = process.env.REPORT_PATH || "backtest/autoresearch/reports/trading-autoresearch-session-expanded-portfolios-2026-07-25.json";
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, results: results.map(({ session, currentFive, expandedTen }) => ({ session: session.id, currentFive: { pnl: currentFive.metrics.pnl, pf: currentFive.metrics.profitFactor, dd: currentFive.metrics.maxDDPct, folds: currentFive.metrics.folds }, expandedTen: { pnl: expandedTen.metrics.pnl, pf: expandedTen.metrics.profitFactor, dd: expandedTen.metrics.maxDDPct, folds: expandedTen.metrics.folds } })) }, null, 2));
