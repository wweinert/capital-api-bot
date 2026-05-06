import { appendResult, baselineOverrides, parseArgs, resolveSymbols, runExperiment, saveCandidate } from "./experimentTarget.js";

const args = parseArgs();
const symbols = resolveSymbols(args.symbols);
const days = Number(args.days || 90);
const mode = String(args.mode || "robust");
const candidate = baselineOverrides();

const result = runExperiment({ candidate, symbols, days, mode });
const candidatePath = saveCandidate(result, { subdir: mode === "robust" ? null : mode, tag: "baseline" });
appendResult(result);

console.log(
    JSON.stringify(
        {
            experimentId: result.experimentId,
            candidatePath,
            symbols: result.symbols,
            dateRange: result.dateRange,
            metrics: result.metrics,
            score: result.score,
            scores: result.scores,
            mode: result.mode,
            riskFlags: result.riskFlags,
            rejectionReason: result.rejectionReason,
            todayComparison: {
                date: result.todayComparison.date,
                simulatedTrades: result.todayComparison.simulatedTrades.length,
                actualTrades: result.todayComparison.actualTrades.length,
            },
        },
        null,
        2,
    ),
);
