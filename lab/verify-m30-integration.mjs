import fs from "node:fs";
import zlib from "node:zlib";
import vm from "node:vm";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RISK, PORTFOLIO, TIMEFRAMES, SESSIONS } from "../config.js";
import { calcIndicators, aggregateM30 } from "../indicators/indicators.js";
import Strategy from "../strategies/strategies.js";
import { detectWave } from "./detect-wave-simple.js";

const file = process.argv[2];
if (!file) throw new Error("Usage: node lab/verify-m30-integration.mjs SNAPSHOT_JSON_GZ");
const root = fileURLToPath(new URL("../", import.meta.url));
const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const oldSource = execFileSync("git", ["show", "c399fbd:strategies/strategies.js"], { cwd: root, encoding: "utf8" });
const oldStrategy = vm.runInNewContext(oldSource.replace("export default new Strategy();", "new Strategy();"));
let now;
class Clock extends Date { static now() { return now; } }
const serviceSource = fs.readFileSync(new URL("../services/trading.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "").replace("export default new TradingService();", "new TradingService();");
const service = vm.runInNewContext(serviceSource, { RISK, PORTFOLIO, TIMEFRAMES, Date: Clock,
    logger: { info() {}, warn() {}, error() {}, debug() {} } });
const cutoff = Math.min(...Object.values(data).map(frames => Date.parse(frames.m5.at(-1).timestamp) + 300_000));
const from = cutoff - 14 * 86_400_000;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
let contexts = 0, m30Contexts = 0, signals = 0, plans = 0, rankings = 0;
for (let time = Math.ceil(from / 1_800_000) * 1_800_000; time <= cutoff; time += 1_800_000) {
    now = time + 2000;
    const timeframe = Strategy.getTimeframe(time);
    if (!timeframe || (timeframe === "h1" && time % 3_600_000 !== 0)) continue;
    const minutes = new Date(time).getUTCHours() * 60 + new Date(time).getUTCMinutes();
    const active = [];
    for (const session of Object.values(SESSIONS)) {
        const parse = text => { const [h,m] = text.split(":").map(Number); return h * 60 + m; };
        const start = parse(session.START), end = parse(session.END);
        if (start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end)
            for (const symbol of session.SYMBOLS) if (!active.includes(symbol)) active.push(symbol);
    }
    const analyses = [], referenceStates = [];
    for (const symbol of active) {
        const candles = {};
        for (const [frame, period] of [["h1",60],["m15",15],["m5",5]])
            candles[frame] = data[symbol][frame].filter(row => Date.parse(row.timestamp) + period * 60_000 <= time).slice(frame === "m15" ? -644 : -322);
        if (timeframe === "m30") candles.m30 = aggregateM30(candles.m15);
        const indicators = Object.fromEntries(await Promise.all(Object.entries(candles).map(async ([frame, rows]) => [frame, await calcIndicators(rows)])));
        const context = { symbol, candles, indicators, timeframe, decisionTime: time };
        const actual = Strategy.getSignal(context);
        contexts++;
        if (timeframe === "h1") {
            assert.equal(actual.signal, oldStrategy.getSignal(context).signal);
            continue;
        }
        m30Contexts++;
        const row = candles.m30.at(-1), previous = candles.m30.at(-2), values = indicators.m30;
        const atr = values.atr, spreadAtr = row.spread / atr;
        const strength = Math.abs(row.close - row.open) / atr;
        const h1Trend = (indicators.h1.ema20 - indicators.h1.ema50) / indicators.h1.atr;
        const efficiency = values.efficiency6;
        const accepted = candles.m30.length >= 75 && atr >= values.atrLow60 && atr <= values.atrHigh60
            && values.volumeRatio20 >= .5 && spreadAtr <= .25 && strength <= .75;
        const wave = detectWave(symbol, indicators, candles, {mode:"m15"}).waveDirection;
        const expected = accepted ? (wave === "BUY" ? "bullish" : wave === "SELL" ? "bearish" : null) : null;
        assert.equal(actual.signal, expected);
        const candidate = {...context, ...actual};
        analyses.push(candidate);
        referenceStates.push({candidate, score:efficiency + Math.min(2,values.atrRegime)*.2 - 8*spreadAtr});
        if (!expected) continue;
        signals++;
        const sign = expected === "bullish" ? 1 : -1;
        close(service.rateCandidate(candidate), efficiency + strength*.25 + Math.min(2,sign*h1Trend)*.15 - 8*spreadAtr);
        const buffer = Math.max(symbol.includes("JPY") ? .01 : .0001,row.spread,atr*.04);
        const entry = sign > 0 ? row.high+buffer : row.low-buffer;
        const stop = sign > 0 ? Math.min(Math.min(row.low,previous.low)-atr*.05,entry-atr*.8)
            : Math.max(Math.max(row.high,previous.high)+atr*.05,entry+atr*.8);
        const plan = service.getOrderPlan(candidate);
        if (Math.abs(entry-stop)/atr > 3) { assert.equal(plan,null); continue; }
        const targetR = Math.max(1,Math.min(2,1.5+sign*h1Trend*.15+efficiency*.2));
        const risk = .0075*(.5+.5*Math.min(1,efficiency/.4))*(spreadAtr>.12?.75:1)*(values.atrRegime>1.5?.75:1);
        close(plan.entry,entry);close(plan.stop,stop);close(plan.target,entry+sign*targetR*Math.abs(entry-stop));close(plan.riskPct,risk);
        assert.equal(plan.stepTimeframe,sign*h1Trend>=1&&efficiency>=.2?"M15":"M5");
        plans++;
    }
    if (timeframe === "m30") {
        const top = new Set(referenceStates.sort((a,b)=>b.score-a.score).slice(0,3).map(row=>row.candidate.symbol));
        const expected = analyses.filter(candidate=>candidate.signal&&top.has(candidate.symbol)).map(candidate=>candidate.symbol);
        const actual = Array.from(service.selectActivePairs(analyses,active),candidate=>candidate.symbol);
        assert.deepEqual(actual,expected);
        rankings++;
    }
}
assert.ok(signals > 0 && plans > 0, "Snapshot must exercise admitted M30 signals and order plans");
console.log(JSON.stringify({protocol:"m30-production-formula-parity-v1",cutoff:new Date(cutoff).toISOString(),contexts,m30Contexts,
    admittedM30Signals:signals,orderPlans:plans,rankingDecisions:rankings,identical:true,
    scope:"Closed historical candles; deployed rolling indicator calculations; H1 core vs c399fbd; frozen M30 admission/ranking/entry/stop/target/risk formulas. No broker calls or portfolio P/L simulation."},null,2));
