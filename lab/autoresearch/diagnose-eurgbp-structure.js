import fs from "node:fs";
import path from "node:path";

const MINUTE = 60_000;
const PIP = 0.0001;
const CHART_TIME_ZONE = "Pacific/Auckland";
const DATASET = process.argv[2] ?? "/private/tmp/capital-dataset-snapshot-2026-08-11";
const REPORT = process.argv[3] ?? "lab/autoresearch/reports/eurgbp-structure-day-diagnostic-2026-08-10.json";

function read(timeframe) {
  return fs.readFileSync(path.join(DATASET, `EURGBP_${timeframe}.jsonl`), "utf8")
    .trim().split("\n").map(JSON.parse).map((row) => ({
      ...row,
      t: Date.parse(row.timestamp),
      askOpen: row.ask?.open ?? row.open + row.spread,
      askHigh: row.ask?.high ?? row.high + row.spread,
      askLow: row.ask?.low ?? row.low + row.spread,
      askClose: row.ask?.close ?? row.close + row.spread,
    }));
}

function ema(values, period) {
  const alpha = 2 / (period + 1), output = [];
  let value = values[0];
  for (const next of values) { value = alpha * next + (1 - alpha) * value; output.push(value); }
  return output;
}

function enrich(rows) {
  const closes = rows.map((row) => row.close);
  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const fast = ema(closes, 12), slow = ema(closes, 26);
  const macd = fast.map((value, index) => value - slow[index]), signal = ema(macd, 9);
  let previousClose = rows[0].close, atr = rows[0].high - rows[0].low;
  return rows.map((row, index) => {
    const tr = Math.max(row.high - row.low, Math.abs(row.high - previousClose), Math.abs(row.low - previousClose));
    atr = index ? (13 * atr + tr) / 14 : tr;
    previousClose = row.close;
    return { ...row, atr, e9: e9[index], e21: e21[index], e50: e50[index], e200: e200[index], macdHist: macd[index] - signal[index] };
  });
}

const m1 = read("M1"), m15 = enrich(read("M15")), h1 = enrich(read("H1"));

function atOrBefore(rows, timestamp) {
  let low = 0, high = rows.length - 1, result = -1;
  while (low <= high) { const middle = (low + high) >> 1; if (rows[middle].t <= timestamp) { result = middle; low = middle + 1; } else high = middle - 1; }
  return result;
}

function local(timestamp, timeZone = CHART_TIME_ZONE) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(timestamp));
}

function h1State(decision) {
  const index = atOrBefore(h1, decision - 60 * MINUTE), row = h1[index], prior3 = h1[Math.max(0, index - 3)];
  const emaVotes = [row.e9 < row.e21, row.e50 < row.e200, row.close < row.e50, row.e50 < prior3.e50].filter(Boolean).length;
  const previousEightHigh = Math.max(...h1.slice(Math.max(0, index - 8), index).map((item) => item.high));
  return {
    candle: local(row.t), candleBerlin: local(row.t, "Europe/Berlin"), open: row.open, high: row.high, low: row.low, close: row.close,
    bearishCandle: row.close < row.open,
    emaVotes, macdBearish: row.macdHist < 0,
    emaMacdSell: emaVotes >= 3 && row.macdHist < 0,
    lowerThanPreviousEightHourHigh: row.high < previousEightHigh,
    previousEightHigh,
  };
}

function greenRunBefore(index, maximum = 6) {
  let count = 0;
  for (let i = index - 1; i >= 0 && count < maximum && m15[i].close > m15[i].open; i -= 1) count += 1;
  return count;
}

function strictGreenRed(index) {
  if (!(m15[index].close < m15[index].open)) return false;
  for (const pullbackBars of [1, 2]) {
    if (index < pullbackBars + 1) continue;
    const pullbackGreen = m15.slice(index - pullbackBars, index).every((row) => row.close > row.open);
    if (pullbackGreen && m15[index - pullbackBars - 1].close < m15[index - pullbackBars - 1].open) return true;
  }
  return false;
}

function describedSignal(index) {
  const row = m15[index], correctionBars = greenRunBefore(index);
  if (!(row.close < row.open) || correctionBars < 1) return null;
  const trend = h1State(row.t + 15 * MINUTE);
  if (!trend.emaMacdSell || !trend.lowerThanPreviousEightHourHigh) return null;
  return { correctionBars, trend };
}

function simulate(index, options) {
  const signal = m15[index], decision = signal.t + 15 * MINUTE;
  const entryLevel = options.entry === "close" ? signal.close : signal.low - options.entryOffsetPips * PIP;
  const stop = (options.stopBasis === "bid-high" ? signal.high : signal.askHigh) + options.stopBufferPips * PIP;
  const risk = stop - entryLevel;
  const expiry = decision + 60 * MINUTE;
  let entryIndex = atOrBefore(m1, decision);
  while (entryIndex < m1.length && m1[entryIndex].t < decision) entryIndex += 1;
  if (options.entry !== "close") {
    while (entryIndex < m1.length && m1[entryIndex].t <= expiry && m1[entryIndex].low > entryLevel) entryIndex += 1;
    if (entryIndex >= m1.length || m1[entryIndex].t > expiry) return { filled: false, entryLevel, stop, riskPips: risk / PIP };
  }
  const opened = m1[entryIndex].t, dayEnd = Math.min(decision + 24 * 60 * MINUTE, m1.at(-1).t);
  let activeStop = stop, target = entryLevel - 2 * risk, runner = false, minAsk = Number.POSITIVE_INFINITY;
  let exit = null;
  for (let i = entryIndex; i < m1.length && m1[i].t <= dayEnd; i += 1) {
    const bar = m1[i]; minAsk = Math.min(minAsk, bar.askLow);
    if (bar.askHigh >= activeStop) { exit = { t: bar.t, price: activeStop, reason: runner ? "trail" : "sl" }; break; }
    // The original 2R limit remains live until a runner has actually been
    // activated on a completed M1 bar. A body-gated trade that is not strong
    // enough therefore remains an ordinary fixed-2R trade.
    if (!runner && bar.askLow <= target) { exit = { t: bar.t, price: target, reason: "tp" }; break; }
    const reached1R = bar.askLow <= entryLevel - risk;
    const bodyRatio = Math.abs(signal.close - signal.open) / signal.atr;
    const runnerAllowed = options.exit !== "fixed-2r" && (options.exit !== "body-trail" || bodyRatio >= 0.5);
    if (!runner && reached1R && runnerAllowed) { runner = true; activeStop = Math.min(activeStop, entryLevel); }
    if (runner) {
      const distance = options.trailUnit === "atr" ? options.trailDistance * signal.atr : options.trailDistance * risk;
      activeStop = Math.min(activeStop, bar.askLow + distance);
    }
  }
  if (!exit) {
    const closeIndex = Math.max(entryIndex, atOrBefore(m1, dayEnd));
    exit = { t: m1[closeIndex].t, price: m1[closeIndex].askClose, reason: "day" };
  }
  return {
    filled: true, opened: new Date(opened).toISOString(), openedChartTime: local(opened), openedBerlin: local(opened, "Europe/Berlin"),
    entryLevel, stop, riskPips: risk / PIP, target2R: target,
    bodyAtr: Math.abs(signal.close - signal.open) / signal.atr,
    mfeR: (entryLevel - minAsk) / risk,
    exit: { ...exit, iso: new Date(exit.t).toISOString(), chartTime: local(exit.t), berlin: local(exit.t, "Europe/Berlin"), r: (entryLevel - exit.price) / risk },
  };
}

const exitVariants = [
  { key: "fixed2R", exit: "fixed-2r", trailUnit: "r", trailDistance: 0 },
  { key: "trail050R", exit: "always-trail", trailUnit: "r", trailDistance: 0.5 },
  { key: "trail100ATR", exit: "always-trail", trailUnit: "atr", trailDistance: 1 },
  { key: "trail150ATR", exit: "always-trail", trailUnit: "atr", trailDistance: 1.5 },
  { key: "trail200ATR", exit: "always-trail", trailUnit: "atr", trailDistance: 2 },
  { key: "trail300ATR", exit: "always-trail", trailUnit: "atr", trailDistance: 3 },
  { key: "body050Trail050R", exit: "body-trail", trailUnit: "r", trailDistance: 0.5 },
];

function candleAtBerlin(localDateTime) {
  return m15.findIndex((row) => local(row.t, "Europe/Berlin") === localDateTime);
}

function candleAtChartTime(localDateTime) {
  return m15.findIndex((row) => local(row.t) === localDateTime);
}

const manualTimes = ["2026-08-10 09:45", "2026-08-10 11:45", "2026-08-10 14:30"];
function manualReplay(clock, findCandle) {
  return manualTimes.map((displayTime) => {
  const index = findCandle(displayTime); if (index < 0) throw new Error(`Missing M15 candle ${displayTime}`);
  const signal = m15[index], trend = h1State(signal.t + 15 * MINUTE), correctionBars = greenRunBefore(index);
  const common = { entry: "pending", entryOffsetPips: 0, stopBufferPips: 0, stopBasis: "ask-high" };
  return {
    clock, displayTime, chartTime: local(signal.t), berlinTime: local(signal.t, "Europe/Berlin"), utc: signal.timestamp,
    candle: { open: signal.open, high: signal.high, low: signal.low, close: signal.close, askHigh: signal.askHigh, spreadPips: signal.spread / PIP, atr: signal.atr },
    correctionBars, strictGreenRed: strictGreenRed(index), describedFlexibleSignal: Boolean(describedSignal(index)), h1: trend,
    pendingAtLow: Object.fromEntries(exitVariants.map((variant) => [variant.key, simulate(index, { ...common, ...variant })])),
    pendingAtLowStopAtBidHigh: Object.fromEntries(exitVariants.map((variant) => [variant.key, simulate(index, { ...common, stopBasis: "bid-high", ...variant })])),
    marketAtClose: Object.fromEntries(exitVariants.map((variant) => [variant.key, simulate(index, { ...common, entry: "close", ...variant })])),
    pendingOnePipBeyondWithOnePipStopBuffer: Object.fromEntries(exitVariants.map((variant) => [variant.key, simulate(index, { ...common, entryOffsetPips: 1, stopBufferPips: 1, ...variant })])),
  };
  });
}
const manualChartClock = manualReplay("Pacific/Auckland", candleAtChartTime);
const manualBerlinClock = manualReplay("Europe/Berlin", candleAtBerlin);

function signals(from, to) {
  const values = [];
  for (let index = 1; index < m15.length; index += 1) {
    if (m15[index].t < from || m15[index].t >= to) continue;
    const signal = describedSignal(index); if (signal) values.push({ index, ...signal });
  }
  return values;
}

function sequentialReplay(from, to, variant, includeDetails = true) {
  const candidates = signals(from, to); const trades = [];
  let availableAt = from;
  for (const candidate of candidates) {
    const row = m15[candidate.index];
    if (row.t < availableAt) continue;
    const trade = simulate(candidate.index, { entry: "pending", entryOffsetPips: 0, stopBufferPips: 0, stopBasis: "ask-high", ...variant });
    if (!trade.filled) continue;
    trades.push({ signalChartTime: local(row.t), signalBerlin: local(row.t, "Europe/Berlin"), correctionBars: candidate.correctionBars, ...trade });
    availableAt = trade.exit.t + MINUTE;
  }
  const totalR = trades.reduce((sum, trade) => sum + trade.exit.r, 0), wins = trades.filter((trade) => trade.exit.r > 0).length;
  const grossWin = trades.filter((trade) => trade.exit.r > 0).reduce((sum, trade) => sum + trade.exit.r, 0);
  const grossLoss = -trades.filter((trade) => trade.exit.r < 0).reduce((sum, trade) => sum + trade.exit.r, 0);
  return {
    trades: trades.length, wins, winRate: trades.length ? 100 * wins / trades.length : 0,
    totalR, profitFactor: grossLoss ? grossWin / grossLoss : null,
    ...(includeDetails ? { details: trades } : {}),
  };
}

function candidateReplay(from, to) {
  return signals(from, to).map((candidate) => {
    const row = m15[candidate.index];
    return {
      signalChartTime: local(row.t), signalBerlin: local(row.t, "Europe/Berlin"),
      correctionBars: candidate.correctionBars,
      strictGreenRed: strictGreenRed(candidate.index),
      candle: { open: row.open, high: row.high, low: row.low, close: row.close, askHigh: row.askHigh, atr: row.atr },
      h1: candidate.trend,
      fixed2R: simulate(candidate.index, {
        entry: "pending", entryOffsetPips: 0, stopBufferPips: 0, stopBasis: "ask-high", ...exitVariants[0],
      }),
    };
  });
}

const periods = {
  chartDay: [Date.parse("2026-08-09T12:00:00Z"), Date.parse("2026-08-10T12:00:00Z")],
  previousEvaluationLastTwoWeeks: [Date.parse("2026-07-27T00:00:00Z"), Date.parse("2026-08-10T00:00:00Z")],
  sixMonthsThroughChartDay: [Date.parse("2026-02-09T12:00:00Z"), Date.parse("2026-08-10T12:00:00Z")],
};
const replay = Object.fromEntries(Object.entries(periods).map(([period, [from, to]]) => [period,
  Object.fromEntries(exitVariants.map((variant) => [variant.key, sequentialReplay(from, to, variant, period !== "sixMonthsThroughChartDay")])),
]));
const candidates = { chartDay: candidateReplay(...periods.chartDay) };

const output = {
  generatedAt: new Date().toISOString(), dataset: DATASET, symbol: "EURGBP",
  assumptions: {
    chartTimezone: CHART_TIME_ZONE, pendingExpiryMinutes: 60, fixedTargetR: 2,
    replaySession: "all hours",
    entry: "sell stop at signal bid low", stop: "signal ask high", positionLimit: "one EURGBP position at a time",
    flexiblePattern: "1-6 consecutive bullish M15 correction candles followed by a bearish M15 candle",
    trend: "last closed H1 has >=3/4 bearish EMA votes, bearish MACD histogram, and its high is below the prior eight closed H1 highs",
    note: "The structural rule is a first causal formalization of the user's description, not a claim that it is the only valid lower-high definition.",
  },
  manualChartClock, manualBerlinClock, candidates, replay,
};
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ report: REPORT, manualChartClock, manualBerlinClock, replay: Object.fromEntries(Object.entries(replay).map(([period, variants]) => [period, Object.fromEntries(Object.entries(variants).map(([key, value]) => [key, { trades: value.trades, winRate: value.winRate, totalR: value.totalR, profitFactor: value.profitFactor }]))])) }, null, 2));
