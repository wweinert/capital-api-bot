import fs from "fs";
import path from "path";
import { ATR } from "technicalindicators";
import { PROFILES, RISK, SESSIONS } from "../config.js";
import { ENTRY_RESEARCH_PROFILE, shouldEnter } from "../strategies/entry.js";

const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
const REPORT_DIR = path.join(process.cwd(), "backtest", "reports", "compare");
const TIMEFRAME = "M15";
const HISTORY_MONTHS = Number(process.env.HISTORY_MONTHS || 6);
const START_CAPITAL = Number(process.env.START_CAPITAL || 500);
const SESSION_PRIORITY = ["LONDON", "NY", "TOKYO", "SYDNEY"];
const USE_RESEARCH_HOURS = process.env.USE_RESEARCH_HOURS === "1";

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRow(row) {
    const timestamp = row?.timestamp ?? row?.snapshotTimeUTC ?? null;
    return {
        timestamp,
        tsMs: timestamp ? Date.parse(timestamp) : null,
        open: number(row?.open ?? row?.openBid ?? row?.bid?.open),
        high: number(row?.high ?? row?.highBid ?? row?.bid?.high),
        low: number(row?.low ?? row?.lowBid ?? row?.bid?.low),
        close: number(row?.close ?? row?.closeBid ?? row?.bid?.close),
        highAsk: number(row?.highAsk ?? row?.ask?.high),
        lowAsk: number(row?.lowAsk ?? row?.ask?.low),
        closeAsk: number(row?.closeAsk ?? row?.ask?.close),
        spread: number(row?.spread),
    };
}

function loadRows(symbol, timeframe) {
    const file = path.join(DATA_DIR, `${symbol}_${timeframe}.jsonl`);
    if (!fs.existsSync(file)) throw new Error(`Missing dataset: ${file}`);
    return fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => normalizeRow(JSON.parse(line)))
        .filter((row) => Number.isFinite(row.tsMs) && [row.open, row.high, row.low, row.close].every(Number.isFinite))
        .sort((a, b) => a.tsMs - b.tsMs);
}

function minuteOfDay(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function inSession(timestamp, { START, END }) {
    const minute = minuteOfDay(timestamp);
    return START < END ? minute >= START && minute < END : minute >= START || minute < END;
}

function sessionAt(timestamp) {
    return SESSION_PRIORITY.find((name) => inSession(timestamp, SESSIONS[name])) || null;
}

function pipSize(symbol) {
    return symbol.endsWith("JPY") ? 0.01 : 0.0001;
}

function leverage(symbol) {
    return symbol.includes("USD") ? 30 : 20;
}

function quoteOf(symbol) {
    return symbol.slice(3, 6);
}

function rowAtOrBefore(rows, timestamp) {
    let lo = 0;
    let hi = rows.length - 1;
    let found = null;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rows[mid].tsMs <= timestamp) {
            found = rows[mid];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found;
}

function summary(trades) {
    let grossWin = 0;
    let grossLoss = 0;
    let totalPnl = 0;
    let totalR = 0;
    let wins = 0;
    let equityR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    let averageRiskPct = 0;
    let averageRiskEur = 0;
    let averageRewardEur = 0;
    let averageTargetR = 0;
    let marginCapHits = 0;

    for (const trade of trades) {
        totalPnl += trade.pnlEur;
        totalR += trade.pnlR;
        equityR += trade.pnlR;
        peakR = Math.max(peakR, equityR);
        maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR);
        averageRiskPct += trade.actualRiskPct;
        averageRiskEur += trade.actualRiskEur;
        averageRewardEur += trade.actualRiskEur * trade.actualTargetR;
        averageTargetR += trade.actualTargetR;
        if (trade.marginCapHit) marginCapHits += 1;
        if (trade.pnlEur > 0) {
            wins += 1;
            grossWin += trade.pnlEur;
        } else if (trade.pnlEur < 0) {
            grossLoss += Math.abs(trade.pnlEur);
        }
    }

    return {
        trades: trades.length,
        winRatePct: trades.length ? (wins / trades.length) * 100 : 0,
        profitFactor: grossLoss ? grossWin / grossLoss : null,
        netPnlEur: totalPnl,
        netR: totalR,
        expectancyR: trades.length ? totalR / trades.length : 0,
        maxDrawdownR,
        avgActualRiskPct: trades.length ? averageRiskPct / trades.length : 0,
        avgActualRiskEur: trades.length ? averageRiskEur / trades.length : 0,
        avgActualRewardEur: trades.length ? averageRewardEur / trades.length : 0,
        avgActualTargetR: trades.length ? averageTargetR / trades.length : 0,
        marginCapHits,
    };
}

function round(value, digits = 4) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

const profileSymbols = Object.keys(PROFILES);
const conversionSymbols = ["EURAUD", "EURJPY", "EURUSD"];
const allM15 = new Map([...new Set([...profileSymbols, ...conversionSymbols])].map((symbol) => [symbol, loadRows(symbol, "M15")]));
const allM5 = new Map(profileSymbols.map((symbol) => [symbol, loadRows(symbol, "M5")]));
const commonEnd = Math.min(
    ...[...allM15.values(), ...allM5.values()].map((rows) => rows.at(-1)?.tsMs).filter(Number.isFinite),
);
const startDate = new Date(commonEnd);
startDate.setUTCMonth(startDate.getUTCMonth() - HISTORY_MONTHS);
const startMs = startDate.getTime();

const m15 = new Map(profileSymbols.map((symbol) => [symbol, allM15.get(symbol).filter((row) => row.tsMs >= startMs && row.tsMs <= commonEnd)]));
const m5 = new Map(profileSymbols.map((symbol) => [symbol, allM5.get(symbol).filter((row) => row.tsMs >= startMs - 2 * 24 * 60 * 60 * 1000 && row.tsMs <= commonEnd)]));
const m15IndexByTimestamp = new Map(profileSymbols.map((symbol) => [symbol, new Map(m15.get(symbol).map((row, index) => [row.tsMs, index]))]));

function firstIndexAtOrAfter(rows, timestamp) {
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rows[mid].tsMs < timestamp) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function m5AtrPct(symbol, decisionMs) {
    const rows = m5.get(symbol) || [];
    const end = firstIndexAtOrAfter(rows, decisionMs);
    const stable = rows.slice(Math.max(0, end - 200), end);
    if (stable.length < 15) return null;
    const atr = ATR.calculate({
        period: 14,
        high: stable.map((row) => row.high),
        low: stable.map((row) => row.low),
        close: stable.map((row) => row.close),
    }).at(-1);
    const close = stable.at(-1)?.close;
    return Number.isFinite(atr) && Number.isFinite(close) && close > 0 ? atr / close : null;
}

function quotePerEur(symbol, timestamp) {
    const quote = quoteOf(symbol);
    if (quote === "EUR") return 1;
    const row = rowAtOrBefore(allM15.get(`EUR${quote}`) || [], timestamp);
    return row?.close ?? null;
}

function sizePosition({ symbol, balance, availableMargin, planEntry, planStop, quotePerEur: quoteRate }) {
    const riskDistance = Math.abs(planEntry - planStop);
    const requestedRisk = balance * RISK.PER_TRADE;
    const rawSize = (requestedRisk * quoteRate) / riskDistance;
    const maxMargin = (availableMargin * RISK.MARGIN_RESERVE_PCT) / RISK.MAX_POSITIONS;
    const marginFor = (size) => ((size * planEntry) / quoteRate) / leverage(symbol);
    const rawMargin = marginFor(rawSize);
    const scaled = rawMargin > maxMargin ? rawSize * (maxMargin / rawMargin) : rawSize;
    const size = Math.floor(scaled / 100) * 100;
    if (size < 100) return null;
    return { size, margin: marginFor(size), marginCapHit: rawMargin > maxMargin, requestedRisk };
}

function sidePrices(row) {
    const spread = Number.isFinite(row.spread) && row.spread >= 0 ? row.spread : 0;
    return {
        bidClose: row.close,
        askClose: Number.isFinite(row.closeAsk) ? row.closeAsk : row.close + spread,
        bidLow: row.low,
        bidHigh: row.high,
        askLow: Number.isFinite(row.lowAsk) ? row.lowAsk : row.low + spread,
        askHigh: Number.isFinite(row.highAsk) ? row.highAsk : row.high + spread,
    };
}

let balance = START_CAPITAL;
const openPositions = new Map();
const trades = [];
const skipped = { maxPositions: 0, noMargin: 0, noConversion: 0 };
const signalCounts = Object.fromEntries(profileSymbols.map((symbol) => [symbol, 0]));

const timestamps = [...new Set(profileSymbols.flatMap((symbol) => m15.get(symbol).map((row) => row.tsMs)))].sort((a, b) => a - b);
for (const barStartMs of timestamps) {
    const decisionMs = barStartMs + 15 * 60 * 1000;

    for (const [symbol, position] of [...openPositions]) {
        const barIndex = m15IndexByTimestamp.get(symbol)?.get(barStartMs);
        const bar = Number.isInteger(barIndex) ? m15.get(symbol)[barIndex] : null;
        if (!bar || position.entryMs > barStartMs) continue;
        const prices = sidePrices(bar);
        const stopHit = position.side === "BUY" ? prices.bidLow <= position.stop : prices.askHigh >= position.stop;
        const targetHit = position.side === "BUY" ? prices.bidHigh >= position.target : prices.askLow <= position.target;
        const isDailyClose = minuteOfDay(barStartMs) === 23 * 60 + 45;
        if (!stopHit && !targetHit && !isDailyClose) continue;

        const exit = stopHit ? position.stop : targetHit ? position.target : position.side === "BUY" ? prices.bidClose : prices.askClose;
        const pnlQuote = position.side === "BUY" ? (exit - position.entry) * position.size : (position.entry - exit) * position.size;
        const pnlEur = pnlQuote / position.quotePerEur;
        balance += pnlEur;
        trades.push({
            ...position,
            exitTimestamp: new Date(decisionMs).toISOString(),
            exitReason: stopHit ? "stop_loss" : targetHit ? "take_profit" : "daily_forced_close_utc",
            exit,
            pnlEur,
            pnlR: pnlEur / position.actualRiskEur,
            balanceAfter: balance,
        });
        openPositions.delete(symbol);
    }

    const session = sessionAt(decisionMs);
    if (!session) continue;

    for (const symbol of profileSymbols) {
        const profile = PROFILES[symbol];
        if (!profile.sessions.includes(session) || openPositions.has(symbol)) continue;
        const rows = m15.get(symbol) || [];
        const barIndex = m15IndexByTimestamp.get(symbol)?.get(barStartMs);
        if (!Number.isInteger(barIndex)) continue;
        const bars = rows.slice(Math.max(0, barIndex - 199), barIndex + 1);
        const current = rows[barIndex];
        const decision = shouldEnter({
            bars,
            m5AtrPct: m5AtrPct(symbol, decisionMs),
            spread: current.spread,
            symbol,
            equity: balance,
            params: {
                ...ENTRY_RESEARCH_PROFILE.params,
                allowedHoursUtc: USE_RESEARCH_HOURS ? ENTRY_RESEARCH_PROFILE.allowedHoursUtc : [],
            },
            nowMs: decisionMs,
        });
        if (!decision.signal) continue;
        signalCounts[symbol] += 1;
        if (openPositions.size >= RISK.MAX_POSITIONS) {
            skipped.maxPositions += 1;
            continue;
        }

        const quoteRate = quotePerEur(symbol, decisionMs);
        if (!(Number.isFinite(quoteRate) && quoteRate > 0)) {
            skipped.noConversion += 1;
            continue;
        }
        const usedMargin = [...openPositions.values()].reduce((sum, position) => sum + position.margin, 0);
        const sizing = sizePosition({
            symbol,
            balance,
            availableMargin: Math.max(0, balance - usedMargin),
            planEntry: decision.entry,
            planStop: decision.sl,
            quotePerEur: quoteRate,
        });
        if (!sizing) {
            skipped.noMargin += 1;
            continue;
        }

        const prices = sidePrices(current);
        const entry = decision.signal === "BUY" ? prices.askClose : prices.bidClose;
        const actualRiskEur = (sizing.size * Math.abs(entry - decision.sl)) / quoteRate;
        const actualRewardEur = (sizing.size * Math.abs(decision.tp - entry)) / quoteRate;
        openPositions.set(symbol, {
            symbol,
            side: decision.signal,
            entryMs: decisionMs,
            entryTimestamp: new Date(decisionMs).toISOString(),
            entry,
            stop: decision.sl,
            target: decision.tp,
            size: sizing.size,
            margin: sizing.margin,
            quotePerEur: quoteRate,
            actualRiskEur,
            actualRiskPct: actualRiskEur / balance,
            actualTargetR: actualRewardEur / actualRiskEur,
            marginCapHit: sizing.marginCapHit,
            plannedStopPips: decision.stopPips,
        });
    }
}

for (const [symbol, position] of openPositions) {
    const last = m15.get(symbol).at(-1);
    const prices = sidePrices(last);
    const exit = position.side === "BUY" ? prices.bidClose : prices.askClose;
    const pnlQuote = position.side === "BUY" ? (exit - position.entry) * position.size : (position.entry - exit) * position.size;
    const pnlEur = pnlQuote / position.quotePerEur;
    balance += pnlEur;
    trades.push({ ...position, exitTimestamp: last.timestamp, exitReason: "end_of_data", exit, pnlEur, pnlR: pnlEur / position.actualRiskEur, balanceAfter: balance });
}

const generatedAt = new Date().toISOString();
const result = {
    generatedAt,
    period: { start: new Date(startMs).toISOString(), end: new Date(commonEnd).toISOString(), months: HISTORY_MONTHS },
    strategy: "strategies/entry.js / ENTRY_RR2_1831 as invoked by services/trading.js",
    liveParameters: {
        profiles: PROFILES,
        risk: RISK,
        sessionPriority: SESSION_PRIORITY,
        entryParams: {
            ...ENTRY_RESEARCH_PROFILE.params,
            allowedHoursUtc: USE_RESEARCH_HOURS ? ENTRY_RESEARCH_PROFILE.allowedHoursUtc : [],
        },
    },
    executionModel: {
        entry: "M15 bid signal close; BUY fills at close ask, SELL at close bid",
        exits: "broker-side bid/ask candle extremes; stop wins when stop and target occur in one M15 bar",
        management: "Original SL/TP + daily close only. Broker trailing cannot be reconstructed from OHLC because current live code enables it through an API call without logging the resulting stop updates.",
        newsFilter: "Not simulated; historical news-block decisions are not stored.",
    },
    startCapital: START_CAPITAL,
    endCapital: balance,
    returnPct: ((balance - START_CAPITAL) / START_CAPITAL) * 100,
    summary: summary(trades),
    signalCounts,
    skipped,
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
const output = path.join(REPORT_DIR, `current-live-entry-six-months-${generatedAt.replaceAll(/[:.]/g, "-")}.json`);
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, ...result }, null, 2));
