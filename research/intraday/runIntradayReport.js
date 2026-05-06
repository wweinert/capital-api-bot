import fs from "fs";
import path from "path";
import { parseArgs } from "../experimentTarget.js";
import { INTRADAY_CANDIDATE_DIR, INTRADAY_REPORT_DIR, INTRADAY_RESULTS_PATH, PREVIOUS_REFERENCE_END_CAPITAL, ensureIntradayDirs } from "./runIntradayExperiment.js";
import { riskFlagsFor, scoreSet } from "./scoreIntradayExperiment.js";

function readTsv(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    const [header, ...rows] = lines;
    const keys = header.split("\t");
    return rows.map((line) => {
        const cols = line.split("\t");
        return Object.fromEntries(keys.map((key, index) => [key, cols[index] ?? ""]));
    });
}

function num(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function metricRow(row) {
    const metrics = {
        trades: num(row.trades),
        winRate: num(row.winRate),
        profitFactor: num(row.profitFactor),
        expectancyR: num(row.expectancyR),
        maxDrawdownPct: num(row.maxDrawdownPct),
        startCapital: num(row.startCapital, 500),
        endCapital: num(row.endCapital),
        rawPnl: num(row.rawPnl),
        averageHoldBars: num(row.averageHoldBars),
        days: 90,
    };
    return {
        ...row,
        metrics,
        scores: scoreSet(metrics),
        riskFlagsComputed: riskFlagsFor(metrics, String(row.riskFlags || "").split(",").filter(Boolean)),
    };
}

function scoreKey(mode) {
    if (mode === "maxProfit") return "maxProfit";
    if (mode === "profitWithControl") return "profitWithControl";
    if (mode === "stable") return "stable";
    return "aggressiveIntraday";
}

function byMetric(key) {
    return (a, b) => b.metrics[key] - a.metrics[key];
}

function byScore(key) {
    return (a, b) => b.scores[key] - a.scores[key];
}

function fmt(value, digits = 2) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(digits) : "n/a";
}

function table(rows, { top = 20, score = "aggressiveIntraday" } = {}) {
    const shown = rows.slice(0, top);
    if (!shown.length) return "_No rows._";
    const header = ["rank", "experimentId", "family", "exit", "risk", "trades", "winRate", "PF", "expectancyR", "maxDD", "endCapital", "rawPnl", score, "riskFlags", "rejectionReason"];
    const body = shown.map((row, index) => [
        index + 1,
        row.experimentId,
        row.strategyFamily,
        row.exitProfile,
        row.riskProfile,
        row.metrics.trades,
        fmt(row.metrics.winRate),
        fmt(row.metrics.profitFactor, 3),
        fmt(row.metrics.expectancyR, 4),
        fmt(row.metrics.maxDrawdownPct),
        fmt(row.metrics.endCapital),
        fmt(row.metrics.rawPnl),
        fmt(row.scores[score], 4),
        row.riskFlags || row.riskFlagsComputed.join(","),
        row.rejectionReason || "",
    ]);
    return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...body.map((cols) => `| ${cols.join(" | ")} |`)].join("\n");
}

function latestSummary() {
    if (!fs.existsSync(INTRADAY_REPORT_DIR)) return null;
    return fs
        .readdirSync(INTRADAY_REPORT_DIR)
        .filter((name) => name.startsWith("intraday_search_") && name.endsWith(".json"))
        .map((name) => path.join(INTRADAY_REPORT_DIR, name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function findCandidatePath(experimentId) {
    if (!experimentId || !fs.existsSync(INTRADAY_CANDIDATE_DIR)) return null;
    const stack = [INTRADAY_CANDIDATE_DIR];
    while (stack.length) {
        const dir = stack.pop();
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) stack.push(full);
            else if (name.endsWith(".json") && name.includes(experimentId)) return full;
        }
    }
    return null;
}

function bestByGroup(rows, key, score) {
    const groups = new Map();
    for (const row of rows) {
        const value = row[key] || "unknown";
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value).push(row);
    }
    return [...groups.entries()]
        .map(([value, items]) => ({ value, row: items.sort(byScore(score))[0] }))
        .sort((a, b) => b.row.scores[score] - a.row.scores[score]);
}

function groupTable(items, score) {
    if (!items.length) return "_No rows._";
    const rows = items.slice(0, 20).map((item) => ({ ...item.row, experimentId: `${item.value}: ${item.row.experimentId}` }));
    return table(rows, { top: rows.length, score });
}

function readCandidateOverrides(experimentId) {
    const candidatePath = findCandidatePath(experimentId);
    if (!candidatePath) return { candidatePath: null, candidate: null };
    try {
        const json = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
        return { candidatePath, candidate: json.candidate };
    } catch {
        return { candidatePath, candidate: null };
    }
}

function loadSavedCandidateResults() {
    if (!fs.existsSync(INTRADAY_CANDIDATE_DIR)) return [];
    const results = [];
    const stack = [INTRADAY_CANDIDATE_DIR];
    while (stack.length) {
        const dir = stack.pop();
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (!name.endsWith(".json")) continue;
            try {
                const item = JSON.parse(fs.readFileSync(full, "utf8"));
                if (!item?.experimentId || !item?.metrics) continue;
                results.push({
                    ...item,
                    candidatePath: full,
                    strategyFamily: item.strategyFamily || item.candidate?.strategyFamily?.family || "unknown",
                    exitProfile: typeof item.exitProfile === "string" ? item.exitProfile : item.exitProfile?.kind || item.candidate?.exitProfile?.kind || "unknown",
                    riskProfile: typeof item.riskProfile === "string" ? item.riskProfile : item.riskProfile?.kind || item.candidate?.riskProfile?.kind || "unknown",
                    scores: item.scores || scoreSet(item.metrics),
                    riskFlags: Array.isArray(item.riskFlags) ? item.riskFlags.join(",") : item.riskFlags || "",
                });
            } catch {
                // Ignore stale or partial candidate artifacts.
            }
        }
    }
    return results;
}

function exposureLeaders(savedCandidates, exposureKey, score) {
    const groups = new Map();
    for (const candidate of savedCandidates) {
        const counts = candidate.counts?.[exposureKey] || {};
        for (const [value, count] of Object.entries(counts)) {
            if (!(Number(count) > 0)) continue;
            const current = groups.get(value);
            if (!current || candidate.scores[score] > current.row.scores[score]) {
                groups.set(value, { value, count, row: candidate });
            }
        }
    }
    return [...groups.values()].sort((a, b) => b.row.scores[score] - a.row.scores[score]);
}

function exposureTable(items, score) {
    if (!items.length) return "_No saved leader artifacts with this exposure._";
    const header = ["rank", "exposure", "tradesInCandidate", "experimentId", "family", "exit", "risk", "totalTrades", "maxDD", "endCapital", score, "candidatePath"];
    const body = items.slice(0, 30).map((item, index) => [
        index + 1,
        item.value,
        item.count,
        item.row.experimentId,
        item.row.strategyFamily,
        item.row.exitProfile,
        item.row.riskProfile,
        item.row.metrics.trades,
        fmt(item.row.metrics.maxDrawdownPct),
        fmt(item.row.metrics.endCapital),
        fmt(item.row.scores[score], 4),
        item.row.candidatePath,
    ]);
    return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...body.map((cols) => `| ${cols.join(" | ")} |`)].join("\n");
}

function leaderPathTable(summary) {
    const leaders = summary?.leaders || {};
    const rows = [];
    for (const [name, value] of Object.entries(leaders)) {
        if (value?.candidatePath) rows.push([name, value.experimentId, value.candidatePath]);
        if (value && typeof value === "object") {
            for (const [subName, subValue] of Object.entries(value)) {
                if (subValue?.candidatePath) rows.push([`${name}.${subName}`, subValue.experimentId, subValue.candidatePath]);
            }
        }
    }
    if (!rows.length) return "_No leader candidate paths in latest summary._";
    return ["| leader | experimentId | candidatePath |", "| --- | --- | --- |", ...rows.map((cols) => `| ${cols.join(" | ")} |`)].join("\n");
}

export function generateIntradayReport({ sourcePath = null, mode = "aggressiveIntraday" } = {}) {
    ensureIntradayDirs();
    const selectedScore = scoreKey(mode);
    const rows = readTsv(INTRADAY_RESULTS_PATH).map(metricRow);
    const source = sourcePath || latestSummary();
    const summary = source && fs.existsSync(source) ? JSON.parse(fs.readFileSync(source, "utf8")) : null;
    const bestEnd = [...rows].sort(byMetric("endCapital"))[0];
    const bestRaw = [...rows].sort(byMetric("rawPnl"))[0];
    const bestAggressive = [...rows].sort(byScore("aggressiveIntraday"))[0];
    const bestMaxProfit = [...rows].sort(byScore("maxProfit"))[0];
    const bestPf = [...rows].sort(byMetric("profitFactor"))[0];
    const bestExpectancy = [...rows].sort(byMetric("expectancyR"))[0];
    const dd40 = rows.filter((row) => row.metrics.maxDrawdownPct < 40).sort(byMetric("endCapital"));
    const dd60 = rows.filter((row) => row.metrics.maxDrawdownPct < 60).sort(byMetric("endCapital"));
    const dd80 = rows.filter((row) => row.metrics.maxDrawdownPct < 80).sort(byMetric("endCapital"));
    const highRisk = rows.filter((row) => row.metrics.rawPnl > 0 && row.metrics.maxDrawdownPct >= 40).sort(byMetric("endCapital"));
    const dangerous = rows.filter((row) => row.metrics.rawPnl > 0 && row.metrics.maxDrawdownPct >= 60).sort(byMetric("endCapital"));
    const trades100 = rows.filter((row) => row.metrics.trades >= 100).sort(byMetric("endCapital"));
    const trades200 = rows.filter((row) => row.metrics.trades >= 200).sort(byMetric("endCapital"));
    const savedCandidates = loadSavedCandidateResults();
    const { candidatePath, candidate } = readCandidateOverrides(bestAggressive?.experimentId);
    const reportPath = path.join(INTRADAY_REPORT_DIR, "aggressive-intraday-summary.md");

    const lines = [
        "# Intraday Strategy Lab Report",
        "",
        `Generated: \`${new Date().toISOString()}\``,
        `Mode: \`${mode}\``,
        `Selected score: \`${selectedScore}\``,
        `Rows analyzed: \`${rows.length}\``,
        `Results: \`research/intraday/results.tsv\``,
        source ? `Search summary: \`${path.relative(process.cwd(), source)}\`` : "Search summary: `n/a`",
        "",
        "## Commands",
        "",
        "```bash",
        "npm run research:intraday:baseline",
        "npm run research:intraday:search -- --minutes=30 --mode=aggressiveIntraday --seed=20260505",
        "npm run research:intraday:search -- --minutes=60 --mode=maxProfit",
        "npm run research:intraday:report -- --mode=aggressiveIntraday",
        "```",
        "",
        "## Previous Reference",
        "",
        `Previous HLLH AutoSearch reference: \`500 -> ${PREVIOUS_REFERENCE_END_CAPITAL}\` over 90 days.`,
        "",
        "## Search Run",
        "",
        summary
            ? [`Completed experiments in latest run: \`${summary.completed}\``, `Elapsed minutes: \`${fmt(summary.elapsedMinutes, 2)}\``, `Symbols: \`${summary.symbols?.join(",") || "n/a"}\``].join("\n")
            : "_No search summary available._",
        "",
        "## Best By endCapital",
        "",
        table(bestEnd ? [bestEnd] : [], { top: 1, score: selectedScore }),
        "",
        "## Best By rawPnl",
        "",
        table(bestRaw ? [bestRaw] : [], { top: 1, score: selectedScore }),
        "",
        "## Best By aggressiveIntraday Score",
        "",
        table(bestAggressive ? [bestAggressive] : [], { top: 1, score: "aggressiveIntraday" }),
        "",
        "## Best By maxProfit Score",
        "",
        table(bestMaxProfit ? [bestMaxProfit] : [], { top: 1, score: "maxProfit" }),
        "",
        "## Best By profitFactor",
        "",
        table(bestPf ? [bestPf] : [], { top: 1, score: selectedScore }),
        "",
        "## Best By expectancyR",
        "",
        table(bestExpectancy ? [bestExpectancy] : [], { top: 1, score: selectedScore }),
        "",
        "## Best With maxDD < 40%",
        "",
        table(dd40, { top: 20, score: selectedScore }),
        "",
        "## Best With maxDD < 60%",
        "",
        table(dd60, { top: 20, score: selectedScore }),
        "",
        "## Best With maxDD < 80%",
        "",
        table(dd80, { top: 20, score: selectedScore }),
        "",
        "## Best High-Profit / High-Risk",
        "",
        table(highRisk, { top: 20, score: selectedScore }),
        "",
        "## Dangerous High-Profit Candidates",
        "",
        table(dangerous, { top: 20, score: selectedScore }),
        "",
        "## Top Candidates With trades >= 100",
        "",
        table(trades100, { top: 20, score: selectedScore }),
        "",
        "## Top Candidates With trades >= 200",
        "",
        table(trades200, { top: 20, score: selectedScore }),
        "",
        "## Best Per strategyFamily",
        "",
        groupTable(bestByGroup(rows, "strategyFamily", selectedScore), selectedScore),
        "",
        "## Best Per exitProfile",
        "",
        groupTable(bestByGroup(rows, "exitProfile", selectedScore), selectedScore),
        "",
        "## Best Per managementProfile",
        "",
        groupTable(bestByGroup(rows, "managementProfile", selectedScore), selectedScore),
        "",
        "## Best Per Symbol",
        "",
        "_This ranks saved leader artifacts by selected score for each symbol exposure; it is not yet a standalone per-symbol rerun._",
        "",
        exposureTable(exposureLeaders(savedCandidates, "symbolCounts", selectedScore), selectedScore),
        "",
        "## Best Per Session",
        "",
        "_This ranks saved leader artifacts by selected score for each session exposure; it is not yet a standalone per-session rerun._",
        "",
        exposureTable(exposureLeaders(savedCandidates, "sessionCounts", selectedScore), selectedScore),
        "",
        "## Best Entry + Exit Combination",
        "",
        table([...rows].sort(byScore(selectedScore)), { top: 20, score: selectedScore }),
        "",
        "## Top 20 Candidates Overall",
        "",
        table([...rows].sort(byScore(selectedScore)), { top: 20, score: selectedScore }),
        "",
        "## Top 20 High-Risk Candidates",
        "",
        table(highRisk, { top: 20, score: selectedScore }),
        "",
        "## Candidate JSON",
        "",
        candidatePath ? `Best aggressive candidate JSON: \`${candidatePath}\`` : "Best aggressive candidate JSON: `not found`",
        candidate ? ["", "```json", JSON.stringify(candidate, null, 2), "```"].join("\n") : "",
        "",
        "## Leader Candidate Paths",
        "",
        leaderPathTable(summary),
        "",
        "## Config Diff Against `config.js`",
        "",
        "No live `config.js` diff was applied. The best intraday candidate is a research-only object; mapping it into live config requires a manual adapter after replay parity is fixed.",
        candidate ? ["", "Research candidate override:", "", "```json", JSON.stringify(candidate, null, 2), "```"].join("\n") : "",
        "",
        "## Realism Notes",
        "",
        "- Entry is on the next monitoring candle open after a closed signal candle.",
        "- Monitoring is M5 when available; otherwise it falls back to the entry timeframe.",
        "- Same-candle TP/SL ambiguity is handled conservatively by checking stop before take-profit.",
        "- Spread is approximated from `backtest/prices/*.jsonl` when available; static fallback is used otherwise.",
        "- Slippage is fixed at `0.2` pips in this first lab version.",
        "- Portfolio margin/leverage is simplified to risk-cash sizing. Treat extreme growth as research-only until broker replay parity is added.",
        "",
        "## Recommendation",
        "",
        "These are research candidates, not live-proven strategies. Do not merge into `config.js`; replay the best candidate with live decision logs and demo/paper test it first.",
    ];
    fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
    return reportPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = parseArgs();
    const reportPath = generateIntradayReport({ sourcePath: args.source || null, mode: String(args.mode || "aggressiveIntraday") });
    console.log(JSON.stringify({ reportPath }, null, 2));
}
