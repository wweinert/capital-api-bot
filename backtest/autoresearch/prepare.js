import fs from "node:fs";
import { EMA, RSI, BollingerBands, MACD, ATR } from "technicalindicators";

const DAY = 86_400_000;
const MINUTE = 60_000;
const TF = { M1: MINUTE, M5: 5 * MINUTE, M15: 15 * MINUTE, H1: 60 * MINUTE, H4: 240 * MINUTE };
const SYMBOLS = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
// Research may be memory-constrained on the server.  An explicit subset keeps
// the simulation faithful to the active bot without loading unrelated pairs.
const REQUESTED_SYMBOLS = process.env.RESEARCH_SYMBOLS
  ? process.env.RESEARCH_SYMBOLS.split(",").map((symbol) => symbol.trim()).filter(Boolean)
  : SYMBOLS;
const SPREAD = {
  EURUSD: 0.00007, GBPUSD: 0.00013, EURGBP: 0.00020, AUDUSD: 0.00006, USDCAD: 0.00020,
  EURJPY: 0.015, USDJPY: 0.010, AUDJPY: 0.018, NZDUSD: 0.00015, NZDJPY: 0.020,
};
const PIP = { EURUSD: 0.0001, GBPUSD: 0.0001, EURGBP: 0.0001, AUDUSD: 0.0001, USDCAD: 0.0001, EURJPY: 0.01, USDJPY: 0.01, AUDJPY: 0.01, NZDUSD: 0.0001, NZDJPY: 0.01 };

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

export function prepare(datasetDir, requestedSymbols = REQUESTED_SYMBOLS) {
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
      events.push({ t: decision, symbol, next: i + 1, atr: m15.atr,
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
  let balance = startCapital, peak = startCapital, maxDD = 0, maxDDPct = 0, entrySequence = 0;
  const positions = [], pending = [], trades = [], lastClose = new Map(), dayCount = new Map(), totalDayCount = new Map(), flipCount = new Map(), realizedDayPnl = new Map();
  const pendingStats = { placed: 0, activated: 0, expired: 0, canceledOpposite: 0, canceledReplaced: 0, canceledCapacity: 0, canceledEod: 0 };
  const close = (p, t, price, reason, closeSize = p.size, final = true) => { const gross = (p.side === "buy" ? price - p.entry : p.entry - price) * closeSize; const cost = SPREAD[p.symbol] * closeSize; const pnl = gross - cost; const day = new Date(t).toISOString().slice(0, 10); realizedDayPnl.set(day, (realizedDayPnl.get(day) ?? 0) + pnl); balance += pnl; peak = Math.max(peak, balance); maxDD = Math.max(maxDD, peak - balance); maxDDPct = Math.max(maxDDPct, 100 * (peak - balance) / Math.max(peak, 1)); trades.push({ t, opened: p.opened, symbol: p.symbol, side: p.side, pnl, r: pnl / (p.stopDistance * closeSize), reason, balanceAfter: balance, session: p.session, regime: p.regime, entryId: p.id }); if (final) { positions.splice(positions.indexOf(p), 1); lastClose.set(p.symbol, t); } else p.size -= closeSize; };
  const openPosition = (order, entry, opened, next) => {
    const dist = order.stopATR * order.atr;
    if (!(dist > 0) || !(entry > 0)) return false;
    const sizingCapital = order.capitalMode === "compound" ? Math.max(balance, 0) : startCapital;
    const size = Math.floor((((sizingCapital / order.riskDivisor) * 30) / entry) * 100) / 100;
    if (!(size > 0)) return false;
    const stop = order.side === "buy" ? entry - dist : entry + dist;
    const target = order.side === "buy" ? entry + order.rewardRisk * dist : entry - order.rewardRisk * dist;
    positions.push({ id: entrySequence++, symbol: order.symbol, side: order.side, opened, entry, stop, target, size, risk: dist * size, next, atr: order.atr, stopDistance: dist, breakEvenR: order.breakEvenR ?? 0, trailATR: order.trailATR ?? 0, breakEvenMoved: false, partialR: order.partialR ?? 0, partialFraction: order.partialFraction ?? 0, moveStopOnPartial: order.moveStopOnPartial ?? false, partialTaken: false, rewardRisk: order.rewardRisk, hold: order.hold, session: order.session, regime: order.regime, slippagePips: order.slippagePips ?? 0, flatAtMinute: order.flatAtMinute });
    const day = new Date(opened).toISOString().slice(0, 10), key = `${day}:${order.symbol}`;
    dayCount.set(key, (dayCount.get(key) ?? 0) + 1); totalDayCount.set(day, (totalDayCount.get(day) ?? 0) + 1);
    return true;
  };
  const removePending = (order, reason) => { const index = pending.indexOf(order); if (index >= 0) pending.splice(index, 1); pendingStats[reason] += 1; };
  const advancePending = (to) => {
    for (const order of [...pending]) {
      const rows = data.get(order.symbol).M1; let i = order.next;
      while (i < rows.length && rows[i].t <= to && pending.includes(order)) {
        const b = rows[i], minuteOfDay = new Date(b.t).getUTCHours() * 60 + new Date(b.t).getUTCMinutes();
        if (b.t > order.expires) { removePending(order, "expired"); break; }
        if (order.flatAtMinute != null && minuteOfDay >= order.flatAtMinute) { removePending(order, "canceledEod"); break; }
        const touched = order.type === "STOP"
          ? (order.side === "buy" ? b.high >= order.level : b.low <= order.level)
          : (order.side === "buy" ? b.low <= order.level : b.high >= order.level);
        if (!touched) { i += 1; continue; }
        const day = new Date(b.t).toISOString().slice(0, 10), key = `${day}:${order.symbol}`;
        const capacity = positions.length >= order.maxPositions || positions.some((p) => p.symbol === order.symbol)
          || (dayCount.get(key) ?? 0) >= order.maxDaily
          || (order.maxTotalDaily && (totalDayCount.get(day) ?? 0) >= order.maxTotalDaily)
          || (order.dailyLossLimitPct > 0 && (realizedDayPnl.get(day) ?? 0) <= -balance * order.dailyLossLimitPct);
        if (capacity) { removePending(order, "canceledCapacity"); break; }
        const pip = PIP[order.symbol] ?? 0.0001, slip = (order.slippagePips ?? 0) * pip;
        // The OHLC data cannot establish intrabar sequencing. Stop orders get
        // adverse gap fills; limit orders deliberately receive no price
        // improvement. Exits begin only on the next minute.
        const entry = order.type === "STOP"
          ? (order.side === "buy" ? Math.max(order.level, b.open) + slip : Math.min(order.level, b.open) - slip)
          : (order.side === "buy" ? order.level + slip : order.level - slip);
        if (openPosition(order, entry, b.t, i + 1)) { removePending(order, "activated"); } else removePending(order, "canceledCapacity");
        break;
      }
      if (pending.includes(order)) order.next = i;
    }
  };
  const advance = (to) => { for (const p of [...positions]) { const rows = data.get(p.symbol).M1; let i = p.next; while (i < rows.length && rows[i].t <= to) { const b = rows[i]; const minuteOfDay = new Date(b.t).getUTCHours() * 60 + new Date(b.t).getUTCMinutes(); const barDay = new Date(b.t).toISOString().slice(0, 10), openDay = new Date(p.opened).toISOString().slice(0, 10); const slip = (p.slippagePips ?? 0) * (PIP[p.symbol] ?? 0.0001); if (p.flatAtMinute != null && (barDay !== openDay || minuteOfDay >= p.flatAtMinute)) { close(p, b.t, b.close, "eod"); break; } const sl = p.side === "buy" ? b.low <= p.stop : b.high >= p.stop; const tp = p.side === "buy" ? b.high >= p.target : b.low <= p.target; if (sl) { const fill = p.side === "buy" ? Math.min(p.stop, b.open) - slip : Math.max(p.stop, b.open) + slip; close(p, b.t, fill, "sl"); break; } if (tp) { close(p, b.t, p.target, "tp"); break; }
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
      if (p.breakEvenMoved && p.trailATR > 0) p.stop = p.side === "buy" ? Math.max(p.stop, b.high - p.trailATR * p.atr) : Math.min(p.stop, b.low + p.trailATR * p.atr);
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
    if (config.method === "additive") return e[`${side}Current`] >= config.threshold;
    const trend = config.context === "m15" ? e[`${side}M15`] : config.context === "h1" ? e[`${side}H1`] : Math.min(e[`${side}M15`], e[`${side}H1`]);
    if (config.method === "weighted") return trend * config.wTrend + e[`${side}Setup`] * config.wSetup + e[`${side}Trigger`] * config.wTrigger >= config.threshold && triggerPass(e, side, config.trigger);
    return trend >= config.trendMin && e[`${side}Setup`] >= config.setupMin && triggerPass(e, side, config.trigger);
  };
  for (const e of events) {
    advancePending(e.t); advance(e.t); const entryPolicy = entryConfigFor(e, c), ec = entryPolicy.config;
    if (ec.enabled === false || !inSessionWindows(e.t, ec.sessionWindows) || !passesResearchFilters(e, ec) || (ec.symbols && !ec.symbols.includes(e.symbol))) continue;
    const side = pass(e, "buy", ec) ? "buy" : pass(e, "sell", ec) ? "sell" : null; if (!side || !(e.atr > 0)) continue;
    const opposite = pending.filter((order) => order.symbol === e.symbol && order.side !== side);
    if (ec.cancelPendingOnOpposite !== false) for (const order of opposite) removePending(order, "canceledOpposite");
    const day = new Date(e.t).toISOString().slice(0, 10), key = `${day}:${e.symbol}`;
    const bar = data.get(e.symbol).M1[e.next + (ec.signalDelayMinutes ?? 0)]; if (!bar) continue;
    if (ec.pendingOrderType && ec.pendingOrderType !== "none") {
      const prior = pending.filter((order) => order.symbol === e.symbol && order.side === side);
      if (prior.length && ec.replacePendingOnSameSignal === false) continue;
      for (const order of prior) removePending(order, "canceledReplaced");
      if (pending.length >= (ec.maxPendingOrders ?? ec.maxPositions ?? 1)) continue;
      if ((dayCount.get(key) ?? 0) >= ec.maxDaily || (ec.maxTotalDaily && (totalDayCount.get(day) ?? 0) >= ec.maxTotalDaily)) continue;
      if (ec.dailyLossLimitPct > 0 && (realizedDayPnl.get(day) ?? 0) <= -balance * ec.dailyLossLimitPct) continue;
      const signalBar = data.get(e.symbol).M1[Math.max(0, e.next - 1)], offset = (ec.pendingOffsetATR ?? 0) * e.atr;
      const level = ec.pendingOrderType === "STOP"
        ? (side === "buy" ? signalBar.high + offset : signalBar.low - offset)
        : (side === "buy" ? signalBar.close - offset : signalBar.close + offset);
      const frameStrength = ec.frames?.reduce((sum, tf) => sum + e[`${side}${tf}Score`], 0) / Math.max(ec.frames?.length || 1, 1);
      const rewardRisk = ec.dynamicReward && frameStrength >= ec.dynamicScore ? ec.highRewardRisk : (ec.rewardRisk ?? ec.tpATR / ec.stopATR);
      pending.push({ symbol: e.symbol, side, type: ec.pendingOrderType, level, created: e.t, expires: e.t + (ec.pendingTtlMinutes ?? 30) * MINUTE, next: e.next + (ec.signalDelayMinutes ?? 0), atr: e.atr, stopATR: ec.stopATR, rewardRisk, hold: ec.hold, session: entryPolicy.session, regime: entryPolicy.regime, breakEvenR: ec.breakEvenR ?? 0, trailATR: ec.trailATR ?? 0, partialR: ec.partialR ?? 0, partialFraction: ec.partialFraction ?? 0, moveStopOnPartial: ec.moveStopOnPartial ?? false, slippagePips: ec.slippagePips ?? 0, flatAtMinute: ec.flatAtMinute, capitalMode: ec.capitalMode, riskDivisor: ec.riskDivisor, maxPositions: ec.maxPositions, maxDaily: ec.maxDaily, maxTotalDaily: ec.maxTotalDaily, dailyLossLimitPct: ec.dailyLossLimitPct });
      pendingStats.placed += 1;
      continue;
    }
    if (positions.length >= ec.maxPositions || positions.some((p) => p.symbol === e.symbol)) continue;
    if ((dayCount.get(key) ?? 0) >= ec.maxDaily || (ec.maxTotalDaily && (totalDayCount.get(day) ?? 0) >= ec.maxTotalDaily)) continue;
    if (ec.dailyLossLimitPct > 0 && (realizedDayPnl.get(day) ?? 0) <= -balance * ec.dailyLossLimitPct) continue;
    if ((ec.signalDelayMinutes ?? 0) > 0) advance(bar.t);
    let flipped = false;
    const current = positions.find((position) => position.symbol === e.symbol);
    if (current) {
      const unprotectedR = ((current.side === "buy" ? bar.open - current.entry : current.entry - bar.open) / current.stopDistance);
      const flipKey = `${day}:${e.symbol}`;
      const canFlip = ec.flipEnabled === true
        && side !== current.side
        && unprotectedR <= -(ec.flipMinLossR ?? 0.5)
        && (flipCount.get(flipKey) ?? 0) < (ec.flipMaxPerDay ?? 1);
      if (!canFlip) continue;
      close(current, e.t, bar.open, "flip");
      flipCount.set(flipKey, (flipCount.get(flipKey) ?? 0) + 1);
      flipped = true;
    }
    if (!flipped && e.t - (lastClose.get(e.symbol) ?? -Infinity) < ec.cooldown * MINUTE) continue;
    const rawEntry = ec.entryOnSignalClose ? bar.close : bar.open, entrySlip = (ec.slippagePips ?? 0) * (PIP[e.symbol] ?? 0.0001), entry = side === "buy" ? rawEntry + entrySlip : rawEntry - entrySlip, dist = ec.stopATR * e.atr, stop = side === "buy" ? entry - dist : entry + dist;
    const frameStrength = ec.frames?.reduce((sum, tf) => sum + e[`${side}${tf}Score`], 0) / Math.max(ec.frames?.length || 1, 1);
    const rewardRisk = ec.dynamicReward && frameStrength >= ec.dynamicScore ? ec.highRewardRisk : (ec.rewardRisk ?? ec.tpATR / ec.stopATR);
    const target = side === "buy" ? entry + rewardRisk * dist : entry - rewardRisk * dist;
    // Fixed notional from the original capital keeps later walk-forward weeks
    // observable even when an early candidate would otherwise go bankrupt.
    // Equal quoted notional across 1.x and JPY-quoted instruments; rounding to
    // 100 units would otherwise silently exclude every JPY pair.
    const sizingCapital = ec.capitalMode === "compound" ? Math.max(balance, 0) : startCapital;
    let size = Math.floor((((sizingCapital / ec.riskDivisor) * 30) / entry) * 100) / 100; if (!(size > 0)) continue;
    positions.push({ id: entrySequence++, symbol: e.symbol, side, opened: bar.t, entry, stop, target, size, risk: dist * size, next: e.next + (ec.signalDelayMinutes ?? 0), atr: e.atr, stopDistance: dist, breakEvenR: ec.breakEvenR ?? 0, trailATR: ec.trailATR ?? 0, breakEvenMoved: false, partialR: ec.partialR ?? 0, partialFraction: ec.partialFraction ?? 0, moveStopOnPartial: ec.moveStopOnPartial ?? false, partialTaken: false, rewardRisk, hold: ec.hold, session: entryPolicy.session, regime: entryPolicy.regime, slippagePips: ec.slippagePips ?? 0, flatAtMinute: ec.flatAtMinute }); dayCount.set(key, (dayCount.get(key) ?? 0) + 1); totalDayCount.set(day, (totalDayCount.get(day) ?? 0) + 1);
  }
  advancePending(end + 2 * DAY); advance(end + 2 * DAY);
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
    : c.mtf
    ? sel.positiveWeekPct + 3 * sel.medianR + 0.8 * sel.totalR + 4 * Math.min(pf, 2) + 0.5 * sel.worstR - 0.35 * sel.maxDrawdownR - (selectionTrades.length < 60 ? 20 : 0)
    : sel.positiveWeekPct + 2 * sel.medianR + 3 * Math.min(pf, 2) + 0.15 * sel.worstR - 0.1 * sel.maxDrawdownR - (selectionTrades.length < 100 ? 20 : 0);
  const flips = trades.filter((trade) => trade.reason === "flip");
  const flipStats = { count: flips.length, pnl: +flips.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2), wins: flips.filter((trade) => trade.pnl > 0).length };
  return { objective: +objective.toFixed(4), startCapital, finalBalance: +balance.toFixed(2), returnPct: +(100 * (balance - startCapital) / startCapital).toFixed(2), selectionFinalBalance: +selectionFinalBalance.toFixed(2), selectionReturnPct: +selectionReturnPct.toFixed(2), forwardStartBalance: +selectionFinalBalance.toFixed(2), forwardReturnPct: +forwardReturnPct.toFixed(2), trades: trades.length, entries: entrySequence, pendingStats, partialExits: trades.filter((trade) => trade.reason === "partial").length, flipStats, pnl: +(balance - startCapital).toFixed(2), profitFactor: +pf.toFixed(3), maxDDPct: +maxDDPct.toFixed(1), selection: sel, holdout: test, folds, selectionPrecision, holdoutPrecision, symbolStats, sessionStats, regimeStats, bestSelectionWeek, bestWeek, daily, weekly, monthly };
}
