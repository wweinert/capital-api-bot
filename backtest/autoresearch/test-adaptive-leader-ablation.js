import fs from "node:fs";
import { prepare, evaluate } from "./prepare.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const allSymbols = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const base = {
  mtf: true, objectiveMode: "adaptive-walk-forward", startCapital: 500, capitalMode: "compound", maxAllowedDrawdownPct: 20,
  symbols: allSymbols, session: "london-new-york-overlap", sessionWindows: [[780, 1020]],
  method: "mtf-strict", frames: ["M15", "H1", "H4"], componentWeights: [0.5, 1.5, 0, 1.5, 1, 1.5],
  weights: [1.5, 3, 1], tfMin: 3.9, alignMin: 3, threshold: 24.75, highMin: 3.9, lowMin: 2.7,
  trigger: "any", hold: 1440, stopATR: 1.5, rewardRisk: 2.5, tpATR: 3.75,
  dynamicReward: true, dynamicScore: 4.5, highRewardRisk: 5, breakEvenR: 2, trailATR: 0,
  cooldown: 30, maxDaily: 2, maxTotalDaily: 1, maxPositions: 1, riskDivisor: 4,
  minAtrPct: 0.0005, minBbWidthPct: 0.00075, minEmaDistPct: 0.0005,
};
const cases = {
  leader: base,
  without_break_even: { ...base, breakEvenR: 0 },
  fixed_rr_2_5: { ...base, dynamicReward: false },
  without_both: { ...base, breakEvenR: 0, dynamicReward: false },
  two_profitable_pairs: { ...base, symbols: ["AUDJPY", "NZDUSD"] },
  two_pairs_without_break_even: { ...base, symbols: ["AUDJPY", "NZDUSD"], breakEvenR: 0 },
  two_pairs_fixed_rr: { ...base, symbols: ["AUDJPY", "NZDUSD"], dynamicReward: false },
};
const prepared = prepare(dataset);
const concise = (metrics) => ({ finalBalance: metrics.finalBalance, returnPct: metrics.returnPct, pnl: metrics.pnl, pf: metrics.profitFactor, maxDDPct: metrics.maxDDPct, trades: metrics.trades, folds: metrics.folds, selectionPrecision: metrics.selectionPrecision, holdoutPrecision: metrics.holdoutPrecision });
const result = Object.fromEntries(Object.entries(cases).map(([name, config]) => [name, concise(evaluate(prepared, config))]));
const output = process.env.REPORT_PATH || "/tmp/trading-autoresearch-adaptive-ablation.json";
fs.writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), cases, result }, null, 2)}\n`);
console.log(JSON.stringify({ output, result }, null, 2));
