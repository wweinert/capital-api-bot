import fs from "node:fs";
import { EMA, RSI, BollingerBands, MACD, ATR } from "technicalindicators";

const DAY = 86_400_000;
const MINUTE = 60_000;
const TF = { M1: MINUTE, M5: 5 * MINUTE, M15: 15 * MINUTE, H1: 60 * MINUTE, H4: 240 * MINUTE };
const SYMBOLS = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
const SPREAD = {
  EURUSD: 0.00007, GBPUSD: 0.00013, EURGBP: 0.00020, AUDUSD: 0.00006, USDCAD: 0.00020,
  EURJPY: 0.015, USDJPY: 0.010, AUDJPY: 0.018, NZDUSD: 0.00015, NZDJPY: 0.020,
};

const n = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const px = (row, key) => n(row[key]) ?? n(row[key]?.bid) ?? n(row[`${key}Bid`]);

function load(file) {
  const dedup = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const raw = JSON.parse(line);
      const t = Date.parse(raw.timestamp ?? raw.snapshotTimeUTC ?? raw.snapshotTime);
      const open = px(raw, "open"), high = px(raw, "high"), low = px(raw, "low"), close = px(raw, "close");
      if ([t, open, high, low, close].every(Number.isFinite)) dedup.set(t, { t, open, high, low, close });
    } catch {}
  }
  return [...dedup.values()].sort((a, b) => a.t - b.t);
}

function align(length, values) {
  const out = Array(length).fill(null);
  const offset = length - values.length;
  for (let i = 0; i < values.length; i += 1) out[offset + i] = values[i];
  return out;
}

function enrich(rows) {
  const close = rows.map((r) => r.close), high = rows.map((r) => r.high), low = rows.map((r) => r.low), length = rows.length;
  const e9 = align(length, EMA.calculate({ period: 9, values: close }));
  const e21 = align(length, EMA.calculate({ period: 21, values: close }));
  const e50 = align(length, EMA.calculate({ period: 50, values: close }));
  const e200 = align(length, EMA.calculate({ period: 200, values: close }));
  const rsi = align(length, RSI.calculate({ period: 14, values: close }));
  const bb = align(length, BollingerBands.calculate({ period: 20, stdDev: 2, values: close }));
  const macd = align(length, MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: close, SimpleMAOscillator: false, SimpleMASignal: false }));
  const atr = align(length, ATR.calculate({ period: 21, high, low, close }));
  return rows.map((row, i) => {
    let hi20 = -Infinity, lo20 = Infinity;
    for (let j = Math.max(0, i - 20); j < i; j += 1) { hi20 = Math.max(hi20, high[j]); lo20 = Math.min(lo20, low[j]); }
    return { ...row, e9: e9[i], e21: e21[i], e50: e50[i], e200: e200[i], rsi: rsi[i], bb: bb[i], macd: macd[i], atr: atr[i],
      bullCross: i > 0 && e9[i] > e21[i] && e9[i - 1] <= e21[i - 1],
      bearCross: i > 0 && e9[i] < e21[i] && e9[i - 1] >= e21[i - 1],
      bullReclaim: i > 0 && close[i - 1] <= e9[i - 1] && close[i] > e9[i],
      bearReclaim: i > 0 && close[i - 1] >= e9[i - 1] && close[i] < e9[i],
      bullBB: i > 0 && bb[i - 1] && bb[i] && close[i - 1] <= bb[i - 1].lower && close[i] > bb[i].lower,
      bearBB: i > 0 && bb[i - 1] && bb[i] && close[i - 1] >= bb[i - 1].upper && close[i] < bb[i].upper,
      bullRSI: i > 0 && rsi[i - 1] < 30 && rsi[i] >= 30,
      bearRSI: i > 0 && rsi[i - 1] > 70 && rsi[i] <= 70,
      bullBreakout: i >= 20 && close[i] > hi20,
      bearBreakout: i >= 20 && close[i] < lo20,
    };
  });
}

function atOrBefore(rows, timestamp) {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid].t <= timestamp) lo = mid + 1; else hi = mid; }
  return lo - 1;
}

function isoWeek(timestamp) {
  const date = new Date(timestamp); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() + 6) % 7);
  const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - week1) / DAY - 3 + (week1.getUTCDay() + 6) % 7) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function triggerPass(event, side, trigger) {
  if (trigger === "any") return event[`${side}Trigger`] > 0;
  return event[`${side}${trigger}`];
}

function inSessionWindows(timestamp, windows) {
  if (!windows?.length) return true;
  const date = new Date(timestamp);
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  return windows.some(([start, end]) => (
    start === end ? true : start < end ? minute >= start && minute < end : minute >= start || minute < end
  ));
}

function passesResearchFilters(event, config) {
  if (config.minAtrPct != null && event.atrPct < config.minAtrPct) return false;
  if (config.maxAtrPct != null && event.atrPct > config.maxAtrPct) return false;
  if (config.minBbWidthPct != null && event.bbWidthPct < config.minBbWidthPct) return false;
  if (config.minEmaDistPct != null && event.emaDistPct < config.minEmaDistPct) return false;
  return true;
}

function marketSession(timestamp) {
  const date = new Date(timestamp);
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  if (minute >= 780 && minute < 1020) return "overlap";
  if (minute >= 480 && minute < 780) return "london";
  if (minute >= 1020 && minute < 1260) return "newYork";
  if (minute < 480) return "asia";
  return "offHours";
}

function currencyGroup(symbol) {
  if (["EURUSD", "GBPUSD", "EURGBP"].includes(symbol)) return "europe";
  if (["USDJPY", "EURJPY", "AUDJPY", "NZDJPY"].includes(symbol)) return "jpy";
  if (["AUDUSD", "NZDUSD"].includes(symbol)) return "commodity";
  return "cad";
}

function entryConfigFor(event, config) {
  const session = marketSession(event.t);
  let resolved = config;
  const sessionProfile = config.sessionProfiles?.[session];
  if (sessionProfile) resolved = { ...resolved, ...sessionProfile };

  let regime = "base";
  const thresholds = config.regimeThresholds;
  if (thresholds) {
    if (event.atrPct >= thresholds.highAtrPct && event.bbWidthPct >= thresholds.wideBbWidthPct && event.emaDistPct >= thresholds.trendEmaDistPct) regime = "trendExpansion";
    else if (event.emaDistPct >= thresholds.trendEmaDistPct) regime = "trend";
    else if (event.atrPct >= thresholds.highAtrPct) regime = "volatileRange";
    else regime = "quietRange";
    const regimeProfile = config.regimeProfiles?.[regime];
    if (regimeProfile) {
      const sessionEnabled = resolved.enabled !== false;
      resolved = { ...resolved, ...regimeProfile, enabled: sessionEnabled && regimeProfile.enabled !== false };
    }
  }
  const pairProfile = config.pairProfiles?.[event.symbol];
  if (pairProfile) {
    const enabled = resolved.enabled !== false && pairProfile.enabled !== false;
    const weightMultipliers = pairProfile.componentWeightMultipliers;
    const componentWeights = weightMultipliers ? resolved.componentWeights.map((weight, index) => weight * weightMultipliers[index]) : resolved.componentWeights;
    const originalWeightTotal = resolved.componentWeights.reduce((sum, weight) => sum + weight, 0);
    const adjustedWeightTotal = componentWeights.reduce((sum, weight) => sum + weight, 0);
    resolved = {
      ...resolved,
      enabled,
      tfMin: Math.max(0, resolved.tfMin * (originalWeightTotal ? adjustedWeightTotal / originalWeightTotal : 1) + (pairProfile.tfMinDelta ?? 0)),
      rewardRisk: Math.max(2, resolved.rewardRisk + (pairProfile.rewardRiskDelta ?? 0)),
      highRewardRisk: Math.max(2, resolved.highRewardRisk + (pairProfile.highRewardRiskDelta ?? 0)),
      stopATR: resolved.stopATR * (pairProfile.stopAtrMultiplier ?? 1),
      breakEvenR: pairProfile.breakEvenR ?? resolved.breakEvenR,
      minAtrPct: resolved.minAtrPct == null ? resolved.minAtrPct : resolved.minAtrPct * (pairProfile.atrMultiplier ?? 1),
      minBbWidthPct: resolved.minBbWidthPct == null ? resolved.minBbWidthPct : resolved.minBbWidthPct * (pairProfile.bbWidthMultiplier ?? 1),
      componentWeights,
    };
  }
  const groupProfile = config.currencyProfiles?.[currencyGroup(event.symbol)];
  if (groupProfile) {
    const enabled = resolved.enabled !== false && groupProfile.enabled !== false;
    const weightMultipliers = groupProfile.componentWeightMultipliers;
    const componentWeights = weightMultipliers ? resolved.componentWeights.map((weight, index) => weight * weightMultipliers[index]) : resolved.componentWeights;
    const originalWeightTotal = resolved.componentWeights.reduce((sum, weight) => sum + weight, 0);
    const adjustedWeightTotal = componentWeights.reduce((sum, weight) => sum + weight, 0);
    resolved = {
      ...resolved,
      enabled,
      tfMin: Math.max(0, resolved.tfMin * (originalWeightTotal ? adjustedWeightTotal / originalWeightTotal : 1) + (groupProfile.tfMinDelta ?? 0)),
      rewardRisk: Math.max(2, resolved.rewardRisk + (groupProfile.rewardRiskDelta ?? 0)),
      highRewardRisk: Math.max(2, resolved.highRewardRisk + (groupProfile.highRewardRiskDelta ?? 0)),
      stopATR: resolved.stopATR * (groupProfile.stopAtrMultiplier ?? 1),
      breakEvenR: groupProfile.breakEvenR ?? resolved.breakEvenR,
      minAtrPct: resolved.minAtrPct == null ? resolved.minAtrPct : resolved.minAtrPct * (groupProfile.atrMultiplier ?? 1),
      minBbWidthPct: resolved.minBbWidthPct == null ? resolved.minBbWidthPct : resolved.minBbWidthPct * (groupProfile.bbWidthMultiplier ?? 1),
      componentWeights,
    };
  }
  return { config: resolved, session, regime };
}

function frameScore(rows, i, side) {
  const row = rows[i], previous = rows[Math.max(0, i - 3)];
  const buy = side === "buy";
  return [
    buy ? row.e9 > row.e21 : row.e9 < row.e21,
    buy ? row.e50 > row.e200 : row.e50 < row.e200,
    buy ? row.close > row.e50 : row.close < row.e50,
    buy ? row.macd?.histogram > 0 : row.macd?.histogram < 0,
    buy ? row.e50 > previous.e50 : row.e50 < previous.e50,
    buy ? row.rsi >= 45 && row.rsi <= 70 : row.rsi >= 30 && row.rsi <= 55,
  ].filter(Boolean).length;
}

function frameMask(rows, i, side) {
  const row = rows[i], previous = rows[Math.max(0, i - 3)];
  const buy = side === "buy";
  const signals = [
    buy ? row.e9 > row.e21 : row.e9 < row.e21,
    buy ? row.e50 > row.e200 : row.e50 < row.e200,
    buy ? row.close > row.e50 : row.close < row.e50,
    buy ? row.macd?.histogram > 0 : row.macd?.histogram < 0,
    buy ? row.e50 > previous.e50 : row.e50 < previous.e50,
    buy ? row.rsi >= 45 && row.rsi <= 70 : row.rsi >= 30 && row.rsi <= 55,
  ];
  return signals.reduce((mask, enabled, bit) => enabled ? mask | (1 << bit) : mask, 0);
}

function weightedMask(mask, weights) {
  return weights.reduce((score, weight, bit) => score + ((mask & (1 << bit)) ? weight : 0), 0);
}

export function prepare(datasetDir, requestedSymbols = SYMBOLS) {
  const data = new Map();
  for (const symbol of requestedSymbols) {
    const frames = {};
    for (const tf of Object.keys(TF)) frames[tf] = enrich(load(`${datasetDir}/${symbol}_${tf}.jsonl`));
    data.set(symbol, frames);
  }
  const start = Math.max(...[...data.values()].map((f) => f.M1[0].t));
  const end = Math.min(...[...data.values()].map((f) => f.M1.at(-1).t));
  const events = [];
  for (const [symbol, f] of data) {
    for (let i = 200; i < f.M1.length - 1; i += 1) {
      const m1 = f.M1[i], decision = m1.t + MINUTE;
      if (decision < start || decision > end) continue;
      const i5 = atOrBefore(f.M5, decision - TF.M5), i15 = atOrBefore(f.M15, decision - TF.M15), i60 = atOrBefore(f.H1, decision - TF.H1), i240 = atOrBefore(f.H4, decision - TF.H4);
      if (i5 < 200 || i15 < 200 || i60 < 200 || i240 < 200) continue;
      const m5 = f.M5[i5], m15 = f.M15[i15], h1 = f.H1[i60];
      if (![m1.bb, m1.rsi, m15.e200, h1.e200, m15.atr].every((x) => x != null)) continue;
      const m15Bull = m15.e50 > m15.e200 && m15.close > m15.e50;
      const h1Bull = h1.e50 > h1.e200 && h1.close > h1.e50;
      const buyCurrent = [m15.e50 > m15.e200, m15.macd?.histogram > 0, m5.e9 > m5.e21, m5.rsi < 35, m1.bullCross, m1.rsi < 30, m1.close <= m1.bb.lower].filter(Boolean).length;
      const sellCurrent = [!m15Bull, m15.macd?.histogram < 0, m5.e9 < m5.e21, m5.rsi > 65, m1.bearCross, m1.rsi > 70, m1.close >= m1.bb.upper].filter(Boolean).length;
      const buyTrigger = [m1.bullCross, m1.bullReclaim, m1.bullBB, m1.bullRSI, m1.bullBreakout].filter(Boolean).length;
      const sellTrigger = [m1.bearCross, m1.bearReclaim, m1.bearBB, m1.bearRSI, m1.bearBreakout].filter(Boolean).length;
      if (Math.max(buyCurrent, sellCurrent) < 3 && buyTrigger === 0 && sellTrigger === 0) continue;
      events.push({ t: decision, symbol, next: i + 1, atr: m15.atr, m1Atr: m1.atr, signalClose: m1.close,
        atrPct: m15.atr / m15.close,
        bbWidthPct: (m1.bb.upper - m1.bb.lower) / m1.close,
        emaDistPct: Math.abs(m15.e50 - m15.e200) / m15.close,
        buyCurrent, sellCurrent,
        buyM5Score: frameScore(f.M5, i5, "buy"), sellM5Score: frameScore(f.M5, i5, "sell"),
        buyM15Score: frameScore(f.M15, i15, "buy"), sellM15Score: frameScore(f.M15, i15, "sell"),
        buyH1Score: frameScore(f.H1, i60, "buy"), sellH1Score: frameScore(f.H1, i60, "sell"),
        buyH4Score: frameScore(f.H4, i240, "buy"), sellH4Score: frameScore(f.H4, i240, "sell"),
        buyM5Mask: frameMask(f.M5, i5, "buy"), sellM5Mask: frameMask(f.M5, i5, "sell"),
        buyM15Mask: frameMask(f.M15, i15, "buy"), sellM15Mask: frameMask(f.M15, i15, "sell"),
        buyH1Mask: frameMask(f.H1, i60, "buy"), sellH1Mask: frameMask(f.H1, i60, "sell"),
        buyH4Mask: frameMask(f.H4, i240, "buy"), sellH4Mask: frameMask(f.H4, i240, "sell"),
        buyM15: [m15.e50 > m15.e200, m15.macd?.histogram > 0, m15.e50 > f.M15[i15 - 4].e50].filter(Boolean).length,
        sellM15: [!m15Bull, m15.macd?.histogram < 0, m15.e50 < f.M15[i15 - 4].e50].filter(Boolean).length,
        buyH1: [h1.e50 > h1.e200, h1.macd?.histogram > 0, h1.e50 > f.H1[i60 - 2].e50].filter(Boolean).length,
        sellH1: [!h1Bull, h1.macd?.histogram < 0, h1.e50 < f.H1[i60 - 2].e50].filter(Boolean).length,
        buySetup: [m5.e9 > m5.e21, m5.rsi >= 35 && m5.rsi <= 60, Math.abs(m5.close - m5.e21) <= 1.5 * m15.atr].filter(Boolean).length,
        sellSetup: [m5.e9 < m5.e21, m5.rsi >= 40 && m5.rsi <= 65, Math.abs(m5.close - m5.e21) <= 1.5 * m15.atr].filter(Boolean).length,
        buyTrigger, sellTrigger,
        buyCross: m1.bullCross, sellCross: m1.bearCross, buyReclaim: m1.bullReclaim, sellReclaim: m1.bearReclaim,
        buyBB: m1.bullBB, sellBB: m1.bearBB, buyRSI: m1.bullRSI, sellRSI: m1.bearRSI,
        buyBreakout: m1.bullBreakout, sellBreakout: m1.bearBreakout,
      });
    }
    f.M1 = f.M1.map(({ t, open, high, low, close }) => ({ t, open, high, low, close })); f.M5 = []; f.M15 = []; f.H1 = []; f.H4 = [];
  }
  events.sort((a, b) => a.t - b.t || requestedSymbols.indexOf(a.symbol) - requestedSymbols.indexOf(b.symbol));
  return { data, events, start: events[0]?.t ?? start, end, symbols: requestedSymbols };
}

export function evaluate(prepared, c) {
  const { data, events, start, end, symbols } = prepared;
  const startCapital = Number(c.startCapital ?? 500);
  let balance = startCapital, peak = startCapital, maxDD = 0, maxDDPct = 0, entrySequence = 0; const positions = [], pendingOrders = [], trades = [], lastClose = new Map(), dayCount = new Map(), totalDayCount = new Map();
  const close = (p, t, price, reason, closeSize = p.size, final = true) => { const gross = (p.side === "buy" ? price - p.entry : p.entry - price) * closeSize; const cost = SPREAD[p.symbol] * closeSize; const pnl = gross - cost; balance += pnl; peak = Math.max(peak, balance); maxDD = Math.max(maxDD, peak - balance); maxDDPct = Math.max(maxDDPct, 100 * (peak - balance) / Math.max(peak, 1)); trades.push({ t, opened: p.opened, symbol: p.symbol, side: p.side, pnl, r: pnl / (p.stopDistance * closeSize), reason, balanceAfter: balance, session: p.session, regime: p.regime, entryId: p.id }); if (final) { positions.splice(positions.indexOf(p), 1); lastClose.set(p.symbol, t); } else p.size -= closeSize; };
  const buildPosition = ({ event, config, side, entry, opened, next, session, regime }) => {
    const dist = config.stopATR * event.atr;
    const stop = side === "buy" ? entry - dist : entry + dist;
    const rewardRisk = config.rewardRisk ?? config.tpATR / config.stopATR;
    const target = side === "buy" ? entry + rewardRisk * dist : entry - rewardRisk * dist;
    const sizingCapital = config.capitalMode === "compound" ? Math.max(balance, 0) : startCapital;
    const size = Math.floor((((sizingCapital / config.riskDivisor) * 30) / entry) * 100) / 100;
    if (!(size > 0)) return null;
    return { id: entrySequence++, symbol: event.symbol, side, opened, entry, stop, target, size, risk: dist * size, next, atr: event.atr,
      trailBaseAtr: config.trailTimeframe === "m1" ? event.m1Atr : event.atr, stopDistance: dist,
      breakEvenR: config.breakEvenR ?? 0, trailATR: config.trailATR ?? 0, breakEvenMoved: false,
      partialR: config.partialR ?? 0, partialFraction: config.partialFraction ?? 0, moveStopOnPartial: config.moveStopOnPartial ?? false,
      partialTaken: false, rewardRisk, hold: config.hold, session, regime };
  };
  const activatePending = (to) => {
    for (const order of [...pendingOrders]) {
      const rows = data.get(order.event.symbol).M1;
      let i = order.next;
      while (i < rows.length && rows[i].t <= to) {
        const bar = rows[i];
        if (bar.t > order.expiresAt) { pendingOrders.splice(pendingOrders.indexOf(order), 1); break; }
        const filled = order.kind === "continuation"
          ? (order.side === "buy" ? bar.high >= order.level : bar.low <= order.level)
          : (order.side === "buy" ? bar.low <= order.level : bar.high >= order.level);
        if (filled) {
          const day = new Date(bar.t).toISOString().slice(0, 10), key = `${day}:${order.event.symbol}`;
          if (positions.length < order.config.maxPositions && !positions.some((position) => position.symbol === order.event.symbol) &&
              (dayCount.get(key) ?? 0) < order.config.maxDaily && (!order.config.maxTotalDaily || (totalDayCount.get(day) ?? 0) < order.config.maxTotalDaily)) {
            const position = buildPosition({ event: order.event, config: order.config, side: order.side, entry: order.level, opened: bar.t, next: i + 1, session: order.session, regime: order.regime });
            if (position) { positions.push(position); dayCount.set(key, (dayCount.get(key) ?? 0) + 1); totalDayCount.set(day, (totalDayCount.get(day) ?? 0) + 1); }
          }
          pendingOrders.splice(pendingOrders.indexOf(order), 1);
          break;
        }
        i += 1;
      }
      if (pendingOrders.includes(order)) order.next = i;
    }
  };
  const advance = (to) => { activatePending(to); for (const p of [...positions]) { const rows = data.get(p.symbol).M1; let i = p.next; while (i < rows.length && rows[i].t <= to) { const b = rows[i]; const sl = p.side === "buy" ? b.low <= p.stop : b.high >= p.stop; const tp = p.side === "buy" ? b.high >= p.target : b.low <= p.target; if (sl) { close(p, b.t, p.stop, "sl"); break; } if (tp) { close(p, b.t, p.target, "tp"); break; }
      // Exit adjustments become active only on the following minute. This is
      // deliberately conservative: a single OHLC bar cannot tell which level
      // was touched first.
      const partialHit = !p.partialTaken && p.partialR > 0 && (p.side === "buy" ? b.high >= p.entry + p.partialR * p.stopDistance : b.low <= p.entry - p.partialR * p.stopDistance);
      if (partialHit) {
        const partialSize = Math.floor(p.size * p.partialFraction * 100) / 100;
        if (partialSize > 0 && partialSize < p.size) {
          const partialPrice = p.side === "buy" ? p.entry + p.partialR * p.stopDistance : p.entry - p.partialR * p.stopDistance;
          close(p, b.t, partialPrice, "partial", partialSize, false);
          p.partialTaken = true;
          if (p.moveStopOnPartial) p.stop = p.side === "buy" ? Math.max(p.stop, p.entry) : Math.min(p.stop, p.entry);
          i += 1;
          continue;
        }
        p.partialTaken = true;
      }
      const reachedBreakEven = !p.breakEvenMoved && p.breakEvenR > 0 && (p.side === "buy" ? b.high >= p.entry + p.breakEvenR * p.stopDistance : b.low <= p.entry - p.breakEvenR * p.stopDistance);
      if (reachedBreakEven) { p.stop = p.side === "buy" ? Math.max(p.stop, p.entry) : Math.min(p.stop, p.entry); p.breakEvenMoved = true; }
      if (p.breakEvenMoved && p.trailATR > 0) p.stop = p.side === "buy" ? Math.max(p.stop, b.high - p.trailATR * p.trailBaseAtr) : Math.min(p.stop, b.low + p.trailATR * p.trailBaseAtr);
      if (b.t > p.opened + p.hold * MINUTE) { close(p, b.t, b.close, "time"); break; } i += 1; } if (positions.includes(p)) p.next = i; } };
  const pass = (e, side, config = c) => {
    if (config.mtf) {
      const scores = config.frames.map((tf) => config.componentWeights ? weightedMask(e[`${side}${tf}Mask`], config.componentWeights) : e[`${side}${tf}Score`]);
      const aligned = scores.filter((score) => score >= config.tfMin).length;
      if (!triggerPass(e, side, config.trigger)) return false;
      if (config.method === "mtf-majority") return aligned >= config.alignMin;
      if (config.method === "mtf-strict") return aligned === scores.length;
      if (config.method === "mtf-weighted") return aligned >= config.alignMin && scores.reduce((sum, score, i) => sum + score * config.weights[i], 0) >= config.threshold;
      const high = scores.slice(-2), low = scores.slice(0, -2);
      return high.every((score) => score >= config.highMin) && low.every((score) => score >= config.lowMin);
    }
    // The live-style model: first accumulate indicator points, then require
    // independent agreement from the entry/setup and higher trend frames.
    // No point from the raw score can bypass a failed trend gate.
    if (config.method === "scoring-gated" || config.method === "scoring-weighted") {
      const base = e[`${side}Current`];
      const m15 = e[`${side}M15`];
      const h1 = e[`${side}H1`];
      const h4 = e[`${side}H4Score`];
      const setup = e[`${side}Setup`];
      const trigger = e[`${side}Trigger`];
      const gatesPass =
        base >= config.minSignalScore &&
        (config.useM15Gate === false || m15 >= config.minM15Trend) &&
        (config.useH1Gate === false || h1 >= config.minH1Trend) &&
        (config.useH4Gate === false || h4 >= config.minH4Trend) &&
        (config.useSetupGate === false || setup >= config.minSetupScore) &&
        (config.useTriggerGate === false || triggerPass(e, side, config.trigger));
      if (!gatesPass) return false;
      if (config.method === "scoring-gated") return true;
      const weighted =
        base * config.wBase +
        m15 * config.wM15 +
        h1 * config.wH1 +
        h4 * config.wH4 +
        setup * config.wSetup +
        trigger * config.wTrigger;
      return weighted >= config.weightedThreshold;
    }
    if (config.method === "additive") return e[`${side}Current`] >= config.threshold;
    const trend = config.context === "m15" ? e[`${side}M15`] : config.context === "h1" ? e[`${side}H1`] : Math.min(e[`${side}M15`], e[`${side}H1`]);
    if (config.method === "weighted") return trend * config.wTrend + e[`${side}Setup`] * config.wSetup + e[`${side}Trigger`] * config.wTrigger >= config.threshold && triggerPass(e, side, config.trigger);
    return trend >= config.trendMin && e[`${side}Setup`] >= config.setupMin && triggerPass(e, side, config.trigger);
  };
  // At one candle close several symbols can be eligible.  The runtime should
  // choose the strongest approved setup, not whichever symbol happens to be
  // processed first in an asynchronous loop.
  const rankedSignalAt = new Map();
  if (c.rankByScore) {
    for (const e of events) {
      const entryPolicy = entryConfigFor(e, c), ec = entryPolicy.config;
      if (ec.enabled === false || !inSessionWindows(e.t, ec.sessionWindows) || !passesResearchFilters(e, ec) || (ec.symbols && !ec.symbols.includes(e.symbol)) || !(e.atr > 0)) continue;
      const buy = pass(e, "buy", ec), sell = pass(e, "sell", ec);
      if (!buy && !sell) continue;
      const rank = (side) =>
        e[`${side}Current`] * 100 +
        (e[`${side}M15`] + e[`${side}H1`] + e[`${side}H4Score`]) * 10 +
        e[`${side}Setup`] * 3 + e[`${side}Trigger`];
      const side = buy && sell ? (rank("buy") >= rank("sell") ? "buy" : "sell") : buy ? "buy" : "sell";
      const candidate = { event: e, side, rank: rank(side) };
      const current = rankedSignalAt.get(e.t);
      if (!current || candidate.rank > current.rank || (candidate.rank === current.rank && e.symbol < current.event.symbol)) rankedSignalAt.set(e.t, candidate);
    }
  }
  for (const e of events) {
    advance(e.t); const entryPolicy = entryConfigFor(e, c), ec = entryPolicy.config;
    if (ec.enabled === false || !inSessionWindows(e.t, ec.sessionWindows) || !passesResearchFilters(e, ec) || (ec.symbols && !ec.symbols.includes(e.symbol))) continue;
    const ranked = c.rankByScore ? rankedSignalAt.get(e.t) : null;
    if (c.rankByScore && (!ranked || ranked.event !== e)) continue;
    if (positions.length + pendingOrders.length >= ec.maxPositions || positions.some((p) => p.symbol === e.symbol) || pendingOrders.some((order) => order.event.symbol === e.symbol)) continue;
    if (e.t - (lastClose.get(e.symbol) ?? -Infinity) < ec.cooldown * MINUTE) continue;
    const day = new Date(e.t).toISOString().slice(0, 10), key = `${day}:${e.symbol}`; if ((dayCount.get(key) ?? 0) >= ec.maxDaily || (ec.maxTotalDaily && (totalDayCount.get(day) ?? 0) >= ec.maxTotalDaily)) continue;
    const side = ranked?.side ?? (pass(e, "buy", ec) ? "buy" : pass(e, "sell", ec) ? "sell" : null); if (!side || !(e.atr > 0)) continue;
    const pendingMode = ec.entryMode === "adaptive-pending" && e[`${side}Current`] < ec.pendingBelowScore ? ec.pendingKind : ec.entryMode;
    if (pendingMode === "continuation" || pendingMode === "pullback") {
      const offset = (Number.isFinite(e.m1Atr) ? e.m1Atr : e.atr) * ec.pendingOffsetAtr;
      const level = pendingMode === "continuation"
        ? (side === "buy" ? e.signalClose + offset : e.signalClose - offset)
        : (side === "buy" ? e.signalClose - offset : e.signalClose + offset);
      pendingOrders.push({ event: e, config: ec, side, kind: pendingMode, level, next: e.next, expiresAt: e.t + ec.pendingExpiryMinutes * MINUTE, session: entryPolicy.session, regime: entryPolicy.regime });
      continue;
    }
    const bar = data.get(e.symbol).M1[e.next]; if (!bar || bar.t !== e.t) continue;
    const position = buildPosition({ event: e, config: ec, side, entry: bar.open, opened: e.t, next: e.next, session: entryPolicy.session, regime: entryPolicy.regime });
    if (!position) continue;
    positions.push(position); dayCount.set(key, (dayCount.get(key) ?? 0) + 1); totalDayCount.set(day, (totalDayCount.get(day) ?? 0) + 1);
  }
  advance(end + 2 * DAY);
  const firstWeek = new Date(start), weeks = new Map(), weekPnl = new Map(); for (let t = firstWeek.getTime(); t <= end; t += 7 * DAY) { weeks.set(isoWeek(t), 0); weekPnl.set(isoWeek(t), 0); }
  for (const tr of trades) { weeks.set(isoWeek(tr.t), (weeks.get(isoWeek(tr.t)) ?? 0) + tr.r); weekPnl.set(isoWeek(tr.t), (weekPnl.get(isoWeek(tr.t)) ?? 0) + tr.pnl); }
  const selection = [...weeks].filter(([week]) => week < "2026-W23").map(([, r]) => r), holdout = [...weeks].filter(([week]) => week >= "2026-W23").map(([, r]) => r);
  const stats = (values) => { const sorted = [...values].sort((a, b) => a - b), positive = values.filter((x) => x > 0).length; let curve = 0, curvePeak = 0, drawdown = 0; for (const value of values) { curve += value; curvePeak = Math.max(curvePeak, curve); drawdown = Math.max(drawdown, curvePeak - curve); } return { weeks: values.length, positiveWeeks: positive, positiveWeekPct: values.length ? +(100 * positive / values.length).toFixed(1) : 0, medianR: sorted.length ? +sorted[Math.floor(sorted.length / 2)].toFixed(3) : 0, worstR: sorted.length ? +sorted[0].toFixed(3) : 0, totalR: +values.reduce((a, b) => a + b, 0).toFixed(3), maxDrawdownR: +drawdown.toFixed(3) }; };
  const selectionTrades = trades.filter((x) => isoWeek(x.t) < "2026-W23"), wins = selectionTrades.filter((x) => x.pnl > 0), losses = selectionTrades.filter((x) => x.pnl < 0), grossWin = wins.reduce((s, x) => s + x.pnl, 0), grossLoss = losses.reduce((s, x) => s + x.pnl, 0);
  const selectionEntries = new Set(selectionTrades.map((trade) => trade.entryId)).size;
  const sel = stats(selection), test = stats(holdout); const pf = grossLoss ? grossWin / Math.abs(grossLoss) : 0;
  const selectionFinalBalance = selectionTrades.length ? selectionTrades.at(-1).balanceAfter : startCapital;
  const selectionReturnPct = 100 * (selectionFinalBalance - startCapital) / startCapital;
  const forwardReturnPct = selectionFinalBalance > 0 ? 100 * (balance - selectionFinalBalance) / selectionFinalBalance : -100;
  const precisionStats = (values, weekCount) => {
    const positive = values.filter((trade) => trade.pnl > 0).length, takeProfits = values.filter((trade) => trade.reason === "tp").length;
    const stopLosses = values.filter((trade) => trade.reason === "sl").length, timeExits = values.filter((trade) => trade.reason === "time").length;
    return {
      trades: values.length,
      positiveTrades: positive,
      winRate: values.length ? +(100 * positive / values.length).toFixed(1) : 0,
      takeProfits,
      tpRate: values.length ? +(100 * takeProfits / values.length).toFixed(1) : 0,
      stopLosses,
      timeExits,
      tradesPerDay: weekCount ? +(values.length / (weekCount * 5)).toFixed(2) : 0,
      averagePnl: values.length ? +(values.reduce((sum, trade) => sum + trade.pnl, 0) / values.length).toFixed(3) : 0,
    };
  };
  const selectionPrecision = precisionStats(selectionTrades, sel.weeks);
  const holdoutTrades = trades.filter((x) => isoWeek(x.t) >= "2026-W23");
  const holdoutPrecision = precisionStats(holdoutTrades, test.weeks);
  const activeSelectionDays = new Set(selectionTrades.map((trade) => new Date(trade.opened).toISOString().slice(0, 10))).size;
  const activeDayPct = sel.weeks ? +(100 * activeSelectionDays / (sel.weeks * 5)).toFixed(1) : 0;
  const recentStart = end - 14 * DAY;
  const recentTrades = trades.filter((trade) => trade.t >= recentStart);
  const recentGrossWin = recentTrades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const recentGrossLoss = recentTrades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const recent = {
    start: new Date(recentStart).toISOString(),
    end: new Date(end).toISOString(),
    pnl: +recentTrades.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2),
    profitFactor: recentGrossLoss ? +(recentGrossWin / Math.abs(recentGrossLoss)).toFixed(3) : 0,
    ...precisionStats(recentTrades, 10),
  };
  const symbolStats = Object.fromEntries(symbols.map((symbol) => {
    const selected = selectionTrades.filter((trade) => trade.symbol === symbol), tested = holdoutTrades.filter((trade) => trade.symbol === symbol);
    return [symbol, {
      selection: precisionStats(selected, sel.weeks),
      holdout: precisionStats(tested, test.weeks),
      selectionR: +selected.reduce((sum, trade) => sum + trade.r, 0).toFixed(3),
      holdoutR: +tested.reduce((sum, trade) => sum + trade.r, 0).toFixed(3),
      pnl: +[...selected, ...tested].reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2),
    }];
  }));
  const contextStats = (key) => Object.fromEntries([...new Set(trades.map((trade) => trade[key]))].map((value) => {
    const values = trades.filter((trade) => trade[key] === value);
    return [value, { trades: values.length, pnl: +values.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2), r: +values.reduce((sum, trade) => sum + trade.r, 0).toFixed(3) }];
  }));
  const sessionStats = contextStats("session"), regimeStats = contextStats("regime");
  const monthly = {};
  for (const trade of trades) {
    const month = new Date(trade.t).toISOString().slice(0, 7);
    monthly[month] ??= { pnl: 0, r: 0, trades: 0, wins: 0 };
    monthly[month].pnl += trade.pnl; monthly[month].r += trade.r; monthly[month].trades += 1;
    if (trade.pnl > 0) monthly[month].wins += 1;
  }
  for (const value of Object.values(monthly)) {
    value.pnl = +value.pnl.toFixed(2); value.r = +value.r.toFixed(3);
    value.winRate = +(100 * value.wins / value.trades).toFixed(1);
  }
  const dailyMap = new Map();
  for (let t = new Date(start).setUTCHours(0, 0, 0, 0); t <= end; t += DAY) {
    const date = new Date(t), weekday = date.getUTCDay();
    if (weekday > 0 && weekday < 6) dailyMap.set(date.toISOString().slice(0, 10), { day: date.toISOString().slice(0, 10), pnl: 0, r: 0, entries: 0, closes: 0 });
  }
  const seenEntries = new Set();
  for (const trade of trades) {
    const closeDay = new Date(trade.t).toISOString().slice(0, 10), closeStats = dailyMap.get(closeDay);
    if (closeStats) { closeStats.pnl += trade.pnl; closeStats.r += trade.r; closeStats.closes += 1; }
    if (!seenEntries.has(trade.entryId)) {
      seenEntries.add(trade.entryId);
      const entryDay = new Date(trade.opened).toISOString().slice(0, 10), entryStats = dailyMap.get(entryDay);
      if (entryStats) entryStats.entries += 1;
    }
  }
  const daily = [...dailyMap.values()].map((day) => ({ ...day, pnl: +day.pnl.toFixed(2), r: +day.r.toFixed(3) }));
  const weekly = [...weeks].map(([week, r]) => ({ week, r: +r.toFixed(3), pnl: +(weekPnl.get(week) ?? 0).toFixed(2) }));
  const fold = (from, to) => {
    const values = weekly.filter(({ week }) => week >= from && week <= to);
    const pnl = values.reduce((sum, week) => sum + week.pnl, 0);
    return { weeks: values.length, pnl: +pnl.toFixed(2), positiveWeeks: values.filter((week) => week.pnl > 0).length, positiveWeekPct: values.length ? +(100 * values.filter((week) => week.pnl > 0).length / values.length).toFixed(1) : 0 };
  };
  const folds = { train: fold("2026-W03", "2026-W14"), validation: fold("2026-W15", "2026-W22"), test: fold("2026-W23", "2026-W26") };
  const bestWeek = weekly.reduce((best, week) => !best || week.pnl > best.pnl ? week : best, null);
  const bestSelectionWeek = weekly.filter(({ week }) => week < "2026-W23").reduce((best, week) => !best || week.pnl > best.pnl ? week : best, null);
  const qualityEligible =
    folds.train.pnl > 0 &&
    folds.validation.pnl > 0 &&
    pf >= 1.05 &&
    sel.totalR > 0 &&
    sel.positiveWeekPct >= 55;
  const directionEligible =
    folds.train.pnl > 0 &&
    folds.validation.pnl > 0 &&
    pf >= 1.05 &&
    sel.totalR > 0 &&
    activeDayPct >= 70 &&
    selectionPrecision.tradesPerDay >= 0.7 &&
    selectionPrecision.tradesPerDay <= 8 &&
    (c.tpATR / c.stopATR) >= 2;
  const objective = c.objectiveMode === "adaptive-walk-forward"
    ? (() => {
        const limit = c.maxAllowedDrawdownPct ?? 20;
        const drawdownPenalty = maxDDPct > limit ? (maxDDPct - limit) * 5 : 0;
        const trainPenalty = folds.train.pnl <= 0 ? Math.abs(folds.train.pnl) * 2.5 : 0;
        const validationPenalty = folds.validation.pnl <= 0 ? Math.abs(folds.validation.pnl) * 2.5 : 0;
        const activityPenalty = selectionEntries < 55 ? (55 - selectionEntries) * 0.45 : 0;
        return folds.train.pnl + 2 * folds.validation.pnl + 0.5 * selectionReturnPct - drawdownPenalty - trainPenalty - validationPenalty - activityPenalty;
      })()
    : c.objectiveMode === "session-compound"
    ? (() => {
        const activityPenalty = selectionTrades.length < 45 ? (45 - selectionTrades.length) * 0.55 : 0;
        const pfPenalty = pf < 1.04 ? (1.04 - pf) * 90 : 0;
        const limit = c.maxAllowedDrawdownPct ?? 20;
        const drawdownPenalty = maxDDPct > limit ? (maxDDPct - limit) * 4 : 0;
        return selectionReturnPct * 5 + pf * 3 - activityPenalty - pfPenalty - drawdownPenalty;
      })()
    : c.objectiveMode === "max-week"
    ? (bestSelectionWeek?.pnl ?? -Infinity) - 0.05 * maxDD + 0.01 * (balance - startCapital)
    : c.objectiveMode === "entry-precision"
    ? (() => {
        const n = selectionPrecision.trades, z = 1.96;
        const lowerBound = (successes) => {
          if (!n) return 0;
          const p = successes / n, denominator = 1 + z * z / n;
          return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / denominator;
        };
        const activityPenalty = selectionPrecision.tradesPerDay > 3 ? 25 * (selectionPrecision.tradesPerDay - 3) : selectionPrecision.tradesPerDay < 0.5 ? 15 * (0.5 - selectionPrecision.tradesPerDay) : 0;
        const expectancyWeight = c.requirePositiveExpectancy ? 1.5 : 0.12;
        const negativeExpectancyPenalty = c.requirePositiveExpectancy && sel.totalR < 0 ? 2 * Math.abs(sel.totalR) : 0;
        return 70 * lowerBound(selectionPrecision.positiveTrades) + 30 * lowerBound(selectionPrecision.takeProfits) + expectancyWeight * sel.totalR - negativeExpectancyPenalty - activityPenalty;
      })()
    : c.objectiveMode === "direction"
    ? directionEligible
      ? folds.train.pnl + folds.validation.pnl * 1.5 + pf * 12 + sel.totalR * 2 + activeDayPct * 0.25 - sel.maxDrawdownR * 2
      : -10_000
    : c.mtf
    ? (() => {
        // Do not let a merely "less bad" configuration win an MTF search.
        // Both development folds must be profitable, and the combined
        // pre-holdout sample must clear a modest profitability/consistency
        // gate before its quality score is considered.
        if (!qualityEligible) return -10_000;
        return sel.positiveWeekPct + 3 * sel.medianR + 0.8 * sel.totalR + 4 * Math.min(pf, 2) + 0.5 * sel.worstR - 0.35 * sel.maxDrawdownR - (selectionTrades.length < 60 ? 20 : 0);
      })()
    : qualityEligible
    ? sel.positiveWeekPct + 2 * sel.medianR + 3 * Math.min(pf, 2) + 0.15 * sel.worstR - 0.1 * sel.maxDrawdownR - (selectionTrades.length < 100 ? 20 : 0)
    : -10_000;
  const qualified = c.objectiveMode === "direction" ? directionEligible : qualityEligible;
  return { objective: +objective.toFixed(4), qualified, startCapital, finalBalance: +balance.toFixed(2), returnPct: +(100 * (balance - startCapital) / startCapital).toFixed(2), selectionFinalBalance: +selectionFinalBalance.toFixed(2), selectionReturnPct: +selectionReturnPct.toFixed(2), forwardStartBalance: +selectionFinalBalance.toFixed(2), forwardReturnPct: +forwardReturnPct.toFixed(2), trades: trades.length, entries: entrySequence, partialExits: trades.filter((trade) => trade.reason === "partial").length, pnl: +(balance - startCapital).toFixed(2), profitFactor: +pf.toFixed(3), maxDDPct: +maxDDPct.toFixed(1), selection: sel, holdout: test, folds, selectionPrecision, holdoutPrecision, activeDayPct, recent, symbolStats, sessionStats, regimeStats, bestSelectionWeek, bestWeek, daily, weekly, monthly };
}
