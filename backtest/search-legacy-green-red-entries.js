/**
 * Ten-minute entry-only search around the archived scoring + green/red model.
 * It deliberately preserves its old execution model (previous M1 SL, 1.8R TP)
 * so that only entry and trade-selection changes are compared.
 */
import fs from "node:fs";
import readline from "node:readline";
import { EMA, MACD, ADX } from "technicalindicators";

const MINUTE = 60_000, M15 = 15 * MINUTE, H1 = 60 * MINUTE;
const SYMBOLS = (process.env.SYMBOLS || "EURUSD,GBPUSD,EURGBP,AUDUSD,USDCAD").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
const DATASET = process.env.CAPITAL_DATASET_DIR || "/mnt/usb-ssd/trading/capital-dataset";
const END = Date.parse(process.env.END_DATE || "2026-06-29T13:00:00.000Z");
const START = END - 90 * 24 * H1, WARMUP = START - 21 * 24 * H1, SPLIT = END - 30 * 24 * H1;
const SEARCH_SECONDS = Number(process.env.SEARCH_SECONDS || 600);
const REPORT_PATH = process.env.REPORT_PATH || "/tmp/legacy-entry-search.json";
const START_CAPITAL = Number(process.env.START_CAPITAL || 500);
const n = (x) => Number.isFinite(Number(x)) ? Number(x) : null;
const mid = (r, k) => n(r[k]) ?? (() => { const b = n(r.bid?.[k]), a = n(r.ask?.[k]); return b != null && a != null ? (a + b) / 2 : b ?? a; })();
const q = (r, side, k) => n(r[side]?.[k]) ?? n(r[k]);
const pip = (symbol) => symbol.includes("JPY") ? 0.01 : 0.0001;
const day = (t) => new Date(t).toISOString().slice(0, 10);

async function load(symbol) {
  const file = `${DATASET}/${symbol}_M1.jsonl`, rows = [];
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const input = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of input) {
    try {
      const raw = JSON.parse(line), t = Date.parse(raw.timestamp ?? raw.snapshotTimeUTC ?? raw.snapshotTime);
      const values = [mid(raw, "open"), mid(raw, "high"), mid(raw, "low"), mid(raw, "close"), q(raw, "bid", "open"), q(raw, "bid", "high"), q(raw, "bid", "low"), q(raw, "bid", "close"), q(raw, "ask", "open"), q(raw, "ask", "high"), q(raw, "ask", "low"), q(raw, "ask", "close")];
      if (t >= WARMUP && t < END && values.every(Number.isFinite)) rows.push({ t, open: values[0], high: values[1], low: values[2], close: values[3], bidOpen: values[4], bidHigh: values[5], bidLow: values[6], bidClose: values[7], askOpen: values[8], askHigh: values[9], askLow: values[10], askClose: values[11] });
    } catch {}
  }
  return rows.sort((a, b) => a.t - b.t);
}

function resample(rows, tf) {
  const groups = new Map();
  for (const row of rows) {
    const t = Math.floor(row.t / tf) * tf, previous = groups.get(t);
    if (previous) { previous.high = Math.max(previous.high, row.high); previous.low = Math.min(previous.low, row.low); previous.close = row.close; previous.count += 1; }
    else groups.set(t, { t, open: row.open, high: row.high, low: row.low, close: row.close, count: 1 });
  }
  return [...groups.values()].filter((row) => row.count >= tf / MINUTE * 0.8).sort((a, b) => a.t - b.t);
}
function align(length, values) { const out = Array(length).fill(null), offset = length - values.length; for (let i = 0; i < values.length; i += 1) out[offset + i] = values[i]; return out; }
function enrich(rows) {
  const close = rows.map((r) => r.close), high = rows.map((r) => r.high), low = rows.map((r) => r.low), length = rows.length;
  const e9 = align(length, EMA.calculate({ period: 9, values: close }));
  const e50 = align(length, EMA.calculate({ period: 50, values: close }));
  const e200 = align(length, EMA.calculate({ period: 200, values: close }));
  const macd = align(length, MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: close, SimpleMAOscillator: false, SimpleMASignal: false }));
  const adx = align(length, ADX.calculate({ period: 14, close, high, low }));
  return rows.map((r, i) => ({ ...r, e9: e9[i], e50: e50[i], e200: e200[i], macd: macd[i], adx: adx[i]?.adx ?? null }));
}
function before(rows, t) { let lo = 0, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].t <= t) lo = m + 1; else hi = m; } return lo - 1; }
function oppositeThenAligned(previous, current, side) { return side === "BUY" ? previous.close < previous.open && current.close > current.open : previous.close > previous.open && current.close < current.open; }
function bodyRatio(candle) { const range = candle.high - candle.low; return range > 0 ? Math.abs(candle.close - candle.open) / range : 0; }
function minuteOfDay(t) { const d = new Date(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); }

const frames = new Map(), baseEvents = [];
for (const symbol of SYMBOLS) {
  const m1 = await load(symbol), m15 = enrich(resample(m1, M15)), h1 = enrich(resample(m1, H1));
  frames.set(symbol, { m1, m15, h1 });
  for (let i = 200; i < m15.length; i += 1) {
    const current = m15[i], t = current.t + M15;
    if (t < START || t >= END) continue;
    const h = before(h1, t - H1), entryIndex = before(m1, t);
    const higher = h1[h], priorHigher = h1[h - 1], priorM15 = m15[i - 1];
    if (!higher || !priorHigher || !priorM15 || entryIndex < 1 || m1[entryIndex]?.t !== t || ![higher.e9, higher.e50, higher.e200, higher.adx, current.adx, current.macd?.histogram].every(Number.isFinite)) continue;
    const buyScore = [higher.e50 > higher.e200, current.close > higher.e9, current.macd.histogram > 0].filter(Boolean).length;
    const sellScore = [higher.e50 < higher.e200, current.close < higher.e9, current.macd.histogram < 0].filter(Boolean).length;
    baseEvents.push({ t, symbol, entryIndex, buyScore, sellScore, h1Adx: higher.adx, m15Adx: current.adx, h1Bull: higher.e50 > higher.e200, m15Bull: current.e50 > current.e200,
      buyH1Reversal: oppositeThenAligned(priorHigher, higher, "BUY"), sellH1Reversal: oppositeThenAligned(priorHigher, higher, "SELL"),
      buyM15Reversal: oppositeThenAligned(priorM15, current, "BUY"), sellM15Reversal: oppositeThenAligned(priorM15, current, "SELL"),
      h1Body: bodyRatio(higher), m15Body: bodyRatio(current), h1Slope: h >= 3 ? higher.e50 > h1[h - 3].e50 : false, h1BearSlope: h >= 3 ? higher.e50 < h1[h - 3].e50 : false,
      minute: minuteOfDay(t), date: day(t) });
  }
}
baseEvents.sort((a, b) => a.t - b.t || a.symbol.localeCompare(b.symbol));

const sessions = {
  all: () => true,
  london: (m) => m >= 480 && m < 780,
  overlap: (m) => m >= 780 && m < 1020,
  newYork: (m) => m >= 1020 && m < 1260,
  londonNewYork: (m) => m >= 480 && m < 1260,
  afternoon: (m) => m >= 780 && m < 1260,
};
function matches(event, c) {
  if (!sessions[c.session](event.minute)) return null;
  // Keep the asymmetric ADX gates from the archived checkScoring(): H1 ADX
  // qualified a long, while M15 ADX qualified a short.
  const buy = event.buyScore >= c.scoreThreshold && event.h1Adx >= c.h1AdxMin;
  const sell = event.sellScore >= c.scoreThreshold && event.m15Adx >= c.m15AdxMin;
  const side = buy && !sell ? "BUY" : sell && !buy ? "SELL" : null;
  if (!side) return null;
  if (c.requireM15Trend && (side === "BUY" ? !event.m15Bull : event.m15Bull)) return null;
  if (c.requireH1Slope && (side === "BUY" ? !event.h1Slope : !event.h1BearSlope)) return null;
  const h1Pattern = side === "BUY" ? event.buyH1Reversal : event.sellH1Reversal;
  const m15Pattern = side === "BUY" ? event.buyM15Reversal : event.sellM15Reversal;
  const pattern = c.pattern === "h1Reversal" ? h1Pattern : c.pattern === "m15Reversal" ? m15Pattern : c.pattern === "eitherReversal" ? h1Pattern || m15Pattern : c.pattern === "continuation" ? (side === "BUY" ? event.h1Body > 0 : event.h1Body > 0) : true;
  const body = c.pattern === "m15Reversal" ? event.m15Body : event.h1Body;
  return pattern && body >= c.minBody ? side : null;
}
function buildPosition(event, signal, balance) {
  const rows = frames.get(event.symbol).m1, bar = rows[event.entryIndex], previous = rows[event.entryIndex - 1], buy = signal === "BUY";
  const entry = buy ? bar.askOpen : bar.bidOpen, buffer = event.symbol.includes("JPY") ? 0.08 : 0.0008;
  let stop = buy ? previous.bidLow - buffer : previous.askHigh + buffer, distance = Math.abs(entry - stop), min = (event.symbol.includes("JPY") ? 12 : 10) * pip(event.symbol);
  if (distance < min) { stop = buy ? entry - min : entry + min; distance = min; }
  const target = buy ? entry + distance * 1.8 : entry - distance * 1.8;
  const size = Math.max(100, Math.floor(((balance * 0.02 / 5) / ((distance / pip(event.symbol)) * (pip(event.symbol) / entry))) / 100) * 100);
  return { event, symbol: event.symbol, signal, entry, stop, target, distance, size, opened: bar.t, next: event.entryIndex };
}
function evaluate(c) {
  let balance = START_CAPITAL, peak = balance, maxDD = 0;
  const positions = [], trades = [], lastOpened = new Map(), dailyCount = new Map();
  const close = (p, price, t, reason) => { const pnl = (p.signal === "BUY" ? price - p.entry : p.entry - price) * p.size; balance += pnl; peak = Math.max(peak, balance); maxDD = Math.max(maxDD, peak - balance); trades.push({ ...p, closed: t, pnl, r: pnl / (p.distance * p.size), reason }); positions.splice(positions.indexOf(p), 1); };
  const advance = (to) => { for (const p of [...positions]) { const rows = frames.get(p.symbol).m1; while (p.next < rows.length && rows[p.next].t < to) { const bar = rows[p.next], buy = p.signal === "BUY", sl = buy ? bar.bidLow <= p.stop : bar.askHigh >= p.stop, tp = buy ? bar.bidHigh >= p.target : bar.askLow <= p.target; if (sl) { close(p, p.stop, bar.t, "SL"); break; } if (tp) { close(p, p.target, bar.t, "TP"); break; } p.next += 1; } } };
  let index = 0;
  while (index < baseEvents.length) {
    const t = baseEvents[index].t; advance(t); const events = [];
    while (index < baseEvents.length && baseEvents[index].t === t) events.push(baseEvents[index++]);
    for (const event of events) {
      const signal = matches(event, c), key = `${event.date}:${event.symbol}`;
      if (!signal || positions.length >= 5 || positions.some((p) => p.symbol === event.symbol) || (dailyCount.get(key) ?? 0) >= c.maxDaily || t - (lastOpened.get(event.symbol) ?? -Infinity) < c.cooldown * MINUTE) continue;
      positions.push(buildPosition(event, signal, balance)); lastOpened.set(event.symbol, t); dailyCount.set(key, (dailyCount.get(key) ?? 0) + 1);
    }
  }
  advance(END);
  for (const p of [...positions]) { const last = frames.get(p.symbol).m1.at(-1); if (last) close(p, p.signal === "BUY" ? last.bidClose : last.askClose, last.t, "END"); }
  const stats = (subset) => { const win = subset.filter((x) => x.pnl > 0), loss = subset.filter((x) => x.pnl < 0), gp = win.reduce((s, x) => s + x.pnl, 0), gl = loss.reduce((s, x) => s + x.pnl, 0), pnl = subset.reduce((s, x) => s + x.pnl, 0); return { trades: subset.length, pnl: +pnl.toFixed(2), r: +subset.reduce((s, x) => s + x.r, 0).toFixed(3), winRate: subset.length ? +(100 * win.length / subset.length).toFixed(1) : 0, pf: gl ? +(gp / Math.abs(gl)).toFixed(3) : 0 }; };
  const train = stats(trades.filter((x) => x.closed < SPLIT)), test = stats(trades.filter((x) => x.closed >= SPLIT)), total = stats(trades);
  const activeDays = new Set(trades.map((x) => day(x.opened))).size;
  const qualified = train.trades >= 25 && test.trades >= 10 && train.pnl > 0 && test.pnl > 0 && total.pf >= 1.05 && activeDays >= 25;
  const objective = qualified ? test.pnl * 2 + train.pnl + total.pf * 20 - maxDD * 0.35 : -10_000 + total.pnl;
  return { config: c, objective: +objective.toFixed(4), qualified, finalBalance: +balance.toFixed(2), returnPct: +(100 * (balance - START_CAPITAL) / START_CAPITAL).toFixed(2), maxDD: +maxDD.toFixed(2), activeDays, total, train, test, exits: Object.fromEntries(["TP", "SL", "END"].map((reason) => [reason, trades.filter((x) => x.reason === reason).length])) };
}

const baseline = { scoreThreshold: 3, h1AdxMin: 10, m15AdxMin: 10, pattern: "h1Reversal", minBody: 0, requireH1Slope: false, requireM15Trend: false, session: "all", cooldown: 0, maxDaily: 99 };
let seed = Number(process.env.SEARCH_SEED || 19092025) >>> 0;
const rand = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const pick = (values) => values[Math.floor(rand() * values.length)];
const candidate = () => ({ scoreThreshold: pick([2, 3]), h1AdxMin: pick([0, 10, 15, 20, 25, 30]), m15AdxMin: pick([0, 10, 15, 20, 25, 30]), pattern: pick(["h1Reversal", "h1Reversal", "m15Reversal", "eitherReversal", "continuation", "none"]), minBody: pick([0, 0.15, 0.3, 0.45, 0.6]), requireH1Slope: pick([false, false, true]), requireM15Trend: pick([false, true]), session: pick(Object.keys(sessions)), cooldown: pick([0, 15, 30, 60, 120]), maxDaily: pick([1, 2, 3, 5, 99]) });
const started = Date.now(), results = [evaluate(baseline)]; let iterations = 1;
while ((Date.now() - started) / 1000 < SEARCH_SECONDS || iterations === 1) { results.push(evaluate(candidate())); iterations += 1; if (iterations % 2500 === 0) console.error(`iterations=${iterations} elapsed=${((Date.now() - started) / 1000).toFixed(1)} qualified=${results.filter((r) => r.qualified).length}`); }
results.sort((a, b) => b.objective - a.objective);
const report = { generatedAt: new Date().toISOString(), searchSeconds: +((Date.now() - started) / 1000).toFixed(1), iterations, sourceCommit: "dca8b124ccb94527a7984bf96a70942b8e716175", period: { start: new Date(START).toISOString(), split: new Date(SPLIT).toISOString(), endExclusive: new Date(END).toISOString() }, symbols: SYMBOLS, baseEvents: baseEvents.length, baseline: results.find((r) => r.config === baseline), qualifiedCount: results.filter((r) => r.qualified).length, leaderboard: results.filter((r) => r.qualified).slice(0, 25), bestAny: results[0] };
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: REPORT_PATH, iterations, qualifiedCount: report.qualifiedCount, baseline: report.baseline, best: report.leaderboard[0] ?? report.bestAny }, null, 2));
