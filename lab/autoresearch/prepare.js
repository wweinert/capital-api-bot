import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { EMA, RSI, BollingerBands, MACD, ATR } from "technicalindicators";

const DAY = 86_400_000;
const MINUTE = 60_000;
const TF = { M1: MINUTE, M5: 5 * MINUTE, M15: 15 * MINUTE, H1: 60 * MINUTE, H4: 240 * MINUTE, D1: DAY };
export const DEFAULT_SYMBOLS = ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD", "EURJPY", "USDJPY", "AUDJPY", "NZDUSD", "NZDJPY"];
export const RESEARCH_PROTOCOL = Object.freeze({
  schemaVersion: 4,
  train: Object.freeze({ fromWeek: "2026-W03", toWeek: "2026-W14" }),
  validation: Object.freeze({ fromWeek: "2026-W15", toWeek: "2026-W22" }),
  evaluationEndExclusive: "2026-06-01T00:00:00.000Z",
  minimumCoverageEnd: "2026-05-29T00:00:00.000Z",
  lockedTest: "external-human-controlled",
  primaryMetric: "robustObjective",
  startCapital: 500,
  leverage: Object.freeze({ usdPairs: 30, crosses: 20 }),
  risk: Object.freeze({ maxPerPositionPct: 0.03, maxPortfolioPct: 0.15, marginUtilization: 0.9 }),
  sizing: "fixed EUR 500 upside, balance-sensitive downside; quote-currency conversion at entry/exit",
  execution: "closed-candle signals, next-M1 entry, bid/ask prices, conservative SL-first OHLC ambiguity",
});
const MAJOR_FX = new Set(["AUDUSD", "EURUSD", "GBPUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY"]);
const SPREAD = {
  EURUSD: 0.00007, GBPUSD: 0.00013, EURGBP: 0.00020, AUDUSD: 0.00006, USDCAD: 0.00020,
  EURJPY: 0.015, USDJPY: 0.010, AUDJPY: 0.018, NZDUSD: 0.00015, NZDJPY: 0.020,
};

const n = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const px = (row, key, side = "bid") => n(row[side]?.[key]) ?? n(row[`${key}Price`]?.[side]) ?? n(row[key]?.[side]) ?? n(row[`${key}${side[0].toUpperCase()}${side.slice(1)}`]) ?? n(row[key]);
const timestampOf = (row) => {
  if (row.timestamp != null) return Date.parse(row.timestamp);
  if (row.snapshotTimeUTC != null) {
    const value = String(row.snapshotTimeUTC);
    return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  }
  return Date.parse(row.snapshotTime);
};

function load(file, symbol, endExclusive) {
  const dedup = new Map();
  const source = fs.readFileSync(file, "utf8");
  for (const line of source.split("\n")) {
    if (!line) continue;
    try {
      const raw = JSON.parse(line);
      const t = timestampOf(raw);
      if (!(t < endExclusive)) continue;
      const open = px(raw, "open"), high = px(raw, "high"), low = px(raw, "low"), close = px(raw, "close");
      const fallbackSpread = SPREAD[symbol];
      const askOpen = px(raw, "open", "ask") ?? (Number.isFinite(open) && Number.isFinite(fallbackSpread) ? open + fallbackSpread : null);
      const askHigh = px(raw, "high", "ask") ?? (Number.isFinite(high) && Number.isFinite(fallbackSpread) ? high + fallbackSpread : null);
      const askLow = px(raw, "low", "ask") ?? (Number.isFinite(low) && Number.isFinite(fallbackSpread) ? low + fallbackSpread : null);
      const askClose = px(raw, "close", "ask") ?? (Number.isFinite(close) && Number.isFinite(fallbackSpread) ? close + fallbackSpread : null);
      if ([t, open, high, low, close, askOpen, askHigh, askLow, askClose].every(Number.isFinite)) {
        dedup.set(t, { t, open, high, low, close, askOpen, askHigh, askLow, askClose, volume: n(raw.volume) ?? 0 });
      }
    } catch {}
  }
  return { rows: [...dedup.values()].sort((a, b) => a.t - b.t), sha256: crypto.createHash("sha256").update(source).digest("hex") };
}

export function discoverSymbols(datasetDir) {
  if (!fs.existsSync(datasetDir)) return [];
  const available = new Set(fs.readdirSync(datasetDir).map((file) => file.match(/^(.+)_M1\.jsonl$/)?.[1]).filter(Boolean));
  return [...available].filter((symbol) => Object.keys(TF).every((tf) => fs.existsSync(path.join(datasetDir, `${symbol}_${tf}.jsonl`)))).sort();
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

function fxTradingDayKey(timestamp) {
  const date = new Date(timestamp);
  // FX reopens late on Sunday UTC. Attribute that activity to Monday so a
  // five-day trading-week denominator cannot exceed 100% at fold boundaries.
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const SESSION_TIME_FORMATTERS = Object.freeze({
  london: new Intl.DateTimeFormat("en-US", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }),
  newYork: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }),
});
const SESSION_BOUNDARY_CACHE = new Map();

function timeZoneOffsetMinutes(timestamp, formatter) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((representedAsUtc - timestamp) / MINUTE);
}

function zonedClock(timestamp, formatter) {
  return Object.fromEntries(formatter.formatToParts(new Date(timestamp))
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

function sessionBoundaries(timestamp) {
  const date = new Date(timestamp), key = date.toISOString().slice(0, 10);
  if (SESSION_BOUNDARY_CACHE.has(key)) return SESSION_BOUNDARY_CACHE.get(key);
  const anchor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12);
  const londonOffset = timeZoneOffsetMinutes(anchor, SESSION_TIME_FORMATTERS.london);
  const newYorkOffset = timeZoneOffsetMinutes(anchor, SESSION_TIME_FORMATTERS.newYork);
  const boundaries = {
    londonOpen: 8 * 60 - londonOffset,
    newYorkOpen: 8 * 60 - newYorkOffset,
    londonClose: 17 * 60 - londonOffset,
    newYorkClose: 17 * 60 - newYorkOffset,
  };
  SESSION_BOUNDARY_CACHE.set(key, boundaries);
  return boundaries;
}

function passesResearchFilters(event, config) {
  if (config.weekdaysOnly) { const day = new Date(`${fxTradingDayKey(event.t)}T00:00:00.000Z`).getUTCDay(); if (day === 0 || day === 6) return false; }
  if (config.allowedSessions?.length && !config.allowedSessions.includes(event.session)) return false;
  if (config.minAtrPct != null && event.atrPct < config.minAtrPct) return false;
  if (config.maxAtrPct != null && event.atrPct > config.maxAtrPct) return false;
  if (config.minBbWidthPct != null && event.bbWidthPct < config.minBbWidthPct) return false;
  if (config.minEmaDistPct != null && event.emaDistPct < config.minEmaDistPct) return false;
  return true;
}

function marketSession(timestamp) {
  const date = new Date(timestamp);
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  const { londonOpen, newYorkOpen, londonClose, newYorkClose } = sessionBoundaries(timestamp);
  if (minute < londonOpen) return "asia";
  if (minute < newYorkOpen) return "london";
  if (minute < londonClose) return "overlap";
  if (minute < newYorkClose) return "newYork";
  return "offHours";
}

function currencyGroup(symbol) {
  if (["EURUSD", "GBPUSD", "EURGBP"].includes(symbol)) return "europe";
  if (["USDJPY", "EURJPY", "AUDJPY", "NZDJPY"].includes(symbol)) return "jpy";
  if (["AUDUSD", "NZDUSD"].includes(symbol)) return "commodity";
  return "cad";
}

function entryConfigFor(event, config) {
  // The event is labelled from the closed signal candle. Recomputing from
  // the decision timestamp shifts exact session-boundary closes into the next
  // session even though every causal feature belongs to the prior candle.
  const session = event.session ?? marketSession(event.t);
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
  const pairSessionProfile = config.pairSessionProfiles?.[event.symbol]?.[session];
  if (pairSessionProfile) {
    resolved = { ...resolved, ...pairSessionProfile, enabled: resolved.enabled !== false && pairSessionProfile.enabled !== false };
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

function continuationCandle(rows, index, side, pullbackBars) {
  if (index < pullbackBars + 1) return false;
  const followsDirection = (row) => side === "buy" ? row.close > row.open : row.close < row.open;
  const opposesDirection = (row) => side === "buy" ? row.close < row.open : row.close > row.open;
  if (!followsDirection(rows[index]) || !followsDirection(rows[index - pullbackBars - 1])) return false;
  for (let i = index - pullbackBars; i < index; i += 1) {
    if (!opposesDirection(rows[i])) return false;
  }
  return true;
}

// Causal formalization of the discretionary sequence: directional impulse,
// one to six opposite-colour pullback candles, then the first candle resuming
// the impulse. The earlier impulse extreme supplies the lower-high/higher-low
// comparison; no future candle participates.
function priceActionContinuation(rows, index, side) {
  const signal = rows[index];
  if (!signal?.atr) return null;
  const followsDirection = (row) => side === "buy" ? row.close > row.open : row.close < row.open;
  const opposesDirection = (row) => side === "buy" ? row.close < row.open : row.close > row.open;
  if (!followsDirection(signal)) return null;
  let pullbackBars = 0;
  for (let i = index - 1; i >= 0 && opposesDirection(rows[i]); i -= 1) pullbackBars += 1;
  if (pullbackBars < 1 || pullbackBars > 6) return null;
  const impulseEnd = index - pullbackBars - 1;
  if (impulseEnd < 8 || !followsDirection(rows[impulseEnd])) return null;
  let impulseStart = impulseEnd;
  while (impulseStart > 0 && impulseEnd - impulseStart < 5 && followsDirection(rows[impulseStart - 1])) impulseStart -= 1;
  // Six hours of M15 context is long enough to retain the prior visible swing
  // that a discretionary trader compares with the new correction peak.
  const impulseContext = rows.slice(Math.max(0, impulseStart - 24), impulseEnd + 1);
  const impulseBars = rows.slice(impulseStart, impulseEnd + 1);
  const pullback = rows.slice(impulseEnd + 1, index);
  const atr = signal.atr;
  if (side === "sell") {
    const priorSwing = Math.max(...impulseContext.map((row) => row.high));
    const impulseExtreme = Math.min(...impulseBars.map((row) => row.low));
    const pullbackExtreme = Math.max(...pullback.map((row) => row.high));
    const impulseAtr = (priorSwing - impulseExtreme) / atr;
    return { pullbackBars, impulseAtr, swingGapAtr: (priorSwing - pullbackExtreme) / atr,
      retrace: impulseAtr > 0 ? (pullbackExtreme - impulseExtreme) / (priorSwing - impulseExtreme) : null,
      signalBodyAtr: Math.abs(signal.close - signal.open) / atr };
  }
  const priorSwing = Math.min(...impulseContext.map((row) => row.low));
  const impulseExtreme = Math.max(...impulseBars.map((row) => row.high));
  const pullbackExtreme = Math.min(...pullback.map((row) => row.low));
  const impulseAtr = (impulseExtreme - priorSwing) / atr;
  return { pullbackBars, impulseAtr, swingGapAtr: (pullbackExtreme - priorSwing) / atr,
    retrace: impulseAtr > 0 ? (impulseExtreme - pullbackExtreme) / (impulseExtreme - priorSwing) : null,
    signalBodyAtr: Math.abs(signal.close - signal.open) / atr };
}

function confirmedPivots(rows, index, kind, width = 2, lookback = 32) {
  const values = [], field = kind === "high" ? "high" : "low";
  for (let i = index - width; i >= Math.max(width, index - lookback) && values.length < 2; i -= 1) {
    const value = rows[i][field];
    let pivot = true;
    for (let offset = 1; offset <= width; offset += 1) {
      const invalid = kind === "high"
        ? value < rows[i - offset][field] || value < rows[i + offset][field]
        : value > rows[i - offset][field] || value > rows[i + offset][field];
      if (invalid) { pivot = false; break; }
    }
    if (pivot) values.push({ index: i, value });
  }
  return values;
}

function h1PriceStructure(rows, index, side) {
  const row = rows[index];
  if (!row?.atr || index < 10) return { pullback: false, trend: false, gapAtr: null };
  const highs = confirmedPivots(rows, index, "high"), lows = confirmedPivots(rows, index, "low");
  const priceDirection = (side === "buy" ? 1 : -1) * closedPriceTrend(rows, index, 2) >= 0;
  if (side === "sell") {
    const lowerHigh = highs.length >= 2 && highs[0].value < highs[1].value;
    const lowerLow = lows.length >= 2 && lows[0].value < lows[1].value;
    return { pullback: lowerHigh && priceDirection, trend: lowerHigh && lowerLow && priceDirection,
      gapAtr: highs.length >= 2 ? (highs[1].value - highs[0].value) / row.atr : null };
  }
  const higherLow = lows.length >= 2 && lows[0].value > lows[1].value;
  const higherHigh = highs.length >= 2 && highs[0].value > highs[1].value;
  return { pullback: higherLow && priceDirection, trend: higherLow && higherHigh && priceDirection,
    gapAtr: lows.length >= 2 ? (lows[0].value - lows[1].value) / row.atr : null };
}

function closedPriceTrend(rows, index, lookback) {
  const row = rows[index], previous = rows[index - lookback];
  if (!row || !previous || !(row.atr > 0)) return 0;
  return (row.close - previous.close) / row.atr;
}

function closedBodyTrend(rows, index) {
  const row = rows[index];
  if (!row || !(row.atr > 0)) return 0;
  return (row.close - row.open) / row.atr;
}

export function prepare(datasetDir, requestedSymbols = DEFAULT_SYMBOLS, options = {}) {
  if (!datasetDir) throw new Error("A dataset directory is required.");
  const protocol = options.protocol ?? RESEARCH_PROTOCOL;
  const symbols = [...new Set(requestedSymbols.map((symbol) => String(symbol).toUpperCase()))];
  if (!symbols.length) throw new Error("At least one symbol is required.");
  const available = new Set(discoverSymbols(datasetDir));
  const missing = symbols.filter((symbol) => !available.has(symbol));
  if (missing.length) throw new Error(`Incomplete OHLCV files for: ${missing.join(", ")}. Expected SYMBOL_{M1,M5,M15,H1,H4}.jsonl.`);
  const endExclusive = Date.parse(protocol.evaluationEndExclusive);
  const minimumCoverageEnd = Date.parse(protocol.minimumCoverageEnd);
  const data = new Map();
  const sourceHashes = new Map();
  for (const symbol of symbols) {
    const frames = {};
    const hashes = {};
    for (const tf of Object.keys(TF)) {
      const loaded = load(path.join(datasetDir, `${symbol}_${tf}.jsonl`), symbol, endExclusive);
      frames[tf] = enrich(loaded.rows);
      hashes[tf] = loaded.sha256;
      if (frames[tf].length < 202) throw new Error(`${symbol}_${tf}.jsonl has only ${frames[tf].length} usable rows before the fixed evaluation cutoff.`);
      if (frames[tf].at(-1).t < minimumCoverageEnd) throw new Error(`${symbol}_${tf}.jsonl ends at ${new Date(frames[tf].at(-1).t).toISOString()}, before required validation coverage ${protocol.minimumCoverageEnd}.`);
    }
    data.set(symbol, frames);
    sourceHashes.set(symbol, hashes);
  }
  const coverage = Object.fromEntries([...data].map(([symbol, frames]) => [symbol, Object.fromEntries(Object.entries(frames).map(([tf, rows]) => [tf, {
    rows: rows.length,
    first: new Date(rows[0].t).toISOString(),
    last: new Date(rows.at(-1).t).toISOString(),
    sha256: sourceHashes.get(symbol)[tf],
  }]))]));
  const start = Math.max(...[...data.values()].map((f) => f.M1[0].t));
  const end = Math.min(...[...data.values()].map((f) => f.M1.at(-1).t));
  const events = [];
  for (const [symbol, f] of data) {
    let dayKey = null, dayStart = 0, dayOpen = null, dayHigh = -Infinity, dayLow = Infinity, openingHigh = -Infinity, openingLow = Infinity;
    let activeSession = null, sessionOpen = null, sessionHigh = -Infinity, sessionLow = Infinity, sessionLast = null, sessionStartedAt = null;
    let lastCompletedSession = null, beforeLastCompletedSession = null;
    // The video's intraday examples distinguish the pre-Frankfurt Asian
    // range from Frankfurt's first hour. Keep those causal ranges in London
    // local time so DST does not silently move the setup by one hour.
    let londonTradingDate = null;
    let asiaRange = null, frankfurtRange = null;
    let asiaSweeps = { buy: null, sell: null }, frankfurtSweeps = { buy: null, sell: null };
    for (let i = 200; i < f.M1.length - 1; i += 1) {
      const m1 = f.M1[i], decision = m1.t + MINUTE;
      const session = marketSession(m1.t);
      const london = zonedClock(m1.t, SESSION_TIME_FORMATTERS.london);
      const localDate = `${london.year}-${String(london.month).padStart(2, "0")}-${String(london.day).padStart(2, "0")}`;
      const localMinute = london.hour * 60 + london.minute;
      if (localDate !== londonTradingDate) {
        londonTradingDate = localDate;
        asiaRange = null; frankfurtRange = null;
        asiaSweeps = { buy: null, sell: null }; frankfurtSweeps = { buy: null, sell: null };
      }
      const extendRange = (range) => range == null
        ? { high: m1.high, askHigh: m1.askHigh, low: m1.low, askLow: m1.askLow }
        : { high: Math.max(range.high, m1.high), askHigh: Math.max(range.askHigh, m1.askHigh),
            low: Math.min(range.low, m1.low), askLow: Math.min(range.askLow, m1.askLow) };
      // Asia 00:00-07:00 and Frankfurt 07:00-08:00 Europe/London. This is an
      // explicit research convention, not a claim that every chart vendor
      // uses identical labels.
      if (localMinute < 7 * 60) asiaRange = extendRange(asiaRange);
      else if (localMinute < 8 * 60) frankfurtRange = extendRange(frankfurtRange);
      else if (localMinute < 12 * 60) {
        const updateSweeps = (range, sweeps) => {
          if (!range) return;
          if (m1.low < range.low) {
            const previous = sweeps.buy;
            sweeps.buy = { t: m1.t, extreme: previous ? Math.min(previous.extreme, m1.low) : m1.low,
              rejectedAt: m1.close > range.low ? m1.t : null };
          } else if (sweeps.buy && sweeps.buy.rejectedAt == null && m1.close > range.low) sweeps.buy.rejectedAt = m1.t;
          if (m1.askHigh > range.askHigh) {
            const previous = sweeps.sell;
            sweeps.sell = { t: m1.t, extreme: previous ? Math.max(previous.extreme, m1.askHigh) : m1.askHigh,
              rejectedAt: m1.askClose < range.askHigh ? m1.t : null };
          } else if (sweeps.sell && sweeps.sell.rejectedAt == null && m1.askClose < range.askHigh) sweeps.sell.rejectedAt = m1.t;
        };
        updateSweeps(asiaRange, asiaSweeps);
        updateSweeps(frankfurtRange, frankfurtSweeps);
      }
      if (session === "offHours") {
        if (activeSession) {
          beforeLastCompletedSession = lastCompletedSession;
          lastCompletedSession = { name: activeSession, open: sessionOpen, close: sessionLast.close, high: sessionHigh, low: sessionLow, endedAt: sessionLast.t };
          activeSession = null;
        }
      } else if (session !== activeSession) {
        if (activeSession) {
          beforeLastCompletedSession = lastCompletedSession;
          lastCompletedSession = { name: activeSession, open: sessionOpen, close: sessionLast.close, high: sessionHigh, low: sessionLow, endedAt: sessionLast.t };
        }
        activeSession = session; sessionOpen = m1.open; sessionHigh = m1.high; sessionLow = m1.low; sessionLast = m1; sessionStartedAt = m1.t;
      } else {
        sessionHigh = Math.max(sessionHigh, m1.high); sessionLow = Math.min(sessionLow, m1.low); sessionLast = m1;
      }
      const nextDayKey = new Date(m1.t).toISOString().slice(0, 10);
      if (nextDayKey !== dayKey) {
        dayKey = nextDayKey; dayStart = i; dayOpen = m1.open; dayHigh = m1.high; dayLow = m1.low; openingHigh = m1.high; openingLow = m1.low;
      } else {
        dayHigh = Math.max(dayHigh, m1.high); dayLow = Math.min(dayLow, m1.low);
        if (i - dayStart < 60) { openingHigh = Math.max(openingHigh, m1.high); openingLow = Math.min(openingLow, m1.low); }
      }
      if (decision < start || decision > end || decision % TF.M15 !== 0) continue;
      const frameIndexes = {
        M1: i,
        M5: atOrBefore(f.M5, decision - TF.M5),
        M15: atOrBefore(f.M15, decision - TF.M15),
        H1: atOrBefore(f.H1, decision - TF.H1),
        H4: atOrBefore(f.H4, decision - TF.H4),
        D1: atOrBefore(f.D1, decision - TF.D1),
      };
      const { M5: i5, M15: i15, H1: i60, H4: i240, D1: iD1 } = frameIndexes;
      // D1 has only six-plus months of evaluation history. Requiring the
      // 200-period D1 feature would erase the train fold; shorter causal D1
      // components remain available after the established 50-bar warm-up.
      if (i5 < 200 || i15 < 200 || i60 < 200 || i240 < 200 || iD1 < 50) continue;
      const m5 = f.M5[i5], m15 = f.M15[i15], h1 = f.H1[i60], h4 = f.H4[i240], d1 = f.D1[iD1];
      if (![m1.atr, m15.atr, h1.atr, h4.atr, d1.atr].every((x) => x != null)) continue;
      const signalFields = {};
      let hasSignal = false;
      for (const tf of Object.keys(TF)) {
        const index = frameIndexes[tf], row = f[tf][index];
        const closedNow = decision === row.t + TF[tf];
        const buy1 = closedNow && continuationCandle(f[tf], index, "buy", 1);
        const sell1 = closedNow && continuationCandle(f[tf], index, "sell", 1);
        const buy2 = closedNow && continuationCandle(f[tf], index, "buy", 2);
        const sell2 = closedNow && continuationCandle(f[tf], index, "sell", 2);
        signalFields[`buy${tf}GreenRed1`] = buy1;
        signalFields[`sell${tf}GreenRed1`] = sell1;
        signalFields[`buy${tf}GreenRed2`] = buy2;
        signalFields[`sell${tf}GreenRed2`] = sell2;
        signalFields[`buy${tf}GreenRed`] = buy1 || buy2;
        signalFields[`sell${tf}GreenRed`] = sell1 || sell2;
        signalFields[`${tf}SignalOpen`] = row.open;
        signalFields[`${tf}SignalHigh`] = row.high;
        signalFields[`${tf}SignalLow`] = row.low;
        signalFields[`${tf}SignalClose`] = row.close;
        signalFields[`${tf}SignalAskHigh`] = row.askHigh;
        signalFields[`${tf}SignalAskLow`] = row.askLow;
        signalFields[`${tf}SignalAskClose`] = row.askClose;
        signalFields[`${tf}SignalAtr`] = row.atr;
        signalFields[`${tf}BodyTrendAtr`] = closedBodyTrend(f[tf], index);
        signalFields[`${tf}CloseTrend1Atr`] = closedPriceTrend(f[tf], index, 1);
        signalFields[`${tf}CloseTrend2Atr`] = closedPriceTrend(f[tf], index, 2);
        signalFields[`${tf}CloseTrend3Atr`] = closedPriceTrend(f[tf], index, 3);
        signalFields[`buy${tf}Score`] = frameScore(f[tf], index, "buy");
        signalFields[`sell${tf}Score`] = frameScore(f[tf], index, "sell");
        signalFields[`buy${tf}Mask`] = frameMask(f[tf], index, "buy");
        signalFields[`sell${tf}Mask`] = frameMask(f[tf], index, "sell");
        hasSignal ||= buy1 || sell1 || buy2 || sell2;
      }
      const buyM15PriceAction = priceActionContinuation(f.M15, i15, "buy");
      const sellM15PriceAction = priceActionContinuation(f.M15, i15, "sell");
      const buyH1Structure = h1PriceStructure(f.H1, i60, "buy");
      const sellH1Structure = h1PriceStructure(f.H1, i60, "sell");
      for (const [side, setup] of [["buy", buyM15PriceAction], ["sell", sellM15PriceAction]]) {
        signalFields[`${side}M15PriceAction`] = Boolean(setup);
        signalFields[`${side}M15PullbackBars`] = setup?.pullbackBars ?? 0;
        signalFields[`${side}M15ImpulseAtr`] = setup?.impulseAtr ?? null;
        signalFields[`${side}M15SwingGapAtr`] = setup?.swingGapAtr ?? null;
        signalFields[`${side}M15Retrace`] = setup?.retrace ?? null;
        signalFields[`${side}M15SignalBodyAtr`] = setup?.signalBodyAtr ?? null;
      }
      for (const [side, structure] of [["buy", buyH1Structure], ["sell", sellH1Structure]]) {
        signalFields[`${side}H1PullbackStructure`] = structure.pullback;
        signalFields[`${side}H1TrendStructure`] = structure.trend;
        signalFields[`${side}H1SwingGapAtr`] = structure.gapAtr;
      }
      signalFields.M15SpreadAtr = Math.max(0, m15.askClose - m15.close) / m15.atr;
      for (const [prefix, range, sweeps] of [["Asia", asiaRange, asiaSweeps], ["Frankfurt", frankfurtRange, frankfurtSweeps]]) {
        for (const side of ["buy", "sell"]) {
          const sweep = sweeps[side];
          signalFields[`${side}${prefix}Sweep`] = Boolean(sweep?.rejectedAt != null);
          signalFields[`${side}${prefix}SweepAgeMinutes`] = sweep ? (decision - sweep.t) / MINUTE : null;
          signalFields[`${side}${prefix}RejectionAgeMinutes`] = sweep?.rejectedAt != null ? (decision - sweep.rejectedAt) / MINUTE : null;
          signalFields[`${side}${prefix}SweepDepthAtr`] = sweep && range
            ? (side === "buy" ? range.low - sweep.extreme : sweep.extreme - range.askHigh) / m15.atr : null;
          signalFields[`${side}${prefix}SweepStop`] = sweep?.extreme ?? null;
          signalFields[`${side}${prefix}SweepTarget`] = range
            ? (side === "buy" ? range.high : range.askLow) : null;
        }
      }
      signalFields.londonLocalMinute = localMinute;
      hasSignal ||= Boolean(buyM15PriceAction || sellM15PriceAction);
      if (!hasSignal) continue;
      const buyGreenRed1 = signalFields.buyM1GreenRed1, sellGreenRed1 = signalFields.sellM1GreenRed1;
      const buyGreenRed2 = signalFields.buyM1GreenRed2, sellGreenRed2 = signalFields.sellM1GreenRed2;
      const buyGreenRedAny = signalFields.buyM1GreenRed, sellGreenRedAny = signalFields.sellM1GreenRed;
      events.push({ t: decision, symbol, next: i + 1, atr: m15.atr, m1Atr: m1.atr, signalClose: m1.close, signalAskClose: m1.askClose,
        spread: Math.max(0, m1.askClose - m1.close),
        session,
        h1BodyTrendAtr: closedBodyTrend(f.H1, i60),
        h4BodyTrendAtr: closedBodyTrend(f.H4, i240),
        d1BodyTrendAtr: closedBodyTrend(f.D1, iD1),
        h1CloseTrend1Atr: closedPriceTrend(f.H1, i60, 1), h1CloseTrend2Atr: closedPriceTrend(f.H1, i60, 2), h1CloseTrend3Atr: closedPriceTrend(f.H1, i60, 3),
        h4CloseTrend1Atr: closedPriceTrend(f.H4, i240, 1), h4CloseTrend2Atr: closedPriceTrend(f.H4, i240, 2), h4CloseTrend3Atr: closedPriceTrend(f.H4, i240, 3),
        d1CloseTrend1Atr: closedPriceTrend(f.D1, iD1, 1), d1CloseTrend2Atr: closedPriceTrend(f.D1, iD1, 2), d1CloseTrend3Atr: closedPriceTrend(f.D1, iD1, 3),
        buyGreenRed1, sellGreenRed1, buyGreenRed2, sellGreenRed2, buyGreenRedAny, sellGreenRedAny,
        ...signalFields,
      });
    }
    f.M1 = f.M1.map(({ t, open, high, low, close, askOpen, askHigh, askLow, askClose }) => ({ t, open, high, low, close, askOpen, askHigh, askLow, askClose })); f.M5 = []; f.M15 = []; f.H1 = []; f.H4 = []; f.D1 = [];
  }
  events.sort((a, b) => a.t - b.t || symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol));
  if (!events.length) throw new Error("The fixed research window produced no causal signal events.");
  return { data, events, start: events[0].t, end: Math.min(end, endExclusive - 1), symbols, coverage, protocol, strictWindow: options.strictWindow === true };
}

export function validateCandidateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Candidate config must be an object.");
  const allowedMethods = new Set(["custom", "additive", "weighted", "gated", "scoring-gated", "scoring-weighted", "mtf-majority", "mtf-strict", "mtf-weighted"]);
  if (!allowedMethods.has(config.method)) throw new Error(`Unsupported method: ${config.method}`);
  const positive = ["hold", "stopATR", "cooldown", "maxDaily", "maxPositions"];
  for (const key of positive) {
    if (!Number.isFinite(config[key]) || config[key] < (key === "cooldown" ? 0 : 1)) throw new Error(`${key} must be a valid ${key === "cooldown" ? "non-negative" : "positive"} number.`);
  }
  const rewardRisk = config.rewardRisk ?? (Number.isFinite(config.tpATR) ? config.tpATR / config.stopATR : null);
  if (!(rewardRisk > 0 && rewardRisk <= 20)) throw new Error("Set rewardRisk or tpATR to a valid positive exit multiple.");
  if (config.maxPositions > 6) throw new Error("Autoresearch caps maxPositions at 6; portfolio policy belongs in the later harness stage.");
  if (!Number.isFinite(config.riskPct) || config.riskPct <= 0 || config.riskPct > RESEARCH_PROTOCOL.risk.maxPerPositionPct) throw new Error(`riskPct must be in (0, ${RESEARCH_PROTOCOL.risk.maxPerPositionPct}].`);
  if (config.marginUtilization != null && (!Number.isFinite(config.marginUtilization) || config.marginUtilization <= 0 || config.marginUtilization > RESEARCH_PROTOCOL.risk.marginUtilization)) throw new Error(`marginUtilization must be in (0, ${RESEARCH_PROTOCOL.risk.marginUtilization}].`);
  if (config.startCapital != null && config.startCapital !== RESEARCH_PROTOCOL.startCapital) throw new Error(`startCapital is fixed at ${RESEARCH_PROTOCOL.startCapital} during candidate selection.`);
  if (config.capitalMode === "compound") throw new Error("Compounding is disabled during candidate selection; compare signal quality at fixed sizing.");
  if (config.sessionWindows && (!Array.isArray(config.sessionWindows) || config.sessionWindows.some((window) => !Array.isArray(window) || window.length !== 2 || window.some((value) => !Number.isFinite(value) || value < 0 || value > 1440)))) {
    throw new Error("sessionWindows must contain [startMinuteUtc, endMinuteUtc] pairs in the 0..1440 range.");
  }
  if (config.dailyCloseMinuteUtc != null && (!Number.isFinite(config.dailyCloseMinuteUtc) || config.dailyCloseMinuteUtc < 0 || config.dailyCloseMinuteUtc > 1440)) throw new Error("dailyCloseMinuteUtc must be in the 0..1440 range.");
  for (const key of ["maxLossesPerSymbolDay", "maxLossesPerSymbolSession"]) {
    if (config[key] != null && (!Number.isInteger(config[key]) || config[key] < 1)) throw new Error(`${key} must be a positive integer when set.`);
  }
  if (config.maxTotalPerSession != null && (!Number.isInteger(config.maxTotalPerSession) || config.maxTotalPerSession < 1)) throw new Error("maxTotalPerSession must be a positive integer when set.");
  if (["continuation", "pullback", "adaptive-pending", "signal-breakout"].includes(config.entryMode)) {
    if (!(Number.isFinite(config.pendingOffsetAtr) && config.pendingOffsetAtr >= 0)) throw new Error("Pending entry modes require pendingOffsetAtr >= 0.");
    if (!(Number.isFinite(config.pendingExpiryMinutes) && config.pendingExpiryMinutes > 0)) throw new Error("Pending entry modes require pendingExpiryMinutes > 0.");
  }
  const runnerModes = new Set(["none", "always", "fast-1r", "signal-body"]);
  if (config.runnerMode != null && !runnerModes.has(config.runnerMode)) throw new Error(`Unsupported runnerMode: ${config.runnerMode}`);
  if (config.trailR != null && (!Number.isFinite(config.trailR) || config.trailR < 0)) throw new Error("trailR must be a non-negative R multiple.");
  if (config.runnerMode === "fast-1r" && (!Number.isFinite(config.runnerFastMinutes) || config.runnerFastMinutes <= 0)) throw new Error("fast-1r runners require runnerFastMinutes > 0.");
  if (config.runnerMode === "signal-body" && (!Number.isFinite(config.runnerSignalBodyAtr) || config.runnerSignalBodyAtr <= 0)) throw new Error("signal-body runners require runnerSignalBodyAtr > 0.");
  return { rewardRisk };
}

export function evaluate(prepared, c) {
  validateCandidateConfig(c);
  const { data, events, start, end, symbols } = prepared;
  const protocol = prepared.protocol ?? RESEARCH_PROTOCOL;
  const inProtocolWindow = (timestamp) => {
    const week = isoWeek(timestamp);
    return week >= protocol.train.fromWeek && week <= protocol.validation.toWeek;
  };
  const candidateSymbols = c.symbols?.length ? new Set(c.symbols) : null;
  const staticSessionWindows = c.sessionWindows?.length && !c.sessionProfiles && !c.pairSessionProfiles ? c.sessionWindows : null;
  const simulationEvents = (prepared.strictWindow || candidateSymbols || staticSessionWindows)
    ? events.filter((event) => (!prepared.strictWindow || inProtocolWindow(event.t)) && (!candidateSymbols || candidateSymbols.has(event.symbol)) && (!staticSessionWindows || inSessionWindows(event.t, staticSessionWindows)))
    : events;
  if (!simulationEvents.length) throw new Error("The requested evaluation window produced no causal signal events.");
  const simulationStart = prepared.strictWindow ? simulationEvents[0].t : start;
  const startCapital = protocol.startCapital;
  let balance = startCapital, peak = startCapital, maxDD = 0, maxDDPct = 0, maxOpenRiskPct = 0, maxPositionRiskPct = 0, maxMarginUsagePct = 0, maxPositionMarginPct = 0, entrySequence = 0; const positions = [], pendingOrders = [], trades = [], lastClose = new Map(), dayCount = new Map(), totalDayCount = new Map(), sessionDayCount = new Map(), symbolDayLosses = new Map(), symbolSessionLosses = new Map();
  const midAt = (symbol, timestamp) => {
    const rows = data.get(symbol)?.M1;
    if (!rows?.length) return null;
    const index = atOrBefore(rows, timestamp);
    if (index < 0) return null;
    const row = rows[index];
    return (row.close + row.askClose) / 2;
  };
  const quotePerEurAt = (symbol, timestamp) => {
    const quote = String(symbol).slice(3, 6);
    if (quote === "EUR") return 1;
    const direct = midAt(`EUR${quote}`, timestamp);
    if (Number.isFinite(direct) && direct > 0) return direct;
    if (quote === "CAD") {
      const eurUsd = midAt("EURUSD", timestamp), usdCad = midAt("USDCAD", timestamp);
      if (Number.isFinite(eurUsd) && eurUsd > 0 && Number.isFinite(usdCad) && usdCad > 0) return eurUsd * usdCad;
    }
    return null;
  };
  const recordOpenRisk = (openedPosition) => {
    const riskCapital = Math.min(startCapital, Math.max(balance, 0));
    const openRisk = positions.reduce((sum, position) => sum + position.risk, 0);
    maxOpenRiskPct = Math.max(maxOpenRiskPct, riskCapital > 0 ? openRisk / riskCapital : 1);
    maxPositionRiskPct = Math.max(maxPositionRiskPct, openedPosition.risk / openedPosition.riskCapitalAtEntry);
    const openMargin = positions.reduce((sum, position) => sum + position.margin, 0);
    maxMarginUsagePct = Math.max(maxMarginUsagePct, riskCapital > 0 ? openMargin / riskCapital : 1);
    maxPositionMarginPct = Math.max(maxPositionMarginPct, openedPosition.margin / openedPosition.riskCapitalAtEntry);
  };
  const close = (p, t, price, reason, closeSize = p.size, final = true) => {
    const quotePerEur = quotePerEurAt(p.symbol, t) ?? p.quotePerEur;
    const pnlQuote = (p.side === "buy" ? price - p.entry : p.entry - price) * closeSize;
    const pnl = pnlQuote / quotePerEur;
    p.realizedPnl += pnl; balance += pnl; peak = Math.max(peak, balance);
    maxDD = Math.max(maxDD, peak - balance); maxDDPct = Math.max(maxDDPct, 100 * (peak - balance) / Math.max(peak, 1));
    trades.push({ t, opened: p.opened, symbol: p.symbol, side: p.side, pnl, r: pnl / p.initialRiskEur, reason, balanceAfter: balance, session: p.session, regime: p.regime, entryId: p.id });
    if (final) {
      if (p.realizedPnl < 0) {
        const openedDay = new Date(p.opened).toISOString().slice(0, 10);
        const dayLossKey = `${openedDay}:${p.symbol}`, sessionLossKey = `${openedDay}:${p.session}:${p.symbol}`;
        symbolDayLosses.set(dayLossKey, (symbolDayLosses.get(dayLossKey) ?? 0) + 1);
        symbolSessionLosses.set(sessionLossKey, (symbolSessionLosses.get(sessionLossKey) ?? 0) + 1);
      }
      positions.splice(positions.indexOf(p), 1); lastClose.set(p.symbol, t);
    } else {
      const originalSize = p.size; p.size -= closeSize; p.margin *= p.size / originalSize;
    }
  };
  const buildPosition = ({ event, config, side, entry, opened, next, session, regime }) => {
    const signalFrame = config.signalTimeframe ?? "M15";
    const signalAtr = event[`${signalFrame}SignalAtr`] ?? event.atr;
    const buffer = (config.stopBufferAtr ?? 0) * signalAtr;
    const eventStop = config.stopEventPrefix ? event[`${side}${config.stopEventPrefix}Stop`] : null;
    const candleStop = side === "buy" ? event[`${signalFrame}SignalLow`] - buffer : event[`${signalFrame}SignalAskHigh`] + buffer;
    const atrStop = side === "buy" ? entry - config.stopATR * event.atr : entry + config.stopATR * event.atr;
    const stop = config.stopMode === "event-level" && Number.isFinite(eventStop)
      ? (side === "buy" ? eventStop - buffer : eventStop + buffer)
      : config.stopMode === "signal-candle" ? candleStop : atrStop;
    const dist = side === "buy" ? entry - stop : stop - entry;
    if (!(Number.isFinite(dist) && dist > 0)) return null;
    const rewardRisk = config.rewardRisk ?? config.tpATR / config.stopATR;
    const eventTarget = config.targetEventPrefix ? event[`${side}${config.targetEventPrefix}Target`] : null;
    const target = config.partialRunner ? (side === "buy" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      : config.targetMode === "event-level" && Number.isFinite(eventTarget) ? eventTarget
      : side === "buy" ? entry + rewardRisk * dist : entry - rewardRisk * dist;
    if (!(side === "buy" ? target > entry : target < entry)) return null;
    const sizingCapital = Math.min(startCapital, Math.max(balance, 0));
    const quotePerEur = quotePerEurAt(event.symbol, opened);
    if (!(Number.isFinite(quotePerEur) && quotePerEur > 0)) return null;
    const usedRisk = positions.reduce((sum, position) => sum + position.risk, 0);
    const maxRisk = sizingCapital * Math.min(config.riskPct, protocol.risk.maxPerPositionPct);
    const availableRisk = Math.max(0, sizingCapital * protocol.risk.maxPortfolioPct - usedRisk);
    const riskBudget = Math.min(maxRisk, availableRisk);
    if (!(riskBudget > 0)) return null;
    const usedMargin = positions.reduce((sum, position) => sum + position.margin, 0);
    const marginUtilization = Math.min(config.marginUtilization ?? protocol.risk.marginUtilization, protocol.risk.marginUtilization);
    const availableMargin = Math.max(0, Math.min(balance, sizingCapital) * marginUtilization - usedMargin);
    const perPositionMargin = Math.min(balance, sizingCapital) * marginUtilization / config.maxPositions;
    const marginBudget = Math.min(availableMargin, perPositionMargin);
    const leverage = MAJOR_FX.has(event.symbol) ? protocol.leverage.usdPairs : protocol.leverage.crosses;
    const riskSizedUnits = (riskBudget * quotePerEur) / dist;
    const marginSizedUnits = (marginBudget * leverage * quotePerEur) / entry;
    const size = Math.floor(Math.min(riskSizedUnits, marginSizedUnits) / 100) * 100;
    if (!(size >= 100)) return null;
    const margin = (size * entry) / quotePerEur / leverage;
    const risk = (dist * size) / quotePerEur;
    if (!(risk > 0 && risk <= maxRisk + 1e-9 && usedRisk + risk <= sizingCapital * protocol.risk.maxPortfolioPct + 1e-9)) return null;
    const openedDate = new Date(opened);
    const forcedCloseAt = Date.UTC(openedDate.getUTCFullYear(), openedDate.getUTCMonth(), openedDate.getUTCDate()) + (config.dailyCloseMinuteUtc ?? 22 * 60) * MINUTE;
    const signalBodyAtr = Math.abs((event[`${signalFrame}SignalClose`] ?? 0) - (event[`${signalFrame}SignalOpen`] ?? 0)) / Math.max(signalAtr, Number.EPSILON);
    return { id: entrySequence++, symbol: event.symbol, side, opened, entry, stop, target, size, initialSize: size, risk, initialRiskEur: risk, riskCapitalAtEntry: sizingCapital, quotePerEur, next, atr: event.atr,
      margin, trailBaseAtr: config.trailTimeframe === "m1" ? event.m1Atr : event.atr, stopDistance: dist,
      breakEvenR: config.breakEvenR ?? 0, trailATR: config.trailATR ?? 0, trailR: config.trailR ?? 0, breakEvenMoved: false,
      runnerMode: config.runnerMode ?? "none", runnerFastMinutes: config.runnerFastMinutes ?? 0,
      runnerSignalBodyAtr: config.runnerSignalBodyAtr ?? 0, signalBodyAtr, runnerActivated: false,
      partialR: config.partialR ?? 0, partialFraction: config.partialFraction ?? 0, moveStopOnPartial: config.moveStopOnPartial ?? false,
      partialRunner: config.partialRunner === true, partialTaken: false, realizedPnl: 0, rewardRisk, hold: config.hold, dailyFlat: config.dailyFlat === true, forcedCloseAt, session, regime };
  };
  const activatePending = (to) => {
    for (const order of [...pendingOrders]) {
      const rows = data.get(order.event.symbol).M1;
      let i = order.next;
      while (i < rows.length && rows[i].t <= to) {
        const bar = rows[i];
        if (bar.t > order.expiresAt) { pendingOrders.splice(pendingOrders.indexOf(order), 1); break; }
        const filled = order.kind === "continuation"
          ? (order.side === "buy" ? bar.askHigh >= order.level : bar.low <= order.level)
          : (order.side === "buy" ? bar.askLow <= order.level : bar.high >= order.level);
        const invalidated = order.invalidatesAt != null && (order.side === "buy" ? bar.low <= order.invalidatesAt : bar.askHigh >= order.invalidatesAt);
        // If invalidation happened on an earlier bar without an entry touch,
        // the discretionary setup no longer exists and the pending order is
        // cancelled. If both levels occur in one M1 bar, keep the fill and let
        // the conservative SL-first position replay handle the ambiguity.
        if (invalidated && !filled) { pendingOrders.splice(pendingOrders.indexOf(order), 1); break; }
        if (filled) {
          const day = new Date(bar.t).toISOString().slice(0, 10), key = `${day}:${order.event.symbol}`;
          const dayLossKey = `${day}:${order.event.symbol}`, sessionLossKey = `${day}:${order.session}:${order.event.symbol}`;
          const breakerOpen = (order.config.maxLossesPerSymbolDay && (symbolDayLosses.get(dayLossKey) ?? 0) >= order.config.maxLossesPerSymbolDay) ||
            (order.config.maxLossesPerSymbolSession && (symbolSessionLosses.get(sessionLossKey) ?? 0) >= order.config.maxLossesPerSymbolSession);
          const sessionDayKey = `${day}:${order.session}`;
          if (!breakerOpen && positions.length < order.config.maxPositions && !positions.some((position) => position.symbol === order.event.symbol) &&
              (dayCount.get(key) ?? 0) < order.config.maxDaily && (!order.config.maxTotalDaily || (totalDayCount.get(day) ?? 0) < order.config.maxTotalDaily) &&
              (!order.config.maxTotalPerSession || (sessionDayCount.get(sessionDayKey) ?? 0) < order.config.maxTotalPerSession)) {
            // The fill bar is evaluated conservatively as well. With OHLC data
            // we cannot prove that a stop/target touch happened after entry.
            const position = buildPosition({ event: order.event, config: order.config, side: order.side, entry: order.level, opened: bar.t, next: i, session: order.session, regime: order.regime });
            if (position) { positions.push(position); recordOpenRisk(position); dayCount.set(key, (dayCount.get(key) ?? 0) + 1); totalDayCount.set(day, (totalDayCount.get(day) ?? 0) + 1); sessionDayCount.set(sessionDayKey, (sessionDayCount.get(sessionDayKey) ?? 0) + 1); }
          }
          pendingOrders.splice(pendingOrders.indexOf(order), 1);
          break;
        }
        i += 1;
      }
      if (pendingOrders.includes(order)) order.next = i;
    }
  };
  const advance = (to) => { activatePending(to); for (const p of [...positions]) { const rows = data.get(p.symbol).M1; let i = p.next; while (i < rows.length && rows[i].t <= to) { const b = rows[i]; if (p.dailyFlat && b.t >= p.forcedCloseAt) { close(p, b.t, p.side === "buy" ? b.open : b.askOpen, "daily"); break; } const sl = p.side === "buy" ? b.low <= p.stop : b.askHigh >= p.stop; const tp = p.side === "buy" ? b.high >= p.target : b.askLow <= p.target; if (sl) { close(p, b.t, p.stop, p.runnerActivated ? "runner-trail" : p.breakEvenMoved ? "breakeven" : "sl"); break; } if (tp) { close(p, b.t, p.target, "tp"); break; }
      // Exit adjustments become active only on the following minute. This is
      // deliberately conservative: a single OHLC bar cannot tell which level
      // was touched first.
      const partialHit = !p.partialTaken && p.partialR > 0 && (p.side === "buy" ? b.high >= p.entry + p.partialR * p.stopDistance : b.askLow <= p.entry - p.partialR * p.stopDistance);
      if (partialHit) {
        const partialSize = Math.floor(p.size * p.partialFraction * 100) / 100;
        if (partialSize > 0 && partialSize < p.size) {
          const partialPrice = p.side === "buy" ? p.entry + p.partialR * p.stopDistance : p.entry - p.partialR * p.stopDistance;
          close(p, b.t, partialPrice, "partial", partialSize, false);
          p.partialTaken = true;
          if (p.moveStopOnPartial) p.stop = p.side === "buy" ? Math.max(p.stop, p.entry) : Math.min(p.stop, p.entry);
          if (p.partialRunner) { p.breakEvenMoved = true; p.runnerActivated = true; }
          i += 1;
          continue;
        }
        p.partialTaken = true;
      }
      const reachedBreakEven = !p.breakEvenMoved && p.breakEvenR > 0 && (p.side === "buy" ? b.high >= p.entry + p.breakEvenR * p.stopDistance : b.askLow <= p.entry - p.breakEvenR * p.stopDistance);
      if (reachedBreakEven) {
        const ageMinutes = (b.t + MINUTE - p.opened) / MINUTE;
        const runnerEligible = p.runnerMode === "always" ||
          (p.runnerMode === "fast-1r" && ageMinutes <= p.runnerFastMinutes) ||
          (p.runnerMode === "signal-body" && p.signalBodyAtr >= p.runnerSignalBodyAtr);
        if (runnerEligible) {
          p.stop = p.side === "buy" ? Math.max(p.stop, p.entry) : Math.min(p.stop, p.entry);
          p.target = p.side === "buy" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
          p.breakEvenMoved = true;
          p.runnerActivated = true;
        }
      }
      if (p.runnerActivated && p.trailR > 0) p.stop = p.side === "buy" ? Math.max(p.stop, b.high - p.trailR * p.stopDistance) : Math.min(p.stop, b.askLow + p.trailR * p.stopDistance);
      else if (p.breakEvenMoved && p.trailATR > 0) p.stop = p.side === "buy" ? Math.max(p.stop, b.high - p.trailATR * p.trailBaseAtr) : Math.min(p.stop, b.askLow + p.trailATR * p.trailBaseAtr);
      if (b.t >= p.opened + p.hold * MINUTE) { close(p, b.t, p.side === "buy" ? b.close : b.askClose, "time"); break; } i += 1; } if (positions.includes(p)) p.next = i; } };
  const pass = (e, side, config = c) => {
    if (typeof config.decide === "function") return Boolean(config.decide(e, side, config));
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
  // At one candle close several symbols can be eligible. Rank the configured
  // number of strongest setups so portfolio selection is not determined by
  // symbol iteration order.
  const rankedSignalAt = new Map();
  if (c.rankByScore) {
    for (const e of simulationEvents) {
      const entryPolicy = entryConfigFor(e, c), ec = entryPolicy.config;
      if (ec.enabled === false || !inSessionWindows(e.t, ec.sessionWindows) || !passesResearchFilters(e, ec) || (ec.symbols && !ec.symbols.includes(e.symbol)) || !(e.atr > 0)) continue;
      const buy = pass(e, "buy", ec), sell = pass(e, "sell", ec);
      if (!buy && !sell) continue;
      const rank = (side) => typeof ec.rank === "function"
        ? Number(ec.rank(e, side, ec))
        : e[`${side}Current`] * 100 +
          (e[`${side}M15`] + e[`${side}H1`] + e[`${side}H4Score`]) * 10 +
          e[`${side}Setup`] * 3 + e[`${side}Trigger`];
      const side = buy && sell ? (rank("buy") >= rank("sell") ? "buy" : "sell") : buy ? "buy" : "sell";
      const candidate = { event: e, side, rank: rank(side) };
      const current = rankedSignalAt.get(e.t) ?? [];
      current.push(candidate);
      rankedSignalAt.set(e.t, current);
    }
    const limit = Math.max(1, Math.min(c.maxPositions, c.rankAtTimestampLimit ?? 1));
    for (const [timestamp, candidates] of rankedSignalAt) {
      candidates.sort((a, b) => b.rank - a.rank || a.event.symbol.localeCompare(b.event.symbol));
      rankedSignalAt.set(timestamp, candidates.slice(0, limit));
    }
  }
  for (const e of simulationEvents) {
    advance(e.t); const entryPolicy = entryConfigFor(e, c), ec = entryPolicy.config;
    if (ec.enabled === false || !inSessionWindows(e.t, ec.sessionWindows) || !passesResearchFilters(e, ec) || (ec.symbols && !ec.symbols.includes(e.symbol))) continue;
    const ranked = c.rankByScore ? rankedSignalAt.get(e.t)?.find((candidate) => candidate.event === e) : null;
    if (c.rankByScore && !ranked) continue;
    if (positions.length + pendingOrders.length >= ec.maxPositions || positions.some((p) => p.symbol === e.symbol) || pendingOrders.some((order) => order.event.symbol === e.symbol)) continue;
    if (e.t - (lastClose.get(e.symbol) ?? -Infinity) < ec.cooldown * MINUTE) continue;
    const day = new Date(e.t).toISOString().slice(0, 10), key = `${day}:${e.symbol}`;
    const sessionLossKey = `${day}:${entryPolicy.session}:${e.symbol}`;
    if ((ec.maxLossesPerSymbolDay && (symbolDayLosses.get(key) ?? 0) >= ec.maxLossesPerSymbolDay) ||
        (ec.maxLossesPerSymbolSession && (symbolSessionLosses.get(sessionLossKey) ?? 0) >= ec.maxLossesPerSymbolSession)) continue;
    const sessionDayKey = `${day}:${entryPolicy.session}`;
    if ((dayCount.get(key) ?? 0) >= ec.maxDaily || (ec.maxTotalDaily && (totalDayCount.get(day) ?? 0) >= ec.maxTotalDaily) ||
        (ec.maxTotalPerSession && (sessionDayCount.get(sessionDayKey) ?? 0) >= ec.maxTotalPerSession)) continue;
    const side = ranked?.side ?? (pass(e, "buy", ec) ? "buy" : pass(e, "sell", ec) ? "sell" : null); if (!side || !(e.atr > 0)) continue;
    const pendingMode = ec.entryMode === "adaptive-pending" && e[`${side}Current`] < ec.pendingBelowScore ? ec.pendingKind : ec.entryMode;
    if (pendingMode === "continuation" || pendingMode === "pullback" || pendingMode === "signal-breakout") {
      const signalFrame = ec.signalTimeframe ?? "M15";
      const signalAtr = e[`${signalFrame}SignalAtr`] ?? e.atr;
      const offset = signalAtr * ec.pendingOffsetAtr;
      const signalPrice = side === "buy" ? e[`${signalFrame}SignalAskClose`] : e[`${signalFrame}SignalClose`];
      const breakoutPrice = side === "buy" ? e[`${signalFrame}SignalAskHigh`] : e[`${signalFrame}SignalLow`];
      const level = pendingMode === "signal-breakout"
        ? (side === "buy" ? breakoutPrice + offset : breakoutPrice - offset)
        : pendingMode === "continuation"
          ? (side === "buy" ? signalPrice + offset : signalPrice - offset)
        : (side === "buy" ? signalPrice - offset : signalPrice + offset);
      const stopBuffer = (ec.stopBufferAtr ?? 0) * signalAtr;
      const invalidatesAt = ec.stopMode === "signal-candle"
        ? (side === "buy" ? e[`${signalFrame}SignalLow`] - stopBuffer : e[`${signalFrame}SignalAskHigh`] + stopBuffer)
        : null;
      pendingOrders.push({ event: e, config: ec, side, kind: pendingMode === "signal-breakout" ? "continuation" : pendingMode, level, invalidatesAt, next: e.next, expiresAt: e.t + ec.pendingExpiryMinutes * MINUTE, session: entryPolicy.session, regime: entryPolicy.regime });
      continue;
    }
    const bar = data.get(e.symbol).M1[e.next]; if (!bar || bar.t !== e.t) continue;
    const position = buildPosition({ event: e, config: ec, side, entry: side === "buy" ? bar.askOpen : bar.open, opened: e.t, next: e.next, session: entryPolicy.session, regime: entryPolicy.regime });
    if (!position) continue;
    positions.push(position); recordOpenRisk(position); dayCount.set(key, (dayCount.get(key) ?? 0) + 1); totalDayCount.set(day, (totalDayCount.get(day) ?? 0) + 1); sessionDayCount.set(sessionDayKey, (sessionDayCount.get(sessionDayKey) ?? 0) + 1);
  }
  advance(end + 2 * DAY);
  for (const position of [...positions]) {
    const lastBar = data.get(position.symbol).M1.at(-1);
    close(position, lastBar.t, position.side === "buy" ? lastBar.close : lastBar.askClose, "end_of_data");
  }
  const firstWeek = new Date(simulationStart), weeks = new Map(), weekPnl = new Map(); for (let t = firstWeek.getTime(); t <= end; t += 7 * DAY) { weeks.set(isoWeek(t), 0); weekPnl.set(isoWeek(t), 0); }
  for (const tr of trades) { weeks.set(isoWeek(tr.t), (weeks.get(isoWeek(tr.t)) ?? 0) + tr.r); weekPnl.set(isoWeek(tr.t), (weekPnl.get(isoWeek(tr.t)) ?? 0) + tr.pnl); }
  const inResearchWindow = (week) => week >= protocol.train.fromWeek && week <= protocol.validation.toWeek;
  const selection = [...weeks].filter(([week]) => inResearchWindow(week)).map(([, r]) => r);
  const stats = (values) => { const sorted = [...values].sort((a, b) => a - b), positive = values.filter((x) => x > 0).length; let curve = 0, curvePeak = 0, drawdown = 0; for (const value of values) { curve += value; curvePeak = Math.max(curvePeak, curve); drawdown = Math.max(drawdown, curvePeak - curve); } return { weeks: values.length, positiveWeeks: positive, positiveWeekPct: values.length ? +(100 * positive / values.length).toFixed(1) : 0, medianR: sorted.length ? +sorted[Math.floor(sorted.length / 2)].toFixed(3) : 0, worstR: sorted.length ? +sorted[0].toFixed(3) : 0, totalR: +values.reduce((a, b) => a + b, 0).toFixed(3), maxDrawdownR: +drawdown.toFixed(3) }; };
  const selectionTrades = trades.filter((trade) => inResearchWindow(isoWeek(trade.t))), wins = selectionTrades.filter((trade) => trade.r > 0), losses = selectionTrades.filter((trade) => trade.r < 0), grossWinR = wins.reduce((sum, trade) => sum + trade.r, 0), grossLossR = losses.reduce((sum, trade) => sum + trade.r, 0);
  const selectionEntries = new Set(selectionTrades.map((trade) => trade.entryId)).size;
  const sel = stats(selection); const pf = grossLossR ? grossWinR / Math.abs(grossLossR) : grossWinR > 0 ? 10 : 0;
  const selectionPnl = selectionTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const selectionFinalBalance = startCapital + selectionPnl;
  const selectionReturnPct = 100 * (selectionFinalBalance - startCapital) / startCapital;
  const precisionStats = (values, weekCount) => {
    const positive = values.filter((trade) => trade.pnl > 0).length, takeProfits = values.filter((trade) => trade.reason === "tp").length;
    const stopLosses = values.filter((trade) => trade.reason === "sl").length, timeExits = values.filter((trade) => trade.reason === "time").length, dailyExits = values.filter((trade) => trade.reason === "daily").length;
    return {
      trades: values.length,
      positiveTrades: positive,
      winRate: values.length ? +(100 * positive / values.length).toFixed(1) : 0,
      takeProfits,
      tpRate: values.length ? +(100 * takeProfits / values.length).toFixed(1) : 0,
      stopLosses,
      timeExits,
      dailyExits,
      tradesPerDay: weekCount ? +(values.length / (weekCount * 5)).toFixed(2) : 0,
      averagePnl: values.length ? +(values.reduce((sum, trade) => sum + trade.pnl, 0) / values.length).toFixed(3) : 0,
    };
  };
  const selectionPrecision = precisionStats(selectionTrades, sel.weeks);
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
    const selected = selectionTrades.filter((trade) => trade.symbol === symbol);
    return [symbol, {
      development: precisionStats(selected, sel.weeks),
      r: +selected.reduce((sum, trade) => sum + trade.r, 0).toFixed(3),
      pnl: +selected.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2),
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
  for (let t = new Date(simulationStart).setUTCHours(0, 0, 0, 0); t <= end; t += DAY) {
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
  const fold = ({ fromWeek, toWeek }) => {
    const values = weekly.filter(({ week }) => week >= fromWeek && week <= toWeek);
    const foldTrades = selectionTrades.filter((trade) => { const week = isoWeek(trade.t); return week >= fromWeek && week <= toWeek; });
    const pnl = values.reduce((sum, week) => sum + week.pnl, 0);
    const foldStats = stats(values.map((week) => week.r));
    return { ...foldStats, entries: new Set(foldTrades.map((trade) => trade.entryId)).size, trades: foldTrades.length, pnl: +pnl.toFixed(2) };
  };
  const folds = { train: fold(protocol.train), validation: fold(protocol.validation) };
  const foldDaily = (range) => {
    const values = selectionTrades.filter((trade) => { const week = isoWeek(Date.parse(`${fxTradingDayKey(trade.opened)}T12:00:00.000Z`)); return week >= range.fromWeek && week <= range.toWeek; });
    const byDay = new Map();
    for (const trade of values) {
      const day = fxTradingDayKey(trade.opened);
      const current = byDay.get(day) ?? { pnl: 0, r: 0, entries: new Set() };
      current.pnl += trade.pnl; current.r += trade.r; current.entries.add(trade.entryId); byDay.set(day, current);
    }
    const days = [...byDay.values()], positive = days.filter((day) => day.pnl > 0).length;
    const rValues = days.map((day) => day.r).sort((a, b) => a - b);
    const marketDays = [...dailyMap.keys()].filter((day) => { const week = isoWeek(Date.parse(`${day}T12:00:00.000Z`)); return week >= range.fromWeek && week <= range.toWeek; }).length;
    return {
      marketDays,
      activeDays: days.length,
      activeMarketDayPct: marketDays ? +(100 * days.length / marketDays).toFixed(1) : 0,
      profitableDays: positive,
      positiveActiveDayPct: days.length ? +(100 * positive / days.length).toFixed(1) : 0,
      positiveMarketDayPct: marketDays ? +(100 * positive / marketDays).toFixed(1) : 0,
      medianDayR: rValues.length ? +rValues[Math.floor(rValues.length / 2)].toFixed(3) : 0,
      worstDayR: rValues.length ? +rValues[0].toFixed(3) : 0,
      averageDayPnl: days.length ? +(days.reduce((sum, day) => sum + day.pnl, 0) / days.length).toFixed(2) : 0,
    };
  };
  const dailyFolds = { train: foldDaily(protocol.train), validation: foldDaily(protocol.validation) };
  const totalMarketDays = dailyFolds.train.marketDays + dailyFolds.validation.marketDays;
  const activeDayPct = totalMarketDays ? +(100 * (dailyFolds.train.activeDays + dailyFolds.validation.activeDays) / totalMarketDays).toFixed(1) : 0;
  const bestWeek = weekly.reduce((best, week) => !best || week.pnl > best.pnl ? week : best, null);
  const dailyMode = protocol.primaryMetric === "dailyObjective";
  const gates = {
    trainProfitable: folds.train.totalR > 0,
    validationProfitable: folds.validation.totalR > 0,
    trainPositiveWeekPct: folds.train.positiveWeekPct >= 50,
    validationPositiveWeekPct: folds.validation.positiveWeekPct >= 50,
    profitFactor: pf >= 1.1,
    sampleSize: selectionEntries >= 80 && folds.validation.entries >= 20,
    drawdown: sel.maxDrawdownR <= 12,
    perPositionRisk: maxPositionRiskPct <= protocol.risk.maxPerPositionPct + 1e-9,
    portfolioRisk: maxOpenRiskPct <= protocol.risk.maxPortfolioPct + 1e-9,
    fourSessionCoverage: ["asia", "london", "overlap", "newYork"].every((session) => (sessionStats[session]?.trades ?? 0) >= 20),
    ...(dailyMode ? {
      trainPositiveDayPct: dailyFolds.train.positiveActiveDayPct >= 52,
      validationPositiveDayPct: dailyFolds.validation.positiveActiveDayPct >= 50,
      dailyActivity: dailyFolds.train.activeMarketDayPct >= 45 && dailyFolds.validation.activeMarketDayPct >= 45,
    } : {}),
  };
  const qualified = Object.values(gates).every(Boolean);
  const foldWeakness = Math.min(folds.train.totalR / Math.max(folds.train.weeks, 1), folds.validation.totalR / Math.max(folds.validation.weeks, 1));
  const robustObjective =
    0.35 * folds.train.positiveWeekPct +
    0.65 * folds.validation.positiveWeekPct +
    4 * Math.min(pf, 2) +
    3 * Math.min(folds.train.medianR, folds.validation.medianR) +
    2 * foldWeakness -
    0.75 * sel.maxDrawdownR -
    (gates.trainProfitable ? 0 : 35) -
    (gates.validationProfitable ? 0 : 50) -
    (gates.sampleSize ? 0 : Math.min(30, (80 - Math.min(selectionEntries, 80)) * 0.375)) -
    (gates.profitFactor ? 0 : (1.1 - Math.min(pf, 1.1)) * 40);
  const dailyObjective =
    0.35 * dailyFolds.train.positiveActiveDayPct +
    0.55 * dailyFolds.validation.positiveActiveDayPct +
    0.1 * Math.min(dailyFolds.validation.activeMarketDayPct, 100) +
    4 * Math.min(pf, 2) +
    2 * Math.min(dailyFolds.train.medianDayR, dailyFolds.validation.medianDayR) +
    2 * foldWeakness -
    0.75 * sel.maxDrawdownR -
    (gates.trainProfitable ? 0 : 35) -
    (gates.validationProfitable ? 0 : 50) -
    (gates.sampleSize ? 0 : Math.min(30, (80 - Math.min(selectionEntries, 80)) * 0.375)) -
    (gates.profitFactor ? 0 : (1.1 - Math.min(pf, 1.1)) * 40) -
    (dailyFolds.validation.positiveActiveDayPct >= 50 ? 0 : (50 - dailyFolds.validation.positiveActiveDayPct)) -
    ["asia", "london", "overlap", "newYork"].reduce((penalty, session) => penalty + Math.max(0, 20 - (sessionStats[session]?.trades ?? 0)), 0);
  const objective = dailyMode ? dailyObjective : robustObjective;
  return { protocol, objective: +objective.toFixed(4), qualified, status: qualified ? "candidate" : "rejected", gates, startCapital, finalBalance: +selectionFinalBalance.toFixed(2), returnPct: +selectionReturnPct.toFixed(2), trades: selectionTrades.length, entries: selectionEntries, partialExits: selectionTrades.filter((trade) => trade.reason === "partial").length, pnl: +selectionPnl.toFixed(2), profitFactor: +pf.toFixed(3), maxDrawdownR: sel.maxDrawdownR, maxDDPct: +maxDDPct.toFixed(1), risk: { maxPositionPct: +(100 * maxPositionRiskPct).toFixed(3), maxPortfolioPct: +(100 * maxOpenRiskPct).toFixed(3), maxPositionMarginPct: +(100 * maxPositionMarginPct).toFixed(3), maxMarginUsagePct: +(100 * maxMarginUsagePct).toFixed(3) }, development: sel, folds, dailyFolds, precision: selectionPrecision, activeDayPct, recent, symbolStats, sessionStats, regimeStats, bestWeek, daily, weekly, monthly };
}
