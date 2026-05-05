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
import { loadDatasetRows, round } from "./lib/higherLowLowerHighResearch.js";
import {
    buildPendingEntry,
    buildTradeFromSignal,
    closeTrade,
    maybeActivatePendingEntry,
    maybeCloseTrade,
    maybeRejectSmallStop,
    shouldDailyForceClose,
    scenarioId,
} from "./lib/simulators/priceActionTradeCore.js";

const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
const LOG_DIR = path.join(process.cwd(), "server-logs", "waldemar-pi-2026-05-04-after-work", "backtest", "logs");
const REPORT_DIR = path.join(process.cwd(), "backtest", "reports", "usd-margin-lab");
const TIMEFRAME = "M15";
const START_CAPITAL = Number(process.env.START_CAPITAL || 500);
const MONTHS = Number(process.env.MONTHS || 5);
const TODAY = process.env.TODAY || "2026-05-04";
const FIX_TIME = Date.parse(process.env.FIX_TIME || "2026-05-04T06:38:00Z");
const COST_MODEL = process.env.COST_MODEL || "none";
const FIXED_COST_PIPS = Number(process.env.COST_PIPS || 0);

const USD_SYMBOLS = String(process.env.USD_SYMBOLS || "AUDUSD,EURUSD,GBPUSD,NZDUSD,USDCAD,USDCHF,USDJPY")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
const LIVE_SYMBOLS = String(process.env.LIVE_SYMBOLS || "GBPAUD,EURAUD,EURJPY,GBPUSD")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
const AVAILABLE_SYMBOLS = fs.existsSync(DATA_DIR)
    ? fs
          .readdirSync(DATA_DIR)
          .filter((name) => name.endsWith(`_${TIMEFRAME}.jsonl`))
          .map((name) => name.slice(0, -`_${TIMEFRAME}.jsonl`.length))
          .sort()
    : [];
const SEARCH_SYMBOLS = String(process.env.SEARCH_SYMBOLS || AVAILABLE_SYMBOLS.join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

const POSITION_SCENARIOS = [
    { id: "max1_margin70_risk3", maxPositions: 1, marginReservePct: 0.7, perTradeRiskPct: 0.03, totalRiskCapPct: 0.03 },
    { id: "max2_margin90_split_risk3_total6", maxPositions: 2, marginReservePct: 0.9, perTradeRiskPct: 0.03, totalRiskCapPct: 0.06 },
    { id: "max3_margin90_split_risk2_total6", maxPositions: 3, marginReservePct: 0.9, perTradeRiskPct: 0.02, totalRiskCapPct: 0.06 },
];

const CONFIG = createHigherLowLowerHighConfig({
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
    holdingMode: "daily_flat",
    maxStopPips: 12,
    avoidHoursUTC: [],
});

function candidateConfigs() {
    const configs = [];
    const push = (overrides) =>
        configs.push(
            createHigherLowLowerHighConfig({
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
                holdingMode: "daily_flat",
                maxStopPips: 12,
                avoidHoursUTC: [],
                ...overrides,
            }),
        );

    push({});
    push({ exitVariant: "time_exit_3", maxSignalWaitBars: 14 });
    push({ exitVariant: "time_exit_8", maxSignalWaitBars: 14 });
    push({ exitVariant: "fixed_r_2" });
    push({ exitVariant: "fixed_r_3" });
    push({ exitVariant: "fixed_r_4" });
    push({ pivotWindow: 3, exitVariant: "adaptive_trail_1r_0_5" });
    push({ pivotWindow: 3, exitVariant: "time_exit_3", maxSignalWaitBars: 14 });
    push({ signalMode: "strict", entryMode: "entry_on_break", exitVariant: "fixed_r_2", maxStopPips: 18 });
    push({ signalMode: "strict", entryMode: "entry_on_break", stopVariant: "signal_candle_extreme_with_range_buffer_40", exitVariant: "fixed_r_2", maxStopPips: 18 });
    push({ setupMode: "confirmed", signalMode: "strict", entryMode: "entry_on_break", stopVariant: "signal_candle_extreme_with_range_buffer_25", exitVariant: "fixed_r_3", maxStopPips: 25 });
    push({ entryMode: "entry_on_break", stopVariant: "signal_candle_extreme_with_buffer_1pip", exitVariant: "fixed_r_4", maxStopPips: 18 });

    const byId = new Map();
    for (const config of configs) byId.set(JSON.stringify(config), config);
    return [...byId.values()];
}

function adaptiveCandidateConfigs() {
    const configs = [];
    const gridMode = process.env.ADAPTIVE_GRID_MODE || "focused";
    const setupModes = ["aggressive", "confirmed"];
    const pivotWindows = [2, 3];
    const signalModes = ["simple", "strict"];
    const entryModes = ["entry_on_close", "entry_on_break"];
    const stopVariants =
        gridMode === "deep"
            ? [
                  "signal_candle_extreme_with_buffer_1pip",
                  "signal_candle_extreme_with_buffer_2pip",
                  "signal_candle_extreme_with_range_buffer_25",
                  "signal_candle_extreme_with_range_buffer_40",
                  "structure_pivot_with_buffer_2pip",
              ]
            : ["signal_candle_extreme_with_buffer_1pip", "signal_candle_extreme_with_buffer_2pip", "signal_candle_extreme_with_range_buffer_25"];
    const exitVariants = ["adaptive_trail_1r_0_5", "adaptive_trail_1r_1", "adaptive_trail_2r_1", "adaptive_breakeven_trail_1r_1"];
    const maxStopPipsOptions = gridMode === "deep" ? [8, 12, 18, 25] : [12, 18];

    for (const setupMode of setupModes) {
        for (const pivotWindow of pivotWindows) {
            for (const signalMode of signalModes) {
                for (const entryMode of entryModes) {
                    for (const stopVariant of stopVariants) {
                        for (const exitVariant of exitVariants) {
                            for (const maxStopPips of maxStopPipsOptions) {
                                configs.push(
                                    createHigherLowLowerHighConfig({
                                        setupMode,
                                        pivotWindow,
                                        signalMode,
                                        entryMode,
                                        stopVariant,
                                        exitVariant,
                                        timeframe: TIMEFRAME,
                                        maxSignalWaitBars: 8,
                                        entryBreakMaxBars: 3,
                                        minStopDistancePips: 2,
                                        dailyForcedCloseUTC: true,
                                        entryCutoffMinuteUTC: 23 * 60 + 30,
                                        holdingMode: "daily_flat",
                                        maxStopPips,
                                        avoidHoursUTC: [],
                                    }),
                                );
                            }
                        }
                    }
                }
            }
        }
    }
    const byId = new Map();
    for (const config of configs) byId.set(JSON.stringify(config), config);
    return [...byId.values()];
}

function lastMonths(rows, months) {
    if (!rows.length) return rows;
    const end = rows.at(-1).tsMs;
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - months);
    return rows.filter((row) => row.tsMs >= start.getTime() && row.tsMs <= end);
}

const ALL_SYMBOLS = [...new Set([...USD_SYMBOLS, ...LIVE_SYMBOLS, ...SEARCH_SYMBOLS, "EURUSD", "EURJPY", "USDJPY", "USDCAD", "AUDUSD", "NZDUSD"])];
const DATA = new Map(
    ALL_SYMBOLS.map((symbol) => [symbol, lastMonths(loadDatasetRows({ dataDir: DATA_DIR, symbol, timeframe: TIMEFRAME }), MONTHS)]),
);

function rowAtOrBefore(symbol, tsMs) {
    const rows = DATA.get(symbol) || [];
    let lo = 0;
    let hi = rows.length - 1;
    let found = null;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rows[mid].tsMs <= tsMs) {
            found = rows[mid];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found;
}

function eurPerQuote(quote, tsMs) {
    if (quote === "EUR") return 1;
    const direct = rowAtOrBefore(`EUR${quote}`, tsMs)?.close;
    if (Number.isFinite(direct) && direct > 0) return direct;
    const inverse = rowAtOrBefore(`${quote}EUR`, tsMs)?.close;
    if (Number.isFinite(inverse) && inverse > 0) return 1 / inverse;
    const eurusd = rowAtOrBefore("EURUSD", tsMs)?.close;
    if (quote === "USD" && Number.isFinite(eurusd) && eurusd > 0) return eurusd;
    if (quote === "JPY") {
        const eurjpy = rowAtOrBefore("EURJPY", tsMs)?.close;
        if (Number.isFinite(eurjpy) && eurjpy > 0) return eurjpy;
        const usdjpy = rowAtOrBefore("USDJPY", tsMs)?.close;
        if (Number.isFinite(eurusd) && Number.isFinite(usdjpy) && usdjpy > 0) return eurusd * usdjpy;
    }
    if (quote === "CAD") {
        const usdcad = rowAtOrBefore("USDCAD", tsMs)?.close;
        if (Number.isFinite(eurusd) && Number.isFinite(usdcad) && usdcad > 0) return eurusd * usdcad;
    }
    if (quote === "AUD") {
        const euraud = rowAtOrBefore("EURAUD", tsMs)?.close;
        if (Number.isFinite(euraud) && euraud > 0) return euraud;
        const audusd = rowAtOrBefore("AUDUSD", tsMs)?.close;
        if (Number.isFinite(eurusd) && Number.isFinite(audusd) && audusd > 0) return eurusd / audusd;
    }
    if (quote === "NZD") {
        const nzdusd = rowAtOrBefore("NZDUSD", tsMs)?.close;
        if (Number.isFinite(eurusd) && Number.isFinite(nzdusd) && nzdusd > 0) return eurusd / nzdusd;
    }
    return null;
}

function leverageForSymbol(symbol) {
    return symbol.includes("USD") ? 30 : 20;
}

function minuteOfDayUTC(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function weekendBlocked(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    return (day === 5 && hour >= 18) || day === 6 || (day === 0 && hour < 22);
}

function signalBlocked(candidate, config) {
    const ts = candidate?.signalTimestamp || candidate?.signalRow?.timestamp;
    if (!ts || weekendBlocked(ts)) return true;
    if (Number.isFinite(Number(config.entryCutoffMinuteUTC)) && minuteOfDayUTC(ts) >= Number(config.entryCutoffMinuteUTC)) return true;
    return (config.avoidHoursUTC || []).map(Number).includes(new Date(ts).getUTCHours());
}

function tradeBlockedByStop(trade, config, pipSize) {
    const maxStopPips = Number(config.maxStopPips);
    if (!(Number.isFinite(maxStopPips) && maxStopPips > 0)) return false;
    return Number(trade?.riskDistance) / pipSize > maxStopPips;
}

function runFastScenario(symbol, rows, config) {
    const context = prepareHigherLowLowerHighContext(normalizeRows(rows), config);
    const state = createHigherLowLowerHighState(config);
    const pipSize = pipSizeForSymbol(symbol);
    const trades = [];
    const stats = { breakEntryExpiredCount: 0, breakEntryInvalidatedCount: 0, stopBelowMinDistanceCount: 0 };
    let openTrade = null;
    let pendingEntry = null;

    for (let index = 0; index < context.rows.length; index += 1) {
        const row = context.rows[index];
        if (openTrade) {
            const previousRow = context.rows[index - 1] || null;
            if (shouldDailyForceClose(openTrade, previousRow, row, config)) {
                trades.push(closeTrade(openTrade, index - 1, previousRow, previousRow.close, "daily_forced_close_utc", pipSize));
                openTrade = null;
                continue;
            }
            const closedTrade = maybeCloseTrade(openTrade, row, index, pipSize);
            if (closedTrade) {
                trades.push(closedTrade);
                openTrade = null;
                continue;
            }
            continue;
        }

        if (pendingEntry) {
            const activation = maybeActivatePendingEntry(pendingEntry, row, index, pipSize, stats);
            if (activation.status === "entered" && activation.trade) {
                if (!tradeBlockedByStop(activation.trade, config, pipSize) && !maybeRejectSmallStop(activation.trade, config, pipSize, stats)) {
                    openTrade = activation.trade;
                }
                pendingEntry = null;
                continue;
            }
            if (activation.status === "expired" || activation.status === "invalidated") pendingEntry = null;
            else continue;
        }

        const step = advanceHigherLowLowerHighDetector({ context, state, index });
        for (const event of step.events) {
            if (event.type !== "signal_candidate") continue;
            const candidate = event.candidate;
            if (signalBlocked(candidate, config)) continue;
            if (config.entryMode === "entry_on_close") {
                const trade = buildTradeFromSignal({ candidate, entryIndex: index, entryPrice: row.close, config, pipSize });
                if (trade && !tradeBlockedByStop(trade, config, pipSize) && !maybeRejectSmallStop(trade, config, pipSize, stats)) {
                    openTrade = trade;
                    break;
                }
            } else {
                pendingEntry = buildPendingEntry(candidate, config, pipSize);
                break;
            }
        }
    }

    if (openTrade && context.rows.length) {
        const lastIndex = context.rows.length - 1;
        const lastRow = context.rows[lastIndex];
        trades.push(closeTrade(openTrade, lastIndex, lastRow, lastRow.close, "end_of_data", pipSize));
    }
    return trades.map((trade) => ({ ...trade, symbol, pipSize }));
}

function costAdjustedR(trade) {
    if (COST_MODEL === "none") return Number(trade.pnlR || 0);
    const costPips = COST_MODEL === "fixed" ? FIXED_COST_PIPS : 0;
    const stopPips = Number(trade.riskDistance) / Number(trade.pipSize);
    return Number(trade.pnlR || 0) - (Number.isFinite(stopPips) && stopPips > 0 ? costPips / stopPips : 0);
}

function positionModel(balance, trade, scenario) {
    const quote = trade.symbol.slice(3, 6);
    const entryMs = Date.parse(trade.entryTimestamp);
    const quotePerEur = eurPerQuote(quote, entryMs);
    if (!(Number.isFinite(quotePerEur) && quotePerEur > 0)) return null;
    const riskDistance = Number(trade.riskDistance);
    const entryPrice = Number(trade.entryPrice);
    if (!(Number.isFinite(riskDistance) && riskDistance > 0 && Number.isFinite(entryPrice) && entryPrice > 0)) return null;
    const targetRisk = balance * scenario.perTradeRiskPct;
    const rawUnits = (targetRisk * quotePerEur) / riskDistance;
    const notionalEur = (rawUnits * entryPrice) / quotePerEur;
    const leverage = leverageForSymbol(trade.symbol);
    const maxMargin = (balance * scenario.marginReservePct) / scenario.maxPositions;
    const rawMargin = notionalEur / leverage;
    const riskScale = rawMargin > maxMargin ? maxMargin / rawMargin : 1;
    return {
        leverage,
        quotePerEur,
        targetRisk,
        rawUnits,
        rawMargin,
        maxMargin,
        riskScale,
        effectiveRiskPct: scenario.perTradeRiskPct * riskScale,
        effectiveRiskAmount: targetRisk * riskScale,
        pnlEur: targetRisk * riskScale * Number(trade.pnlRNet || 0),
    };
}

function summarizeTrades(trades) {
    let wins = 0;
    let losses = 0;
    let grossWinR = 0;
    let grossLossR = 0;
    let totalR = 0;
    let equityR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    for (const trade of trades) {
        const r = Number(trade.pnlRNet || 0);
        totalR += r;
        equityR += r;
        peakR = Math.max(peakR, equityR);
        maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR);
        if (r > 0) {
            wins += 1;
            grossWinR += r;
        } else if (r < 0) {
            losses += 1;
            grossLossR += Math.abs(r);
        }
    }
    return {
        trades: trades.length,
        wins,
        losses,
        winRate: trades.length ? wins / trades.length : 0,
        totalR,
        expectancyR: trades.length ? totalR / trades.length : 0,
        profitFactor: grossLossR > 0 ? grossWinR / grossLossR : null,
        maxDrawdownR,
    };
}

function simulatePortfolio(symbols, tradesBySymbol, scenario, filter = () => true) {
    const candidates = symbols
        .flatMap((symbol) => tradesBySymbol.get(symbol) || [])
        .filter(filter)
        .map((trade) => ({ ...trade, pnlRNet: costAdjustedR(trade) }))
        .sort((a, b) => Date.parse(a.entryTimestamp) - Date.parse(b.entryTimestamp) || a.symbol.localeCompare(b.symbol));
    let balance = START_CAPITAL;
    let peak = START_CAPITAL;
    let maxDrawdownAbs = 0;
    let maxDrawdownPct = 0;
    let skippedNoSlot = 0;
    let skippedNoConversion = 0;
    let marginAdjustedTrades = 0;
    let effectiveRiskPctSum = 0;
    const accepted = [];
    const open = [];
    const symbolCounts = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
    const exitEvents = [];

    function applyClosed(untilMs = Number.POSITIVE_INFINITY) {
        open.sort((a, b) => a.exitMs - b.exitMs);
        while (open.length && open[0].exitMs <= untilMs) {
            const item = open.shift();
            balance += item.pnlEur;
            peak = Math.max(peak, balance);
            const dd = peak - balance;
            maxDrawdownAbs = Math.max(maxDrawdownAbs, dd);
            maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? dd / peak : 0);
            item.trade.balanceAfter = balance;
            exitEvents.push(item.trade);
        }
    }

    for (const trade of candidates) {
        const entryMs = Date.parse(trade.entryTimestamp);
        applyClosed(entryMs);
        if (open.length >= scenario.maxPositions) {
            skippedNoSlot += 1;
            continue;
        }
        const model = positionModel(balance, trade, scenario);
        if (!model) {
            skippedNoConversion += 1;
            continue;
        }
        if (model.riskScale < 0.999) marginAdjustedTrades += 1;
        effectiveRiskPctSum += model.effectiveRiskPct;
        const acceptedTrade = { ...trade, ...model, balanceBefore: balance, balanceAfter: null };
        accepted.push(acceptedTrade);
        symbolCounts[trade.symbol] = (symbolCounts[trade.symbol] || 0) + 1;
        open.push({ exitMs: Date.parse(trade.exitTimestamp), pnlEur: model.pnlEur, trade: acceptedTrade });
    }
    applyClosed();

    const summary = summarizeTrades(accepted);
    return {
        scenario,
        symbols,
        trades: accepted,
        exitEvents,
        summary,
        startCapital: START_CAPITAL,
        endCapital: balance,
        pnl: balance - START_CAPITAL,
        returnPct: (balance - START_CAPITAL) / START_CAPITAL,
        maxDrawdownAbs,
        maxDrawdownPct,
        skippedNoSlot,
        skippedNoConversion,
        marginAdjustedTrades,
        avgEffectiveRiskPct: accepted.length ? effectiveRiskPctSum / accepted.length : 0,
        symbolCounts,
    };
}

function mondayWeekKey(timestamp) {
    const date = new Date(timestamp);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    date.setUTCHours(0, 0, 0, 0);
    return date.toISOString().slice(0, 10);
}

function weeklyTable(result) {
    const weeks = new Map();
    for (const trade of result.exitEvents) {
        const key = mondayWeekKey(trade.exitTimestamp || trade.entryTimestamp);
        if (!weeks.has(key)) {
            weeks.set(key, {
                weekStart: key,
                symbols: new Set(),
                startEUR: Number(trade.balanceBefore),
                endEUR: Number(trade.balanceBefore),
                peak: Number(trade.balanceBefore),
                maxDrawdownAbs: 0,
                maxDrawdownPct: 0,
                effectiveRiskPctSum: 0,
                trades: [],
            });
        }
        const week = weeks.get(key);
        week.symbols.add(trade.symbol);
        week.endEUR = Number(trade.balanceAfter);
        week.peak = Math.max(week.peak, Number(trade.balanceAfter));
        const dd = week.peak - Number(trade.balanceAfter);
        week.maxDrawdownAbs = Math.max(week.maxDrawdownAbs, dd);
        week.maxDrawdownPct = Math.max(week.maxDrawdownPct, week.peak > 0 ? dd / week.peak : 0);
        week.effectiveRiskPctSum += Number(trade.effectiveRiskPct || 0);
        week.trades.push(trade);
    }
    return [...weeks.values()].map((week) => {
        const summary = summarizeTrades(week.trades);
        return {
            weekStart: week.weekStart,
            pairs: [...week.symbols].sort().join("|"),
            startEUR: round(week.startEUR, 2),
            endEUR: round(week.endEUR, 2),
            pnlEUR: round(week.endEUR - week.startEUR, 2),
            returnPct: round(((week.endEUR / week.startEUR) - 1) * 100, 2),
            trades: summary.trades,
            wins: summary.wins,
            losses: summary.losses,
            winRatePct: round(summary.winRate * 100, 2),
            netR: round(summary.totalR, 2),
            expectancyR: round(summary.expectancyR, 3),
            profitFactor: round(summary.profitFactor, 2),
            maxDrawdownR: round(summary.maxDrawdownR, 2),
            weekMaxDdEUR: round(week.maxDrawdownAbs, 2),
            weekMaxDdPct: round(week.maxDrawdownPct * 100, 2),
            avgEffectiveRiskPct: round((week.effectiveRiskPctSum / Math.max(1, week.trades.length)) * 100, 3),
        };
    });
}

function readLiveTrades() {
    if (!fs.existsSync(LOG_DIR)) return [];
    const rows = [];
    for (const file of fs.readdirSync(LOG_DIR).filter((name) => name.endsWith(".jsonl"))) {
        for (const line of fs.readFileSync(path.join(LOG_DIR, file), "utf8").split("\n")) {
            if (!line.trim()) continue;
            try {
                const row = JSON.parse(line);
                rows.push(row);
            } catch {
                // Ignore malformed diagnostics.
            }
        }
    }
    return rows;
}

function summarizeLiveToday(liveSymbols) {
    const todayStart = Date.parse(`${TODAY}T00:00:00Z`);
    const trades = readLiveTrades()
        .filter((trade) => liveSymbols.includes(String(trade.symbol || "").toUpperCase()))
        .filter((trade) => Date.parse(trade.openedAt || trade.entryTimestamp || 0) >= Math.max(todayStart, FIX_TIME))
        .sort((a, b) => Date.parse(a.openedAt || 0) - Date.parse(b.openedAt || 0));
    const closed = trades.filter((trade) => trade.status === "closed");
    const open = trades.filter((trade) => trade.status !== "closed");
    const pnlR = closed.reduce((sum, trade) => {
        const entry = Number(trade.entryPrice);
        const close = Number(trade.closePrice);
        const stop = Number(trade.stopLoss);
        const side = String(trade.signal).toUpperCase() === "SELL" ? "SHORT" : "LONG";
        const riskDistance = side === "LONG" ? entry - stop : stop - entry;
        const directional = side === "LONG" ? close - entry : entry - close;
        return sum + (riskDistance > 0 ? directional / riskDistance : 0);
    }, 0);
    return {
        trades: trades.length,
        closed: closed.length,
        open: open.length,
        pnlR: round(pnlR, 3),
        symbols: Object.fromEntries(liveSymbols.map((symbol) => [symbol, trades.filter((trade) => trade.symbol === symbol).length])),
        rows: trades.map((trade) => ({
            symbol: trade.symbol,
            side: trade.signal,
            openedAt: trade.openedAt,
            status: trade.status,
            closedAt: trade.closedAt || null,
            entryPrice: trade.entryPrice,
            closePrice: trade.closePrice,
            effectiveRiskPct: round(Number(trade.positionSizing?.actual?.effectiveRiskPct ?? trade.positionSizing?.planned?.effectiveRiskPct) * 100, 3),
        })),
    };
}

function csv(rows) {
    if (!rows.length) return "";
    const keys = Object.keys(rows[0]);
    return [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
}

function sma(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function predictionPasses(trade, mode) {
    if (!mode || mode === "none") return true;
    const rows = DATA.get(trade.symbol) || [];
    const index = Number(trade.entryIndex);
    if (!Number.isInteger(index) || index < 25 || index >= rows.length) return false;
    const side = trade.side === "LONG" ? 1 : -1;
    const close = rows[index].close;
    const closeN = (n) => rows[index - n]?.close;
    const highs = (n) => rows.slice(index - n, index).map((row) => row.high);
    const lows = (n) => rows.slice(index - n, index).map((row) => row.low);
    const ranges = (n) => rows.slice(index - n, index).map((row) => Math.max(0, row.high - row.low));
    if (!Number.isFinite(close)) return false;

    if (mode === "momentum4") return side * (close - closeN(4)) > 0;
    if (mode === "momentum8") return side * (close - closeN(8)) > 0;
    if (mode === "mean_revert4") return side * (close - closeN(4)) < 0;
    if (mode === "breakout20") {
        if (trade.side === "LONG") return close >= Math.max(...highs(20));
        return close <= Math.min(...lows(20));
    }
    if (mode === "sma_slope20") {
        const current = sma(rows.slice(index - 10, index).map((row) => row.close));
        const previous = sma(rows.slice(index - 20, index - 10).map((row) => row.close));
        if (!Number.isFinite(current) || !Number.isFinite(previous)) return false;
        return side * (current - previous) > 0;
    }
    if (mode === "volatility_quiet") {
        const shortRange = sma(ranges(14));
        const longRange = sma(ranges(60));
        return Number.isFinite(shortRange) && Number.isFinite(longRange) && shortRange < longRange * 0.85;
    }
    if (mode === "momentum_sma_combo") {
        const current = sma(rows.slice(index - 10, index).map((row) => row.close));
        const previous = sma(rows.slice(index - 20, index - 10).map((row) => row.close));
        return side * (close - closeN(4)) > 0 && side * (current - previous) > 0;
    }
    return true;
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

const universes = [
    { id: "usd", symbols: USD_SYMBOLS },
    { id: "live", symbols: LIVE_SYMBOLS },
    { id: "all", symbols: SEARCH_SYMBOLS },
];

const tradesBySymbol = new Map();
for (const symbol of [...new Set(universes.flatMap((item) => item.symbols))]) {
    tradesBySymbol.set(symbol, runFastScenario(symbol, DATA.get(symbol) || [], CONFIG));
}

const fullResults = [];
for (const universe of universes) {
    for (const scenario of POSITION_SCENARIOS) {
        const result = simulatePortfolio(universe.symbols, tradesBySymbol, scenario);
        fullResults.push({ universe: universe.id, ...result, weekly: weeklyTable(result) });
    }
}

const todayStart = Date.parse(`${TODAY}T00:00:00Z`);
const todayFilter = (trade) => Date.parse(trade.entryTimestamp) >= Math.max(todayStart, FIX_TIME);
const todayResults = [];
for (const universe of universes) {
    for (const scenario of POSITION_SCENARIOS) {
        const result = simulatePortfolio(universe.symbols, tradesBySymbol, scenario, todayFilter);
        todayResults.push({ universe: universe.id, ...result });
    }
}

const searchResults = [];
for (const config of candidateConfigs()) {
    const configId = `${scenarioId(config)}|wait${config.maxSignalWaitBars}|break${config.entryBreakMaxBars}|maxStop${config.maxStopPips}`;
    const configTradesBySymbol = new Map();
    for (const symbol of [...new Set(universes.flatMap((item) => item.symbols))]) {
        configTradesBySymbol.set(symbol, runFastScenario(symbol, DATA.get(symbol) || [], config));
    }
    for (const universe of universes) {
        for (const scenario of POSITION_SCENARIOS) {
            const result = simulatePortfolio(universe.symbols, configTradesBySymbol, scenario);
            searchResults.push({ configId, config, universe: universe.id, ...result, weekly: weeklyTable(result) });
        }
    }
}

const bestSearchResults = [];
for (const universe of universes) {
    for (const scenario of POSITION_SCENARIOS) {
        const matches = searchResults.filter((item) => item.universe === universe.id && item.scenario.id === scenario.id);
        matches.sort((a, b) => b.endCapital - a.endCapital);
        if (matches[0]) bestSearchResults.push(matches[0]);
    }
}

const predictionModes = ["none", "momentum4", "momentum8", "sma_slope20", "mean_revert4", "breakout20", "volatility_quiet", "momentum_sma_combo"];
const bestAdaptivePredictionByKey = new Map();
for (const config of adaptiveCandidateConfigs()) {
    const configId = `${scenarioId(config)}|wait${config.maxSignalWaitBars}|break${config.entryBreakMaxBars}|maxStop${config.maxStopPips}`;
    const configTradesBySymbol = new Map();
    for (const symbol of [...new Set(universes.flatMap((item) => item.symbols))]) {
        configTradesBySymbol.set(symbol, runFastScenario(symbol, DATA.get(symbol) || [], config));
    }
    for (const predictionMode of predictionModes) {
        for (const universe of universes) {
            for (const scenario of POSITION_SCENARIOS) {
                const result = simulatePortfolio(universe.symbols, configTradesBySymbol, scenario, (trade) => predictionPasses(trade, predictionMode));
                if (result.summary.trades < 30) continue;
                const key = `${universe.id}|${scenario.id}`;
                const candidate = { predictionMode, configId, config, universe: universe.id, ...result, weekly: null };
                const current = bestAdaptivePredictionByKey.get(key);
                if (!current || candidate.endCapital > current.endCapital) {
                    bestAdaptivePredictionByKey.set(key, candidate);
                }
            }
        }
    }
}

const bestAdaptivePredictionResults = [...bestAdaptivePredictionByKey.values()].map((result) => ({ ...result, weekly: weeklyTable(result) }));

const report = {
    generatedAt: new Date().toISOString(),
    assumptions: {
        timeframe: TIMEFRAME,
        months: MONTHS,
        startCapital: START_CAPITAL,
        costModel: COST_MODEL,
        fixedCostPips: COST_MODEL === "fixed" ? FIXED_COST_PIPS : null,
        strategy: scenarioId(CONFIG),
        dailyFlat: true,
        usdLeverage: 30,
        crossLeverage: 20,
        positionScenarios: POSITION_SCENARIOS,
    },
    dataCoverage: Object.fromEntries(
        [...new Set([...USD_SYMBOLS, ...LIVE_SYMBOLS])].map((symbol) => [
            symbol,
            { rows: (DATA.get(symbol) || []).length, first: DATA.get(symbol)?.[0]?.timestamp || null, last: DATA.get(symbol)?.at(-1)?.timestamp || null },
        ]),
    ),
    fullResults: fullResults.map((result) => ({
        universe: result.universe,
        scenario: result.scenario.id,
        symbols: result.symbols,
        trades: result.summary.trades,
        wins: result.summary.wins,
        losses: result.summary.losses,
        winRatePct: round(result.summary.winRate * 100, 2),
        netR: round(result.summary.totalR, 2),
        expectancyR: round(result.summary.expectancyR, 3),
        profitFactor: round(result.summary.profitFactor, 2),
        startCapital: START_CAPITAL,
        endCapital: round(result.endCapital, 2),
        pnlEUR: round(result.pnl, 2),
        returnPct: round(result.returnPct * 100, 2),
        maxDrawdownEUR: round(result.maxDrawdownAbs, 2),
        maxDrawdownPct: round(result.maxDrawdownPct * 100, 2),
        avgEffectiveRiskPct: round(result.avgEffectiveRiskPct * 100, 3),
        marginAdjustedTrades: result.marginAdjustedTrades,
        skippedNoSlot: result.skippedNoSlot,
        skippedNoConversion: result.skippedNoConversion,
        symbolCounts: result.symbolCounts,
        weekly: result.weekly,
    })),
    bestSearchResults: bestSearchResults.map((result) => ({
        universe: result.universe,
        scenario: result.scenario.id,
        configId: result.configId,
        config: result.config,
        symbols: result.symbols,
        trades: result.summary.trades,
        wins: result.summary.wins,
        losses: result.summary.losses,
        winRatePct: round(result.summary.winRate * 100, 2),
        netR: round(result.summary.totalR, 2),
        expectancyR: round(result.summary.expectancyR, 3),
        profitFactor: round(result.summary.profitFactor, 2),
        startCapital: START_CAPITAL,
        endCapital: round(result.endCapital, 2),
        pnlEUR: round(result.pnl, 2),
        returnPct: round(result.returnPct * 100, 2),
        maxDrawdownEUR: round(result.maxDrawdownAbs, 2),
        maxDrawdownPct: round(result.maxDrawdownPct * 100, 2),
        avgEffectiveRiskPct: round(result.avgEffectiveRiskPct * 100, 3),
        marginAdjustedTrades: result.marginAdjustedTrades,
        skippedNoSlot: result.skippedNoSlot,
        skippedNoConversion: result.skippedNoConversion,
        symbolCounts: result.symbolCounts,
        weekly: result.weekly,
    })),
    bestAdaptivePredictionResults: bestAdaptivePredictionResults.map((result) => ({
        universe: result.universe,
        scenario: result.scenario.id,
        predictionMode: result.predictionMode,
        configId: result.configId,
        config: result.config,
        symbols: result.symbols,
        trades: result.summary.trades,
        wins: result.summary.wins,
        losses: result.summary.losses,
        winRatePct: round(result.summary.winRate * 100, 2),
        netR: round(result.summary.totalR, 2),
        expectancyR: round(result.summary.expectancyR, 3),
        profitFactor: round(result.summary.profitFactor, 2),
        startCapital: START_CAPITAL,
        endCapital: round(result.endCapital, 2),
        pnlEUR: round(result.pnl, 2),
        returnPct: round(result.returnPct * 100, 2),
        maxDrawdownEUR: round(result.maxDrawdownAbs, 2),
        maxDrawdownPct: round(result.maxDrawdownPct * 100, 2),
        avgEffectiveRiskPct: round(result.avgEffectiveRiskPct * 100, 3),
        marginAdjustedTrades: result.marginAdjustedTrades,
        skippedNoSlot: result.skippedNoSlot,
        skippedNoConversion: result.skippedNoConversion,
        symbolCounts: result.symbolCounts,
        weekly: result.weekly,
    })),
    todayBacktest: todayResults.map((result) => ({
        universe: result.universe,
        scenario: result.scenario.id,
        trades: result.summary.trades,
        wins: result.summary.wins,
        losses: result.summary.losses,
        netR: round(result.summary.totalR, 3),
        endCapital: round(result.endCapital, 2),
        pnlEUR: round(result.pnl, 2),
        avgEffectiveRiskPct: round(result.avgEffectiveRiskPct * 100, 3),
        rows: result.trades.map((trade) => ({
            symbol: trade.symbol,
            side: trade.side,
            entryTimestamp: trade.entryTimestamp,
            exitTimestamp: trade.exitTimestamp,
            exitReason: trade.exitReason,
            pnlR: round(trade.pnlRNet, 3),
            effectiveRiskPct: round(trade.effectiveRiskPct * 100, 3),
            balanceAfter: round(trade.balanceAfter, 2),
        })),
    })),
    todayLive: summarizeLiveToday(LIVE_SYMBOLS),
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonPath = path.join(REPORT_DIR, `pa_hllh_m15_usd_margin_lab_${stamp}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

for (const result of report.fullResults) {
    fs.writeFileSync(path.join(REPORT_DIR, `${path.basename(jsonPath, ".json")}_${result.universe}_${result.scenario}.weekly.csv`), csv(result.weekly));
}
for (const result of report.bestSearchResults) {
    fs.writeFileSync(path.join(REPORT_DIR, `${path.basename(jsonPath, ".json")}_best_${result.universe}_${result.scenario}.weekly.csv`), csv(result.weekly));
}
for (const result of report.bestAdaptivePredictionResults) {
    fs.writeFileSync(path.join(REPORT_DIR, `${path.basename(jsonPath, ".json")}_adaptive_predictive_${result.universe}_${result.scenario}.weekly.csv`), csv(result.weekly));
}

console.log(
    JSON.stringify(
        {
            jsonPath,
            fullResults: report.fullResults.map(({ universe, scenario, trades, winRatePct, netR, endCapital, maxDrawdownPct, avgEffectiveRiskPct }) => ({
                universe,
                scenario,
                trades,
                winRatePct,
                netR,
                endCapital,
                maxDrawdownPct,
                avgEffectiveRiskPct,
            })),
            todayBacktest: report.todayBacktest.map(({ universe, scenario, trades, netR, endCapital, avgEffectiveRiskPct }) => ({
                universe,
                scenario,
                trades,
                netR,
                endCapital,
                avgEffectiveRiskPct,
            })),
            bestSearchResults: report.bestSearchResults.map(({ universe, scenario, configId, trades, winRatePct, netR, endCapital, maxDrawdownPct, avgEffectiveRiskPct }) => ({
                universe,
                scenario,
                configId,
                trades,
                winRatePct,
                netR,
                endCapital,
                maxDrawdownPct,
                avgEffectiveRiskPct,
            })),
            bestAdaptivePredictionResults: report.bestAdaptivePredictionResults.map(({ universe, scenario, predictionMode, configId, trades, winRatePct, netR, endCapital, maxDrawdownPct, avgEffectiveRiskPct }) => ({
                universe,
                scenario,
                predictionMode,
                configId,
                trades,
                winRatePct,
                netR,
                endCapital,
                maxDrawdownPct,
                avgEffectiveRiskPct,
            })),
            todayLive: report.todayLive,
        },
        null,
        2,
    ),
);
