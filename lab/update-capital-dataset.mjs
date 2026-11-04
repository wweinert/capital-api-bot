import fs from "node:fs";
import path from "node:path";

import axios from "/home/pi/dev/capital-api-bot/node_modules/axios/index.js";
import { API } from "/home/pi/dev/capital-api-bot/config.js";
import { getHeaders, startSession } from "/home/pi/dev/capital-api-bot/api.js";

const DATASET = "/mnt/usb-ssd/trading/capital-dataset";
const DELTA = "/tmp/codex-session-delta-20261101";
const CUTOFF = Date.parse(process.argv[2]);
const REPORT = process.argv[3];
const FRAMES = {
    M1: { resolution: "MINUTE", step: 60_000 },
    M5: { resolution: "MINUTE_5", step: 5 * 60_000 },
    M15: { resolution: "MINUTE_15", step: 15 * 60_000 },
    H1: { resolution: "HOUR", step: 60 * 60_000 },
    H4: { resolution: "HOUR_4", step: 4 * 60 * 60_000 },
    D1: { resolution: "DAY", step: 24 * 60 * 60_000 },
};

if (!Number.isFinite(CUTOFF) || !REPORT) {
    throw new Error("Usage: node update-capital-dataset.mjs CUTOFF_ISO REPORT_JSON");
}

function lastRow(file) {
    const descriptor = fs.openSync(file, "r");
    try {
        const size = fs.fstatSync(descriptor).size;
        const length = Math.min(size, 128 * 1024);
        const buffer = Buffer.alloc(length);
        fs.readSync(descriptor, buffer, 0, length, size - length);
        return JSON.parse(buffer.toString("utf8").trim().split("\n").at(-1));
    } finally {
        fs.closeSync(descriptor);
    }
}

function price(value, side) {
    return Number(value?.[side] ?? (side === "ask" ? value?.offer : undefined));
}

function normalize(raw) {
    const timestamp = Date.parse(raw?.snapshotTimeUTC ?? raw?.snapshotTime);
    const bid = {
        open: price(raw?.openPrice, "bid"),
        high: price(raw?.highPrice, "bid"),
        low: price(raw?.lowPrice, "bid"),
        close: price(raw?.closePrice, "bid"),
    };
    const ask = {
        open: price(raw?.openPrice, "ask"),
        high: price(raw?.highPrice, "ask"),
        low: price(raw?.lowPrice, "ask"),
        close: price(raw?.closePrice, "ask"),
    };
    if (![timestamp, ...Object.values(bid), ...Object.values(ask)].every(Number.isFinite)) return null;
    return {
        schemaVersion: 2,
        timestamp: new Date(timestamp).toISOString(),
        snapshotTime: raw.snapshotTime ?? null,
        snapshotTimeUTC: raw.snapshotTimeUTC ?? null,
        open: bid.open,
        high: bid.high,
        low: bid.low,
        close: bid.close,
        bid,
        ask,
        spread: ask.close - bid.close,
        volume: Number(raw.lastTradedVolume ?? 0),
        source: "capital-rest-historical",
    };
}

function loadDelta(file, after, lastClosedOpen) {
    if (!fs.existsSync(file)) return [];
    const rows = [];
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line) continue;
        const row = JSON.parse(line);
        const timestamp = Date.parse(row.timestamp);
        if (timestamp > after && timestamp <= lastClosedOpen) rows.push(row);
    }
    return rows;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const apiTime = (timestamp) => new Date(timestamp).toISOString().slice(0, 19);

async function fetchWindow(symbol, frame, from, to) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
            const response = await axios.get(`${API.BASE_URL}/prices/${symbol}`, {
                headers: getHeaders(true),
                params: { resolution: frame.resolution, max: 1000, from: apiTime(from), to: apiTime(to) },
            });
            return response.data?.prices ?? [];
        } catch (error) {
            const status = error.response?.status;
            const code = error.response?.data?.errorCode;
            if (status === 404 && code === "error.prices.not-found") return [];
            if (status === 429 && attempt < 5) {
                await sleep(attempt * 1500);
                continue;
            }
            throw error;
        }
    }
    return [];
}

const files = fs.readdirSync(DATASET).filter((name) => name.endsWith(".jsonl")).sort();
const audit = [];

await startSession();

for (const name of files) {
    const match = name.match(/^(.+?)_(M1|M5|M15|H1|H4|D1)\.jsonl$/);
    if (!match) continue;
    const [, symbol, timeframe] = match;
    const frame = FRAMES[timeframe];
    const file = path.join(DATASET, name);
    const beforeSize = fs.statSync(file).size;
    const beforeRow = lastRow(file);
    const before = Date.parse(beforeRow.timestamp);
    const lastClosedOpen = CUTOFF - frame.step;
    const additions = new Map();

    for (const row of loadDelta(path.join(DELTA, name), before, lastClosedOpen)) {
        additions.set(Date.parse(row.timestamp), row);
    }

    const deltaEnd = additions.size ? Math.max(...additions.keys()) : before;
    for (let from = deltaEnd + frame.step; from <= lastClosedOpen; from += frame.step * 900) {
        const to = Math.min(lastClosedOpen, from + frame.step * 899);
        for (const raw of await fetchWindow(symbol, frame, from, to)) {
            const row = normalize(raw);
            const timestamp = Date.parse(row?.timestamp);
            if (row && timestamp > before && timestamp <= lastClosedOpen) additions.set(timestamp, row);
        }
        await sleep(250);
    }

    const rows = [...additions.entries()].sort(([left], [right]) => left - right);
    let previous = before;
    for (const [timestamp] of rows) {
        if (!(timestamp > previous && timestamp <= lastClosedOpen)) throw new Error(`${name}: invalid append order`);
        previous = timestamp;
    }

    if (rows.length) {
        try {
            fs.appendFileSync(file, `${rows.map(([, row]) => JSON.stringify(row)).join("\n")}\n`);
            const afterRow = lastRow(file);
            if (Date.parse(afterRow.timestamp) !== rows.at(-1)[0]) throw new Error(`${name}: tail verification failed`);
        } catch (error) {
            fs.truncateSync(file, beforeSize);
            throw error;
        }
    }

    const afterRow = lastRow(file);
    const result = {
        file: name,
        before: beforeRow.timestamp,
        added: rows.length,
        after: afterRow.timestamp,
        targetLastOpen: new Date(lastClosedOpen).toISOString(),
    };
    audit.push(result);
    console.log(JSON.stringify(result));
}

const output = {
    protocol: "capital-dataset-append-v1",
    generatedAt: new Date().toISOString(),
    cutoff: new Date(CUTOFF).toISOString(),
    dataset: DATASET,
    files: audit.length,
    addedRows: audit.reduce((sum, row) => sum + row.added, 0),
    audit,
};
fs.writeFileSync(REPORT, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ report: REPORT, files: output.files, addedRows: output.addedRows }));
