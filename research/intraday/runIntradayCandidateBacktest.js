import fs from "fs";
import path from "path";
import { appendIntradayResult, ensureIntradayDirs, INTRADAY_REPORT_DIR, parseArgs, runIntradayExperiment } from "./runIntradayExperiment.js";

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(Number(value || 0) * factor) / factor;
}

function weekStartUtc(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    date.setUTCHours(0, 0, 0, 0);
    return date.toISOString().slice(0, 10);
}

function weekEndUtc(weekStart) {
    const date = new Date(`${weekStart}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 6);
    return date.toISOString().slice(0, 10);
}

function profitFactor(trades) {
    const grossWin = trades.filter((trade) => trade.pnlCash > 0).reduce((sum, trade) => sum + trade.pnlCash, 0);
    const grossLoss = Math.abs(trades.filter((trade) => trade.pnlCash < 0).reduce((sum, trade) => sum + trade.pnlCash, 0));
    if (grossLoss === 0) return grossWin > 0 ? 99 : 0;
    return grossWin / grossLoss;
}

function maxDrawdownFromEquity(points, startBalance) {
    let peak = startBalance;
    let maxDrawdownPct = 0;
    for (const value of points) {
        peak = Math.max(peak, value);
        maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? ((peak - value) / peak) * 100 : 0);
    }
    return maxDrawdownPct;
}

function summarizeWeeks(trades, startCapital) {
    const sorted = [...trades].sort((a, b) => Date.parse(a.exitTimestamp) - Date.parse(b.exitTimestamp));
    const grouped = new Map();
    for (const trade of sorted) {
        const key = weekStartUtc(trade.exitTimestamp);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(trade);
    }

    let balance = startCapital;
    return [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, weekTrades]) => {
            const startBalance = balance;
            const equityPoints = [];
            for (const trade of weekTrades) {
                balance += trade.pnlCash;
                equityPoints.push(balance);
            }
            const wins = weekTrades.filter((trade) => trade.pnlCash > 0).length;
            const losses = weekTrades.filter((trade) => trade.pnlCash < 0).length;
            const pnl = balance - startBalance;
            const bySymbol = {};
            const bySide = {};
            const byExitReason = {};
            for (const trade of weekTrades) {
                bySymbol[trade.symbol] = (bySymbol[trade.symbol] || 0) + 1;
                bySide[trade.side] = (bySide[trade.side] || 0) + 1;
                byExitReason[trade.exitReason] = (byExitReason[trade.exitReason] || 0) + 1;
            }
            return {
                weekStart,
                weekEnd: weekEndUtc(weekStart),
                startBalance: round(startBalance, 2),
                endBalance: round(balance, 2),
                pnl: round(pnl, 2),
                returnPct: round((pnl / startBalance) * 100, 2),
                trades: weekTrades.length,
                wins,
                losses,
                winRate: round(weekTrades.length ? (wins / weekTrades.length) * 100 : 0, 2),
                profitFactor: round(profitFactor(weekTrades), 3),
                expectancyR: round(weekTrades.reduce((sum, trade) => sum + trade.pnlR, 0) / Math.max(1, weekTrades.length), 4),
                maxDrawdownPct: round(maxDrawdownFromEquity(equityPoints, startBalance), 2),
                bestTradeR: round(Math.max(...weekTrades.map((trade) => trade.pnlR)), 3),
                worstTradeR: round(Math.min(...weekTrades.map((trade) => trade.pnlR)), 3),
                avgHoldBars: round(weekTrades.reduce((sum, trade) => sum + trade.holdBars, 0) / Math.max(1, weekTrades.length), 2),
                bySymbol: Object.entries(bySymbol)
                    .sort((a, b) => b[1] - a[1])
                    .map(([symbol, count]) => `${symbol}:${count}`)
                    .join(", "),
                bySide: Object.entries(bySide)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([side, count]) => `${side}:${count}`)
                    .join(", "),
                exitReasons: Object.entries(byExitReason)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([reason, count]) => `${reason}:${count}`)
                    .join(", "),
            };
        });
}

function table(rows, columns) {
    const header = `| ${columns.join(" | ")} |`;
    const sep = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows.map((row) => `| ${columns.map((column) => String(row[column] ?? "")).join(" | ")} |`);
    return [header, sep, ...body].join("\n");
}

function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeWeeklyCsv(filePath, weeks) {
    const columns = [
        "weekStart",
        "weekEnd",
        "startBalance",
        "endBalance",
        "pnl",
        "returnPct",
        "trades",
        "wins",
        "losses",
        "winRate",
        "profitFactor",
        "expectancyR",
        "maxDrawdownPct",
        "bestTradeR",
        "worstTradeR",
        "avgHoldBars",
        "bySymbol",
        "bySide",
        "exitReasons",
    ];
    const lines = [columns.join(","), ...weeks.map((week) => columns.map((column) => csvEscape(week[column])).join(","))];
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

const args = parseArgs();
const candidatePath = path.resolve(String(args.candidate || "research/intraday/candidates/aggressiveIntraday/best-endCapital__intraday_15012_5bcdee846128.json"));
const source = readJson(candidatePath);
const candidate = source.candidate || source.config || source;
candidate.label = candidate.label || source.experimentId || "intraday_candidate";
candidate.riskProfile = {
    ...(candidate.riskProfile || {}),
    kind: "aggressive_guarded_3pct",
    riskPerTrade: 0.03,
    maxPositions: 1,
    marginCapPct: Number(args.marginCapPct || candidate.riskProfile?.marginCapPct || 0.75),
};

const symbols = String(args.symbols || (source.symbols || candidate.symbols || []).join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
const days = Number(args.days || source.metrics?.days || 90);
const mode = String(args.mode || "aggressiveIntraday");

ensureIntradayDirs();
const result = runIntradayExperiment({ candidate, symbols, days, mode, includeTrades: true });
appendIntradayResult(result);

const weeks = summarizeWeeks(result.trades || [], result.metrics.startCapital);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const baseName = `candidate-backtest-${result.experimentId}-${runId}`;
const weeklyCsvPath = path.join(INTRADAY_REPORT_DIR, `${baseName}.weekly.csv`);
const reportPath = path.join(INTRADAY_REPORT_DIR, `${baseName}.md`);
writeWeeklyCsv(weeklyCsvPath, weeks);

const columns = [
    "weekStart",
    "weekEnd",
    "startBalance",
    "endBalance",
    "pnl",
    "returnPct",
    "trades",
    "wins",
    "losses",
    "winRate",
    "profitFactor",
    "expectancyR",
    "maxDrawdownPct",
    "bestTradeR",
    "worstTradeR",
    "avgHoldBars",
    "bySymbol",
    "exitReasons",
];

const markdown = `# Intraday Candidate Backtest

- generatedAt: ${new Date().toISOString()}
- candidatePath: ${candidatePath}
- experimentId: ${result.experimentId}
- symbols: ${result.symbols.join(", ")}
- dateRange: ${result.dateRange.from} .. ${result.dateRange.to}
- startCapital: ${result.metrics.startCapital}
- endCapital: ${result.metrics.endCapital}
- rawPnl: ${result.metrics.rawPnl}
- maxDrawdownPct: ${result.metrics.maxDrawdownPct}
- trades: ${result.metrics.trades}
- winRate: ${result.metrics.winRate}
- profitFactor: ${result.metrics.profitFactor}
- expectancyR: ${result.metrics.expectancyR}
- riskPerTrade: ${result.riskProfile.riskPerTrade}
- maxPositions: ${result.riskProfile.maxPositions}
- marginCapPct: ${result.riskProfile.marginCapPct || "research_not_margin_sized"}

## Weekly Report

${table(weeks, columns)}

## Runtime Guard Notes

- This research backtest enforces startCapital=500, maxPositions=1, riskPerTrade<=3%, daily trade guards, symbol/day guards, stop-after-losses, and risk reduction after drawdown.
- Margin cap is carried as marginCapPct=${result.riskProfile.marginCapPct || 0.75}. Live sizing enforces broker margin in services/trading.js; research simulator still uses R-based cash sizing and does not fully model broker margin conversion/fill rejection.
- Risk flags: ${result.riskFlags.join(", ") || "none"}
- Rejection reason: ${result.rejectionReason || "none"}
`;

fs.writeFileSync(reportPath, markdown);

console.log(
    JSON.stringify(
        {
            reportPath,
            weeklyCsvPath,
            experimentId: result.experimentId,
            metrics: result.metrics,
            riskProfile: result.riskProfile,
            riskFlags: result.riskFlags,
            rejectionReason: result.rejectionReason,
            weeks: weeks.length,
        },
        null,
        2,
    ),
);
