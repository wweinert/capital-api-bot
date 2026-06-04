// Diagnostic backtest: last 24h with portfolio guards
// Guards: MAX_POSITIONS=1, max 1 position per symbol, START_CAPITAL=500 EUR
// Shows which signals fire, which are blocked by guards, running P&L

import fs from "fs";
import path from "path";
import { shouldEnter } from "../strategies/entry.js";
import { ATR } from "technicalindicators";

const DATA_DIR = path.join(process.cwd(), "backtest", "capital-dataset");
const SYMBOLS = ["GBPAUD", "EURAUD", "EURJPY", "GBPUSD"];
const ATR_PERIOD = 14;
const NEW_ATR_THRESHOLD = 0.00018; // updated threshold
const START_CAPITAL = 500;
const MAX_POSITIONS = 1;
const RISK_PCT = 0.03;
const AVG_SPREAD_PIPS = 1.5; // typical spread cost in pips
const HOLD_BARS = 4; // simplified: close after 4 bars (1h) if no SL/TP hit

function loadJsonl(file) {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8")
        .split("\n").filter(Boolean)
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);
}

function calcM5AtrPct(m5Bars) {
    const stable = m5Bars.length > 1 ? m5Bars.slice(0, -1) : m5Bars;
    const highs = stable.map(b => b.high);
    const lows  = stable.map(b => b.low);
    const closes = stable.map(b => b.close);
    if (stable.length < ATR_PERIOD + 1) return null;
    const atrSeries = ATR.calculate({ period: ATR_PERIOD, high: highs, low: lows, close: closes });
    const atr = atrSeries[atrSeries.length - 1];
    const lastClose = closes[closes.length - 1];
    return (atr != null && lastClose > 0) ? atr / lastClose : null;
}

function pipSize(symbol) {
    return symbol.includes("JPY") ? 0.01 : 0.0001;
}

// Simplified P&L: check if SL or TP was hit in subsequent bars
function resolveTradeOutcome(signal, entry, sl, tp, barsAfter, symbol) {
    const pip = pipSize(symbol);
    const isBuy = signal === "BUY";
    const spreadCost = AVG_SPREAD_PIPS * pip; // spread paid on entry
    const effectiveEntry = isBuy ? entry + spreadCost : entry - spreadCost;
    const stopDist = Math.abs(effectiveEntry - sl);
    const tpDist = Math.abs(tp - effectiveEntry);

    for (const bar of barsAfter) {
        if (isBuy) {
            if (bar.low <= sl)  return { result: "SL", exitPrice: sl,  rR: -1, bars: barsAfter.indexOf(bar) + 1 };
            if (bar.high >= tp) return { result: "TP", exitPrice: tp,  rR: tpDist / stopDist, bars: barsAfter.indexOf(bar) + 1 };
        } else {
            if (bar.high >= sl) return { result: "SL", exitPrice: sl,  rR: -1, bars: barsAfter.indexOf(bar) + 1 };
            if (bar.low <= tp)  return { result: "TP", exitPrice: tp,  rR: tpDist / stopDist, bars: barsAfter.indexOf(bar) + 1 };
        }
    }
    // Force close at last available bar
    const lastBar = barsAfter[barsAfter.length - 1];
    if (!lastBar) return null;
    const closePrice = lastBar.close;
    const rR = isBuy
        ? (closePrice - effectiveEntry) / stopDist
        : (effectiveEntry - closePrice) / stopDist;
    return { result: "OPEN/FORCE_CLOSE", exitPrice: closePrice, rR, bars: barsAfter.length };
}

// ── LOAD ALL DATA ──────────────────────────────────────────────────
const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

const allM15BySymbol = {};
const allM5BySymbol  = {};
for (const symbol of SYMBOLS) {
    allM15BySymbol[symbol] = loadJsonl(path.join(DATA_DIR, `${symbol}_M15.jsonl`));
    allM5BySymbol[symbol]  = loadJsonl(path.join(DATA_DIR, `${symbol}_M5.jsonl`));
}

// Build a unified timeline of all M15 closes across symbols (sorted)
const timeline = [];
for (const symbol of SYMBOLS) {
    const rows = allM15BySymbol[symbol].filter(r => Date.parse(r.timestamp) >= cutoff24h);
    for (const bar of rows) {
        timeline.push({ symbol, bar, ts: Date.parse(bar.timestamp) });
    }
}
timeline.sort((a, b) => a.ts - b.ts);

// ── PORTFOLIO SIMULATION ───────────────────────────────────────────
let balance = START_CAPITAL;
const openPositions = new Map(); // symbol → { signal, entry, sl, tp, openTs, openBar }
const trades = [];
const skippedByGuard = [];
let signalCount = 0;

for (const { symbol, bar, ts } of timeline) {
    const barCloseTs = ts + 15 * 60 * 1000;
    const allM15 = allM15BySymbol[symbol];
    const allM5  = allM5BySymbol[symbol];

    // Build context bars
    const barIdx = allM15.findIndex(r => r.timestamp === bar.timestamp);
    const contextStart = Math.max(0, barIdx - 49);
    const m15Slice = allM15.slice(contextStart, barIdx + 1);

    const m5AtClose = allM5.filter(r => Date.parse(r.timestamp) + 5 * 60 * 1000 <= barCloseTs);
    const m5Slice = m5AtClose.slice(-50);

    const m5AtrPct = calcM5AtrPct(m5Slice);

    // Check if existing position on this symbol has resolved
    if (openPositions.has(symbol)) {
        const pos = openPositions.get(symbol);
        // Check current bar for SL/TP hit
        const isBuy = pos.signal === "BUY";
        if ((isBuy && bar.low <= pos.sl) || (!isBuy && bar.high >= pos.sl)) {
            const riskAmount = balance * RISK_PCT;
            const pnl = -riskAmount;
            balance += pnl;
            trades.push({ ...pos, closeTs: bar.timestamp, result: "SL", rR: -1, pnl: pnl.toFixed(2), balanceAfter: balance.toFixed(2) });
            openPositions.delete(symbol);
        } else if ((isBuy && bar.high >= pos.tp) || (!isBuy && bar.low <= pos.tp)) {
            const riskAmount = balance * RISK_PCT;
            const stopDist = Math.abs(pos.entry - pos.sl);
            const tpDist   = Math.abs(pos.tp - pos.entry);
            const rR = tpDist / stopDist;
            const pnl = riskAmount * rR;
            balance += pnl;
            trades.push({ ...pos, closeTs: bar.timestamp, result: "TP", rR: rR.toFixed(2), pnl: pnl.toFixed(2), balanceAfter: balance.toFixed(2) });
            openPositions.delete(symbol);
        }
    }

    // Guard: max 1 open position total
    if (openPositions.size >= MAX_POSITIONS) continue;
    // Guard: max 1 per symbol
    if (openPositions.has(symbol)) continue;

    const decision = shouldEnter({
        bars: m15Slice,
        m5AtrPct,
        spread: AVG_SPREAD_PIPS * pipSize(symbol),
        symbol,
        equity: balance,
        params: { minM5AtrPct: NEW_ATR_THRESHOLD },
        nowMs: barCloseTs,
    });

    if (!decision.signal) continue;

    signalCount++;
    openPositions.set(symbol, {
        symbol,
        signal: decision.signal,
        entry: decision.entry,
        sl: decision.sl,
        tp: decision.tp,
        stopPips: decision.stopPips,
        openTs: bar.timestamp,
        riskAmount: balance * RISK_PCT,
    });
}

// Force-close any still-open positions at last known price
for (const [symbol, pos] of openPositions) {
    const lastBar = allM15BySymbol[symbol].at(-1);
    const closePrice = lastBar?.close ?? pos.entry;
    const isBuy = pos.signal === "BUY";
    const stopDist = Math.abs(pos.entry - pos.sl);
    const rR = isBuy
        ? (closePrice - pos.entry) / stopDist
        : (pos.entry - closePrice) / stopDist;
    const pnl = pos.riskAmount * rR;
    balance += pnl;
    trades.push({ ...pos, closeTs: lastBar?.timestamp ?? "open", result: "STILL_OPEN", rR: rR.toFixed(2), pnl: pnl.toFixed(2), balanceAfter: balance.toFixed(2) });
}

// ── OUTPUT ─────────────────────────────────────────────────────────
const wins  = trades.filter(t => parseFloat(t.rR) > 0);
const losses = trades.filter(t => parseFloat(t.rR) <= 0);
const totalPnl = (balance - START_CAPITAL).toFixed(2);
const winRate = trades.length ? ((wins.length / trades.length) * 100).toFixed(1) : "n/a";

console.log("\n═══════════════════════════════════════════");
console.log("  24h PORTFOLIO BACKTEST w/ GUARDS");
console.log("═══════════════════════════════════════════");
console.log(`Period:        ${new Date(cutoff24h).toISOString()} → ${new Date().toISOString()}`);
console.log(`ATR threshold: ${NEW_ATR_THRESHOLD} (was 0.00035)`);
console.log(`Capital:       ${START_CAPITAL} EUR | Risk/trade: ${(RISK_PCT * 100)}%`);
console.log(`Max positions: ${MAX_POSITIONS} total, 1 per symbol`);
console.log(`Spread cost:   ${AVG_SPREAD_PIPS} pips (applied on entry)`);
console.log("───────────────────────────────────────────");
console.log(`Signals fired: ${signalCount}`);
console.log(`Trades taken:  ${trades.length}  (wins: ${wins.length}  losses: ${losses.length})`);
console.log(`Win rate:      ${winRate}%`);
console.log(`Net P&L:       ${totalPnl} EUR`);
console.log(`End balance:   ${balance.toFixed(2)} EUR`);
console.log("\n── TRADE LOG ───────────────────────────────");

for (const t of trades) {
    const rRNum = parseFloat(t.rR);
    const icon = t.result === "TP" ? "✓" : t.result === "SL" ? "✗" : "~";
    const rRStr = rRNum > 0 ? `+${rRNum.toFixed(2)}R` : `${rRNum.toFixed(2)}R`;
    console.log(
        `${icon} ${t.openTs.slice(11, 16)}→${t.closeTs?.slice?.(11, 16) ?? "?"}  ` +
        `${t.symbol} ${t.signal.padEnd(4)}  ` +
        `entry=${t.entry?.toFixed(5)}  sl=${t.sl?.toFixed(5)}  stop=${t.stopPips?.toFixed(1)}p  ` +
        `${t.result.padEnd(12)}  ${rRStr}  PnL=${t.pnl}€  bal=${t.balanceAfter}€`
    );
}

if (trades.length === 0) {
    console.log("  No trades taken in this period.");
}

console.log("\n── ATR CONTEXT (current live values) ──────");
for (const symbol of SYMBOLS) {
    const allM15 = allM15BySymbol[symbol];
    const allM5  = allM5BySymbol[symbol];
    const recentBars = allM15.slice(-6);
    const atrVals = recentBars.map(bar => {
        const barTs = Date.parse(bar.timestamp) + 15 * 60 * 1000;
        const m5s = allM5.filter(r => Date.parse(r.timestamp) + 5 * 60 * 1000 <= barTs).slice(-50);
        const pct = calcM5AtrPct(m5s);
        const flag = pct == null ? "null" : pct < NEW_ATR_THRESHOLD ? `${pct.toFixed(6)} ← BLOCKED` : `${pct.toFixed(6)} ← ok`;
        return `  ${bar.timestamp.slice(11, 16)} ${flag}`;
    });
    console.log(`\n${symbol}:\n${atrVals.join("\n")}`);
}
