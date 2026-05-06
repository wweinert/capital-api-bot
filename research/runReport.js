import fs from "fs";
import path from "path";
import { ensureResearchDirs, parseArgs, REPORT_DIR, RESULTS_PATH } from "./experimentTarget.js";
import { riskFlagsFor, scoreSet } from "./scoreExperiment.js";

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

function num(value, fallback = null) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function fmt(value, digits = 2) {
    const parsed = num(value);
    return parsed === null ? "n/a" : parsed.toFixed(digits);
}

function metricRow(row) {
    const metrics = {
        trades: num(row.trades, 0),
        winRatePct: num(row.winRate, 0),
        profitFactor: num(row.profitFactor, 0),
        expectancyR: num(row.expectancyR, 0),
        maxDrawdownPct: num(row.maxDrawdownPct, 0),
        startCapital: num(row.startCapital, 500),
        endCapital: num(row.endCapital, 0),
        rawPnl: num(row.rawPnl, 0),
        averageHoldBars: num(row.averageHoldBars, 0),
    };
    const scores = scoreSet(metrics, {});
    return {
        ...row,
        metrics,
        scores: {
            robust: scores.robust,
            balanced: scores.balanced,
            aggressive: scores.aggressive,
            maxProfit: scores.maxProfit,
        },
        riskFlags: riskFlagsFor(metrics),
    };
}

function scoreKey(mode) {
    if (mode === "max-profit" || mode === "max_profit") return "maxProfit";
    if (mode === "balanced") return "balanced";
    if (mode === "aggressive") return "aggressive";
    return "robust";
}

function byMetric(key) {
    return (a, b) => num(b.metrics[key], -Infinity) - num(a.metrics[key], -Infinity);
}

function byScore(key) {
    return (a, b) => num(b.scores[key], -Infinity) - num(a.scores[key], -Infinity);
}

function table(rows, { score = "aggressive", top = 20 } = {}) {
    const shown = rows.slice(0, top);
    if (!shown.length) return "_No rows._";
    const header = [
        "rank",
        "experimentId",
        "trades",
        "winRate",
        "PF",
        "expectancyR",
        "maxDD",
        "endCapital",
        "rawPnl",
        score,
        "riskFlags",
        "rejectionReason",
    ];
    const body = shown.map((row, index) => [
        index + 1,
        row.experimentId,
        row.metrics.trades,
        fmt(row.metrics.winRatePct),
        fmt(row.metrics.profitFactor, 3),
        fmt(row.metrics.expectancyR, 4),
        fmt(row.metrics.maxDrawdownPct),
        fmt(row.metrics.endCapital),
        fmt(row.metrics.rawPnl),
        fmt(row.scores[score], 4),
        row.riskFlags.join(",") || "",
        row.rejectionReason || "",
    ]);
    return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...body.map((cols) => `| ${cols.join(" | ")} |`)].join("\n");
}

function latestSearchSummary() {
    if (!fs.existsSync(REPORT_DIR)) return null;
    const files = fs
        .readdirSync(REPORT_DIR)
        .filter((name) => name.startsWith("search_") && name.endsWith(".json"))
        .map((name) => path.join(REPORT_DIR, name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0] || null;
}

function findCandidatePath(experimentId, preferredSubdirs = []) {
    if (!experimentId) return null;
    const roots = [
        ...preferredSubdirs.map((subdir) => path.join(process.cwd(), "research", "candidates", subdir)),
        path.join(process.cwd(), "research", "candidates"),
    ];
    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        const stack = [root];
        while (stack.length) {
            const dir = stack.pop();
            for (const name of fs.readdirSync(dir)) {
                const full = path.join(dir, name);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) {
                    stack.push(full);
                } else if (name.endsWith(".json") && name.includes(experimentId)) {
                    return full;
                }
            }
        }
    }
    return null;
}

function readCandidate(experimentId, preferredSubdirs = []) {
    const candidatePath = findCandidatePath(experimentId, preferredSubdirs);
    if (!candidatePath) return { candidatePath: null, json: null };
    try {
        return { candidatePath, json: JSON.parse(fs.readFileSync(candidatePath, "utf8")) };
    } catch {
        return { candidatePath, json: null };
    }
}

function codeBlockJson(value) {
    return ["```json", JSON.stringify(value ?? {}, null, 2), "```"].join("\n");
}

function todaySection(summary) {
    const comparison = summary?.baseline?.todayComparison || summary?.best?.todayComparison;
    if (!comparison) return "Today comparison unavailable.";
    return [
        `Date: \`${comparison.date}\``,
        `Simulated accepted trades today: \`${comparison.simulatedTrades?.length || 0}\``,
        `Actual logged trades today: \`${comparison.actualTrades?.length || 0}\``,
        "",
        "Actual trades:",
        comparison.actualTrades?.length
            ? comparison.actualTrades.map((trade) => `- ${trade.openedAt} ${trade.symbol} ${trade.signal || ""} status=${trade.status || "unknown"} dealId=${trade.dealId || "n/a"}`).join("\n")
            : "- none",
        "",
        "Simulated trades:",
        comparison.simulatedTrades?.length
            ? comparison.simulatedTrades.map((trade) => `- ${trade.entryTimestamp} ${trade.symbol} ${trade.side} exit=${trade.exitReason} pnlR=${trade.pnlRNet}`).join("\n")
            : "- none",
    ].join("\n");
}

function writeLiveParityDiagnostics(summary) {
    const comparison = summary?.baseline?.todayComparison || summary?.best?.todayComparison || null;
    const lines = [
        "# Live Parity Diagnostics",
        "",
        `Generated: \`${new Date().toISOString()}\``,
        "",
        "## Observed Mismatch",
        "",
        comparison
            ? [
                  `Date: \`${comparison.date}\``,
                  `Backtest/replay expected accepted trades: \`${comparison.simulatedTrades?.length || 0}\``,
                  `Live JSON logs showed actual trades: \`${comparison.actualTrades?.length || 0}\``,
              ].join("\n")
            : "No todayComparison payload was available in the latest search summary.",
        "",
        "## Why Backtest Expected More Trades",
        "",
        "- The research backtest has complete refreshed `M15` candles through the dataset end and can evaluate every HLLH candidate deterministically.",
        "- It applies the configured research guards: start capital `500`, risk `3%`, one portfolio position at a time, one active trade per symbol through the portfolio sequencer, max stop, session hours, forced close, and pending-entry expiry.",
        "- It simulates fills from OHLC candles and portfolio ordering, not from actual broker acceptance, live polling cadence, or real bid/ask execution state.",
        "",
        "## Why Live Could Have Fewer Trades",
        "",
        "- Live execution depends on the bot being active at the exact polling windows and on broker candles being available at that moment.",
        "- `services/trading.js` can skip signals when global max positions, symbol-level open positions, broker state sync, margin, or order placement constraints block an entry.",
        "- Live candles and backtest candles may differ by final candle timing, partial candles, broker updates, bid/ask spread, and timestamp normalization.",
        "- Signal identity memory can suppress duplicates in live if `normalizedCandidateId` was already processed, while the backtest only sees the clean offline sequence.",
        "- Live exits and broker fills change `openUntil` timing. With one active position, one delayed or rejected live close can remove later opportunities that the replay accepts.",
        "- Order-level details such as spread spikes, minimum stop rules, rejected order causes, and available margin are not fully represented in the current research score.",
        "",
        "## Can AutoSearch Be Trusted Before This Is Fixed?",
        "",
        "Use AutoSearch as a research generator only. The ranking can find interesting parameter ideas, but it is not live proof while live/replay parity is unresolved. A candidate with high backtest growth must be replayed against live decision logs before it is considered for demo or paper trading.",
        "",
        "## Fix Before LLM Layer",
        "",
        "- Add decision logs for every HLLH candidate: accepted, rejected, and skipped, with exact guard reason.",
        "- Replay live day from the same broker candles, same timestamp normalization, same pending-entry state, same position lifecycle, and same one-position guard.",
        "- Store broker rejection causes, fill price, spread, stop distance, margin snapshot, and `normalizedCandidateId` for each attempted entry.",
        "- Add a parity test that compares live decisions vs replay decisions per symbol and per candle before using logs for an LLM dataset.",
        "",
        "## Today Details",
        "",
        todaySection(summary),
        "",
    ];
    const filePath = path.join(REPORT_DIR, "live-parity-diagnostics.md");
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
    return filePath;
}

function leaderPathLine(label, row, preferredSubdirs) {
    const { candidatePath } = readCandidate(row?.experimentId, preferredSubdirs);
    return `- ${label}: \`${row?.experimentId || "n/a"}\`${candidatePath ? `, JSON: \`${candidatePath}\`` : ", JSON: `not saved for this historical row`"}`;
}

export function generateReport({ sourcePath = null, top = 20, mode = "aggressive" } = {}) {
    ensureResearchDirs();
    const rows = readTsv(RESULTS_PATH).map(metricRow);
    const selectedKey = scoreKey(mode);
    const baseline = [...rows].reverse().find((row) => row.experimentId?.startsWith("baseline_live_config"));
    const previousRobustBest = [...rows]
        .filter((row) => !row.experimentId?.startsWith("baseline") && !row.rejectionReason)
        .sort(byScore("robust"))[0];
    const aggressiveBest = [...rows].filter((row) => !row.experimentId?.startsWith("baseline")).sort(byScore("aggressive"))[0];
    const maxProfitBest = [...rows].filter((row) => !row.experimentId?.startsWith("baseline")).sort(byScore("maxProfit"))[0];
    const selectedBest = [...rows].filter((row) => !row.experimentId?.startsWith("baseline")).sort(byScore(selectedKey))[0];
    const dd40 = [...rows].filter((row) => row.metrics.maxDrawdownPct < 40).sort(byMetric("endCapital"));
    const dd60 = [...rows].filter((row) => row.metrics.maxDrawdownPct < 60).sort(byMetric("endCapital"));
    const dd80 = [...rows].filter((row) => row.metrics.maxDrawdownPct < 80).sort(byMetric("endCapital"));
    const highRisk = [...rows]
        .filter((row) => row.metrics.rawPnl > 0 && row.metrics.maxDrawdownPct >= 40)
        .sort(byMetric("endCapital"));
    const dangerousHighRisk = [...rows]
        .filter((row) => row.metrics.rawPnl > 0 && row.metrics.maxDrawdownPct >= 60)
        .sort(byMetric("endCapital"));
    const resolvedSourcePath = sourcePath || latestSearchSummary();
    const summary = resolvedSourcePath && fs.existsSync(resolvedSourcePath) ? JSON.parse(fs.readFileSync(resolvedSourcePath, "utf8")) : null;
    const parityPath = writeLiveParityDiagnostics(summary);
    const reportName = `autosearch_${mode}_${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
    const reportPath = path.join(REPORT_DIR, reportName);
    const summaryPath = path.join(REPORT_DIR, "aggressive-search-summary.md");
    const bestCandidateInfo = readCandidate(selectedBest?.experimentId, [mode, "aggressive", "max-profit", "high-risk", "balanced"]);
    const aggressiveCandidateInfo = readCandidate(aggressiveBest?.experimentId, ["aggressive", "high-risk"]);
    const maxProfitCandidateInfo = readCandidate(maxProfitBest?.experimentId, ["max-profit", "high-risk", "aggressive"]);
    const selectedOverrides = bestCandidateInfo.json?.candidate?.overrides || null;

    const lines = [
        "# Aggressive HLLH AutoSearch Summary",
        "",
        `Generated: \`${new Date().toISOString()}\``,
        `Mode: \`${mode}\``,
        `Selected score column: \`${selectedKey}\``,
        `Results file: \`research/results.tsv\``,
        `Rows analyzed: \`${rows.length}\``,
        resolvedSourcePath ? `Search summary: \`${path.relative(process.cwd(), resolvedSourcePath)}\`` : "Search summary: `n/a`",
        `Live parity diagnostics: \`${path.relative(process.cwd(), parityPath)}\``,
        "",
        "## Exact Commands",
        "",
        "```bash",
        "npm run research:baseline -- --days=90 --mode=robust",
        "npm run research:search -- --minutes=30 --days=90 --mode=aggressive --seed=20260505",
        "npm run research:search -- --minutes=15 --days=90 --mode=max-profit --seed=202605051",
        "npm run research:report -- --mode=aggressive",
        "npm run research:report -- --mode=max-profit",
        "```",
        "",
        "## Baseline",
        "",
        baseline ? table([baseline], { score: selectedKey, top: 1 }) : "_Baseline unavailable._",
        "",
        "## Previous Robust Best",
        "",
        previousRobustBest ? table([previousRobustBest], { score: "robust", top: 1 }) : "_No robust accepted candidate found._",
        "",
        "## New Aggressive Best",
        "",
        aggressiveBest ? table([aggressiveBest], { score: "aggressive", top: 1 }) : "_No aggressive candidate found._",
        "",
        "## New Max-Profit Best",
        "",
        maxProfitBest ? table([maxProfitBest], { score: "maxProfit", top: 1 }) : "_No max-profit candidate found._",
        "",
        "## Candidate JSON Paths",
        "",
        leaderPathLine("Selected best", selectedBest, [mode, "aggressive", "max-profit", "high-risk", "balanced"]),
        leaderPathLine("Aggressive best", aggressiveBest, ["aggressive", "high-risk"]),
        leaderPathLine("Max-profit best", maxProfitBest, ["max-profit", "high-risk", "aggressive"]),
        leaderPathLine("Best maxDD < 60%", dd60[0], ["aggressive", "balanced", "high-risk"]),
        leaderPathLine("Best maxDD < 80%", dd80[0], ["high-risk", "aggressive"]),
        "",
        "## Config Diff Against Current config.js",
        "",
        selectedOverrides
            ? "The candidate is represented as these overrides on top of current `HLLH_SYMBOL_PROFILES`:"
            : "Candidate JSON is not available for the selected historical row, so exact overrides cannot be shown from artifacts.",
        selectedOverrides ? codeBlockJson(selectedOverrides) : "",
        "",
        "## Why The Candidate Is Interesting",
        "",
        "- Ranking is now profit-first for `aggressive` and `max-profit`: high `endCapital` and `rawPnl` are shown even when drawdown is ugly.",
        "- The report keeps dangerous candidates visible for manual research instead of filtering them out through robust-only rejection.",
        "- The backtest still includes the practical guards used in this research harness: start capital `500`, risk `3%`, one open portfolio position, one position per symbol through sequencing, max stop checks, session filters, and forced close.",
        "",
        "## Why The Candidate Is Dangerous",
        "",
        "- High `maxDrawdownPct` can mean the account nearly dies before the profit materializes.",
        "- `rejectionReason` is still shown as risk metadata; it no longer means the candidate is useless.",
        "- Live/replay mismatch is unresolved, so these are research candidates, not live-proven strategies.",
        "",
        "## Recommendation",
        "",
        "Not live-ready. Use for manual review, then replay against live decision logs, then paper-test/demo-test. Do not merge into `config.js` blindly.",
        "",
        "## Top 20 By endCapital",
        "",
        table([...rows].sort(byMetric("endCapital")), { score: selectedKey, top }),
        "",
        "## Top 20 By rawPnl",
        "",
        table([...rows].sort(byMetric("rawPnl")), { score: selectedKey, top }),
        "",
        "## Top 20 By aggressiveScore",
        "",
        table([...rows].sort(byScore("aggressive")), { score: "aggressive", top }),
        "",
        "## Top 20 By profitFactor",
        "",
        table([...rows].sort(byMetric("profitFactor")), { score: selectedKey, top }),
        "",
        "## Top 20 By expectancyR",
        "",
        table([...rows].sort(byMetric("expectancyR")), { score: selectedKey, top }),
        "",
        "## Top Candidates With maxDrawdown < 40%",
        "",
        table(dd40, { score: selectedKey, top }),
        "",
        "## Top Candidates With maxDrawdown < 60%",
        "",
        table(dd60, { score: selectedKey, top }),
        "",
        "## Top Candidates With maxDrawdown < 80%",
        "",
        table(dd80, { score: selectedKey, top }),
        "",
        "## Top Candidates With trades >= 100",
        "",
        table([...rows].filter((row) => row.metrics.trades >= 100).sort(byScore(selectedKey)), { score: selectedKey, top }),
        "",
        "## Top Candidates With trades >= 200",
        "",
        table([...rows].filter((row) => row.metrics.trades >= 200).sort(byScore(selectedKey)), { score: selectedKey, top }),
        "",
        "## High profit / high risk candidates",
        "",
        table(highRisk, { score: selectedKey, top }),
        "",
        "## Top candidates with high profit but dangerous drawdown",
        "",
        table(dangerousHighRisk, { score: selectedKey, top }),
        "",
        "## Today Backtest vs Actual Logs",
        "",
        todaySection(summary),
        "",
        "## Warnings",
        "",
        "- This is a backtest/research ranking, not evidence of live profitability.",
        "- Do not automatically apply any candidate to live config.",
        "- Candidates with `low_sample`, `weak_sample`, `high_drawdown`, `very_high_drawdown`, or `extremely_dangerous` need manual review.",
        "- Before LLM-layer work, fix live/replay parity and add skipped-signal diagnostics.",
    ];

    fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
    fs.writeFileSync(summaryPath, `${lines.join("\n")}\n`);
    return reportPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = parseArgs();
    const mode = String(args.mode || "aggressive").toLowerCase();
    const reportPath = generateReport({ sourcePath: args.source || null, top: Number(args.top || 20), mode });
    console.log(JSON.stringify({ reportPath, summaryPath: path.join(REPORT_DIR, "aggressive-search-summary.md") }, null, 2));
}
