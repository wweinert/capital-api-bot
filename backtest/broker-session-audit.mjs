/**
 * Read-only audit of realised broker transactions by the session in which the
 * position was opened. It never imports bot.js or changes positions/orders.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { API } from "../config.js";

const START = Date.parse(process.env.START || "2026-04-15T00:00:00Z");
const END = Date.parse(process.env.END || new Date().toISOString());
const REPORT_PATH = process.env.REPORT_PATH || path.join(process.cwd(), "backtest", "reports", "broker-session-audit.json");
const SYMBOLS = new Set((process.env.SYMBOLS || "EURUSD,GBPUSD,EURGBP,AUDUSD,USDCAD").split(","));
const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_PAUSE_MS = Number(process.env.REQUEST_PAUSE_MS || 750);

if (!Number.isFinite(START) || !Number.isFinite(END) || END <= START) {
  throw new Error("START and END must be valid timestamps.");
}

const iso = (timestamp) => new Date(timestamp).toISOString().slice(0, 19);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Capital returns `date` in the broker's Europe/Berlin time for this account.
// These are non-overlapping analytical windows, assigned by entry time.
function entrySession(brokerDate) {
  const hour = Number(brokerDate.slice(11, 13));
  if (hour < 8) return "Asia 00-08";
  if (hour < 13) return "London 08-13";
  if (hour < 17) return "London-NewYork overlap 13-17";
  if (hour < 22) return "New York 17-22";
  return "Late 22-24";
}

let session;
try {
  session = await axios.post(
    `${API.BASE_URL}/session`,
    { identifier: API.IDENTIFIER, password: API.PASSWORD, encryptedPassword: false },
    { headers: { "X-CAP-API-KEY": API.KEY, "Content-Type": "application/json" } },
  );
} catch (error) {
  throw new Error(`Broker session request failed (HTTP ${error.response?.status || "unknown"}).`);
}
const headers = {
  "X-CAP-API-KEY": API.KEY,
  CST: session.headers.cst,
  "X-SECURITY-TOKEN": session.headers["x-security-token"],
};
const get = async (pathname) => (await axios.get(`${API.BASE_URL}${pathname}`, { headers })).data;

const errors = [];
const transactions = [];
for (let timestamp = START; timestamp < END; timestamp += DAY_MS) {
  const to = Math.min(timestamp + DAY_MS, END);
  try {
    const response = await get(`/history/transactions?from=${iso(timestamp)}&to=${iso(to)}&max=100`);
    transactions.push(...(response.transactions || []));
    if ((response.transactions || []).length === 100) {
      errors.push({ type: "transaction_day_reached_api_limit", from: iso(timestamp), to: iso(to) });
    }
  } catch (error) {
    errors.push({ type: "transaction_request_failed", from: iso(timestamp), status: error.response?.status || null });
  }
  await pause(REQUEST_PAUSE_MS);
}

const relevantTransactions = transactions.filter((transaction) => SYMBOLS.has(transaction.instrumentName));
const requiredActivityDates = new Set();
for (const transaction of relevantTransactions) {
  const closedAt = Date.parse(transaction.dateUtc);
  requiredActivityDates.add(new Date(closedAt).toISOString().slice(0, 10));
  requiredActivityDates.add(new Date(closedAt - DAY_MS).toISOString().slice(0, 10));
}

const openings = new Map();
for (const date of [...requiredActivityDates].sort()) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  const to = Math.min(timestamp + DAY_MS, END);
  try {
    const response = await get(`/history/activity?from=${iso(timestamp)}&to=${iso(to)}&max=100`);
    const activities = response.activities || [];
    if (activities.length === 100) {
      errors.push({ type: "activity_day_reached_api_limit", from: iso(timestamp), to: iso(to) });
    }
    for (const activity of activities) {
      if (activity.source === "USER" && activity.type === "POSITION" && activity.status === "ACCEPTED") {
        openings.set(activity.dealId, activity);
      }
    }
  } catch (error) {
    errors.push({ type: "activity_request_failed", from: iso(timestamp), status: error.response?.status || null });
  }
  await pause(REQUEST_PAUSE_MS);
}

const trades = relevantTransactions.map((transaction) => {
  const opening = openings.get(transaction.dealId);
  return {
    symbol: transaction.instrumentName,
    pnl: Number(transaction.size),
    openedAt: opening?.date || null,
    closedAt: transaction.date,
    session: opening ? entrySession(opening.date) : "unmatched",
  };
});

const byEntrySession = {};
for (const trade of trades) {
  const stats = byEntrySession[trade.session] || { closed: 0, wins: 0, losses: 0, pnl: 0 };
  stats.closed += 1;
  stats.pnl += trade.pnl;
  if (trade.pnl > 0) stats.wins += 1;
  else stats.losses += 1;
  byEntrySession[trade.session] = stats;
}
for (const stats of Object.values(byEntrySession)) {
  stats.pnl = Number(stats.pnl.toFixed(2));
  stats.winRatePct = Number(((stats.wins / stats.closed) * 100).toFixed(1));
}

const report = {
  generatedAt: new Date().toISOString(),
  period: { start: new Date(START).toISOString(), end: new Date(END).toISOString() },
  symbols: [...SYMBOLS],
  sessions: "Europe/Berlin entry time: Asia 00-08, London 08-13, London-New York overlap 13-17, New York 17-22, Late 22-24",
  total: {
    closed: trades.length,
    wins: trades.filter((trade) => trade.pnl > 0).length,
    losses: trades.filter((trade) => trade.pnl <= 0).length,
    pnl: Number(trades.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2)),
    openingMatched: trades.filter((trade) => trade.openedAt).length,
  },
  byEntrySession,
  errors,
  trades,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: REPORT_PATH, total: report.total, byEntrySession, errors }, null, 2));
