/**
 * Read-only Capital broker audit. Copy this file into an active bot project
 * (as backtest/cpb-last-trades-audit.mjs) and run it there.  It creates a
 * session and reads account/history endpoints only; it never imports bot.js
 * and never sends an order or position update.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { API } from "../config.js";

const START = Date.parse(process.env.START || "2026-07-20T22:00:00Z");
const END = Date.parse(process.env.END || "2026-07-23T22:00:00Z");
const REPORT_PATH = process.env.REPORT_PATH || "/tmp/cpb-last-trades-audit.json";
const MAX_TRADES = Number(process.env.MAX_TRADES || 25);
const DAY_MS = 86_400_000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iso = (value) => new Date(value).toISOString().slice(0, 19);

if (!Number.isFinite(START) || !Number.isFinite(END) || END <= START) throw new Error("Invalid audit range.");

let login;
try {
  login = await axios.post(`${API.BASE_URL}/session`, {
    identifier: API.IDENTIFIER,
    password: API.PASSWORD,
    encryptedPassword: false,
  }, { headers: { "X-CAP-API-KEY": API.KEY, "Content-Type": "application/json" } });
} catch (error) {
  throw new Error(`Broker session request failed (HTTP ${error.response?.status || "unknown"}).`);
}
const headers = { "X-CAP-API-KEY": API.KEY, CST: login.headers.cst, "X-SECURITY-TOKEN": login.headers["x-security-token"] };
const get = async (pathname) => (await axios.get(`${API.BASE_URL}${pathname}`, { headers })).data;
const errors = [];

async function byDay(endpoint) {
  const output = [];
  for (let from = START; from < END; from += DAY_MS) {
    const to = Math.min(from + DAY_MS, END);
    try {
      const data = await get(`${endpoint}?from=${iso(from)}&to=${iso(to)}&max=100`);
      const key = endpoint.includes("transactions") ? "transactions" : "activities";
      const entries = data[key] || [];
      output.push(...entries);
      if (entries.length === 100) errors.push({ type: `${key}_day_reached_limit`, from: iso(from), to: iso(to) });
    } catch (error) {
      errors.push({ type: `${endpoint}_request_failed`, from: iso(from), status: error.response?.status || null });
    }
    await pause(700);
  }
  return output;
}

let accounts = [];
try { accounts = (await get("/accounts")).accounts || []; }
catch (error) { errors.push({ type: "accounts_request_failed", status: error.response?.status || null }); }

const [transactions, activities] = await Promise.all([byDay("/history/transactions"), byDay("/history/activity")]);
const ordered = [...transactions].sort((a, b) => Date.parse(b.dateUtc || b.date || 0) - Date.parse(a.dateUtc || a.date || 0));
// A history response also contains swaps. The requested sample is 25 closed
// positions, so do not let non-trade cash adjustments displace a position.
const recent = ordered.filter((trade) => trade.transactionType === "TRADE" && trade.dealId).slice(0, MAX_TRADES);
const recentDealIds = new Set(recent.map((trade) => trade.dealId).filter(Boolean));
const relatedActivity = activities.filter((item) => recentDealIds.has(item.dealId) || recent.some((trade) => trade.reference && trade.reference === item.dealReference));
const rejected = activities.filter((item) => item.type === "POSITION" && item.status === "REJECTED");

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const summaryTrade = (trade) => ({
  date: trade.date || null, dateUtc: trade.dateUtc || null, dealId: trade.dealId || null,
  reference: trade.reference || null, symbol: trade.instrumentName || null,
  transactionType: trade.transactionType || null, openLevel: number(trade.openLevel),
  closeLevel: number(trade.closeLevel), size: number(trade.size), profitAndLoss: number(trade.profitAndLoss),
  currency: trade.currency || null, cashTransaction: trade.cashTransaction || null,
});
const summaryActivity = (item) => ({
  date: item.date || null, dateUtc: item.dateUtc || null, dealId: item.dealId || null,
  dealReference: item.dealReference || null, status: item.status || null, source: item.source || null,
  type: item.type || null, epic: item.epic || null, description: item.description || null,
  details: item.details || null,
});

const report = {
  generatedAt: new Date().toISOString(), period: { start: new Date(START).toISOString(), end: new Date(END).toISOString() },
  account: accounts.map((a) => ({ accountId: a.accountId || null, accountName: a.accountName || null, currency: a.currency || null, balance: a.balance || null, available: a.available || null, preferred: a.preferred || false })),
  totals: { brokerTransactionsInRange: transactions.length, latestClosedTransactions: recent.length, relatedActivities: relatedActivity.length, rejectedPositionRequests: rejected.length },
  errors,
  transactions: recent.map(summaryTrade),
  relatedActivities: relatedActivity.map(summaryActivity),
  rejectedOrders: rejected.map(summaryActivity),
  raw: { transactions: recent, relatedActivities: relatedActivity, rejectedOrders: rejected },
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: REPORT_PATH, totals: report.totals, errors }, null, 2));
