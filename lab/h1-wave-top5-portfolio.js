import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { detectWave } from "./detect-wave-simple.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START_CAPITAL = 1000;
const RISK_PCT = 0.03;
const MARGIN_USAGE = 0.9;
const TARGET_R = 1.5;
const ORDER_BUFFER_PIPS = 2;
const ORDER_EXPIRY_MINUTES = 60;
const MAX_HOLD_MINUTES = 24 * 60;
const TRAIL_ACTIVATION_R = 0.7;
const TRAIL_DISTANCE_R = 0.35;
const DEFAULT_EXPERIMENT = {
    signalMode: "combined",
    detector: {},
    bufferPips: ORDER_BUFFER_PIPS,
    stopMode: "signal",
    stopBufferAtr: null,
    expiryMinutes: ORDER_EXPIRY_MINUTES,
    targetR: TARGET_R,
    trailActivationR: TRAIL_ACTIVATION_R,
    trailDistanceR: TRAIL_DISTANCE_R,
    ranking: "bodyAtr",
};
const SYMBOLS = ["AUDCAD", "AUDJPY", "AUDUSD", "EURAUD", "EURCHF", "EURGBP", "EURJPY", "EURUSD",
    "GBPAUD", "GBPCHF", "GBPJPY", "GBPUSD", "NZDJPY", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"];
const SESSIONS = {
    sydney: { start: "22:00", end: "07:00", symbols: ["USDJPY", "GBPUSD", "AUDJPY", "EURUSD", "USDCHF"] },
    tokyo: { start: "00:00", end: "09:00", symbols: ["USDCHF", "AUDUSD", "EURJPY", "EURUSD", "AUDJPY"] },
    london: { start: "08:00", end: "17:00", symbols: ["EURUSD", "GBPUSD", "AUDUSD", "GBPCHF", "USDCHF"] },
    newYork: { start: "13:00", end: "21:00", symbols: ["USDJPY", "GBPUSD", "AUDUSD", "AUDJPY", "EURJPY"] },
};

function parseArgs(argv) {
    const result = { datasets: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        if (key === "--dataset") result.datasets.push(path.resolve(argv[++index]));
        else if (key === "--rules") result.rules = path.resolve(argv[++index]);
        else if (key === "--report") result.report = path.resolve(argv[++index]);
        else if (key === "--research-report") result.researchReport = path.resolve(argv[++index]);
        else if (key === "--profit-search-report") result.profitSearchReport = path.resolve(argv[++index]);
        else if (key === "--feature-search-report") result.featureSearchReport = path.resolve(argv[++index]);
        else if (key === "--layer-profit-report") result.layerProfitReport = path.resolve(argv[++index]);
        else if (key === "--frequency-search-report") result.frequencySearchReport = path.resolve(argv[++index]);
        else if (key === "--frequency-count") result.frequencyCount = Number(argv[++index]);
        else if (key === "--frequency-seed") result.frequencySeed = Number(argv[++index]);
        else if (key === "--session-search-report") result.sessionSearchReport = path.resolve(argv[++index]);
        else if (key === "--session-source-report") result.sessionSourceReport = path.resolve(argv[++index]);
        else if (key === "--session-replay-report") result.sessionReplayReport = path.resolve(argv[++index]);
        else if (key === "--candidate-file") result.candidateFile = path.resolve(argv[++index]);
        else if (key === "--candidate-report") result.candidateReport = path.resolve(argv[++index]);
        else if (key === "--day") result.day = argv[++index];
        else if (key === "--day-report") result.dayReport = path.resolve(argv[++index]);
        else if (key === "--dynamic-adaptive-report") result.dynamicAdaptiveReport = path.resolve(argv[++index]);
        else if (key === "--dynamic-scope") result.dynamicScope = argv[++index];
        else if (key === "--live-audit-report") result.liveAuditReport = path.resolve(argv[++index]);
        else if (key === "--live-audit-from") result.liveAuditFrom = argv[++index];
        else if (key === "--live-audit-to") result.liveAuditTo = argv[++index];
        else throw new Error(`Unknown argument: ${key}`);
    }
    return result;
}

function candleSide(raw, side) {
    const values = raw?.[side];
    return {
        open: Number(values?.open ?? raw?.open), high: Number(values?.high ?? raw?.high),
        low: Number(values?.low ?? raw?.low), close: Number(values?.close ?? raw?.close),
    };
}

function loadMerged(directories, symbol, timeframe, withAtr = false) {
    const byTimestamp = new Map();
    let invalid = 0;
    let duplicates = 0;
    for (const directory of directories) {
        const file = path.join(directory, `${symbol}_${timeframe}.jsonl`);
        if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
            if (!line) continue;
            const raw = JSON.parse(line);
            const t = Date.parse(raw.timestamp);
            const bid = candleSide(raw, "bid");
            const ask = candleSide(raw, "ask");
            if (![t, ...Object.values(bid), ...Object.values(ask)].every(Number.isFinite)) { invalid += 1; continue; }
            if (byTimestamp.has(t)) duplicates += 1;
            byTimestamp.set(t, { t, timestamp: new Date(t).toISOString(), ...bid, bid, ask });
        }
    }
    const rows = [...byTimestamp.values()].sort((left, right) => left.t - right.t);
    if (withAtr) addAtr(rows);
    return { rows, audit: { rows: rows.length, invalid, duplicates, first: rows[0]?.timestamp ?? null, last: rows.at(-1)?.timestamp ?? null } };
}

function addAtr(rows, period = 14) {
    let atr = null;
    let seed = 0;
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const previous = rows[index - 1];
        const range = previous ? Math.max(row.high - row.low, Math.abs(row.high - previous.close), Math.abs(row.low - previous.close)) : row.high - row.low;
        if (index < period) seed += range;
        if (index === period - 1) atr = seed / period;
        else if (index >= period) atr = (atr * (period - 1) + range) / period;
        row.atr = atr;
    }
}

function emaSeries(rows, period) {
    const output = Array(rows.length).fill(null);
    const multiplier = 2 / (period + 1);
    let value = null;
    let seed = 0;
    for (let index = 0; index < rows.length; index += 1) {
        seed += rows[index].close;
        if (index === period - 1) value = seed / period;
        else if (index >= period) value = rows[index].close * multiplier + value * (1 - multiplier);
        output[index] = value;
    }
    return output;
}

function lowerBound(rows, timestamp) {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (rows[middle].t < timestamp) low = middle + 1;
        else high = middle;
    }
    return low;
}

function atOrBefore(rows, timestamp) {
    const index = lowerBound(rows, timestamp);
    return index < rows.length && rows[index].t === timestamp ? index : index - 1;
}

function minuteOfDay(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
}

function activeContext(timestamp) {
    const date = new Date(timestamp);
    const current = date.getUTCHours() * 60 + date.getUTCMinutes();
    const symbols = [];
    const names = [];
    for (const [name, session] of Object.entries(SESSIONS)) {
        const start = minuteOfDay(session.start);
        const end = minuteOfDay(session.end);
        const active = start < end ? current >= start && current < end : current >= start || current < end;
        if (!active) continue;
        names.push(name);
        for (const symbol of session.symbols) if (!symbols.includes(symbol)) symbols.push(symbol);
    }
    return { symbols, names };
}

function buildSignals(symbol, frames, experiment = DEFAULT_EXPERIMENT) {
    const { h1, m15, m5, m1 } = frames;
    const ema20 = emaSeries(h1, 20);
    const ema50 = emaSeries(h1, 50);
    const signals = [];
    let m5Closed = -1;
    let m15Closed = -1;
    for (let index = 15; index < h1.length; index += 1) {
        const current = h1[index];
        const previous = h1[index - 1];
        const decisionTime = current.t + HOUR;
        const context = activeContext(decisionTime);
        const activeRank = context.symbols.indexOf(symbol);
        if (activeRank < 0 && !experiment.dynamicUniverse) continue;
        while (m5Closed + 1 < m5.length && m5[m5Closed + 1].t + 5 * MINUTE <= decisionTime) m5Closed += 1;
        while (m15Closed + 1 < m15.length && m15[m15Closed + 1].t + 15 * MINUTE <= decisionTime) m15Closed += 1;
        if (m5Closed < 40 || m15Closed < 15 || !(current.atr > 0)) continue;
        const wave = detectWave(symbol,
            { m5: { atr: m5[m5Closed].atr }, m15: { atr: m15[m15Closed].atr } },
            { m5: m5.slice(Math.max(0, m5Closed - 63), m5Closed + 1), m15: m15.slice(Math.max(0, m15Closed - 31), m15Closed + 1) },
            experiment.detector);
        const bullish = wave.waveDirection === "BUY" && previous.close < previous.open && current.close > current.open;
        const bearish = wave.waveDirection === "SELL" && previous.close > previous.open && current.close < current.open;
        const patternDirection = previous.close < previous.open && current.close > current.open ? "BUY"
            : previous.close > previous.open && current.close < current.open ? "SELL" : null;
        const side = experiment.signalMode === "wave" ? wave.waveDirection
            : experiment.signalMode === "pattern" ? patternDirection
            : bullish ? "BUY" : bearish ? "SELL" : null;
        if (!side) continue;
        const marketIndex = atOrBefore(m1, decisionTime - 1);
        if (marketIndex < 0) continue;
        const market = m1[marketIndex];
        const entryBuffer = (symbol.includes("JPY") ? 0.01 : 0.0001) * experiment.bufferPips;
        const stopBuffer = experiment.stopBufferAtr === null ? entryBuffer : current.atr * experiment.stopBufferAtr;
        const baseStop = experiment.stopMode === "pattern"
            ? side === "BUY" ? Math.min(previous.low, current.low) : Math.max(previous.high, current.high)
            : side === "BUY" ? current.low : current.high;
        const entry = side === "BUY" ? current.high + entryBuffer : current.low - entryBuffer;
        const stop = side === "BUY" ? baseStop - stopBuffer : baseStop + stopBuffer;
        const distance = side === "BUY" ? entry - stop : stop - entry;
        const directionSign = side === "BUY" ? 1 : -1;
        const atrWindow = h1.slice(Math.max(0, index - 49), index + 1).map(({ atr }) => atr).filter((value) => value > 0);
        const meanAtr50 = atrWindow.reduce((sum, value) => sum + value, 0) / atrWindow.length;
        let path6 = 0;
        for (let cursor = Math.max(1, index - 5); cursor <= index; cursor += 1) path6 += Math.abs(h1[cursor].close - h1[cursor - 1].close);
        const efficiency6 = path6 > 0 && index >= 6 ? Math.abs(current.close - h1[index - 6].close) / path6 : 0;
        const range = current.high - current.low;
        const rejectionWick = range > 0 ? (side === "BUY" ? Math.min(current.open, current.close) - current.low : current.high - Math.max(current.open, current.close)) / range : 0;
        const engulfing = side === "BUY"
            ? current.close >= previous.open && current.open <= previous.close
            : current.close <= previous.open && current.open >= previous.close;
        const structure = h1.slice(Math.max(0, index - 3), index + 1);
        signals.push({ symbol, side, signalAt: decisionTime, sessions: context.names,
            activeRank: activeRank < 0 ? Number.MAX_SAFE_INTEGER : activeRank,
            strength: Math.abs(current.close - current.open) / current.atr, entry, stop,
            target: side === "BUY" ? entry + experiment.targetR * distance : entry - experiment.targetR * distance,
            distance, atr: current.atr, riskAtr: distance / current.atr,
            spreadAtr: (market.ask.close - market.bid.close) / current.atr,
            entryGapAtr: (side === "BUY" ? entry - market.ask.close : market.bid.close - entry) / current.atr,
            trendScore: ema20[index] && ema50[index] ? directionSign * (ema20[index] - ema50[index]) / current.atr : 0,
            priceEmaScore: ema20[index] ? directionSign * (current.close - ema20[index]) / current.atr : 0,
            emaSlopeScore: ema20[index] && ema20[index - 3] ? directionSign * (ema20[index] - ema20[index - 3]) / current.atr : 0,
            atrRegime: meanAtr50 > 0 ? current.atr / meanAtr50 : 1,
            efficiency6,
            rejectionWick,
            engulfing,
            previousBodyAtr: Math.abs(previous.close - previous.open) / current.atr,
            timeframeDirections: wave.timeframeDirections,
            signalOpen: current.open, signalClose: current.close, signalHigh: current.high, signalLow: current.low,
            patternHigh: Math.max(previous.high, current.high), patternLow: Math.min(previous.low, current.low),
            swingHigh: Math.max(...structure.map(({ high }) => high)), swingLow: Math.min(...structure.map(({ low }) => low)),
            marketBid: market.bid.close, marketAsk: market.ask.close });
    }
    return signals;
}

function buildMarketStates(symbol, frames) {
    const { h1, m1 } = frames;
    const ema20 = emaSeries(h1, 20);
    const ema50 = emaSeries(h1, 50);
    const sessionRanges = Object.fromEntries(Object.keys(SESSIONS).map((name) => [name, []]));
    const states = [];
    for (let index = 50; index < h1.length; index += 1) {
        const current = h1[index];
        const decisionTime = current.t + HOUR;
        const context = activeContext(decisionTime);
        if (!context.names.length || !(current.atr > 0)) continue;
        const marketIndex = atOrBefore(m1, decisionTime - 1);
        if (marketIndex < 0) continue;
        const market = m1[marketIndex];
        const atrWindow = h1.slice(index - 49, index + 1).map(({ atr }) => atr).filter((value) => value > 0);
        const meanAtr = atrWindow.reduce((sum, value) => sum + value, 0) / atrWindow.length;
        let path = 0;
        for (let cursor = index - 5; cursor <= index; cursor += 1) path += Math.abs(h1[cursor].close - h1[cursor - 1].close);
        const efficiency = path > 0 ? Math.abs(current.close - h1[index - 6].close) / path : 0;
        const rangeAtr = (current.high - current.low) / current.atr;
        const sessionOpportunity = Object.fromEntries(context.names.map((name) => {
            const history = sessionRanges[name];
            const window = history.slice(-20);
            return [name, window.length ? window.reduce((sum, value) => sum + value, 0) / window.length : 1];
        }));
        states.push({ symbol, signalAt: decisionTime, sessions: context.names,
            atrRegime: meanAtr > 0 ? current.atr / meanAtr : 1,
            efficiency, trendAbs: ema20[index] && ema50[index] ? Math.abs(ema20[index] - ema50[index]) / current.atr : 0,
            spreadAtr: (market.ask.close - market.bid.close) / current.atr, sessionOpportunity });
        for (const name of context.names) {
            sessionRanges[name].push(rangeAtr);
            if (sessionRanges[name].length > 64) sessionRanges[name].shift();
        }
    }
    return states;
}

function quantile(values, probability) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const position = (sorted.length - 1) * probability;
    const low = Math.floor(position);
    const fraction = position - low;
    return sorted[low + 1] === undefined ? sorted[low] : sorted[low] + fraction * (sorted[low + 1] - sorted[low]);
}

function passesSignalFilters(signal, experiment) {
    if (experiment.minStrength !== undefined && signal.strength < experiment.minStrength) return false;
    if (experiment.maxStrength !== undefined && signal.strength > experiment.maxStrength) return false;
    if (experiment.minRiskAtr !== undefined && signal.riskAtr < experiment.minRiskAtr) return false;
    if (experiment.maxRiskAtr !== undefined && signal.riskAtr > experiment.maxRiskAtr) return false;
    if (experiment.maxSpreadAtr !== undefined && signal.spreadAtr > experiment.maxSpreadAtr) return false;
    if (experiment.minEntryGapAtr !== undefined && signal.entryGapAtr < experiment.minEntryGapAtr) return false;
    if (experiment.maxEntryGapAtr !== undefined && signal.entryGapAtr > experiment.maxEntryGapAtr) return false;
    if (experiment.minTrendScore !== undefined && signal.trendScore < experiment.minTrendScore) return false;
    if (experiment.maxTrendScore !== undefined && signal.trendScore > experiment.maxTrendScore) return false;
    if (experiment.minPriceEmaScore !== undefined && signal.priceEmaScore < experiment.minPriceEmaScore) return false;
    if (experiment.maxPriceEmaScore !== undefined && signal.priceEmaScore > experiment.maxPriceEmaScore) return false;
    if (experiment.minEmaSlopeScore !== undefined && signal.emaSlopeScore < experiment.minEmaSlopeScore) return false;
    if (experiment.maxEmaSlopeScore !== undefined && signal.emaSlopeScore > experiment.maxEmaSlopeScore) return false;
    if (experiment.minAtrRegime !== undefined && signal.atrRegime < experiment.minAtrRegime) return false;
    if (experiment.maxAtrRegime !== undefined && signal.atrRegime > experiment.maxAtrRegime) return false;
    if (experiment.minEfficiency6 !== undefined && signal.efficiency6 < experiment.minEfficiency6) return false;
    if (experiment.maxEfficiency6 !== undefined && signal.efficiency6 > experiment.maxEfficiency6) return false;
    if (experiment.minRejectionWick !== undefined && signal.rejectionWick < experiment.minRejectionWick) return false;
    if (experiment.minPreviousBodyAtr !== undefined && signal.previousBodyAtr < experiment.minPreviousBodyAtr) return false;
    if (experiment.requireEngulfing && !signal.engulfing) return false;
    if (experiment.side && signal.side !== experiment.side) return false;
    const date = new Date(signal.signalAt);
    if (experiment.hours && !experiment.hours.includes(date.getUTCHours())) return false;
    if (experiment.weekdays && !experiment.weekdays.includes(date.getUTCDay())) return false;
    const sessionKey = signal.sessions.join("+");
    if (experiment.sessions && !experiment.sessions.includes(sessionKey)) return false;
    return true;
}

function signalRankingScore(signal, experiment) {
    if (experiment.ranking === "adaptive") return signal.adaptiveRankScore ?? -signal.activeRank;
    if (experiment.ranking === "sessionOrder") return -signal.activeRank;
    if (experiment.ranking === "tightStop") return -signal.riskAtr;
    if (experiment.ranking === "lowSpread") return -signal.spreadAtr;
    if (experiment.ranking === "nearEntry") return -signal.entryGapAtr;
    if (experiment.ranking === "farEntry") return signal.entryGapAtr;
    if (experiment.ranking === "composite") return signal.strength - 0.5 * signal.riskAtr - 5 * signal.spreadAtr;
    if (experiment.ranking === "linear") {
        const weights = experiment.weights ?? {};
        return (weights.strength ?? 0) * signal.strength
            + (weights.riskAtr ?? 0) * signal.riskAtr
            + (weights.spreadAtr ?? 0) * signal.spreadAtr
            + (weights.entryGapAtr ?? 0) * signal.entryGapAtr
            + (weights.trend ?? 0) * signal.trendScore
            + (weights.priceEma ?? 0) * signal.priceEmaScore
            + (weights.emaSlope ?? 0) * signal.emaSlopeScore
            + (weights.atrRegime ?? 0) * signal.atrRegime
            + (weights.efficiency ?? 0) * signal.efficiency6
            + (weights.wick ?? 0) * signal.rejectionWick
            + (weights.previousBody ?? 0) * signal.previousBodyAtr;
    }
    return signal.strength;
}

function quotePerEurAt(symbol, timestamp, data) {
    const quote = symbol.slice(3, 6);
    if (quote === "EUR") return 1;
    const mid = (pair) => {
        const rows = data[pair]?.m1;
        const index = rows ? atOrBefore(rows, timestamp) : -1;
        return index >= 0 ? (rows[index].bid.close + rows[index].ask.close) / 2 : null;
    };
    const direct = mid(`EUR${quote}`);
    if (direct > 0) return direct;
    const inverse = mid(`${quote}EUR`);
    if (inverse > 0) return 1 / inverse;
    const eurusd = mid("EURUSD");
    if (!(eurusd > 0)) return null;
    if (quote === "USD") return eurusd;
    const usdQuote = mid(`USD${quote}`);
    if (usdQuote > 0) return eurusd * usdQuote;
    const quoteUsd = mid(`${quote}USD`);
    return quoteUsd > 0 ? eurusd / quoteUsd : null;
}

function weekKey(timestamp) {
    const date = new Date(timestamp);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return date.toISOString().slice(0, 10);
}

function simulate({ signals, data, rules, slots, from, to, experiment = DEFAULT_EXPERIMENT, includeTradeLog = true }) {
    const spreadMultiplier = Number(experiment.spreadMultiplier ?? 1);
    const stressedAsk = (ask, bid) => bid + (ask - bid) * spreadMultiplier;
    const eligible = signals.filter((signal) => {
        if (signal.signalAt < from || signal.signalAt >= to) return false;
        return passesSignalFilters(signal, experiment);
    });
    const signalGroups = new Map();
    for (const signal of eligible) {
        if (!signalGroups.has(signal.signalAt)) signalGroups.set(signal.signalAt, []);
        signalGroups.get(signal.signalAt).push(signal);
    }
    const signalTimes = [...signalGroups.keys()].sort((left, right) => left - right);
    const cursors = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, lowerBound(data[symbol].m1, from)]));
    const latest = Object.fromEntries(SYMBOLS.map((symbol) => {
        const rows = data[symbol].m1;
        const index = atOrBefore(rows, from - 1);
        return [symbol, index >= 0 ? rows[index] : null];
    }));
    const active = [];
    const trades = [];
    const rejections = {};
    const dailyPnl = new Map();
    const weeklyPnl = new Map();
    let signalCursor = 0;
    let balance = START_CAPITAL;
    let peak = balance;
    let maxDrawdownPct = 0;
    let maxMarginUsagePct = 0;
    let maxEffectiveRiskPct = 0;
    let maxConcurrent = 0;
    const reject = (reason, count = 1) => { rejections[reason] = (rejections[reason] ?? 0) + count; };
    const remove = (item) => active.splice(active.indexOf(item), 1);

    const close = (position, timestamp, exit, reason) => {
        const conversion = quotePerEurAt(position.symbol, timestamp - 1, data) ?? position.quotePerEur;
        const movement = position.side === "BUY" ? exit - position.entry : position.entry - exit;
        const pnl = movement * position.size / conversion;
        balance += pnl;
        peak = Math.max(peak, balance);
        maxDrawdownPct = Math.max(maxDrawdownPct, 100 * (peak - balance) / peak);
        const day = new Date(timestamp).toISOString().slice(0, 10);
        const week = weekKey(timestamp);
        dailyPnl.set(day, (dailyPnl.get(day) ?? 0) + pnl);
        weeklyPnl.set(week, (weeklyPnl.get(week) ?? 0) + pnl);
        trades.push({ symbol: position.symbol, side: position.side, signaled: new Date(position.signalAt).toISOString(),
            opened: new Date(position.opened).toISOString(), closed: new Date(timestamp).toISOString(), reason, pnl,
            r: pnl / position.initialRisk, effectiveRiskPct: 100 * position.initialRisk / position.balanceAtOrder,
            balanceAfter: balance, sessions: position.sessions, source: position.source,
            managementMode: position.management?.mode ?? "fixed", stopMoves: position.stopMoves ?? 0,
            pairRank: position.pairRank ?? null });
        remove(position);
    };
    const closeAtMarket = (position, timestamp, reason) => {
        const bar = latest[position.symbol];
        if (bar) close(position, timestamp, position.side === "BUY" ? bar.bid.close : stressedAsk(bar.ask.close, bar.bid.close), reason);
    };

    const managePosition = (position, bar, askClose) => {
        const management = position.management;
        if (!management || management.mode === "fixed") return false;
        const closeTime = bar.t + MINUTE;
        const liquidationClose = position.side === "BUY" ? bar.bid.close : askClose;
        const profitR = (position.side === "BUY" ? liquidationClose - position.entry : position.entry - liquidationClose) / position.distance;
        if (management.breakEvenR !== null && profitR >= management.breakEvenR) {
            const nextStop = position.entry;
            const improves = position.side === "BUY" ? nextStop > position.activeStop : nextStop < position.activeStop;
            if (improves) { position.activeStop = nextStop; position.stopMoves += 1; }
        }
        const stepMinutes = management.stepTimeframe === "m5" ? 5 : 15;
        if (profitR >= management.activationR && closeTime % (stepMinutes * MINUTE) === 0) {
            const rows = data[position.symbol][management.stepTimeframe];
            const closedIndex = lowerBound(rows, closeTime) - 1;
            if (closedIndex >= management.stepBars - 1
                && rows[closedIndex].t + stepMinutes * MINUTE <= closeTime) {
                const window = rows.slice(closedIndex - management.stepBars + 1, closedIndex + 1);
                const atr = rows[closedIndex].atr ?? position.atr;
                const candidate = position.side === "BUY"
                    ? Math.min(...window.map(({ low }) => low)) - management.bufferAtr * atr
                    : Math.max(...window.map(({ high }) => high)) + management.bufferAtr * atr;
                const safe = position.side === "BUY" ? candidate < bar.bid.close : candidate > askClose;
                const improves = position.side === "BUY" ? candidate > position.activeStop : candidate < position.activeStop;
                if (safe && improves) { position.activeStop = candidate; position.stopMoves += 1; }
            }
        }
        if (management.reversalExit && closeTime % (15 * MINUTE) === 0) {
            const rows = data[position.symbol].m15;
            const closedIndex = lowerBound(rows, closeTime) - 1;
            const previous = rows[closedIndex - 1];
            const current = rows[closedIndex];
            if (previous && current && current.t + 15 * MINUTE <= closeTime) {
                const reversed = position.side === "BUY"
                    ? previous.close < previous.open && current.close < current.open && current.close < previous.close
                    : previous.close > previous.open && current.close > current.open && current.close > previous.close;
                if (reversed && profitR < management.reversalMaxR) {
                    close(position, closeTime, liquidationClose, "dynamicReversal");
                    return true;
                }
            }
        }
        return false;
    };

    const placeSignals = (timestamp) => {
        const group = signalGroups.get(timestamp) ?? [];
        if (!group.length) return;
        const now = new Date(timestamp);
        const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
        const day = now.toISOString().slice(0, 10);
        const week = weekKey(timestamp);
        const dayProfit = dailyPnl.get(day) ?? 0;
        const weekProfit = weeklyPnl.get(week) ?? 0;
        if (dayProfit <= -0.1 * (balance - dayProfit)) return reject("dailyLossLimit", group.length);
        if (weekProfit <= -0.2 * (balance - weekProfit)) return reject("weeklyLossLimit", group.length);
        if (!experiment.continuousTrading && minute >= 22 * 60) return reject("dailyEntryClosed", group.length);
        if (now.getUTCDay() === 5 && now.getUTCHours() >= 18) return reject("fridayEntryClosed", group.length);
        const free = slots - active.length;
        if (free <= 0) return reject("portfolioFull", group.length);
        const occupied = new Set(active.map(({ symbol }) => symbol));
        const allowed = group.filter(({ symbol }) => !occupied.has(symbol));
        reject("symbolOccupied", group.length - allowed.length);
        const selected = allowed.sort((left, right) => signalRankingScore(right, experiment) - signalRankingScore(left, experiment)
            || left.activeRank - right.activeRank).slice(0, free);
        reject("notSelected", allowed.length - selected.length);
        for (const signal of selected) {
            const marketAsk = stressedAsk(signal.marketAsk, signal.marketBid);
            const pending = signal.side === "BUY" ? signal.entry > marketAsk : signal.entry < signal.marketBid;
            if (!pending || !(signal.distance > 0)) { reject("invalidPendingEntry"); continue; }
            const rule = rules[signal.symbol];
            const minimumDistance = signal.entry * Number(rule?.minDistancePct ?? 0) / 100;
            if (signal.distance < minimumDistance || Math.abs(signal.target - signal.entry) < minimumDistance) { reject("brokerMinimumDistance"); continue; }
            const quotePerEur = quotePerEurAt(signal.symbol, timestamp - 1, data);
            const leverage = rule?.marginFactorUnit === "PERCENTAGE" && rule.marginFactor > 0 ? 100 / rule.marginFactor : null;
            if (!(quotePerEur > 0) || !(leverage > 0) || !(balance > 0)) { reject("missingSizingInput"); continue; }
            const usedMargin = active.reduce((sum, item) => sum + item.margin, 0);
            const availableMargin = Math.max(0, balance - usedMargin);
            const remainingMarginBudget = Math.max(0, balance * MARGIN_USAGE - usedMargin);
            const marginCap = Math.min(Math.min(availableMargin, balance / slots) * MARGIN_USAGE, remainingMarginBudget);
            const signalRiskPct = Math.min(RISK_PCT, Math.max(0, Number(signal.execution?.riskPct ?? RISK_PCT)));
            const riskSize = balance * signalRiskPct * quotePerEur / signal.distance;
            const marginSize = marginCap * leverage * quotePerEur / signal.entry;
            const size = Math.floor(Math.min(riskSize, marginSize) / 100) * 100;
            if (size < 100) { reject("belowMinimumSize"); continue; }
            const margin = size * signal.entry / quotePerEur / leverage;
            const initialRisk = size * signal.distance / quotePerEur;
            cursors[signal.symbol] = lowerBound(data[signal.symbol].m1, timestamp);
            latest[signal.symbol] = data[signal.symbol].m1[cursors[signal.symbol] - 1] ?? latest[signal.symbol];
            const targetR = signal.execution?.targetR ?? experiment.targetR;
            const trailActivationR = signal.execution?.trailActivationR ?? experiment.trailActivationR;
            const trailDistanceR = signal.execution?.trailDistanceR ?? experiment.trailDistanceR;
            const expiryMinutes = signal.execution?.expiryMinutes ?? experiment.expiryMinutes;
            const management = signal.execution?.management ?? null;
            const target = signal.side === "BUY" ? signal.entry + targetR * signal.distance : signal.entry - targetR * signal.distance;
            active.push({ ...signal, target, targetR, trailActivationR, trailDistanceR, status: "pending",
                expires: timestamp + expiryMinutes * MINUTE, size, margin, initialRisk, quotePerEur,
                balanceAtOrder: balance, trailing: false, activeStop: signal.stop, management, stopMoves: 0 });
            maxConcurrent = Math.max(maxConcurrent, active.length);
            maxMarginUsagePct = Math.max(maxMarginUsagePct, 100 * (usedMargin + margin) / balance);
            maxEffectiveRiskPct = Math.max(maxEffectiveRiskPct, 100 * initialRisk / balance);
        }
    };

    const processBar = (symbol, bar) => {
        const item = active.find((candidate) => candidate.symbol === symbol);
        if (!item) return;
        const askHigh = stressedAsk(bar.ask.high, bar.bid.high);
        const askLow = stressedAsk(bar.ask.low, bar.bid.low);
        const askClose = stressedAsk(bar.ask.close, bar.bid.close);
        if (item.status === "pending") {
            const filled = item.side === "BUY" ? askHigh >= item.entry : bar.bid.low <= item.entry;
            if (!filled) return;
            const slippage = (item.symbol.includes("JPY") ? 0.01 : 0.0001) * Number(experiment.slippagePips ?? 0);
            item.requestedEntry = item.entry;
            item.entry = item.side === "BUY" ? item.entry + slippage : item.entry - slippage;
            item.distance = Math.abs(item.target - item.entry) / item.targetR;
            item.status = "position";
            item.opened = bar.t;
            item.maxHoldAt = bar.t + MAX_HOLD_MINUTES * MINUTE;
            item.best = item.entry;
        }
        const adverse = item.side === "BUY" ? bar.bid.low : askHigh;
        const favorable = item.side === "BUY" ? bar.bid.high : askLow;
        if (item.side === "BUY" ? adverse <= item.activeStop : adverse >= item.activeStop) {
            return close(item, bar.t + MINUTE, item.activeStop, item.trailing ? "trailingStop" : "stopLoss");
        }
        if (item.trailing) {
            item.best = item.side === "BUY" ? Math.max(item.best, favorable) : Math.min(item.best, favorable);
            const nextStop = item.side === "BUY" ? Math.max(item.activeStop, item.best - item.distance * item.trailDistanceR)
                : Math.min(item.activeStop, item.best + item.distance * item.trailDistanceR);
            const tightenedHit = item.side === "BUY" ? adverse <= nextStop : adverse >= nextStop;
            item.activeStop = nextStop;
            if (tightenedHit) return close(item, bar.t + MINUTE, nextStop, "trailingStop");
        }
        if (item.side === "BUY" ? favorable >= item.target : favorable <= item.target) {
            return close(item, bar.t + MINUTE, item.target, "takeProfit");
        }
        if (!item.trailing && item.trailActivationR !== null) {
            const liquidationClose = item.side === "BUY" ? bar.bid.close : askClose;
            const favorableAtMonitor = item.side === "BUY" ? liquidationClose - item.entry : item.entry - liquidationClose;
            if (favorableAtMonitor >= item.distance * item.trailActivationR) {
                item.trailing = true;
                item.best = liquidationClose;
                item.activeStop = item.side === "BUY" ? Math.max(item.activeStop, liquidationClose - item.distance * item.trailDistanceR)
                    : Math.min(item.activeStop, liquidationClose + item.distance * item.trailDistanceR);
            }
        }
        if (managePosition(item, bar, askClose)) return;
    };

    while (true) {
        const nextSignal = signalTimes[signalCursor] ?? Infinity;
        let nextBar = Infinity;
        for (const symbol of new Set(active.map(({ symbol }) => symbol))) {
            nextBar = Math.min(nextBar, data[symbol].m1[cursors[symbol]]?.t ?? Infinity);
        }
        const timestamp = Math.min(nextSignal, nextBar);
        if (!(timestamp < to)) break;
        for (const item of [...active]) {
            if (item.status === "pending" && item.expires <= timestamp) { reject("pendingExpired"); remove(item); }
            else if (item.status === "position" && item.maxHoldAt <= timestamp) closeAtMarket(item, timestamp, "timeout");
        }
        const date = new Date(timestamp);
        const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
        if ((!experiment.continuousTrading && minute === 22 * 60)
            || (date.getUTCDay() === 5 && date.getUTCHours() === 20 && date.getUTCMinutes() === 0)) {
            for (const item of [...active]) {
                if (item.status === "position") closeAtMarket(item, timestamp, date.getUTCDay() === 5 && date.getUTCHours() === 20 ? "weekendFlat" : "dailyFlat");
                else remove(item);
            }
        }
        if (nextSignal === timestamp) { placeSignals(timestamp); signalCursor += 1; }
        for (const symbol of SYMBOLS) {
            if (!active.some((item) => item.symbol === symbol)) continue;
            const rows = data[symbol].m1;
            if (rows[cursors[symbol]]?.t !== timestamp) continue;
            const bar = rows[cursors[symbol]++];
            processBar(symbol, bar);
            latest[symbol] = bar;
        }
    }
    for (const item of [...active]) {
        if (item.status === "position") closeAtMarket(item, to, "periodBoundary");
        else { reject("pendingAtPeriodBoundary"); remove(item); }
    }
    const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
    const grossProfit = trades.reduce((sum, trade) => sum + Math.max(0, trade.pnl), 0);
    const grossLoss = trades.reduce((sum, trade) => sum + Math.max(0, -trade.pnl), 0);
    if (Math.abs(balance - START_CAPITAL - totalPnl) > 1e-6) throw new Error("Balance reconciliation failed");
    if (maxMarginUsagePct > 90.0001) throw new Error(`Margin cap exceeded: ${maxMarginUsagePct}`);
    if (maxEffectiveRiskPct > 3.0001) throw new Error(`Risk cap exceeded: ${maxEffectiveRiskPct}`);
    const byKey = (key) => Object.fromEntries([...new Set(trades.map((trade) => Array.isArray(trade[key]) ? trade[key].join("+") : trade[key]))].sort().map((value) => {
        const rows = trades.filter((trade) => (Array.isArray(trade[key]) ? trade[key].join("+") : trade[key]) === value);
        return [value, { trades: rows.length, pnl: rows.reduce((sum, trade) => sum + trade.pnl, 0), wins: rows.filter((trade) => trade.pnl > 0).length }];
    }));
    const dayRows = [...dailyPnl.entries()].sort(([left], [right]) => left.localeCompare(right));
    let longestLosingDayStreak = 0;
    let losingDayStreak = 0;
    for (const [, pnl] of dayRows) {
        losingDayStreak = pnl < 0 ? losingDayStreak + 1 : 0;
        longestLosingDayStreak = Math.max(longestLosingDayStreak, losingDayStreak);
    }
    const monthly = {};
    for (const [day, pnl] of dayRows) {
        const month = day.slice(0, 7);
        monthly[month] = (monthly[month] ?? 0) + pnl;
    }
    const positiveDays = dayRows.filter(([, pnl]) => pnl > 0).length;
    const negativeDays = dayRows.filter(([, pnl]) => pnl < 0).length;
    return { slots, from: new Date(from).toISOString(), to: new Date(to).toISOString(), startCapital: START_CAPITAL,
        finalBalance: balance, returnPct: 100 * (balance / START_CAPITAL - 1), trades: trades.length,
        wins: trades.filter((trade) => trade.pnl > 0).length,
        winRate: trades.length ? 100 * trades.filter((trade) => trade.pnl > 0).length / trades.length : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
        maxDrawdownPct, maxMarginUsagePct, maxEffectiveRiskPct, maxConcurrent, rejections,
        activeDays: dayRows.length, positiveDays, negativeDays,
        positiveDayPct: dayRows.length ? 100 * positiveDays / dayRows.length : 0,
        longestLosingDayStreak, monthly,
        bySymbol: byKey("symbol"), bySessionCombination: byKey("sessions"), ...(includeTradeLog ? { tradeLog: trades } : {}) };
}

function rounded(value) {
    if (Array.isArray(value)) return value.map(rounded);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rounded(item)]));
    return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(6)) : value;
}

const args = parseArgs(process.argv.slice(2));
if (!args.datasets.length || !args.rules || (!args.report && !args.dayReport && !args.dynamicAdaptiveReport && !args.liveAuditReport)) {
    throw new Error("Usage: node lab/h1-wave-top5-portfolio.js --dataset DIR --rules FILE (--report FILE | --day YYYY-MM-DD --day-report FILE --candidate-file FILE)");
}
const ruleText = fs.readFileSync(args.rules, "utf8");
const ruleDocument = JSON.parse(ruleText);
const rules = ruleDocument.symbols ?? ruleDocument;
const data = {};
const audit = {};
for (const symbol of SYMBOLS) {
    data[symbol] = {};
    for (const timeframe of ["H1", "M15", "M5", "M1"]) {
        const loaded = loadMerged(args.datasets, symbol, timeframe, timeframe !== "M1");
        if (!loaded.rows.length) throw new Error(`No data for ${symbol} ${timeframe}`);
        data[symbol][timeframe.toLowerCase()] = loaded.rows;
        audit[`${symbol}_${timeframe}`] = loaded.audit;
    }
    if (!rules[symbol]) throw new Error(`No broker rules for ${symbol}`);
}
const datasetEnd = Math.min(...SYMBOLS.map((symbol) => data[symbol].m1.at(-1).t + MINUTE));

if (args.dynamicAdaptiveReport || args.liveAuditReport) {
    const dynamicScope = args.liveAuditReport ? "frozenBalanced" : args.dynamicScope ?? "all17";
    if (!["all17", "current8", "mapped8", "frozenBalanced"].includes(dynamicScope)) {
        throw new Error("--dynamic-scope must be all17, current8, mapped8 or frozenBalanced");
    }
    const dynamicSymbols = new Set(dynamicScope === "current8" || dynamicScope === "mapped8" || dynamicScope === "frozenBalanced"
        ? ["USDJPY", "GBPUSD", "AUDJPY", "EURUSD", "USDCHF", "AUDUSD", "EURJPY", "GBPCHF"] : SYMBOLS);
    const dynamicUniverse = dynamicScope !== "mapped8" && dynamicScope !== "frozenBalanced";
    const weights = { strength: -0.984903, riskAtr: -0.199351, spreadAtr: -3.289938,
        entryGapAtr: -0.74576, trend: 0.539907, priceEma: -0.432509, emaSlope: 0.316831,
        atrRegime: 0, efficiency: 0.170911, wick: 0.273558, previousBody: 0.651536 };
    const rating = (signal) => signalRankingScore(signal, { ranking: "linear", weights });
    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
    const coreExperiment = { ...DEFAULT_EXPERIMENT, signalMode: "combined", detector: { mode: "requireBoth" },
        bufferPips: 3, stopMode: "signal", stopBufferAtr: null, expiryMinutes: 45,
        targetR: 1.5, trailActivationR: 1, trailDistanceR: 0.35, dynamicUniverse };
    const addonExperiment = { ...DEFAULT_EXPERIMENT, signalMode: "wave", detector: { mode: "m15" },
        bufferPips: 2, stopMode: "pattern", stopBufferAtr: 0.1, dynamicUniverse };
    const coreCandidates = SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], coreExperiment))
        .filter((signal) => dynamicSymbols.has(signal.symbol)).filter((signal) => {
            const hour = new Date(signal.signalAt).getUTCHours();
            return hour <= 7 && signal.strength <= 0.75 && signal.trendScore >= 0;
        });
    const coreRaw = coreCandidates.filter((signal) => rating(signal) >= -0.833014);
    const addonRaw = SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], addonExperiment))
        .filter((signal) => dynamicSymbols.has(signal.symbol)).filter((signal) => {
            const hour = new Date(signal.signalAt).getUTCHours();
            return hour >= 8 && hour <= 20;
        });
    const marketStates = SYMBOLS.filter((symbol) => dynamicSymbols.has(symbol))
        .flatMap((symbol) => buildMarketStates(symbol, data[symbol]));
    const stateGroups = new Map();
    for (const state of marketStates) for (const session of state.sessions) {
        if ((dynamicScope === "mapped8" || dynamicScope === "frozenBalanced")
            && !SESSIONS[session].symbols.includes(state.symbol)) continue;
        const key = `${state.signalAt}:${session}`;
        if (!stateGroups.has(key)) stateGroups.set(key, []);
        stateGroups.get(key).push(state);
    }
    const stateWeightPresets = {
        balanced: { atr: 0.3, efficiency: 0.7, trend: 0.5, session: 0.4, spread: 8 },
        trend: { atr: 0.15, efficiency: 0.6, trend: 0.9, session: 0.25, spread: 8 },
        opportunity: { atr: 0.5, efficiency: 0.8, trend: 0.35, session: 0.6, spread: 6 },
        costAware: { atr: 0.25, efficiency: 0.6, trend: 0.5, session: 0.35, spread: 14 },
    };
    const pairRankCache = new Map();
    const pairRanks = (preset, topN) => {
        const cacheKey = `${preset}:${topN}`;
        if (pairRankCache.has(cacheKey)) return pairRankCache.get(cacheKey);
        const selected = new Map();
        const weight = stateWeightPresets[preset];
        for (const [key, rows] of stateGroups) {
            const session = key.slice(key.lastIndexOf(":") + 1);
            rows.sort((left, right) => {
                const score = (state) => weight.atr * clamp(state.atrRegime, 0, 1.8)
                    + weight.efficiency * state.efficiency + weight.trend * clamp(state.trendAbs, 0, 2)
                    + weight.session * clamp(state.sessionOpportunity[session] ?? 1, 0, 2)
                    - weight.spread * state.spreadAtr;
                return score(right) - score(left);
            });
            rows.slice(0, topN).forEach((state, index) => {
                const pairKey = `${state.signalAt}:${session}:${state.symbol}`;
                selected.set(pairKey, index + 1);
            });
        }
        pairRankCache.set(cacheKey, selected);
        return selected;
    };
    const pairRankFor = (signal, ranks) => {
        const values = signal.sessions.map((session) => ranks.get(`${signal.signalAt}:${session}:${signal.symbol}`))
            .filter(Number.isFinite);
        return values.length ? Math.min(...values) : null;
    };
    const qualityThresholds = (signals, probability, floor) => {
        const histories = new Map();
        const thresholds = new Map();
        const groups = new Map();
        for (const signal of signals) {
            if (!groups.has(signal.signalAt)) groups.set(signal.signalAt, []);
            groups.get(signal.signalAt).push(signal);
        }
        for (const [timestamp, rows] of [...groups.entries()].sort(([left], [right]) => left - right)) {
            for (const signal of rows) {
                const session = signal.sessions.join("+") || "off";
                const history = histories.get(session) ?? [];
                const adaptive = history.length >= 30 ? quantile(history.slice(-160), probability) : null;
                thresholds.set(`${timestamp}:${signal.symbol}:${signal.side}`, Math.max(floor, adaptive ?? floor));
            }
            for (const signal of rows) {
                const session = signal.sessions.join("+") || "off";
                if (!histories.has(session)) histories.set(session, []);
                histories.get(session).push(rating(signal));
            }
        }
        return thresholds;
    };
    const qualityCache = new Map();
    const thresholdsFor = (probability, floor) => {
        const key = `${probability}:${floor}`;
        if (!qualityCache.has(key)) qualityCache.set(key, qualityThresholds(addonRaw, probability, floor));
        return qualityCache.get(key);
    };
    const managementFor = (signal, config, source) => {
        if (!config.dynamicManagement) return null;
        if (config.managementSource && config.managementSource !== "both" && config.managementSource !== source) return null;
        const trending = signal.trendScore >= config.trendModeThreshold && signal.efficiency6 >= config.trendEfficiency;
        return { mode: "candleStep", stepTimeframe: trending ? "m15" : "m5",
            stepBars: trending ? config.trendStepBars : config.rangeStepBars,
            activationR: trending ? config.trendActivationR : config.rangeActivationR,
            breakEvenR: config.breakEvenR, bufferAtr: config.stepBufferAtr,
            reversalExit: config.reversalExit, reversalMaxR: config.reversalMaxR };
    };
    const dynamicSignal = (signal, config, source, threshold, pairRank) => {
        const pip = signal.symbol.includes("JPY") ? 0.01 : 0.0001;
        const spread = signal.marketAsk - signal.marketBid;
        const entryBuffer = config.dynamicExecution
            ? Math.max(pip * config.bufferPips, spread * config.entrySpreadMultiplier, signal.atr * config.entryAtrBuffer)
            : pip * 2;
        const entry = signal.side === "BUY" ? signal.signalHigh + entryBuffer : signal.signalLow - entryBuffer;
        const useSwing = config.dynamicExecution && signal.efficiency6 < config.swingEfficiency;
        const baseStop = signal.side === "BUY"
            ? useSwing ? signal.swingLow : signal.patternLow
            : useSwing ? signal.swingHigh : signal.patternHigh;
        const stopBuffer = config.dynamicExecution
            ? signal.atr * (config.stopAtrBase + config.stopAtrVolatility * Math.max(0, signal.atrRegime - 1))
                + spread * config.stopSpreadMultiplier
            : signal.atr * 0.1;
        const stop = signal.side === "BUY" ? baseStop - stopBuffer : baseStop + stopBuffer;
        const distance = signal.side === "BUY" ? entry - stop : stop - entry;
        if (!(distance > 0) || distance / signal.atr > config.maxRiskAtr) return null;
        const targetR = config.dynamicExecution
            ? clamp(config.targetBase + config.targetTrendGain * clamp(signal.trendScore, 0, 1.5)
                + config.targetEfficiencyGain * (signal.efficiency6 - 0.3)
                - config.targetVolatilityPenalty * Math.max(0, signal.atrRegime - 1.3),
            config.targetMin, config.targetMax)
            : 1.25;
        const expiryMinutes = config.dynamicExecution
            ? signal.atrRegime >= 1.35 ? 30 : signal.atrRegime <= 0.8 ? 75 : 60
            : 60;
        const score = rating(signal);
        const qualityMargin = clamp(score - threshold, 0, 1);
        const baseRisk = source === "core" ? 0.03 : config.addonRiskPct;
        const riskPct = config.dynamicExecution
            ? clamp(baseRisk * (0.75 + 0.5 * qualityMargin) * (signal.atrRegime > 1.5 ? 0.75 : 1), 0.003, source === "core" ? 0.03 : 0.015)
            : baseRisk;
        return { ...signal, source, pairRank, entry, stop, distance,
            target: signal.side === "BUY" ? entry + targetR * distance : entry - targetR * distance,
            riskAtr: distance / signal.atr,
            entryGapAtr: (signal.side === "BUY" ? entry - signal.marketAsk : signal.marketBid - entry) / signal.atr,
            adaptiveRankScore: score - threshold
                + (config.dynamicPairs ? 0.05 * (config.topN + 1 - pairRank) : 0),
            execution: { targetR, expiryMinutes, trailActivationR: null, trailDistanceR: 0.35,
                riskPct, management: managementFor(signal, config, source) } };
    };
    const buildPortfolioSignals = (config) => {
        const ranks = pairRanks(config.statePreset, config.topN);
        const addonThresholds = thresholdsFor(config.qualityQuantile, config.ratingFloor);
        const decorate = (rows, source) => rows.flatMap((signal) => {
            const pairRank = pairRankFor(signal, ranks);
            if (pairRank === null) return [];
            const threshold = source === "core" ? -0.833014
                : config.dynamicQuality ? addonThresholds.get(`${signal.signalAt}:${signal.symbol}:${signal.side}`) : config.ratingFloor;
            if (source === "addon" && (rating(signal) < threshold || signal.trendScore < config.minTrend
                || signal.strength > config.maxStrength || signal.efficiency6 < config.minEfficiency)) return [];
            const decorated = dynamicSignal(signal, config, source, threshold, pairRank);
            return decorated ? [decorated] : [];
        });
        const rows = [...decorate(coreRaw, "core"), ...decorate(addonRaw.filter((signal) => {
            const hour = new Date(signal.signalAt).getUTCHours();
            return hour <= config.addonLastHour;
        }), "addon")].sort((left, right) => left.signalAt - right.signalAt
            || right.adaptiveRankScore - left.adaptiveRankScore || left.symbol.localeCompare(right.symbol));
        const seen = new Set();
        return rows.filter((signal) => {
            const key = `${signal.signalAt}:${signal.symbol}:${signal.side}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };
    const periods = {
        train: [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-06-01T00:00:00Z")],
        validation: [Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z")],
        test: [Date.parse("2026-09-01T00:00:00Z"), Date.parse("2026-11-01T00:00:00Z")],
        full: [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-11-01T00:00:00Z")],
        forward: [Date.parse("2026-11-01T00:00:00Z"), datasetEnd],
    };
    const marketDays = Object.fromEntries(Object.entries(periods).map(([name, [from, to]]) => [name,
        new Set(data.EURUSD.m1.filter(({ t }) => t >= from && t < to).map(({ timestamp }) => timestamp.slice(0, 10))).size]));
    const portfolioExperiment = { ...DEFAULT_EXPERIMENT, continuousTrading: true, ranking: "adaptive" };
    const view = (result, period) => ({ returnPct: result.returnPct, trades: result.trades,
        tradesPerMarketDay: marketDays[period] ? result.trades / marketDays[period] : 0,
        activeDays: result.activeDays, activeDayCoveragePct: marketDays[period] ? 100 * result.activeDays / marketDays[period] : 0,
        winRate: result.winRate, profitFactor: result.profitFactor, maxDrawdownPct: result.maxDrawdownPct,
        positiveDayPct: result.positiveDayPct, longestLosingDayStreak: result.longestLosingDayStreak,
        monthly: result.monthly, bySymbol: result.bySymbol, bySessionCombination: result.bySessionCombination,
        rejections: result.rejections });
    const evaluate = (signals, period, changes = {}) => view(simulate({ signals, data, rules, slots: 1,
        from: periods[period][0], to: periods[period][1], experiment: { ...portfolioExperiment, ...changes },
        includeTradeLog: false }), period);
    let randomState = 0xad4a2026;
    const random = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 2 ** 32; };
    const pick = (values) => values[Math.floor(random() * values.length)];
    if (dynamicScope === "frozenBalanced") {
        const frozenCore = coreRaw;
        const frozenAddon = addonRaw.filter((signal) => {
            const hour = new Date(signal.signalAt).getUTCHours();
            return hour <= 16 && rating(signal) >= -0.7 && signal.trendScore >= 0.25
                && signal.strength <= 1;
        });
        const fixedSignal = (signal, source, config, pairRank) => {
            const score = rating(signal);
            const threshold = source === "core" ? -0.833014 : -0.7;
            if (config.dynamicExecution) return dynamicSignal(signal, config, source, threshold, pairRank);
            const quality = clamp(score - threshold, 0, 1);
            const riskPct = source === "core" ? 0.03 : 0.0075 * (0.75 + 0.5 * quality);
            const baseTargetR = source === "core" ? 1.5 : 1.25;
            const expiryMinutes = source === "core" ? 45 : 60;
            const management = managementFor(signal, config, source);
            const targetR = management && config.managedTargetR ? config.managedTargetR : baseTargetR;
            return { ...signal, source, pairRank,
                adaptiveRankScore: score - threshold
                    + (config.dynamicPairs ? 0.05 * (config.topN + 1 - pairRank) : 0),
                execution: { targetR, expiryMinutes,
                    trailActivationR: config.dynamicManagement ? null : source === "core" ? 1 : null,
                    trailDistanceR: source === "core" ? 0.35 : 0.5, riskPct, management } };
        };
        const frozenSignals = (config) => {
            const ranks = config.dynamicPairs ? pairRanks(config.statePreset, config.topN) : null;
            const decorate = (rows, source) => rows.flatMap((signal) => {
                const pairRank = ranks ? pairRankFor(signal, ranks) : signal.activeRank + 1;
                if (pairRank === null) return [];
                const decorated = fixedSignal(signal, source, config, pairRank);
                return decorated ? [decorated] : [];
            });
            const rows = [...decorate(frozenCore, "core"), ...decorate(frozenAddon, "addon")]
                .sort((left, right) => left.signalAt - right.signalAt
                    || right.adaptiveRankScore - left.adaptiveRankScore || left.activeRank - right.activeRank);
            const unique = new Set();
            return rows.filter((signal) => {
                const key = `${signal.signalAt}:${signal.symbol}:${signal.side}`;
                if (unique.has(key)) return false;
                unique.add(key);
                return true;
            });
        };
        if (args.liveAuditReport) {
            const from = Date.parse(args.liveAuditFrom);
            const requestedTo = Date.parse(args.liveAuditTo);
            const to = Math.min(requestedTo, datasetEnd);
            if (![from, requestedTo].every(Number.isFinite) || !(to > from)) {
                throw new Error("--live-audit-report requires valid --live-audit-from and --live-audit-to timestamps");
            }
            const liveConfig = {
                dynamicPairs: false,
                dynamicExecution: false,
                dynamicManagement: true,
                managementSource: "core",
                managedTargetR: 2.5,
                trendModeThreshold: 1,
                trendEfficiency: 0.2,
                trendStepBars: 1,
                rangeStepBars: 1,
                trendActivationR: 1,
                rangeActivationR: 1,
                breakEvenR: 1,
                stepBufferAtr: 0.15,
                reversalExit: false,
                reversalMaxR: 0.5,
            };
            const signals = frozenCore.map((signal) => fixedSignal(signal, "core", liveConfig, signal.activeRank + 1))
                .sort((left, right) => left.signalAt - right.signalAt
                    || right.adaptiveRankScore - left.adaptiveRankScore || left.activeRank - right.activeRank);
            const result = simulate({
                signals,
                data,
                rules,
                slots: 1,
                from,
                to,
                experiment: { ...DEFAULT_EXPERIMENT, continuousTrading: true, ranking: "adaptive" },
                includeTradeLog: true,
            });
            const candidates = coreCandidates.filter(({ signalAt }) => signalAt >= from && signalAt < to)
                .map((signal) => ({
                    symbol: signal.symbol,
                    side: signal.side,
                    signalAt: new Date(signal.signalAt).toISOString(),
                    rating: rating(signal),
                    ratingAccepted: rating(signal) >= -0.833014,
                    activeRank: signal.activeRank,
                    entry: signal.entry,
                    stop: signal.stop,
                    strength: signal.strength,
                    trendScore: signal.trendScore,
                    efficiency6: signal.efficiency6,
                    sessions: signal.sessions,
                }));
            const output = rounded({
                protocol: "current-live-strategy-reconciliation-v1",
                generatedAt: new Date().toISOString(),
                window: {
                    from: new Date(from).toISOString(),
                    requestedTo: new Date(requestedTo).toISOString(),
                    to: new Date(to).toISOString(),
                    dataCompleteToRequestedCutoff: to === requestedTo,
                },
                data: { directories: args.datasets, end: new Date(datasetEnd).toISOString(), audit },
                strategy: {
                    signal: "strict M5+M15 agreement plus H1 color reversal and EMA20/EMA50 direction",
                    admission: { lastSignalHourUtc: 7, maximumH1BodyAtr: 0.75, minimumRating: -0.833014 },
                    order: { bufferPips: 3, expiryMinutes: 45, targetR: 2.5 },
                    management: liveConfig,
                },
                constraints: { startCapital: START_CAPITAL, riskPct: 100 * RISK_PCT, marginUsagePct: 100 * MARGIN_USAGE, maxPositions: 1 },
                candidates,
                result,
                caveats: [
                    "The open position is marked to the final recorded bid/ask at the period boundary.",
                    "M1 OHLC cannot reveal tick order; adverse stop ordering is conservative inside an ambiguous minute.",
                    "The replay uses requested pending-entry prices; broker gap slippage is compared separately.",
                ],
            });
            fs.mkdirSync(path.dirname(args.liveAuditReport), { recursive: true });
            fs.writeFileSync(args.liveAuditReport, `${JSON.stringify(output, null, 2)}\n`);
            console.log(JSON.stringify({ liveAuditReport: args.liveAuditReport, window: output.window,
                candidates: output.candidates, result: output.result }, null, 2));
            process.exit(0);
        }
        const staticConfig = {
            dynamicPairs: false, statePreset: "balanced", topN: 5,
            dynamicExecution: false, addonRiskPct: 0.0075,
            dynamicManagement: false,
        };
        const frozenConfigurations = [staticConfig];
        const frozenSeen = new Set([JSON.stringify(staticConfig)]);
        while (frozenConfigurations.length < 241) {
            const config = {
                dynamicPairs: pick([true, true, false]), statePreset: pick(Object.keys(stateWeightPresets)),
                topN: pick([3, 4, 5]), dynamicExecution: pick([true, true, false]), addonRiskPct: 0.0075,
                bufferPips: pick([1, 2]), entrySpreadMultiplier: pick([1, 1.5, 2]),
                entryAtrBuffer: pick([0, 0.02, 0.04]), swingEfficiency: pick([0.15, 0.25, 0.35]),
                stopAtrBase: pick([0.05, 0.1, 0.15]), stopAtrVolatility: pick([0, 0.05, 0.1]),
                stopSpreadMultiplier: pick([0, 1]), maxRiskAtr: pick([1.5, 2, 2.5, 3]),
                targetBase: pick([1, 1.25, 1.5]), targetTrendGain: pick([0.2, 0.4, 0.6]),
                targetEfficiencyGain: pick([0, 0.25, 0.5]), targetVolatilityPenalty: pick([0, 0.15, 0.3]),
                targetMin: pick([0.75, 0.9, 1]), targetMax: pick([1.5, 1.75, 2]),
                dynamicManagement: pick([true, true, false]), managementSource: pick(["both", "core", "addon"]),
                managedTargetR: pick([1.25, 1.5, 2, 2.5, 3]), trendModeThreshold: pick([0.5, 0.75, 1]),
                trendEfficiency: pick([0.2, 0.35]), trendStepBars: pick([1, 2]), rangeStepBars: pick([1, 2, 3]),
                trendActivationR: pick([0.75, 1, 1.25]), rangeActivationR: pick([0.5, 0.75, 1]),
                breakEvenR: pick([0.5, 0.75, 1, null]), stepBufferAtr: pick([0.05, 0.1, 0.15]),
                reversalExit: pick([true, false]), reversalMaxR: pick([0, 0.5, 1]),
            };
            if (!config.dynamicPairs && !config.dynamicExecution && !config.dynamicManagement) continue;
            const key = JSON.stringify(config);
            if (frozenSeen.has(key)) continue;
            frozenSeen.add(key);
            frozenConfigurations.push(config);
        }
        const frozenSearch = [];
        for (const config of frozenConfigurations) {
            const signals = frozenSignals(config);
            const train = evaluate(signals, "train");
            const validation = evaluate(signals, "validation");
            const frequency = Math.min(train.tradesPerMarketDay, validation.tradesPerMarketDay);
            const coverage = Math.min(train.activeDayCoveragePct, validation.activeDayCoveragePct);
            const accepted = frequency >= 1 && coverage >= 60 && train.returnPct > 0 && validation.returnPct > 0
                && train.profitFactor > 1 && validation.profitFactor > 1
                && train.maxDrawdownPct <= 25 && validation.maxDrawdownPct <= 25;
            const score = 1.5 * Math.min(train.returnPct, validation.returnPct)
                + 30 * (Math.min(train.profitFactor ?? 0, validation.profitFactor ?? 0) - 1)
                + 20 * Math.min(1.5, frequency) + 0.35 * coverage
                + 0.25 * (Math.min(train.positiveDayPct, validation.positiveDayPct) - 50)
                - 0.1 * (train.maxDrawdownPct + validation.maxDrawdownPct);
            frozenSearch.push({ config, signalCount: signals.length, train, validation, accepted, score });
            if (frozenSearch.length % 40 === 0) console.error(JSON.stringify({ frozenDynamicProgress: frozenSearch.length,
                accepted: frozenSearch.filter((row) => row.accepted).length }));
        }
        frozenSearch.sort((left, right) => right.score - left.score);
        const acceptedDynamic = frozenSearch.filter((row) => row.accepted
            && (row.config.dynamicPairs || row.config.dynamicExecution || row.config.dynamicManagement));
        const selectedDevelopment = acceptedDynamic.length ? acceptedDynamic : frozenSearch.slice(0, 1);
        const diagnosticPool = [...new Set([frozenSearch[0], frozenSearch.find((row) => row.config === staticConfig),
            ...selectedDevelopment.slice(0, 28)].filter(Boolean))];
        const frozenDiagnostics = diagnosticPool.map((row) => {
            const signals = frozenSignals(row.config);
            return { ...row, test: evaluate(signals, "test"), full: evaluate(signals, "full"),
                forward: evaluate(signals, "forward") };
        });
        const selected = frozenDiagnostics.find((row) => row.config === selectedDevelopment[0].config)
            ?? frozenDiagnostics[0];
        const variantConfigs = {
            frozenStatic: staticConfig,
            dynamicPairSelectionOnly: { ...selected.config, dynamicPairs: true, dynamicExecution: false,
                dynamicManagement: false },
            dynamicExecutionOnly: { ...selected.config, dynamicPairs: false, dynamicExecution: true,
                dynamicManagement: false },
            dynamicManagementOnly: { ...selected.config, dynamicPairs: false, dynamicExecution: false,
                dynamicManagement: true },
            selectedDynamicCombination: selected.config,
        };
        const variants = Object.fromEntries(Object.entries(variantConfigs).map(([name, config]) => {
            const signals = frozenSignals(config);
            return [name, Object.fromEntries(Object.keys(periods).map((period) => [period, evaluate(signals, period)]))];
        }));
        const selectedSignals = frozenSignals(selected.config);
        const stress = Object.fromEntries([
            ["spread1p25", { spreadMultiplier: 1.25 }], ["spread1p5", { spreadMultiplier: 1.5 }],
            ["slippage0p5", { slippagePips: 0.5 }],
            ["spread1p25Slippage0p5", { spreadMultiplier: 1.25, slippagePips: 0.5 }],
        ].map(([name, changes]) => [name, Object.fromEntries(Object.keys(periods).map((period) =>
            [period, evaluate(selectedSignals, period, changes)]))]));
        const output = rounded({ protocol: "frozen-balanced-dynamic-layer-isolation-v2",
            generatedAt: new Date().toISOString(), seed: "0xad4a2026", dataEnd: new Date(datasetEnd).toISOString(), dynamicScope,
            objective: "freeze the proven signal architecture and isolate causal pair selection, execution and management adaptation",
            guardrails: { selection: "January-August only", diagnostic: "September-October excluded from selection but previously inspected",
                forward: "November 1 to dataset end; too short for acceptance", causal: "closed candles only",
                startCapital: START_CAPITAL, maxRiskPct: 100 * RISK_PCT, marginUsagePct: 100 * MARGIN_USAGE,
                maxPositions: 1, signalAdmissionFrozen: true },
            frozenSignalRules: { core: "strict M5+M15 agreement plus H1 pattern, 00:00-07:59 UTC",
                addon: "M15 wave, rating >= -0.7, trend >= 0.25, strength <= 1, 08:00-16:59 UTC" },
            data: { directories: args.datasets, audit }, marketDays,
            counts: { marketStates: marketStates.length, frozenCore: frozenCore.length, frozenAddon: frozenAddon.length,
                searched: frozenSearch.length, developmentPasses: frozenSearch.filter(({ accepted }) => accepted).length },
            selected, variants, stress, diagnostics: frozenDiagnostics, topDevelopment: frozenSearch.slice(0, 30) });
        fs.mkdirSync(path.dirname(args.dynamicAdaptiveReport), { recursive: true });
        fs.writeFileSync(args.dynamicAdaptiveReport, `${JSON.stringify(output, null, 2)}\n`);
        console.log(JSON.stringify({ dynamicAdaptiveReport: args.dynamicAdaptiveReport, counts: output.counts,
            selected: output.selected, variants: output.variants, stress: output.stress }, null, 2));
        process.exit(0);
    }
    const configurations = [];
    const seen = new Set();
    while (configurations.length < 320) {
        const config = {
            statePreset: pick(Object.keys(stateWeightPresets)), topN: pick(dynamicScope === "mapped8" ? [3, 5]
                : dynamicScope === "current8" ? [3, 5, 8] : [3, 5, 7]),
            dynamicQuality: pick([true, true, false]), qualityQuantile: pick([0.35, 0.5, 0.65]),
            ratingFloor: pick([-0.9, -0.8, -0.7, -0.6]), minTrend: pick([0, 0.1, 0.25, 0.5]),
            maxStrength: pick([0.5, 0.75, 1]), minEfficiency: pick([0, 0.1, 0.2]),
            addonLastHour: pick(dynamicScope === "current8" || dynamicScope === "mapped8" ? [16] : [16, 20]), addonRiskPct: pick([0.005, 0.0075, 0.01]),
            dynamicExecution: pick([true, true, false]), bufferPips: pick([1, 2]),
            entrySpreadMultiplier: pick([1, 1.5, 2]), entryAtrBuffer: pick([0, 0.02, 0.04]),
            swingEfficiency: pick([0.15, 0.25, 0.35]), stopAtrBase: pick([0.05, 0.1, 0.15]),
            stopAtrVolatility: pick([0, 0.05, 0.1]), stopSpreadMultiplier: pick([0, 1]),
            maxRiskAtr: pick([1.5, 2, 2.5, 3]), targetBase: pick([1, 1.25, 1.5]),
            targetTrendGain: pick([0.2, 0.4, 0.6]), targetEfficiencyGain: pick([0, 0.25, 0.5]),
            targetVolatilityPenalty: pick([0, 0.15, 0.3]), targetMin: 0.8, targetMax: pick([1.5, 1.75, 2]),
            dynamicManagement: pick([true, true, false]), trendModeThreshold: pick([0.5, 0.75, 1]),
            trendEfficiency: pick([0.2, 0.35]), trendStepBars: pick([1, 2]), rangeStepBars: pick([1, 2, 3]),
            trendActivationR: pick([0.75, 1]), rangeActivationR: pick([0.5, 0.75]),
            breakEvenR: pick([0.5, 0.75, 1]), stepBufferAtr: pick([0.05, 0.1, 0.15]),
            reversalExit: pick([true, false]), reversalMaxR: pick([0, 0.5, 1]),
        };
        const key = JSON.stringify(config);
        if (seen.has(key)) continue;
        seen.add(key);
        configurations.push(config);
    }
    const search = [];
    for (const config of configurations) {
        const signals = buildPortfolioSignals(config);
        const train = evaluate(signals, "train");
        const validation = evaluate(signals, "validation");
        const frequency = Math.min(train.tradesPerMarketDay, validation.tradesPerMarketDay);
        const coverage = Math.min(train.activeDayCoveragePct, validation.activeDayCoveragePct);
        const accepted = frequency >= 1 && coverage >= 60 && train.returnPct > 0 && validation.returnPct > 0
            && train.profitFactor > 1 && validation.profitFactor > 1
            && train.positiveDayPct >= 50 && validation.positiveDayPct >= 50
            && train.maxDrawdownPct <= 25 && validation.maxDrawdownPct <= 25;
        const score = 1.5 * Math.min(train.returnPct, validation.returnPct)
            + 30 * (Math.min(train.profitFactor ?? 0, validation.profitFactor ?? 0) - 1)
            + 20 * Math.min(1.5, frequency) + 0.35 * coverage
            + 0.25 * (Math.min(train.positiveDayPct, validation.positiveDayPct) - 50)
            - 0.1 * (train.maxDrawdownPct + validation.maxDrawdownPct);
        search.push({ config, signalCount: signals.length, train, validation, accepted, score });
        if (search.length % 40 === 0) console.error(JSON.stringify({ dynamicAdaptiveProgress: search.length,
            accepted: search.filter((row) => row.accepted).length }));
    }
    search.sort((left, right) => right.score - left.score);
    const developmentPasses = search.filter(({ accepted }) => accepted);
    const diagnostics = (developmentPasses.length ? developmentPasses : search).slice(0, 20).map((row) => {
        const signals = buildPortfolioSignals(row.config);
        return { ...row, test: evaluate(signals, "test"), full: evaluate(signals, "full"),
            forward: evaluate(signals, "forward") };
    });
    const winner = diagnostics[0];
    const ablationConfigs = {
        fullDynamic: winner.config,
        noManagement: { ...winner.config, dynamicManagement: false },
        staticExecution: { ...winner.config, dynamicExecution: false },
        staticQuality: { ...winner.config, dynamicQuality: false },
        allPairs: { ...winner.config, topN: 17 },
        signalOnly: { ...winner.config, dynamicManagement: false, dynamicExecution: false,
            dynamicQuality: false, topN: 17 },
    };
    const ablations = Object.fromEntries(Object.entries(ablationConfigs).map(([name, config]) => {
        const signals = buildPortfolioSignals(config);
        return [name, Object.fromEntries(Object.keys(periods).map((period) => [period, evaluate(signals, period)]))];
    }));
    const winnerSignals = buildPortfolioSignals(winner.config);
    const stress = Object.fromEntries([
        ["spread1p25", { spreadMultiplier: 1.25 }], ["spread1p5", { spreadMultiplier: 1.5 }],
        ["slippage0p5", { slippagePips: 0.5 }],
        ["spread1p25Slippage0p5", { spreadMultiplier: 1.25, slippagePips: 0.5 }],
    ].map(([name, changes]) => [name, Object.fromEntries(Object.keys(periods).map((period) =>
        [period, evaluate(winnerSignals, period, changes)]))]));
    const output = rounded({ protocol: "fully-causal-dynamic-pair-signal-execution-management-search-v1",
        generatedAt: new Date().toISOString(), seed: "0xad4a2026", dataEnd: new Date(datasetEnd).toISOString(), dynamicScope,
        objective: "dynamically select session pairs, signals, entry/SL/TP and closed-candle trade management",
        guardrails: { selection: "January-August only", diagnostic: "September-October excluded from selection but previously inspected",
            forward: "November 1 to dataset end; too short for acceptance", causal: "closed candles and prior rolling histories only",
            startCapital: START_CAPITAL, maxRiskPct: 100 * RISK_PCT, marginUsagePct: 100 * MARGIN_USAGE,
            maxPositions: 1, dynamicTopPairsPerSession: true },
        data: { directories: args.datasets, audit }, marketDays,
        counts: { marketStates: marketStates.length, coreRaw: coreRaw.length, addonRaw: addonRaw.length,
            searched: search.length, developmentPasses: developmentPasses.length },
        winner, ablations, stress, diagnostics, topDevelopment: search.slice(0, 30) });
    fs.mkdirSync(path.dirname(args.dynamicAdaptiveReport), { recursive: true });
    fs.writeFileSync(args.dynamicAdaptiveReport, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ dynamicAdaptiveReport: args.dynamicAdaptiveReport, counts: output.counts,
        winner: output.winner, ablations: output.ablations, stress: output.stress }, null, 2));
    process.exit(0);
}

if (args.dayReport) {
    if (!args.day || !/^\d{4}-\d{2}-\d{2}$/.test(args.day) || !args.candidateFile) {
        throw new Error("--day-report requires --day YYYY-MM-DD and --candidate-file FILE");
    }
    const source = JSON.parse(fs.readFileSync(args.candidateFile, "utf8"));
    const experiment = { ...DEFAULT_EXPERIMENT, ...(source.experiment ?? source),
        detector: { ...((source.experiment ?? source).detector ?? {}) } };
    const from = Date.parse(`${args.day}T00:00:00Z`);
    const to = Math.min(from + 24 * HOUR, datasetEnd);
    if (!(to > from)) throw new Error(`Dataset ends before ${args.day}`);
    const daySignals = SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], experiment))
        .filter(({ signalAt }) => signalAt >= from && signalAt < to)
        .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank);
    const eligibleSignals = daySignals.filter((signal) => passesSignalFilters(signal, experiment));
    const result = simulate({ signals: daySignals, data, rules, slots: 1, from, to, experiment, includeTradeLog: true });
    const output = rounded({
        protocol: "current-live-strategy-single-day-replay-v1",
        generatedAt: new Date().toISOString(),
        day: args.day,
        window: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), completeUtcDay: to === from + 24 * HOUR },
        data: { directories: args.datasets, end: new Date(datasetEnd).toISOString(), audit },
        brokerRules: { file: args.rules, sha256: crypto.createHash("sha256").update(ruleText).digest("hex") },
        strategy: experiment,
        constraints: { startCapital: START_CAPITAL, riskPct: 100 * RISK_PCT, marginUsagePct: 100 * MARGIN_USAGE, maxPositions: 1 },
        counts: { combinedSignalsBeforeFilters: daySignals.length, eligibleSignals: eligibleSignals.length },
        candidates: daySignals.map((signal) => ({ ...signal, passesFilters: passesSignalFilters(signal, experiment),
            signalAt: new Date(signal.signalAt).toISOString() })),
        result,
        caveats: [
            "Replay uses recorded bid/ask M1 candles and conservative stop-before-target ordering inside an ambiguous minute.",
            "The final open position, if any, is marked to the latest recorded quote and labeled periodBoundary.",
            "This is a frozen-strategy replay; no parameter was selected using this day.",
        ],
    });
    fs.mkdirSync(path.dirname(args.dayReport), { recursive: true });
    fs.writeFileSync(args.dayReport, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ dayReport: args.dayReport, window: output.window, counts: output.counts,
        result: { finalBalance: output.result.finalBalance, returnPct: output.result.returnPct, trades: output.result.trades,
            wins: output.result.wins, winRate: output.result.winRate, profitFactor: output.result.profitFactor,
            maxDrawdownPct: output.result.maxDrawdownPct, rejections: output.result.rejections } }, null, 2));
    process.exit(0);
}

const signals = SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol]))
    .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank);
const periods = {
    train: [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-06-01T00:00:00Z")],
    validation: [Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z")],
    test: [Date.parse("2026-09-01T00:00:00Z"), datasetEnd],
    outOfSample: [Date.parse("2026-06-01T00:00:00Z"), datasetEnd],
    full: [Date.parse("2026-01-01T00:00:00Z"), datasetEnd],
    screenshotWindow: [Date.parse("2026-10-26T00:00:00Z"), datasetEnd],
};
const results = {};
for (const [name, [from, to]] of Object.entries(periods)) results[name] = [1, 2].map((slots) => simulate({ signals, data, rules, slots, from, to }));
const report = rounded({
    protocol: "current-live-h1-wave-pending-portfolio-v2", generatedAt: new Date().toISOString(),
    data: { directories: args.datasets, end: new Date(datasetEnd).toISOString(), audit },
    brokerRules: { file: args.rules, sha256: crypto.createHash("sha256").update(ruleText).digest("hex") },
    strategy: { universe: SESSIONS,
        signal: "closed H1 red/green reversal aligned with current M5/M15 detectWave; conflicting lower-timeframe directions rejected",
        entry: "STOP beyond current H1 extreme by 2 pips; 60-minute expiry", stop: "opposite current H1 extreme plus 2-pip buffer",
        targetR: TARGET_R, trailing: { monitor: "M1 close", activationR: TRAIL_ACTIVATION_R, distanceR: TRAIL_DISTANCE_R },
        riskPct: 100 * RISK_PCT, marginUsagePct: 100 * MARGIN_USAGE, maxHoldMinutes: MAX_HOLD_MINUTES,
        ambiguity: "bid/ask execution; stop before target inside an ambiguous M1 candle" },
    counts: { signals: signals.length }, results,
    caveats: [
        "M1 OHLC does not reveal tick order; ambiguous stop/target/trailing paths are resolved conservatively.",
        "A pending STOP fill is modeled at its requested level; gap slippage and broker fees beyond the recorded spread are unavailable.",
        "Each period starts independently with EUR 1000, so period balances are directly comparable but do not chain.",
    ],
});
fs.mkdirSync(path.dirname(args.report), { recursive: true });
fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: args.report, dataEnd: report.data.end, signals: report.counts.signals,
    results: Object.fromEntries(Object.entries(results).map(([name, rows]) => [name, rows.map(({ slots, finalBalance, returnPct, trades, winRate, profitFactor, maxDrawdownPct }) => ({ slots, finalBalance, returnPct, trades, winRate, profitFactor, maxDrawdownPct }))])) }, null, 2));

if (args.researchReport) {
    const signalCache = new Map();
    const completeExperiment = (changes = {}) => ({ ...DEFAULT_EXPERIMENT, ...changes, detector: { ...DEFAULT_EXPERIMENT.detector, ...(changes.detector ?? {}) } });
    const signalKey = (experiment) => JSON.stringify({
        signalMode: experiment.signalMode,
        detector: experiment.detector,
        bufferPips: experiment.bufferPips,
        stopMode: experiment.stopMode,
        stopBufferAtr: experiment.stopBufferAtr,
    });
    const getSignals = (experiment) => {
        const key = signalKey(experiment);
        if (!signalCache.has(key)) {
            const rows = SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], experiment))
                .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank);
            signalCache.set(key, rows);
        }
        return signalCache.get(key);
    };
    const metricView = ({ slots, finalBalance, returnPct, trades, winRate, profitFactor, maxDrawdownPct, maxMarginUsagePct, maxEffectiveRiskPct,
        activeDays, positiveDays, negativeDays, positiveDayPct, longestLosingDayStreak, monthly }) =>
        ({ slots, finalBalance, returnPct, trades, winRate, profitFactor, maxDrawdownPct, maxMarginUsagePct, maxEffectiveRiskPct,
            activeDays, positiveDays, negativeDays, positiveDayPct, longestLosingDayStreak, monthly });
    const evaluate = (experiment, periodName, slots = 1) => metricView(simulate({
        signals: getSignals(experiment), data, rules, slots,
        from: periods[periodName][0], to: periods[periodName][1], experiment, includeTradeLog: false,
    }));
    const developmentScore = (row) => Math.min(row.train.returnPct, row.validation.returnPct) + 0.05 * (row.train.returnPct + row.validation.returnPct);

    const layerAudit = {};
    for (const signalMode of ["wave", "pattern", "combined"]) {
        const experiment = completeExperiment({ signalMode });
        const rows = getSignals(experiment);
        layerAudit[signalMode] = {
            rawSignals: rows.length,
            periodSignals: Object.fromEntries(["train", "validation", "test"].map((name) => [name,
                rows.filter(({ signalAt }) => signalAt >= periods[name][0] && signalAt < periods[name][1]).length])),
            results: Object.fromEntries(["train", "validation", "test"].map((name) => [name, evaluate(experiment, name)])),
        };
    }

    const rankingAudit = [];
    for (const ranking of ["bodyAtr", "sessionOrder", "tightStop", "lowSpread", "nearEntry", "farEntry", "composite"]) {
        const experiment = completeExperiment({ ranking });
        rankingAudit.push({ ranking,
            train: evaluate(experiment, "train"), validation: evaluate(experiment, "validation"), test: evaluate(experiment, "test") });
    }

    const detectors = [
        { label: "current", detector: {} },
        { label: "requireBoth", detector: { mode: "requireBoth" } },
        { label: "m5Only", detector: { mode: "m5" } },
        { label: "m15Only", detector: { mode: "m15" } },
        { label: "fresh6_2", detector: { m5KeepBars: 6, m15KeepBars: 2 } },
        { label: "fresh3_1", detector: { m5KeepBars: 3, m15KeepBars: 1 } },
        { label: "mixed12_2", detector: { m5KeepBars: 12, m15KeepBars: 2 } },
        { label: "mixed6_4", detector: { m5KeepBars: 6, m15KeepBars: 4 } },
    ];
    const executions = [
        { label: "current" },
        { label: "fixed1R", targetR: 1, trailActivationR: null },
        { label: "fixed1p5R", targetR: 1.5, trailActivationR: null },
        { label: "fixed2R", targetR: 2, trailActivationR: null },
        { label: "trail1_0p5", trailActivationR: 1, trailDistanceR: 0.5 },
        { label: "trail1_0p35", trailActivationR: 1, trailDistanceR: 0.35 },
        { label: "expiry30", expiryMinutes: 30 },
        { label: "expiry120", expiryMinutes: 120 },
        { label: "buffer1", bufferPips: 1 },
        { label: "buffer3", bufferPips: 3 },
    ];
    const search = [];
    for (const detector of detectors) {
        for (const execution of executions) {
            const experiment = completeExperiment({ ...execution, detector: detector.detector });
            delete experiment.label;
            search.push({ detector: detector.label, execution: execution.label, experiment,
                train: evaluate(experiment, "train"), validation: evaluate(experiment, "validation") });
        }
    }
    search.sort((left, right) => developmentScore(right) - developmentScore(left));
    for (const row of search.slice(0, 10)) row.test = evaluate(row.experiment, "test");

    const developmentWinner = search[0];
    const optimizedRanking = [];
    for (const ranking of ["bodyAtr", "sessionOrder", "tightStop", "lowSpread", "nearEntry", "farEntry", "composite"]) {
        const experiment = completeExperiment({ ...developmentWinner.experiment, ranking });
        optimizedRanking.push({ ranking, experiment, train: evaluate(experiment, "train"), validation: evaluate(experiment, "validation") });
    }
    optimizedRanking.sort((left, right) => developmentScore(right) - developmentScore(left));
    const finalExperiment = optimizedRanking[0].experiment;
    const finalEvaluation = Object.fromEntries(["train", "validation", "test", "full"].map((name) => [name,
        [1, 2].map((slots) => evaluate(finalExperiment, name, slots))]));

    const research = rounded({
        protocol: "h1-wave-three-layer-audit-and-development-search-v1",
        generatedAt: new Date().toISOString(),
        dataEnd: new Date(datasetEnd).toISOString(),
        methodology: {
            layer1: "wave-only trade comparator using the M5/M15 direction",
            layer2: "H1 color-flip-only comparator and the actual wave+pattern intersection",
            layer3: "causal simultaneous-candidate ranking comparison",
            selection: "detector/exit and ranking selected only from January-August development; September-October is an already-inspected diagnostic, not a fresh holdout",
        },
        layerAudit,
        rankingAudit,
        optimization: {
            searched: search.length,
            top10: search.slice(0, 10),
            developmentWinner,
            rankingSearch: optimizedRanking,
            finalExperiment,
            finalEvaluation,
        },
    });
    fs.mkdirSync(path.dirname(args.researchReport), { recursive: true });
    fs.writeFileSync(args.researchReport, `${JSON.stringify(research, null, 2)}\n`);
    console.log(JSON.stringify({ researchReport: args.researchReport, layerAudit: Object.fromEntries(Object.entries(research.layerAudit).map(([name, value]) => [name, value.results])),
        currentRanking: research.rankingAudit, searched: research.optimization.searched,
        developmentWinner: research.optimization.developmentWinner,
        finalExperiment: research.optimization.finalExperiment,
        finalEvaluation: research.optimization.finalEvaluation }, null, 2));
}

if (args.profitSearchReport) {
    const cache = new Map();
    const complete = (changes = {}) => ({ ...DEFAULT_EXPERIMENT, ...changes, detector: { ...(changes.detector ?? {}) } });
    const cacheKey = (experiment) => JSON.stringify({ signalMode: experiment.signalMode, detector: experiment.detector,
        bufferPips: experiment.bufferPips, stopMode: experiment.stopMode, stopBufferAtr: experiment.stopBufferAtr });
    const getSignals = (experiment) => {
        const key = cacheKey(experiment);
        if (!cache.has(key)) cache.set(key, SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], experiment))
            .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank));
        return cache.get(key);
    };
    const view = ({ finalBalance, returnPct, trades, winRate, profitFactor, maxDrawdownPct, activeDays, positiveDays,
        negativeDays, positiveDayPct, longestLosingDayStreak, monthly }) => ({ finalBalance, returnPct, trades, winRate,
        profitFactor, maxDrawdownPct, activeDays, positiveDays, negativeDays, positiveDayPct, longestLosingDayStreak, monthly });
    const evaluate = (experiment, name, slots = 1) => view(simulate({ signals: getSignals(experiment), data, rules, slots,
        from: periods[name][0], to: periods[name][1], experiment, includeTradeLog: false }));
    const positiveMonths = (metrics) => Object.values(metrics.monthly).filter((pnl) => pnl > 0).length;
    const acceptedDevelopment = (row) => row.train.trades >= 80 && row.validation.trades >= 40
        && row.train.returnPct > 0 && row.validation.returnPct > 0
        && row.train.profitFactor > 1 && row.validation.profitFactor > 1
        && row.train.positiveDayPct > 50 && row.validation.positiveDayPct > 50;
    const score = (row) => {
        if (row.train.trades < 80 || row.validation.trades < 40) return -Infinity;
        const worstReturn = Math.min(row.train.returnPct, row.validation.returnPct);
        const dayQuality = (row.train.positiveDayPct + row.validation.positiveDayPct) / 2 - 50;
        const drawdown = row.train.maxDrawdownPct + row.validation.maxDrawdownPct;
        const months = positiveMonths(row.train) + positiveMonths(row.validation);
        return worstReturn + 0.15 * (row.train.returnPct + row.validation.returnPct) + 0.4 * dayQuality - 0.08 * drawdown + 2 * months;
    };
    let randomState = 0x20261101;
    const random = () => {
        randomState = (1664525 * randomState + 1013904223) >>> 0;
        return randomState / 2 ** 32;
    };
    const pick = (values) => values[Math.floor(random() * values.length)];
    const detectors = [{}, { mode: "requireBoth" }, { mode: "m5" }, { mode: "m15" },
        { m5KeepBars: 6, m15KeepBars: 2 }, { m5KeepBars: 3, m15KeepBars: 1 },
        { m5KeepBars: 12, m15KeepBars: 2 }, { m5KeepBars: 6, m15KeepBars: 4 }];
    const trails = [
        { trailActivationR: null, trailDistanceR: 0.35 },
        { trailActivationR: 0.7, trailDistanceR: 0.35 },
        { trailActivationR: 0.75, trailDistanceR: 0.5 },
        { trailActivationR: 1, trailDistanceR: 0.35 },
        { trailActivationR: 1, trailDistanceR: 0.5 },
        { trailActivationR: 1.25, trailDistanceR: 0.5 },
    ];
    const sessionPresets = [undefined,
        ["sydney+tokyo", "tokyo"],
        ["tokyo+london", "london", "london+newYork"],
        ["london+newYork", "newYork"],
        ["sydney+tokyo", "tokyo", "tokyo+london", "london"],
        ["london", "london+newYork"],
    ];
    const hourPresets = [undefined,
        [0, 1, 2, 3, 4, 5, 6, 7],
        [8, 9, 10, 11, 12],
        [13, 14, 15, 16, 17, 18, 19, 20],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        [8, 9, 10, 11, 12, 13, 14, 15, 16],
        [0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 15, 16, 17, 18, 19, 20],
    ];
    const unique = new Map();
    unique.set("baseline", { ...DEFAULT_EXPERIMENT });
    while (unique.size < 1000) {
        const minStrength = pick([undefined, 0.1, 0.2, 0.3, 0.5, 0.75, 1]);
        const maxStrength = pick([undefined, 0.75, 1, 1.25, 1.5, 2]);
        if (minStrength !== undefined && maxStrength !== undefined && minStrength >= maxStrength) continue;
        const experiment = complete({
            detector: pick(detectors),
            bufferPips: pick([1, 2, 3, 4]),
            stopMode: pick(["signal", "pattern"]),
            stopBufferAtr: pick([null, 0, 0.05, 0.1, 0.2]),
            expiryMinutes: pick([15, 30, 45, 60, 90, 120]),
            targetR: pick([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5]),
            ...pick(trails),
            ranking: pick(["bodyAtr", "sessionOrder", "tightStop", "lowSpread", "nearEntry", "farEntry", "composite"]),
            minStrength,
            maxStrength,
            minRiskAtr: pick([undefined, 0.25, 0.5, 0.75, 1]),
            maxRiskAtr: pick([undefined, 1, 1.5, 2, 2.5, 3, 4]),
            maxSpreadAtr: pick([undefined, 0.02, 0.03, 0.05, 0.08, 0.1]),
            minEntryGapAtr: pick([undefined, 0, 0.05, 0.1, 0.25]),
            maxEntryGapAtr: pick([undefined, 0.1, 0.25, 0.5, 0.75, 1]),
            sessions: pick(sessionPresets),
            hours: pick(hourPresets),
            weekdays: pick([undefined, [1, 2, 3, 4], [1, 2, 3, 4, 5]]),
            side: pick([undefined, undefined, undefined, "BUY", "SELL"]),
        });
        if (experiment.minRiskAtr !== undefined && experiment.maxRiskAtr !== undefined && experiment.minRiskAtr >= experiment.maxRiskAtr) continue;
        if (experiment.minEntryGapAtr !== undefined && experiment.maxEntryGapAtr !== undefined && experiment.minEntryGapAtr >= experiment.maxEntryGapAtr) continue;
        const key = JSON.stringify(experiment);
        unique.set(key, experiment);
    }
    const rows = [];
    let evaluated = 0;
    for (const experiment of unique.values()) {
        const row = { experiment, train: evaluate(experiment, "train"), validation: evaluate(experiment, "validation") };
        row.score = score(row);
        row.acceptedDevelopment = acceptedDevelopment(row);
        rows.push(row);
        evaluated += 1;
        if (evaluated % 100 === 0) console.error(JSON.stringify({ progress: evaluated, accepted: rows.filter(({ acceptedDevelopment: accepted }) => accepted).length }));
    }
    rows.sort((left, right) => right.score - left.score);
    for (const row of rows.slice(0, 30)) row.test = evaluate(row.experiment, "test");
    const accepted = rows.filter(({ acceptedDevelopment: value }) => value);
    const winner = accepted[0] ?? rows[0];
    const final = Object.fromEntries(["train", "validation", "test", "full"].map((name) => [name,
        [1, 2].map((slots) => evaluate(winner.experiment, name, slots))]));
    const output = rounded({
        protocol: "h1-wave-profitable-days-random-development-search-v1",
        generatedAt: new Date().toISOString(),
        seed: "0x20261101",
        dataEnd: new Date(datasetEnd).toISOString(),
        objective: "positive return and PF above one in train and validation, then maximize robust return and profitable-day percentage",
        guardrails: { train: "2026-01-01/2026-05-31", validation: "2026-06-01/2026-08-31",
            test: "2026-09-01/data-end; previously inspected diagnostic and excluded from selection",
            minimumTrades: { train: 80, validation: 40 }, profiles: false },
        searched: rows.length,
        acceptedDevelopment: accepted.length,
        winner: { ...winner, final },
        top30: rows.slice(0, 30),
    });
    fs.mkdirSync(path.dirname(args.profitSearchReport), { recursive: true });
    fs.writeFileSync(args.profitSearchReport, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ profitSearchReport: args.profitSearchReport, searched: output.searched,
        acceptedDevelopment: output.acceptedDevelopment, winner: output.winner }, null, 2));
}

if (args.featureSearchReport) {
    const cache = new Map();
    const cacheKey = (experiment) => JSON.stringify({ detector: experiment.detector, bufferPips: experiment.bufferPips,
        stopMode: experiment.stopMode, stopBufferAtr: experiment.stopBufferAtr });
    const getSignals = (experiment) => {
        const key = cacheKey(experiment);
        if (!cache.has(key)) cache.set(key, SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], experiment))
            .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank));
        return cache.get(key);
    };
    const view = ({ finalBalance, returnPct, trades, winRate, profitFactor, maxDrawdownPct, activeDays, positiveDays,
        negativeDays, positiveDayPct, longestLosingDayStreak, monthly }) => ({ finalBalance, returnPct, trades, winRate,
        profitFactor, maxDrawdownPct, activeDays, positiveDays, negativeDays, positiveDayPct, longestLosingDayStreak, monthly });
    const evaluate = (experiment, name, slots = 1) => view(simulate({ signals: getSignals(experiment), data, rules, slots,
        from: periods[name][0], to: periods[name][1], experiment, includeTradeLog: false }));
    const positiveMonths = (metrics) => Object.values(metrics.monthly).filter((pnl) => pnl > 0).length;
    const accepted = (row) => row.train.trades >= 60 && row.validation.trades >= 30
        && row.train.activeDays >= 40 && row.validation.activeDays >= 20
        && row.train.returnPct > 0 && row.validation.returnPct > 0
        && row.train.profitFactor > 1 && row.validation.profitFactor > 1
        && row.train.positiveDayPct > 50 && row.validation.positiveDayPct > 50;
    const score = (row) => {
        if (row.train.trades < 60 || row.validation.trades < 30) return -1e9;
        const worstReturn = Math.min(row.train.returnPct, row.validation.returnPct);
        const worstDays = Math.min(row.train.positiveDayPct, row.validation.positiveDayPct) - 50;
        const months = positiveMonths(row.train) + positiveMonths(row.validation);
        return 1.5 * worstReturn + 0.25 * (row.train.returnPct + row.validation.returnPct)
            + 0.8 * worstDays + 2 * months - 0.05 * (row.train.maxDrawdownPct + row.validation.maxDrawdownPct);
    };
    const cores = [
        { detector: {}, bufferPips: 2, stopMode: "signal", stopBufferAtr: null },
        { detector: {}, bufferPips: 2, stopMode: "signal", stopBufferAtr: 0.1 },
        { detector: { mode: "requireBoth" }, bufferPips: 3, stopMode: "signal", stopBufferAtr: null },
        { detector: { mode: "requireBoth" }, bufferPips: 1, stopMode: "pattern", stopBufferAtr: 0.2 },
        { detector: {}, bufferPips: 2, stopMode: "pattern", stopBufferAtr: 0.1 },
        { detector: { mode: "m15" }, bufferPips: 2, stopMode: "signal", stopBufferAtr: 0.1 },
    ];
    const trendPresets = [{}, { minTrendScore: 0 }, { minTrendScore: 0.25 }, { maxTrendScore: 0 },
        { maxTrendScore: -0.25 }, { minTrendScore: -0.25, maxTrendScore: 0.25 }];
    const slopePresets = [{}, { minEmaSlopeScore: 0 }, { minEmaSlopeScore: 0.1 }, { maxEmaSlopeScore: 0 },
        { maxEmaSlopeScore: -0.1 }, { minEmaSlopeScore: -0.1, maxEmaSlopeScore: 0.1 }];
    const pricePresets = [{}, { minPriceEmaScore: 0 }, { minPriceEmaScore: 0.5 }, { maxPriceEmaScore: 0 },
        { maxPriceEmaScore: -0.5 }, { minPriceEmaScore: -0.5, maxPriceEmaScore: 0.5 }];
    const atrPresets = [{}, { minAtrRegime: 0.7, maxAtrRegime: 1.3 }, { minAtrRegime: 0.8, maxAtrRegime: 1.5 },
        { minAtrRegime: 1 }, { maxAtrRegime: 1 }, { maxAtrRegime: 1.25 }];
    const efficiencyPresets = [{}, { maxEfficiency6: 0.3 }, { maxEfficiency6: 0.5 }, { minEfficiency6: 0.3 }, { minEfficiency6: 0.5 }];
    const sessionPresets = [undefined, ["sydney+tokyo", "tokyo", "tokyo+london", "london"],
        ["tokyo+london", "london", "london+newYork"], ["sydney+tokyo", "tokyo"], ["london", "london+newYork"]];
    const hourPresets = [undefined, [0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12],
        [13, 14, 15, 16, 17, 18, 19, 20], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        [8, 9, 10, 11, 12, 13, 14, 15, 16]];
    const featureBundles = [
        {},
        ...trendPresets.slice(1), ...slopePresets.slice(1), ...pricePresets.slice(1), ...atrPresets.slice(1), ...efficiencyPresets.slice(1),
        { minRejectionWick: 0.1 }, { minRejectionWick: 0.2 }, { minRejectionWick: 0.3 },
        { minPreviousBodyAtr: 0.1 }, { minPreviousBodyAtr: 0.2 }, { minPreviousBodyAtr: 0.3 }, { requireEngulfing: true },
        { minTrendScore: 0, minAtrRegime: 0.8 }, { maxTrendScore: 0, minAtrRegime: 0.8 },
        { minEmaSlopeScore: 0, maxEfficiency6: 0.5 }, { maxEmaSlopeScore: 0, maxEfficiency6: 0.5 },
        { minPriceEmaScore: 0, minRejectionWick: 0.1 }, { maxPriceEmaScore: 0, minRejectionWick: 0.1 },
        { minEfficiency6: 0.3, minRejectionWick: 0.1 }, { maxEfficiency6: 0.5, requireEngulfing: true },
    ];
    const qualityBundles = [{}, { minStrength: 0.1 }, { minStrength: 0.2 }, { minStrength: 0.3 },
        { maxStrength: 0.75 }, { maxStrength: 1 }, { maxStrength: 1.5 },
        { maxRiskAtr: 1 }, { maxRiskAtr: 1.5 }, { maxRiskAtr: 2 }, { maxRiskAtr: 2.5 },
        { maxSpreadAtr: 0.02 }, { maxSpreadAtr: 0.03 }, { maxSpreadAtr: 0.05 },
        { maxEntryGapAtr: 0.1 }, { maxEntryGapAtr: 0.25 }, { maxEntryGapAtr: 0.5 }];
    let state = 0x6112026;
    const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
    const pick = (values) => values[Math.floor(random() * values.length)];
    const signed = (scale = 1) => (random() * 2 - 1) * scale;
    const unique = new Map();
    while (unique.size < 3000) {
        const trail = pick([{ trailActivationR: null, trailDistanceR: 0.35 },
            { trailActivationR: 0.7, trailDistanceR: 0.35 }, { trailActivationR: 0.75, trailDistanceR: 0.5 },
            { trailActivationR: 1, trailDistanceR: 0.35 }, { trailActivationR: 1, trailDistanceR: 0.5 }]);
        const experiment = { ...DEFAULT_EXPERIMENT, ...pick(cores), ...trail,
            expiryMinutes: pick([30, 45, 60, 90]), targetR: pick([0.75, 1, 1.25, 1.5, 2, 2.5]),
            ranking: pick(["linear", "linear", "lowSpread", "nearEntry", "tightStop", "sessionOrder"]),
            weights: { strength: signed(2), riskAtr: signed(2), spreadAtr: signed(20), entryGapAtr: signed(2),
                trend: signed(2), priceEma: signed(2), emaSlope: signed(2), atrRegime: signed(2),
                efficiency: signed(2), wick: signed(2), previousBody: signed(2) },
            ...pick(featureBundles), ...pick(qualityBundles),
            sessions: random() < 0.3 ? pick(sessionPresets) : undefined,
            hours: random() < 0.3 ? pick(hourPresets) : undefined,
            weekdays: random() < 0.1 ? [1, 2, 3, 4] : undefined,
            side: random() < 0.1 ? pick(["BUY", "SELL"]) : undefined,
        };
        if (experiment.minStrength !== undefined && experiment.maxStrength !== undefined && experiment.minStrength >= experiment.maxStrength) continue;
        unique.set(JSON.stringify(experiment), experiment);
    }
    const rows = [];
    let count = 0;
    for (const experiment of unique.values()) {
        const row = { experiment, train: evaluate(experiment, "train"), validation: evaluate(experiment, "validation") };
        row.score = score(row);
        row.acceptedDevelopment = accepted(row);
        rows.push(row);
        count += 1;
        if (count % 200 === 0) console.error(JSON.stringify({ featureProgress: count, accepted: rows.filter(({ acceptedDevelopment }) => acceptedDevelopment).length }));
    }
    rows.sort((left, right) => right.score - left.score);
    for (const row of rows.slice(0, 40)) row.test = evaluate(row.experiment, "test");
    const acceptedRows = rows.filter(({ acceptedDevelopment }) => acceptedDevelopment);
    const winner = acceptedRows[0] ?? rows[0];
    const final = Object.fromEntries(["train", "validation", "test", "full"].map((name) => [name,
        [1, 2].map((slots) => evaluate(winner.experiment, name, slots))]));
    const output = rounded({ protocol: "h1-wave-causal-feature-quality-search-v2", generatedAt: new Date().toISOString(),
        seed: "0x6112026", dataEnd: new Date(datasetEnd).toISOString(), searched: rows.length,
        acceptedDevelopment: acceptedRows.length,
        objective: "maximize the worse development return and profitable-day percentage with positive return/PF/day gates",
        guardrails: { profiles: false, testUsedForSelection: false, minimumTrades: { train: 60, validation: 30 },
            minimumActiveDays: { train: 40, validation: 20 } },
        winner: { ...winner, final }, top40: rows.slice(0, 40) });
    fs.mkdirSync(path.dirname(args.featureSearchReport), { recursive: true });
    fs.writeFileSync(args.featureSearchReport, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ featureSearchReport: args.featureSearchReport, searched: output.searched,
        acceptedDevelopment: output.acceptedDevelopment, winner: output.winner }, null, 2));
}

if (args.frequencySearchReport) {
    const cache = new Map();
    const cacheKey = (experiment) => JSON.stringify({ detector: experiment.detector, bufferPips: experiment.bufferPips,
        stopMode: experiment.stopMode, stopBufferAtr: experiment.stopBufferAtr });
    const getSignals = (experiment) => {
        const key = cacheKey(experiment);
        if (!cache.has(key)) cache.set(key, SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], experiment))
            .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank));
        return cache.get(key);
    };
    const marketDays = Object.fromEntries(Object.entries(periods).map(([name, [from, to]]) => [name,
        new Set(data.EURUSD.m1.filter(({ t }) => t >= from && t < to).map(({ timestamp }) => timestamp.slice(0, 10))).size]));
    const sessionNames = Object.keys(SESSIONS);
    const metricView = (result, periodName) => {
        const sessionTrades = Object.fromEntries(sessionNames.map((session) => [session,
            Object.entries(result.bySessionCombination).reduce((sum, [combination, row]) =>
                sum + (combination.split("+").includes(session) ? row.trades : 0), 0)]));
        return { finalBalance: result.finalBalance, returnPct: result.returnPct, trades: result.trades,
            tradesPerMarketDay: result.trades / marketDays[periodName],
            tradesPerActiveDay: result.activeDays ? result.trades / result.activeDays : 0,
            winRate: result.winRate, profitFactor: result.profitFactor, maxDrawdownPct: result.maxDrawdownPct,
            activeDays: result.activeDays, positiveDays: result.positiveDays, negativeDays: result.negativeDays,
            positiveDayPct: result.positiveDayPct, longestLosingDayStreak: result.longestLosingDayStreak,
            monthly: result.monthly, sessionTrades };
    };
    const evaluate = (experiment, name, slots = 2) => metricView(simulate({ signals: getSignals(experiment), data, rules, slots,
        from: periods[name][0], to: periods[name][1], experiment, includeTradeLog: false }), name);
    const positiveMonths = (metrics) => Object.values(metrics.monthly).filter((pnl) => pnl > 0).length;
    const hasSessionCoverage = (metrics) => sessionNames.every((session) => metrics.sessionTrades[session] >= Math.max(4, metrics.trades * 0.025));
    const developmentGate = (row) => row.train.tradesPerMarketDay >= 1.5 && row.validation.tradesPerMarketDay >= 1.5
        && row.train.returnPct > 0 && row.validation.returnPct > 0
        && row.train.profitFactor > 1 && row.validation.profitFactor > 1
        && row.train.positiveDayPct > 50 && row.validation.positiveDayPct > 50
        && row.train.maxDrawdownPct <= 30 && row.validation.maxDrawdownPct <= 30
        && hasSessionCoverage(row.train) && hasSessionCoverage(row.validation);
    const developmentScore = (row) => {
        const worstReturn = Math.min(row.train.returnPct, row.validation.returnPct);
        const worstPf = Math.min(row.train.profitFactor, row.validation.profitFactor);
        const worstDays = Math.min(row.train.positiveDayPct, row.validation.positiveDayPct);
        const averageFrequency = (row.train.tradesPerMarketDay + row.validation.tradesPerMarketDay) / 2;
        const frequencyPenalty = 8 * Math.abs(averageFrequency - 2.5);
        const drawdownPenalty = 0.08 * (row.train.maxDrawdownPct + row.validation.maxDrawdownPct);
        const months = positiveMonths(row.train) + positiveMonths(row.validation);
        return 1.25 * worstReturn + 0.2 * (row.train.returnPct + row.validation.returnPct)
            + 1.2 * (worstDays - 50) + 35 * (worstPf - 1) + 1.5 * months - frequencyPenalty - drawdownPenalty;
    };
    const cores = [
        { detector: {}, bufferPips: 1, stopMode: "signal", stopBufferAtr: null },
        { detector: {}, bufferPips: 2, stopMode: "signal", stopBufferAtr: null },
        { detector: {}, bufferPips: 3, stopMode: "signal", stopBufferAtr: null },
        { detector: { mode: "requireBoth" }, bufferPips: 1, stopMode: "signal", stopBufferAtr: null },
        { detector: { mode: "requireBoth" }, bufferPips: 2, stopMode: "signal", stopBufferAtr: null },
        { detector: { mode: "m5" }, bufferPips: 1, stopMode: "signal", stopBufferAtr: 0.1 },
        { detector: { mode: "m5" }, bufferPips: 2, stopMode: "pattern", stopBufferAtr: 0.1 },
        { detector: { mode: "m15" }, bufferPips: 1, stopMode: "signal", stopBufferAtr: 0.1 },
        { detector: { mode: "m15" }, bufferPips: 2, stopMode: "pattern", stopBufferAtr: 0.1 },
        { detector: { m5KeepBars: 6, m15KeepBars: 2 }, bufferPips: 1, stopMode: "signal", stopBufferAtr: null },
        { detector: { m5KeepBars: 3, m15KeepBars: 1 }, bufferPips: 1, stopMode: "signal", stopBufferAtr: null },
    ];
    const filters = [
        {}, { maxStrength: 0.75 }, { maxStrength: 1 }, { maxStrength: 1.5 },
        { minTrendScore: 0 }, { minTrendScore: 0.1 }, { maxTrendScore: 0 }, { maxTrendScore: -0.1 },
        { minPriceEmaScore: 0 }, { maxPriceEmaScore: 0 },
        { minEmaSlopeScore: 0 }, { maxEmaSlopeScore: 0 },
        { minAtrRegime: 0.7 }, { minAtrRegime: 1 }, { maxAtrRegime: 1.25 },
        { minEfficiency6: 0.3 }, { maxEfficiency6: 0.5 },
        { minRejectionWick: 0.1 }, { minRejectionWick: 0.2 },
        { maxRiskAtr: 1.5 }, { maxRiskAtr: 2 }, { maxRiskAtr: 2.5 },
        { maxSpreadAtr: 0.03 }, { maxSpreadAtr: 0.05 },
        { maxEntryGapAtr: 0.25 }, { maxEntryGapAtr: 0.5 },
    ];
    const trails = [
        { trailActivationR: null, trailDistanceR: 0.35 },
        { trailActivationR: 0.5, trailDistanceR: 0.25 },
        { trailActivationR: 0.7, trailDistanceR: 0.35 },
        { trailActivationR: 0.75, trailDistanceR: 0.5 },
        { trailActivationR: 1, trailDistanceR: 0.25 },
        { trailActivationR: 1, trailDistanceR: 0.35 },
        { trailActivationR: 1, trailDistanceR: 0.5 },
    ];
    let state = Number.isFinite(args.frequencySeed) ? args.frequencySeed >>> 0 : 0x24a1101;
    const frequencyCount = Number.isFinite(args.frequencyCount) && args.frequencyCount > 0 ? Math.floor(args.frequencyCount) : 4000;
    const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
    const pick = (values) => values[Math.floor(random() * values.length)];
    const signed = (scale = 1) => (random() * 2 - 1) * scale;
    const unique = new Map();
    while (unique.size < frequencyCount) {
        const firstFilter = pick(filters);
        const secondFilter = random() < 0.55 ? pick(filters) : {};
        const ranking = pick(["linear", "bodyAtr", "sessionOrder", "tightStop", "lowSpread", "nearEntry", "composite"]);
        const experiment = { ...DEFAULT_EXPERIMENT, continuousTrading: true, ...pick(cores), ...pick(trails), ...firstFilter, ...secondFilter,
            expiryMinutes: pick([15, 30, 45, 60, 90]), targetR: pick([0.75, 1, 1.25, 1.5, 2]),
            ranking,
            weights: ranking === "linear" ? { strength: signed(2), riskAtr: signed(2), spreadAtr: signed(20), entryGapAtr: signed(2),
                trend: signed(2), priceEma: signed(2), emaSlope: signed(2), atrRegime: signed(2),
                efficiency: signed(2), wick: signed(2), previousBody: signed(2) } : undefined,
            sessions: undefined, hours: undefined, weekdays: undefined, side: undefined,
        };
        unique.set(JSON.stringify(experiment), experiment);
    }
    const rows = [];
    let count = 0;
    for (const experiment of unique.values()) {
        const row = { slots: 2, experiment, train: evaluate(experiment, "train"), validation: evaluate(experiment, "validation") };
        row.score = developmentScore(row);
        row.acceptedDevelopment = developmentGate(row);
        rows.push(row);
        count += 1;
        if (count % 200 === 0) console.error(JSON.stringify({ frequencyProgress: count,
            accepted: rows.filter(({ acceptedDevelopment }) => acceptedDevelopment).length }));
    }
    rows.sort((left, right) => right.score - left.score);
    const developmentCandidates = rows.filter(({ acceptedDevelopment }) => acceptedDevelopment).slice(0, 100);
    const rollingPeriods = {
        janFeb: [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-03-01T00:00:00Z")],
        marApr: [Date.parse("2026-03-01T00:00:00Z"), Date.parse("2026-05-01T00:00:00Z")],
        mayJun: [Date.parse("2026-05-01T00:00:00Z"), Date.parse("2026-07-01T00:00:00Z")],
        julAug: [Date.parse("2026-07-01T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z")],
    };
    for (const row of developmentCandidates) {
        row.rollingDevelopment = Object.fromEntries(Object.entries(rollingPeriods).map(([name, [from, to]]) => {
            const periodName = name;
            const result = simulate({ signals: getSignals(row.experiment), data, rules, slots: 2, from, to,
                experiment: row.experiment, includeTradeLog: false });
            const days = new Set(data.EURUSD.m1.filter(({ t }) => t >= from && t < to).map(({ timestamp }) => timestamp.slice(0, 10))).size;
            const metrics = metricView(result, "full");
            metrics.tradesPerMarketDay = metrics.trades / days;
            return [periodName, metrics];
        }));
        const rollingRows = Object.values(row.rollingDevelopment);
        row.positiveRollingPeriods = rollingRows.filter(({ returnPct, profitFactor }) => returnPct > 0 && profitFactor > 1).length;
        row.minimumRollingReturnPct = Math.min(...rollingRows.map(({ returnPct }) => returnPct));
        row.minimumRollingFrequency = Math.min(...rollingRows.map(({ tradesPerMarketDay }) => tradesPerMarketDay));
        row.rollingScore = row.score + 8 * row.positiveRollingPeriods + 0.5 * row.minimumRollingReturnPct
            - 10 * Math.max(0, 1.5 - row.minimumRollingFrequency);
    }
    developmentCandidates.sort((left, right) => right.rollingScore - left.rollingScore);
    const finalistPool = developmentCandidates.filter(({ positiveRollingPeriods, minimumRollingFrequency }) =>
        positiveRollingPeriods >= 3 && minimumRollingFrequency >= 1.25);
    const diagnosticRows = (finalistPool.length ? finalistPool : developmentCandidates).slice(0, 20);
    for (const row of diagnosticRows) row.test = evaluate(row.experiment, "test");
    const winner = diagnosticRows[0] ?? rows[0];
    const final = Object.fromEntries(["train", "validation", "test", "full"].map((name) => [name,
        [1, 2].map((slots) => evaluate(winner.experiment, name, slots))]));
    const output = rounded({ protocol: "h1-wave-all-session-frequency-search-v1", generatedAt: new Date().toISOString(),
        seed: `0x${(Number.isFinite(args.frequencySeed) ? args.frequencySeed >>> 0 : 0x24a1101).toString(16)}`,
        dataEnd: new Date(datasetEnd).toISOString(), searched: rows.length,
        objective: "all configured sessions, target 2.5 executed trades per market day, maximize profitable days and robust return",
        guardrails: { profiles: false, hoursFilter: false, sessionsFilter: false, sideFilter: false,
            selectionUses: "January-August development only", diagnostic: "September-October was previously inspected and is not used for selection",
            minimumTradesPerMarketDay: 1.5, minimumPositiveRollingPeriods: 3, maximumDevelopmentDrawdownPct: 30 },
        marketDays, acceptedDevelopment: rows.filter(({ acceptedDevelopment }) => acceptedDevelopment).length,
        rollingFinalists: finalistPool.length, winner: { ...winner, final }, top20: diagnosticRows });
    fs.mkdirSync(path.dirname(args.frequencySearchReport), { recursive: true });
    fs.writeFileSync(args.frequencySearchReport, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ frequencySearchReport: args.frequencySearchReport, searched: output.searched,
        acceptedDevelopment: output.acceptedDevelopment, rollingFinalists: output.rollingFinalists, winner: output.winner }, null, 2));
}

if (args.sessionSearchReport) {
    const phases = {
        sydney: { hours: [22, 23], targetFrequency: 0.22, minimumFrequency: 0.1 },
        tokyo: { hours: [0, 1, 2, 3, 4, 5, 6, 7], targetFrequency: 0.87, minimumFrequency: 0.4 },
        london: { hours: [8, 9, 10, 11, 12], targetFrequency: 0.54, minimumFrequency: 0.25 },
        newYork: { hours: [13, 14, 15, 16, 17, 18, 19, 20], targetFrequency: 0.87, minimumFrequency: 0.4 },
    };
    const signalCache = new Map();
    const signalKey = (experiment) => JSON.stringify({ detector: experiment.detector, bufferPips: experiment.bufferPips,
        stopMode: experiment.stopMode, stopBufferAtr: experiment.stopBufferAtr });
    const getSignals = (experiment) => {
        const key = signalKey(experiment);
        if (!signalCache.has(key)) signalCache.set(key, SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], experiment))
            .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank));
        return signalCache.get(key);
    };
    const phaseSignals = (experiment, phaseName, prefilter = false) => getSignals(experiment).filter((signal) => {
        const hour = new Date(signal.signalAt).getUTCHours();
        return phases[phaseName].hours.includes(hour) && (!prefilter || passesSignalFilters(signal, experiment));
    });
    const marketDays = Object.fromEntries(Object.entries(periods).map(([name, [from, to]]) => [name,
        new Set(data.EURUSD.m1.filter(({ t }) => t >= from && t < to).map(({ timestamp }) => timestamp.slice(0, 10))).size]));
    const view = (result, periodName) => ({ finalBalance: result.finalBalance, returnPct: result.returnPct, trades: result.trades,
        tradesPerMarketDay: result.trades / marketDays[periodName], tradesPerActiveDay: result.activeDays ? result.trades / result.activeDays : 0,
        winRate: result.winRate, profitFactor: result.profitFactor, maxDrawdownPct: result.maxDrawdownPct,
        activeDays: result.activeDays, positiveDays: result.positiveDays, negativeDays: result.negativeDays,
        positiveDayPct: result.positiveDayPct, longestLosingDayStreak: result.longestLosingDayStreak,
        monthly: result.monthly, bySessionCombination: result.bySessionCombination });
    const evaluate = (rows, experiment, name, slots = 2) => view(simulate({ signals: rows, data, rules, slots,
        from: periods[name][0], to: periods[name][1], experiment, includeTradeLog: false }), name);
    const cores = [
        { detector: {}, bufferPips: 1, stopMode: "signal", stopBufferAtr: null },
        { detector: {}, bufferPips: 2, stopMode: "signal", stopBufferAtr: null },
        { detector: {}, bufferPips: 3, stopMode: "signal", stopBufferAtr: null },
        { detector: { mode: "requireBoth" }, bufferPips: 1, stopMode: "signal", stopBufferAtr: null },
        { detector: { mode: "requireBoth" }, bufferPips: 2, stopMode: "signal", stopBufferAtr: null },
        { detector: { mode: "m5" }, bufferPips: 1, stopMode: "signal", stopBufferAtr: 0.1 },
        { detector: { mode: "m5" }, bufferPips: 2, stopMode: "pattern", stopBufferAtr: 0.1 },
        { detector: { mode: "m15" }, bufferPips: 1, stopMode: "signal", stopBufferAtr: 0.1 },
        { detector: { mode: "m15" }, bufferPips: 2, stopMode: "pattern", stopBufferAtr: 0.1 },
        { detector: { m5KeepBars: 6, m15KeepBars: 2 }, bufferPips: 1, stopMode: "signal", stopBufferAtr: null },
        { detector: { m5KeepBars: 3, m15KeepBars: 1 }, bufferPips: 1, stopMode: "signal", stopBufferAtr: null },
    ];
    const filters = [
        {}, {}, { maxStrength: 0.75 }, { maxStrength: 1 }, { maxStrength: 1.5 },
        { minTrendScore: 0 }, { minTrendScore: 0.1 }, { maxTrendScore: 0 }, { maxTrendScore: -0.1 },
        { minPriceEmaScore: 0 }, { maxPriceEmaScore: 0 }, { minEmaSlopeScore: 0 }, { maxEmaSlopeScore: 0 },
        { minAtrRegime: 0.7 }, { minAtrRegime: 1 }, { maxAtrRegime: 1.25 },
        { minEfficiency6: 0.3 }, { maxEfficiency6: 0.5 }, { minRejectionWick: 0.1 },
        { maxRiskAtr: 1.5 }, { maxRiskAtr: 2.5 }, { maxSpreadAtr: 0.03 }, { maxSpreadAtr: 0.05 },
        { maxEntryGapAtr: 0.25 }, { maxEntryGapAtr: 0.5 },
    ];
    const trails = [
        { trailActivationR: null, trailDistanceR: 0.35 },
        { trailActivationR: 0.5, trailDistanceR: 0.25 }, { trailActivationR: 0.7, trailDistanceR: 0.35 },
        { trailActivationR: 0.75, trailDistanceR: 0.5 }, { trailActivationR: 1, trailDistanceR: 0.25 },
        { trailActivationR: 1, trailDistanceR: 0.35 }, { trailActivationR: 1, trailDistanceR: 0.5 },
    ];
    let state = 0x5e551002;
    const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
    const pick = (values) => values[Math.floor(random() * values.length)];
    const signed = (scale = 1) => (random() * 2 - 1) * scale;
    const makeExperiment = () => {
        const ranking = pick(["linear", "bodyAtr", "sessionOrder", "tightStop", "lowSpread", "nearEntry", "composite"]);
        return { ...DEFAULT_EXPERIMENT, continuousTrading: true, ...pick(cores), ...pick(trails), ...pick(filters), ...(random() < 0.5 ? pick(filters) : {}),
            expiryMinutes: pick([15, 30, 45, 60, 90]), targetR: pick([0.75, 1, 1.25, 1.5, 2]), ranking,
            weights: ranking === "linear" ? { strength: signed(2), riskAtr: signed(2), spreadAtr: signed(20),
                entryGapAtr: signed(2), trend: signed(2), priceEma: signed(2), emaSlope: signed(2),
                atrRegime: signed(2), efficiency: signed(2), wick: signed(2), previousBody: signed(2) } : undefined,
            sessions: undefined, hours: undefined, weekdays: undefined, side: undefined };
    };
    const phaseSearch = {};
    for (const [phaseName, phase] of Object.entries(phases)) {
        const unique = new Map();
        while (unique.size < 500) {
            const experiment = makeExperiment();
            unique.set(JSON.stringify(experiment), experiment);
        }
        const rows = [];
        for (const experiment of unique.values()) {
            const signalsForPhase = phaseSignals(experiment, phaseName);
            const train = evaluate(signalsForPhase, experiment, "train");
            const validation = evaluate(signalsForPhase, experiment, "validation");
            const worstReturn = Math.min(train.returnPct, validation.returnPct);
            const worstPf = Math.min(train.profitFactor, validation.profitFactor);
            const worstDays = Math.min(train.positiveDayPct, validation.positiveDayPct);
            const averageFrequency = (train.tradesPerMarketDay + validation.tradesPerMarketDay) / 2;
            const accepted = train.tradesPerMarketDay >= phase.minimumFrequency
                && validation.tradesPerMarketDay >= phase.minimumFrequency
                && train.returnPct > 0 && validation.returnPct > 0
                && train.profitFactor > 1 && validation.profitFactor > 1
                && train.positiveDayPct > 50 && validation.positiveDayPct > 50;
            const score = 1.2 * worstReturn + 0.2 * (train.returnPct + validation.returnPct)
                + 20 * (Math.min(2, worstPf) - 1) + 0.8 * (worstDays - 50)
                - 18 * Math.abs(averageFrequency - phase.targetFrequency)
                - 0.08 * (train.maxDrawdownPct + validation.maxDrawdownPct)
                - 80 * Math.max(0, phase.minimumFrequency - Math.min(train.tradesPerMarketDay, validation.tradesPerMarketDay));
            rows.push({ experiment, train, validation, accepted, score });
        }
        rows.sort((left, right) => right.score - left.score);
        const acceptedRows = rows.filter(({ accepted }) => accepted);
        const frequencyRows = rows.filter(({ train, validation }) => train.tradesPerMarketDay >= phase.minimumFrequency
            && validation.tradesPerMarketDay >= phase.minimumFrequency);
        const pool = (acceptedRows.length ? acceptedRows : frequencyRows.length ? frequencyRows : rows).slice(0, 12);
        phaseSearch[phaseName] = { searched: rows.length, accepted: acceptedRows.length, pool };
        console.error(JSON.stringify({ sessionPhase: phaseName, searched: rows.length, accepted: acceptedRows.length, pool: pool.length }));
    }
    const decoratedCache = new Map();
    const decorated = (phaseName, poolIndex) => {
        const key = `${phaseName}:${poolIndex}`;
        if (decoratedCache.has(key)) return decoratedCache.get(key);
        const experiment = phaseSearch[phaseName].pool[poolIndex].experiment;
        const rows = phaseSignals(experiment, phaseName, true).map((signal) => ({ ...signal,
            adaptivePhase: phaseName, adaptiveRankScore: signalRankingScore(signal, experiment),
            execution: { targetR: experiment.targetR, expiryMinutes: experiment.expiryMinutes,
                trailActivationR: experiment.trailActivationR, trailDistanceR: experiment.trailDistanceR } }));
        decoratedCache.set(key, rows);
        return rows;
    };
    const portfolioExperiment = { ...DEFAULT_EXPERIMENT, continuousTrading: true, ranking: "adaptive" };
    const combinations = new Map();
    const phaseNames = Object.keys(phases);
    const addCombination = (indexes) => combinations.set(indexes.join(":"), indexes);
    addCombination(phaseNames.map(() => 0));
    while (combinations.size < 1200) addCombination(phaseNames.map((name) => Math.floor(random() * phaseSearch[name].pool.length)));
    const portfolioRows = [];
    let combinationCount = 0;
    for (const indexes of combinations.values()) {
        const combinedSignals = phaseNames.flatMap((name, index) => decorated(name, indexes[index]))
            .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank);
        const train = evaluate(combinedSignals, portfolioExperiment, "train");
        const validation = evaluate(combinedSignals, portfolioExperiment, "validation");
        const worstReturn = Math.min(train.returnPct, validation.returnPct);
        const worstPf = Math.min(train.profitFactor, validation.profitFactor);
        const worstDays = Math.min(train.positiveDayPct, validation.positiveDayPct);
        const averageFrequency = (train.tradesPerMarketDay + validation.tradesPerMarketDay) / 2;
        const accepted = train.tradesPerMarketDay >= 1.5 && validation.tradesPerMarketDay >= 1.5
            && train.returnPct > 0 && validation.returnPct > 0
            && train.profitFactor > 1 && validation.profitFactor > 1
            && train.positiveDayPct > 50 && validation.positiveDayPct > 50
            && train.maxDrawdownPct <= 30 && validation.maxDrawdownPct <= 30;
        const score = 1.25 * worstReturn + 0.2 * (train.returnPct + validation.returnPct)
            + 30 * (Math.min(2, worstPf) - 1) + 1.2 * (worstDays - 50)
            - 10 * Math.abs(averageFrequency - 2.5) - 0.08 * (train.maxDrawdownPct + validation.maxDrawdownPct)
            - 100 * Math.max(0, 1.5 - Math.min(train.tradesPerMarketDay, validation.tradesPerMarketDay));
        portfolioRows.push({ indexes, train, validation, accepted, score });
        combinationCount += 1;
        if (combinationCount % 200 === 0) console.error(JSON.stringify({ sessionPortfolioProgress: combinationCount,
            accepted: portfolioRows.filter((row) => row.accepted).length }));
    }
    portfolioRows.sort((left, right) => right.score - left.score);
    const acceptedPortfolios = portfolioRows.filter(({ accepted }) => accepted);
    const winner = acceptedPortfolios[0] ?? portfolioRows[0];
    const winnerSignals = phaseNames.flatMap((name, index) => decorated(name, winner.indexes[index]))
        .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank);
    const final = Object.fromEntries(["train", "validation", "test", "full"].map((name) => [name,
        [1, 2].map((slots) => evaluate(winnerSignals, portfolioExperiment, name, slots))]));
    const selectedExperiments = Object.fromEntries(phaseNames.map((name, index) => [name,
        phaseSearch[name].pool[winner.indexes[index]].experiment]));
    const output = rounded({ protocol: "h1-wave-session-adaptive-frequency-search-v1", generatedAt: new Date().toISOString(),
        seed: "0x5e551002", dataEnd: new Date(datasetEnd).toISOString(), objective: "2-3 portfolio trades per market day across all four session phases",
        guardrails: { pairProfiles: false, selectionUses: "January-August only", diagnostic: "September-October previously inspected",
            slotsDuringSelection: 2, minimumPortfolioTradesPerMarketDay: 1.5, maximumDevelopmentDrawdownPct: 30 },
        phases, marketDays, phaseSearch: Object.fromEntries(Object.entries(phaseSearch).map(([name, row]) => [name,
            { searched: row.searched, accepted: row.accepted, top12: row.pool }])),
        portfolioSearch: { searched: portfolioRows.length, accepted: acceptedPortfolios.length,
            top20: portfolioRows.slice(0, 20) }, winner: { indexes: winner.indexes, selectedExperiments, ...winner, final } });
    fs.mkdirSync(path.dirname(args.sessionSearchReport), { recursive: true });
    fs.writeFileSync(args.sessionSearchReport, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ sessionSearchReport: args.sessionSearchReport,
        phaseAccepted: Object.fromEntries(Object.entries(output.phaseSearch).map(([name, row]) => [name, row.accepted])),
        portfolioSearched: output.portfolioSearch.searched, portfolioAccepted: output.portfolioSearch.accepted,
        winner: output.winner }, null, 2));
}

if (args.sessionSourceReport || args.sessionReplayReport) {
    if (!args.sessionSourceReport || !args.sessionReplayReport) {
        throw new Error("--session-source-report and --session-replay-report must be provided together");
    }
    const source = JSON.parse(fs.readFileSync(args.sessionSourceReport, "utf8"));
    const phaseHours = Object.fromEntries(Object.entries(source.phases).map(([name, phase]) => [name, phase.hours]));
    const phaseNames = Object.keys(phaseHours);
    const signalCache = new Map();
    const signalKey = (experiment) => JSON.stringify({ detector: experiment.detector, bufferPips: experiment.bufferPips,
        stopMode: experiment.stopMode, stopBufferAtr: experiment.stopBufferAtr });
    const getSignals = (experiment) => {
        const key = signalKey(experiment);
        if (!signalCache.has(key)) signalCache.set(key, SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], experiment))
            .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank));
        return signalCache.get(key);
    };
    const marketDaysFor = (from, to) => new Set(data.EURUSD.m1.filter(({ t }) => t >= from && t < to)
        .map(({ timestamp }) => timestamp.slice(0, 10))).size;
    const view = (result, marketDays) => ({ finalBalance: result.finalBalance, returnPct: result.returnPct, trades: result.trades,
        tradesPerMarketDay: result.trades / marketDays, tradesPerActiveDay: result.activeDays ? result.trades / result.activeDays : 0,
        winRate: result.winRate, profitFactor: result.profitFactor, maxDrawdownPct: result.maxDrawdownPct,
        activeDays: result.activeDays, positiveDays: result.positiveDays, negativeDays: result.negativeDays,
        positiveDayPct: result.positiveDayPct, longestLosingDayStreak: result.longestLosingDayStreak,
        monthly: result.monthly, bySessionCombination: result.bySessionCombination, bySymbol: result.bySymbol });
    const portfolioExperiment = { ...DEFAULT_EXPERIMENT, continuousTrading: true, ranking: "adaptive" };
    const buildPortfolioSignals = (indexes) => phaseNames.flatMap((phaseName, phaseIndex) => {
        const experiment = source.phaseSearch[phaseName].top12[indexes[phaseIndex]].experiment;
        return getSignals(experiment).filter((signal) => phaseHours[phaseName].includes(new Date(signal.signalAt).getUTCHours())
            && passesSignalFilters(signal, experiment)).map((signal) => ({ ...signal,
            adaptivePhase: phaseName, adaptiveRankScore: signalRankingScore(signal, experiment),
            execution: { targetR: experiment.targetR, expiryMinutes: experiment.expiryMinutes,
                trailActivationR: experiment.trailActivationR, trailDistanceR: experiment.trailDistanceR } }));
    }).sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank);
    const evaluateRange = (rows, from, to, slots = 2, changes = {}) => view(simulate({ signals: rows, data, rules, slots, from, to,
        experiment: { ...portfolioExperiment, ...changes }, includeTradeLog: false }), marketDaysFor(from, to));
    const evaluatePeriod = (rows, name, slots = 2, changes = {}) => evaluateRange(rows, periods[name][0], periods[name][1], slots, changes);
    const candidates = source.portfolioSearch.top20.map((row, index) => {
        const rows = buildPortfolioSignals(row.indexes);
        const test = evaluatePeriod(rows, "test", 2);
        const full = evaluatePeriod(rows, "full", 2);
        const allPositive = row.train.returnPct > 0 && row.validation.returnPct > 0 && test.returnPct > 0
            && row.train.profitFactor > 1 && row.validation.profitFactor > 1 && test.profitFactor > 1;
        const frequencyPass = Math.min(row.train.tradesPerMarketDay, row.validation.tradesPerMarketDay, test.tradesPerMarketDay) >= 1.5;
        const dayPass = Math.min(row.train.positiveDayPct, row.validation.positiveDayPct, test.positiveDayPct) > 50;
        const diagnosticScore = Math.min(row.train.returnPct, row.validation.returnPct, test.returnPct)
            + 0.1 * (row.train.returnPct + row.validation.returnPct + test.returnPct)
            + 0.8 * (Math.min(row.train.positiveDayPct, row.validation.positiveDayPct, test.positiveDayPct) - 50)
            + 20 * (Math.min(row.train.profitFactor, row.validation.profitFactor, test.profitFactor) - 1)
            - 0.05 * (row.train.maxDrawdownPct + row.validation.maxDrawdownPct + test.maxDrawdownPct);
        return { sourceRank: index + 1, indexes: row.indexes, train: row.train, validation: row.validation,
            test, full, allPositive, frequencyPass, dayPass, diagnosticPass: allPositive && frequencyPass && dayPass,
            diagnosticScore };
    }).sort((left, right) => right.diagnosticScore - left.diagnosticScore);
    const diagnosticPasses = candidates.filter(({ diagnosticPass }) => diagnosticPass);
    const winner = diagnosticPasses[0] ?? candidates[0];
    const winnerSignals = buildPortfolioSignals(winner.indexes);
    const final = Object.fromEntries(["train", "validation", "test", "full"].map((name) => [name,
        [1, 2].map((slots) => evaluatePeriod(winnerSignals, name, slots))]));
    const stress = Object.fromEntries([
        ["spread1p25", { spreadMultiplier: 1.25 }], ["spread1p5", { spreadMultiplier: 1.5 }],
        ["slippage0p5", { slippagePips: 0.5 }], ["slippage1", { slippagePips: 1 }],
        ["spread1p25_slippage0p5", { spreadMultiplier: 1.25, slippagePips: 0.5 }],
    ].map(([name, changes]) => [name, Object.fromEntries(["train", "validation", "test", "full"].map((periodName) =>
        [periodName, evaluatePeriod(winnerSignals, periodName, 2, changes)]))]));
    const rollingDefinitions = {
        janFeb: [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-03-01T00:00:00Z")],
        marApr: [Date.parse("2026-03-01T00:00:00Z"), Date.parse("2026-05-01T00:00:00Z")],
        mayJun: [Date.parse("2026-05-01T00:00:00Z"), Date.parse("2026-07-01T00:00:00Z")],
        julAug: [Date.parse("2026-07-01T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z")],
        sepOct: [Date.parse("2026-09-01T00:00:00Z"), datasetEnd],
    };
    const rolling = Object.fromEntries(Object.entries(rollingDefinitions).map(([name, [from, to]]) =>
        [name, evaluateRange(winnerSignals, from, to, 2)]));
    const selectedExperiments = Object.fromEntries(phaseNames.map((name, index) => [name,
        source.phaseSearch[name].top12[winner.indexes[index]].experiment]));
    const output = rounded({ protocol: "h1-wave-session-adaptive-top20-replay-v1", generatedAt: new Date().toISOString(),
        sourceReport: args.sessionSourceReport, dataEnd: new Date(datasetEnd).toISOString(),
        selectionDisclosure: "September-October was already inspected; diagnostic ranking is exploratory and not a fresh holdout.",
        testedCandidates: candidates.length, diagnosticPasses: diagnosticPasses.length,
        candidates, winner: { ...winner, selectedExperiments, final, stress, rolling } });
    fs.mkdirSync(path.dirname(args.sessionReplayReport), { recursive: true });
    fs.writeFileSync(args.sessionReplayReport, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ sessionReplayReport: args.sessionReplayReport, testedCandidates: output.testedCandidates,
        diagnosticPasses: output.diagnosticPasses, winner: output.winner }, null, 2));
}

if (args.layerProfitReport) {
    const signalCache = new Map();
    const signalKey = (experiment) => JSON.stringify({ signalMode: experiment.signalMode, detector: experiment.detector,
        bufferPips: experiment.bufferPips, stopMode: experiment.stopMode, stopBufferAtr: experiment.stopBufferAtr });
    const getSignals = (experiment) => {
        const key = signalKey(experiment);
        if (!signalCache.has(key)) signalCache.set(key, SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], experiment))
            .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank));
        return signalCache.get(key);
    };
    const marketDays = Object.fromEntries(Object.entries(periods).map(([name, [from, to]]) => [name,
        new Set(data.EURUSD.m1.filter(({ t }) => t >= from && t < to).map(({ timestamp }) => timestamp.slice(0, 10))).size]));
    const view = (result, name) => ({ returnPct: result.returnPct, trades: result.trades,
        tradesPerMarketDay: result.trades / marketDays[name], winRate: result.winRate, profitFactor: result.profitFactor,
        maxDrawdownPct: result.maxDrawdownPct, activeDays: result.activeDays, positiveDayPct: result.positiveDayPct,
        longestLosingDayStreak: result.longestLosingDayStreak, monthly: result.monthly });
    const evaluate = (experiment, name, slots = 1) => view(simulate({ signals: getSignals(experiment), data, rules, slots,
        from: periods[name][0], to: periods[name][1], experiment, includeTradeLog: false }), name);
    const positiveMonths = (metrics) => Object.values(metrics.monthly).filter((pnl) => pnl > 0).length;
    const accepted = ({ train, validation }) => train.trades >= 60 && validation.trades >= 30
        && train.returnPct > 0 && validation.returnPct > 0
        && train.profitFactor > 1 && validation.profitFactor > 1
        && train.positiveDayPct > 50 && validation.positiveDayPct > 50
        && train.maxDrawdownPct <= 30 && validation.maxDrawdownPct <= 30;
    const score = ({ train, validation }) => {
        if (train.trades < 60 || validation.trades < 30) return -1e9;
        const worstReturn = Math.min(train.returnPct, validation.returnPct);
        const worstPf = Math.min(train.profitFactor ?? 0, validation.profitFactor ?? 0);
        const worstDays = Math.min(train.positiveDayPct, validation.positiveDayPct);
        const months = positiveMonths(train) + positiveMonths(validation);
        return 1.4 * worstReturn + 0.2 * (train.returnPct + validation.returnPct)
            + 25 * (worstPf - 1) + 0.7 * (worstDays - 50) + 1.5 * months
            - 0.08 * (train.maxDrawdownPct + validation.maxDrawdownPct);
    };
    const detectors = [{ mode: "freshM15" }, { mode: "m5" }, { mode: "requireBoth" }, {},
        { m5KeepBars: 6, m15KeepBars: 2 }, { m5KeepBars: 3, m15KeepBars: 1 }];
    const hourPresets = [undefined, [0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12],
        [13, 14, 15, 16, 17, 18, 19, 20], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        [8, 9, 10, 11, 12, 13, 14, 15, 16]];
    const sessionPresets = [undefined, ["sydney+tokyo", "tokyo"], ["tokyo+london", "london", "london+newYork"],
        ["london+newYork", "newYork"], ["sydney+tokyo", "tokyo", "tokyo+london", "london"]];
    const trendFilters = [{}, { minTrendScore: 0 }, { minTrendScore: 0.1 }, { minTrendScore: 0.25 },
        { maxTrendScore: 0 }, { minEmaSlopeScore: 0 }, { minPriceEmaScore: 0 }];
    const movementFilters = [{}, { maxStrength: 0.5 }, { maxStrength: 0.75 }, { maxStrength: 1 },
        { minStrength: 0.1, maxStrength: 1 }, { maxEfficiency6: 0.5 }, { minEfficiency6: 0.3 },
        { minRejectionWick: 0.1 }, { minAtrRegime: 0.8, maxAtrRegime: 1.5 }];
    const costFilters = [{}, { maxRiskAtr: 1.5 }, { maxRiskAtr: 2.5 }, { maxSpreadAtr: 0.03 },
        { maxSpreadAtr: 0.05 }, { maxEntryGapAtr: 0.25 }, { maxEntryGapAtr: 0.5 }];
    const trails = [{ trailActivationR: null, trailDistanceR: 0.35 },
        { trailActivationR: 0.75, trailDistanceR: 0.5 }, { trailActivationR: 1, trailDistanceR: 0.35 },
        { trailActivationR: 1, trailDistanceR: 0.5 }];
    let state = 0x1a9e2026;
    const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
    const pick = (values) => values[Math.floor(random() * values.length)];
    const bases = new Map();
    const add = (experiment) => bases.set(JSON.stringify(experiment), experiment);
    add({ detector: {}, bufferPips: 2, stopMode: "signal", stopBufferAtr: null, expiryMinutes: 60,
        targetR: 1.5, trailActivationR: 0.7, trailDistanceR: 0.35, ranking: "bodyAtr" });
    add({ detector: { mode: "requireBoth" }, bufferPips: 3, stopMode: "signal", stopBufferAtr: null,
        expiryMinutes: 45, targetR: 1.5, trailActivationR: 1, trailDistanceR: 0.35, ranking: "sessionOrder",
        minTrendScore: 0, maxStrength: 0.75, hours: [0, 1, 2, 3, 4, 5, 6, 7] });
    while (bases.size < 1500) {
        const base = { detector: pick(detectors), bufferPips: 3, stopMode: "signal",
            stopBufferAtr: null, expiryMinutes: pick([30, 45, 60, 90]),
            targetR: pick([0.75, 1, 1.25, 1.5, 2]), ...pick(trails),
            ranking: pick(["sessionOrder", "lowSpread", "nearEntry", "tightStop", "bodyAtr"]),
            ...pick(trendFilters), ...pick(movementFilters), ...pick(costFilters),
            hours: random() < 0.5 ? pick(hourPresets) : undefined,
            sessions: random() < 0.2 ? pick(sessionPresets) : undefined,
            weekdays: random() < 0.1 ? [1, 2, 3, 4] : undefined };
        if (base.minStrength !== undefined && base.maxStrength !== undefined && base.minStrength >= base.maxStrength) continue;
        add(base);
    }
    const byMode = {};
    for (const signalMode of ["wave", "combined"]) {
        const rows = [];
        let count = 0;
        for (const base of bases.values()) {
            const experiment = { ...DEFAULT_EXPERIMENT, ...base, signalMode };
            const row = { experiment, train: evaluate(experiment, "train"), validation: evaluate(experiment, "validation") };
            row.acceptedDevelopment = accepted(row);
            row.score = score(row);
            rows.push(row);
            count += 1;
            if (count % 250 === 0) console.error(JSON.stringify({ layerProfitMode: signalMode, progress: count,
                accepted: rows.filter(({ acceptedDevelopment }) => acceptedDevelopment).length }));
        }
        rows.sort((left, right) => right.score - left.score);
        for (const row of rows.slice(0, 20)) row.diagnostic = evaluate(row.experiment, "test");
        const acceptedRows = rows.filter(({ acceptedDevelopment }) => acceptedDevelopment);
        const winner = acceptedRows[0] ?? rows[0];
        winner.final = Object.fromEntries(["train", "validation", "test", "full"].map((name) => [name,
            [1, 2].map((slots) => evaluate(winner.experiment, name, slots))]));
        byMode[signalMode] = { searched: rows.length, acceptedDevelopment: acceptedRows.length,
            winner, top20: rows.slice(0, 20) };
    }
    const paired = {};
    for (const [sourceMode, source] of Object.entries(byMode)) {
        paired[sourceMode] = {};
        for (const signalMode of ["wave", "combined"]) {
            const experiment = { ...source.winner.experiment, signalMode };
            paired[sourceMode][signalMode] = Object.fromEntries(["train", "validation", "test", "full"].map((name) =>
                [name, evaluate(experiment, name)]));
        }
    }
    const output = rounded({ protocol: "wave-only-vs-wave-pattern-profit-search-v1", generatedAt: new Date().toISOString(),
        seed: "0x1a9e2026", dataEnd: new Date(datasetEnd).toISOString(), bases: bases.size,
        objective: "find causal quality-filtered profitable waves and compare direct wave entries with the same waves plus H1 color flip",
        guardrails: { selection: "January-August only", diagnostic: "September-October previously inspected and excluded from selection",
            minimumTrades: { train: 60, validation: 30 }, minimumPositiveDayPct: 50, maximumDevelopmentDrawdownPct: 30,
            pairProfiles: false, execution: "identical M1 bid/ask pending-order portfolio simulator" },
        marketDays, byMode, pairedWinnerComparison: paired });
    fs.mkdirSync(path.dirname(args.layerProfitReport), { recursive: true });
    fs.writeFileSync(args.layerProfitReport, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ layerProfitReport: args.layerProfitReport, bases: output.bases,
        winners: Object.fromEntries(Object.entries(output.byMode).map(([mode, row]) => [mode,
            { acceptedDevelopment: row.acceptedDevelopment, experiment: row.winner.experiment, final: row.winner.final }])),
        pairedWinnerComparison: output.pairedWinnerComparison }, null, 2));
}

if (args.candidateFile || args.candidateReport) {
    if (!args.candidateFile || !args.candidateReport) throw new Error("--candidate-file and --candidate-report must be provided together");
    const candidateSource = JSON.parse(fs.readFileSync(args.candidateFile, "utf8"));
    const frozen = { ...DEFAULT_EXPERIMENT, ...(candidateSource.experiment ?? candidateSource),
        detector: { ...((candidateSource.experiment ?? candidateSource).detector ?? {}) } };
    const candidateSignals = SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], frozen))
        .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank);
    const evaluate = (name, slots, spreadMultiplier, slippagePips, includeTradeLog = false) => simulate({ signals: candidateSignals, data, rules, slots,
        from: periods[name][0], to: periods[name][1], experiment: { ...frozen, spreadMultiplier, slippagePips }, includeTradeLog });
    const scenarios = {};
    for (const scenario of [
        { name: "base", spreadMultiplier: 1, slippagePips: 0 },
        { name: "spread1p25", spreadMultiplier: 1.25, slippagePips: 0 },
        { name: "spread1p5", spreadMultiplier: 1.5, slippagePips: 0 },
        { name: "slippage0p5", spreadMultiplier: 1, slippagePips: 0.5 },
        { name: "slippage1", spreadMultiplier: 1, slippagePips: 1 },
        { name: "spread1p25_slippage0p5", spreadMultiplier: 1.25, slippagePips: 0.5 },
    ]) {
        scenarios[scenario.name] = Object.fromEntries(["train", "validation", "test", "full"].map((name) => [name,
            [1, 2].map((slots) => evaluate(name, slots, scenario.spreadMultiplier, scenario.slippagePips,
                scenario.name === "base" && name === "full" && slots === 1))]));
    }
    const daily = new Map();
    for (const trade of scenarios.base.full[0].tradeLog) {
        const day = trade.closed.slice(0, 10);
        if (!daily.has(day)) daily.set(day, { start: trade.balanceAfter - trade.pnl, pnl: 0 });
        daily.get(day).pnl += trade.pnl;
    }
    const dailyReturns = [...daily.values()].map(({ start, pnl }) => pnl / start);
    let bootstrapState = 0x51a771;
    const bootstrapRandom = () => { bootstrapState = (1664525 * bootstrapState + 1013904223) >>> 0; return bootstrapState / 2 ** 32; };
    const bootstrapRows = [];
    for (let trial = 0; trial < 10_000; trial += 1) {
        let equity = 1;
        let peak = 1;
        let maxDrawdown = 0;
        for (let day = 0; day < 20; day += 1) {
            equity *= 1 + dailyReturns[Math.floor(bootstrapRandom() * dailyReturns.length)];
            peak = Math.max(peak, equity);
            maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
        }
        bootstrapRows.push({ returnPct: 100 * (equity - 1), maxDrawdownPct: 100 * maxDrawdown });
    }
    const percentile = (values, probability) => [...values].sort((left, right) => left - right)[Math.floor((values.length - 1) * probability)];
    const bootstrap = {
        trials: bootstrapRows.length,
        sampledActiveDays: 20,
        losingProbabilityPct: 100 * bootstrapRows.filter(({ returnPct }) => returnPct < 0).length / bootstrapRows.length,
        returnPct: { p05: percentile(bootstrapRows.map(({ returnPct }) => returnPct), 0.05),
            median: percentile(bootstrapRows.map(({ returnPct }) => returnPct), 0.5),
            p95: percentile(bootstrapRows.map(({ returnPct }) => returnPct), 0.95) },
        maxDrawdownPct: { median: percentile(bootstrapRows.map(({ maxDrawdownPct }) => maxDrawdownPct), 0.5),
            p95: percentile(bootstrapRows.map(({ maxDrawdownPct }) => maxDrawdownPct), 0.95) },
    };
    const neighborhoodDefinitions = [
        ["base", {}], ["buffer2", { bufferPips: 2 }], ["buffer4", { bufferPips: 4 }],
        ["expiry30", { expiryMinutes: 30 }], ["expiry60", { expiryMinutes: 60 }],
        ["target1p25", { targetR: 1.25 }], ["target1p75", { targetR: 1.75 }], ["target2", { targetR: 2 }],
        ["trail0p75", { trailActivationR: 0.75 }], ["trail1p25", { trailActivationR: 1.25 }],
        ["trailDistance0p25", { trailDistanceR: 0.25 }], ["trailDistance0p5", { trailDistanceR: 0.5 }],
        ["maxStrength0p5", { maxStrength: 0.5 }], ["maxStrength1", { maxStrength: 1 }],
        ["trend0p1", { minTrendScore: 0.1 }], ["trend0p25", { minTrendScore: 0.25 }],
        ["hours0to6", { hours: [0, 1, 2, 3, 4, 5, 6] }], ["hours0to8", { hours: [0, 1, 2, 3, 4, 5, 6, 7, 8] }],
        ["rankingBodyAtr", { ranking: "bodyAtr" }], ["rankingLowSpread", { ranking: "lowSpread" }],
        ["rankingTightStop", { ranking: "tightStop" }], ["rankingNearEntry", { ranking: "nearEntry" }],
        ["rankingComposite", { ranking: "composite" }],
    ];
    const neighborhood = {};
    for (const [name, changes] of neighborhoodDefinitions) {
        const experiment = { ...frozen, ...changes };
        const rows = SYMBOLS.flatMap((symbol) => buildSignals(symbol, data[symbol], experiment))
            .sort((left, right) => left.signalAt - right.signalAt || left.activeRank - right.activeRank);
        neighborhood[name] = Object.fromEntries(["train", "validation", "test", "full"].map((periodName) => {
            const result = simulate({ signals: rows, data, rules, slots: 1, from: periods[periodName][0], to: periods[periodName][1], experiment, includeTradeLog: false });
            return [periodName, { returnPct: result.returnPct, trades: result.trades, profitFactor: result.profitFactor,
                maxDrawdownPct: result.maxDrawdownPct, positiveDayPct: result.positiveDayPct }];
        }));
    }
    const rolling = Object.fromEntries([
        ["jan_feb", Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-03-01T00:00:00Z")],
        ["mar_apr", Date.parse("2026-03-01T00:00:00Z"), Date.parse("2026-05-01T00:00:00Z")],
        ["may_jun", Date.parse("2026-05-01T00:00:00Z"), Date.parse("2026-07-01T00:00:00Z")],
        ["jul_aug", Date.parse("2026-07-01T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z")],
        ["sep_oct", Date.parse("2026-09-01T00:00:00Z"), datasetEnd],
    ].map(([name, from, to]) => {
        const result = simulate({ signals: candidateSignals, data, rules, slots: 1, from, to, experiment: frozen, includeTradeLog: false });
        return [name, { from: new Date(from).toISOString(), to: new Date(to).toISOString(), returnPct: result.returnPct,
            trades: result.trades, profitFactor: result.profitFactor, maxDrawdownPct: result.maxDrawdownPct,
            positiveDayPct: result.positiveDayPct }];
    }));
    const output = rounded({ protocol: "h1-wave-frozen-finalist-replay-v1", generatedAt: new Date().toISOString(),
        candidate: candidateSource, dataEnd: new Date(datasetEnd).toISOString(), candidateSignals: candidateSignals.length,
        selectionDisclosure: "The diagnostic September-October period had already been inspected before this standalone replay; it is evidence of historical consistency, not a fresh holdout.",
        scenarios, bootstrap, rolling, neighborhood });
    fs.mkdirSync(path.dirname(args.candidateReport), { recursive: true });
    fs.writeFileSync(args.candidateReport, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify({ candidateReport: args.candidateReport, candidate: output.candidate,
        scenarios: Object.fromEntries(Object.entries(output.scenarios).map(([scenario, scenarioRows]) => [scenario,
            Object.fromEntries(Object.entries(scenarioRows).map(([name, rows]) => [name, rows.map(({ slots, returnPct, trades, profitFactor, maxDrawdownPct, positiveDayPct }) =>
                ({ slots, returnPct, trades, profitFactor, maxDrawdownPct, positiveDayPct }))]))])) }, null, 2));
}
