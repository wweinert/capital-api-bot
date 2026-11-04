import fs from "node:fs";
import path from "node:path";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function parseArgs(argv) {
    const result = { datasets: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        if (key === "--dataset") result.datasets.push(path.resolve(argv[++index]));
        else if (key === "--report") result.report = path.resolve(argv[++index]);
        else throw new Error(`Unknown argument: ${key}`);
    }
    if (!result.datasets.length || !result.report) {
        throw new Error("Usage: node lab/wave-layer-v2-study.js --dataset DIR [--dataset DELTA] --report FILE");
    }
    return result;
}

function loadMerged(directories, timeframe) {
    const byTime = new Map();
    for (const directory of directories) {
        const file = path.join(directory, `AUDUSD_${timeframe}.jsonl`);
        if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
            if (!line) continue;
            const raw = JSON.parse(line);
            const row = {
                t: Date.parse(raw.timestamp),
                open: Number(raw.bid?.open ?? raw.open), high: Number(raw.bid?.high ?? raw.high),
                low: Number(raw.bid?.low ?? raw.low), close: Number(raw.bid?.close ?? raw.close),
            };
            if ([row.t, row.open, row.high, row.low, row.close].every(Number.isFinite)) byTime.set(row.t, row);
        }
    }
    const rows = [...byTime.values()].sort((left, right) => left.t - right.t);
    const ranges = [];
    let atr = null;
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const previous = rows[index - 1];
        const range = previous ? Math.max(row.high - row.low, Math.abs(row.high - previous.close), Math.abs(row.low - previous.close))
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
    return inside.reduce((best, row) => side === "bullish" ? row.low < best.low ? row : best : row.high > best.high ? row : best, inside[0]);
}

function zigzag(events, minimumSwingAtr) {
    const output = [];
    for (const event of [...events].sort((left, right) => left.t - right.t)) {
        const previous = output.at(-1);
        if (!previous) { output.push(event); continue; }
        if (event.side === previous.side) {
            const moreExtreme = event.side === "bullish" ? event.price < previous.price : event.price > previous.price;
            if (moreExtreme) output[output.length - 1] = event;
            continue;
        }
        if (Math.abs(event.price - previous.price) / ((event.atr + previous.atr) / 2) >= minimumSwingAtr) output.push(event);
    }
    return output;
}

function labels(h1, m5) {
    const candidates = [];
    for (let index = 15; index < h1.length - 6; index += 1) {
        const row = h1[index];
        if (!(row.atr > 0) || h1[index - 1].t !== row.t - HOUR || h1[index + 1].t !== row.t + HOUR
            || h1[index + 6].t !== row.t + 6 * HOUR) continue;
        const future = h1.slice(index + 1, index + 7);
        const pivots = [];
        if (row.high > h1[index - 1].high && row.high >= h1[index + 1].high) {
            pivots.push({ side: "bearish", price: row.high, reversal: row.high - Math.min(...future.map(({ low }) => low)) });
        }
        if (row.low < h1[index - 1].low && row.low <= h1[index + 1].low) {
            pivots.push({ side: "bullish", price: row.low, reversal: Math.max(...future.map(({ high }) => high)) - row.low });
        }
        for (const pivot of pivots) {
            if (pivot.reversal / row.atr < 0.5) continue;
            const exact = exactExtreme(m5, row.t, row.t + HOUR, pivot.side);
            if (exact) candidates.push({ side: pivot.side, t: exact.t + 5 * MINUTE, price: pivot.price, atr: row.atr,
                h1Open: row.t, reversalAtr: pivot.reversal / row.atr });
        }
    }
    return zigzag(candidates, 2);
}

function confirmation(rows, index, pivot, side, config) {
    const row = rows[index];
    if (!(row.atr > 0) || index < pivot) return false;
    const range = row.high - row.low;
    if (!(range > 0) || Math.abs(row.close - row.open) / row.atr < config.bodyAtr) return false;
    const directional = side === "bullish" ? row.close > row.open : row.close < row.open;
    const closeLocation = side === "bullish" ? (row.close - row.low) / range : (row.high - row.close) / range;
    if (!directional || closeLocation < config.closeLocation) return false;
    const structure = rows.slice(index - config.breakBars, index);
    if (!structure.length) return false;
    return side === "bullish" ? row.close > Math.max(...structure.map(({ high }) => high))
        : row.close < Math.min(...structure.map(({ low }) => low));
}

function timeframeSignals(rows, minutes, config) {
    const signals = [];
    const usedPivots = new Set();
    for (let index = config.lookback + config.pivotAge + config.breakBars + 2; index < rows.length; index += 1) {
        const candidates = [];
        for (const side of ["bullish", "bearish"]) {
            let pivot = -1;
            for (let cursor = index; cursor >= Math.max(config.lookback, index - config.pivotAge); cursor -= 1) {
                const prior = rows.slice(cursor - config.lookback, cursor);
                const priorExtreme = side === "bullish" ? Math.min(...prior.map(({ low }) => low)) : Math.max(...prior.map(({ high }) => high));
                const extreme = side === "bullish" ? rows[cursor].low <= priorExtreme : rows[cursor].high >= priorExtreme;
                if (extreme) { pivot = cursor; break; }
            }
            if (pivot < 0 || usedPivots.has(`${side}:${pivot}`) || !confirmation(rows, index, pivot, side, config)) continue;
            let earlier = false;
            for (let cursor = pivot + 1; cursor < index; cursor += 1) {
                if (confirmation(rows, cursor, pivot, side, config)) { earlier = true; break; }
            }
            if (earlier) continue;
            const pivotPrice = side === "bullish" ? rows[pivot].low : rows[pivot].high;
            candidates.push({ side, pivot, pivotPrice,
                displacementAtr: Math.abs(rows[index].close - pivotPrice) / rows[index].atr });
        }
        if (!candidates.length) continue;
        candidates.sort((left, right) => right.displacementAtr - left.displacementAtr);
        const selected = candidates[0];
        usedPivots.add(`${selected.side}:${selected.pivot}`);
        signals.push({ side: selected.side, t: rows[index].t + minutes * MINUTE, price: rows[index].close,
            atr: rows[index].atr, pivotTime: rows[selected.pivot].t, pivotPrice: selected.pivotPrice });
    }
    return signals;
}

function pairSignals(m5Signals, m15Signals, alignMinutes, mode) {
    if (mode === "m5") return m5Signals;
    if (mode === "m15") return m15Signals;
    if (mode === "either") return [...m5Signals, ...m15Signals].sort((left, right) => left.t - right.t);
    const output = [];
    const usedM15 = new Set();
    for (const m5 of m5Signals) {
        let selectedIndex = -1;
        let selectedDistance = Infinity;
        for (let index = 0; index < m15Signals.length; index += 1) {
            const m15 = m15Signals[index];
            const distance = Math.abs(m15.t - m5.t);
            if (usedM15.has(index) || m15.side !== m5.side || distance > alignMinutes * MINUTE || distance >= selectedDistance) continue;
            selectedIndex = index;
            selectedDistance = distance;
        }
        if (selectedIndex < 0) continue;
        usedM15.add(selectedIndex);
        const m15 = m15Signals[selectedIndex];
        output.push(m5.t >= m15.t ? m5 : m15);
    }
    return output.sort((left, right) => left.t - right.t);
}

function suppress(signals, config) {
    const accepted = [];
    const lastBySide = new Map();
    for (const signal of signals) {
        const previous = accepted.at(-1);
        const sameSide = lastBySide.get(signal.side);
        if (previous && signal.t - previous.t < config.cooldownMinutes * MINUTE) continue;
        if (sameSide && signal.t - sameSide.t < config.sameSideCooldownMinutes * MINUTE) continue;
        if (previous && previous.side !== signal.side && Math.abs(signal.price - previous.price) / ((signal.atr + previous.atr) / 2) < config.switchMoveAtr) continue;
        accepted.push(signal);
        lastBySide.set(signal.side, signal);
    }
    return accepted;
}

function metrics(signals, events, from, to) {
    const selectedSignals = signals.filter(({ t }) => t >= from && t < to);
    const selectedEvents = events.filter(({ t }) => t >= from && t < to);
    const usedSignals = new Set();
    const matches = [];
    for (const event of selectedEvents) {
        let selected = -1;
        for (let index = 0; index < selectedSignals.length; index += 1) {
            const signal = selectedSignals[index];
            if (usedSignals.has(index) || signal.side !== event.side || signal.t < event.t || signal.t > event.t + 75 * MINUTE) continue;
            selected = index;
            break;
        }
        if (selected >= 0) {
            usedSignals.add(selected);
            matches.push({ event, signal: selectedSignals[selected] });
        }
    }
    const recall = selectedEvents.length ? matches.length / selectedEvents.length : 0;
    const precision = selectedSignals.length ? matches.length / selectedSignals.length : 0;
    const f1 = recall + precision ? 2 * recall * precision / (recall + precision) : 0;
    const delays = matches.map(({ event, signal }) => (signal.t - event.t) / MINUTE).sort((left, right) => left - right);
    return { events: selectedEvents.length, signals: selectedSignals.length, matched: matches.length,
        falseSignals: selectedSignals.length - matches.length, recall, precision, f1,
        medianDelayMinutes: delays[Math.floor(delays.length / 2)] ?? null,
        p90DelayMinutes: delays[Math.floor(delays.length * 0.9)] ?? null };
}

function timeframeConfigs(minutes) {
    const output = [];
    const lookbacks = minutes === 5 ? [6, 12, 24] : [4, 8, 12];
    const pivotAges = minutes === 5 ? [3, 6, 12] : [2, 4, 6];
    for (const lookback of lookbacks) for (const pivotAge of pivotAges) for (const breakBars of [1, 2, 3])
        for (const bodyAtr of [0.05, 0.1, 0.2]) for (const closeLocation of [0.55, 0.65]) {
            output.push({ lookback, pivotAge, breakBars, bodyAtr, closeLocation });
        }
    return output;
}

function rounded(value) {
    if (Array.isArray(value)) return value.map(rounded);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rounded(item)]));
    return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(6)) : value;
}

const args = parseArgs(process.argv.slice(2));
const h1 = loadMerged(args.datasets, "H1");
const m15 = loadMerged(args.datasets, "M15");
const m5 = loadMerged(args.datasets, "M5");
const allEvents = labels(h1, m5);
const end = Math.min(h1.at(-1).t + HOUR, m15.at(-1).t + 15 * MINUTE, m5.at(-1).t + 5 * MINUTE);
const periods = {
    train: [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-06-01T00:00:00Z")],
    validation: [Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z")],
    diagnostic: [Date.parse("2026-09-01T00:00:00Z"), Date.parse("2026-10-22T00:00:00Z")],
    screenshot: [Date.parse("2026-10-22T00:00:00Z"), end],
};
const developmentScore = (row) => row.train.f1 + 0.2 * row.train.recall - 0.001 * (row.train.medianDelayMinutes ?? 75);
const stableScore = (row) => Math.min(row.train.f1, row.validation.f1) + 0.15 * Math.min(row.train.recall, row.validation.recall)
    - 0.0005 * ((row.train.medianDelayMinutes ?? 75) + (row.validation.medianDelayMinutes ?? 75));
const buildShortlist = (rows, minutes) => timeframeConfigs(minutes).map((config) => {
    const signals = timeframeSignals(rows, minutes, config);
    const row = { config, signals, train: metrics(signals, allEvents, ...periods.train) };
    row.score = developmentScore(row);
    return row;
}).filter(({ train }) => train.signals >= 40 && train.recall >= 0.2)
    .sort((left, right) => right.score - left.score).slice(0, 20)
    .map((row) => ({ ...row, validation: metrics(row.signals, allEvents, ...periods.validation) }))
    .sort((left, right) => stableScore(right) - stableScore(left)).slice(0, 12);
const m5Shortlist = buildShortlist(m5, 5);
const m15Shortlist = buildShortlist(m15, 15);
const combinations = [];
for (const mode of ["paired", "either", "m5", "m15"]) {
    const m5Rows = mode === "m15" ? m5Shortlist.slice(0, 1) : m5Shortlist;
    const m15Rows = mode === "m5" ? m15Shortlist.slice(0, 1) : m15Shortlist;
    for (const m5Item of m5Rows) for (const m15Item of m15Rows)
        for (const alignMinutes of mode === "paired" ? [15, 30, 45, 60, 90] : [0]) {
            const pairedSignals = pairSignals(m5Item.signals, m15Item.signals, alignMinutes, mode);
            for (const cooldownMinutes of [0, 30, 60, 90])
                for (const sameSideCooldownMinutes of [60, 120, 240])
                    for (const switchMoveAtr of [0, 0.25, 0.5, 0.75]) {
                        const config = { mode, m5: m5Item.config, m15: m15Item.config, alignMinutes,
                            cooldownMinutes, sameSideCooldownMinutes, switchMoveAtr };
                        const signals = suppress(pairedSignals, config);
                        const train = metrics(signals, allEvents, ...periods.train);
                        if (train.signals < 40 || train.recall < 0.35) continue;
                        combinations.push({ config, signals, train, score: developmentScore({ train }) });
                    }
        }
}
combinations.sort((left, right) => right.score - left.score);
const validated = combinations.map((row) => ({ ...row,
    validation: metrics(row.signals, allEvents, ...periods.validation) }))
const developmentShortlist = [...validated].sort((left, right) => stableScore(right) - stableScore(left));
const coverageShortlist = validated.filter(({ train, validation }) => train.precision >= 0.25 && validation.precision >= 0.25)
    .sort((left, right) => {
        const recall = Math.min(right.train.recall, right.validation.recall) - Math.min(left.train.recall, left.validation.recall);
        if (recall) return recall;
        return Math.min(right.train.precision, right.validation.precision) - Math.min(left.train.precision, left.validation.precision);
    });
function finalize(row) {
    const result = { ...row };
    result.diagnostic = metrics(result.signals, allEvents, ...periods.diagnostic);
    result.screenshot = metrics(result.signals, allEvents, ...periods.screenshot);
    result.screenshotSignals = result.signals.filter(({ t }) => t >= periods.screenshot[0] && t < periods.screenshot[1])
        .map(({ side, t, price, pivotTime, pivotPrice }) => ({ side, timestamp: new Date(t).toISOString(), price,
            pivotTime: new Date(pivotTime).toISOString(), pivotPrice }));
    return result;
}
const selected = finalize(developmentShortlist[0]);
const coverageSelected = finalize(coverageShortlist[0]);
const screenshotEvents = allEvents.filter(({ t }) => t >= periods.screenshot[0] && t < periods.screenshot[1])
    .map(({ side, t, price, reversalAtr }) => ({ side, timestamp: new Date(t).toISOString(), price, reversalAtr }));
const output = rounded({
    protocol: "audusd-causal-wave-layer-v2-development-study",
    generatedAt: new Date().toISOString(),
    definition: { label: "distinct alternating H1 extrema with >=2 ATR swing and >=0.5 ATR reversal within six hours",
        detection: "first causal M5/M15 structure-break confirmation after a unique pivot; closed candles only",
        match: "same direction from exact M5 extremum close through +75 minutes" },
    data: { end: new Date(end).toISOString(), rows: { H1: h1.length, M15: m15.length, M5: m5.length } },
    periods: Object.fromEntries(Object.entries(periods).map(([name, range]) => [name, range.map((time) => new Date(time).toISOString())])),
    eventCounts: Object.fromEntries(Object.entries(periods).map(([name, range]) => [name,
        allEvents.filter(({ t }) => t >= range[0] && t < range[1]).length])),
    searched: { m5Configs: timeframeConfigs(5).length, m15Configs: timeframeConfigs(15).length,
        combinedDevelopmentCandidates: combinations.length },
    selected: { config: selected.config, train: selected.train, validation: selected.validation,
        diagnostic: selected.diagnostic, screenshot: selected.screenshot,
        screenshotEvents, screenshotSignals: selected.screenshotSignals },
    coverageSelected: { config: coverageSelected.config, train: coverageSelected.train, validation: coverageSelected.validation,
        diagnostic: coverageSelected.diagnostic, screenshot: coverageSelected.screenshot,
        screenshotSignals: coverageSelected.screenshotSignals },
    developmentTop20: developmentShortlist.slice(0, 20).map(({ config, train, validation }) => ({ config, train, validation })),
});
fs.mkdirSync(path.dirname(args.report), { recursive: true });
fs.writeFileSync(args.report, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ report: args.report, eventCounts: output.eventCounts, searched: output.searched,
    selected: { config: output.selected.config, train: output.selected.train, validation: output.selected.validation,
        diagnostic: output.selected.diagnostic, screenshot: output.selected.screenshot },
    coverageSelected: { config: output.coverageSelected.config, train: output.coverageSelected.train,
        validation: output.coverageSelected.validation, diagnostic: output.coverageSelected.diagnostic,
        screenshot: output.coverageSelected.screenshot } }, null, 2));
