import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { detectWave } from "./detect-wave.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function load(file) {
    const source = fs.readFileSync(file, "utf8");
    const rows = source.split("\n").filter(Boolean).map((line) => {
        const raw = JSON.parse(line);
        return {
            t: Date.parse(raw.timestamp),
            timestamp: raw.timestamp,
            open: Number(raw.bid?.open ?? raw.open),
            high: Number(raw.bid?.high ?? raw.high),
            low: Number(raw.bid?.low ?? raw.low),
            close: Number(raw.bid?.close ?? raw.close),
        };
    }).filter((row) => [row.t, row.open, row.high, row.low, row.close].every(Number.isFinite)).sort((a, b) => a.t - b.t);
    return { rows, audit: { rows: rows.length, first: new Date(rows[0].t).toISOString(),
        last: new Date(rows.at(-1).t).toISOString(), sha256: crypto.createHash("sha256").update(source).digest("hex") } };
}

function indicators(rows) {
    const ranges = [];
    const gains = [];
    const losses = [];
    let atr = null;
    let gain = null;
    let loss = null;
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const previous = rows[index - 1];
        const range = previous ? Math.max(row.high - row.low, Math.abs(row.high - previous.close), Math.abs(row.low - previous.close)) : row.high - row.low;
        ranges.push(range);
        if (index === 13) atr = ranges.slice(0, 14).reduce((sum, value) => sum + value, 0) / 14;
        else if (index > 13) atr = (atr * 13 + range) / 14;
        if (previous) {
            const change = row.close - previous.close;
            gains.push(Math.max(0, change));
            losses.push(Math.max(0, -change));
            if (gains.length === 14) {
                gain = gains.reduce((sum, value) => sum + value, 0) / 14;
                loss = losses.reduce((sum, value) => sum + value, 0) / 14;
            } else if (gains.length > 14) {
                gain = (gain * 13 + gains.at(-1)) / 14;
                loss = (loss * 13 + losses.at(-1)) / 14;
            }
        }
        row.atr = atr;
        row.rsi = gain == null ? null : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
}

function events(h1, m5) {
    const output = [];
    let m5Cursor = 0;
    for (let index = 15; index < h1.length - 6; index += 1) {
        const row = h1[index];
        if (!(row.atr > 0)) continue;
        const future = h1.slice(index + 1, index + 7);
        const high = row.high > h1[index - 1].high && row.high >= h1[index + 1].high
            && row.high - Math.min(...future.map((item) => item.low)) >= 0.5 * row.atr;
        const low = row.low < h1[index - 1].low && row.low <= h1[index + 1].low
            && Math.max(...future.map((item) => item.high)) - row.low >= 0.5 * row.atr;
        const side = high ? "SELL" : low ? "BUY" : null;
        if (!side) continue;
        while (m5Cursor < m5.length && m5[m5Cursor].t < row.t) m5Cursor += 1;
        const inside = [];
        for (let cursor = m5Cursor; cursor < m5.length && m5[cursor].t < row.t + HOUR; cursor += 1) inside.push(cursor);
        if (!inside.length) continue;
        const exact = inside.reduce((best, cursor) => side === "BUY"
            ? m5[cursor].low < m5[best].low ? cursor : best
            : m5[cursor].high > m5[best].high ? cursor : best, inside[0]);
        output.push({ side, t: m5[exact].t + 5 * MINUTE });
    }
    return output;
}

function rawSignals(rows, minutes, config) {
    const output = [];
    const cooldown = Math.ceil(60 / minutes);
    let last = -cooldown;
    for (let index = config.lookback + config.window + 20; index < rows.length; index += 1) {
        if (index - last < cooldown) continue;
        const current = rows[index];
        if (!(current.atr > 0)) continue;
        const range = current.high - current.low;
        if (!(range > 0) || Math.abs(current.close - current.open) / current.atr < config.body) continue;
        for (const side of ["BUY", "SELL"]) {
            const directional = side === "BUY" ? current.close > current.open : current.close < current.open;
            const closeLocation = side === "BUY" ? (current.close - current.low) / range : (current.high - current.close) / range;
            if (!directional || closeLocation < config.close) continue;
            let pivot = -1;
            for (let cursor = index; cursor >= index - config.window; cursor -= 1) {
                const prior = rows.slice(cursor - config.lookback, cursor);
                const priorExtreme = side === "BUY" ? Math.min(...prior.map((row) => row.low)) : Math.max(...prior.map((row) => row.high));
                const extreme = side === "BUY" ? rows[cursor].low <= priorExtreme : rows[cursor].high >= priorExtreme;
                const rsi = config.rsi === 50 || (side === "BUY" ? rows[cursor].rsi <= config.rsi : rows[cursor].rsi >= 100 - config.rsi);
                if (extreme && rsi) { pivot = cursor; break; }
            }
            if (pivot < 0) continue;
            const structure = rows.slice(index - config.breakBars, index);
            const broken = side === "BUY" ? current.close > Math.max(...structure.map((row) => row.high))
                : current.close < Math.min(...structure.map((row) => row.low));
            if (!broken) continue;
            output.push({ side, t: current.t + minutes * MINUTE });
            last = index;
            break;
        }
    }
    return output;
}

function metrics(signals, allEvents, from, to) {
    const selectedSignals = signals.filter((signal) => signal.t >= from && signal.t < to);
    const selectedEvents = allEvents.filter((event) => event.t >= from && event.t < to);
    const matches = (left, right) => left.side === right.side && left.t >= right.t && left.t <= right.t + 75 * MINUTE;
    const matchedEvents = selectedEvents.filter((event) => selectedSignals.some((signal) => matches(signal, event)));
    const matchedSignals = selectedSignals.filter((signal) => selectedEvents.some((event) => matches(signal, event)));
    const delays = matchedEvents.map((event) => Math.min(...selectedSignals.filter((signal) => matches(signal, event)).map((signal) => (signal.t - event.t) / MINUTE)));
    const recall = matchedEvents.length / selectedEvents.length;
    const precision = matchedSignals.length / selectedSignals.length;
    return { events: selectedEvents.length, signals: selectedSignals.length, recall, precision,
        f1: 2 * recall * precision / (recall + precision), medianDelay: delays.sort((a, b) => a - b)[Math.floor(delays.length / 2)] ?? null };
}

function configs(minutes) {
    const output = [];
    const lookbacks = minutes === 5 ? [6, 12, 24, 36] : [4, 8, 12, 20];
    const windows = minutes === 5 ? [3, 6, 12] : [2, 4, 6];
    for (const lookback of lookbacks) for (const window of windows) for (const breakBars of [1, 2, 3])
        for (const body of [0.05, 0.1, 0.2]) for (const close of [0.55, 0.6, 0.65]) for (const rsi of [50, 40, 35])
            output.push({ lookback, window, breakBars, body, close, rsi });
    return output;
}

function select(rows, minutes, allEvents, periods) {
    const tested = configs(minutes).map((config) => {
        const signals = rawSignals(rows, minutes, config);
        return { config, signals, train: metrics(signals, allEvents, ...periods.train), validation: metrics(signals, allEvents, ...periods.validation) };
    }).filter((item) => item.train.signals >= 80 && item.train.recall >= 0.08)
        .sort((left, right) => right.train.f1 - left.train.f1);
    const shortlist = tested.slice(0, 30).sort((left, right) => Math.min(right.train.f1, right.validation.f1) - Math.min(left.train.f1, left.validation.f1));
    const selected = shortlist[0];
    return { config: selected.config, train: selected.train, validation: selected.validation,
        diagnostic: metrics(selected.signals, allEvents, ...periods.diagnostic), candidates: configs(minutes).length };
}

function replayExactFunction(m5, m15, h1, allEvents, periods) {
    const available = { m5: [], m15: [], h1: [] };
    const signals = { all: [], forming: [], confirmed: [] };
    const signatures = { all: null, forming: null, confirmed: null };
    let m15Index = 0;
    let h1Index = 0;
    for (const row of m5) {
        available.m5.push(row);
        const closeTime = row.t + 5 * MINUTE;
        while (m15Index < m15.length && m15[m15Index].t + 15 * MINUTE <= closeTime) available.m15.push(m15[m15Index++]);
        while (h1Index < h1.length && h1[h1Index].t + HOUR <= closeTime) available.h1.push(h1[h1Index++]);
        if (available.m5.length < 80 || available.m15.length < 40 || available.h1.length < 40) continue;
        const wave = detectWave("AUDUSD", {
            m5: { atr: available.m5.at(-1).atr },
            m15: { atr: available.m15.at(-1).atr },
            h1: { atr: available.h1.at(-1).atr, trend: "neutral" },
        }, available);
        if (!wave.direction || !wave.detectedAt) {
            signatures.all = null;
            signatures.forming = null;
            signatures.confirmed = null;
            continue;
        }
        const signal = { side: wave.direction, t: Date.parse(wave.detectedAt) };
        const signature = `${wave.direction}:${wave.extremePrice}`;
        if (signature !== signatures.all) signals.all.push(signal);
        signatures.all = signature;
        if (wave.phase === "forming") {
            if (signature !== signatures.forming) signals.forming.push(signal);
            signatures.forming = signature;
        } else {
            if (signature !== signatures.confirmed) signals.confirmed.push(signal);
            signatures.confirmed = signature;
        }
    }
    return Object.fromEntries(Object.entries(signals).map(([key, value]) => [key, {
        train: metrics(value, allEvents, ...periods.train),
        validation: metrics(value, allEvents, ...periods.validation),
        diagnostic: metrics(value, allEvents, ...periods.diagnostic),
    }]));
}

const directory = process.argv[2];
if (!directory) throw new Error("Usage: node lab/multitimeframe-wave-study.js DATASET_DIR");
const h1 = load(path.join(directory, "AUDUSD_H1.jsonl"));
const m15 = load(path.join(directory, "AUDUSD_M15.jsonl"));
const m5 = load(path.join(directory, "AUDUSD_M5.jsonl"));
indicators(h1.rows); indicators(m15.rows); indicators(m5.rows);
const allEvents = events(h1.rows, m5.rows);
const periods = {
    train: [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-06-01T00:00:00Z")],
    validation: [Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z")],
    diagnostic: [Date.parse("2026-09-01T00:00:00Z"), Date.parse("2026-10-24T00:00:00Z")],
};
const report = { protocol: "audusd-h1-wave-detection-from-m5-m15-v1", dataset: { H1: h1.audit, M15: m15.audit, M5: m5.audit },
    label: "H1 radius-1 extremum with >=0.5 H1 ATR reversal in six hours; resolved to exact M5 extreme",
    selection: "train F1 top-30, validation stability, one frozen diagnostic", M5: select(m5.rows, 5, allEvents, periods),
    M15: select(m15.rows, 15, allEvents, periods), exactFunction: replayExactFunction(m5.rows, m15.rows, h1.rows, allEvents, periods) };
console.log(JSON.stringify(report, null, 2));
