import fs from "node:fs";
import axios from "axios";
import { API } from "../../config.js";

const dataset = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const dryRun = process.env.DRY_RUN === "1";
const symbols = (process.env.SYMBOLS || "EURUSD,GBPUSD,EURGBP,AUDUSD,USDCAD,EURJPY,USDJPY,AUDJPY,NZDUSD,NZDJPY").split(",").filter(Boolean);
const frames = {
  M1: { resolution: "MINUTE", stepMs: 60_000, chunkMs: 12 * 60 * 60_000 },
  M5: { resolution: "MINUTE_5", stepMs: 5 * 60_000, chunkMs: 3 * 86_400_000 },
  M15: { resolution: "MINUTE_15", stepMs: 15 * 60_000, chunkMs: 10 * 86_400_000 },
  H1: { resolution: "HOUR", stepMs: 60 * 60_000, chunkMs: 30 * 86_400_000 },
  H4: { resolution: "HOUR_4", stepMs: 4 * 60 * 60_000, chunkMs: 120 * 86_400_000 },
  D1: { resolution: "DAY", stepMs: 24 * 60 * 60_000, chunkMs: 365 * 86_400_000 },
};
const frameKeys = (process.env.FRAMES || Object.keys(frames).join(",")).split(",").filter((key) => frames[key]);
const fromOverride = Date.parse(process.env.FROM_OVERRIDE || "");

const apiBase = API.BASE_URL;
let cst, securityToken;
let lastRequestAt = 0;

const apiTime = (timestamp) => new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, "");
const readLastTimestamp = (file) => {
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { return Date.parse(JSON.parse(lines[i]).timestamp); } catch {}
  }
  return null;
};
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const price = (bar, field, side) => number(bar[`${field}Price`]?.[side]) ?? number(bar[field]?.[side]);

async function startSession() {
  const response = await axios.post(`${apiBase}/session`, {
    identifier: API.IDENTIFIER,
    password: API.PASSWORD,
    encryptedPassword: false,
  }, { headers: { "X-CAP-API-KEY": API.KEY, "Content-Type": "application/json" } });
  cst = response.headers.cst;
  securityToken = response.headers["x-security-token"];
  if (!cst || !securityToken) throw new Error("Capital session did not return tokens");
}

const headers = () => ({ "X-CAP-API-KEY": API.KEY, CST: cst, "X-SECURITY-TOKEN": securityToken });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function requestPrices(symbol, frame, from, to) {
  const wait = Math.max(0, 150 - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();
  return axios.get(`${apiBase}/prices/${symbol}`, { headers: headers(), params: { resolution: frame.resolution, max: 1_000, from: apiTime(from), to: apiTime(to) } });
}
async function prices(symbol, frame, from, to) {
  try {
    const response = await requestPrices(symbol, frame, from, to);
    return response.data.prices ?? [];
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      await startSession();
      const response = await requestPrices(symbol, frame, from, to);
      return response.data.prices ?? [];
    }
    if (error.response?.status === 429) {
      await sleep(1_500);
      const response = await requestPrices(symbol, frame, from, to);
      return response.data.prices ?? [];
    }
    const wrapped = new Error(`${symbol}/${frame.resolution}: ${error.response?.data?.errorCode ?? error.message}`);
    wrapped.code = error.response?.data?.errorCode;
    wrapped.status = error.response?.status;
    throw wrapped;
  }
}

function normalize(raw) {
  const timestamp = Date.parse(raw.snapshotTimeUTC ?? raw.snapshotTime);
  const bid = Object.fromEntries(["open", "high", "low", "close"].map((field) => [field, price(raw, field, "bid")]));
  const ask = Object.fromEntries(["open", "high", "low", "close"].map((field) => [field, price(raw, field, "ask")]));
  if (!Number.isFinite(timestamp) || Object.values(bid).some((value) => value == null)) return null;
  return {
    schemaVersion: 2,
    timestamp: new Date(timestamp).toISOString(),
    snapshotTime: raw.snapshotTime ?? new Date(timestamp).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""),
    snapshotTimeUTC: raw.snapshotTimeUTC ?? new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, ""),
    open: bid.open, high: bid.high, low: bid.low, close: bid.close,
    bid, ask,
    spread: ask.close != null ? ask.close - bid.close : null,
    volume: number(raw.lastTradedVolume) ?? 0,
    source: "capital-rest-historical",
  };
}

async function updateFile(symbol, key, frame) {
  const file = `${dataset}/${symbol}_${key}.jsonl`;
  const last = readLastTimestamp(file);
  if (!last) throw new Error(`No existing file or timestamp: ${file}`);
  const now = Date.now();
  let cursor = Number.isFinite(fromOverride) ? Math.max(fromOverride, last + frame.stepMs) : last + frame.stepMs;
  const rows = new Map();
  while (cursor < now) {
    const end = Math.min(cursor + frame.chunkMs, now);
    for (const raw of await prices(symbol, frame, cursor, end)) {
      const row = normalize(raw); if (row && Date.parse(row.timestamp) > last) rows.set(row.timestamp, row);
    }
    cursor = end + frame.stepMs;
  }
  const additions = [...rows.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (!dryRun && additions.length) fs.appendFileSync(file, `${additions.map((row) => JSON.stringify(row)).join("\n")}\n`);
  return { symbol, key, existingLast: new Date(last).toISOString(), additions: additions.length, newest: additions.at(-1)?.timestamp ?? null, dryRun };
}

try {
  await startSession();
  const summary = [];
  for (const symbol of symbols) for (const key of frameKeys) summary.push(await updateFile(symbol, key, frames[key]));
  console.log(JSON.stringify({ dataset, dryRun, generatedAt: new Date().toISOString(), summary }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: "historical_update_failed", code: error.code ?? null, status: error.status ?? null, message: error.message }));
  process.exitCode = 1;
}
