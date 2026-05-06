import fs from "fs";
import path from "path";
import { startSession, getHistorical } from "../api.js";
import { ANALYSIS } from "../config.js";
import { DATA_DIR, parseArgs } from "./experimentTarget.js";

const TIMEFRAME_TO_RESOLUTION = {
    M15: "MINUTE_15",
};

function canonicalRow(row) {
    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts)) return null;
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    if (![open, high, low, close].every(Number.isFinite)) return null;
    return {
        timestamp: new Date(ts).toISOString(),
        open,
        high,
        low,
        close,
    };
}

function readExisting(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return fs
        .readFileSync(filePath, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

function mergeRows(existing, incoming) {
    const byTimestamp = new Map();
    for (const row of existing) {
        const normalized = canonicalRow(row);
        if (normalized) byTimestamp.set(normalized.timestamp, normalized);
    }
    for (const row of incoming) {
        const normalized = canonicalRow(row);
        if (normalized) byTimestamp.set(normalized.timestamp, normalized);
    }
    return [...byTimestamp.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

const args = parseArgs();
const symbols = String(args.symbols || ANALYSIS.SYMBOLS.join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
const timeframe = String(args.timeframe || "M15").toUpperCase();
const count = Number(args.count || 500);
const resolution = TIMEFRAME_TO_RESOLUTION[timeframe];

if (!resolution) {
    throw new Error(`Unsupported timeframe for updateHistoricalData: ${timeframe}`);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
await startSession();

const summary = [];
for (const symbol of symbols) {
    const filePath = path.join(DATA_DIR, `${symbol}_${timeframe}.jsonl`);
    const existing = readExisting(filePath);
    const beforeLast = existing.at(-1)?.timestamp || null;
    const response = await getHistorical(symbol, resolution, count);
    const merged = mergeRows(existing, response?.prices || []);
    fs.writeFileSync(filePath, `${merged.map((row) => JSON.stringify(row)).join("\n")}\n`);
    summary.push({
        symbol,
        rowsBefore: existing.length,
        rowsAfter: merged.length,
        beforeLast,
        afterLast: merged.at(-1)?.timestamp || null,
    });
}

console.log(JSON.stringify({ timeframe, count, summary }, null, 2));
