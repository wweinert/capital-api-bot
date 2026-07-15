import fs from "node:fs";
import path from "node:path";
import { BollingerBands, EMA, MACD, RSI } from "technicalindicators";

// Replays the entry and static SL/TP rules from production commit a8f33bb
// (2025-06-23). It intentionally does not model later monitor logic, because
// that file did not exist in the referenced production state.
const DATA_DIR = process.env.CAPITAL_DATASET_DIR || path.join(process.cwd(), "backtest", "capital-dataset");
const REPORT_DIR = process.env.REPORT_DIR || path.join(process.cwd(), "backtest", "reports", "legacy-scoring");
const SYMBOLS = String(process.env.SYMBOLS || "EURUSD,GBPUSD,EURGBP,AUDUSD,USDCAD")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
const FROM_MS = Date.parse(process.env.FROM || "2026-01-13T00:00:00.000Z");
const TO_MS = Date.parse(process.env.TO || "2026-07-13T20:00:00.000Z");
const START_BALANCE = Number(process.env.START_BALANCE || 10_000);
const RISK_PCT = 0.02;
const MAX_POSITIONS = 5;
const REWARD_RISK_RATIO = 2;
const EPSILON = 1e-12;

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function timestampMs(row) {
    const value = Date.parse(row?.timestamp || row?.snapshotTimeUTC || row?.snapshotTime || "");
    return Number.isFinite(value) ? value : null;
}

function price(row, key, side, fallback) {
    return number(row?.[`${key}${side === "ask" ? "Ask" : "Bid"}`] ?? row?.[side]?.[key] ?? row?.[fallback]);
}

function normalizeRows(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return fs
        .readFileSync(filePath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            try {
                const raw = JSON.parse(line);
                const tsMs = timestampMs(raw);
                const open = number(raw?.open);
                const high = number(raw?.high);
                const low = number(raw?.low);
                const close = number(raw?.close);
                if (!(Number.isFinite(tsMs) && [open, high, low, close].every(Number.isFinite))) return null;
                return {
                    tsMs,
                    timestamp: new Date(tsMs).toISOString(),
                    open,
                    high,
                    low,
                    close,
                    openBid: price(raw, "open", "bid", "open") ?? open,
                    openAsk: price(raw, "open", "ask", "open") ?? open,
                    highBid: price(raw, "high", "bid", "high") ?? high,
                    highAsk: price(raw, "high", "ask", "high") ?? high,
                    lowBid: price(raw, "low", "bid", "low") ?? low,
                    lowAsk: price(raw, "low", "ask", "low") ?? low,
                    closeBid: price(raw, "close", "bid", "close") ?? close,
                    closeAsk: price(raw, "close", "ask", "close") ?? close,
                };
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((left, right) => left.tsMs - right.tsMs);
}

function lastIndexAtOrBefore(rows, tsMs) {
    let low = 0;
    let high = rows.length - 1;
    let result = -1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (rows[middle].tsMs <= tsMs) {
            result = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return result;
}

function indicators(rows, endIndex) {
    const sample = rows.slice(Math.max(0, endIndex - 219), endIndex + 1);
    if (sample.length < 200) return null;
    const closes = sample.map((row) => row.close);
    const highs = sample.map((row) => row.high);
    const lows = sample.map((row) => row.low);
    const emaFast = EMA.calculate({ period: 50, values: closes });
    const emaSlow = EMA.calculate({ period: 200, values: closes });
    const ema9 = EMA.calculate({ period: 9, values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
    const rsi = RSI.calculate({ period: 14, values: closes });
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
    const macd = MACD.calculate({
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        values: closes,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
    });
    const tr = [];
    for (let index = 1; index < sample.length; index += 1) {
        tr.push(Math.max(highs[index] - lows[index], Math.abs(highs[index] - closes[index - 1]), Math.abs(lows[index] - closes[index - 1])));
    }
    const atrRows = tr.slice(-14);
    const atr = atrRows.reduce((sum, value) => sum + value, 0) / atrRows.length;
    const last = (values) => values.at(-1) ?? null;
    const previous = (values) => values.at(-2) ?? null;
    const fast = last(emaFast);
    const slow = last(emaSlow);
    const now9 = last(ema9);
    const now21 = last(ema21);
    const previous9 = previous(ema9);
    const previous21 = previous(ema21);
    return {
        emaFast: fast,
        emaSlow: slow,
        ema9: now9,
        ema21: now21,
        rsi: last(rsi),
        bb: last(bb),
        macd: last(macd),
        atr,
        isBullishTrend: fast > slow && closes.at(-1) > fast,
        isBullishCross: now9 > now21 && previous9 <= previous21,
        isBearishCross: now9 < now21 && previous9 >= previous21,
    };
}

// H4 and H1 values stay unchanged between their candle closes. Caching keeps
// the replay equivalent while avoiding recalculating the same 220-bar window
// on every M15 decision.
const indicatorCache = new WeakMap();
function cachedIndicators(rows, endIndex) {
    let cache = indicatorCache.get(rows);
    if (!cache) {
        cache = new Map();
        indicatorCache.set(rows, cache);
    }
    if (!cache.has(endIndex)) cache.set(endIndex, indicators(rows, endIndex));
    return cache.get(endIndex);
}

function scoringSignal(h4, h1, m15, bid, ask) {
    const buy = [
        h4.isBullishTrend,
        h4.macd?.histogram > 0,
        h1.ema9 > h1.ema21,
        h1.rsi < 35,
        m15.isBullishCross,
        m15.rsi < 30,
        bid <= m15.bb?.lower,
    ];
    const sell = [
        !h4.isBullishTrend,
        h4.macd?.histogram < 0,
        h1.ema9 < h1.ema21,
        h1.rsi > 65,
        m15.isBearishCross,
        m15.rsi > 70,
        ask >= m15.bb?.upper,
    ];
    const buyScore = buy.filter(Boolean).length;
    const sellScore = sell.filter(Boolean).length;
    // This preserves the original if/else ordering: BUY wins if both score >= 3.
    return { side: buyScore >= 3 ? "BUY" : sellScore >= 3 ? "SELL" : null, buyScore, sellScore };
}

function simulateExit(rows, entryIndex, side, entry, stop, target) {
    for (let index = entryIndex + 1; index < rows.length; index += 1) {
        const row = rows[index];
        const stopHit = side === "BUY" ? row.lowBid <= stop : row.highAsk >= stop;
        const targetHit = side === "BUY" ? row.highBid >= target : row.lowAsk <= target;
        if (stopHit || targetHit) {
            const ambiguous = stopHit && targetHit;
            const reason = stopHit ? "stop_loss" : "take_profit"; // conservative for one-candle ambiguity
            const exit = stopHit ? stop : target;
            return { exitIndex: index, exitTsMs: row.tsMs, exit, reason, ambiguous };
        }
    }
    const last = rows.at(-1);
    return {
        exitIndex: rows.length - 1,
        exitTsMs: last.tsMs,
        exit: side === "BUY" ? last.closeBid : last.closeAsk,
        reason: "period_end",
        ambiguous: false,
    };
}

function monthlySummary(trades) {
    const months = new Map();
    for (const trade of trades) {
        const month = trade.openedAt.slice(0, 7);
        const row = months.get(month) || { trades: 0, netR: 0, wins: 0, losses: 0 };
        row.trades += 1;
        row.netR += trade.pnlR;
        if (trade.pnlR > 0) row.wins += 1;
        if (trade.pnlR < 0) row.losses += 1;
        months.set(month, row);
    }
    return Object.fromEntries([...months.entries()].map(([month, value]) => [month, { ...value, netR: Number(value.netR.toFixed(3)) }]));
}

const data = new Map();
for (const symbol of SYMBOLS) {
    const series = {};
    for (const timeframe of ["H4", "H1", "M15"]) {
        series[timeframe] = normalizeRows(path.join(DATA_DIR, `${symbol}_${timeframe}.jsonl`));
    }
    data.set(symbol, series);
}

const candidates = [];
for (const symbol of SYMBOLS) {
    const { H4: h4Rows, H1: h1Rows, M15: m15Rows } = data.get(symbol);
    for (let m15Index = 0; m15Index < m15Rows.length - 1; m15Index += 1) {
        const signalRow = m15Rows[m15Index];
        if (signalRow.tsMs < FROM_MS || signalRow.tsMs > TO_MS) continue;
        const h4Index = lastIndexAtOrBefore(h4Rows, signalRow.tsMs);
        const h1Index = lastIndexAtOrBefore(h1Rows, signalRow.tsMs);
        if (h4Index < 199 || h1Index < 199 || m15Index < 199) continue;
        const h4 = cachedIndicators(h4Rows, h4Index);
        const h1 = cachedIndicators(h1Rows, h1Index);
        const m15 = cachedIndicators(m15Rows, m15Index);
        const scored = scoringSignal(h4, h1, m15, signalRow.closeBid, signalRow.closeAsk);
        if (!scored.side) continue;
        const entryRow = m15Rows[m15Index + 1];
        const entry = scored.side === "BUY" ? entryRow.openAsk : entryRow.openBid;
        const stopDistance = m15.atr * 1.5;
        if (!(Number.isFinite(entry) && Number.isFinite(stopDistance) && stopDistance > EPSILON)) continue;
        const stop = scored.side === "BUY" ? entry - stopDistance : entry + stopDistance;
        const target = scored.side === "BUY" ? entry + stopDistance * REWARD_RISK_RATIO : entry - stopDistance * REWARD_RISK_RATIO;
        const exit = simulateExit(m15Rows, m15Index + 1, scored.side, entry, stop, target);
        const pnlR = (scored.side === "BUY" ? exit.exit - entry : entry - exit.exit) / stopDistance;
        candidates.push({
            symbol,
            openedAt: entryRow.timestamp,
            openedTsMs: entryRow.tsMs,
            closedAt: new Date(exit.exitTsMs).toISOString(),
            closedTsMs: exit.exitTsMs,
            side: scored.side,
            buyScore: scored.buyScore,
            sellScore: scored.sellScore,
            entry,
            stop,
            target,
            pnlR: Number(pnlR.toFixed(6)),
            exitReason: exit.reason,
            ambiguousBar: exit.ambiguous,
        });
    }
}

candidates.sort((left, right) => left.openedTsMs - right.openedTsMs || SYMBOLS.indexOf(left.symbol) - SYMBOLS.indexOf(right.symbol));
const accepted = [];
const active = [];
let skippedSameSymbol = 0;
let skippedMaxPositions = 0;
for (const candidate of candidates) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index].closedTsMs <= candidate.openedTsMs) active.splice(index, 1);
    }
    if (active.some((trade) => trade.symbol === candidate.symbol)) {
        skippedSameSymbol += 1;
        continue;
    }
    if (active.length >= MAX_POSITIONS) {
        skippedMaxPositions += 1;
        continue;
    }
    active.push(candidate);
    accepted.push(candidate);
}

const bySymbol = Object.fromEntries(
    SYMBOLS.map((symbol) => {
        const trades = accepted.filter((trade) => trade.symbol === symbol);
        const netR = trades.reduce((sum, trade) => sum + trade.pnlR, 0);
        return [symbol, { trades: trades.length, netR: Number(netR.toFixed(3)), winRatePct: trades.length ? Number((trades.filter((trade) => trade.pnlR > 0).length / trades.length * 100).toFixed(2)) : null }];
    }),
);
let balance = START_BALANCE;
let peak = balance;
let maxDrawdownPct = 0;
for (const trade of [...accepted].sort((left, right) => left.closedTsMs - right.closedTsMs)) {
    const riskAmount = balance * RISK_PCT;
    balance += riskAmount * trade.pnlR;
    peak = Math.max(peak, balance);
    maxDrawdownPct = Math.max(maxDrawdownPct, (peak - balance) / peak * 100);
}
const totalR = accepted.reduce((sum, trade) => sum + trade.pnlR, 0);
const winners = accepted.filter((trade) => trade.pnlR > 0);
const losers = accepted.filter((trade) => trade.pnlR < 0);
const grossProfit = winners.reduce((sum, trade) => sum + trade.pnlR, 0);
const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.pnlR, 0));
const report = {
    strategy: "production-a8f33bb-scoring",
    sourceCommit: "a8f33bb4f5a40bcd5c33dd61042667fbed61dd11",
    generatedAt: new Date().toISOString(),
    dataDir: DATA_DIR,
    period: { from: new Date(FROM_MS).toISOString(), to: new Date(TO_MS).toISOString() },
    assumptions: {
        entry: "next M15 open, ask for BUY and bid for SELL",
        exits: "static initial SL/TP only; no monitor logic in the source production commit",
        intrabarCollision: "stop-loss chosen conservatively if SL and TP both touch within one M15 candle",
        maxPositions: MAX_POSITIONS,
        onePositionPerSymbol: true,
        riskPct: RISK_PCT,
        rewardRiskRatio: REWARD_RISK_RATIO,
    },
    dataCoverage: Object.fromEntries(SYMBOLS.map((symbol) => [symbol, Object.fromEntries(["H4", "H1", "M15"].map((timeframe) => {
        const rows = data.get(symbol)[timeframe];
        return [timeframe, { rows: rows.length, first: rows[0]?.timestamp || null, last: rows.at(-1)?.timestamp || null }];
    }))])),
    summary: {
        candidateSignals: candidates.length,
        executedTrades: accepted.length,
        skippedSameSymbol,
        skippedMaxPositions,
        totalR: Number(totalR.toFixed(3)),
        expectancyR: accepted.length ? Number((totalR / accepted.length).toFixed(4)) : null,
        winRatePct: accepted.length ? Number((winners.length / accepted.length * 100).toFixed(2)) : null,
        profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : null,
        ambiguousBars: accepted.filter((trade) => trade.ambiguousBar).length,
        startBalance: START_BALANCE,
        endBalanceCompounded: Number(balance.toFixed(2)),
        returnPctCompounded: Number(((balance / START_BALANCE - 1) * 100).toFixed(2)),
        maxDrawdownPctCompounded: Number(maxDrawdownPct.toFixed(2)),
    },
    bySymbol,
    byMonth: monthlySummary(accepted),
    trades: accepted,
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
const reportPath = path.join(REPORT_DIR, `production-scoring-${report.period.from.slice(0, 10)}-${report.period.to.slice(0, 10)}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, ...report.summary, bySymbol, byMonth: report.byMonth }, null, 2));
