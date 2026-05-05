import fs from "fs";
import path from "path";
import axios from "axios";
import { API, ANALYSIS } from "../config.js";
import { getHeaders, startSession } from "../api.js";

const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
const RESOLUTION_BY_TIMEFRAME = {
    M1: ANALYSIS.TIMEFRAMES.M1,
    M5: ANALYSIS.TIMEFRAMES.M5,
    M15: ANALYSIS.TIMEFRAMES.M15,
    H1: ANALYSIS.TIMEFRAMES.H1,
    H4: ANALYSIS.TIMEFRAMES.H4,
    D1: ANALYSIS.TIMEFRAMES.D1,
};

const timeframe = String(process.env.TIMEFRAME || "M15").toUpperCase();
const resolution = process.env.RESOLUTION || RESOLUTION_BY_TIMEFRAME[timeframe] || "MINUTE_15";
const maxCandles = Number(process.env.MAX_CANDLES || 12000);
const pageSize = Math.min(1000, Math.max(1, Number(process.env.PAGE_SIZE || 1000)));
const requestDelayMs = Number(process.env.REQUEST_DELAY_MS || 500);
const pageDelayMs = Number(process.env.PAGE_DELAY_MS || 250);
const defaultSymbols = ["AUDUSD", "EURUSD", "GBPUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"];
const symbols = String(process.env.SYMBOLS || defaultSymbols.join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

const STEP_MS_BY_TIMEFRAME = {
    M1: 60_000,
    M5: 5 * 60_000,
    M15: 15 * 60_000,
    H1: 60 * 60_000,
    H4: 4 * 60 * 60_000,
    D1: 24 * 60 * 60_000,
};
const pageStepMs = STEP_MS_BY_TIMEFRAME[timeframe] || STEP_MS_BY_TIMEFRAME.M15;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pricePart(price, side = "bid") {
    const direct = Number(price?.[side]);
    if (Number.isFinite(direct)) return direct;
    const bid = Number(price?.bid);
    const ask = Number(price?.ask ?? price?.offer);
    if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
    return Number.isFinite(bid) ? bid : Number.isFinite(ask) ? ask : null;
}

function normalizePrice(price) {
    const timestamp = price?.snapshotTimeUTC || price?.snapshotTime;
    const open = pricePart(price?.openPrice);
    const high = pricePart(price?.highPrice);
    const low = pricePart(price?.lowPrice);
    const close = pricePart(price?.closePrice);
    if (!timestamp || ![open, high, low, close].every(Number.isFinite)) return null;
    return {
        timestamp: new Date(timestamp).toISOString(),
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
        .filter(Boolean)
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
        if (row?.timestamp) byTimestamp.set(row.timestamp, row);
    }
    for (const row of incoming) {
        if (row?.timestamp) byTimestamp.set(row.timestamp, { ...byTimestamp.get(row.timestamp), ...row });
    }
    return [...byTimestamp.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

async function fetchSymbol(symbol) {
    const all = [];
    let to = process.env.TO || null;
    while (all.length < maxCandles) {
        const remaining = maxCandles - all.length;
        const count = Math.min(pageSize, remaining);
        const params = new URLSearchParams({ resolution, max: String(count) });
        if (to) params.set("to", to);
        const url = `${API.BASE_URL}/prices/${symbol}?${params.toString()}`;
        const response = await axios.get(url, { headers: getHeaders(true) });
        const prices = Array.isArray(response.data?.prices) ? response.data.prices : [];
        const rows = prices.map(normalizePrice).filter(Boolean);
        all.push(...rows);
        if (rows.length < count || rows.length === 0) break;
        const firstTs = Date.parse(rows[0].timestamp);
        if (!Number.isFinite(firstTs)) break;
        to = new Date(firstTs - pageStepMs).toISOString().slice(0, 19);
        await delay(pageDelayMs);
    }
    return mergeRows([], all);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
await startSession();

for (const symbol of symbols) {
    const filePath = path.join(DATA_DIR, `${symbol}_${timeframe}.jsonl`);
    const existing = readExisting(filePath);
    const before = existing.length;
    const incoming = await fetchSymbol(symbol);
    const merged = mergeRows(existing, incoming);
    fs.writeFileSync(filePath, `${merged.map((row) => JSON.stringify(row)).join("\n")}\n`);
    const first = merged[0]?.timestamp || null;
    const last = merged.at(-1)?.timestamp || null;
    console.log(
        JSON.stringify({
            symbol,
            timeframe,
            fetched: incoming.length,
            before,
            after: merged.length,
            added: merged.length - before,
            first,
            last,
            filePath,
        }),
    );
    await delay(requestDelayMs);
}
