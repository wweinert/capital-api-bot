import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ATR, BollingerBands, RSI } from "technicalindicators";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const M15 = 15 * MINUTE;
const H1 = 60 * MINUTE;
const H1_DIRECTION_BARS = 1;
const MIN_H1_TREND_ATR = 0;
const FX_CURRENCIES = new Set(["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"]);
const MAJOR_FX = new Set(["AUDUSD", "EURUSD", "GBPUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"]);
const CONVERSION_SYMBOLS = ["EURAUD", "EURCHF", "EURGBP", "EURJPY", "EURUSD", "NZDUSD", "USDCAD"];

export const RESEARCH_PROTOCOL = Object.freeze({
    schemaVersion: 18,
    name: "current-live-m15-h1-baseline",
    startCapital: 500,
    timeframes: Object.freeze(["M15", "H1"]),
    maxPositions: 5,
    risk: Object.freeze({ maxPerPositionPct: 0.03, maxPortfolioPct: 0.15, marginUtilization: 0.9 }),
    leverage: Object.freeze({ majors: 30, crosses: 20 }),
    execution: "closed M15 signal; M15 bid/ask pending replay; SL-first intrabar ambiguity; trailing updated at M15 close",
    lockedTest: "none-full-period-baseline-is-inspected-after-this-run",
});

const number = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const price = (row, key, side = "bid") =>
    number(row?.[side]?.[key]) ??
    number(row?.[`${key}Price`]?.[side]) ??
    number(row?.[key]?.[side]) ??
    number(row?.[`${key}${side[0].toUpperCase()}${side.slice(1)}`]) ??
    (side === "bid" ? number(row?.[key]) : null);

const timestampOf = (row) => {
    if (row?.timestamp != null) return Date.parse(row.timestamp);
    if (row?.snapshotTimeUTC != null) {
        const value = String(row.snapshotTimeUTC);
        return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
    }
    return Date.parse(row?.snapshotTime);
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function isFxSymbol(symbol) {
    return /^[A-Z]{6}$/.test(symbol) && FX_CURRENCIES.has(symbol.slice(0, 3)) && FX_CURRENCIES.has(symbol.slice(3, 6));
}

export function discoverSymbols(datasetDir) {
    if (!datasetDir || !fs.existsSync(datasetDir)) return [];
    const files = new Set(fs.readdirSync(datasetDir));
    return [...files]
        .map((file) => file.match(/^([A-Z]{6})_M15\.jsonl$/)?.[1])
        .filter(Boolean)
        .filter(isFxSymbol)
        .filter((symbol) => files.has(`${symbol}_H1.jsonl`))
        .sort();
}

function loadRows(file, timeframe) {
    const source = fs.readFileSync(file, "utf8");
    const deduplicated = new Map();
    let malformed = 0;
    let sourceRows = 0;
    for (const line of source.split("\n")) {
        if (!line.trim()) continue;
        sourceRows += 1;
        try {
            const raw = JSON.parse(line);
            const t = timestampOf(raw);
            const open = price(raw, "open");
            const high = price(raw, "high");
            const low = price(raw, "low");
            const close = price(raw, "close");
            const askOpen = price(raw, "open", "ask");
            const askHigh = price(raw, "high", "ask");
            const askLow = price(raw, "low", "ask");
            const askClose = price(raw, "close", "ask");
            const valid = [t, open, high, low, close, askOpen, askHigh, askLow, askClose].every(Number.isFinite);
            if (!valid || high < low || askHigh < askLow || askOpen < open || askClose < close) {
                malformed += 1;
                continue;
            }
            deduplicated.set(t, {
                t,
                timestamp: new Date(t).toISOString(),
                open,
                high,
                low,
                close,
                askOpen,
                askHigh,
                askLow,
                askClose,
                volume: number(raw.volume ?? raw.lastTradedVolume) ?? 0,
            });
        } catch {
            malformed += 1;
        }
    }
    const rows = [...deduplicated.values()].sort((left, right) => left.t - right.t);
    if (!rows.length) throw new Error(`${path.basename(file)} contains no valid bid/ask candles.`);
    const expectedStep = timeframe === "M15" ? M15 : H1;
    let nonMonotonic = 0;
    let unexpectedGaps = 0;
    for (let index = 1; index < rows.length; index += 1) {
        const delta = rows[index].t - rows[index - 1].t;
        if (delta <= 0) nonMonotonic += 1;
        if (delta > expectedStep && delta < 2 * DAY) unexpectedGaps += 1;
    }
    return {
        rows,
        audit: {
            rows: rows.length,
            malformed,
            duplicates: Math.max(0, sourceRows - malformed - rows.length),
            nonMonotonic,
            unexpectedGaps,
            first: new Date(rows[0].t).toISOString(),
            last: new Date(rows.at(-1).t).toISOString(),
            sha256: sha256(source),
        },
    };
}

function atOrBefore(rows, timestamp) {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (rows[middle].t <= timestamp) low = middle + 1;
        else high = middle;
    }
    return low - 1;
}

function latest(series) {
    return series.length ? series[series.length - 1] : null;
}

function minuteUtc(timestamp) {
    const date = new Date(timestamp);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function sessionIsActive(session, timestamp) {
    const minute = minuteUtc(timestamp);
    return session.START < session.END
        ? minute >= session.START && minute < session.END
        : minute >= session.START || minute < session.END;
}

function activeSessions(symbol, sessions, timestamp) {
    return Object.entries(sessions)
        .filter(([, session]) => Array.isArray(session?.SYMBOLS) && session.SYMBOLS.includes(symbol) && sessionIsActive(session, timestamp))
        .map(([name]) => name);
}

const TIME_ZONE_FORMATTERS = new Map();
function minuteIn(timestamp, timeZone) {
    if (!TIME_ZONE_FORMATTERS.has(timeZone)) {
        TIME_ZONE_FORMATTERS.set(timeZone, new Intl.DateTimeFormat("en-GB", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }));
    }
    const parts = Object.fromEntries(TIME_ZONE_FORMATTERS.get(timeZone).formatToParts(timestamp).map(({ type, value }) => [type, value]));
    return Number(parts.hour) * 60 + Number(parts.minute);
}

function patternSide(rows, index) {
    const current = rows[index];
    const follows = (side, candle) => (side === "BUY" ? candle.close > candle.open : candle.close < candle.open);
    const correctionBars = (side) => {
        if (!follows(side, current)) return 0;
        let count = 0;
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            if (follows(side, rows[cursor])) return count;
            count += 1;
        }
        return 0;
    };
    if (correctionBars("BUY") > 0) return "BUY";
    if (correctionBars("SELL") > 0) return "SELL";
    return null;
}

function liveCandidate(symbol, profile, m15Rows, index, h1Rows, h1Index) {
    if (index < 320) return { signal: null, reason: "not_enough_data" };
    const signal = patternSide(m15Rows, index);
    if (!signal) return { signal: null, reason: "pattern_failed" };
    const rows = m15Rows.slice(Math.max(0, index - 321), index + 1);
    if (rows.length < 321) return { signal: null, reason: "not_enough_data" };
    const closes = rows.map((row) => row.close);
    const atrValues = ATR.calculate({ period: 21, high: rows.map((row) => row.high), low: rows.map((row) => row.low), close: closes });
    const atr = latest(atrValues);
    const bb = latest(BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }));
    const rsi = latest(RSI.calculate({ period: 14, values: closes }));
    const current = rows.at(-1);
    const bidPrice = current.close;
    const askPrice = current.askClose;
    if (![atr, bidPrice, askPrice].every(Number.isFinite) || atr <= 0 || askPrice < bidPrice) return { signal: null, reason: "invalid_market_data" };

    const londonMinute = minuteIn(current.t, "Europe/London");
    const newYorkMinute = minuteIn(current.t, "America/New_York");
    const session = newYorkMinute >= 8 * 60 && londonMinute < 17 * 60
        ? "overlap"
        : londonMinute >= 8 * 60 && newYorkMinute < 8 * 60 ? "london" : null;
    if (profile.signal.sessions?.length && !profile.signal.sessions.includes(session)) return { signal: null, reason: "outside_session" };

    const side = signal === "BUY" ? "buy" : "sell";
    const spread = askPrice - bidPrice;
    const spreadAtr = spread / atr;
    const range = current.high - current.low;
    const bodyRatio = Math.abs(current.close - current.open) / range;
    const recent24 = rows.slice(-24);
    const travelled = recent24.slice(1).reduce((sum, candle, cursor) => sum + Math.abs(candle.close - recent24[cursor].close), 0);
    const efficiency = travelled > 0 ? Math.abs(recent24.at(-1).close - recent24[0].open) / travelled : 0;
    const activity = rows.slice(-4).reduce((sum, candle) => sum + candle.high - candle.low, 0) / (4 * atr);
    const rankedAtr = atrValues.slice(-300);
    const atrPercentile = rankedAtr.filter((value) => value <= atr).length / rankedAtr.length;
    const priorVolumes = rows.slice(-21, -1).map((candle) => candle.volume);
    const averageVolume = priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length;
    const volumeRatio = averageVolume > 0 ? current.volume / averageVolume : 0;
    const bollingerRejection = signal === "BUY"
        ? current.low <= bb?.lower && current.close > bb?.lower
        : current.high >= bb?.upper && current.close < bb?.upper;
    const bollingerRoom = signal === "BUY" ? (bb?.upper - current.close - spread) / atr : (current.close - bb?.lower) / atr;
    const rsiExtreme = signal === "BUY" ? rsi <= 30 : rsi >= 70;
    const score = [bollingerRejection || bollingerRoom >= 1, rsiExtreme, volumeRatio >= 1].filter(Boolean).length;

    if (
        ![range, bodyRatio, efficiency, activity, atrPercentile, volumeRatio].every(Number.isFinite) ||
        range <= 0 ||
        spreadAtr > profile.signal.maxSpreadAtr ||
        bodyRatio < Number(profile.signal.minBodyRatio ?? 0) ||
        efficiency < Number(profile.signal.minEfficiency ?? 0) ||
        activity < Number(profile.signal.minActivity ?? 0) ||
        atrPercentile < Number(profile.signal.minAtrPercentile ?? 0) ||
        volumeRatio < Number(profile.signal.minVolumeRatio ?? 0) ||
        score < Number(profile.signal.minScore ?? 0)
    ) return { signal: null, reason: "filters_failed" };

    if (h1Index < H1_DIRECTION_BARS + 21) return { signal: null, reason: "h1_not_ready" };
    const h1Window = h1Rows.slice(Math.max(0, h1Index - 321), h1Index + 1);
    const h1Atr = latest(ATR.calculate({
        period: 21,
        high: h1Window.map((row) => row.high),
        low: h1Window.map((row) => row.low),
        close: h1Window.map((row) => row.close),
    }));
    const h1MoveAtr = (h1Rows[h1Index].close - h1Rows[h1Index - H1_DIRECTION_BARS].close) / h1Atr;
    if (!Number.isFinite(h1MoveAtr) || (side === "buy" ? h1MoveAtr <= MIN_H1_TREND_ATR : h1MoveAtr >= -MIN_H1_TREND_ATR)) {
        return { signal: null, reason: "h1_direction_failed" };
    }

    const entryBuffer = atr * Number(profile.entry.bufferAtr ?? 0);
    const stopBuffer = atr * Number(profile.stop.bufferAtr ?? 0);
    const entryPrice = signal === "BUY" ? current.high + spread + entryBuffer : current.low - entryBuffer;
    const stopLoss = signal === "BUY" ? current.low - stopBuffer : current.high + spread + stopBuffer;
    if (![entryPrice, stopLoss].every(Number.isFinite) || (signal === "BUY" ? stopLoss >= entryPrice : stopLoss <= entryPrice)) return { signal: null, reason: "invalid_entry_or_stop" };
    return {
        symbol,
        signal,
        entryType: profile.entry.type,
        entryPrice,
        stopLoss,
        pendingInvalidationPrice: profile.entry.cancelIfStopTouchedBeforeEntry ? stopLoss : null,
        atr,
        quality: score + efficiency + volumeRatio - spreadAtr,
        bodyRatio,
        spreadAtr,
        reason: "green_red_M15",
    };
}

export function prepare(datasetDir, requestedSymbols, options = {}) {
    if (!datasetDir) throw new Error("A dataset directory is required.");
    const protocol = options.protocol ?? RESEARCH_PROTOCOL;
    const candidate = options.candidate;
    if (!candidate?.profiles || !candidate?.sessions) throw new Error("prepare requires the frozen live candidate profiles and sessions.");
    const available = discoverSymbols(datasetDir);
    const availableSet = new Set(available);
    const requested = [...new Set((requestedSymbols ?? []).map((symbol) => String(symbol).toUpperCase()))];
    const missingSymbols = requested.filter((symbol) => !availableSet.has(symbol));
    const symbols = requested.filter((symbol) => availableSet.has(symbol) && candidate.profiles[symbol]);
    if (!symbols.length) throw new Error("None of the requested live symbols has both M15 and H1 data.");
    const from = options.from ? Date.parse(options.from) : -Infinity;
    const toExclusive = options.to ? Date.parse(options.to) : Infinity;
    if (Number.isNaN(from) || Number.isNaN(toExclusive) || from >= toExclusive) throw new Error("Invalid --from/--to range.");

    const data = new Map();
    const coverage = {};
    for (const symbol of symbols) {
        const m15 = loadRows(path.join(datasetDir, `${symbol}_M15.jsonl`), "M15");
        const h1 = loadRows(path.join(datasetDir, `${symbol}_H1.jsonl`), "H1");
        data.set(symbol, { M15: m15.rows, H1: h1.rows });
        coverage[symbol] = { M15: m15.audit, H1: h1.audit };
    }
    const conversionData = new Map();
    for (const symbol of CONVERSION_SYMBOLS) {
        if (!availableSet.has(symbol)) continue;
        if (data.has(symbol)) {
            conversionData.set(symbol, data.get(symbol).M15);
            continue;
        }
        const loaded = loadRows(path.join(datasetDir, `${symbol}_M15.jsonl`), "M15");
        conversionData.set(symbol, loaded.rows);
        coverage[symbol] ??= {};
        coverage[symbol].M15 = { ...loaded.audit, conversionOnly: true };
    }

    const commonStart = Math.max(...symbols.map((symbol) => data.get(symbol).M15[0].t));
    const commonEnd = Math.min(...symbols.map((symbol) => data.get(symbol).M15.at(-1).t + M15));
    const evaluationStart = Math.max(from, commonStart);
    const evaluationEndExclusive = Math.min(toExclusive, commonEnd);
    const events = [];
    const signalAudit = Object.fromEntries(symbols.map((symbol) => [symbol, { evaluatedCloses: 0, patternSignals: 0, candidates: 0 }]));
    for (const symbol of symbols) {
        const profile = candidate.profiles[symbol];
        const { M15: m15Rows, H1: h1Rows } = data.get(symbol);
        for (let index = 320; index < m15Rows.length; index += 1) {
            const decision = m15Rows[index].t + M15;
            if (decision < evaluationStart || decision >= evaluationEndExclusive) continue;
            const sessions = activeSessions(symbol, candidate.sessions, decision);
            if (!sessions.length) continue;
            signalAudit[symbol].evaluatedCloses += 1;
            if (!patternSide(m15Rows, index)) continue;
            signalAudit[symbol].patternSignals += 1;
            const h1Index = atOrBefore(h1Rows, decision - H1);
            const result = liveCandidate(symbol, profile, m15Rows, index, h1Rows, h1Index);
            if (!result.signal) continue;
            signalAudit[symbol].candidates += 1;
            events.push({ t: decision, symbol, sessions, profile, ...result });
        }
    }
    events.sort((left, right) => left.t - right.t || right.quality - left.quality || left.symbol.localeCompare(right.symbol));
    return {
        protocol,
        candidate,
        data,
        conversionData,
        events,
        symbols,
        requestedSymbols: requested,
        availableSymbols: available,
        missingSymbols,
        coverage,
        datasetFingerprint: sha256(JSON.stringify(coverage)),
        signalAudit,
        start: evaluationStart,
        endExclusive: evaluationEndExclusive,
    };
}

export function validateCandidateConfig(candidate, protocol = RESEARCH_PROTOCOL) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Candidate must be an object.");
    if (candidate.startCapital !== protocol.startCapital) throw new Error(`Starting capital is fixed at EUR ${protocol.startCapital}.`);
    if (candidate.maxPositions !== protocol.maxPositions) throw new Error(`maxPositions must remain ${protocol.maxPositions}.`);
    if (!(candidate.maxPortfolioRiskPct > 0 && candidate.maxPortfolioRiskPct <= protocol.risk.maxPortfolioPct)) throw new Error(`maxPortfolioRiskPct must be in (0, ${protocol.risk.maxPortfolioPct}].`);
    if (!candidate.profiles || !candidate.sessions || !candidate.riskRules || !candidate.portfolioRules) throw new Error("Candidate is missing a live profiles/sessions/risk snapshot.");
    return true;
}

function roundPrice(value, symbol) {
    return Number(Number(value).toFixed(symbol.includes("JPY") ? 3 : 5));
}

function isoWeekStart(timestamp) {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return date.getTime();
}

function keyCount(map, key) {
    return map.get(key) ?? 0;
}

function increment(map, key, amount = 1) {
    map.set(key, keyCount(map, key) + amount);
}

function statsForTrades(trades) {
    const wins = trades.filter((trade) => trade.pnl > 0);
    const losses = trades.filter((trade) => trade.pnl < 0);
    const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
    const grossLoss = losses.reduce((sum, trade) => sum + trade.pnl, 0);
    return {
        trades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: trades.length ? +(100 * wins.length / trades.length).toFixed(2) : 0,
        pnl: +trades.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2),
        r: +trades.reduce((sum, trade) => sum + trade.r, 0).toFixed(3),
        profitFactor: grossLoss < 0 ? +(grossProfit / Math.abs(grossLoss)).toFixed(3) : grossProfit > 0 ? 10 : 0,
    };
}

function align(length, values) {
    const output = Array(length).fill(null);
    const offset = length - values.length;
    for (let index = 0; index < values.length; index += 1) output[index + offset] = values[index];
    return output;
}

function enrichProfileRows(rows) {
    const highs = rows.map((row) => row.high);
    const lows = rows.map((row) => row.low);
    const closes = rows.map((row) => row.close);
    const atr = align(rows.length, ATR.calculate({ period: 21, high: highs, low: lows, close: closes }));
    const bollinger = align(rows.length, BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }));
    const rsi = align(rows.length, RSI.calculate({ period: 14, values: closes }));
    return rows.map((row, index) => {
        const recentAtr = atr.slice(Math.max(0, index - 299), index + 1).filter(Number.isFinite);
        const atrPercentile = recentAtr.length && Number.isFinite(atr[index])
            ? recentAtr.filter((value) => value <= atr[index]).length / recentAtr.length
            : null;
        const recent24 = rows.slice(Math.max(0, index - 23), index + 1);
        const travelled = recent24.slice(1).reduce((sum, candle, cursor) => sum + Math.abs(candle.close - recent24[cursor].close), 0);
        const efficiency = recent24.length === 24 && travelled > 0 ? Math.abs(recent24.at(-1).close - recent24[0].open) / travelled : null;
        const recent4 = rows.slice(Math.max(0, index - 3), index + 1);
        const activity = recent4.length === 4 && atr[index] > 0
            ? recent4.reduce((sum, candle) => sum + candle.high - candle.low, 0) / (4 * atr[index])
            : null;
        const priorVolumes = rows.slice(Math.max(0, index - 20), index).map((candle) => candle.volume);
        const averageVolume = priorVolumes.length ? priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length : 0;
        const volumeRatio = averageVolume > 0 ? row.volume / averageVolume : null;
        const range = row.high - row.low;
        return {
            ...row,
            atr: atr[index],
            bollinger: bollinger[index],
            rsi: rsi[index],
            atrPercentile,
            efficiency,
            activity,
            volumeRatio,
            bodyRatio: range > 0 ? Math.abs(row.close - row.open) / range : null,
            bodyAtr: atr[index] > 0 ? Math.abs(row.close - row.open) / atr[index] : null,
        };
    });
}

function marketSession(timestamp) {
    const londonMinute = minuteIn(timestamp, "Europe/London");
    const newYorkMinute = minuteIn(timestamp, "America/New_York");
    if (londonMinute < 8 * 60) return "asia";
    if (newYorkMinute < 8 * 60) return "london";
    if (londonMinute < 17 * 60) return "overlap";
    if (newYorkMinute < 17 * 60) return "newYork";
    return "offHours";
}

function priceActionContinuation(rows, index, side) {
    const signal = rows[index];
    if (!signal?.atr) return null;
    const follows = (row) => side === "BUY" ? row.close > row.open : row.close < row.open;
    const opposes = (row) => side === "BUY" ? row.close < row.open : row.close > row.open;
    if (!follows(signal)) return null;
    let pullbackBars = 0;
    for (let cursor = index - 1; cursor >= 0 && opposes(rows[cursor]); cursor -= 1) pullbackBars += 1;
    if (pullbackBars < 1 || pullbackBars > 6) return null;
    const impulseEnd = index - pullbackBars - 1;
    if (impulseEnd < 8 || !follows(rows[impulseEnd])) return null;
    let impulseStart = impulseEnd;
    while (impulseStart > 0 && impulseEnd - impulseStart < 5 && follows(rows[impulseStart - 1])) impulseStart -= 1;
    const context = rows.slice(Math.max(0, impulseStart - 72), impulseEnd + 1);
    const impulse = rows.slice(impulseStart, impulseEnd + 1);
    const pullback = rows.slice(impulseEnd + 1, index);
    if (side === "SELL") {
        const priorSwing = Math.max(...context.map((row) => row.high));
        const impulseExtreme = Math.min(...impulse.map((row) => row.low));
        const pullbackExtreme = Math.max(...pullback.map((row) => row.high));
        const impulseAtr = (priorSwing - impulseExtreme) / signal.atr;
        return { pullbackBars, impulseAtr, swingGapAtr: (priorSwing - pullbackExtreme) / signal.atr, retrace: impulseAtr > 0 ? (pullbackExtreme - impulseExtreme) / (priorSwing - impulseExtreme) : null };
    }
    const priorSwing = Math.min(...context.map((row) => row.low));
    const impulseExtreme = Math.max(...impulse.map((row) => row.high));
    const pullbackExtreme = Math.min(...pullback.map((row) => row.low));
    const impulseAtr = (impulseExtreme - priorSwing) / signal.atr;
    return { pullbackBars, impulseAtr, swingGapAtr: (pullbackExtreme - priorSwing) / signal.atr, retrace: impulseAtr > 0 ? (impulseExtreme - pullbackExtreme) / (impulseExtreme - priorSwing) : null };
}

function previousSessionContext(rows, index) {
    const currentSession = marketSession(rows[index].t);
    let cursor = index;
    while (cursor >= 0 && marketSession(rows[cursor].t) === currentSession) cursor -= 1;
    const sessionStart = cursor + 1;
    while (cursor >= 0 && marketSession(rows[cursor].t) === "offHours") cursor -= 1;
    if (cursor < 0) return null;
    const previousName = marketSession(rows[cursor].t);
    const previous = [];
    while (cursor >= 0 && marketSession(rows[cursor].t) === previousName) previous.push(rows[cursor--]);
    return {
        ageMinutes: (rows[index].t - rows[sessionStart].t) / MINUTE,
        high: Math.max(...previous.map((row) => row.high)),
        low: Math.min(...previous.map((row) => row.low)),
    };
}

function normalizeStoredProfile(symbol, stored) {
    const controls = stored.controls ?? {};
    const management = stored.management ?? {};
    const entry = stored.entry ?? {};
    const stop = stored.stop ?? entry;
    return {
        source: stored,
        riskPct: Number(controls.researchRiskPct ?? controls.riskPct ?? 0.01),
        entryOffsetAtr: Number(entry.pendingOffsetAtr ?? entry.offsetAtr ?? 0),
        expiryMinutes: Number(entry.pendingExpiryMinutes ?? entry.expiryMinutes ?? 15 * (entry.signal?.pendingBars ?? 1)),
        stopBufferAtr: Number(stop.bufferAtr ?? entry.stopBufferAtr ?? 0),
        management: {
            partialAtR: number(management.partialAtR),
            partialFraction: Number(management.partialFraction ?? 0),
            moveStopToBreakEvenAfterPartial: management.moveStopToBreakEvenAfterPartial === true,
            runnerTrailAtr: number(management.runnerTrailAtr ?? management.trailAtr),
            fixedFinalTargetR: number(management.fixedFinalTargetR ?? management.targetR),
            breakEvenAtR: number(management.breakEvenAtR),
            breakEvenDelayMinutes: Number(management.breakEvenDelayMinutes ?? 0),
            maxHoldMinutes: Number(management.maxHoldMinutes ?? management.maximumHoldMinutes ?? 360),
        },
        symbol,
    };
}

function storedProfileSignal(symbol, stored, rows, index, h1Rows, h1Index) {
    const current = rows[index];
    if (!(current?.atr > 0) || h1Index < 22) return null;
    const side = patternSide(rows, index);
    const priceActionBuy = priceActionContinuation(rows, index, "BUY");
    const priceActionSell = priceActionContinuation(rows, index, "SELL");
    const isPriceAction = symbol === "AUDUSD" || symbol === "EURUSD";
    const signal = isPriceAction ? (priceActionBuy ? "BUY" : priceActionSell ? "SELL" : null) : side;
    if (!signal) return null;
    const h1Window = h1Rows.slice(Math.max(0, h1Index - 50), h1Index + 1);
    const h1Atr = latest(ATR.calculate({ period: 21, high: h1Window.map((row) => row.high), low: h1Window.map((row) => row.low), close: h1Window.map((row) => row.close) }));
    const h1Move = (h1Rows[h1Index].close - h1Rows[h1Index - 1].close) / h1Atr;
    if (!Number.isFinite(h1Move) || (signal === "BUY" ? h1Move <= 0 : h1Move >= 0)) return null;
    const session = marketSession(current.t);
    const allowedSessions = stored.activeSessions ?? stored.allowedSessions;
    if (allowedSessions?.length && !allowedSessions.includes(session)) return null;
    const spreadAtr = (current.askClose - current.close) / current.atr;
    const bollingerRoom = signal === "BUY"
        ? (current.bollinger?.upper - current.askClose) / current.atr
        : (current.close - current.bollinger?.lower) / current.atr;
    const bollingerRejection = signal === "BUY"
        ? current.low <= current.bollinger?.lower && current.close > current.bollinger?.lower
        : current.high >= current.bollinger?.upper && current.close < current.bollinger?.upper;
    const rsiExtreme = signal === "BUY" ? current.rsi <= 30 : current.rsi >= 70;
    const score = [bollingerRejection || bollingerRoom >= 1, rsiExtreme, current.volumeRatio >= 1].filter(Boolean).length;
    const setup = signal === "BUY" ? priceActionBuy : priceActionSell;

    if (symbol === "EURUSD") {
        const config = stored.entry.signal;
        if (!setup || setup.pullbackBars < config.minPullbackBars || setup.pullbackBars > config.maxPullbackBars || setup.impulseAtr < config.minImpulseAtr || setup.swingGapAtr < config.minSwingGapAtr || setup.retrace > config.maxRetrace || current.bodyRatio < config.minBodyRatio || spreadAtr > config.maxSpreadAtr || bollingerRoom < stored.entry.scoring.minBandRoomAtr) return null;
    } else if (symbol === "AUDUSD") {
        const config = stored.signal;
        const previous = previousSessionContext(rows, index);
        const room = signal === "BUY" ? (previous?.high - current.askClose) / current.atr : (current.close - previous?.low) / current.atr;
        if (!setup || setup.impulseAtr <= 0 || setup.swingGapAtr <= 0 || current.bodyAtr < config.minSignalBodyAtr || current.atrPercentile > config.maxAtrPercentile || !previous || previous.ageMinutes < config.minSessionAgeMinutes || room < config.previousSessionRoomAtr) return null;
    } else {
        const filters = stored.filters ?? stored;
        if (spreadAtr > filters.maximumSpreadAtr || current.bodyRatio < filters.minimumSignalBodyRatio || current.atrPercentile < filters.minimumM15AtrPercentile300 || current.efficiency < filters.minimumM15Efficiency24 || current.activity < filters.minimumM15Activity4 || (filters.minimumVolumeRatio20 != null && current.volumeRatio < filters.minimumVolumeRatio20) || score < filters.minimumM15IndicatorScore) return null;
    }

    const normalized = normalizeStoredProfile(symbol, stored);
    const entryBuffer = current.atr * normalized.entryOffsetAtr;
    const stopBuffer = current.atr * normalized.stopBufferAtr;
    const entryPrice = signal === "BUY" ? current.askHigh + entryBuffer : current.low - entryBuffer;
    const stopLoss = signal === "BUY" ? current.low - stopBuffer : current.askHigh + stopBuffer;
    if (!(signal === "BUY" ? stopLoss < entryPrice : stopLoss > entryPrice)) return null;
    return { symbol, signal, entryPrice, stopLoss, atr: current.atr, quality: 100 * (setup?.impulseAtr ?? 0) + 10 * score + Math.abs(h1Move) - spreadAtr, session, normalized };
}

export function preparePairProfiles(datasetDir, profileDocuments, options = {}) {
    const requestedSymbols = Object.keys(profileDocuments);
    const activeSymbols = requestedSymbols.filter((symbol) => profileDocuments[symbol]?.profile);
    const disabledSymbols = requestedSymbols.filter((symbol) => !profileDocuments[symbol]?.profile);
    const available = discoverSymbols(datasetDir);
    const missingSymbols = activeSymbols.filter((symbol) => !available.includes(symbol));
    const symbols = activeSymbols.filter((symbol) => available.includes(symbol));
    if (!symbols.length) throw new Error("No active pair profile has both M15 and H1 data.");
    const from = options.from ? Date.parse(options.from) : -Infinity;
    const toExclusive = options.to ? Date.parse(options.to) : Infinity;
    if (Number.isNaN(from) || Number.isNaN(toExclusive) || from >= toExclusive) throw new Error("Invalid pair-profile --from/--to range.");
    const data = new Map();
    const coverage = {};
    for (const symbol of symbols) {
        const m15 = loadRows(path.join(datasetDir, `${symbol}_M15.jsonl`), "M15");
        const h1 = loadRows(path.join(datasetDir, `${symbol}_H1.jsonl`), "H1");
        data.set(symbol, { M15: enrichProfileRows(m15.rows), H1: h1.rows });
        coverage[symbol] = { M15: m15.audit, H1: h1.audit };
    }
    const conversionData = new Map();
    for (const symbol of CONVERSION_SYMBOLS) {
        if (!available.includes(symbol)) continue;
        const rows = data.get(symbol)?.M15 ?? loadRows(path.join(datasetDir, `${symbol}_M15.jsonl`), "M15").rows;
        conversionData.set(symbol, rows);
    }
    const commonStart = Math.max(...symbols.map((symbol) => data.get(symbol).M15[0].t));
    const commonEnd = Math.min(...symbols.map((symbol) => data.get(symbol).M15.at(-1).t + M15));
    const start = Math.max(from, commonStart);
    const endExclusive = Math.min(toExclusive, commonEnd);
    const events = [];
    const signalAudit = Object.fromEntries(requestedSymbols.map((symbol) => [symbol, { active: !disabledSymbols.includes(symbol), evaluatedCloses: 0, candidates: 0 }]));
    for (const symbol of symbols) {
        const { M15: rows, H1: h1Rows } = data.get(symbol);
        const stored = profileDocuments[symbol].profile;
        for (let index = 320; index < rows.length; index += 1) {
            const decision = rows[index].t + M15;
            if (decision < start || decision >= endExclusive) continue;
            signalAudit[symbol].evaluatedCloses += 1;
            const h1Index = atOrBefore(h1Rows, decision - H1);
            const event = storedProfileSignal(symbol, stored, rows, index, h1Rows, h1Index);
            if (!event) continue;
            signalAudit[symbol].candidates += 1;
            events.push({ t: decision, ...event });
        }
    }
    events.sort((left, right) => left.t - right.t || right.quality - left.quality || left.symbol.localeCompare(right.symbol));
    return { protocol: RESEARCH_PROTOCOL, profileDocuments, data, conversionData, events, symbols, requestedSymbols, disabledSymbols, missingSymbols, coverage, signalAudit, start, endExclusive, datasetFingerprint: sha256(JSON.stringify(coverage)) };
}

export function evaluatePairProfiles(prepared, options = {}) {
    const { data, conversionData, events, symbols, start, endExclusive } = prepared;
    const maxPositions = Number(options.maxPositions ?? 5);
    const maxPortfolioRiskPct = Number(options.maxPortfolioRiskPct ?? 0.15);
    const startCapital = Number(options.startCapital ?? 500);
    const groups = new Map();
    for (const event of events) groups.set(event.t, [...(groups.get(event.t) ?? []), event]);
    for (const group of groups.values()) group.sort((left, right) => right.quality - left.quality || left.symbol.localeCompare(right.symbol));
    const barsBySymbol = new Map(symbols.map((symbol) => [symbol, new Map(data.get(symbol).M15.map((bar) => [bar.t, bar]))]));
    const timeline = [...new Set(symbols.flatMap((symbol) => data.get(symbol).M15.map((bar) => bar.t).filter((time) => time >= start && time < endExclusive)))].sort((left, right) => left - right);
    const positions = [];
    const pending = [];
    const trades = [];
    const rejections = new Map();
    const orders = { placed: 0, filled: 0, expired: 0, endCancelled: 0 };
    let balance = startCapital;
    let peak = balance;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    let maxPortfolioRisk = 0;
    let maxPositionRisk = 0;
    let maxMargin = 0;
    let sequence = 0;
    const reservedRisk = () => [...positions, ...pending].reduce((sum, item) => sum + item.risk, 0);
    const reservedMargin = () => [...positions, ...pending].reduce((sum, item) => sum + item.margin, 0);
    const occupied = () => new Set([...positions, ...pending].map((item) => item.symbol));
    const reject = (reason) => increment(rejections, reason);
    const midAt = (symbol, timestamp) => {
        const rows = conversionData.get(symbol) ?? data.get(symbol)?.M15;
        const index = rows ? atOrBefore(rows, timestamp) : -1;
        return index >= 0 ? (rows[index].close + rows[index].askClose) / 2 : null;
    };
    const quotePerEurAt = (symbol, timestamp) => {
        const quote = symbol.slice(3, 6);
        if (quote === "EUR") return 1;
        const direct = midAt(`EUR${quote}`, timestamp);
        if (direct > 0) return direct;
        const inverse = midAt(`${quote}EUR`, timestamp);
        if (inverse > 0) return 1 / inverse;
        const eurUsd = midAt("EURUSD", timestamp);
        if (!(eurUsd > 0)) return null;
        if (quote === "USD") return eurUsd;
        const usdQuote = midAt(`USD${quote}`, timestamp);
        if (usdQuote > 0) return eurUsd * usdQuote;
        const quoteUsd = midAt(`${quote}USD`, timestamp);
        return quoteUsd > 0 ? eurUsd / quoteUsd : null;
    };
    const auditExposure = () => {
        const capital = Math.max(balance, Number.EPSILON);
        maxPortfolioRisk = Math.max(maxPortfolioRisk, reservedRisk() / capital);
        maxMargin = Math.max(maxMargin, reservedMargin() / capital);
        for (const item of [...positions, ...pending]) maxPositionRisk = Math.max(maxPositionRisk, item.risk / capital);
    };
    const realize = (position, timestamp, exitPrice, closeSize) => {
        const quotePerEur = quotePerEurAt(position.symbol, timestamp) ?? position.quotePerEur;
        const pnl = (position.side === "BUY" ? exitPrice - position.entry : position.entry - exitPrice) * closeSize / quotePerEur;
        balance += pnl;
        position.realizedPnl += pnl;
        peak = Math.max(peak, balance);
        const drawdown = peak - balance;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
        maxDrawdownPct = Math.max(maxDrawdownPct, 100 * drawdown / Math.max(peak, 1));
        return pnl;
    };
    const closePosition = (position, timestamp, exitPrice, reason) => {
        realize(position, timestamp, exitPrice, position.size);
        trades.push({ id: position.id, symbol: position.symbol, side: position.side, signalAt: new Date(position.signalAt).toISOString(), opened: new Date(position.opened).toISOString(), closed: new Date(timestamp).toISOString(), entry: position.entry, initialStop: position.initialStop, exit: exitPrice, initialSize: position.initialSize, riskEur: position.initialRisk, pnl: position.realizedPnl, r: position.realizedPnl / position.initialRisk, reason, balanceAfter: balance, partialTaken: position.partialTaken });
        positions.splice(positions.indexOf(position), 1);
        auditExposure();
    };
    const sizeOrder = (event, timestamp) => {
        const distance = Math.abs(event.entryPrice - event.stopLoss);
        const quotePerEur = quotePerEurAt(event.symbol, timestamp);
        if (!(distance > 0 && quotePerEur > 0 && balance > 0)) return null;
        const requestedRisk = balance * Math.min(event.normalized.riskPct, 0.03);
        const riskBudget = Math.min(requestedRisk, Math.max(0, balance * maxPortfolioRiskPct - reservedRisk()));
        const leverage = MAJOR_FX.has(event.symbol) ? 30 : 20;
        const marginBudget = Math.min(Math.max(0, balance * 0.9 - reservedMargin()), balance * 0.9 / maxPositions);
        const riskSize = riskBudget * quotePerEur / distance;
        const marginSize = marginBudget * leverage * quotePerEur / event.entryPrice;
        const size = Math.floor(Math.min(riskSize, marginSize) / 100) * 100;
        if (size < 100) return null;
        return { size, quotePerEur, risk: size * distance / quotePerEur, margin: size * event.entryPrice / quotePerEur / leverage };
    };
    const place = (timestamp) => {
        for (const event of groups.get(timestamp) ?? []) {
            if (positions.length + pending.length >= maxPositions) { reject("portfolio_full"); break; }
            if (occupied().has(event.symbol)) { reject("symbol_occupied"); continue; }
            const sizing = sizeOrder(event, timestamp);
            if (!sizing) { reject("position_sizing_failed"); continue; }
            pending.push({ id: sequence++, signalAt: timestamp, symbol: event.symbol, side: event.signal, entry: roundPrice(event.entryPrice, event.symbol), stop: roundPrice(event.stopLoss, event.symbol), expiresAt: timestamp + event.normalized.expiryMinutes * MINUTE, normalized: event.normalized, signalAtr: event.atr, ...sizing });
            orders.placed += 1;
            auditExposure();
        }
    };
    const fill = (timestamp) => {
        for (const order of [...pending]) {
            const bar = barsBySymbol.get(order.symbol).get(timestamp);
            if (!bar) continue;
            const touched = order.side === "BUY" ? bar.askHigh >= order.entry : bar.low <= order.entry;
            if (!touched) continue;
            pending.splice(pending.indexOf(order), 1);
            const distance = Math.abs(order.entry - order.stop);
            positions.push({ ...order, opened: timestamp, initialStop: order.stop, activeStop: order.stop, initialDistance: distance, initialRisk: order.risk, initialSize: order.size, realizedPnl: 0, partialTaken: false, breakEvenMoved: false });
            orders.filled += 1;
            auditExposure();
        }
    };
    const replay = (timestamp) => {
        for (const position of [...positions]) {
            const bar = barsBySymbol.get(position.symbol).get(timestamp);
            if (!bar) continue;
            const stopTouched = position.side === "BUY" ? bar.low <= position.activeStop : bar.askHigh >= position.activeStop;
            if (stopTouched) {
                const fillPrice = position.side === "BUY" ? Math.min(position.activeStop, bar.open) : Math.max(position.activeStop, bar.askOpen);
                closePosition(position, timestamp + M15, fillPrice, position.breakEvenMoved ? "managed_stop" : "stop_loss");
                continue;
            }
            const management = position.normalized.management;
            const targetR = management.fixedFinalTargetR;
            const target = targetR == null ? null : position.side === "BUY" ? position.entry + targetR * position.initialDistance : position.entry - targetR * position.initialDistance;
            if (target != null && (position.side === "BUY" ? bar.high >= target : bar.askLow <= target)) {
                closePosition(position, timestamp + M15, target, "take_profit");
                continue;
            }
            if (!position.partialTaken && management.partialAtR != null) {
                const partialPrice = position.side === "BUY" ? position.entry + management.partialAtR * position.initialDistance : position.entry - management.partialAtR * position.initialDistance;
                const hit = position.side === "BUY" ? bar.high >= partialPrice : bar.askLow <= partialPrice;
                if (hit) {
                    const closeSize = Math.floor(position.initialSize * management.partialFraction / 100) * 100;
                    if (closeSize > 0 && closeSize < position.size) {
                        realize(position, timestamp + M15, partialPrice, closeSize);
                        position.size -= closeSize;
                        position.margin *= position.size / (position.size + closeSize);
                    }
                    position.partialTaken = true;
                    if (management.moveStopToBreakEvenAfterPartial) {
                        position.activeStop = position.entry;
                        position.breakEvenMoved = true;
                    }
                }
            }
            const ageMinutes = (timestamp + M15 - position.opened) / MINUTE;
            if (!position.breakEvenMoved && management.breakEvenAtR != null && ageMinutes >= management.breakEvenDelayMinutes) {
                const breakEvenPrice = position.side === "BUY" ? position.entry + management.breakEvenAtR * position.initialDistance : position.entry - management.breakEvenAtR * position.initialDistance;
                if (position.side === "BUY" ? bar.high >= breakEvenPrice : bar.askLow <= breakEvenPrice) {
                    position.activeStop = position.entry;
                    position.breakEvenMoved = true;
                }
            }
            if (position.partialTaken && management.runnerTrailAtr != null) {
                const nextStop = position.side === "BUY" ? bar.high - management.runnerTrailAtr * bar.atr : bar.askLow + management.runnerTrailAtr * bar.atr;
                position.activeStop = position.side === "BUY" ? Math.max(position.activeStop, nextStop) : Math.min(position.activeStop, nextStop);
            }
            if (ageMinutes >= management.maxHoldMinutes) closePosition(position, timestamp + M15, position.side === "BUY" ? bar.close : bar.askClose, "max_hold");
        }
    };
    for (const timestamp of timeline) {
        for (const order of [...pending]) {
            if (order.expiresAt > timestamp) continue;
            pending.splice(pending.indexOf(order), 1);
            orders.expired += 1;
        }
        place(timestamp);
        fill(timestamp);
        replay(timestamp);
    }
    orders.endCancelled = pending.length;
    pending.length = 0;
    for (const position of [...positions]) {
        const rows = data.get(position.symbol).M15;
        const bar = rows[Math.max(0, atOrBefore(rows, endExclusive - 1))];
        closePosition(position, bar.t + M15, position.side === "BUY" ? bar.close : bar.askClose, "end_of_data");
    }
    const baseStats = statsForTrades(trades);
    const durationDays = Math.max(1, (endExclusive - start) / DAY);
    return {
        start: new Date(start).toISOString(), endExclusive: new Date(endExclusive).toISOString(), durationDays: +durationDays.toFixed(2), startCapital, finalBalance: +balance.toFixed(2), pnl: +(balance - startCapital).toFixed(2), returnPct: +(100 * (balance - startCapital) / startCapital).toFixed(2), entries: orders.filled, tradesPerDay: +(orders.filled / durationDays).toFixed(3), ...baseStats, maxDrawdownEur: +maxDrawdown.toFixed(2), maxDrawdownPct: +maxDrawdownPct.toFixed(2), risk: { maxPositionPct: +(100 * maxPositionRisk).toFixed(3), maxPortfolioPct: +(100 * maxPortfolioRisk).toFixed(3), maxMarginUsagePct: +(100 * maxMargin).toFixed(3) }, orders, rejections: Object.fromEntries([...rejections].sort(([left], [right]) => left.localeCompare(right))), symbolStats: Object.fromEntries(prepared.requestedSymbols.map((symbol) => [symbol, statsForTrades(trades.filter((trade) => trade.symbol === symbol))])), trades,
    };
}

export function evaluate(prepared, candidate = prepared.candidate) {
    validateCandidateConfig(candidate, prepared.protocol);
    const { data, conversionData, events, symbols, start, endExclusive, protocol } = prepared;
    const eventGroups = new Map();
    for (const event of events) {
        const group = eventGroups.get(event.t) ?? [];
        group.push(event);
        eventGroups.set(event.t, group);
    }
    for (const group of eventGroups.values()) group.sort((left, right) => right.quality - left.quality || left.symbol.localeCompare(right.symbol));
    const timeline = [...new Set(symbols.flatMap((symbol) => data.get(symbol).M15.map((bar) => bar.t).filter((t) => t >= start && t < endExclusive)))].sort((a, b) => a - b);
    const barsBySymbol = new Map(symbols.map((symbol) => [symbol, new Map(data.get(symbol).M15.map((bar) => [bar.t, bar]))]));
    const positions = [];
    const pending = [];
    const trades = [];
    const dailyPnl = new Map();
    const weeklyPnl = new Map();
    const rejections = new Map();
    const orderAudit = { placed: 0, filled: 0, expired: 0, dailyCancelled: 0, weekendCancelled: 0, endCancelled: 0 };
    let balance = candidate.startCapital;
    let peakBalance = balance;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    let maxOpenRiskPct = 0;
    let maxPositionRiskPct = 0;
    let maxMarginUsagePct = 0;
    let sequence = 0;

    const reservedMargin = () => [...positions, ...pending].reduce((sum, item) => sum + item.margin, 0);
    const reservedRisk = () => [...positions, ...pending].reduce((sum, item) => sum + item.risk, 0);
    const occupiedSymbols = () => new Set([...positions.map((item) => item.symbol), ...pending.map((item) => item.symbol)]);
    const reject = (reason) => increment(rejections, reason);
    const midAt = (symbol, timestamp) => {
        const rows = conversionData.get(symbol) ?? data.get(symbol)?.M15;
        if (!rows?.length) return null;
        const index = atOrBefore(rows, timestamp);
        if (index < 0) return null;
        return (rows[index].close + rows[index].askClose) / 2;
    };
    const quotePerEurAt = (symbol, timestamp) => {
        const quote = symbol.slice(3, 6);
        if (quote === "EUR") return 1;
        const direct = midAt(`EUR${quote}`, timestamp);
        if (Number.isFinite(direct) && direct > 0) return direct;
        const inverse = midAt(`${quote}EUR`, timestamp);
        if (Number.isFinite(inverse) && inverse > 0) return 1 / inverse;
        const eurUsd = midAt("EURUSD", timestamp);
        if (!(Number.isFinite(eurUsd) && eurUsd > 0)) return null;
        if (quote === "USD") return eurUsd;
        const usdQuote = midAt(`USD${quote}`, timestamp);
        if (Number.isFinite(usdQuote) && usdQuote > 0) return eurUsd * usdQuote;
        const quoteUsd = midAt(`${quote}USD`, timestamp);
        if (Number.isFinite(quoteUsd) && quoteUsd > 0) return eurUsd / quoteUsd;
        return null;
    };
    const updateExposureAudit = () => {
        const capital = Math.max(balance, Number.EPSILON);
        maxOpenRiskPct = Math.max(maxOpenRiskPct, reservedRisk() / capital);
        for (const item of [...positions, ...pending]) maxPositionRiskPct = Math.max(maxPositionRiskPct, item.risk / capital);
        maxMarginUsagePct = Math.max(maxMarginUsagePct, reservedMargin() / capital);
    };
    const closePosition = (position, timestamp, exitPrice, reason) => {
        const quotePerEur = quotePerEurAt(position.symbol, timestamp) ?? position.quotePerEur;
        const pnlQuote = (position.side === "BUY" ? exitPrice - position.entry : position.entry - exitPrice) * position.size;
        const pnl = pnlQuote / quotePerEur;
        balance += pnl;
        peakBalance = Math.max(peakBalance, balance);
        const drawdown = peakBalance - balance;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
        maxDrawdownPct = Math.max(maxDrawdownPct, 100 * drawdown / Math.max(peakBalance, 1));
        const dayKey = new Date(timestamp).toISOString().slice(0, 10);
        increment(dailyPnl, dayKey, pnl);
        increment(weeklyPnl, isoWeekStart(timestamp), pnl);
        trades.push({
            id: position.id,
            symbol: position.symbol,
            side: position.side,
            signalAt: new Date(position.signalAt).toISOString(),
            opened: new Date(position.opened).toISOString(),
            closed: new Date(timestamp).toISOString(),
            entry: position.entry,
            stop: position.initialStop,
            target: position.target,
            exit: exitPrice,
            size: position.size,
            riskEur: position.risk,
            pnl,
            r: pnl / position.risk,
            reason,
            balanceAfter: balance,
        });
        positions.splice(positions.indexOf(position), 1);
        updateExposureAudit();
    };
    const cancelOrder = (order, reason) => {
        const index = pending.indexOf(order);
        if (index >= 0) pending.splice(index, 1);
        orderAudit[reason] += 1;
    };
    const forceFlatAtOpen = (timestamp) => {
        const date = new Date(timestamp);
        const minute = minuteUtc(timestamp);
        const fridayClose = date.getUTCDay() === 5 && minute >= candidate.riskRules.FRIDAY_CLOSE_HOUR_UTC * 60;
        const dailyClose = candidate.riskRules.DAILY_FORCED_CLOSE_UTC && minute >= candidate.riskRules.DAILY_CLOSE_MINUTE_UTC;
        if (!fridayClose && !dailyClose) return;
        for (const order of [...pending]) cancelOrder(order, fridayClose ? "weekendCancelled" : "dailyCancelled");
        for (const position of [...positions]) {
            const bar = barsBySymbol.get(position.symbol).get(timestamp);
            if (!bar) continue;
            closePosition(position, timestamp, position.side === "BUY" ? bar.open : bar.askOpen, fridayClose ? "weekend_flat" : "daily_flat");
        }
    };
    const sizeOrder = (event, timestamp, entry, stop) => {
        const profileRisk = Number(event.profile.risk.perTrade);
        const riskPct = Math.min(profileRisk, protocol.risk.maxPerPositionPct);
        if (!(riskPct > 0) || !(balance > 0)) return null;
        const distance = Math.abs(entry - stop);
        const quotePerEur = quotePerEurAt(event.symbol, timestamp);
        if (!(distance > 0) || !(quotePerEur > 0)) return null;
        const requestedRisk = balance * riskPct;
        const portfolioRiskAvailable = Math.max(0, balance * candidate.maxPortfolioRiskPct - reservedRisk());
        const riskBudget = Math.min(requestedRisk, portfolioRiskAvailable);
        if (!(riskBudget > 0)) return null;
        const leverage = MAJOR_FX.has(event.symbol) ? protocol.leverage.majors : protocol.leverage.crosses;
        const availableMargin = Math.max(0, balance - reservedMargin());
        const maxMarginPerTrade = Math.min(availableMargin, balance / candidate.maxPositions) * candidate.portfolioRules.MARGIN_USAGE;
        const riskSized = (riskBudget * quotePerEur) / distance;
        const marginSized = (maxMarginPerTrade * leverage * quotePerEur) / entry;
        const size = Math.floor(Math.min(riskSized, marginSized) / 100) * 100;
        if (size < 100) return null;
        const margin = (size * entry) / quotePerEur / leverage;
        const risk = (size * distance) / quotePerEur;
        if (reservedRisk() + risk > balance * candidate.maxPortfolioRiskPct + 1e-9) return null;
        return { size, margin, risk, quotePerEur, leverage };
    };
    const placeCandidates = (timestamp) => {
        const group = eventGroups.get(timestamp);
        if (!group?.length) return;
        const date = new Date(timestamp);
        const dayKey = date.toISOString().slice(0, 10);
        const weekKey = isoWeekStart(timestamp);
        const dayProfit = keyCount(dailyPnl, dayKey);
        const weekProfit = keyCount(weeklyPnl, weekKey);
        const dayStartBalance = balance - dayProfit;
        const weekStartBalance = balance - weekProfit;
        if (dayProfit <= -dayStartBalance * candidate.portfolioRules.MAX_DAILY_LOSS_PCT) {
            reject("daily_loss_limit");
            return;
        }
        if (weekProfit <= -weekStartBalance * candidate.portfolioRules.MAX_WEEKLY_LOSS_PCT) {
            reject("weekly_loss_limit");
            return;
        }
        const minute = minuteUtc(timestamp);
        if (date.getUTCDay() === 5 && date.getUTCHours() >= candidate.riskRules.FRIDAY_LAST_ENTRY_HOUR_UTC) {
            reject("friday_entry_closed");
            return;
        }
        for (const event of group) {
            if (positions.length + pending.length >= candidate.maxPositions) {
                reject("portfolio_full");
                break;
            }
            if (occupiedSymbols().has(event.symbol)) {
                reject("symbol_occupied");
                continue;
            }
            const risk = event.profile.risk;
            const lastEntryMinute = Math.min(risk.lastEntryMinute, candidate.riskRules.DAILY_LAST_ENTRY_MINUTE_UTC);
            if (!(minute < lastEntryMinute)) {
                reject("daily_entry_closed");
                continue;
            }
            const entry = roundPrice(event.entryPrice, event.symbol);
            const stop = roundPrice(event.stopLoss, event.symbol);
            const signalBar = barsBySymbol.get(event.symbol).get(timestamp - M15);
            const entryValid = event.signal === "BUY" ? entry > signalBar?.askClose : entry < signalBar?.close;
            if (!entryValid) {
                reject("pending_entry_behind_market");
                continue;
            }
            const targetR = Number(event.profile.exit.targetR);
            const distance = Math.abs(entry - stop);
            const target = roundPrice(event.signal === "BUY" ? entry + distance * targetR : entry - distance * targetR, event.symbol);
            if (!(event.signal === "BUY" ? stop < entry && target > entry : stop > entry && target < entry)) {
                reject("invalid_protection");
                continue;
            }
            const sizing = sizeOrder(event, timestamp, entry, stop);
            if (!sizing) {
                reject("position_sizing_failed");
                continue;
            }
            const order = {
                id: sequence++,
                symbol: event.symbol,
                side: event.signal,
                signalAt: timestamp,
                entry,
                stop,
                target,
                expiresAt: timestamp + 15 * Number(event.profile.entry.expiryBars) * MINUTE,
                profile: event.profile,
                ...sizing,
            };
            pending.push(order);
            orderAudit.placed += 1;
            updateExposureAudit();
        }
    };
    const fillPending = (timestamp) => {
        for (const order of [...pending]) {
            const bar = barsBySymbol.get(order.symbol).get(timestamp);
            if (!bar) continue;
            const touched = order.side === "BUY" ? bar.askHigh >= order.entry : bar.low <= order.entry;
            if (!touched) continue;
            const fill = order.side === "BUY" ? Math.max(order.entry, bar.askOpen) : Math.min(order.entry, bar.open);
            const distance = order.side === "BUY" ? fill - order.stop : order.stop - fill;
            if (!(distance > 0)) {
                cancelOrder(order, "expired");
                reject("gap_beyond_stop");
                continue;
            }
            const position = {
                ...order,
                entry: fill,
                initialStop: order.stop,
                initialDistance: distance,
                risk: (order.size * distance) / order.quotePerEur,
                opened: timestamp,
                trailingEnabled: false,
                trailingDistance: null,
                trailingStop: null,
                bestPrice: fill,
                lastBestAt: timestamp,
                tightened: false,
            };
            pending.splice(pending.indexOf(order), 1);
            positions.push(position);
            updateExposureAudit();
            orderAudit.filled += 1;
        }
    };
    const replayPositions = (timestamp) => {
        for (const position of [...positions]) {
            const bar = barsBySymbol.get(position.symbol).get(timestamp);
            if (!bar) continue;
            const activeStop = position.side === "BUY"
                ? Math.max(position.initialStop, position.trailingStop ?? -Infinity)
                : Math.min(position.initialStop, position.trailingStop ?? Infinity);
            const stopTouched = position.side === "BUY" ? bar.low <= activeStop : bar.askHigh >= activeStop;
            const targetTouched = position.side === "BUY" ? bar.high >= position.target : bar.askLow <= position.target;
            if (stopTouched) {
                const stopFill = position.side === "BUY" ? Math.min(activeStop, bar.open) : Math.max(activeStop, bar.askOpen);
                closePosition(position, timestamp + M15, stopFill, position.trailingEnabled ? "trailing_stop" : "stop_loss");
                continue;
            }
            if (targetTouched) {
                closePosition(position, timestamp + M15, position.target, "take_profit");
                continue;
            }
            const closeTime = timestamp + M15;
            const executableClose = position.side === "BUY" ? bar.close : bar.askClose;
            const improved = position.side === "BUY" ? executableClose > position.bestPrice : executableClose < position.bestPrice;
            if (improved) {
                position.bestPrice = executableClose;
                position.lastBestAt = closeTime;
            }
            const favorable = position.side === "BUY" ? executableClose - position.entry : position.entry - executableClose;
            const exit = position.profile.exit;
            if (!position.trailingEnabled && favorable >= position.initialDistance * Number(exit.trailActivationR)) {
                position.trailingEnabled = true;
                position.trailingDistance = position.initialDistance * Math.min(Number(exit.trailDistanceR), Number(exit.trailActivationR));
            }
            if (position.trailingEnabled) {
                const stalled = closeTime - position.lastBestAt >= candidate.riskRules.DYNAMIC_TRAIL_STALL_MINUTES * MINUTE;
                const canTighten = !position.tightened && favorable >= position.initialDistance * candidate.riskRules.DYNAMIC_TRAIL_MIN_R && stalled;
                if (canTighten) {
                    position.trailingDistance = position.initialDistance * candidate.riskRules.DYNAMIC_TRAIL_DISTANCE_R;
                    position.tightened = true;
                }
                position.trailingStop = position.side === "BUY" ? position.bestPrice - position.trailingDistance : position.bestPrice + position.trailingDistance;
                continue;
            }
            if (closeTime >= position.opened + Number(exit.maxHoldMinutes) * MINUTE) closePosition(position, closeTime, executableClose, "max_hold");
        }
    };

    for (const timestamp of timeline) {
        for (const order of [...pending]) if (order.expiresAt <= timestamp) cancelOrder(order, "expired");
        forceFlatAtOpen(timestamp);
        placeCandidates(timestamp);
        fillPending(timestamp);
        replayPositions(timestamp);
    }
    for (const order of [...pending]) cancelOrder(order, "endCancelled");
    for (const position of [...positions]) {
        const rows = data.get(position.symbol).M15;
        const bar = rows[Math.min(rows.length - 1, Math.max(0, atOrBefore(rows, endExclusive - 1)))];
        closePosition(position, bar.t + M15, position.side === "BUY" ? bar.close : bar.askClose, "end_of_data");
    }

    const tradeStats = statsForTrades(trades);
    const symbolStats = Object.fromEntries(symbols.map((symbol) => [symbol, statsForTrades(trades.filter((trade) => trade.symbol === symbol))]));
    const monthly = {};
    for (const trade of trades) {
        const month = trade.closed.slice(0, 7);
        monthly[month] ??= [];
        monthly[month].push(trade);
    }
    for (const month of Object.keys(monthly)) monthly[month] = statsForTrades(monthly[month]);
    const exitReasons = Object.fromEntries([...new Set(trades.map((trade) => trade.reason))].sort().map((reason) => [reason, trades.filter((trade) => trade.reason === reason).length]));
    const durationDays = Math.max(1, (endExclusive - start) / DAY);
    return {
        protocol,
        candidate: candidate.name,
        start: new Date(start).toISOString(),
        endExclusive: new Date(endExclusive).toISOString(),
        durationDays: +durationDays.toFixed(2),
        startCapital: candidate.startCapital,
        finalBalance: +balance.toFixed(2),
        pnl: +(balance - candidate.startCapital).toFixed(2),
        returnPct: +(100 * (balance - candidate.startCapital) / candidate.startCapital).toFixed(2),
        entries: orderAudit.filled,
        tradesPerDay: +(orderAudit.filled / durationDays).toFixed(3),
        ...tradeStats,
        maxDrawdownEur: +maxDrawdown.toFixed(2),
        maxDrawdownPct: +maxDrawdownPct.toFixed(2),
        risk: {
            maxPositionPct: +(100 * maxPositionRiskPct).toFixed(3),
            maxPortfolioPct: +(100 * maxOpenRiskPct).toFixed(3),
            maxMarginUsagePct: +(100 * maxMarginUsagePct).toFixed(3),
        },
        orders: orderAudit,
        rejections: Object.fromEntries([...rejections].sort(([left], [right]) => left.localeCompare(right))),
        exitReasons,
        symbolStats,
        monthly,
        trades,
    };
}
