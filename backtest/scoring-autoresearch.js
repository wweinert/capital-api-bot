import fs from "node:fs";
import path from "node:path";
import { BollingerBands, EMA, MACD, RSI } from "technicalindicators";

// Autonomous, bounded research harness for the legacy seven-condition scoring
// entry. It does not touch the live strategy: it compares entry requirements
// and session-symbol sets against fixed historical data and a fixed execution
// model. See the printed report before promoting any result to entry.js.
const DATA_DIR = process.env.CAPITAL_DATASET_DIR || path.join(process.cwd(), "backtest", "capital-dataset");
const REPORT_PATH = process.env.REPORT_PATH || path.join(process.cwd(), "backtest", "reports", "scoring-autoresearch.json");
const SYMBOLS = String(process.env.SYMBOLS || "AUDCAD,AUDJPY,AUDUSD,EURAUD,EURCHF,EURGBP,EURJPY,EURUSD,GBPAUD,GBPCHF,GBPJPY,GBPUSD,NZDJPY,NZDUSD,USDCAD,USDCHF,USDJPY")
    .split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);

const PERIODS = {
    end: Date.parse("2026-07-13T20:00:00Z"),
    start: Date.parse("2026-01-13T00:00:00Z"),
};
const WALK_FORWARD = [
    { id: "2026-03", trainEnd: Date.parse("2026-03-13T00:00:00Z"), testEnd: Date.parse("2026-04-13T00:00:00Z") },
    { id: "2026-04", trainEnd: Date.parse("2026-04-13T00:00:00Z"), testEnd: Date.parse("2026-05-13T00:00:00Z") },
    { id: "2026-05", trainEnd: Date.parse("2026-05-13T00:00:00Z"), testEnd: Date.parse("2026-06-13T00:00:00Z") },
];
const FINAL_HOLDOUT = { id: "2026-06", trainEnd: Date.parse("2026-06-13T00:00:00Z"), testEnd: PERIODS.end };
const SESSIONS = { SYDNEY: [22, 7], TOKYO: [0, 9], LONDON: [8, 17], NY: [13, 21] };
const SESSION_PRIORITY = ["NY", "LONDON", "TOKYO", "SYDNEY"];
const MAX_POSITIONS = 5;
const MIN_TRAIN_SIGNALS_PER_SYMBOL = 20;
const TIME_BUDGET_MS = Math.max(60_000, Number(process.env.TIME_BUDGET_MINUTES || 10) * 60_000);
const PROGRESS_PATH = process.env.PROGRESS_PATH || REPORT_PATH.replace(/\.json$/, "-progress.json");
const SESSION_HOUR_PROFILES = {
    all: { SYDNEY: [22, 23, 0, 1, 2, 3, 4, 5, 6], TOKYO: [0, 1, 2, 3, 4, 5, 6, 7, 8], LONDON: [8, 9, 10, 11, 12, 13, 14, 15, 16], NY: [13, 14, 15, 16, 17, 18, 19, 20] },
    opening3: { SYDNEY: [22, 23, 0], TOKYO: [0, 1, 2], LONDON: [8, 9, 10], NY: [13, 14, 15] },
    opening5: { SYDNEY: [22, 23, 0, 1, 2], TOKYO: [0, 1, 2, 3, 4], LONDON: [8, 9, 10, 11, 12], NY: [13, 14, 15, 16, 17] },
    middle5: { SYDNEY: [1, 2, 3, 4, 5], TOKYO: [2, 3, 4, 5, 6], LONDON: [10, 11, 12, 13, 14], NY: [15, 16, 17, 18, 19] },
};

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const quote = (row, key, side, fallback) => number(row?.[`${key}${side === "ask" ? "Ask" : "Bid"}`] ?? row?.[side]?.[key] ?? row?.[fallback]);

function load(symbol, timeframe) {
    const file = path.join(DATA_DIR, `${symbol}_${timeframe}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8").trim().split("\n").flatMap((line) => {
        try {
            const raw = JSON.parse(line);
            const tsMs = Date.parse(raw.timestamp);
            const open = number(raw.open), high = number(raw.high), low = number(raw.low), close = number(raw.close);
            if (!(Number.isFinite(tsMs) && [open, high, low, close].every(Number.isFinite))) return [];
            return [{
                tsMs, open, high, low, close,
                openBid: quote(raw, "open", "bid", "open") ?? open,
                openAsk: quote(raw, "open", "ask", "open") ?? open,
                highBid: quote(raw, "high", "bid", "high") ?? high,
                highAsk: quote(raw, "high", "ask", "high") ?? high,
                lowBid: quote(raw, "low", "bid", "low") ?? low,
                lowAsk: quote(raw, "low", "ask", "low") ?? low,
                closeBid: quote(raw, "close", "bid", "close") ?? close,
                closeAsk: quote(raw, "close", "ask", "close") ?? close,
            }];
        } catch { return []; }
    }).sort((a, b) => a.tsMs - b.tsMs);
}

function indexAtOrBefore(rows, tsMs) {
    let low = 0, high = rows.length - 1, result = -1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (rows[middle].tsMs <= tsMs) { result = middle; low = middle + 1; } else high = middle - 1;
    }
    return result;
}

// Every indicator is calculated once per complete series. The previous
// implementation recalculated a 220-candle window at every M15 decision and
// made a one-minute research budget impossible to honour.
const indicatorCache = new WeakMap();
function indicators(rows, index) {
    let series = indicatorCache.get(rows);
    if (!series) {
        const closes = rows.map((row) => row.close);
        series = {
            ema50: EMA.calculate({ period: 50, values: closes }),
            ema200: EMA.calculate({ period: 200, values: closes }),
            ema9: EMA.calculate({ period: 9, values: closes }),
            ema21: EMA.calculate({ period: 21, values: closes }),
            rsi: RSI.calculate({ period: 14, values: closes }),
            bb: BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }),
            macd: MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: closes, SimpleMAOscillator: false, SimpleMASignal: false }),
        };
        indicatorCache.set(rows, series);
    }
    if (index < 199) return null;
    const value = (name, period, at = index) => series[name][at - (period - 1)];
    const ema50 = value("ema50", 50), ema200 = value("ema200", 200);
    return {
        ema50, ema200,
        ema9: value("ema9", 9), ema21: value("ema21", 21),
        previousEma9: value("ema9", 9, index - 1), previousEma21: value("ema21", 21, index - 1),
        rsi: value("rsi", 14), bb: value("bb", 20), macd: value("macd", 34),
        bullishTrend: ema50 > ema200 && rows[index].close > ema50,
    };
}

function sessionAt(tsMs) {
    const hour = new Date(tsMs).getUTCHours();
    for (const name of SESSION_PRIORITY) {
        const [start, end] = SESSIONS[name];
        if (start < end ? hour >= start && hour < end : hour >= start || hour < end) return name;
    }
    return null;
}

function scoreConditions(h4, h1, m15, row) {
    const buy = [
        h4.ema50 > h4.ema200 && h4.bullishTrend,
        h4.macd?.histogram > 0,
        h1.ema9 > h1.ema21,
        h1.rsi < 35,
        m15.ema9 > m15.ema21 && m15.previousEma9 <= m15.previousEma21,
        m15.rsi < 30,
        row.closeBid <= m15.bb?.lower,
    ];
    const sell = [
        !h4.bullishTrend,
        h4.macd?.histogram < 0,
        h1.ema9 < h1.ema21,
        h1.rsi > 65,
        m15.ema9 < m15.ema21 && m15.previousEma9 >= m15.previousEma21,
        m15.rsi > 70,
        row.closeAsk >= m15.bb?.upper,
    ];
    const buyScore = buy.filter(Boolean).length, sellScore = sell.filter(Boolean).length;
    if (buyScore === sellScore) return null;
    return buyScore > sellScore ? { side: "BUY", conditions: buy, score: buyScore, opposingScore: sellScore } : { side: "SELL", conditions: sell, score: sellScore, opposingScore: buyScore };
}

function outcome(rows, index, side, symbol) {
    const signal = rows[index], entryRow = rows[index + 1];
    const entry = side === "BUY" ? entryRow.openAsk : entryRow.openBid;
    const buffer = symbol.endsWith("JPY") ? 0.01 : 0.0001;
    const stop = side === "BUY" ? signal.lowBid - buffer : signal.highAsk + buffer;
    const riskDistance = Math.abs(entry - stop);
    if (!(riskDistance > 0)) return null;
    const takeProfit = side === "BUY" ? entry + 2 * riskDistance : entry - 2 * riskDistance;
    for (let next = index + 1; next < rows.length; next += 1) {
        const row = rows[next];
        const stopHit = side === "BUY" ? row.lowBid <= stop : row.highAsk >= stop;
        const targetHit = side === "BUY" ? row.highBid >= takeProfit : row.lowAsk <= takeProfit;
        if (stopHit || targetHit) return { openTsMs: entryRow.tsMs, closeTsMs: row.tsMs, pnlR: stopHit ? -1 : 2, ambiguous: stopHit && targetHit };
    }
    const last = rows.at(-1), exit = side === "BUY" ? last.closeBid : last.closeAsk;
    return { openTsMs: entryRow.tsMs, closeTsMs: last.tsMs, pnlR: (side === "BUY" ? exit - entry : entry - exit) / riskDistance, ambiguous: false };
}

function precomputeCandidates() {
    const all = [];
    for (const symbol of SYMBOLS) {
        const h4 = load(symbol, "H4"), h1 = load(symbol, "H1"), m15 = load(symbol, "M15");
        for (let index = 199; index < m15.length - 1; index += 1) {
            const row = m15[index];
            if (row.tsMs < PERIODS.start || row.tsMs >= PERIODS.end) continue;
            const h4Index = indexAtOrBefore(h4, row.tsMs), h1Index = indexAtOrBefore(h1, row.tsMs);
            if (h4Index < 199 || h1Index < 199) continue;
            const scored = scoreConditions(indicators(h4, h4Index), indicators(h1, h1Index), indicators(m15, index), row);
            if (!scored || !sessionAt(row.tsMs)) continue;
            const result = outcome(m15, index, scored.side, symbol);
            const pip = symbol.endsWith("JPY") ? 0.01 : 0.0001;
            const body = Math.abs(row.close - row.open);
            const range = row.high - row.low;
            if (result) all.push({
                symbol,
                session: sessionAt(row.tsMs),
                hour: new Date(row.tsMs).getUTCHours(),
                bodyRatio: range > 0 ? body / range : 0,
                rangePips: range / pip,
                bodySupportsSide: scored.side === "BUY" ? row.close > row.open : row.close < row.open,
                ...scored,
                ...result,
            });
        }
    }
    return all;
}

function qualifies(candidate, config) {
    return candidate.score >= config.threshold
        && candidate.score - candidate.opposingScore >= config.minScoreGap
        && config.required.every((index) => candidate.conditions[index])
        && (!config.requireSignalCandle || candidate.bodySupportsSide)
        && candidate.bodyRatio >= config.minBodyRatio
        && candidate.rangePips <= config.maxRangePips
        && config.hoursBySession[candidate.session].includes(candidate.hour);
}

function summarize(trades) {
    const totalR = trades.reduce((sum, trade) => sum + trade.pnlR, 0);
    const winners = trades.filter((trade) => trade.pnlR > 0), losers = trades.filter((trade) => trade.pnlR < 0);
    const profit = winners.reduce((sum, trade) => sum + trade.pnlR, 0), loss = Math.abs(losers.reduce((sum, trade) => sum + trade.pnlR, 0));
    const days = new Map();
    const entryDays = new Set();
    for (const trade of trades) {
        const day = new Date(trade.closeTsMs).toISOString().slice(0, 10);
        days.set(day, (days.get(day) || 0) + trade.pnlR);
        entryDays.add(new Date(trade.openTsMs).toISOString().slice(0, 10));
    }
    const dailyR = [...days.values()];
    const positiveDays = dailyR.filter((value) => value > 0).length;
    return {
        trades: trades.length,
        totalR,
        grossProfitR: profit,
        grossLossR: loss,
        expectancyR: trades.length ? totalR / trades.length : null,
        profitFactor: loss ? profit / loss : null,
        winRate: trades.length ? winners.length / trades.length : null,
        activeDays: dailyR.length,
        positiveDays,
        positiveDayPct: dailyR.length ? positiveDays / dailyR.length : null,
        averageDailyR: dailyR.length ? totalR / dailyR.length : null,
        worstDailyR: dailyR.length ? Math.min(...dailyR) : null,
        dailyR: Object.fromEntries(days),
        entryDays: [...entryDays].sort(),
    };
}

function tradingDaysBetween(fromMs, toMs) {
    const days = [];
    for (let cursor = Date.UTC(new Date(fromMs).getUTCFullYear(), new Date(fromMs).getUTCMonth(), new Date(fromMs).getUTCDate()); cursor < toMs; cursor += 86_400_000) {
        const weekday = new Date(cursor).getUTCDay();
        if (weekday >= 1 && weekday <= 5) days.push(new Date(cursor).toISOString().slice(0, 10));
    }
    return days;
}

function pairRank(row, mode) {
    if (mode === "daily_consistency") return row.positiveDayPct * 10 + row.averageDailyR;
    if (mode === "total_r") return row.totalR;
    return row.expectancyR;
}

function selectSymbols(candidates, config, topNBySession, rankMode) {
    const selected = {};
    for (const session of Object.keys(SESSIONS)) {
        const grouped = new Map();
        for (const item of candidates) {
            if (item.session !== session || !qualifies(item, config)) continue;
            const rows = grouped.get(item.symbol) || [];
            rows.push(item); grouped.set(item.symbol, rows);
        }
        selected[session] = [...grouped.entries()]
            .map(([symbol, rows]) => ({ symbol, ...summarize(rows) }))
            .filter((row) => row.trades >= MIN_TRAIN_SIGNALS_PER_SYMBOL && row.expectancyR > 0 && row.profitFactor > 1 && row.positiveDayPct >= 0.5)
            .sort((left, right) => pairRank(right, rankMode) - pairRank(left, rankMode) || right.trades - left.trades)
            .slice(0, topNBySession[session]);
    }
    return selected;
}

function simulate(candidates, config, selection, { tradingDays = [] } = {}) {
    const allowed = Object.fromEntries(Object.entries(selection).map(([session, rows]) => [session, new Set(rows.map((row) => row.symbol))]));
    const ordered = candidates.filter((item) => qualifies(item, config) && allowed[item.session]?.has(item.symbol)).sort((left, right) => left.openTsMs - right.openTsMs || left.symbol.localeCompare(right.symbol));
    const active = [], trades = [];
    const entriesBySymbolDay = new Map(), lastEntryBySymbol = new Map();
    let skippedSameSymbol = 0, skippedSlots = 0, skippedDailyEntryCap = 0, skippedCooldown = 0;
    for (const candidate of ordered) {
        for (let index = active.length - 1; index >= 0; index -= 1) if (active[index].closeTsMs <= candidate.openTsMs) active.splice(index, 1);
        const day = new Date(candidate.openTsMs).toISOString().slice(0, 10);
        const symbolDay = `${candidate.symbol}:${day}`;
        const previousEntry = lastEntryBySymbol.get(candidate.symbol) || null;
        if ((entriesBySymbolDay.get(symbolDay) || 0) >= config.maxEntriesPerSymbolDay) { skippedDailyEntryCap += 1; continue; }
        if (previousEntry && candidate.openTsMs - previousEntry < config.cooldownMinutes * 60_000) { skippedCooldown += 1; continue; }
        if (active.some((trade) => trade.symbol === candidate.symbol)) { skippedSameSymbol += 1; continue; }
        if (active.length >= MAX_POSITIONS) { skippedSlots += 1; continue; }
        active.push(candidate); trades.push(candidate);
        lastEntryBySymbol.set(candidate.symbol, candidate.openTsMs);
        entriesBySymbolDay.set(symbolDay, (entriesBySymbolDay.get(symbolDay) || 0) + 1);
    }
    const summary = summarize(trades);
    const entryDaySet = new Set(summary.entryDays);
    const coveredTradingDays = tradingDays.filter((day) => entryDaySet.has(day)).length;
    return {
        ...summary,
        expectedTradingDays: tradingDays.length,
        coveredTradingDays,
        entryDayCoverage: tradingDays.length ? coveredTradingDays / tradingDays.length : null,
        skippedSameSymbol,
        skippedSlots,
        skippedDailyEntryCap,
        skippedCooldown,
        selectedSymbols: Object.values(selection).flat().length,
    };
}

function researchScore(summary) {
    if (summary.entryDayCoverage < 1 || !(summary.totalR > 0) || !(summary.expectancyR > 0) || !(summary.profitFactor > 1) || !(summary.positiveDayPct >= 0.52)) return -Infinity;
    return summary.positiveDayPct * 100 + summary.averageDailyR * 20 + Math.min(summary.profitFactor, 3) * 5 + Math.min(summary.totalR, 100) / 10;
}

const candidates = precomputeCandidates();

function mergeSummaries(parts) {
    const daily = new Map();
    const entryDays = new Set();
    let trades = 0, totalR = 0, grossProfitR = 0, grossLossR = 0, skippedSameSymbol = 0, skippedSlots = 0, selectedSymbols = 0, expectedTradingDays = 0;
    for (const part of parts) {
        trades += part.trades;
        totalR += part.totalR;
        grossProfitR += part.grossProfitR;
        grossLossR += part.grossLossR;
        skippedSameSymbol += part.skippedSameSymbol || 0;
        skippedSlots += part.skippedSlots || 0;
        selectedSymbols += part.selectedSymbols || 0;
        expectedTradingDays += part.expectedTradingDays || 0;
        for (const [day, value] of Object.entries(part.dailyR || {})) daily.set(day, (daily.get(day) || 0) + value);
        for (const day of part.entryDays || []) entryDays.add(day);
    }
    const dailyR = [...daily.values()];
    const positiveDays = dailyR.filter((value) => value > 0).length;
    return {
        trades,
        totalR,
        grossProfitR,
        grossLossR,
        expectancyR: trades ? totalR / trades : null,
        profitFactor: grossLossR ? grossProfitR / grossLossR : null,
        activeDays: dailyR.length,
        positiveDays,
        positiveDayPct: dailyR.length ? positiveDays / dailyR.length : null,
        averageDailyR: dailyR.length ? totalR / dailyR.length : null,
        worstDailyR: dailyR.length ? Math.min(...dailyR) : null,
        skippedSameSymbol,
        skippedSlots,
        selectedSymbols,
        dailyR: Object.fromEntries(daily),
        entryDays: [...entryDays].sort(),
        expectedTradingDays,
        coveredTradingDays: entryDays.size,
        entryDayCoverage: expectedTradingDays ? entryDays.size / expectedTradingDays : null,
    };
}

function evaluateWindow(config, topNBySession, rankMode, window) {
    const train = candidates.filter((item) => item.openTsMs < window.trainEnd);
    // Only completed trades belong to the test month. This avoids using an
    // exit price that is not yet known at the monthly re-selection boundary.
    const test = candidates.filter((item) => item.openTsMs >= window.trainEnd && item.openTsMs < window.testEnd && item.closeTsMs <= window.testEnd);
    const selection = selectSymbols(train, config, topNBySession, rankMode);
    return { id: window.id, selection, result: simulate(test, config, selection, { tradingDays: tradingDaysBetween(window.trainEnd, window.testEnd) }) };
}

function evaluateWalkForward(config, topNBySession, rankMode) {
    const windows = WALK_FORWARD.map((window) => evaluateWindow(config, topNBySession, rankMode, window));
    return { windows, summary: mergeSummaries(windows.map((window) => window.result)) };
}

function compareExperiments(left, right) {
    if (right.score !== left.score) return right.score - left.score;
    const rightSummary = right.walkForward.summary, leftSummary = left.walkForward.summary;
    return (rightSummary.entryDayCoverage || 0) - (leftSummary.entryDayCoverage || 0)
        || (rightSummary.averageDailyR || -Infinity) - (leftSummary.averageDailyR || -Infinity)
        || rightSummary.totalR - leftSummary.totalR;
}

const experiments = [];
let randomState = 20260713;
const random = () => {
    randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0;
    return randomState / 2 ** 32;
};
const generated = new Set();
const startedAt = Date.now();
let lastProgressAt = startedAt;
const FOCUSED_REQUIREMENTS = [
    [0, 2, 4],
    [0, 1, 2, 4],
    [0, 2, 4, 6],
    [0, 1, 2],
    [0, 2],
    [0, 2, 4, 5],
];
while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const required = FOCUSED_REQUIREMENTS[Math.floor(random() * FOCUSED_REQUIREMENTS.length)];
    const threshold = Math.max(required.length, 3 + Math.floor(random() * 3));
    const minScoreGap = 1 + Math.floor(random() * 2);
    const requireSignalCandle = random() < 0.5;
    const minBodyRatio = [0, 0.2, 0.4, 0.6][Math.floor(random() * 4)];
    const maxRangePips = [12, 16, 20, 25, 35, 60, Infinity][Math.floor(random() * 7)];
    const hourProfile = Object.keys(SESSION_HOUR_PROFILES)[Math.floor(random() * Object.keys(SESSION_HOUR_PROFILES).length)];
    const maxEntriesPerSymbolDay = [1, 2, 3, Infinity][Math.floor(random() * 4)];
    const cooldownMinutes = [0, 60, 240, 480][Math.floor(random() * 4)];
    const topNBySession = Object.fromEntries(Object.keys(SESSIONS).map((session) => [session, 1 + Math.floor(random() * 5)]));
    const rankMode = ["expectancy", "daily_consistency", "total_r"][Math.floor(random() * 3)];
    const id = JSON.stringify({ threshold, minScoreGap, required, requireSignalCandle, minBodyRatio, maxRangePips, hourProfile, maxEntriesPerSymbolDay, cooldownMinutes, topNBySession, rankMode });
    if (generated.has(id)) continue;
    generated.add(id);
    const config = {
        id: `score_${threshold}_gap_${minScoreGap}_conditions_${required.join("-")}_candle_${requireSignalCandle ? "direction" : "any"}_body_${minBodyRatio}_range_${maxRangePips}_hours_${hourProfile}_daycap_${maxEntriesPerSymbolDay}_cooldown_${cooldownMinutes}`,
        threshold,
        minScoreGap,
        required,
        requireSignalCandle,
        minBodyRatio,
        maxRangePips,
        hourProfile,
        hoursBySession: SESSION_HOUR_PROFILES[hourProfile],
        maxEntriesPerSymbolDay,
        cooldownMinutes,
    };
    const walkForward = evaluateWalkForward(config, topNBySession, rankMode);
    experiments.push({ config, topNBySession, rankMode, walkForward, score: researchScore(walkForward.summary) });

    if (Date.now() - lastProgressAt >= 30_000) {
        const leading = [...experiments].sort(compareExperiments)[0] || null;
        fs.writeFileSync(PROGRESS_PATH, `${JSON.stringify({ startedAt: new Date(startedAt).toISOString(), elapsedMs: Date.now() - startedAt, experiments: experiments.length, leading }, null, 2)}\n`);
        lastProgressAt = Date.now();
    }
}

const ranked = experiments.sort(compareExperiments);
const winner = ranked.find((experiment) => Number.isFinite(experiment.score)) || null;
const finalHoldout = winner ? evaluateWindow(winner.config, winner.topNBySession, winner.rankMode, FINAL_HOLDOUT) : null;
const report = {
    generatedAt: new Date().toISOString(),
    periods: { ...PERIODS, walkForward: WALK_FORWARD, finalHoldout: FINAL_HOLDOUT },
    immutableExecution: { entry: "next M15 open, bid/ask", stop: "signal M15 extreme plus 1 pip", takeProfit: "2R", collision: "SL first", maxPositions: 5, onePositionPerSymbol: true, margin: "90% reserve is constrained by five slots; broker-specific contract margin is not modeled" },
    searched: { timeBudgetMinutes: TIME_BUDGET_MS / 60_000, elapsedMs: Date.now() - startedAt, variants: experiments.length, randomSeed: 20260713, scoringConditions: ["H4 trend", "H4 MACD", "H1 EMA", "H1 RSI", "M15 EMA cross", "M15 RSI", "M15 Bollinger"] },
    candidateCount: candidates.length,
    winner: winner ? { ...winner, finalHoldout } : null,
    topDevelopment: ranked.slice(0, 12).map(({ config, topNBySession, rankMode, walkForward, score }) => ({ config, topNBySession, rankMode, walkForward, score })),
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: REPORT_PATH, candidateCount: candidates.length, winner: report.winner, topDevelopment: report.topDevelopment }, null, 2));
