import fs from "node:fs";
import path from "node:path";

import { detectWave } from "./detect-wave-simple.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function parseArgs(argv) {
    const result = { datasets: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        if (key === "--dataset") result.datasets.push(path.resolve(argv[++index]));
        else if (key === "--from") result.from = Date.parse(argv[++index]);
        else if (key === "--to") result.to = Date.parse(argv[++index]);
        else if (key === "--report") result.report = path.resolve(argv[++index]);
        else throw new Error(`Unknown argument: ${key}`);
    }
    if (!result.datasets.length || !Number.isFinite(result.from) || !Number.isFinite(result.to)) {
        throw new Error("Usage: node lab/audusd-screenshot-wave-count.js --dataset DIR [--dataset DELTA] --from ISO --to ISO [--report FILE]");
    }
    return result;
}

function loadMerged(directories, timeframe) {
    const rowsByTime = new Map();
    for (const directory of directories) {
        const file = path.join(directory, `AUDUSD_${timeframe}.jsonl`);
        if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
            if (!line) continue;
            const raw = JSON.parse(line);
            const row = {
                t: Date.parse(raw.timestamp),
                open: Number(raw.bid?.open ?? raw.open),
                high: Number(raw.bid?.high ?? raw.high),
                low: Number(raw.bid?.low ?? raw.low),
                close: Number(raw.bid?.close ?? raw.close),
            };
            if ([row.t, row.open, row.high, row.low, row.close].every(Number.isFinite)) rowsByTime.set(row.t, row);
        }
    }
    const rows = [...rowsByTime.values()].sort((left, right) => left.t - right.t);
    let atr = null;
    const ranges = [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const previous = rows[index - 1];
        const range = previous
            ? Math.max(row.high - row.low, Math.abs(row.high - previous.close), Math.abs(row.low - previous.close))
            : row.high - row.low;
        ranges.push(range);
        if (index === 13) atr = ranges.slice(0, 14).reduce((sum, value) => sum + value, 0) / 14;
        else if (index > 13) atr = (13 * atr + range) / 14;
        row.atr = atr;
    }
    return rows;
}

function exactExtreme(rows, from, to, side) {
    const inside = rows.filter(({ t }) => t >= from && t < to);
    if (!inside.length) return null;
    return inside.reduce((best, row) => side === "bullish"
        ? row.low < best.low ? row : best
        : row.high > best.high ? row : best, inside[0]);
}

function potentialEvents(h1, m15, m5, from, to) {
    const events = [];
    for (let index = 15; index < h1.length - 6; index += 1) {
        const row = h1[index];
        if (row.t < from || row.t >= to || !(row.atr > 0)) continue;
        if (h1[index - 1].t !== row.t - HOUR || h1[index + 1].t !== row.t + HOUR || h1[index + 6].t !== row.t + 6 * HOUR) continue;
        const future = h1.slice(index + 1, index + 7);
        const highPivot = row.high > h1[index - 1].high && row.high >= h1[index + 1].high;
        const lowPivot = row.low < h1[index - 1].low && row.low <= h1[index + 1].low;
        const candidates = [];
        if (highPivot) candidates.push({ side: "bearish", reversal: row.high - Math.min(...future.map(({ low }) => low)) });
        if (lowPivot) candidates.push({ side: "bullish", reversal: Math.max(...future.map(({ high }) => high)) - row.low });
        for (const candidate of candidates) {
            const reversalAtr = candidate.reversal / row.atr;
            if (reversalAtr < 0.25) continue;
            const exactM15 = exactExtreme(m15, row.t, row.t + HOUR, candidate.side);
            const exactM5 = exactExtreme(m5, row.t, row.t + HOUR, candidate.side);
            events.push({
                side: candidate.side,
                h1Open: new Date(row.t).toISOString(),
                exactM15Close: exactM15 ? new Date(exactM15.t + 15 * MINUTE).toISOString() : null,
                exactM5Close: exactM5 ? new Date(exactM5.t + 5 * MINUTE).toISOString() : null,
                price: candidate.side === "bullish" ? row.low : row.high,
                h1Atr: row.atr,
                reversalAtr,
                tradeableHalfAtr: reversalAtr >= 0.5,
            });
        }
    }
    return events;
}

function detectorSignals(m5, m15, from, to, mode) {
    const signals = [];
    let m15Closed = -1;
    let previousDirection = null;
    for (let m5Index = 64; m5Index < m5.length; m5Index += 1) {
        const closeTime = m5[m5Index].t + 5 * MINUTE;
        while (m15Closed + 1 < m15.length && m15[m15Closed + 1].t + 15 * MINUTE <= closeTime) m15Closed += 1;
        if (m15Closed < 32) continue;
        const wave = detectWave("AUDUSD", { m5: { atr: m5[m5Index].atr }, m15: { atr: m15[m15Closed].atr } }, {
            m5: m5.slice(Math.max(0, m5Index - 63), m5Index + 1),
            m15: m15.slice(Math.max(0, m15Closed - 31), m15Closed + 1),
        }, mode ? { mode } : {});
        const direction = wave.waveDirection === "BUY" ? "bullish" : wave.waveDirection === "SELL" ? "bearish" : null;
        if (closeTime >= from && closeTime < to && direction && direction !== previousDirection) {
            signals.push({ side: direction, t: closeTime, timestamp: new Date(closeTime).toISOString() });
        }
        previousDirection = direction;
    }
    return signals;
}

function detectorHourlyStates(h1, m5, m15, from, to, mode) {
    const states = [];
    let m5Closed = -1;
    let m15Closed = -1;
    for (const candle of h1) {
        const closeTime = candle.t + HOUR;
        if (closeTime < from || closeTime >= to) continue;
        while (m5Closed + 1 < m5.length && m5[m5Closed + 1].t + 5 * MINUTE <= closeTime) m5Closed += 1;
        while (m15Closed + 1 < m15.length && m15[m15Closed + 1].t + 15 * MINUTE <= closeTime) m15Closed += 1;
        if (m5Closed < 64 || m15Closed < 32) continue;
        const wave = detectWave("AUDUSD", { m5: { atr: m5[m5Closed].atr }, m15: { atr: m15[m15Closed].atr } }, {
            m5: m5.slice(Math.max(0, m5Closed - 63), m5Closed + 1),
            m15: m15.slice(Math.max(0, m15Closed - 31), m15Closed + 1),
        }, mode ? { mode } : {});
        const direction = wave.waveDirection === "BUY" ? "bullish" : wave.waveDirection === "SELL" ? "bearish" : null;
        if (direction) states.push({ side: direction, t: closeTime, timestamp: new Date(closeTime).toISOString() });
    }
    return states;
}

function detectorMetrics(signals, events) {
    const tradeable = events.filter(({ tradeableHalfAtr }) => tradeableHalfAtr);
    const matches = (signal, event) => signal.side === event.side
        && signal.t >= Date.parse(event.exactM5Close)
        && signal.t <= Date.parse(event.exactM5Close) + 75 * MINUTE;
    const matchedEvents = tradeable.filter((event) => signals.some((signal) => matches(signal, event)));
    const matchedSignals = signals.filter((signal) => tradeable.some((event) => matches(signal, event)));
    return {
        signals: signals.length,
        matchedEvents: matchedEvents.length,
        eventRecallPct: tradeable.length ? 100 * matchedEvents.length / tradeable.length : 0,
        signalPrecisionPct: signals.length ? 100 * matchedSignals.length / signals.length : 0,
        timestamps: signals,
    };
}

function zigzag(events, minimumSwingAtr) {
    const output = [];
    for (const event of [...events].sort((left, right) => Date.parse(left.exactM5Close) - Date.parse(right.exactM5Close))) {
        const previous = output.at(-1);
        if (!previous) {
            output.push(event);
            continue;
        }
        if (event.side === previous.side) {
            const moreExtreme = event.side === "bullish" ? event.price < previous.price : event.price > previous.price;
            if (moreExtreme) output[output.length - 1] = event;
            continue;
        }
        const averageAtr = (event.h1Atr + previous.h1Atr) / 2;
        if (Math.abs(event.price - previous.price) / averageAtr >= minimumSwingAtr) output.push(event);
    }
    return output;
}

const args = parseArgs(process.argv.slice(2));
const h1 = loadMerged(args.datasets, "H1");
const m15 = loadMerged(args.datasets, "M15");
const m5 = loadMerged(args.datasets, "M5");
const availableTo = Math.min(args.to, h1.at(-1).t + HOUR, m15.at(-1).t + 15 * MINUTE, m5.at(-1).t + 5 * MINUTE);
const events = potentialEvents(h1, m15, m5, args.from, availableTo);
const counts = Object.fromEntries([0.25, 0.5, 0.75, 1].map((threshold) =>
    [`atLeast${String(threshold).replace(".", "p")}Atr`, events.filter(({ reversalAtr }) => reversalAtr >= threshold).length]));
const detectors = Object.fromEntries([["default", undefined], ["freshM15", "freshM15"], ["newest", "newest"], ["m5", "m5"], ["m15", "m15"], ["requireBoth", "requireBoth"]]
    .map(([name, mode]) => {
        const signals = detectorSignals(m5, m15, args.from, availableTo, mode);
        return [name, detectorMetrics(signals, events)];
    }));
const distinct = Object.fromEntries([1, 1.5, 2, 2.5].map((threshold) => {
    const rows = zigzag(events.filter(({ tradeableHalfAtr }) => tradeableHalfAtr), threshold);
    return [`minimumSwing${String(threshold).replace(".", "p")}Atr`, { count: rows.length, events: rows }];
}));
const primaryEvents = distinct.minimumSwing2Atr.events;
const distinctDetectorMetrics = Object.fromEntries(Object.entries(detectors).map(([name, metrics]) =>
    [name, detectorMetrics(metrics.timestamps, primaryEvents)]));
const hourlyDetectorMetrics = Object.fromEntries([["default", undefined], ["freshM15", "freshM15"], ["newest", "newest"], ["m5", "m5"], ["m15", "m15"], ["requireBoth", "requireBoth"]]
    .map(([name, mode]) => [name, detectorMetrics(detectorHourlyStates(h1, m5, m15, args.from, availableTo, mode), primaryEvents)]));
const output = {
    protocol: "audusd-screenshot-h1-potential-wave-count-v1",
    requested: { from: new Date(args.from).toISOString(), to: new Date(args.to).toISOString() },
    available: { from: new Date(args.from).toISOString(), to: new Date(availableTo).toISOString(),
        last: { H1: new Date(h1.at(-1).t).toISOString(), M15: new Date(m15.at(-1).t).toISOString(), M5: new Date(m5.at(-1).t).toISOString() } },
    definition: "local H1 radius-1 extremum followed by reversal within six contiguous H1 candles; exact extremum resolved on M15/M5",
    counts,
    distinct,
    hourlyDetectorMetrics,
    tradeableEvents: events.filter(({ tradeableHalfAtr }) => tradeableHalfAtr),
    allQuarterAtrEvents: events,
    detectors,
    distinctDetectorMetrics,
};
const text = `${JSON.stringify(output, null, 2)}\n`;
if (args.report) {
    fs.mkdirSync(path.dirname(args.report), { recursive: true });
    fs.writeFileSync(args.report, text);
}
console.log(text);
