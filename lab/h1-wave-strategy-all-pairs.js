import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { detectWave } from "./detect-wave-simple.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const PERIODS = {
    train: [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-06-01T00:00:00Z")],
    validation: [Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z")],
    test: [Date.parse("2026-09-01T00:00:00Z"), Infinity],
};
const SESSION_ORDER = ["asia", "london", "overlap", "newYork"];
const SESSION_FORMATTERS = {
    london: new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }),
    newYork: new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }),
};

function sha256(source) {
    return crypto.createHash("sha256").update(source).digest("hex");
}

function candleSide(raw, side) {
    const values = raw?.[side];
    return {
        open: Number(values?.open ?? raw?.open),
        high: Number(values?.high ?? raw?.high),
        low: Number(values?.low ?? raw?.low),
        close: Number(values?.close ?? raw?.close),
    };
}

function load(file) {
    const source = fs.readFileSync(file, "utf8");
    let invalid = 0;
    let duplicates = 0;
    const byTimestamp = new Map();

    for (const line of source.split("\n")) {
        if (!line) continue;
        const raw = JSON.parse(line);
        const t = Date.parse(raw.timestamp);
        const bid = candleSide(raw, "bid");
        const ask = candleSide(raw, "ask");
        const values = [t, bid.open, bid.high, bid.low, bid.close, ask.open, ask.high, ask.low, ask.close];
        if (!values.every(Number.isFinite)) {
            invalid += 1;
            continue;
        }
        if (byTimestamp.has(t)) duplicates += 1;
        byTimestamp.set(t, {
            t,
            timestamp: new Date(t).toISOString(),
            ...bid,
            bid,
            ask,
            volume: Number(raw.volume),
        });
    }

    const rows = [...byTimestamp.values()].sort((left, right) => left.t - right.t);
    addAtr(rows);
    return {
        rows,
        audit: {
            file: path.basename(file),
            rows: rows.length,
            invalid,
            duplicates,
            first: rows[0]?.timestamp ?? null,
            last: rows.at(-1)?.timestamp ?? null,
            sha256: sha256(source),
        },
    };
}

function addAtr(rows, period = 14) {
    let atr = null;
    const trueRanges = [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const previous = rows[index - 1];
        const trueRange = previous
            ? Math.max(row.high - row.low, Math.abs(row.high - previous.close), Math.abs(row.low - previous.close))
            : row.high - row.low;
        trueRanges.push(trueRange);
        if (index === period - 1) {
            atr = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
        } else if (index >= period) {
            atr = (atr * (period - 1) + trueRange) / period;
        }
        row.atr = atr;
    }
}

function localMinute(formatter, timestamp) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
    return Number(parts.hour) * 60 + Number(parts.minute);
}

// Exact ordering and clocks currently used by getMarketSession in strategies.js.
function marketSession(timestamp) {
    if (localMinute(SESSION_FORMATTERS.london, timestamp) < 480) return "asia";
    if (localMinute(SESSION_FORMATTERS.newYork, timestamp) < 480) return "london";
    if (localMinute(SESSION_FORMATTERS.london, timestamp) < 1020) return "overlap";
    if (localMinute(SESSION_FORMATTERS.newYork, timestamp) < 1020) return "newYork";
    return "offHours";
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

function opportunities(symbol, h1, m15, m5) {
    const output = [];
    let m5Closed = -1;
    let m15Closed = -1;

    for (let index = 15; index < h1.length; index += 1) {
        const current = h1[index];
        const previous = h1[index - 1];
        const decisionTime = current.t + HOUR;

        while (m5Closed + 1 < m5.length && m5[m5Closed + 1].t + 5 * MINUTE <= decisionTime) m5Closed += 1;
        while (m15Closed + 1 < m15.length && m15[m15Closed + 1].t + 15 * MINUTE <= decisionTime) m15Closed += 1;
        if (m5Closed < 40 || m15Closed < 15 || !(current.atr > 0)) continue;

        const wave = detectWave(
            symbol,
            { m5: { atr: m5[m5Closed].atr }, m15: { atr: m15[m15Closed].atr } },
            {
                m5: m5.slice(Math.max(0, m5Closed - 63), m5Closed + 1),
                m15: m15.slice(Math.max(0, m15Closed - 31), m15Closed + 1),
            },
        );
        const bullishPattern = previous.close < previous.open && current.close > current.open;
        const bearishPattern = previous.close > previous.open && current.close < current.open;
        const side = wave.waveDirection === "BUY" && bullishPattern ? "BUY" : wave.waveDirection === "SELL" && bearishPattern ? "SELL" : null;
        if (!side) continue;

        const entryIndex = lowerBound(m5, decisionTime);
        const entryBar = m5[entryIndex];
        if (!entryBar || entryBar.t - decisionTime > 15 * MINUTE) continue;
        output.push({
            symbol,
            side,
            session: marketSession(decisionTime),
            decisionTime,
            entryIndex,
            entryTime: entryBar.t,
            entryPrice: side === "BUY" ? entryBar.ask.open : entryBar.bid.open,
            signalLow: current.low,
            signalHigh: current.high,
            patternLow: Math.min(previous.low, current.low),
            patternHigh: Math.max(previous.high, current.high),
            atr: current.atr,
        });
    }
    return output;
}

function nextUtcMinute(timestamp, minuteOfDay) {
    const dayStart = Math.floor(timestamp / DAY) * DAY;
    const today = dayStart + minuteOfDay * MINUTE;
    return today > timestamp ? today : today + DAY;
}

function evaluateTrade(opportunity, m5, config) {
    const { side, entryPrice } = opportunity;
    const baseStop = config.stopMode === "pattern"
        ? side === "BUY" ? opportunity.patternLow : opportunity.patternHigh
        : side === "BUY" ? opportunity.signalLow : opportunity.signalHigh;
    const stop = side === "BUY" ? baseStop - config.stopBufferAtr * opportunity.atr : baseStop + config.stopBufferAtr * opportunity.atr;
    const risk = side === "BUY" ? entryPrice - stop : stop - entryPrice;
    if (!(risk > 0) || risk > 5 * opportunity.atr) return null;

    const target = side === "BUY" ? entryPrice + config.targetR * risk : entryPrice - config.targetR * risk;
    const timeout = opportunity.entryTime + config.maxHoldMinutes * MINUTE;
    const dailyFlat = nextUtcMinute(opportunity.entryTime, 22 * 60);
    const fridayFlat = new Date(opportunity.entryTime).getUTCDay() === 5 ? nextUtcMinute(opportunity.entryTime, 20 * 60) : Infinity;
    const deadline = Math.min(timeout, dailyFlat, fridayFlat);

    for (let index = opportunity.entryIndex; index < m5.length; index += 1) {
        const bar = m5[index];
        if (bar.t > deadline + 5 * MINUTE) break;
        const stopHit = side === "BUY" ? bar.bid.low <= stop : bar.ask.high >= stop;
        const targetHit = side === "BUY" ? bar.bid.high >= target : bar.ask.low <= target;

        // When both levels occur inside one M5 bar, use the conservative ordering.
        if (stopHit) return { ...opportunity, closed: bar.t + 5 * MINUTE, exit: stop, r: -1, reason: "stop" };
        if (targetHit) return { ...opportunity, closed: bar.t + 5 * MINUTE, exit: target, r: config.targetR, reason: "target" };
        if (bar.t + 5 * MINUTE >= deadline) {
            const exit = side === "BUY" ? bar.bid.close : bar.ask.close;
            const r = side === "BUY" ? (exit - entryPrice) / risk : (entryPrice - exit) / risk;
            return { ...opportunity, closed: bar.t + 5 * MINUTE, exit, r, reason: deadline === timeout ? "timeout" : "flat" };
        }
    }
    return null;
}

function tradeSet(opportunitiesBySymbol, m5BySymbol, config) {
    const output = [];
    for (const [symbol, rows] of Object.entries(opportunitiesBySymbol)) {
        let availableAt = -Infinity;
        for (const opportunity of rows) {
            if (opportunity.entryTime < availableAt) continue;
            const trade = evaluateTrade(opportunity, m5BySymbol[symbol], config);
            if (!trade) continue;
            output.push(trade);
            availableAt = trade.closed;
        }
    }
    return output.sort((left, right) => left.entryTime - right.entryTime);
}

function metrics(trades) {
    let equity = 0;
    let peak = 0;
    let maxDrawdownR = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    for (const trade of trades) {
        equity += trade.r;
        peak = Math.max(peak, equity);
        maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
        grossProfit += Math.max(0, trade.r);
        grossLoss += Math.max(0, -trade.r);
    }
    const totalR = trades.reduce((sum, trade) => sum + trade.r, 0);
    return {
        trades: trades.length,
        wins: trades.filter(({ r }) => r > 0).length,
        winRate: trades.length ? 100 * trades.filter(({ r }) => r > 0).length / trades.length : 0,
        totalR,
        averageR: trades.length ? totalR / trades.length : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
        maxDrawdownR,
    };
}

function roundMetrics(value) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Number.isFinite(item) ? Number(item.toFixed(4)) : item]));
}

function inPeriod(trade, period) {
    const [from, to] = PERIODS[period];
    return trade.entryTime >= from && trade.entryTime < to;
}

function periodMetrics(trades) {
    return Object.fromEntries(Object.keys(PERIODS).map((period) => [period, roundMetrics(metrics(trades.filter((trade) => inPeriod(trade, period))))]));
}

function configurations() {
    const output = [];
    for (const stopMode of ["signal", "pattern"])
        for (const stopBufferAtr of [0, 0.05, 0.1])
            for (const targetR of [1, 1.5, 2])
                for (const maxHoldMinutes of [360, 720, 1440]) output.push({ stopMode, stopBufferAtr, targetR, maxHoldMinutes });
    return output;
}

function robustConfigScore(periods) {
    const train = periods.train;
    const validation = periods.validation;
    return Math.min(train.averageR, validation.averageR) - 0.002 * (train.maxDrawdownR + validation.maxDrawdownR);
}

function passesConfigGates(periods) {
    return periods.train.trades >= 200
        && periods.validation.trades >= 100
        && periods.train.totalR > 0
        && periods.validation.totalR > 0;
}

function profileGroups(trades) {
    const groups = new Map();
    for (const trade of trades) {
        const key = `${trade.symbol}:${trade.session}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(trade);
    }
    return [...groups.entries()].map(([profile, rows]) => {
        const periods = periodMetrics(rows);
        const total = roundMetrics(metrics(rows));
        const admitted = periods.train.trades >= 8
            && periods.validation.trades >= 5
            && periods.test.trades >= 3
            && periods.train.totalR > 0
            && periods.validation.totalR > 0
            && periods.test.totalR > 0
            && total.trades >= 20
            && total.profitFactor >= 1.15
            && total.averageR >= 0.05;
        return { profile, admitted, periods, total };
    }).sort((left, right) => Number(right.admitted) - Number(left.admitted) || right.total.averageR - left.total.averageR);
}

function symbolGroups(trades) {
    return [...new Set(trades.map(({ symbol }) => symbol))].sort().map((symbol) => {
        const rows = trades.filter((trade) => trade.symbol === symbol);
        return { symbol, periods: periodMetrics(rows), total: roundMetrics(metrics(rows)) };
    }).sort((left, right) => right.total.averageR - left.total.averageR);
}

function selectProfileConfigurations(opportunitiesBySymbol, m5BySymbol, fxSymbols) {
    const fixed = { stopMode: "pattern", stopBufferAtr: 0.1 };
    const grid = [];
    for (const targetR of [1, 1.5, 2])
        for (const maxHoldMinutes of [360, 720, 1440]) grid.push({ ...fixed, targetR, maxHoldMinutes });

    const selections = [];
    for (const symbol of fxSymbols) {
        for (const session of SESSION_ORDER) {
            const scoped = { [symbol]: opportunitiesBySymbol[symbol].filter((opportunity) => opportunity.session === session) };
            const ranked = grid.map((config) => {
                const trades = tradeSet(scoped, m5BySymbol, config);
                const periods = periodMetrics(trades);
                const train = periods.train;
                const score = train.trades >= 25 ? train.averageR - 0.003 * train.maxDrawdownR : -Infinity;
                return { config, trades, periods, score };
            }).sort((left, right) => right.score - left.score);
            const selected = ranked[0];
            const total = roundMetrics(metrics(selected.trades));
            const admitted = Number.isFinite(selected.score)
                && selected.periods.train.totalR > 0
                && selected.periods.train.profitFactor >= 1.05
                && selected.periods.validation.trades >= 12
                && selected.periods.validation.totalR > 0
                && selected.periods.validation.profitFactor >= 1.05
                && selected.periods.test.trades >= 8
                && selected.periods.test.totalR > 0
                && selected.periods.test.profitFactor >= 1.05
                && total.trades >= 50
                && total.profitFactor >= 1.15
                && total.averageR >= 0.05;
            selections.push({
                profile: `${symbol}:${session}`,
                symbol,
                session,
                admitted,
                config: selected.config,
                periods: selected.periods,
                total,
                trainAlternatives: ranked.slice(0, 3).map(({ config, periods, score }) => ({ config, train: periods.train, score })),
            });
        }
    }
    return selections.sort((left, right) => Number(right.admitted) - Number(left.admitted) || right.total.averageR - left.total.averageR);
}

function selectedProfileTrades(selections, opportunitiesBySymbol, m5BySymbol) {
    const admitted = new Map(selections.filter(({ admitted }) => admitted).map((item) => [item.profile, item.config]));
    const output = [];
    for (const [symbol, opportunities] of Object.entries(opportunitiesBySymbol)) {
        let availableAt = -Infinity;
        for (const opportunity of opportunities) {
            if (opportunity.entryTime < availableAt) continue;
            const config = admitted.get(`${symbol}:${opportunity.session}`);
            if (!config) continue;
            const trade = evaluateTrade(opportunity, m5BySymbol[symbol], config);
            if (!trade) continue;
            output.push(trade);
            availableAt = trade.closed;
        }
    }
    return output.sort((left, right) => left.entryTime - right.entryTime);
}

const directory = process.argv[2];
if (!directory) throw new Error("Usage: node lab/h1-wave-strategy-all-pairs.js DATASET_DIR");

const files = fs.readdirSync(directory);
const symbols = files.filter((file) => file.endsWith("_H1.jsonl")).map((file) => file.slice(0, -9))
    .filter((symbol) => files.includes(`${symbol}_M15.jsonl`) && files.includes(`${symbol}_M5.jsonl`)).sort();
const datasets = {};
const opportunitiesBySymbol = {};
const m5BySymbol = {};

for (const symbol of symbols) {
    const h1 = load(path.join(directory, `${symbol}_H1.jsonl`));
    const m15 = load(path.join(directory, `${symbol}_M15.jsonl`));
    const m5 = load(path.join(directory, `${symbol}_M5.jsonl`));
    datasets[symbol] = { H1: h1.audit, M15: m15.audit, M5: m5.audit };
    m5BySymbol[symbol] = m5.rows;
    opportunitiesBySymbol[symbol] = opportunities(symbol, h1.rows, m15.rows, m5.rows);
}

const fxSymbols = symbols.filter((symbol) => !["BTCUSD", "ETHUSD"].includes(symbol));
const fxOpportunities = Object.fromEntries(Object.entries(opportunitiesBySymbol).filter(([symbol]) => fxSymbols.includes(symbol)));
const ranked = configurations().map((config) => {
    const trades = tradeSet(fxOpportunities, m5BySymbol, config);
    const periods = periodMetrics(trades);
    return { config, periods, passed: passesConfigGates(periods), score: robustConfigScore(periods) };
}).sort((left, right) => Number(right.passed) - Number(left.passed) || right.score - left.score);

const selected = ranked[0];
if (!selected) throw new Error("No execution configuration was evaluated");
const allTrades = tradeSet(opportunitiesBySymbol, m5BySymbol, selected.config);
const fxTrades = allTrades.filter(({ symbol }) => fxSymbols.includes(symbol));
const cryptoTrades = allTrades.filter(({ symbol }) => !fxSymbols.includes(symbol));
const profiles = profileGroups(fxTrades);
const profileSelections = selectProfileConfigurations(opportunitiesBySymbol, m5BySymbol, fxSymbols);
const admittedTrades = selectedProfileTrades(profileSelections, opportunitiesBySymbol, m5BySymbol);

const report = {
    protocol: "h1-green-red-with-m5-m15-wave-all-pairs-v1",
    generatedAt: new Date().toISOString(),
    causality: "H1 pattern and lower-timeframe wave use closed candles only; entry is next M5 open with bid/ask spread; M5 stop/target resolution; stop wins same-bar ambiguity",
    periods: Object.fromEntries(Object.entries(PERIODS).map(([name, [from, to]]) => [name, [new Date(from).toISOString(), Number.isFinite(to) ? new Date(to).toISOString() : "dataset-end"]])),
    selection: {
        universe: "17 FX pairs; BTCUSD and ETHUSD are diagnostic only",
        grid: "2 stop anchors x 3 ATR buffers x 3 fixed targets x 3 maximum holds = 54 configurations",
        rule: "maximize worst train/validation average R with drawdown penalty; require >=200 train trades, >=100 validation trades and positive total R in both; test not used for execution selection",
        passedSelectionGates: selected.passed,
        selectedConfig: selected.config,
        train: selected.periods.train,
        validation: selected.periods.validation,
        frozenTest: selected.periods.test,
        topFive: ranked.slice(0, 5),
    },
    admissionRule: "pair/session is provisional only if train >=8, validation >=5, test >=3, every segment totalR >0, total >=20, PF >=1.15 and averageR >=0.05; test is veto only, never ranking",
    fx: {
        aggregate: periodMetrics(fxTrades),
        profiles,
        admittedProfiles: profiles.filter(({ admitted }) => admitted).map(({ profile }) => profile),
        symbols: symbolGroups(fxTrades),
    },
    compactProfileStudy: {
        protocol: "pattern-candle stop plus 0.1 H1 ATR buffer are universal; each pair/session stores only targetR and maxHoldMinutes",
        selection: "choose targetR x maxHoldMinutes on train only (9 candidates); validation and test are veto-only",
        admissionRule: "train >=25 and PF>=1.05; validation >=12 and PF>=1.05; test >=8 and PF>=1.05; every segment positive; total >=50, PF>=1.15 and averageR>=0.05",
        admittedProfiles: profileSelections.filter(({ admitted }) => admitted).map(({ profile, config }) => ({ profile, targetR: config.targetR, maxHoldMinutes: config.maxHoldMinutes })),
        aggregate: periodMetrics(admittedTrades),
        profiles: profileSelections,
    },
    cryptoDiagnostic: {
        aggregate: periodMetrics(cryptoTrades),
        symbols: symbolGroups(cryptoTrades),
    },
    signalCounts: Object.fromEntries(symbols.map((symbol) => [symbol, opportunitiesBySymbol[symbol].length])),
    datasets,
};

console.log(JSON.stringify(report, null, 2));
