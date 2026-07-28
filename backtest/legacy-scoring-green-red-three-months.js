/**
 * Offline replay of strategies/strategies.js at dca8b124 (19 Sep 2025).
 *
 * Entry logic reproduced here:
 *   1. M15 checkScoring() (three of three score points and ADX gate)
 *   2. H1 green/red price-action candle must agree with the scoring direction
 *
 * Execution uses the parameters from that same revision of services/trading.js:
 * next M1 open, previous M1 extreme +/- buffer for SL, 10/12 pip minimum SL,
 * 1.8R TP, maximum five simultaneous positions. It is an offline simulation
 * and does not make a broker/API request.
 */
import fs from "node:fs";
import readline from "node:readline";
import { EMA, MACD, ADX } from "technicalindicators";

const MINUTE = 60_000;
const M15 = 15 * MINUTE;
const H1 = 60 * MINUTE;
const SYMBOLS = (process.env.SYMBOLS || "EURUSD,GBPUSD,EURGBP,AUDUSD,USDCAD")
  .split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
const DATASET = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const END = Date.parse(process.env.END_DATE || "2026-06-29T13:00:00.000Z");
const START = END - 90 * 24 * H1;
const WARMUP_START = START - 21 * 24 * H1;
const START_CAPITAL = Number(process.env.START_CAPITAL || 500);
const REPORT_PATH = process.env.REPORT_PATH || "/tmp/legacy-scoring-green-red-three-months.json";

if (!Number.isFinite(END)) throw new Error("END_DATE must be a valid ISO date");

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const quote = (row, side, field) => number(row?.[side]?.[field]) ?? number(row?.[field]);
const midpoint = (row, field) => number(row?.[field])
  ?? (() => {
    const bid = number(row?.bid?.[field]);
    const ask = number(row?.ask?.[field]);
    return bid != null && ask != null ? (bid + ask) / 2 : bid ?? ask;
  })();

async function loadM1(symbol) {
  const file = `${DATASET}/${symbol}_M1.jsonl`;
  if (!fs.existsSync(file)) throw new Error(`Missing historical file: ${file}`);
  const rows = [];
  const stream = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of stream) {
    if (!line) continue;
    try {
      const raw = JSON.parse(line);
      const t = Date.parse(raw.timestamp ?? raw.snapshotTimeUTC ?? raw.snapshotTime);
      if (!Number.isFinite(t) || t < WARMUP_START || t >= END) continue;
      const open = midpoint(raw, "open"), high = midpoint(raw, "high");
      const low = midpoint(raw, "low"), close = midpoint(raw, "close");
      const bidOpen = quote(raw, "bid", "open"), bidHigh = quote(raw, "bid", "high");
      const bidLow = quote(raw, "bid", "low"), bidClose = quote(raw, "bid", "close");
      const askOpen = quote(raw, "ask", "open"), askHigh = quote(raw, "ask", "high");
      const askLow = quote(raw, "ask", "low"), askClose = quote(raw, "ask", "close");
      if ([open, high, low, close, bidOpen, bidHigh, bidLow, bidClose, askOpen, askHigh, askLow, askClose].every(Number.isFinite)) {
        rows.push({ t, open, high, low, close, bidOpen, bidHigh, bidLow, bidClose, askOpen, askHigh, askLow, askClose });
      }
    } catch {
      // Keep a malformed archival line from invalidating the complete replay.
    }
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

function resample(rows, timeframe) {
  const byStart = new Map();
  for (const row of rows) {
    const t = Math.floor(row.t / timeframe) * timeframe;
    const previous = byStart.get(t);
    if (!previous) byStart.set(t, { t, open: row.open, high: row.high, low: row.low, close: row.close, count: 1 });
    else {
      previous.high = Math.max(previous.high, row.high);
      previous.low = Math.min(previous.low, row.low);
      previous.close = row.close;
      previous.count += 1;
    }
  }
  const requiredRows = timeframe / MINUTE;
  return [...byStart.values()].filter((row) => row.count >= requiredRows * 0.8).sort((a, b) => a.t - b.t);
}

function align(length, values) {
  const output = Array(length).fill(null);
  const offset = length - values.length;
  for (let index = 0; index < values.length; index += 1) output[offset + index] = values[index];
  return output;
}

function enrich(rows) {
  const close = rows.map((row) => row.close);
  const high = rows.map((row) => row.high);
  const low = rows.map((row) => row.low);
  const length = rows.length;
  const ema9 = align(length, EMA.calculate({ period: 9, values: close }));
  const ema50 = align(length, EMA.calculate({ period: 50, values: close }));
  const ema200 = align(length, EMA.calculate({ period: 200, values: close }));
  const macd = align(length, MACD.calculate({
    fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: close,
    SimpleMAOscillator: false, SimpleMASignal: false,
  }));
  const adx = align(length, ADX.calculate({ period: 14, close, high, low }));
  return rows.map((row, index) => ({ ...row, ema9: ema9[index], ema50: ema50[index], ema200: ema200[index], macd: macd[index], adx: adx[index]?.adx ?? null }));
}

function atOrBefore(rows, timestamp) {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (rows[middle].t <= timestamp) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

function legacySignal({ m15, h1, previousH1 }) {
  if (!m15 || !h1 || !previousH1 || ![h1.ema9, h1.ema50, h1.ema200, h1.adx, m15.macd?.histogram, m15.adx].every(Number.isFinite)) return { signal: null, reason: "missing_indicators" };
  const buyScore = [h1.ema50 > h1.ema200, m15.close > h1.ema9, m15.macd.histogram > 0].filter(Boolean).length;
  const sellScore = [h1.ema50 < h1.ema200, m15.close < h1.ema9, m15.macd.histogram < 0].filter(Boolean).length;
  const longOK = buyScore >= 3 && h1.adx > 10;
  const shortOK = sellScore >= 3 && m15.adx > 10;
  const scoreSignal = longOK && !shortOK ? "BUY" : shortOK && !longOK ? "SELL" : null;
  if (!scoreSignal) return { signal: null, reason: "score_or_adx" };

  const trend = h1.ema50 > h1.ema200 ? "bullish" : "bearish";
  const greenRed = trend === "bullish" && previousH1.close < previousH1.open && h1.close > h1.open
    ? "BUY"
    : trend === "bearish" && previousH1.close > previousH1.open && h1.close < h1.open
      ? "SELL"
      : null;
  if (!greenRed) return { signal: null, reason: "no_green_red_pattern", buyScore, sellScore };
  return scoreSignal === greenRed
    ? { signal: scoreSignal, reason: "scoring_and_pattern_agree", buyScore, sellScore }
    : { signal: null, reason: "scoring_pattern_conflict", buyScore, sellScore };
}

function pip(symbol) {
  return symbol.includes("JPY") ? 0.01 : 0.0001;
}

function month(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function day(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function makePosition(symbol, signal, rows, entryIndex, balance) {
  const entryBar = rows[entryIndex];
  const previous = rows[entryIndex - 1];
  if (!entryBar || !previous) return null;
  const isBuy = signal === "BUY";
  const entry = isBuy ? entryBar.askOpen : entryBar.bidOpen;
  const buffer = symbol.includes("JPY") ? 0.08 : 0.0008;
  let stop = isBuy ? previous.bidLow - buffer : previous.askHigh + buffer;
  let distance = Math.abs(entry - stop);
  const minDistance = (symbol.includes("JPY") ? 12 : 10) * pip(symbol);
  if (distance < minDistance) {
    stop = isBuy ? entry - minDistance : entry + minDistance;
    distance = minDistance;
  }
  const target = isBuy ? entry + distance * 1.8 : entry - distance * 1.8;
  // This is the position-size formula from the archived TradingService.
  const riskAmount = (balance * 0.02) / 5;
  const pipValue = pip(symbol) / entry;
  const size = Math.max(100, Math.floor(riskAmount / ((distance / pip(symbol)) * pipValue) / 100) * 100);
  return { symbol, signal, entry, stop, target, distance, size, opened: entryBar.t, next: entryIndex };
}

function run(symbolData, events) {
  let balance = START_CAPITAL;
  let peak = balance;
  let maxDrawdown = 0;
  const positions = [];
  const trades = [];
  const close = (position, price, timestamp, reason) => {
    const gross = position.signal === "BUY" ? (price - position.entry) * position.size : (position.entry - price) * position.size;
    balance += gross;
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, peak - balance);
    trades.push({ symbol: position.symbol, signal: position.signal, opened: position.opened, closed: timestamp, entry: position.entry, stop: position.stop, target: position.target, size: position.size, pnl: gross, r: gross / (position.distance * position.size), reason, balanceAfter: balance });
    positions.splice(positions.indexOf(position), 1);
  };
  const advance = (to) => {
    for (const position of [...positions]) {
      const rows = symbolData.get(position.symbol).m1;
      while (position.next < rows.length && rows[position.next].t < to) {
        const bar = rows[position.next];
        const isBuy = position.signal === "BUY";
        const hitStop = isBuy ? bar.bidLow <= position.stop : bar.askHigh >= position.stop;
        const hitTarget = isBuy ? bar.bidHigh >= position.target : bar.askLow <= position.target;
        // A one-minute OHLC bar cannot establish touch order; resolve an
        // ambiguous SL/TP candle conservatively as a stop-loss.
        if (hitStop) { close(position, position.stop, bar.t, "SL"); break; }
        if (hitTarget) { close(position, position.target, bar.t, "TP"); break; }
        position.next += 1;
      }
    }
  };

  let cursor = 0;
  while (cursor < events.length) {
    const time = events[cursor].t;
    advance(time);
    const group = [];
    while (cursor < events.length && events[cursor].t === time) group.push(events[cursor++]);
    for (const event of group) {
      if (positions.length >= 5 || positions.some((position) => position.symbol === event.symbol)) continue;
      const position = makePosition(event.symbol, event.signal, symbolData.get(event.symbol).m1, event.entryIndex, balance);
      if (position) positions.push(position);
    }
  }
  advance(END);
  for (const position of [...positions]) {
    const rows = symbolData.get(position.symbol).m1;
    const last = rows.at(-1);
    if (last) close(position, position.signal === "BUY" ? last.bidClose : last.askClose, last.t, "END_OF_SAMPLE");
  }
  return { balance, maxDrawdown, trades };
}

const symbolData = new Map();
const events = [];
const diagnostics = { scoringPassed: 0, greenRedPassed: 0, byReason: {} };
for (const symbol of SYMBOLS) {
  const m1 = await loadM1(symbol);
  const m15 = enrich(resample(m1, M15));
  const h1 = enrich(resample(m1, H1));
  symbolData.set(symbol, { m1, m15, h1 });
  for (let index = 200; index < m15.length; index += 1) {
    const current = m15[index];
    const decisionTime = current.t + M15;
    if (decisionTime < START || decisionTime >= END) continue;
    const h1Index = atOrBefore(h1, decisionTime - H1);
    const result = legacySignal({ m15: current, h1: h1[h1Index], previousH1: h1[h1Index - 1] });
    diagnostics.byReason[result.reason] = (diagnostics.byReason[result.reason] ?? 0) + 1;
    if (result.reason !== "score_or_adx" && result.reason !== "missing_indicators") diagnostics.scoringPassed += 1;
    if (!result.signal) continue;
    diagnostics.greenRedPassed += 1;
    const entryIndex = atOrBefore(m1, decisionTime);
    if (entryIndex >= 1 && m1[entryIndex]?.t === decisionTime) events.push({ t: decisionTime, symbol, signal: result.signal, entryIndex, buyScore: result.buyScore, sellScore: result.sellScore });
  }
}
events.sort((a, b) => a.t - b.t || a.symbol.localeCompare(b.symbol));
const simulation = run(symbolData, events);
const wins = simulation.trades.filter((trade) => trade.pnl > 0);
const losses = simulation.trades.filter((trade) => trade.pnl < 0);
const grossWin = wins.reduce((sum, trade) => sum + trade.pnl, 0);
const grossLoss = losses.reduce((sum, trade) => sum + trade.pnl, 0);
const aggregate = (key) => Object.fromEntries([...new Set(simulation.trades.map((trade) => trade[key]))].sort().map((value) => {
  const rows = simulation.trades.filter((trade) => trade[key] === value);
  return [value, { trades: rows.length, wins: rows.filter((trade) => trade.pnl > 0).length, pnl: +rows.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2), r: +rows.reduce((sum, trade) => sum + trade.r, 0).toFixed(3) }];
}));
const activeDays = new Set(events.map((event) => day(event.t))).size;
const report = {
  generatedAt: new Date().toISOString(),
  method: "Archived strategy: 3/3 M15 scoring + H1 green/red price action agreement",
  sourceCommit: "dca8b124ccb94527a7984bf96a70942b8e716175",
  data: { dataset: DATASET, symbols: SYMBOLS, start: new Date(START).toISOString(), endExclusive: new Date(END).toISOString() },
  executionAssumptions: { nextM1Open: true, stop: "previous M1 extreme +/- 0.0008 (0.08 JPY), min 10/12 pips", takeProfitR: 1.8, maxPositions: 5, simultaneousSlTp: "SL first", trailing: "not simulated; entry comparison uses static bracket exits" },
  summary: {
    startCapital: START_CAPITAL,
    finalBalance: +simulation.balance.toFixed(2),
    pnl: +(simulation.balance - START_CAPITAL).toFixed(2),
    returnPct: +(100 * (simulation.balance - START_CAPITAL) / START_CAPITAL).toFixed(2),
    entries: events.length,
    activeDays,
    trades: simulation.trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: simulation.trades.length ? +(100 * wins.length / simulation.trades.length).toFixed(1) : 0,
    profitFactor: grossLoss ? +(grossWin / Math.abs(grossLoss)).toFixed(3) : 0,
    totalR: +simulation.trades.reduce((sum, trade) => sum + trade.r, 0).toFixed(3),
    maxDrawdown: +simulation.maxDrawdown.toFixed(2),
    maxDrawdownPct: +(100 * simulation.maxDrawdown / START_CAPITAL).toFixed(2),
    exits: Object.fromEntries(["TP", "SL", "END_OF_SAMPLE"].map((reason) => [reason, simulation.trades.filter((trade) => trade.reason === reason).length])),
  },
  diagnostics,
  byExit: aggregate("reason"),
  bySymbol: aggregate("symbol"),
  monthly: Object.fromEntries([...new Set(simulation.trades.map((trade) => month(trade.closed)))].sort().map((value) => {
    const rows = simulation.trades.filter((trade) => month(trade.closed) === value);
    return [value, { trades: rows.length, wins: rows.filter((trade) => trade.pnl > 0).length, pnl: +rows.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2), r: +rows.reduce((sum, trade) => sum + trade.r, 0).toFixed(3) }];
  })),
  firstTenTrades: simulation.trades.slice(0, 10),
};
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: REPORT_PATH, ...report.summary, period: report.data }, null, 2));
