import fs from "fs";
import path from "path";
import {
    appendResult,
    baselineOverrides,
    ensureResearchDirs,
    parseArgs,
    REPORT_DIR,
    resolveSymbols,
    runExperiment,
    saveCandidate,
} from "./experimentTarget.js";
import { buildCandidate, createCandidateRng } from "./candidateFactory.js";
import { generateReport } from "./runReport.js";

function modeScoreKey(mode) {
    if (mode === "max-profit" || mode === "max_profit") return "maxProfit";
    if (mode === "balanced") return "balanced";
    if (mode === "aggressive") return "aggressive";
    return "robust";
}

function scoreFor(result, key) {
    return Number(result?.scores?.[key] ?? result?.score ?? -Infinity);
}

function metricFor(result, key) {
    return Number(result?.metrics?.[key] ?? -Infinity);
}

function beats(current, candidate, getter) {
    if (!candidate) return false;
    if (!current) return true;
    return getter(candidate) > getter(current);
}

function leaderSummary(leaders) {
    return Object.fromEntries(
        Object.entries(leaders).map(([name, item]) => [
            name,
            item
                ? {
                      experimentId: item.experimentId,
                      candidatePath: item.candidatePath || null,
                      metrics: item.metrics,
                      score: item.score,
                      scores: item.scores,
                      rejectionReason: item.rejectionReason,
                      riskFlags: item.riskFlags,
                  }
                : null,
        ]),
    );
}

const args = parseArgs();
const minutes = Number(args.minutes || 30);
const maxExperiments = Number(args.maxExperiments || 100000);
const days = Number(args.days || 90);
const seed = Number(args.seed || 20260505);
const symbols = resolveSymbols(args.symbols);
const mode = String(args.mode || "robust").toLowerCase();
const selectedScoreKey = modeScoreKey(mode);
const rng = createCandidateRng(seed);

ensureResearchDirs();

const startedAt = Date.now();
const deadline = startedAt + Math.max(1, minutes) * 60_000;
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const leaders = {
    selectedScore: null,
    endCapital: null,
    rawPnl: null,
    aggressiveScore: null,
    maxProfitScore: null,
    dd40: null,
    dd60: null,
    dd80: null,
    highRiskHighProfit: null,
};
const kept = [];

function recordLeader(name, result, subdir, tag) {
    const candidatePath = saveCandidate(result, { subdir, tag });
    const stored = { ...result, candidatePath };
    leaders[name] = stored;
    kept.push(stored);
    kept.sort((a, b) => scoreFor(b, selectedScoreKey) - scoreFor(a, selectedScoreKey));
    kept.length = Math.min(kept.length, 50);
}

function consider(result) {
    if (beats(leaders.selectedScore, result, (item) => scoreFor(item, selectedScoreKey))) {
        recordLeader("selectedScore", result, mode, `best-${selectedScoreKey}`);
    }
    if (beats(leaders.endCapital, result, (item) => metricFor(item, "endCapital"))) {
        recordLeader("endCapital", result, mode, "best-endCapital");
    }
    if (beats(leaders.rawPnl, result, (item) => metricFor(item, "rawPnl"))) {
        recordLeader("rawPnl", result, mode, "best-rawPnl");
    }
    if (beats(leaders.aggressiveScore, result, (item) => scoreFor(item, "aggressive"))) {
        recordLeader("aggressiveScore", result, "aggressive", "best-aggressiveScore");
    }
    if (beats(leaders.maxProfitScore, result, (item) => scoreFor(item, "maxProfit"))) {
        recordLeader("maxProfitScore", result, "max-profit", "best-maxProfitScore");
    }

    const dd = metricFor(result, "maxDrawdownPct");
    if (dd < 40 && beats(leaders.dd40, result, (item) => metricFor(item, "endCapital"))) {
        recordLeader("dd40", result, "balanced", "best-maxDD-lt40");
    }
    if (dd < 60 && beats(leaders.dd60, result, (item) => metricFor(item, "endCapital"))) {
        recordLeader("dd60", result, "aggressive", "best-maxDD-lt60");
    }
    if (dd < 80 && beats(leaders.dd80, result, (item) => metricFor(item, "endCapital"))) {
        recordLeader("dd80", result, "high-risk", "best-maxDD-lt80");
    }
    if (metricFor(result, "rawPnl") > 0 && dd >= 40 && beats(leaders.highRiskHighProfit, result, (item) => metricFor(item, "endCapital"))) {
        recordLeader("highRiskHighProfit", result, "high-risk", "best-high-risk-profit");
    }
}

const baseline = runExperiment({ candidate: baselineOverrides(), symbols, days, mode });
saveCandidate(baseline, { subdir: mode === "robust" ? null : mode, tag: "baseline" });
appendResult(baseline);
consider(baseline);

let completed = 0;
while (Date.now() < deadline && completed < maxExperiments) {
    const candidate = buildCandidate(completed + 1, rng);
    const result = runExperiment({ candidate, symbols, days, mode });
    appendResult(result);
    completed += 1;
    consider(result);

    console.log(
        [
            completed,
            result.experimentId,
            `${selectedScoreKey}=${scoreFor(result, selectedScoreKey).toFixed(4)}`,
            `end=${result.metrics.endCapital}`,
            `raw=${result.metrics.rawPnl}`,
            `dd=${result.metrics.maxDrawdownPct}`,
            `trades=${result.metrics.trades}`,
            `risk=${result.riskFlags.join(",") || "none"}`,
            `reject=${result.rejectionReason || "none"}`,
        ].join("\t"),
    );
}

const best = leaders.selectedScore || baseline;
const summaryPath = path.join(REPORT_DIR, `search_${runId}.json`);
fs.writeFileSync(
    summaryPath,
    JSON.stringify(
        {
            generatedAt: new Date().toISOString(),
            seed,
            mode,
            selectedScoreKey,
            minutes,
            elapsedMinutes: (Date.now() - startedAt) / 60_000,
            completed,
            symbols,
            days,
            baseline,
            best,
            leaders: leaderSummary(leaders),
            kept: kept.slice(0, 20),
        },
        null,
        2,
    ),
);

const reportPath = generateReport({ sourcePath: summaryPath, top: 20, mode });
console.log(
    JSON.stringify(
        {
            summaryPath,
            reportPath,
            mode,
            completed,
            baseline: baseline.metrics,
            best: best.metrics,
            bestScore: scoreFor(best, selectedScoreKey),
            leaders: leaderSummary(leaders),
        },
        null,
        2,
    ),
);
