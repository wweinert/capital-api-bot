import fs from "fs";
import path from "path";
import {
    advanceHigherLowLowerHighDetector,
    createHigherLowLowerHighConfig,
    createHigherLowLowerHighState,
    normalizeRows,
    pipSizeForSymbol,
    prepareHigherLowLowerHighContext,
} from "./lib/strategies/higherLowLowerHigh.js";
import {
    buildTradeFromSignal,
    closeTrade,
    maybeCloseTrade,
    maybeRejectSmallStop,
    shouldDailyForceClose,
} from "./lib/simulators/priceActionTradeCore.js";

const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
const REPORT_DIR = path.join(process.cwd(), "backtest", "reports", "compare");
const TIMEFRAME = "M15";
const HISTORY_MONTHS = Number(process.env.HISTORY_MONTHS || 6);
const COST_PIPS = Number(process.env.COST_PIPS || 1.5);
const STRESS_COST_PIPS = Number(process.env.STRESS_COST_PIPS || 3);
const SYMBOLS = [
    "AUDJPY",
    "AUDUSD",
    "EURAUD",
    "EURGBP",
    "EURJPY",
    "EURUSD",
    "GBPAUD",
    "GBPJPY",
    "GBPUSD",
    "NZDJPY",
    "NZDUSD",
    "USDCAD",
    "USDCHF",
    "USDJPY",
];

// These intervals intentionally mirror SESSIONS from config.js. They overlap:
// the result shows how a pair behaves within a session, rather than simulating
// one mutually exclusive portfolio.
const SESSIONS = [
    { id: "SYDNEY", label: "Sydney", startMinute: 22 * 60, endMinute: 7 * 60 },
    { id: "TOKYO", label: "Tokyo", startMinute: 0, endMinute: 9 * 60 },
    { id: "LONDON", label: "London", startMinute: 8 * 60, endMinute: 17 * 60 },
    { id: "NY", label: "New York", startMinute: 13 * 60, endMinute: 21 * 60 },
];

const HLLH_CONFIG = createHigherLowLowerHighConfig({
    setupMode: "aggressive",
    pivotWindow: 2,
    signalMode: "simple",
    entryMode: "entry_on_close",
    stopVariant: "signal_candle_extreme_with_buffer_2pip",
    exitVariant: "adaptive_trail_1r_0_5",
    timeframe: TIMEFRAME,
    maxSignalWaitBars: 8,
    entryBreakMaxBars: 3,
    minStopDistancePips: 2,
    dailyForcedCloseUTC: true,
    entryCutoffMinuteUTC: 23 * 60 + 30,
    maxStopPips: 12,
    avoidHoursUTC: [],
});

function round(value, digits = 3) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function loadRows(symbol) {
    const file = path.join(DATA_DIR, `${symbol}_${TIMEFRAME}.jsonl`);
    if (!fs.existsSync(file)) throw new Error(`Dataset is missing: ${file}`);
    return normalizeRows(
        fs
            .readFileSync(file, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line)),
    );
}

function minuteOfDayUTC(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function inSession(timestamp, session) {
    const minute = minuteOfDayUTC(timestamp);
    return session.startMinute < session.endMinute
        ? minute >= session.startMinute && minute < session.endMinute
        : minute >= session.startMinute || minute < session.endMinute;
}

function weekendBlocked(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    return (day === 5 && hour >= 18) || day === 6 || (day === 0 && hour < 22);
}

function signalBlocked(candidate, config) {
    const timestamp = candidate?.signalTimestamp || candidate?.signalRow?.timestamp;
    if (!timestamp || weekendBlocked(timestamp)) return true;
    if (minuteOfDayUTC(timestamp) >= Number(config.entryCutoffMinuteUTC)) return true;
    return (config.avoidHoursUTC || []).map(Number).includes(new Date(timestamp).getUTCHours());
}

function tradeBlockedByStop(trade, config, pipSize) {
    const stopPips = trade.riskDistance / pipSize;
    return Number.isFinite(config.maxStopPips) && config.maxStopPips > 0 && stopPips > config.maxStopPips;
}

function runHllh(symbol, rows) {
    const context = prepareHigherLowLowerHighContext(rows, HLLH_CONFIG);
    const state = createHigherLowLowerHighState(HLLH_CONFIG);
    const pipSize = pipSizeForSymbol(symbol);
    const stats = { stopBelowMinDistanceCount: 0 };
    const trades = [];
    let openTrade = null;

    for (let index = 0; index < context.rows.length; index += 1) {
        const row = context.rows[index];
        if (openTrade) {
            const previousRow = context.rows[index - 1] || null;
            if (shouldDailyForceClose(openTrade, previousRow, row, HLLH_CONFIG)) {
                trades.push(closeTrade(openTrade, index - 1, previousRow, previousRow.close, "daily_forced_close_utc", pipSize));
                openTrade = null;
                continue;
            }
            const closed = maybeCloseTrade(openTrade, row, index, pipSize);
            if (closed) {
                trades.push(closed);
                openTrade = null;
            }
            continue;
        }

        const step = advanceHigherLowLowerHighDetector({ context, state, index });
        for (const event of step.events) {
            if (event.type !== "signal_candidate" || signalBlocked(event.candidate, HLLH_CONFIG)) continue;
            const trade = buildTradeFromSignal({
                candidate: event.candidate,
                entryIndex: index,
                entryPrice: row.close,
                config: HLLH_CONFIG,
                pipSize,
            });
            if (!trade || tradeBlockedByStop(trade, HLLH_CONFIG, pipSize) || maybeRejectSmallStop(trade, HLLH_CONFIG, pipSize, stats)) continue;
            openTrade = { ...trade, symbol, pipSize };
            break;
        }
    }

    if (openTrade && context.rows.length) {
        const lastIndex = context.rows.length - 1;
        const lastRow = context.rows[lastIndex];
        trades.push(closeTrade(openTrade, lastIndex, lastRow, lastRow.close, "end_of_data", pipSize));
    }
    return trades.map((trade) => ({ ...trade, symbol, pipSize }));
}

function adjustedTrade(trade, costPips) {
    const stopPips = trade.riskDistance / trade.pipSize;
    return { ...trade, pnlRNet: trade.pnlR - costPips / stopPips };
}

function summarize(trades) {
    let totalR = 0;
    let grossWinR = 0;
    let grossLossR = 0;
    let wins = 0;
    let equityR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    let holdBars = 0;
    const days = new Map();

    for (const trade of trades) {
        const pnlR = Number(trade.pnlRNet || 0);
        totalR += pnlR;
        equityR += pnlR;
        peakR = Math.max(peakR, equityR);
        maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR);
        holdBars += Number(trade.holdBars || 0);
        if (pnlR > 0) {
            wins += 1;
            grossWinR += pnlR;
        } else if (pnlR < 0) {
            grossLossR += Math.abs(pnlR);
        }
        const day = trade.entryTimestamp.slice(0, 10);
        days.set(day, (days.get(day) || 0) + pnlR);
    }

    const profitableDays = [...days.values()].filter((value) => value > 0).length;
    return {
        trades: trades.length,
        activeDays: days.size,
        positiveDays: profitableDays,
        positiveDayRatePct: days.size ? (profitableDays / days.size) * 100 : 0,
        winRatePct: trades.length ? (wins / trades.length) * 100 : 0,
        netR: totalR,
        expectancyR: trades.length ? totalR / trades.length : 0,
        profitFactor: grossLossR ? grossWinR / grossLossR : null,
        maxDrawdownR,
        avgHoldBars: trades.length ? holdBars / trades.length : 0,
    };
}

function reportRow(symbol, session, rawTrades) {
    const base = summarize(rawTrades.map((trade) => adjustedTrade(trade, COST_PIPS)));
    const stress = summarize(rawTrades.map((trade) => adjustedTrade(trade, STRESS_COST_PIPS)));
    // Ranking is deliberately conservative: total R after a doubled-cost stress test.
    // It favours pairs that still create substantial profit and activity when real spreads widen.
    const eligible = base.trades >= 40 && base.expectancyR > 0 && base.profitFactor > 1;
    return {
        symbol,
        session: session.id,
        eligible,
        ...Object.fromEntries(Object.entries(base).map(([key, value]) => [key, round(value)])),
        stressNetR: round(stress.netR),
        stressExpectancyR: round(stress.expectancyR),
        selectionScore: round(eligible ? stress.netR : Number.NEGATIVE_INFINITY),
    };
}

const allRows = new Map(SYMBOLS.map((symbol) => [symbol, loadRows(symbol)]));
const endMs = Math.min(...[...allRows.values()].map((rows) => rows.at(-1)?.tsMs).filter(Number.isFinite));
const start = new Date(endMs);
start.setUTCMonth(start.getUTCMonth() - HISTORY_MONTHS);
const startMs = start.getTime();
const rowsBySymbol = new Map([...allRows].map(([symbol, rows]) => [symbol, rows.filter((row) => row.tsMs >= startMs && row.tsMs <= endMs)]));

const rows = [];
for (const symbol of SYMBOLS) {
    const trades = runHllh(symbol, rowsBySymbol.get(symbol));
    for (const session of SESSIONS) rows.push(reportRow(symbol, session, trades.filter((trade) => inSession(trade.entryTimestamp, session))));
}

const bySession = Object.fromEntries(
    SESSIONS.map((session) => {
        const candidates = rows
            .filter((row) => row.session === session.id)
            .sort((a, b) => b.selectionScore - a.selectionScore || b.netR - a.netR);
        return [
            session.id,
            {
                label: session.label,
                windowUTC: `${String(Math.floor(session.startMinute / 60)).padStart(2, "0")}:${String(session.startMinute % 60).padStart(2, "0")}–${String(Math.floor(session.endMinute / 60)).padStart(2, "0")}:${String(session.endMinute % 60).padStart(2, "0")}`,
                recommended: candidates.filter((row) => row.eligible).slice(0, 4),
                all: candidates,
            },
        ];
    }),
);

const generatedAt = new Date().toISOString();
const report = {
    generatedAt,
    period: { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), months: HISTORY_MONTHS },
    symbols: SYMBOLS,
    strategy: HLLH_CONFIG,
    assumptions: {
        timeframe: TIMEFRAME,
        roundTripCostPips: COST_PIPS,
        stressRoundTripCostPips: STRESS_COST_PIPS,
        entry: "M15 candle close; same closed candle only",
        dailyForcedCloseUTC: true,
        note: "Session windows reproduce config.js and overlap. Selection is pair-by-session, before a combined max-5 portfolio validation.",
    },
    bySession,
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
const output = path.join(REPORT_DIR, `hllh-session-pair-research-${generatedAt.replaceAll(/[:.]/g, "-")}.json`);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({ output, period: report.period, recommendations: Object.fromEntries(Object.entries(bySession).map(([id, value]) => [id, value.recommended])) }, null, 2));
