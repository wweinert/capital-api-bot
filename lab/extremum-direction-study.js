import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const M15 = 15 * 60_000;
const H1 = 60 * 60_000;

function loadRows(file) {
    const source = fs.readFileSync(file, "utf8");
    const sourceLines = source.split("\n").filter(Boolean);
    const rows = sourceLines.map((line) => {
        const row = JSON.parse(line);
        return {
            t: Date.parse(row.timestamp ?? `${row.snapshotTimeUTC}Z`),
            open: Number(row.bid?.open ?? row.open),
            high: Number(row.bid?.high ?? row.high),
            low: Number(row.bid?.low ?? row.low),
            close: Number(row.bid?.close ?? row.close),
            askOpen: Number(row.ask?.open),
            askHigh: Number(row.ask?.high),
            askLow: Number(row.ask?.low),
            askClose: Number(row.ask?.close),
            volume: Number(row.volume ?? 0),
        };
    }).filter((row) => Object.values(row).every(Number.isFinite));
    rows.sort((left, right) => left.t - right.t);
    return {
        rows,
        audit: {
            rows: rows.length,
            sourceRows: sourceLines.length,
            rejectedMissingBidAsk: sourceLines.length - rows.length,
            first: new Date(rows[0].t).toISOString(),
            last: new Date(rows.at(-1).t).toISOString(),
            sha256: crypto.createHash("sha256").update(source).digest("hex"),
        },
    };
}

function addIndicators(rows, atrPeriod = 14, rsiPeriod = 14, bbPeriod = 20) {
    let atr = null;
    let averageGain = null;
    let averageLoss = null;
    const gains = [];
    const losses = [];
    const trueRanges = [];
    const closes = [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const previous = rows[index - 1];
        const trueRange = previous
            ? Math.max(row.high - row.low, Math.abs(row.high - previous.close), Math.abs(row.low - previous.close))
            : row.high - row.low;
        trueRanges.push(trueRange);
        if (index === atrPeriod - 1) atr = trueRanges.slice(0, atrPeriod).reduce((sum, value) => sum + value, 0) / atrPeriod;
        else if (index >= atrPeriod) atr = (atr * (atrPeriod - 1) + trueRange) / atrPeriod;

        if (previous) {
            const change = row.close - previous.close;
            gains.push(Math.max(0, change));
            losses.push(Math.max(0, -change));
            if (gains.length === rsiPeriod) {
                averageGain = gains.reduce((sum, value) => sum + value, 0) / rsiPeriod;
                averageLoss = losses.reduce((sum, value) => sum + value, 0) / rsiPeriod;
            } else if (gains.length > rsiPeriod) {
                averageGain = (averageGain * (rsiPeriod - 1) + gains.at(-1)) / rsiPeriod;
                averageLoss = (averageLoss * (rsiPeriod - 1) + losses.at(-1)) / rsiPeriod;
            }
        }
        const rsi = averageGain == null ? null : averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
        closes.push(row.close);
        let bbLower = null;
        let bbUpper = null;
        if (closes.length >= bbPeriod) {
            const sample = closes.slice(-bbPeriod);
            const mean = sample.reduce((sum, value) => sum + value, 0) / bbPeriod;
            const deviation = Math.sqrt(sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / bbPeriod);
            bbLower = mean - 2 * deviation;
            bbUpper = mean + 2 * deviation;
        }
        row.atr = atr;
        row.rsi = rsi;
        row.bbLower = bbLower;
        row.bbUpper = bbUpper;
    }
}

function extremaEvents(h1, m15) {
    const events = [];
    for (let index = 15; index < h1.length - 6; index += 1) {
        const row = h1[index];
        if (!row.atr || h1[index - 1].t !== row.t - H1 || h1[index + 6].t !== row.t + 6 * H1) continue;
        const future = h1.slice(index + 1, index + 7);
        const highPivot = row.high > h1[index - 1].high && row.high >= h1[index + 1].high
            && row.high - Math.min(...future.map((item) => item.low)) >= 0.5 * row.atr;
        const lowPivot = row.low < h1[index - 1].low && row.low <= h1[index + 1].low
            && Math.max(...future.map((item) => item.high)) - row.low >= 0.5 * row.atr;
        for (const side of highPivot ? ["SELL"] : lowPivot ? ["BUY"] : []) {
            const inside = m15.map((item, m15Index) => ({ item, m15Index }))
                .filter(({ item }) => item.t >= row.t && item.t < row.t + H1);
            if (!inside.length) continue;
            const selected = inside.reduce((best, candidate) => {
                if (!best) return candidate;
                return side === "SELL"
                    ? candidate.item.high > best.item.high ? candidate : best
                    : candidate.item.low < best.item.low ? candidate : best;
            }, null);
            events.push({ side, t: selected.item.t + M15, index: selected.m15Index, h1Atr: row.atr });
        }
    }
    return events;
}

function candidateSignal(candidate, rows, index) {
    if (index < 80 || index >= rows.length - 13) return null;
    const row = rows[index];
    const range = row.high - row.low;
    if (!(row.atr > 0) || range <= 0) return null;
    const bullish = row.close > row.open;
    const bearish = row.close < row.open;
    const closeUp = (row.close - row.low) / range;
    const closeDown = (row.high - row.close) / range;
    const bodyAtr = Math.abs(row.close - row.open) / row.atr;

    const sideValues = ["BUY", "SELL"];
    for (const side of sideValues) {
        const signCandle = side === "BUY" ? bullish : bearish;
        const closeLocation = side === "BUY" ? closeUp : closeDown;
        const wick = side === "BUY" ? Math.min(row.open, row.close) - row.low : row.high - Math.max(row.open, row.close);
        const wickRatio = wick / range;
        const rsiExtreme = side === "BUY" ? row.rsi <= candidate.rsi : row.rsi >= 100 - candidate.rsi;
        const bbTouch = side === "BUY" ? row.low <= row.bbLower : row.high >= row.bbUpper;
        const previous = rows[index - 1];
        const colorFlip = side === "BUY" ? bullish && previous.close <= previous.open : bearish && previous.close >= previous.open;

        if (candidate.family === "flip") {
            let run = 0;
            for (let cursor = index - 1; cursor >= index - candidate.run; cursor -= 1) {
                const opposite = side === "BUY" ? rows[cursor].close < rows[cursor].open : rows[cursor].close > rows[cursor].open;
                if (!opposite) break;
                run += 1;
            }
            if (signCandle && run >= candidate.run && bodyAtr >= candidate.body && closeLocation >= candidate.close) return side;
        }

        if (candidate.family === "wickFlip") {
            if (colorFlip && wickRatio >= candidate.wick && closeLocation >= candidate.close
                && (candidate.rsi === 50 || rsiExtreme) && (!candidate.bb || bbTouch)) return side;
        }

        if (candidate.family === "bbRsiFlip") {
            if (colorFlip && bbTouch && rsiExtreme && closeLocation >= candidate.close) return side;
        }

        if (["sweep", "sweepChoch", "pivotChoch", "divergenceChoch"].includes(candidate.family)) {
            let structuralBar = -1;
            for (let cursor = index; cursor >= index - candidate.window; cursor -= 1) {
                const prior = rows.slice(cursor - candidate.lookback, cursor);
                if (prior.length < candidate.lookback) continue;
                const priorExtreme = side === "BUY" ? Math.min(...prior.map((item) => item.low)) : Math.max(...prior.map((item) => item.high));
                const swept = side === "BUY"
                    ? rows[cursor].low < priorExtreme && rows[cursor].close > priorExtreme
                    : rows[cursor].high > priorExtreme && rows[cursor].close < priorExtreme;
                const pivot = side === "BUY" ? rows[cursor].low <= priorExtreme : rows[cursor].high >= priorExtreme;
                let valid = candidate.family === "pivotChoch" ? pivot : swept;
                if (valid && candidate.rsi < 50) {
                    valid = side === "BUY" ? rows[cursor].rsi <= candidate.rsi : rows[cursor].rsi >= 100 - candidate.rsi;
                }
                if (valid && candidate.family === "divergenceChoch") {
                    let oldIndex = cursor - candidate.lookback;
                    for (let p = cursor - candidate.lookback + 1; p <= cursor - 3; p += 1) {
                        const better = side === "BUY" ? rows[p].low < rows[oldIndex].low : rows[p].high > rows[oldIndex].high;
                        if (better) oldIndex = p;
                    }
                    valid = side === "BUY"
                        ? rows[cursor].low < rows[oldIndex].low && rows[cursor].rsi >= rows[oldIndex].rsi + candidate.divergence
                        : rows[cursor].high > rows[oldIndex].high && rows[cursor].rsi <= rows[oldIndex].rsi - candidate.divergence;
                }
                if (valid) {
                    structuralBar = cursor;
                    break;
                }
            }
            if (structuralBar < 0) continue;
            if (candidate.family === "sweep") {
                if (structuralBar === index && signCandle && closeLocation >= candidate.close) return side;
                continue;
            }
            const recent = rows.slice(Math.max(structuralBar, index - candidate.breakBars), index);
            if (!recent.length) continue;
            const broken = side === "BUY"
                ? row.close > Math.max(...recent.map((item) => item.high))
                : row.close < Math.min(...recent.map((item) => item.low));
            if (signCandle && broken && bodyAtr >= candidate.body && closeLocation >= candidate.close) return side;
        }
    }
    return null;
}

function candidates() {
    const output = [];
    for (const run of [1, 2, 3]) for (const body of [0, 0.2]) for (const close of [0.5, 0.65])
        output.push({ family: "flip", run, body, close });
    for (const wick of [0.35, 0.5]) for (const close of [0.55, 0.65]) for (const rsi of [50, 40, 35]) for (const bb of [false, true])
        output.push({ family: "wickFlip", wick, close, rsi, bb });
    for (const rsi of [35, 40]) for (const close of [0.55, 0.65])
        output.push({ family: "bbRsiFlip", rsi, close });
    for (const lookback of [4, 8, 12, 20]) for (const close of [0.5, 0.65]) for (const rsi of [50, 40, 35])
        output.push({ family: "sweep", lookback, window: 0, close, rsi });
    for (const family of ["sweepChoch", "pivotChoch", "divergenceChoch"])
        for (const lookback of [4, 8, 12, 20]) for (const window of [1, 2, 4]) for (const breakBars of [1, 2])
            for (const rsi of [50, 40, 35]) output.push({ family, lookback, window, breakBars, rsi,
                close: 0.6, body: 0.1, divergence: 3 });
    return output;
}

function latestClosedH1Atr(h1, signalClose) {
    let low = 0;
    let high = h1.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (h1[middle].t + H1 <= signalClose) low = middle + 1;
        else high = middle;
    }
    return h1[Math.max(0, low - 1)]?.atr;
}

function evaluate(candidate, m15, h1, events, from, to) {
    const signals = [];
    let lastSignal = -10;
    for (let index = 80; index < m15.length - 13; index += 1) {
        const closeTime = m15[index].t + M15;
        if (closeTime < from || closeTime >= to || index - lastSignal < 4) continue;
        if (m15[index].t - m15[index - 20].t !== 20 * M15 || m15[index + 12].t - m15[index].t !== 12 * M15) continue;
        const side = candidateSignal(candidate, m15, index);
        if (!side) continue;
        const h1Atr = latestClosedH1Atr(h1, closeTime);
        if (!(h1Atr > 0)) continue;
        signals.push({ side, index, t: closeTime, h1Atr });
        lastSignal = index;
    }
    const periodEvents = events.filter((event) => event.t >= from && event.t < to);
    const matchedEvents = periodEvents.filter((event) => signals.some((signal) => signal.side === event.side
        && signal.t >= event.t && signal.t <= event.t + 75 * 60_000));
    const matchedSignals = signals.filter((signal) => periodEvents.some((event) => event.side === signal.side
        && signal.t >= event.t && signal.t <= event.t + 75 * 60_000));
    const delays = matchedEvents.map((event) => Math.min(...signals.filter((signal) => signal.side === event.side
        && signal.t >= event.t && signal.t <= event.t + 75 * 60_000).map((signal) => (signal.t - event.t) / 60_000)));

    let targetWins = 0;
    let targetLosses = 0;
    const directionalWins = { direction1h: 0, direction2h: 0, direction3h: 0 };
    for (const signal of signals) {
        const entryRow = m15[signal.index + 1];
        const entry = signal.side === "BUY" ? entryRow.askOpen : entryRow.open;
        const target = 0.5 * signal.h1Atr;
        const stop = 0.35 * signal.h1Atr;
        let resolved = false;
        for (let cursor = signal.index + 1; cursor <= signal.index + 12; cursor += 1) {
            const row = m15[cursor];
            const targetHit = signal.side === "BUY" ? row.high >= entry + target : row.askLow <= entry - target;
            const stopHit = signal.side === "BUY" ? row.low <= entry - stop : row.askHigh >= entry + stop;
            if (stopHit || targetHit) {
                if (stopHit) targetLosses += 1;
                else targetWins += 1;
                resolved = true;
                break;
            }
        }
        for (const [key, bars] of [["direction1h", 4], ["direction2h", 8], ["direction3h", 12]]) {
            const finish = m15[signal.index + bars];
            const finishPrice = signal.side === "BUY" ? finish.close : finish.askClose;
            directionalWins[key] += signal.side === "BUY" ? finishPrice > entry : finishPrice < entry;
        }
        if (!resolved) targetLosses += 0;
    }
    const recall = periodEvents.length ? matchedEvents.length / periodEvents.length : 0;
    const precision = signals.length ? matchedSignals.length / signals.length : 0;
    const f1 = recall + precision ? 2 * recall * precision / (recall + precision) : 0;
    const resolved = targetWins + targetLosses;
    const targetWinRate = resolved ? targetWins / resolved : 0;
    const direction1h = signals.length ? directionalWins.direction1h / signals.length : 0;
    const direction2h = signals.length ? directionalWins.direction2h / signals.length : 0;
    const direction3h = signals.length ? directionalWins.direction3h / signals.length : 0;
    const medianDelayMinutes = delays.length ? delays.sort((a, b) => a - b)[Math.floor(delays.length / 2)] : null;
    return { events: periodEvents.length, signals: signals.length, matchedEvents: matchedEvents.length,
        recall, precision, f1, medianDelayMinutes, targetWins, targetLosses, targetWinRate,
        direction1h, direction2h, direction3h };
}

function compact(metrics) {
    return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key,
        typeof value === "number" && !Number.isInteger(value) ? Number(value.toFixed(4)) : value]));
}

const dataset = process.argv[2];
if (!dataset) throw new Error("Usage: node lab/extremum-direction-study.js DATASET_DIR [REPORT_FILE]");
const h1Loaded = loadRows(path.join(dataset, "AUDUSD_H1.jsonl"));
const m15Loaded = loadRows(path.join(dataset, "AUDUSD_M15.jsonl"));
addIndicators(h1Loaded.rows);
addIndicators(m15Loaded.rows);
const events = extremaEvents(h1Loaded.rows, m15Loaded.rows);
const periods = {
    train: [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-06-01T00:00:00Z")],
    validation: [Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-09-01T00:00:00Z")],
    diagnostic: [Date.parse("2026-09-01T00:00:00Z"), Date.parse("2026-10-24T00:00:00Z")],
};
const tested = candidates().map((candidate) => {
    const train = evaluate(candidate, m15Loaded.rows, h1Loaded.rows, events, ...periods.train);
    const validation = evaluate(candidate, m15Loaded.rows, h1Loaded.rows, events, ...periods.validation);
    const score = train.signals >= 80 && train.recall >= 0.08
        ? train.f1 * 0.55 + train.direction3h * 0.2 + train.targetWinRate * 0.25
        : -1;
    return { candidate, score, train, validation };
}).sort((left, right) => right.score - left.score);
const developmentShortlist = tested.slice(0, 20);
const stable = developmentShortlist.filter((item) => item.validation.signals >= 30)
    .sort((left, right) => {
        const leftScore = Math.min(left.train.f1, left.validation.f1) * 0.55
            + Math.min(left.train.direction3h, left.validation.direction3h) * 0.2
            + Math.min(left.train.targetWinRate, left.validation.targetWinRate) * 0.25;
        const rightScore = Math.min(right.train.f1, right.validation.f1) * 0.55
            + Math.min(right.train.direction3h, right.validation.direction3h) * 0.2
            + Math.min(right.train.targetWinRate, right.validation.targetWinRate) * 0.25;
        return rightScore - leftScore;
    });
const selected = stable[0] ?? developmentShortlist[0];
const diagnostic = evaluate(selected.candidate, m15Loaded.rows, h1Loaded.rows, events, ...periods.diagnostic);
const directionalDevelopment = tested.filter((item) => item.train.signals >= 80)
    .sort((left, right) => (right.train.direction1h * 0.35 + right.train.direction2h * 0.15 + right.train.targetWinRate * 0.5)
        - (left.train.direction1h * 0.35 + left.train.direction2h * 0.15 + left.train.targetWinRate * 0.5)).slice(0, 20);
const directionalStable = directionalDevelopment.filter((item) => item.validation.signals >= 30)
    .sort((left, right) => (Math.min(right.train.direction1h, right.validation.direction1h) * 0.35
        + Math.min(right.train.direction2h, right.validation.direction2h) * 0.15
        + Math.min(right.train.targetWinRate, right.validation.targetWinRate) * 0.5)
        - (Math.min(left.train.direction1h, left.validation.direction1h) * 0.35
        + Math.min(left.train.direction2h, left.validation.direction2h) * 0.15
        + Math.min(left.train.targetWinRate, left.validation.targetWinRate) * 0.5));
const directionalSelected = directionalStable[0] ?? directionalDevelopment[0];
const directionalDiagnostic = evaluate(directionalSelected.candidate, m15Loaded.rows, h1Loaded.rows, events, ...periods.diagnostic);
const precisionDevelopment = tested.filter((item) => item.train.signals >= 80 && item.train.recall >= 0.1)
    .sort((left, right) => right.train.precision - left.train.precision).slice(0, 20);
const precisionStable = precisionDevelopment.filter((item) => item.validation.signals >= 30)
    .sort((left, right) => Math.min(right.train.precision, right.validation.precision)
        - Math.min(left.train.precision, left.validation.precision));
const precisionSelected = precisionStable[0] ?? precisionDevelopment[0];
const precisionDiagnostic = evaluate(precisionSelected.candidate, m15Loaded.rows, h1Loaded.rows, events, ...periods.diagnostic);
const baselines = [
    { family: "flip", run: 1, body: 0, close: 0.5 },
    { family: "bbRsiFlip", rsi: 35, close: 0.55 },
    { family: "sweep", lookback: 8, window: 0, close: 0.5, rsi: 50 },
].map((candidate) => ({ candidate,
    train: compact(evaluate(candidate, m15Loaded.rows, h1Loaded.rows, events, ...periods.train)),
    validation: compact(evaluate(candidate, m15Loaded.rows, h1Loaded.rows, events, ...periods.validation)),
    diagnostic: compact(evaluate(candidate, m15Loaded.rows, h1Loaded.rows, events, ...periods.diagnostic)) }));
const report = {
    protocol: {
        name: "audusd-m15-causal-extremum-direction-study-v1",
        generatedAt: new Date().toISOString(),
        labels: "H1 radius-1 extrema followed by >=0.5 H1 ATR adverse-to-extreme movement within six closed H1 candles",
        matchWindow: "signal M15 close from exact M15 extreme close through +75 minutes",
        executionProxy: "entry at next M15 bid/ask open; target 0.5 closed-H1 ATR before stop 0.35 ATR within 3 hours; same-bar stop first",
        selection: "rank on train only; choose stability among top-20 using validation; open diagnostic once",
        caveat: "direction study, not a complete trading-strategy backtest",
    },
    dataset: { H1: h1Loaded.audit, M15: m15Loaded.audit },
    periods: Object.fromEntries(Object.entries(periods).map(([key, value]) => [key, value.map((time) => new Date(time).toISOString())])),
    candidatesTested: tested.length,
    selected: { candidate: selected.candidate, train: compact(selected.train), validation: compact(selected.validation), diagnostic: compact(diagnostic) },
    directionalSelected: { candidate: directionalSelected.candidate, train: compact(directionalSelected.train),
        validation: compact(directionalSelected.validation), diagnostic: compact(directionalDiagnostic) },
    precisionSelected: { candidate: precisionSelected.candidate, train: compact(precisionSelected.train),
        validation: compact(precisionSelected.validation), diagnostic: compact(precisionDiagnostic) },
    baselines,
    developmentShortlist: developmentShortlist.slice(0, 10).map((item) => ({ candidate: item.candidate,
        score: Number(item.score.toFixed(4)), train: compact(item.train), validation: compact(item.validation) })),
    directionalDevelopmentShortlist: directionalDevelopment.slice(0, 10).map((item) => ({ candidate: item.candidate,
        train: compact(item.train), validation: compact(item.validation) })),
};
const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv[3]) fs.writeFileSync(process.argv[3], output);
console.log(output);
