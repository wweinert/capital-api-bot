/**
 * Isolated replay of the currently deployed capital-api-bot.
 *
 * This script never imports bot.js, never opens a broker session and never
 * touches PM2.  It deliberately mirrors the deployed entry path:
 *   bot.fetchHistoricalData() -> calcIndicators() -> processPrice()
 *   -> generateAndValidateSignal() -> calculateTradeParameters().
 *
 * Historical candles are used until their recorded end.  Later periods are
 * built from the server's raw Capital bid/ask websocket archive, so stops and
 * targets can be evaluated in tick order rather than from an ambiguous OHLC
 * bar.  A missing data interval makes the replay fail closed and is reported.
 *
 * Example (on the server):
 * START=2026-07-15T00:00:00Z END=2026-07-15T16:45:00Z \
 * CAPITAL_DATASET_DIR=/mnt/usb-ssd/trading/capital-dataset \
 * REPORT_PATH=/tmp/live-bot-replay-2026-07-15.json \
 * node backtest/live-bot-replay.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { ATR } from "technicalindicators";
import { calcIndicators } from "../indicators.js";

const DATASET_DIR = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const RAW_DIR = path.join(DATASET_DIR, "raw-quotes", "quotes");
const START = Date.parse(process.env.START || "2026-07-15T00:00:00Z");
const END = Date.parse(process.env.END || "2026-07-15T16:45:00Z");
const START_CAPITAL = Number(process.env.START_CAPITAL || 500);
const ANALYSIS_OFFSET_MS = Number(process.env.ANALYSIS_OFFSET_MS || 15_000);
const SYMBOL_PROCESS_DELAYS_MS = (process.env.SYMBOL_PROCESS_DELAYS_MS || "3600,6100,8500,11100,13700")
  .split(",")
  .map(Number);
// The deployed REST history returns completed candles for the entry signal.
// This is validated against the live PM2 session on 2026-07-15.
const INCLUDE_PARTIAL_CANDLES = process.env.INCLUDE_PARTIAL_CANDLES === "true";
const REPORT_PATH = process.env.REPORT_PATH || path.join(process.cwd(), "backtest", "reports", "live-bot-replay.json");
const SEED_POSITIONS_PATH = process.env.SEED_POSITIONS_PATH || null;
const SYMBOLS = (process.env.SYMBOLS || "EURUSD,GBPUSD,EURGBP,AUDUSD,USDCAD").split(",").filter(Boolean);

const TIMEFRAMES = {
  M1: 60_000,
  M5: 5 * 60_000,
  M15: 15 * 60_000,
};
const WARMUP_MS = 60 * 60 * 1000; // M15 needs 220 bars = 55 hours; market gaps need headroom.
const REPLAY_START = START - WARMUP_MS * 72;
// A streaming quote feed sends no event while the price is unchanged.  A
// latest quote up to one analysis interval old therefore remains usable at a
// range edge; a longer absence is reported as missing execution data.
const TICK_EDGE_TOLERANCE_MS = TIMEFRAMES.M1;

if (!Number.isFinite(START) || !Number.isFinite(END) || END <= START) {
  throw new Error("START and END must be valid ISO timestamps and END must be after START.");
}
if (SYMBOL_PROCESS_DELAYS_MS.length !== SYMBOLS.length || SYMBOL_PROCESS_DELAYS_MS.some((delay) => !Number.isFinite(delay) || delay < 0)) {
  throw new Error("SYMBOL_PROCESS_DELAYS_MS must contain one non-negative millisecond delay per symbol.");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function floorTo(timestamp, intervalMs) {
  return Math.floor(timestamp / intervalMs) * intervalMs;
}

function readJsonLines(file, transform) {
  if (!fs.existsSync(file)) return [];
  const rows = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const value = transform(JSON.parse(line));
      if (value) rows.push(value);
    } catch {
      // A malformed archive line is recorded as a coverage gap instead of
      // silently changing the strategy's decision.
    }
  }
  return rows;
}

function normalizeStoredCandle(raw) {
  const timestamp = Date.parse(raw.timestamp || raw.snapshotTimeUTC || raw.snapshotTime);
  const bid = (field) => number(raw[`${field}Bid`] ?? raw[field]?.bid ?? raw[field]);
  const ask = (field) => number(raw[`${field}Ask`] ?? raw[field]?.ask ?? raw[field]);
  const openBid = bid("open");
  const highBid = bid("high");
  const lowBid = bid("low");
  const closeBid = bid("close");
  const openAsk = ask("open") ?? openBid;
  const highAsk = ask("high") ?? highBid;
  const lowAsk = ask("low") ?? lowBid;
  const closeAsk = ask("close") ?? closeBid;
  if (![timestamp, openBid, highBid, lowBid, closeBid, openAsk, highAsk, lowAsk, closeAsk].every(Number.isFinite)) return null;
  return {
    timestamp,
    open: { bid: openBid, ask: openAsk },
    high: { bid: highBid, ask: highAsk },
    low: { bid: lowBid, ask: lowAsk },
    close: { bid: closeBid, ask: closeAsk },
    source: "stored-candle",
  };
}

function normalizeTick(raw) {
  const timestamp = number(raw.timestamp) ?? Date.parse(raw.brokerTime);
  const bid = number(raw.bid);
  const ask = number(raw.ask);
  if (![timestamp, bid, ask].every(Number.isFinite)) return null;
  return { timestamp, bid, ask };
}

function aggregateTicks(ticks, intervalMs) {
  const buckets = new Map();
  for (const tick of ticks) {
    const timestamp = floorTo(tick.timestamp, intervalMs);
    let candle = buckets.get(timestamp);
    if (!candle) {
      candle = {
        timestamp,
        open: { bid: tick.bid, ask: tick.ask },
        high: { bid: tick.bid, ask: tick.ask },
        low: { bid: tick.bid, ask: tick.ask },
        close: { bid: tick.bid, ask: tick.ask },
        source: "raw-ticks",
      };
      buckets.set(timestamp, candle);
      continue;
    }
    candle.high.bid = Math.max(candle.high.bid, tick.bid);
    candle.high.ask = Math.max(candle.high.ask, tick.ask);
    candle.low.bid = Math.min(candle.low.bid, tick.bid);
    candle.low.ask = Math.min(candle.low.ask, tick.ask);
    candle.close = { bid: tick.bid, ask: tick.ask };
  }
  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function mergeCandles(stored, derived) {
  const merged = new Map(stored.map((candle) => [candle.timestamp, candle]));
  for (const candle of derived) merged.set(candle.timestamp, candle);
  return [...merged.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function lowerBound(rows, timestamp) {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (rows[middle].timestamp < timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}

function atOrBefore(rows, timestamp) {
  const index = lowerBound(rows, timestamp);
  return index < rows.length && rows[index].timestamp === timestamp ? index : index - 1;
}

function lastBars(rows, timestamp, count) {
  const endIndex = atOrBefore(rows, timestamp);
  if (endIndex < 0) return [];
  return rows.slice(Math.max(0, endIndex - count + 1), endIndex + 1);
}

function tickAtOrBefore(ticks, timestamp) {
  const index = atOrBefore(ticks, timestamp);
  return index >= 0 ? ticks[index] : null;
}

function partialCandle(ticks, timestamp, intervalMs) {
  const start = floorTo(timestamp, intervalMs);
  const from = lowerBound(ticks, start);
  const to = lowerBound(ticks, timestamp + 1);
  if (from >= to) return null;
  const first = ticks[from];
  const candle = {
    timestamp: start,
    open: { bid: first.bid, ask: first.ask },
    high: { bid: first.bid, ask: first.ask },
    low: { bid: first.bid, ask: first.ask },
    close: { bid: first.bid, ask: first.ask },
    source: "raw-ticks-partial",
  };
  for (let index = from + 1; index < to; index += 1) {
    const tick = ticks[index];
    candle.high.bid = Math.max(candle.high.bid, tick.bid);
    candle.high.ask = Math.max(candle.high.ask, tick.ask);
    candle.low.bid = Math.min(candle.low.bid, tick.bid);
    candle.low.ask = Math.min(candle.low.ask, tick.ask);
    candle.close = { bid: tick.bid, ask: tick.ask };
  }
  return candle;
}

function barsAt(rows, ticks, timeframe, timestamp, count, includePartial = INCLUDE_PARTIAL_CANDLES) {
  // Capital's REST request is made at the live wall-clock time.  The current
  // candle is therefore still forming; using its final high/low would leak
  // future information and create false signals.  Replace it with the tick
  // state known at that exact instant.
  const intervalMs = TIMEFRAMES[timeframe];
  const bucket = floorTo(timestamp, intervalMs);
  const complete = lastBars(rows, bucket - 1, count);
  const partial = includePartial ? partialCandle(ticks, timestamp, intervalMs) : null;
  return partial ? [...complete, partial].slice(-count) : complete;
}

function pipValue(symbol) {
  return symbol.includes("JPY") ? 0.01 : 0.0001;
}

function positionSize(balance, entryPrice, stopLossPrice, symbol) {
  const riskAmount = balance * 0.02;
  const pip = pipValue(symbol);
  const stopLossPips = Math.abs(entryPrice - stopLossPrice) / pip;
  if (!stopLossPips) return 0;
  let size = (riskAmount / (stopLossPips * pip)) * 1000;
  size = Math.floor(size / 100) * 100;
  if (size < 100) size = 100;
  const marginRequired = (size * entryPrice) / 30;
  const maxMarginPerTrade = balance / 5;
  if (marginRequired > maxMarginPerTrade) {
    size = Math.floor((maxMarginPerTrade * 30) / entryPrice / 100) * 100;
    if (size < 100) size = 100;
  }
  return size;
}

function calculateAtrM15(rows, ticks, timestamp) {
  // The live bot makes a separate REST request for ATR after the signal.  In
  // the validated PM2 session that request includes the then-current M15
  // candle, whereas signal indicators use the completed set fetched earlier.
  const bars = barsAt(rows, ticks, "M15", timestamp, 30, true);
  if (bars.length < 21) return 0.001;
  const result = ATR.calculate({
    period: 21,
    high: bars.map((bar) => bar.high.bid),
    low: bars.map((bar) => bar.low.bid),
    close: bars.map((bar) => bar.close.bid),
  });
  return result.at(-1) ?? 0.001;
}

async function signalFor(symbol, frames, ticks, timestamp, tick) {
  // The deployed bot runs with DEV_MODE=true.  Its misleading variable names
  // h4/h1/m15 therefore resolve to M15/M5/M1 respectively.
  const h4Data = barsAt(frames.M15, ticks, "M15", timestamp, 220);
  const h1Data = barsAt(frames.M5, ticks, "M5", timestamp, 220);
  const m15Data = barsAt(frames.M1, ticks, "M1", timestamp, 220);
  if ([h4Data, h1Data, m15Data].some((bars) => bars.length < 220)) {
    return { signal: null, reason: "insufficient_indicator_history" };
  }
  const [h4, h1, m15] = await Promise.all([
    calcIndicators(h4Data, symbol, "M15"),
    calcIndicators(h1Data, symbol, "M5"),
    calcIndicators(m15Data, symbol, "M1"),
  ]);
  if (!h4 || !h1 || !m15 || !tick) return { signal: null, reason: "missing_indicator_or_tick" };
  const buyConditions = [
    h4.emaFast > h4.emaSlow,
    h4.macd?.histogram > 0,
    h1.ema9 > h1.ema21,
    h1.rsi < 35,
    m15.isBullishCross,
    m15.rsi < 30,
    tick.bid <= m15.bb?.lower,
  ];
  const sellConditions = [
    !h4.isBullishTrend,
    h4.macd?.histogram < 0,
    h1.ema9 < h1.ema21,
    h1.rsi > 65,
    m15.isBearishCross,
    m15.rsi > 70,
    tick.ask >= m15.bb?.upper,
  ];
  const buyScore = buyConditions.filter(Boolean).length;
  const sellScore = sellConditions.filter(Boolean).length;
  // dynamicSignalThreshold starts at 3 and is never updated when Capital
  // closes a position via SL/TP, exactly like the deployed process.
  const signal = buyScore >= 3 ? "buy" : sellScore >= 3 ? "sell" : null;
  return { signal, buyScore, sellScore, h4, h1, m15 };
}

function createPosition(symbol, direction, timestamp, tick, frames, ticks, balance) {
  const entry = direction === "buy" ? tick.ask : tick.bid;
  const atr = calculateAtrM15(frames.M15, ticks, timestamp);
  const stopDistance = 2.5 * atr;
  const takeProfitDistance = 3 * atr;
  const stopLoss = direction === "buy" ? entry - stopDistance : entry + stopDistance;
  const takeProfit = direction === "buy" ? entry + takeProfitDistance : entry - takeProfitDistance;
  return {
    id: `${symbol}-${timestamp}`,
    symbol,
    direction,
    openedAt: timestamp,
    entry,
    size: positionSize(balance, entry, stopLoss, symbol),
    stopLoss,
    takeProfit,
    atr,
  };
}

function closeAt(position, timestamp, price, reason) {
  const pnl = (position.direction === "buy" ? price - position.entry : position.entry - price) * position.size;
  return { ...position, closedAt: timestamp, closePrice: price, closeReason: reason, pnl };
}

function evaluateStopsAndTargets(position, tick) {
  if (position.direction === "buy") {
    if (tick.bid <= position.stopLoss) return closeAt(position, tick.timestamp, position.stopLoss, "stop");
    if (tick.bid >= position.takeProfit) return closeAt(position, tick.timestamp, position.takeProfit, "target");
  } else {
    if (tick.ask >= position.stopLoss) return closeAt(position, tick.timestamp, position.stopLoss, "stop");
    if (tick.ask <= position.takeProfit) return closeAt(position, tick.timestamp, position.takeProfit, "target");
  }
  return null;
}

function rawFiles(symbol, from, to) {
  const dates = [];
  for (let timestamp = floorTo(from, 24 * 60 * 60 * 1000); timestamp <= to; timestamp += 24 * 60 * 60 * 1000) {
    dates.push(path.join(RAW_DIR, symbol, `${dateKey(timestamp)}.jsonl`));
  }
  return dates;
}

function loadSymbol(symbol) {
  const frames = {};
  for (const timeframe of Object.keys(TIMEFRAMES)) {
    const stored = readJsonLines(path.join(DATASET_DIR, `${symbol}_${timeframe}.jsonl`), normalizeStoredCandle)
      .filter((row) => row.timestamp >= REPLAY_START && row.timestamp <= END);
    frames[timeframe] = stored;
  }
  const ticks = rawFiles(symbol, REPLAY_START, END)
    .flatMap((file) => readJsonLines(file, normalizeTick))
    .filter((tick) => tick.timestamp >= REPLAY_START && tick.timestamp <= END)
    .sort((a, b) => a.timestamp - b.timestamp);
  for (const [timeframe, interval] of Object.entries(TIMEFRAMES)) {
    frames[timeframe] = mergeCandles(frames[timeframe], aggregateTicks(ticks, interval));
  }
  return { frames, ticks };
}

const data = new Map(SYMBOLS.map((symbol) => [symbol, loadSymbol(symbol)]));
const gaps = [];
const tickCoverage = {};
for (const [symbol, { frames, ticks }] of data) {
  if (!ticks.length) gaps.push({ symbol, type: "no_ticks" });
  else {
    const first = ticks[0].timestamp;
    const last = ticks.at(-1).timestamp;
    tickCoverage[symbol] = {
      start: new Date(first).toISOString(),
      end: new Date(last).toISOString(),
    };
    if (first > START + TICK_EDGE_TOLERANCE_MS || last < END - TICK_EDGE_TOLERANCE_MS) {
      gaps.push({
        symbol,
        type: "incomplete_tick_coverage",
        requestedStart: new Date(START).toISOString(),
        requestedEnd: new Date(END).toISOString(),
        availableStart: new Date(first).toISOString(),
        availableEnd: new Date(last).toISOString(),
      });
    }
  }
  for (const [timeframe, rows] of Object.entries(frames)) {
    if (!rows.length) gaps.push({ symbol, type: "no_candles", timeframe });
  }
}

const positions = SEED_POSITIONS_PATH
  ? JSON.parse(fs.readFileSync(SEED_POSITIONS_PATH, "utf8")).map((position) => ({
      ...position,
      openedAt: Date.parse(position.openedAt),
    }))
  : [];
for (const position of positions) {
  if (!SYMBOLS.includes(position.symbol) || !Number.isFinite(position.openedAt) || ![position.entry, position.size, position.stopLoss, position.takeProfit].every(Number.isFinite)) {
    throw new Error(`Invalid seeded position: ${JSON.stringify(position)}`);
  }
}
const seedCount = positions.length;
const closed = [];
const signalEvents = [];
let balance = START_CAPITAL;
let lastTickEvaluation = START;

function processTicksUntil(timestamp) {
  for (const position of [...positions]) {
    const { ticks } = data.get(position.symbol);
    let index = lowerBound(ticks, Math.max(lastTickEvaluation + 1, position.openedAt + 1));
    while (index < ticks.length && ticks[index].timestamp <= timestamp) {
      const result = evaluateStopsAndTargets(position, ticks[index]);
      if (result) {
        positions.splice(positions.indexOf(position), 1);
        closed.push(result);
        balance += result.pnl;
        break;
      }
      index += 1;
    }
  }
  lastTickEvaluation = timestamp;
}

function processTimeExits(timestamp) {
  // monitorOpenTrades() runs every minute in the deployed process and closes
  // positions held for more than 120 minutes. It does not call
  // updateTradeResult(), so the adaptive entry threshold remains unchanged.
  for (const position of [...positions]) {
    if (timestamp <= position.openedAt + 120 * TIMEFRAMES.M1) continue;
    const tick = tickAtOrBefore(data.get(position.symbol).ticks, timestamp);
    if (!tick) continue;
    const price = position.direction === "buy" ? tick.bid : tick.ask;
    positions.splice(positions.indexOf(position), 1);
    const result = closeAt(position, timestamp, price, "time_exit");
    closed.push(result);
    balance += result.pnl;
  }
}

let minuteStart = floorTo(START, TIMEFRAMES.M1) + ANALYSIS_OFFSET_MS;
if (minuteStart < START) minuteStart += TIMEFRAMES.M1;
while (minuteStart <= END) {
  processTicksUntil(minuteStart);
  processTimeExits(minuteStart);
  for (const [symbolIndex, symbol] of SYMBOLS.entries()) {
    const timestamp = minuteStart + SYMBOL_PROCESS_DELAYS_MS[symbolIndex];
    if (timestamp > END) break;
    processTicksUntil(timestamp);
    if (positions.length >= 5 || positions.some((position) => position.symbol === symbol)) continue;
    const { frames, ticks } = data.get(symbol);
    const tick = tickAtOrBefore(ticks, timestamp);
    const evaluated = await signalFor(symbol, frames, ticks, timestamp, tick);
    if (evaluated.signal) {
      const position = createPosition(symbol, evaluated.signal, timestamp, tick, frames, ticks, balance);
      positions.push(position);
      signalEvents.push({
        timestamp: new Date(timestamp).toISOString(),
        symbol,
        signal: evaluated.signal.toUpperCase(),
        buyScore: evaluated.buyScore,
        sellScore: evaluated.sellScore,
        entry: position.entry,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        size: position.size,
      });
    }
  }
  minuteStart += TIMEFRAMES.M1;
}
processTicksUntil(END);

const report = {
  generatedAt: new Date().toISOString(),
  source: {
    strategyCommit: "66f40d70b75eab1472443e311d89c0fe1cd1a007",
    mode: "DEV_MODE=true; M15/M5/M1 entry analysis; M15 ATR sizing",
    data: "stored bid/ask candles overlaid by raw Capital websocket bid/ask ticks; entries and exits are only exact where raw ticks are present",
  },
  period: { start: new Date(START).toISOString(), end: new Date(END).toISOString() },
  replay: { symbols: SYMBOLS, startCapital: START_CAPITAL, analysisOffsetMs: ANALYSIS_OFFSET_MS, symbolProcessDelaysMs: SYMBOL_PROCESS_DELAYS_MS, includePartialCandles: INCLUDE_PARTIAL_CANDLES },
  seededPositions: seedCount,
  tickCoverage,
  coverageGaps: gaps,
  result: {
    opened: signalEvents.length,
    closed: closed.length,
    stillOpen: positions.length,
    realizedPnl: closed.reduce((sum, position) => sum + position.pnl, 0),
    balance,
    targets: closed.filter((position) => position.closeReason === "target").length,
    stops: closed.filter((position) => position.closeReason === "stop").length,
  },
  signalEvents,
  closed,
  openPositions: positions,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: REPORT_PATH, ...report.result, coverageGaps: gaps.length }, null, 2));
