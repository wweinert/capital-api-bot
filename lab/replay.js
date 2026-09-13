import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRows, enrichProfileRows, patternSide, atOrBefore, marketSession } from "./autoresearch/prepare.js";

export const RESEARCH_BASE = Object.freeze({
    strategy:"greenred",lookback:4,signalThreshold:0.25,regime:0.2,sessionOrderCap:0,
    bundle:1,contextAlign:false,adxMax:20,excludeSymbol:null,
    tf:15,pivotWidth:4,direction:"lows",higherSwing:0,pool:5,spread:0.5,body:0.4,bodyAtr:0.15,
    eff:0.1,activity:1,atrMin:0.3,atrMax:0.9,volume:0,filter:"score",room:1,score:2,htf:0,
    hbars:1,hmove:0.25,entry:"stop",offset:0.1,sl:"candle",buffer:0.2,minStop:0.5,tp:"r",
    target:2,expiry:30,hold:120,be:null,trail:"conditional",activation:1.5,trailDistance:0.75,
    burst:0.5,slots:1,risk:0.03,portfolioRisk:0.15,dailyStop:0,lossCap:0,
});

async function inferKronos(runtime, batches, onPrediction, modelName = "small", sampleCount = 6, cacheFile = null) {
    if (!["mini", "small", "base"].includes(modelName)) throw Error("kronos-model must be mini, small, or base");
    if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 10)
        throw Error("kronos-samples must be an integer from 1 through 10");
    const tokenizerName = modelName === "mini" ? "tokenizer-2k" : "tokenizer-base";
    const maxContext = modelName === "mini" ? 2048 : 512;
    const modelWeight = path.join(runtime, "models", modelName, "model.safetensors");
    const tokenizerWeight = path.join(runtime, "models", tokenizerName, "model.safetensors");
    const modelSource = path.join(runtime, "source", "model", "kronos.py");
    const fileIdentity = (file) => {
        const stat = fs.statSync(file);
        return { file, size:stat.size, mtimeMs:stat.mtimeMs };
    };
    const cacheKey = crypto.createHash("sha256").update(JSON.stringify({
        schemaVersion:1, modelName, tokenizerName, maxContext, sampleCount,
        decoding:{temperature:0.6,topP:0.9}, batches,
        files:[modelWeight,tokenizerWeight,modelSource].map(fileIdentity),
    })).digest("hex");
    let cachePath = null;
    if (cacheFile) {
        const labRoot = path.dirname(fileURLToPath(import.meta.url));
        cachePath = path.resolve(cacheFile);
        if (cachePath !== labRoot && !cachePath.startsWith(labRoot + path.sep))
            throw Error("kronos-cache must stay inside lab/");
        if (fs.existsSync(cachePath)) {
            const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
            if (cached.schemaVersion === 1 && cached.cacheKey === cacheKey && Array.isArray(cached.predictions)) {
                for (const prediction of cached.predictions) onPrediction(prediction);
                return { ...cached.inference, seconds:0, cacheHit:true, cacheFile:cachePath,
                    cachedSeconds:cached.inference.seconds, count:cached.predictions.length };
            }
        }
    }
    const program = String.raw`
import sys,json,time,resource
import torch,pandas as pd
from model import Kronos,KronosTokenizer,KronosPredictor
torch.set_num_threads(2)
torch.set_num_interop_threads(1)
torch.use_deterministic_algorithms(True)
root=sys.argv[1]; model_name=sys.argv[2]; tokenizer_name=sys.argv[3]; max_context=int(sys.argv[4]); sample_count=int(sys.argv[5])
tokenizer=KronosTokenizer.from_pretrained(root+'/models/'+tokenizer_name)
model=Kronos.from_pretrained(root+'/models/'+model_name)
model.eval()
predictor=KronosPredictor(model,tokenizer,device='cpu',max_context=max_context)
print(json.dumps({'ready':True}),flush=True)
for line in sys.stdin:
    request=json.loads(line); jobs=request['jobs']; tf=request['tf']; horizon=request['horizon']
    start=time.perf_counter()
    values=[]
    # Keep each stochastic trajectory instead of using upstream sample_count,
    # which averages the trajectories before returning them. Limit the expanded
    # CPU batch so Base also fits comfortably in Raspberry Pi 5 memory.
    jobs_per_chunk=max(1,8//sample_count)
    for chunk_start in range(0,len(jobs),jobs_per_chunk):
        chunk=jobs[chunk_start:chunk_start+jobs_per_chunk]
        frames=[]; xs=[]; ys=[]
        for job in chunk:
            frame=pd.DataFrame(job['rows'],columns=['t','open','high','low','close'])
            stamp=pd.to_datetime(frame.pop('t'),unit='ms')
            future=pd.Series(pd.date_range(stamp.iloc[-1]+pd.Timedelta(minutes=tf),periods=horizon,freq=str(tf)+'min'))
            for _ in range(sample_count):
                frames.append(frame.copy());xs.append(stamp.copy());ys.append(future.copy())
        output=predictor.predict_batch(frames,xs,ys,pred_len=horizon,T=0.6,top_k=0,top_p=0.9,sample_count=1,verbose=False)
        for index,job in enumerate(chunk):
            path_frames=output[index*sample_count:(index+1)*sample_count]
            paths=[p[['open','high','low','close']].values.tolist() for p in path_frames]
            mean_bars=[]
            for bar_index in range(horizon):
                mean_bars.append([sum(path[bar_index][field] for path in paths)/sample_count for field in range(4)])
            values.append({'key':job['key'],'contextEnd':job['contextEnd'],'bars':mean_bars,'paths':paths})
    print(json.dumps({'predictions':values,'seconds':time.perf_counter()-start,'rssMiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024},allow_nan=False),flush=True)
`;
    const child = spawn(path.join(runtime, "bin/python"), ["-u", "-c", program, runtime, modelName, tokenizerName, String(maxContext), String(sampleCount)], {
        cwd: path.join(runtime, "source"), stdio: ["pipe", "pipe", "inherit"],
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", HF_HUB_OFFLINE: "1", HF_DATASETS_OFFLINE: "1" },
    });
    let failure;
    child.on("error", error => { failure = error; });
    child.stdin.on("error", error => { failure = error; });
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
    async function response() {
        while (true) {
            if (failure) throw failure;
            const next = await lines.next();
            if (next.done) throw Error("Kronos process ended without a complete response");
            if (next.value.startsWith("{")) return JSON.parse(next.value);
        }
    }
    let count = 0, seconds = 0, rssMiB = 0;
    const cachedPredictions = [];
    try {
        if (!(await response()).ready) throw Error("Kronos initialization failed");
        for (const batch of batches) {
            child.stdin.write(JSON.stringify(batch) + "\n");
            const output = await response();
            if (output.predictions?.length !== batch.jobs.length) throw Error("Incomplete Kronos batch");
            for (const prediction of output.predictions) {
                if (!prediction.bars.flat().every(Number.isFinite)) throw Error("Non-finite Kronos forecast");
                cachedPredictions.push(prediction);
                onPrediction(prediction);
            }
            count += output.predictions.length; seconds += output.seconds; rssMiB = Math.max(rssMiB, output.rssMiB);
            if (count % 64 < batch.jobs.length) console.log("KRONOS_PROGRESS", JSON.stringify({ count, seconds: Math.round(seconds), rssMiB }));
        }
        const inference = { count, seconds, rssMiB, model: modelName, tokenizer: tokenizerName, maxContext,
            decoding: "temperature-0.6-top-p-0.9", modelMode: "eval",
            deterministicAlgorithms: true, sampleCount, pathsPreserved: true,
            maxExpandedBatch: 8, volume: "zero", device: "cpu", threads: 2, cacheHit:false };
        if (cachePath) {
            fs.mkdirSync(path.dirname(cachePath), { recursive:true });
            const temporary = `${cachePath}.${process.pid}.tmp`;
            fs.writeFileSync(temporary, `${JSON.stringify({schemaVersion:1,cacheKey,inference,predictions:cachedPredictions})}\n`);
            fs.renameSync(temporary, cachePath);
            inference.cacheFile = cachePath;
        }
        return inference;
    } finally {
        child.stdin.end();
        if (failure) child.kill();
    }
}

export function confirmedSwingDirections(rows, width = 2) {
    if (!Number.isInteger(width) || width < 1) throw Error("Pivot width must be a positive integer.");
    const highs = [],
        lows = [],
        out = [];
    for (let i = 0; i < rows.length; i++) {
        const p = i - width;
        if (p >= width) {
            let high = true,
                low = true;
            for (let j = p - width; j <= p + width; j++) {
                if (j === p) continue;
                high &&= rows[p].high > rows[j].high;
                low &&= rows[p].low < rows[j].low;
            }
            if (high) {
                highs.push(rows[p].high);
                if (highs.length > 2) highs.shift();
            }
            if (low) {
                lows.push(rows[p].low);
                if (lows.length > 2) lows.shift();
            }
        }
        const h = highs.length === 2 ? Math.sign(highs[1] - highs[0]) : 0,
            l = lows.length === 2 ? Math.sign(lows[1] - lows[0]) : 0;
        out.push({ highs: h, lows: l, both: h !== 0 && h === l ? h : 0 });
    }
    return out;
}

// A causal approximation of the visual process described by the strategy owner.
// A wave extremum is confirmed only when a candle of the opposite colour closes.
// A signal is the first same-direction candle after the correction following two
// already-confirmed waves. No symmetric window, future candle, or pivot is used.
export function causalWaveContinuations(rows) {
    const output = Array(rows.length).fill(null);
    const state = {
        buy: { active:false, start:-1, bars:0, high:-Infinity, low:Infinity, extrema:[], correctionBars:0,
            correctionHigh:-Infinity,correctionLow:Infinity },
        sell:{ active:false, start:-1, bars:0, high:-Infinity, low:Infinity, extrema:[], correctionBars:0,
            correctionHigh:-Infinity,correctionLow:Infinity },
    };
    const update = (side, index, follows) => {
        const s = state[side], row = rows[index];
        if (follows) {
            let signal = null;
            if (!s.active) {
                if (s.extrema.length === 2 && s.correctionBars > 0) {
                    const [previous, latest] = s.extrema;
                    const continuation = side === "buy" ? latest.price > previous.price : latest.price < previous.price;
                    if (continuation) signal = {
                        side:side === "buy" ? "BUY" : "SELL",
                        previousExtremum:previous.price,
                        latestExtremum:latest.price,
                        progress:side === "buy" ? latest.price-previous.price : previous.price-latest.price,
                        impulseBars:latest.bars,
                        correctionBars:s.correctionBars,
                        impulseRange:latest.high-latest.low,
                        correctionRange:s.correctionHigh-s.correctionLow,
                        correctionDepth:side === "buy" ? latest.price-s.correctionLow : s.correctionHigh-latest.price,
                        retraceRatio:latest.high>latest.low
                            ?(side === "buy" ? latest.price-s.correctionLow : s.correctionHigh-latest.price)/(latest.high-latest.low)
                            :0,
                        signalCloseLocation:row.high>row.low
                            ?(side === "buy" ? (row.close-row.low)/(row.high-row.low) : (row.high-row.close)/(row.high-row.low))
                            :.5,
                    };
                }
                s.active=true;s.start=index;s.bars=0;s.high=-Infinity;s.low=Infinity;s.correctionBars=0;
                s.correctionHigh=-Infinity;s.correctionLow=Infinity;
            }
            s.bars++;s.high=Math.max(s.high,row.high);s.low=Math.min(s.low,row.low);
            return signal;
        }
        if (s.active) {
            const extremum={price:side === "buy" ? s.high : s.low,bars:s.bars,high:s.high,low:s.low,index:index-1};
            s.extrema.push(extremum);
            if (s.extrema.length>2)s.extrema.shift();
            s.active=false;s.correctionBars=1;s.correctionHigh=row.high;s.correctionLow=row.low;
        } else if (s.extrema.length) {
            s.correctionBars++;
            s.correctionHigh=Math.max(s.correctionHigh,row.high);
            s.correctionLow=Math.min(s.correctionLow,row.low);
        }
        return null;
    };
    for(let index=0;index<rows.length;index++){
        const row=rows[index],buy=update("buy",index,row.close>row.open),sell=update("sell",index,row.close<row.open);
        output[index]=buy??sell;
    }
    return output;
}

export async function runGlobalResearch(options = {}) {
    if (!options.dataset) throw Error("Pass --dataset; evaluation is offline.");
    if (options.kronosModel && !["mini", "small", "base"].includes(options.kronosModel))
        throw Error("kronos-model must be mini, small, or base");
    if (options.kronosSamples !== undefined && (!Number.isInteger(options.kronosSamples) || options.kronosSamples < 1 || options.kronosSamples > 10))
        throw Error("kronos-samples must be an integer from 1 through 10");
    if(options.qualityScreenStudy)options.humanWaveContinuation=true;
    if(options.profitTournament){
        options.alternative=true;
        options.dailySearch=true;
    }
    if(options.swingContinuation||options.humanWaveContinuation)options.dailySearch=true;
    if (options.m5Scalping) {
        options.alternative = true;
        options.dailySearch = true;
    }
    if (options.institutionalStudy) options.alternative = true;
    if (options.adaptivePairStudy) options.alternative = true;
    if (options.productionStudy) options.alternative = true;
    if (options.dynamicProfiles) options.alternative = true;
    if (options.reportCandidates) options.alternative = true;
    if (options.alternativeSearch) {
        options.dailySearch = true;
        options.alternative = true;
    }
    if (options.alternativeObjective) {
        options.dailyObjective = true;
        options.alternative = true;
    }
    if (options.dailyActivitySearch) options.dailySearch = true;
    if (options.dailyActivityObjective) {
        options.dailyObjective = true;
        options.dailyActivity = true;
    }
    if (options.dailyActivitySearch) options.dailyActivity = true;
    if (options.dailyObjective && !(options.kronosRuntime || options.kronosPlan)) throw Error("daily objective requires kronos-runtime or kronos-plan");
    if (options.qualityScreenStudy && !(options.kronosRuntime || options.kronosPlan))
        throw Error("quality-screen-study requires kronos-runtime or kronos-plan");
    if (options.kronosCore && !options.dailyObjective && !options.reportCandidates && !options.swingContinuation && !options.humanWaveContinuation)
        throw Error("kronos-core requires an explicit research family");
    if ((options.kronosRuntime || options.kronosPlan) && (options.candidate || options.seconds !== undefined || options.evaluations !== undefined)) {
        throw Error("Kronos mode is a fixed scenario grid; do not combine it with candidate/time/count search options.");
    }
    const dir = options.dataset;
    const MIN = 60000,
        DAY = 86400000;
    const START = Date.parse(options.from ?? "2026-03-01T00:00:00Z"),
        TRAINEND = Date.parse(options.trainEnd ?? "2026-07-01T00:00:00Z"),
        VALEND = Date.parse(options.validationEnd ?? "2026-08-01T00:00:00Z"),
        END = Date.parse(options.to ?? "2026-08-28T21:00:00Z");
    if (![START, TRAINEND, VALEND, END].every(Number.isFinite) || !(START < TRAINEND && TRAINEND < VALEND && VALEND < END))
        throw Error("Expected from < train-end < validation-end < to.");
    const WARM = START - 30 * DAY;
    const profitTf=Number(options.profitTimeframe||0);
    if(options.profitTournament&&profitTf&&![1,5,15,60,240,1440].includes(profitTf))
        throw Error("profit-timeframe must be one of 1,5,15,60,240,1440");
    const fixedFamilyTf = Number(options.kronosCore?.tf ?? (options.humanWaveContinuation ? options.candidate?.tf : 0));
    const tfs = options.humanWaveContinuation && [5,15,60,240].includes(fixedFamilyTf)
        ? [...new Set([fixedFamilyTf,60,240])]
        : options.swingContinuation||options.humanWaveContinuation?[5,15,60,240]
        : options.profitTournament ? [...new Set([5,15,60,240,1440].filter(tf=>!profitTf||tf===profitTf||[15,60,240].includes(tf)))]
        : options.m5Scalping ? [5, 15, 60] : options.alternative ? [15, 60, 240] : [5, 15, 60, 240];
    const tournamentSymbols=new Set(profitTf===1?["EURUSD"]:["EURUSD","GBPUSD","USDJPY"]);
    const symbols = fs
        .readdirSync(dir)
        .filter((f) => /^[A-Z]{6}_M1\.jsonl$/.test(f) && !/^(BTC|ETH)/.test(f))
        .map((f) => f.slice(0, 6))
        .filter(symbol=>!options.profitTournament||tournamentSymbols.has(symbol))
        .sort();
    const oldSource = fs.readFileSync(new URL("./autoresearch/prepare.js", import.meta.url), "utf8");
    const sha = (x) => crypto.createHash("sha256").update(x).digest("hex");
    const sourceHash = sha(oldSource);
    const rulesText = fs.readFileSync(new URL("./autoresearch/reference/capital-market-rules-2026-08-29.json", import.meta.url), "utf8");
    const rules = JSON.parse(rulesText).symbols, rulesHash = sha(rulesText);
    for (const symbol of symbols) {
        if (!rules[symbol] || rules[symbol].marginFactorUnit !== "PERCENTAGE" || !(rules[symbol].marginFactor > 0)) throw Error(`Missing broker rules for ${symbol}`);
    }
    const data = new Map(),
        coverage = {};
    const iso = (t) => new Date(t).toISOString();
    for (const symbol of symbols) {
        const file = dir + "/" + symbol + "_M1.jsonl",
            before = fs.statSync(file),
            hash = crypto.createHash("sha256"),
            map = new Map();
        const stream = fs.createReadStream(file);
        stream.on("data", (chunk) => hash.update(chunk));
        let invalid = 0,
            duplicates = 0;
        for await (const line of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
            if (!line.trim()) continue;
            let x;
            try {
                x = JSON.parse(line);
            } catch {
                invalid++;
                continue;
            }
            const t = Date.parse(x.timestamp || x.snapshotTimeUTC);
            if (t < WARM) continue;
            const b = x.bid || x,
                a = x.ask;
            if (!a) {
                invalid++;
                continue;
            }
            const r = {
                t,
                open: +b.open,
                high: +b.high,
                low: +b.low,
                close: +b.close,
                askOpen: +a.open,
                askHigh: +a.high,
                askLow: +a.low,
                askClose: +a.close,
                volume: +(x.volume ?? 0),
            };
            if (!Object.values(r).every(Number.isFinite) || r.high < r.low || r.askHigh < r.askLow || r.askOpen < r.open || r.askClose < r.close) {
                invalid++;
                continue;
            }
            if (map.has(t)) duplicates++;
            map.set(t, r);
        }
        const rows = [...map.values()].sort((a, b) => a.t - b.t);
        map.clear();
        if (!rows.length) throw Error(`No valid bid/ask M1 rows for ${symbol} after ${iso(WARM)}`);
        const after = fs.statSync(file);
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw Error("Dataset changed during load");
        coverage[symbol] = {
            first: iso(rows[0].t),
            last: iso(rows.at(-1).t),
            rows: rows.length,
            invalid,
            duplicates,
            sha256: hash.digest("hex"),
            size: before.size,
            mtimeMs: before.mtimeMs,
        };
        data.set(symbol, { 1: options.profitTournament&&(!profitTf||profitTf===1)?fastMicroRows(rows):rows });
        console.log("LOAD", symbol, rows.length, coverage[symbol].last);
    }
    function aggregate(rows, tf) {
        const result = [];
        let bucket = null;
        const finish = () => {
            if (bucket && bucket.n === tf && bucket.last === bucket.t + (tf - 1) * MIN) result.push(bucket);
        };
        for (const r of rows) {
            const t = Math.floor(r.t / (tf * MIN)) * tf * MIN;
            if (!bucket || bucket.t !== t) {
                finish();
                bucket = { ...r, t, n: 1, last: r.t,
                    midOpen:(r.open+r.askOpen)/2, midHigh:(r.high+r.askHigh)/2,
                    midLow:(r.low+r.askLow)/2, midClose:(r.close+r.askClose)/2 };
            } else {
                bucket.high = Math.max(bucket.high, r.high);
                bucket.low = Math.min(bucket.low, r.low);
                bucket.askHigh = Math.max(bucket.askHigh, r.askHigh);
                bucket.askLow = Math.min(bucket.askLow, r.askLow);
                bucket.close = r.close;
                bucket.askClose = r.askClose;
                bucket.midHigh = Math.max(bucket.midHigh, (r.high+r.askHigh)/2);
                bucket.midLow = Math.min(bucket.midLow, (r.low+r.askLow)/2);
                bucket.midClose = (r.close+r.askClose)/2;
                bucket.volume += r.volume;
                bucket.n++;
                bucket.last = r.t;
            }
        }
        finish();
        return result;
    }
    function fastMicroRows(rows){
        const alpha=period=>2/(period+1),ema={},periods=[9,16,20,21,32,50,64,128,200],
            bbQueue=[],volumeQueue=[],pathQueue=[];
        let bbSum=0,bbSquare=0,volumeSum=0,pathSum=0,prevClose=NaN,atr21=NaN,atr14=NaN,
            tr21=0,tr14=0,gainSum=0,lossSum=0,avgGain=NaN,avgLoss=NaN,macdSignal=0;
        for(let index=0;index<rows.length;index++){
            const row=rows[index],tr=Number.isFinite(prevClose)
                ?Math.max(row.high-row.low,Math.abs(row.high-prevClose),Math.abs(row.low-prevClose))
                :row.high-row.low;
            if(index<21)tr21+=tr;
            if(index===20)atr21=tr21/21;else if(index>20)atr21=(20*atr21+tr)/21;
            if(index<14)tr14+=tr;
            if(index===13)atr14=tr14/14;else if(index>13)atr14=(13*atr14+tr)/14;
            const change=Number.isFinite(prevClose)?row.close-prevClose:0,gain=Math.max(0,change),loss=Math.max(0,-change);
            if(index>0&&index<=14){gainSum+=gain;lossSum+=loss;}
            if(index===14){avgGain=gainSum/14;avgLoss=lossSum/14;}
            else if(index>14){avgGain=(13*avgGain+gain)/14;avgLoss=(13*avgLoss+loss)/14;}
            for(const period of periods)ema[period]=ema[period]===undefined?row.close:ema[period]+alpha(period)*(row.close-ema[period]);
            const fast=ema[12]===undefined?(ema[12]=row.close):ema[12]+alpha(12)*(row.close-ema[12]),
                slow=ema[26]===undefined?(ema[26]=row.close):ema[26]+alpha(26)*(row.close-ema[26]);
            ema[12]=fast;ema[26]=slow;
            const macd=fast-slow;macdSignal=index===0?macd:macdSignal+alpha(9)*(macd-macdSignal);
            bbQueue.push(row.close);bbSum+=row.close;bbSquare+=row.close*row.close;
            if(bbQueue.length>20){const removed=bbQueue.shift();bbSum-=removed;bbSquare-=removed*removed;}
            volumeQueue.push(row.volume);volumeSum+=row.volume;
            if(volumeQueue.length>21)volumeSum-=volumeQueue.shift();
            if(Number.isFinite(prevClose)){const path=Math.abs(row.close-prevClose);pathQueue.push(path);pathSum+=path;}
            if(pathQueue.length>23)pathSum-=pathQueue.shift();
            const middle=bbQueue.length===20?bbSum/20:NaN,
                deviation=bbQueue.length===20?Math.sqrt(Math.max(0,bbSquare/20-middle*middle)):NaN,
                range=row.high-row.low,body=Math.abs(row.close-row.open),priorVolume=volumeQueue.length>1
                    ?(volumeSum-row.volume)/(volumeQueue.length-1):0,
                origin=index>=23?rows[index-23].open:NaN;
            Object.assign(row,{atr:atr21,atr14,bollinger:Number.isFinite(middle)?{lower:middle-2*deviation,middle,upper:middle+2*deviation}:null,
                rsi:Number.isFinite(avgGain)?avgLoss===0?100:100-100/(1+avgGain/avgLoss):NaN,adx:NaN,
                ema9:ema[9],ema16:ema[16],ema20:ema[20],ema21:ema[21],ema32:ema[32],ema50:ema[50],ema64:ema[64],
                ema128:ema[128],ema200:ema[200],macdHistogram:macd-macdSignal,atrPercentile:.5,
                efficiency:Number.isFinite(origin)&&pathSum>0?Math.abs(row.close-origin)/pathSum:0,
                activity:Number.isFinite(atr21)&&atr21>0&&index>=3
                    ?rows.slice(index-3,index+1).reduce((sum,value)=>sum+value.high-value.low,0)/(4*atr21):0,
                volumeRatio:priorVolume>0?row.volume/priorVolume:0,bodyRatio:range>0?body/range:0,
                bodyAtr:Number.isFinite(atr21)&&atr21>0?body/atr21:0});
            prevClose=row.close;
        }
        return rows;
    }
    const reportComponents = (rows, i) => {
        if (i < 200 || !(rows[i]?.atr > 0)) return null;
        const normalizedMomentum = (horizons) => {
            const values = [];
            for (const horizon of horizons) {
                if (i < horizon || !(rows[i - horizon].close > 0)) return NaN;
                let variance = 0;
                for (let cursor = i - horizon + 1; cursor <= i; cursor++) {
                    const value = Math.log(rows[cursor].close / rows[cursor - 1].close);
                    variance += value * value;
                }
                const scale = Math.sqrt(variance);
                values.push(Math.tanh(Math.log(rows[i].close / rows[i - horizon].close) / Math.max(scale, 1e-12)));
            }
            return values.reduce((sum, value) => sum + value, 0) / values.length;
        };
        const row = rows[i], emaPairs = [[row.ema16,row.ema64],[row.ema32,row.ema128],[row.ema50,row.ema200]],
            channelLengths = [20,55,55], breakout = channelLengths.map((length) => {
                const prior = rows.slice(i - length, i), high = Math.max(...prior.map(value => value.high)),
                    low = Math.min(...prior.map(value => value.low));
                if (row.close > high) return 1;
                if (row.close < low) return -1;
                return high > low ? 2 * (row.close - low) / (high - low) - 1 : 0;
            });
        return {
            atr: row.atr,
            momentum: [[2,4,8],[4,16,32],[8,32,128]].map(normalizedMomentum),
            trend: emaPairs.map(([fast,slow]) => Number.isFinite(fast) && Number.isFinite(slow) ? Math.tanh((fast-slow)/row.atr) : NaN),
            breakout,
            z: emaPairs.map(([,slow]) => Number.isFinite(slow) ? (row.close-slow)/row.atr : NaN),
            adx: row.adx,
        };
    };
    const adaptivePairProfiles=rows=>{
        const keys=["width","rsi","body","momentum2","momentum4","momentum8"],
            queues=keys.map(()=>[]),sums=keys.map(()=>0),squares=keys.map(()=>0),out=[];
        const valuesAt=index=>{
            const row=rows[index],width=row?.atr>0&&row.bollinger
                ?(row.bollinger.upper-row.bollinger.lower)/row.atr:NaN;
            return [width,row?.rsi,row?.bodyAtr,
                index>=2&&row?.atr>0?(row.close-rows[index-2].close)/row.atr:NaN,
                index>=4&&row?.atr>0?(row.close-rows[index-4].close)/row.atr:NaN,
                index>=8&&row?.atr>0?(row.close-rows[index-8].close)/row.atr:NaN];
        };
        for(let index=0;index<rows.length;index++){
            const current=valuesAt(index),ready=queues.every(queue=>queue.length===200),means=[],deviations=[];
            if(ready)for(let key=0;key<keys.length;key++){
                const mean=sums[key]/200,variance=Math.max(1e-8,squares[key]/200-mean*mean);
                means.push(mean);deviations.push(Math.sqrt(variance));
            }
            out.push(ready?Float32Array.from([...current,...means,...deviations]):null);
            for(let key=0;key<keys.length;key++){
                const value=current[key];
                if(!Number.isFinite(value))continue;
                queues[key].push(value);sums[key]+=value;squares[key]+=value*value;
                if(queues[key].length>200){
                    const removed=queues[key].shift();sums[key]-=removed;squares[key]-=removed*removed;
                }
            }
        }
        return out;
    };
    for (const [symbol, d] of data) {
        if (options.reportCandidates) d.report = {};
        if(options.adaptivePairStudy||options.m5Scalping)d.adaptive={};
        for (const tf of tfs) {
            const labels={5:"M5",15:"M15",60:"H1",240:"H4",1440:"D1"},
                nativeFile=`${dir}/${symbol}_${labels[tf]}.jsonl`,
                aggregated=options.profitTournament
                    ?loadRows(nativeFile,labels[tf]).rows.filter(row=>row.t>=WARM&&row.t<END)
                    :aggregate(d[1], tf);
            d[tf] = enrichProfileRows(aggregated);
            if(options.profitTournament||options.humanWaveContinuation){
                const source=fs.readFileSync(nativeFile);
                const nativeStat=fs.statSync(nativeFile);
                coverage[symbol][`native${tf}`]={size:source.length,mtimeMs:nativeStat.mtimeMs,sha256:sha(source)};
            }
            if(options.adaptivePairStudy||(options.m5Scalping&&[5,15].includes(tf)))d.adaptive[tf]=adaptivePairProfiles(d[tf]);
            if (options.reportCandidates) {
                const mid = enrichProfileRows(aggregated.map(row => ({ ...row,
                    open:row.midOpen, high:row.midHigh, low:row.midLow, close:row.midClose,
                })));
                d.report[tf] = { rows:mid, features:mid.map((_,index)=>reportComponents(mid,index)) };
            }
        }
        console.log("FEATURES", symbol, Object.fromEntries(tfs.map((tf) => [tf, d[tf].length])));
    }
    const sessionCache = new Map();
    function sess(t) {
        const slot = Math.floor(t / (15 * MIN));
        if (!sessionCache.has(slot)) sessionCache.set(slot, ["asia", "london", "overlap", "newYork", "offHours"].indexOf(marketSession(slot * 15 * MIN)));
        return sessionCache.get(slot);
    }
    function sessionStart(day, s) {
        for (let m = 0; m < 1440; m += 15) if (sess(day + m * MIN) === s) return day + m * MIN;
        return day;
    }
    const sessionEndCache = new Map();
    function sessionEnd(t, s) {
        const slot = Math.floor(t / (15 * MIN));
        const key = `${slot}|${s}`;
        if (!sessionEndCache.has(key)) {
            let end = slot * 15 * MIN;
            while (end <= t || sess(end) === s) end += 15 * MIN;
            sessionEndCache.set(key, end);
        }
        return sessionEndCache.get(key);
    }
    const eventsByTf = new Map(),
        marketEventsByTf = new Map(),
        universeCache = new Map();
    function rankUniverse(tf, t, mode = "spread") {
        const day = Math.floor(t / DAY) * DAY,
            s = sess(t),
            key = tf + "|" + day + "|" + s + "|" + mode;
        if (universeCache.has(key)) return universeCache.get(key);
        const snap = sessionStart(day, s);
        const list = symbols
            .map((symbol) => {
                const rows = data.get(symbol)[tf],
                    i = atOrBefore(rows, snap - tf * MIN),
                    r = rows[i];
                const spreadAtr=r?.atr>0?(r.askClose-r.close)/r.atr:Infinity,
                    activity=Number.isFinite(r?.activity)?r.activity:0;
                const score=mode==="activity"?-activity
                    :mode==="opportunity"?-(activity/Math.max(.01,spreadAtr))
                    :spreadAtr;
                return { symbol, score: r?.atr > 0 && snap - (r.t + tf * MIN) < 3 * DAY ? score : Infinity };
            })
            .filter((x) => Number.isFinite(x.score))
            .sort((a, b) => a.score - b.score || a.symbol.localeCompare(b.symbol));
        const ranks = Object.fromEntries(list.map((x, i) => [x.symbol, i + 1]));
        universeCache.set(key, ranks);
        return ranks;
    }
    for (const tf of (options.humanWaveContinuation&&[5,15,60,240].includes(fixedFamilyTf)?[fixedFamilyTf]
        : options.humanWaveContinuation?[5,15,60,240]
        : options.swingContinuation?[15]
        : options.profitTournament ? (profitTf?[profitTf]:[1,5,15,60,240,1440])
        : options.m5Scalping ? [5] : options.productionStudy ? [15] : options.institutionalStudy ? [60,240]
        : options.adaptivePairStudy ? [15,60,240]
        : options.kronosCore?.tf ? [options.kronosCore.tf] : [15, 60])) {
        const events = [], marketEvents = [];
        for (const symbol of symbols) {
            const d = data.get(symbol),
                rows = d[tf],
                reportRows = options.reportCandidates ? d.report[tf].rows : null,
                reportFeatures = options.reportCandidates ? d.report[tf].features : null;
            let activeSessionKey = "",
                sessionOpen = NaN,
                sessionHigh = NaN,
                sessionLow = NaN,
                sessionTravel = 0,
                sessionLastClose = NaN,
                completedSession = null,
                sessionPv = 0,
                sessionVolume = 0,
                sessionSpreadAtr = 0,
                sessionVolumeRatio = 0,
                sessionBars = 0,
                priorSessionReturn = NaN,
                priorVwapRaw = NaN;
            const directions = (options.alternative && !options.dynamicProfiles)||options.humanWaveContinuation ? {} : Object.fromEntries([2, 3, 4].map((width) => [width, confirmedSwingDirections(rows, width)]));
            const higherDirections = (options.alternative && !options.dynamicProfiles)||options.humanWaveContinuation ? {} : Object.fromEntries([60, 240].map((ht) => [ht, confirmedSwingDirections(d[ht], 2)]));
            const waveSignals=options.humanWaveContinuation?causalWaveContinuations(rows):null;
            for (let i = options.profitTournament?(tf===1440?50:220):320; i < rows.length; i++) {
                const r = rows[i],
                    t = r.t + tf * MIN;
                if (t < START || t >= END) continue;
                const wd = new Date(t).getUTCDay(),
                    s = sess(t),
                    minute = (t % DAY) / MIN;
                if (wd === 0 || wd === 6 || (s === 4 && !options.productionStudy)
                    || (wd === 5 && minute >= (options.productionStudy ? 1200 : 1080))
                    || minute >= (options.productionStudy ? 1320 : 1260)) continue;
                if (!(r.atr > 0)) continue;
                const wave=waveSignals?.[i]??null,
                    side = options.humanWaveContinuation?wave?.side:patternSide(rows, i),
                    spread = r.askClose - r.close,
                    directionsAtBar = (options.alternative && !options.dynamicProfiles)||options.humanWaveContinuation ? {} : Object.fromEntries([2, 3, 4].map((width) => [width, directions[width][i]])),
                    rawMoves = {}, rawEma = {}, adaptiveHigher = {},
                    higherSwings = {};
                for (const htf of (options.profitTournament?[15,60,240]:options.m5Scalping?[15]:[60,240])) {
                    const hr = d[htf],
                        hi = atOrBefore(hr, t - htf * MIN);
                    adaptiveHigher[htf]=d.adaptive?.[htf]?.[hi]??null;
                    higherSwings[htf] = (options.alternative && !options.dynamicProfiles)||options.humanWaveContinuation ? 0 : higherDirections[htf][hi]?.both ?? 0;
                    rawEma[htf] = hi >= 0 && hr[hi].atr > 0 && Number.isFinite(hr[hi].ema20) && Number.isFinite(hr[hi].ema50)
                        ? (hr[hi].ema20-hr[hi].ema50)/hr[hi].atr : NaN;
                    for (const n of [1, 2, 4]) rawMoves[htf + "_" + n] = hi >= n && hr[hi].atr > 0 ? (hr[hi].close - hr[hi - n].close) / hr[hi].atr : NaN;
                }
                const h1Rows=d[60],h4Rows=d[240]??[],h1Index=atOrBefore(h1Rows,t-60*MIN),h4Index=atOrBefore(h4Rows,t-240*MIN),
                    h1=h1Rows[h1Index],h4=h4Rows[h4Index],previous=rows[i-1],
                    productionReady=!options.m5Scalping&&!options.profitTournament&&[h1?.ema9,h1?.ema21,h1?.rsi,h4?.ema50,h4?.ema200,h4?.macdHistogram,
                        r.ema9,r.ema21,previous?.ema9,previous?.ema21,r.rsi,r.bollinger?.lower,r.bollinger?.upper,r.atr14].every(Number.isFinite),
                    h4BullishTrend=productionReady&&h4.ema50>h4.ema200&&h4.close>h4.ema50,
                    production=productionReady?{
                        buyMask:[h4.ema50>h4.ema200,h4.macdHistogram>0,h1.ema9>h1.ema21,h1.rsi<35,
                            r.ema9>r.ema21&&previous.ema9<=previous.ema21,r.rsi<30,r.close<=r.bollinger.lower]
                            .reduce((mask,value,index)=>value?mask|(1<<index):mask,0),
                        sellMask:[!h4BullishTrend,h4.macdHistogram<0,h1.ema9<h1.ema21,h1.rsi>65,
                            r.ema9<r.ema21&&previous.ema9>=previous.ema21,r.rsi>70,r.askClose>=r.bollinger.upper]
                            .reduce((mask,value,index)=>value?mask|(1<<index):mask,0),
                        symmetricSellTrend:h4.ema50<h4.ema200,atr:r.atr14,
                        h4Trend:h4.ema50>h4.ema200?1:-1,h1Trend:h1.ema9>h1.ema21?1:-1,
                        volatility:r.atrPercentile,spreadAtr:spread/r.atr,session:s,
                    }:null;
                const sessionKey = `${Math.floor(t / DAY)}|${s}`;
                if (sessionKey !== activeSessionKey) {
                    if (activeSessionKey && Number.isFinite(sessionOpen) && Number.isFinite(sessionLastClose))
                        completedSession = { open:sessionOpen, high:sessionHigh, low:sessionLow,
                            close:sessionLastClose, travel:sessionTravel, spreadAtr:sessionSpreadAtr,
                            volumeRatio:sessionVolumeRatio, bars:sessionBars };
                    activeSessionKey = sessionKey;
                    sessionOpen = r.open;
                    sessionHigh = r.high;
                    sessionLow = r.low;
                    sessionTravel = Math.abs(r.close-r.open);
                    sessionLastClose = r.close;
                    sessionPv = 0;
                    sessionVolume = 0;
                    sessionSpreadAtr = 0;
                    sessionVolumeRatio = 0;
                    sessionBars = 0;
                    priorSessionReturn = NaN;
                    priorVwapRaw = NaN;
                } else {
                    sessionTravel += Math.abs(r.close-sessionLastClose);
                    sessionHigh = Math.max(sessionHigh,r.high);
                    sessionLow = Math.min(sessionLow,r.low);
                    sessionLastClose = r.close;
                }
                const barVolume = r.volume > 0 ? r.volume : 1,
                    typical = (r.high + r.low + r.close) / 3;
                sessionPv += typical * barVolume;
                sessionVolume += barVolume;
                sessionSpreadAtr += spread/r.atr;
                sessionVolumeRatio += Number.isFinite(r.volumeRatio)?r.volumeRatio:0;
                sessionBars++;
                const sessionVwap = sessionPv / sessionVolume,
                    sessionReturn = (r.close - sessionOpen) / r.atr,
                    currentVwapRaw = (r.close - sessionVwap) / r.atr,
                    previousSessionReturn = priorSessionReturn,
                    previousVwapRaw = priorVwapRaw;
                priorSessionReturn = sessionReturn;
                priorVwapRaw = currentVwapRaw;
                const prior = rows.slice(Math.max(0, i - 32), i),
                    recent = rows.slice(i - 5, i + 1),
                    rawReturns = {}, priorReturns = {}, breakoutUp = {}, breakoutDown = {};
                for (const n of [2, 4, 8, 16, 32]) {
                    rawReturns[n] = i >= n ? (r.close - rows[i - n].close) / r.atr : NaN;
                    priorReturns[n] = i > n && rows[i - 1].atr > 0 ? (rows[i - 1].close - rows[i - 1 - n].close) / rows[i - 1].atr : NaN;
                    const window = prior.slice(-n);
                    breakoutUp[n] = window.length === n ? (r.close - Math.max(...window.map(x => x.high))) / r.atr : NaN;
                    breakoutDown[n] = window.length === n ? (Math.min(...window.map(x => x.low)) - r.close) / r.atr : NaN;
                }
                const resistance = Math.max(...prior.slice(-20).map((x) => x.high)),
                    support = Math.min(...prior.slice(-20).map((x) => x.low)),
                    touchTolerance = .15*r.atr,
                    supportTouches = prior.slice(-20).filter(x=>Math.abs(x.low-support)<=touchTolerance).length,
                    resistanceTouches = prior.slice(-20).filter(x=>Math.abs(x.high-resistance)<=touchTolerance).length,
                    priorSession = completedSession ? {
                        open:completedSession.open,
                        close:completedSession.close,
                        range:(completedSession.high-completedSession.low)/r.atr,
                        move:(completedSession.close-completedSession.open)/r.atr,
                        travel:completedSession.travel/r.atr,
                        efficiency:completedSession.travel>0
                            ?Math.abs(completedSession.close-completedSession.open)/completedSession.travel:0,
                        closeLocation:completedSession.high>completedSession.low
                            ?(completedSession.close-completedSession.low)/(completedSession.high-completedSession.low):.5,
                        averageSpreadAtr:completedSession.bars?completedSession.spreadAtr/completedSession.bars:NaN,
                        averageVolumeRatio:completedSession.bars?completedSession.volumeRatio/completedSession.bars:NaN,
                        high:completedSession.high,
                        low:completedSession.low,
                    } : null;
                const base = {
                    directions: directionsAtBar, higherSwings, rawMoves, rawEma, rawReturns, priorReturns, breakoutUp, breakoutDown, production,
                    adaptiveProfile:d.adaptive?.[tf]?.[i]??null,adaptiveHigher,
                    patternSign: side === "BUY" ? 1 : side === "SELL" ? -1 : 0,
                    candleSign: Math.sign(r.close - r.open),priorCandle:rows[i-1],secondPriorCandle:rows[i-2],
                    emaRaw: Number.isFinite(r.ema20) && Number.isFinite(r.ema50) ? (r.ema20 - r.ema50) / r.atr : NaN,
                    priorEmaRaw: Number.isFinite(rows[i - 1]?.ema20) && Number.isFinite(rows[i - 1]?.ema50) && rows[i - 1].atr > 0
                        ? (rows[i - 1].ema20 - rows[i - 1].ema50) / rows[i - 1].atr : NaN,
                    emaSlopeRaw: Number.isFinite(r.ema20) && Number.isFinite(rows[i - 4]?.ema20) ? (r.ema20 - rows[i - 4].ema20) / r.atr : NaN,
                    z: Number.isFinite(r.bollinger?.middle) ? (r.close - r.bollinger.middle) / r.atr : NaN,
                    priorZ: Number.isFinite(rows[i - 1]?.bollinger?.middle) && rows[i - 1].atr > 0
                        ? (rows[i - 1].close - rows[i - 1].bollinger.middle) / rows[i - 1].atr : NaN,
                    sessionReturn,
                    sessionRange:(sessionHigh-sessionLow)/r.atr,
                    sessionTravel:sessionTravel/r.atr,
                    sessionEfficiency:sessionTravel>0?Math.abs(r.close-sessionOpen)/sessionTravel:0,
                    priorSession,
                    sessionGap:priorSession?(r.open-priorSession.close)/r.atr:NaN,
                    priorSessionReturn: previousSessionReturn,
                    sessionVwap,
                    vwapRaw: currentVwapRaw,
                    priorVwapRaw: previousVwapRaw,
                    report: reportFeatures?.[i] ?? null,
                    priorReport: reportFeatures?.[i-1] ?? null,
                    reportContext: options.reportCandidates ? Object.fromEntries([60,240].map(contextTf => {
                        const context = d.report[contextTf], contextIndex = atOrBefore(context.rows,t-contextTf*MIN);
                        return [contextTf, context.features[contextIndex] ?? null];
                    })) : null,
                    signalAtr: reportFeatures?.[i]?.atr ?? r.atr,
                    t, symbol, s, tf, r, spreadAtr: spread / r.atr, vol: (r.volumeRatio ?? 0) >= 1,
                    sessionAge: (t - sessionStart(Math.floor(t / DAY) * DAY, s)) / MIN,
                    sessionEnd: sessionEnd(t, s), rank: rankUniverse(tf, t)[symbol] ?? 99,
                    ranks:Object.fromEntries(["spread","activity","opportunity"].map(mode=>[mode,rankUniverse(tf,t,mode)[symbol]??99])),
                    lo3: Math.min(...recent.slice(-3).map((x) => x.low)), hi3: Math.max(...recent.slice(-3).map((x) => x.high)),
                    lo6: Math.min(...recent.map((x) => x.low)), hi6: Math.max(...recent.map((x) => x.high)),
                    resistance, support, supportTouches, resistanceTouches,
                    supportDistance:(r.close-support)/r.atr, resistanceDistance:(resistance-r.close)/r.atr,
                };
                const tournamentBase=options.profitTournament?{
                    rawMoves,rawReturns,priorReturns,breakoutUp,breakoutDown,patternSign:base.patternSign,
                    candleSign:base.candleSign,priorCandle:previous?{open:previous.open,close:previous.close,high:previous.high,
                        low:previous.low,rsi:previous.rsi,macdHistogram:previous.macdHistogram,ema20:previous.ema20,
                        bodyAtr:previous.bodyAtr}:null,
                    secondPriorCandle:rows[i-2]?{high:rows[i-2].high,low:rows[i-2].low}:null,
                    emaRaw:base.emaRaw,priorEmaRaw:base.priorEmaRaw,emaSlopeRaw:base.emaSlopeRaw,z:base.z,priorZ:base.priorZ,
                    sessionReturn,priorSession,priorSessionReturn:previousSessionReturn,sessionAge:base.sessionAge,
                    sessionVwap,vwapRaw:currentVwapRaw,priorVwapRaw:previousVwapRaw,
                    t,symbol,s,tf,r,spreadAtr:spread/r.atr,vol:base.vol,signalAtr:r.atr,sessionEnd:base.sessionEnd,
                    rank:base.rank,lo3:base.lo3,hi3:base.hi3,lo6:base.lo6,hi6:base.hi6,
                    resistance,support,supportDistance:base.supportDistance,resistanceDistance:base.resistanceDistance,
                }:base;
                if(options.adaptivePairStudy||options.m5Scalping)marketEvents.push({
                    t,symbol,s,tf,r,spreadAtr:spread/r.atr,rank:base.rank,sessionEnd:base.sessionEnd,
                    patternSign:base.patternSign,adaptiveProfile:base.adaptiveProfile,adaptiveHigher,
                    rawMoves:{},emaRaw:0,emaSlopeRaw:0,vol:false,signalAtr:r.atr,
                });
                else if (options.alternative) marketEvents.push(tournamentBase);
                if (!side || (options.alternative && !options.dynamicProfiles)) continue;
                const sign = base.patternSign;
                const bb =
                    sign === 1 ? r.low <= r.bollinger?.lower && r.close > r.bollinger?.lower : r.high >= r.bollinger?.upper && r.close < r.bollinger?.upper;
                const room = sign === 1 ? (r.bollinger?.upper - r.askClose) / r.atr : (r.close - r.bollinger?.lower) / r.atr;
                const rsi = sign === 1 ? r.rsi <= 35 : r.rsi >= 65,
                    vol = (r.volumeRatio ?? 0) >= 1;
                const ema = Number.isFinite(r.ema20) && Number.isFinite(r.ema50) ? sign * (r.ema20 - r.ema50) / r.atr : NaN,
                    priorEma = rows[i - 4]?.ema20,
                    emaSlope = Number.isFinite(r.ema20) && Number.isFinite(priorEma) ? sign * (r.ema20 - priorEma) / r.atr : NaN;
                const moves = Object.fromEntries(Object.entries(rawMoves).map(([key,value]) => [key, value * sign]));
                events.push({
                    directions: directionsAtBar,
                    higherSwings,
                    t,
                    symbol,
                    s,
                    sign,
                    wave:wave?{...wave,progressAtr:wave.progress/r.atr,impulseRangeAtr:wave.impulseRange/r.atr}:null,
                    priorSession,
                    ranks:base.ranks,
                    tf,
                    r,
                    rsiValue:r.rsi,
                    bandPosition:r.bollinger?.upper>r.bollinger?.lower
                        ?(r.close-r.bollinger.lower)/(r.bollinger.upper-r.bollinger.lower):NaN,
                    spreadAtr: spread / r.atr,
                    bb,
                    room,
                    rsi,
                    vol,
                    ema,
                    emaSlope,
                    score: [bb || room >= 1, rsi, vol].filter(Boolean).length,
                    quality: [bb || room >= 1, rsi, vol].filter(Boolean).length + (r.efficiency ?? 0) + (r.volumeRatio ?? 0) - spread / r.atr,
                    moves,
                    sessionEnd: sessionEnd(t, s),
                    rank: rankUniverse(tf, t)[symbol] ?? 99,
                    lo3: Math.min(...recent.slice(-3).map((x) => x.low)),
                    hi3: Math.max(...recent.slice(-3).map((x) => x.high)),
                    lo6: Math.min(...recent.map((x) => x.low)),
                    hi6: Math.max(...recent.map((x) => x.high)),
                    resistance: Math.max(...prior.slice(-20).map((x) => x.high)),
                    support: Math.min(...prior.slice(-20).map((x) => x.low)),
                });
            }
        }
        events.sort((a, b) => a.t - b.t || b.quality - a.quality || a.symbol.localeCompare(b.symbol));
        marketEvents.sort((a, b) => a.t - b.t || a.symbol.localeCompare(b.symbol));
        eventsByTf.set(tf, events);
        marketEventsByTf.set(tf, marketEvents);
        console.log("EVENTS", tf, events.length, "train", events.filter((e) => e.t < TRAINEND).length);
        console.log("MARKET_EVENTS", tf, marketEvents.length, "train", marketEvents.filter((e) => e.t < TRAINEND).length);
    }
    for (const symbol of symbols) {
        const file = dir + "/" + symbol + "_M15.jsonl", before = fs.statSync(file);
        data.get(symbol).native15 = loadRows(file, "M15").rows;
        const sha256 = sha(fs.readFileSync(file)), after = fs.statSync(file);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Error("Native M15 changed during load");
        coverage[symbol].native15 = { size: before.size, mtimeMs: before.mtimeMs, sha256 };
    }
    const fileFingerprint = sha(JSON.stringify(coverage));
    console.log(
        "PROTOCOL",
        JSON.stringify({
            sourceHash,
            fileFingerprint,
            symbols,
            START: iso(START),
            TRAINEND: iso(TRAINEND),
            VALEND: iso(VALEND),
            END: iso(END),
            signalTimeframes: options.humanWaveContinuation?([5,15,60,240].includes(fixedFamilyTf)?[fixedFamilyTf]:[5,15,60,240])
                : options.swingContinuation?[15]
                : options.profitTournament ? (profitTf?[profitTf]:[1,5,15,60,240,1440])
                : options.m5Scalping ? [5] : options.productionStudy ? [15] : [15, 60],
            directionTimeframes: options.humanWaveContinuation?[]
                : options.swingContinuation?[15,60]
                : options.profitTournament ? [15,60,240]
                : options.m5Scalping ? [15] : [15, 60, 240],
            execution: `${options.profitTournament ? "native signal bars; M1 exact search and final replay"
                : options.m5Scalping ? "M5 search; final M1 replay" : options.alternative ? "M1 search and final replay"
                : "M5 search; final M1 replay"}; bid/ask; stop-first ambiguity; reserve pending margin/slots; chronological cash settlement; 90% margin cap; 3% nominal risk`,
            selection:
                "search train only, validation selects, test reported after freeze; dates previously inspected in earlier research, not a virgin holdout",
        }),
    );
    const forecasts = new Map(),
        reportStrategies = new Set(["reportMomentum", "reportTrend", "reportBreakout", "trendEnsemble", "regimeMeanReversion"]);
    function reportScore(features, c) {
        if (!features) return NaN;
        const bundle = Math.max(0, Math.min(2, c.bundle ?? 1));
        if (c.strategy === "reportMomentum") return features.momentum[bundle];
        if (c.strategy === "reportTrend") return features.trend[bundle];
        if (c.strategy === "reportBreakout") return features.breakout[bundle];
        if (c.strategy === "trendEnsemble")
            return (features.momentum[bundle] + features.trend[bundle] + features.breakout[bundle]) / 3;
        if (c.strategy === "regimeMeanReversion") {
            if (!(features.adx <= (c.adxMax ?? 20)) || Math.abs(features.breakout[bundle]) >= .95) return NaN;
            return -Math.tanh(features.z[bundle] / 2);
        }
        return NaN;
    }
    function dynamicProfile(base,c) {
        const r=base.r, pattern=base.patternSign;
        if (!pattern || !(r.atr>0)) return null;
        const scoreSide=sign=>{
            const trendVotes=[base.directions[4]?.lows===sign,base.directions[4]?.highs===sign,
                sign*base.rawEma[240]>0,sign*base.rawMoves["240_1"]>0,
                sign*base.rawEma[60]>0,sign*base.rawMoves["60_1"]>0,
                sign*base.emaRaw>0,sign*base.emaSlopeRaw>0];
            const pullbackVotes=[sign===1?r.rsi<=50:r.rsi>=50,
                sign===1?r.low<=r.bollinger?.middle:r.high>=r.bollinger?.middle,
                sign===1?base.supportDistance<=.5:base.resistanceDistance<=.5,
                sign===1?base.supportTouches>=2:base.resistanceTouches>=2,
                sign===1?base.priorSession&&r.low<=base.priorSession.low&&r.close>base.priorSession.low
                    :base.priorSession&&r.high>=base.priorSession.high&&r.close<base.priorSession.high,
                sign*base.vwapRaw>=-.25];
            const trendWeight = c.profileMode === "trend" ? 1.5 : c.profileMode === "pullback" ? 0.75 : 1,
                pullbackWeight = c.profileMode === "pullback" ? 1.5 : c.profileMode === "trend" ? 0.75 : 1;
            return trendWeight*trendVotes.filter(Boolean).length+pullbackWeight*pullbackVotes.filter(Boolean).length;
        };
        const sideScore=scoreSide(pattern), oppositeScore=scoreSide(-pattern),
            liquid=base.spreadAtr<=(c.dynamicLiquidity==="strict"?.5:1) && base.rank<=(c.dynamicLiquidity==="strict"?5:17),
            normalVol=Number.isFinite(r.atrPercentile)&&r.atrPercentile>=.1&&r.atrPercentile<=.9,
            activeVolume=(r.volumeRatio??0)>=1,
            exhausted=Math.abs(base.sessionReturn)>2.5||base.sessionTravel>7,
            levelTouch=pattern===1?base.supportDistance<=.5:base.resistanceDistance<=.5;
        let required=c.baseScore??3;
        if (!liquid) required+=1;
        if (!normalVol) required+=1;
        if (exhausted) required+=1;
        if (levelTouch&&activeVolume) required-=1;
        required=Math.max(2,Math.min(10,required));
        if (c.dynamicLiquidity==="strict"&&!liquid) return null;
        const edge=sideScore-oppositeScore,
            accepted=sideScore>=required&&edge>=(c.minScoreEdge??0),
            entry=edge>=(c.minScoreEdge??0)+2&&liquid&&normalVol&&!exhausted?"market":"stop";
        return { accepted,sideScore,oppositeScore,edge,required,entry,
            regime:Math.abs(base.rawMoves["60_4"])>=1&&base.sessionEfficiency>=.3?"trend":"range",
            liquid,normalVol,activeVolume,exhausted,levelTouch,
            quality:edge+(liquid?1:-1)+(normalVol?1:-1)+(activeVolume?0.5:0)+(levelTouch?0.5:0) };
    }
    function alternativeSignal(base, c) {
        if (c.strategy === "productionScore") {
            if (!base.production) return null;
            const mask=c.productionMask??[0,1,2,3,4,5,6],maskBits=mask.reduce((bits,index)=>bits|(1<<index),0),
                count=bits=>{let total=0;for(;bits;bits&=bits-1)total++;return total;},
                sellMask=c.symmetricTrend
                    ? (base.production.sellMask&~1)|(base.production.symmetricSellTrend?1:0)
                    : base.production.sellMask,
                baseBuyScore=count(base.production.buyMask&maskBits),baseSellScore=count(sellMask&maskBits),
                threshold=c.productionThreshold??3,edge=c.productionEdge??0;
            let buyScore=baseBuyScore,sellScore=baseSellScore,kronosMove=NaN;
            if (["vote","detector"].includes(c.kronos?.mode)) {
                const prediction=forecasts.get(`${base.symbol}|${base.t}|${c.kronos.tf}`),
                    last=prediction?.bars?.[c.kronos.horizon-1];
                kronosMove=last&&base.r.atr>0?(last[3]-base.r.close)/base.r.atr:NaN;
                if(c.kronos.mode==="vote"&&Number.isFinite(kronosMove)&&Math.abs(kronosMove)>=c.kronos.threshold){
                    if(kronosMove>0)buyScore++;else if(kronosMove<0)sellScore++;
                }
            }
            let sign=0;
            if (c.productionTie==="buyPriority") sign=buyScore>=threshold?1:sellScore>=threshold?-1:0;
            else if (buyScore>=threshold&&buyScore-sellScore>=edge) sign=1;
            else if (sellScore>=threshold&&sellScore-buyScore>=edge) sign=-1;
            if (!sign) return null;
            if(c.kronos?.mode==="detector"){
                if(!Number.isFinite(kronosMove)||Math.abs(kronosMove)<c.kronos.threshold)return null;
                sign=Math.sign(kronosMove);
            }
            return {sign,mode:"trend",strength:sign===1?buyScore:sellScore,productionContext:{...base.production,buyScore,sellScore,
                baseBuyScore,baseSellScore,kronosMove,threshold,edge,mask,sign,
                regime:base.production.h4Trend===base.production.h1Trend?"aligned":"mixed"}};
        }
        if (c.strategy === "dynamicGreenred") {
            const profile = dynamicProfile(base,c);
            if (!profile?.accepted) return null;
            if (c.kronos?.mode === "detector") {
                const prediction = forecasts.get(`${base.symbol}|${base.t}|${c.kronos.tf}`),
                    last = prediction?.bars?.[c.kronos.horizon - 1],
                    move = last ? (last[3] - base.r.close) / base.r.atr : NaN;
                return Number.isFinite(move) && Math.abs(move) >= c.kronos.threshold
                    ? { sign: Math.sign(move), mode: "trend", strength: Math.abs(move), profile }
                    : null;
            }
            return {sign:base.patternSign,mode:"trend",strength:profile.quality,profile};
        }
        if(["adaptiveBbMomentum","adaptiveBbRsi","adaptiveBbPattern","m5ScalpScore"].includes(c.strategy)){
            const profile=base.adaptiveProfile,r=base.r;
            if(!profile||!r.bollinger||!(r.bollinger.upper>r.bollinger.lower))return null;
            const indexes={width:0,rsi:1,body:2,momentum2:3,momentum4:4,momentum8:5},
                value=key=>profile[indexes[key]],mean=key=>profile[6+indexes[key]],sd=key=>profile[12+indexes[key]],
                z=(input,key)=>(input-mean(key))/sd(key),
                bandPosition=(r.close-r.bollinger.lower)/(r.bollinger.upper-r.bollinger.lower),
                lowerRejection=r.low<=r.bollinger.lower&&r.close>r.bollinger.lower,
                upperRejection=r.high>=r.bollinger.upper&&r.close<r.bollinger.upper,
                momentumKey=`momentum${c.lookback??4}`,momentumZ=z(value(momentumKey),momentumKey),
                widthZ=z(value("width"),"width"),rsiLow=mean("rsi")-(c.rsiZ??1)*sd("rsi"),
                rsiHigh=mean("rsi")+(c.rsiZ??1)*sd("rsi");
            let sign=0,mode="trend",strength=0;
            if(c.strategy==="adaptiveBbMomentum"){
                if(widthZ<(c.widthZ??-.5))return null;
                if(bandPosition>=(c.bandPosition??1)&&momentumZ>=(c.impulseZ??.5))sign=1;
                else if(bandPosition<=1-(c.bandPosition??1)&&momentumZ<=-(c.impulseZ??.5))sign=-1;
                strength=Math.abs(momentumZ)+Math.max(0,widthZ);
            }else if(c.strategy==="adaptiveBbRsi"){
                mode="reversion";
                if(lowerRejection&&r.rsi<=rsiLow)sign=1;
                else if(upperRejection&&r.rsi>=rsiHigh)sign=-1;
                strength=Math.abs(z(r.rsi,"rsi"));
            }else if(c.strategy==="adaptiveBbPattern"){
                mode="reversion";
                const bodyZ=z(value("body"),"body");
                if(bodyZ<(c.bodyZ??0))return null;
                if(lowerRejection&&base.patternSign===1)sign=1;
                else if(upperRejection&&base.patternSign===-1)sign=-1;
                strength=Math.max(0,bodyZ)+1;
            }else{
                if(!base.patternSign)return null;
                sign=base.patternSign;
                mode=c.scoreMode==="continuation"?"trend":"reversion";
                const outer=mode==="reversion"
                    ?sign===1?lowerRejection:upperRejection
                    :sign===1?bandPosition>=c.bandPosition:bandPosition<=1-c.bandPosition;
                const rsiPass=mode==="reversion"
                    ?sign===1?r.rsi<=rsiLow:r.rsi>=rsiHigh
                    :sign===1?r.rsi>=rsiHigh:r.rsi<=rsiLow;
                const impulsePass=sign*momentumZ>=(c.impulseZ??0);
                const confirmationScore=1+Number(outer)+Number(rsiPass)+Number(impulsePass);
                if(confirmationScore<(c.confirmScore??3))return null;
                strength=confirmationScore+Math.abs(momentumZ)+Math.max(0,widthZ);
            }
            if(!sign)return null;
            if(c.requirePattern&&base.patternSign!==sign)return null;
            if(c.adaptiveContext){
                const context=base.adaptiveHigher[c.adaptiveContext],key="momentum4";
                if(!context||sign*context[indexes[key]]<=0)return null;
            }
            return {sign,mode,strength,sessionState:{adaptiveTf:base.tf,profileBars:200,
                bandPosition,widthZ,momentumZ,rsiLow,rsiHigh,
                confirmationScore:c.strategy==="m5ScalpScore"?(c.confirmScore??3):null,contextTf:c.adaptiveContext??0}};
        }
        if (["sessionContinuation","sessionReversal","sessionAdaptive"].includes(c.strategy)) {
            const state=base.priorSession;
            if(base.sessionAge!==base.tf||!state||!Number.isFinite(state.move)
                ||Math.abs(state.move)<(c.signalThreshold??0))return null;
            const liquid=!Number.isFinite(c.stateSpread)||(state.averageSpreadAtr<=c.stateSpread),
                active=!Number.isFinite(c.stateVolume)||(state.averageVolumeRatio>=c.stateVolume);
            if(!liquid||!active)return null;
            let sign=Math.sign(state.move),mode="trend";
            if(c.strategy==="sessionReversal"){sign*=-1;mode="reversion";}
            else if(c.strategy==="sessionAdaptive"&&state.efficiency<(c.regime??.5)){sign*=-1;mode="reversion";}
            return sign?{sign,mode,strength:Math.abs(state.move)*(0.5+state.efficiency),sessionState:state}:null;
        }
        if(c.strategy==="sessionOnline"){
            const prediction=base.sessionOnline?.[c.sessionModel];
            if(!prediction||prediction.samples<(c.sessionMinSamples??200)
                ||Math.abs(prediction.score)<(c.signalThreshold??0))return null;
            let score=prediction.score;
            if(c.sessionCalibration){
                const edge=prediction[`edge${c.sessionSkillWindow}`],minimum=c.sessionMinEdge??0;
                if(!Number.isFinite(edge)||prediction.calibrationSamples<c.sessionSkillWindow)return null;
                if(c.sessionCalibration==="align"&&edge<minimum)return null;
                if(c.sessionCalibration==="flip"){
                    if(Math.abs(edge)<minimum)return null;
                    score*=Math.sign(edge);
                }
            }
            return {sign:Math.sign(score),mode:"trend",strength:Math.abs(score),
                sessionState:{...base.priorSession,onlineScore:prediction.score,onlineSamples:prediction.samples,
                    onlineModel:c.sessionModel,calibration:c.sessionCalibration,
                    calibrationEdge:prediction[`edge${c.sessionSkillWindow}`]}};
        }
        if(c.strategy==="multiTimeframeTrend"){
            const threshold=c.signalThreshold??0,
                votes=[base.rawReturns[c.lookback??4],base.rawMoves["60_4"],base.rawMoves["240_1"],base.rawEma[240]]
                    .filter(Number.isFinite).map(value=>Math.abs(value)>=threshold?Math.sign(value):0),
                score=votes.reduce((sum,value)=>sum+value,0),sign=Math.sign(score);
            return sign&&Math.abs(score)>=3?{sign,mode:"trend",strength:Math.abs(score)}:null;
        }
        if(c.strategy==="greenredRaw")
            return base.patternSign?{sign:base.patternSign,mode:"trend",strength:1}:null;
        if(c.strategy==="rsiReversion"){
            const level=c.rsiLevel??30,previous=base.priorCandle;
            if(!previous||!Number.isFinite(previous.rsi)||!Number.isFinite(base.r.rsi))return null;
            if(previous.rsi<level&&base.r.rsi>=level)return {sign:1,mode:"reversion",strength:level-previous.rsi};
            if(previous.rsi>100-level&&base.r.rsi<=100-level)return {sign:-1,mode:"reversion",strength:previous.rsi-(100-level)};
            return null;
        }
        if(c.strategy==="bollingerRsi"){
            const r=base.r,level=c.rsiLevel??30;
            if(!r.bollinger||!Number.isFinite(r.rsi))return null;
            if(r.low<=r.bollinger.lower&&r.close>r.bollinger.lower&&r.rsi<=level)
                return {sign:1,mode:"reversion",strength:(level-r.rsi)/10+1};
            if(r.high>=r.bollinger.upper&&r.close<r.bollinger.upper&&r.rsi>=100-level)
                return {sign:-1,mode:"reversion",strength:(r.rsi-(100-level))/10+1};
            return null;
        }
        if(c.strategy==="macdTrend"){
            const r=base.r,previous=base.priorCandle,confirm=c.emaConfirm??false;
            if(!previous||![r.macdHistogram,previous.macdHistogram].every(Number.isFinite))return null;
            if(previous.macdHistogram<=0&&r.macdHistogram>0&&(!confirm||r.ema20>r.ema50))
                return {sign:1,mode:"trend",strength:Math.abs(r.macdHistogram/r.atr)};
            if(previous.macdHistogram>=0&&r.macdHistogram<0&&(!confirm||r.ema20<r.ema50))
                return {sign:-1,mode:"trend",strength:Math.abs(r.macdHistogram/r.atr)};
            return null;
        }
        if(c.strategy==="adxMomentum"){
            const r=base.r,momentum=base.rawReturns[c.lookback??4],level=c.adxLevel??20,
                threshold=c.signalThreshold??0;
            if(!Number.isFinite(r.adx)||r.adx<level||!Number.isFinite(momentum)||Math.abs(momentum)<threshold)return null;
            return {sign:Math.sign(momentum),mode:"trend",strength:Math.abs(momentum)*(r.adx/level)};
        }
        if(c.strategy==="engulfing"){
            const r=base.r,previous=base.priorCandle;
            if(!previous)return null;
            const bullish=r.close>r.open&&previous.close<previous.open&&r.open<=previous.close&&r.close>=previous.open,
                bearish=r.close<r.open&&previous.close>previous.open&&r.open>=previous.close&&r.close<=previous.open;
            return bullish?{sign:1,mode:"reversion",strength:r.bodyAtr+previous.bodyAtr}
                :bearish?{sign:-1,mode:"reversion",strength:r.bodyAtr+previous.bodyAtr}:null;
        }
        if(c.strategy==="pinBar"){
            const r=base.r,range=r.high-r.low,body=Math.max(Math.abs(r.close-r.open),range*.03),ratio=c.wickRatio??2;
            if(!(range>0))return null;
            const lower=Math.min(r.open,r.close)-r.low,upper=r.high-Math.max(r.open,r.close);
            if(lower>=ratio*body&&lower>=1.5*upper)return {sign:1,mode:"reversion",strength:lower/body};
            if(upper>=ratio*body&&upper>=1.5*lower)return {sign:-1,mode:"reversion",strength:upper/body};
            return null;
        }
        if(c.strategy==="insideBreakout"){
            const r=base.r,inside=base.priorCandle,mother=base.secondPriorCandle;
            if(!inside||!mother||inside.high>mother.high||inside.low<mother.low)return null;
            if(r.close>inside.high)return {sign:1,mode:"trend",strength:(r.close-inside.high)/r.atr};
            if(r.close<inside.low)return {sign:-1,mode:"trend",strength:(inside.low-r.close)/r.atr};
            return null;
        }
        if(c.strategy==="emaPullback"){
            const r=base.r,previous=base.priorCandle;
            if(!previous||![r.ema20,r.ema50,previous.ema20].every(Number.isFinite))return null;
            if(r.ema20>r.ema50&&previous.close<=previous.ema20&&r.close>r.ema20)
                return {sign:1,mode:"trend",strength:(r.ema20-r.ema50)/r.atr};
            if(r.ema20<r.ema50&&previous.close>=previous.ema20&&r.close<r.ema20)
                return {sign:-1,mode:"trend",strength:(r.ema50-r.ema20)/r.atr};
            return null;
        }
        if(c.strategy==="regimeSwitch"){
            const r=base.r,momentum=base.rawReturns[c.lookback??4],threshold=c.signalThreshold??0,
                trending=Number.isFinite(r.adx)?r.adx>=(c.adxLevel??20):(r.efficiency??0)>=(c.regime??.3);
            if(trending&&Number.isFinite(momentum)&&Math.abs(momentum)>=threshold)
                return {sign:Math.sign(momentum),mode:"trend",strength:Math.abs(momentum)};
            if(!trending&&Number.isFinite(base.z)&&Math.abs(base.z)>=Math.max(.5,threshold))
                return {sign:-Math.sign(base.z),mode:"reversion",strength:Math.abs(base.z)};
            return null;
        }
        if (c.kronos?.mode === "detector") {
            const prediction = forecasts.get(`${base.symbol}|${base.t}|${c.kronos.tf}`),
                last = prediction?.bars?.[c.kronos.horizon - 1],
                move = last ? (last[3] - base.r.close) / base.r.atr : NaN;
            return Number.isFinite(move) && Math.abs(move) >= c.kronos.threshold ? { sign: Math.sign(move), mode: "trend", strength: Math.abs(move) } : null;
        }
        const threshold = c.signalThreshold ?? 0,
            lookback = c.lookback ?? 4,
            momentum = base.rawReturns[lookback],
            previousMomentum = base.priorReturns[lookback],
            crossed = (value, previous) => Number.isFinite(value) && Math.abs(value) >= threshold
                && (!Number.isFinite(previous) || Math.abs(previous) < threshold || Math.sign(previous) !== Math.sign(value));
        if (reportStrategies.has(c.strategy)) {
            const bundle = Math.max(0, Math.min(2, c.bundle ?? 1)), current = base.report, previous = base.priorReport;
            if (!current || !previous) return null;
            const value = reportScore(current, c), prior = reportScore(previous, c);
            if (!crossed(value, prior)) return null;
            const sign = Math.sign(value);
            if (c.contextAlign) {
                const context = base.reportContext?.[c.htf || (base.tf === 15 ? 60 : 240)];
                if (!context) return null;
                const contextValue = (context.momentum[bundle] + context.trend[bundle] + context.breakout[bundle]) / 3;
                if (!Number.isFinite(contextValue) || sign * contextValue <= 0) return null;
            }
            return { sign, mode: c.strategy === "regimeMeanReversion" ? "reversion" : "trend", strength: Math.abs(value) };
        }
        if (c.strategy === "momentum")
            return crossed(momentum, previousMomentum) ? { sign: Math.sign(momentum), mode: "trend", strength: Math.abs(momentum) } : null;
        if (c.strategy === "breakout") {
            const up = base.breakoutUp[lookback], down = base.breakoutDown[lookback];
            if (up >= threshold && !(down >= threshold)) return { sign: 1, mode: "trend", strength: up };
            if (down >= threshold && !(up >= threshold)) return { sign: -1, mode: "trend", strength: down };
            return null;
        }
        if (c.strategy === "ema")
            return crossed(base.emaRaw, base.priorEmaRaw) ? { sign: Math.sign(base.emaRaw), mode: "trend", strength: Math.abs(base.emaRaw) } : null;
        if (c.strategy === "meanReversion")
            return crossed(base.z, base.priorZ) ? { sign: -Math.sign(base.z), mode: "reversion", strength: Math.abs(base.z) } : null;
        if (c.strategy === "vwapReversion")
            return crossed(base.vwapRaw, base.priorVwapRaw)
                ? { sign: -Math.sign(base.vwapRaw), mode: "reversion", strength: Math.abs(base.vwapRaw) }
                : null;
        if (c.strategy === "vwapMomentum")
            return crossed(base.vwapRaw, base.priorVwapRaw)
                ? { sign: Math.sign(base.vwapRaw), mode: "trend", strength: Math.abs(base.vwapRaw) }
                : null;
        if (c.strategy === "trendPullback") {
            const trend = base.rawMoves[(c.htf || 60) + "_" + (c.hbars || 1)], sign = Math.sign(trend);
            return sign && Math.abs(trend) >= threshold && base.patternSign === sign ? { sign, mode: "trend", strength: Math.abs(trend) } : null;
        }
        if (c.strategy === "sessionMomentum" || c.strategy === "sessionReversion") {
            if (base.sessionAge !== base.tf) return null;
            const trend = base.rawMoves[(c.htf || 240) + "_" + (c.hbars || 1)],
                sign = Math.sign(trend) * (c.strategy === "sessionReversion" ? -1 : 1);
            return sign && Math.abs(trend) >= threshold ? { sign, mode: c.strategy === "sessionReversion" ? "reversion" : "trend", strength: Math.abs(trend) } : null;
        }
        if (c.strategy === "openingMomentum" || c.strategy === "openingReversion") {
            if (base.sessionAge !== lookback * base.tf || !Number.isFinite(base.sessionReturn)) return null;
            const sign = Math.sign(base.sessionReturn) * (c.strategy === "openingReversion" ? -1 : 1);
            return sign && Math.abs(base.sessionReturn) >= threshold
                ? { sign, mode: c.strategy === "openingReversion" ? "reversion" : "trend", strength: Math.abs(base.sessionReturn) }
                : null;
        }
        if (c.strategy === "adaptive") {
            const trending = (base.r.efficiency ?? 0) >= c.regime;
            if (trending) return crossed(momentum, previousMomentum) ? { sign: Math.sign(momentum), mode: "trend", strength: Math.abs(momentum) } : null;
            return crossed(base.z, base.priorZ) ? { sign: -Math.sign(base.z), mode: "reversion", strength: Math.abs(base.z) } : null;
        }
        return null;
    }
    function signedAlternative(base, c) {
        const signal = alternativeSignal(base, c);
        if (!signal?.sign) return null;
        const { sign, mode, strength } = signal, r = base.r,
            reversion = mode === "reversion",
            bb = reversion
                ? sign === 1 ? r.low <= r.bollinger?.lower : r.high >= r.bollinger?.upper
                : sign === 1 ? r.close >= r.bollinger?.middle : r.close <= r.bollinger?.middle,
            room = sign === 1 ? (r.bollinger?.upper - r.askClose) / r.atr : (r.close - r.bollinger?.lower) / r.atr,
            rsi = reversion ? (sign === 1 ? r.rsi <= 35 : r.rsi >= 65) : (sign === 1 ? r.rsi >= 55 : r.rsi <= 45),
            ema = sign * base.emaRaw,
            emaSlope = sign * base.emaSlopeRaw,
            moves = Object.fromEntries(Object.entries(base.rawMoves).map(([key,value]) => [key, value * sign])),
            score = [bb, rsi, base.vol].filter(Boolean).length;
        return { ...base, sign, signalMode: mode, signalStrength: strength, dynamicProfile:signal.profile,sessionState:signal.sessionState,
            productionContext:signal.productionContext, signalAtr:signal.productionContext?.atr??base.signalAtr,
            bb, room, rsi, ema, emaSlope, moves, score,
            quality: strength + score + (r.efficiency ?? 0) + (r.volumeRatio ?? 0) - base.spreadAtr };
    }
    function allowed(e, c, stress) {
        const r = e.r;
        if (c.onlySymbol && c.onlySymbol !== e.symbol) return false;
        if (c.symbols && !c.symbols.includes(e.symbol)) return false;
        if (c.excludeSymbol && c.excludeSymbol === e.symbol) return false;
        if (c.sessions && !c.sessions.includes(e.s)) return false;
        if (c.entryCutoff > 0 && e.t > e.sessionEnd - c.entryCutoff * MIN) return false;
        if ((c.strategy ?? "greenred") === "greenred" && !c.skipDirection && c.kronos?.mode !== "detector") {
            const direction = c.direction === "side" ? (e.sign === 1 ? "highs" : "lows") : c.direction;
            if (e.directions[c.pivotWidth]?.[direction] !== e.sign) return false;
        }
        if (c.higherSwing && e.higherSwings[c.higherSwing] !== e.sign) return false;
        if (options.humanWaveContinuation) {
            if (!e.wave || e.wave.progressAtr < c.waveMinProgress || e.wave.impulseBars < c.waveMinBars
                || e.wave.correctionBars < c.correctionMin || e.wave.correctionBars > c.correctionMax) return false;
            const priorMove=e.priorSession?.move;
            if(c.memoryMode==="align"&&(!Number.isFinite(priorMove)||e.sign*priorMove<c.memoryThreshold))return false;
            if(c.memoryMode==="avoidOpposite"&&Number.isFinite(priorMove)&&e.sign*priorMove<-c.memoryThreshold)return false;
            if(c.memoryMode==="meanRevert"&&(!Number.isFinite(priorMove)||e.sign*priorMove>-c.memoryThreshold))return false;
        }
        const pairRank=e.ranks?.[c.pairRankMode??"spread"]??e.rank;
        if (
            pairRank > c.pool ||
            e.spreadAtr * stress > c.spread ||
            r.bodyRatio < c.body ||
            r.bodyAtr < c.bodyAtr ||
            r.efficiency < c.eff ||
            r.activity < c.activity ||
            r.atrPercentile < c.atrMin ||
            r.atrPercentile > c.atrMax
        )
            return false;
        if (c.volume > 0 && (r.volumeRatio ?? 0) < c.volume) return false;
        if (c.rsiMode === "notExtreme" && (e.sign === 1 ? e.rsiValue > c.rsiHigh : e.rsiValue < c.rsiLow)) return false;
        if (c.rsiMode === "momentum" && (e.sign === 1 ? e.rsiValue < c.rsiMid : e.rsiValue > 100 - c.rsiMid)) return false;
        if (c.rsiMode === "pullback" && (e.sign === 1
            ? e.rsiValue < c.rsiLow || e.rsiValue > c.rsiMid
            : e.rsiValue > c.rsiHigh || e.rsiValue < 100 - c.rsiMid)) return false;
        if (c.rsiMode === "reversal" && (e.sign === 1 ? e.rsiValue > c.rsiLow : e.rsiValue < c.rsiHigh)) return false;
        if (c.bbMode === "room" && e.room < c.room) return false;
        if (c.bbMode === "breakout" && (e.sign === 1 ? e.bandPosition < 1 : e.bandPosition > 0)) return false;
        if (c.bbMode === "roomOrBreakout" && !(e.room >= c.room || (e.sign === 1 ? e.bandPosition >= 1 : e.bandPosition <= 0))) return false;
        if (c.ema > 0 && !(e.ema >= c.ema)) return false;
        if (c.emaSlope > 0 && !(e.emaSlope >= c.emaSlope)) return false;
        if (c.filter === "volume" && !e.vol) return false;
        if ((c.filter === "rsi" && !e.rsi) || (c.filter === "bb" && !(e.bb || e.room >= c.room)) || (c.filter === "score" && e.score < c.score)) return false;
        if (c.htf && !reportStrategies.has(c.strategy) && !c.strategy?.startsWith("session") && !(e.moves[c.htf + "_" + c.hbars] >= c.hmove)) return false;
        if (c.kronos && !kronosPass(e, c)) return false;
        if (c.qualityScreen && qualityBreakdown(e,c).total < c.qualityScreen.minimum) return false;
        return true;
    }
    function kronosPass(e, c) {
        const k = c.kronos, prediction = forecasts.get(`${e.symbol}|${e.t}|${k.tf}`);
        if (!prediction || prediction.contextEnd > e.t) return false;
        const bars = prediction.bars.slice(0, k.horizon), last = bars.at(-1);
        if (!last) return false;
        const move = e.sign * (last[3] - e.r.close) / e.r.atr;
        const pathMoves = (prediction.paths ?? []).map(path => path[k.horizon - 1])
            .filter(Boolean).map(bar => e.sign * (bar[3] - e.r.close) / e.r.atr).filter(Number.isFinite);
        const ordered = [...pathMoves].sort((a, b) => a - b);
        const medianMove = ordered.length ? ordered[Math.floor(ordered.length / 2)] : move;
        const alignedProbability = pathMoves.length ? pathMoves.filter(value => value > 0).length / pathMoves.length : null;
        const meanPathMove = pathMoves.length ? pathMoves.reduce((sum, value) => sum + value, 0) / pathMoves.length : move;
        const dispersion = pathMoves.length > 1
            ? Math.sqrt(pathMoves.reduce((sum, value) => sum + (value - meanPathMove) ** 2, 0) / pathMoves.length)
            : 0;
        if (k.mode === "quality" || k.mode === "vote") return Number.isFinite(move);
        if (k.mode === "screener") return Number.isFinite(move);
        if (k.mode === "consensus") return Number.isFinite(medianMove) && alignedProbability !== null
            && medianMove >= k.threshold && alignedProbability >= k.probability
            && dispersion <= (k.maxDispersion ?? Infinity);
        if (k.mode === "veto") return move >= -k.threshold;
        if (k.mode === "room") {
            const l = levels(e, c, 1, null, 0);
            if (!l) return false;
            const spread = e.r.askClose - e.r.close;
            const favorable = e.sign === 1 ? Math.max(...bars.map(b=>b[1])) - l.entry : l.entry - Math.min(...bars.map(b=>b[2])) - spread;
            const adverse = e.sign === 1 ? l.entry - Math.min(...bars.map(b=>b[2])) : Math.max(...bars.map(b=>b[1])) + spread - l.entry;
            return move >= 0 && favorable / l.dist >= k.threshold && adverse / l.dist <= k.adverse;
        }
        let travelled = 0, previous = e.r.close;
        for (const b of bars) { travelled += Math.abs(b[3] - previous); previous = b[3]; }
        const efficiency = travelled > 0 ? Math.abs(last[3] - e.r.close) / travelled : 0;
        return move >= k.threshold && efficiency >= k.efficiency;
    }
    function kronosQuality(e, c) {
        const k = c.kronos, prediction = forecasts.get(`${e.symbol}|${e.t}|${k.tf}`);
        if (!prediction || prediction.contextEnd > e.t) return -Infinity;
        const pathMoves = (prediction.paths ?? []).map(path => path[k.horizon - 1]).filter(Boolean)
            .map(bar => e.sign * (bar[3] - e.r.close) / e.r.atr).filter(Number.isFinite).sort((a, b) => a - b);
        if (pathMoves.length) {
            const median = pathMoves[Math.floor(pathMoves.length / 2)];
            const mean = pathMoves.reduce((sum, value) => sum + value, 0) / pathMoves.length;
            const dispersion = Math.sqrt(pathMoves.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pathMoves.length);
            return median - dispersion;
        }
        const last = prediction.bars[k.horizon - 1];
        return last ? e.sign * (last[3] - e.r.close) / e.r.atr : -Infinity;
    }
    const clamp01 = value => Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
    function qualityBreakdown(e,c){
        const wave=e.wave??{},r=e.r;
        const correctionQuality=clamp01(1-Math.max(0,(wave.correctionBars??1)-3)/13);
        const retrace=wave.retraceRatio??0,
            retraceQuality=retrace<.15?clamp01(retrace/.15):retrace<=.7?1:clamp01(1-(retrace-.7)/.8),
            closeQuality=clamp01(wave.signalCloseLocation??.5);
        const pa=100*(.3*clamp01((wave.progressAtr??0)/.75)+.15*clamp01((r.bodyAtr??0)/.4)
            +.15*clamp01((wave.impulseBars??0)/3)+.1*correctionQuality+.2*retraceQuality+.1*closeQuality);
        const directionalRsi=e.sign===1?e.rsiValue:100-e.rsiValue;
        const rsi=100*clamp01(directionalRsi<=30?.15+(directionalRsi/30)*.25
            :directionalRsi<=50?.4+(directionalRsi-30)/20*.6
            :directionalRsi<=68?1-(directionalRsi-50)/18*.3
            :directionalRsi<=78?.7-(directionalRsi-68)/10*.7:0);
        const breakout=e.sign===1?e.bandPosition>=1:e.bandPosition<=0;
        const bollinger=100*clamp01(breakout?.85:(e.room??0)/1.5);
        const volume=100*clamp01((r.volumeRatio??0)/1.5);
        const k=c.kronos,prediction=k?forecasts.get(`${e.symbol}|${e.t}|${k.tf}`):null;
        const pathMoves=(prediction?.paths??[]).map(path=>path[k.horizon-1]).filter(Boolean)
            .map(bar=>e.sign*(bar[3]-r.close)/r.atr).filter(Number.isFinite).sort((a,b)=>a-b);
        const fallback=prediction?.bars?.[k?.horizon-1],fallbackMove=fallback?e.sign*(fallback[3]-r.close)/r.atr:0;
        const median=pathMoves.length?pathMoves[Math.floor(pathMoves.length/2)]:fallbackMove;
        const mean=pathMoves.length?pathMoves.reduce((sum,value)=>sum+value,0)/pathMoves.length:fallbackMove;
        const dispersion=pathMoves.length>1?Math.sqrt(pathMoves.reduce((sum,value)=>sum+(value-mean)**2,0)/pathMoves.length):0;
        const alignedProbability=pathMoves.length?pathMoves.filter(value=>value>0).length/pathMoves.length:.5;
        const kronos=100*clamp01(.55*alignedProbability+.45*(.5+.5*Math.tanh(median/.25))-.2*clamp01(dispersion/.5));
        const weights=c.qualityScreen?.weights??{pa:1,rsi:0,bollinger:0,volume:0,kronos:0},
            weightSum=Object.values(weights).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0),
            total=weightSum>0?(weights.pa*pa+weights.rsi*rsi+weights.bollinger*bollinger
                +weights.volume*volume+weights.kronos*kronos)/weightSum:pa;
        return {total,pa,rsi,bollinger,volume,kronos,retraceQuality,closeQuality,
            alignedProbability,medianMoveAtr:median,dispersionAtr:dispersion};
    }
    function ask(r, key, stress) {
        return r[key] + (r["ask" + key[0].toUpperCase() + key.slice(1)] - r[key]) * stress;
    }
    function levels(e, c, stress, rows, index) {
        const r = e.r,
            atr = e.signalAtr ?? r.atr,
            sp = (r.askClose - r.close) * stress,
            sg = e.sign,
            point = 10 ** -rules[e.symbol].decimals,
            entrySteps = (c.offsetSteps ?? 0) * point,
            stopSteps = (c.bufferSteps ?? 0) * point,
            entryStyle = c.entry === "adaptive" ? e.dynamicProfile?.entry ?? "stop" : c.entry;
        let entry =
            entryStyle === "stop"
                ? sg === 1
                    ? r.high + sp + atr * c.offset + entrySteps
                    : r.low - atr * c.offset - entrySteps
                : entryStyle === "limit"
                  ? sg === 1
                      ? r.close + sp - atr * c.offset
                      : r.close + atr * c.offset
                  : sg === 1
                    ? rows ? ask(rows[index], "open", stress) : ask(r, "close", stress)
                    : rows ? rows[index].open : r.close;
        let stop;
        if (c.sl === "atr") stop = entry - sg * atr * c.stopAtr;
        else if (c.sl === "swing3") stop = sg === 1 ? e.lo3 - atr * c.buffer : e.hi3 + sp + atr * c.buffer;
        else if (c.sl === "swing6") stop = sg === 1 ? e.lo6 - atr * c.buffer : e.hi6 + sp + atr * c.buffer;
        else stop = sg === 1 ? r.low - atr * c.buffer - stopSteps : r.high + sp + atr * c.buffer + stopSteps;
        let dist = sg * (entry - stop);
        const minimumStop = Math.max(atr * c.minStop, entry * rules[e.symbol].minDistancePct / 100);
        if (dist < minimumStop) {
            dist = minimumStop;
            stop = entry - sg * dist;
        }
        if (!(dist > 0) || dist < sp * 1.5) return null;
        let target =
            c.tp === "none"
                ? null
            : c.tp === "vwap"
                ? sg === 1 ? e.sessionVwap : e.sessionVwap + sp
            : c.tp === "atr"
                ? entry + sg * atr * c.targetAtr
                : c.tp === "structure"
                  ? sg === 1
                      ? e.resistance
                      : e.support + sp
                  : entry + sg * dist * c.target;
        if (target !== null && sg * (target - entry) < dist * 0.35) return null;
        const digits = 10 ** rules[e.symbol].decimals;
        entry = Math.round(entry * digits) / digits;
        stop = Math.round(stop * digits) / digits;
        if (target !== null) target = Math.round(target * digits) / digits;
        dist = sg * (entry - stop);
        if (!(dist > 0) || dist + 1e-12 < entry * rules[e.symbol].minDistancePct / 100) return null;
        return { entry, stop, target, dist };
    }
    function gapMayHitStop(symbol, from, to, sign, stop, stress) {
        const rows = data.get(symbol).native15;
        let i = atOrBefore(rows, from),
            covered = from;
        for (; i >= 0 && i < rows.length && rows[i].t < to; i++) {
            const b = rows[i];
            if (b.t + 15 * MIN <= from) continue;
            if (b.t > covered) return true;
            covered = Math.max(covered, b.t + 15 * MIN);
            if (sign === 1 ? b.low <= stop : ask(b, "high", stress) >= stop) return true;
        }
        return covered < to;
    }
    function resolve(e, c, end, step, stress) {
        const rows = data.get(e.symbol)[step];
        let i = atOrBefore(rows, e.t - 1) + 1;
        if (!rows[i] || rows[i].t !== e.t) return null;
        const l = levels(e, c, stress, rows, i);
        if (!l) return null;
        const entryStyle = c.entry === "adaptive" ? e.dynamicProfile?.entry ?? "stop" : c.entry,
            expiry = Math.min(e.t + c.expiry * MIN, end),
            dailyFlat = Math.floor(e.t / DAY) * DAY + (new Date(e.t).getUTCDay() === 5 ? 1200 : 1320) * MIN,
            selectedNextSession = (rankUniverse(e.tf, e.sessionEnd, c.pairRankMode??"spread")[e.symbol] ?? 99) <= c.pool,
            handoffFlat = c.sessionHandoff && !selectedNextSession ? Math.min(dailyFlat, e.sessionEnd) : dailyFlat,
            flat = c.allowOvernight ? end : c.sessionFlat ? Math.min(dailyFlat, e.sessionEnd) : handoffFlat;
        let fill = null,
            fi = -1,
            ambiguous = 0;
        for (let k = i; k < rows.length && rows[k].t < expiry && rows[k].t < flat; k++) {
            const b = rows[k],
                ao = ask(b, "open", stress),
                ah = ask(b, "high", stress),
                al = ask(b, "low", stress);
            const touched =
                entryStyle === "market" || entryStyle === "stop"
                    ? entryStyle === "market" || (e.sign === 1 ? ah >= l.entry : b.low <= l.entry)
                    : e.sign === 1
                      ? al <= l.entry
                      : b.high >= l.entry;
            const invalid = e.sign === 1 ? b.low <= l.stop : ah >= l.stop;
            if (invalid && !touched) return { ...l, release: b.t + step * MIN, filled: false };
            if (!touched) continue;
            fill =
                entryStyle === "market"
                    ? e.sign === 1
                        ? ao
                        : b.open
                    : entryStyle === "stop"
                      ? e.sign === 1
                          ? Math.max(l.entry, ao)
                          : Math.min(l.entry, b.open)
                      : l.entry;
            fi = k;
            break;
        }
        if (fi < 0) return { ...l, release: Math.min(expiry, flat), filled: false };
        let activeStop = l.stop,
            activeTarget = l.target,
            trailActive = false,
            best = fill,
            close = null,
            ct = null,
            reason = null;
        const maxEnd = Math.min(rows[fi].t + c.hold * MIN, flat, end);
        let last = fi;
        for (let k = fi; k < rows.length && rows[k].t < maxEnd; k++) {
            const b = rows[k];
            last = k;
            if (k > fi && b.t - rows[k - 1].t > step * MIN && gapMayHitStop(e.symbol, rows[k - 1].t + step * MIN, b.t, e.sign, activeStop, stress)) {
                close = e.sign === 1 ? Math.min(activeStop, b.open) : Math.max(activeStop, ask(b, "open", stress));
                ct = b.t;
                reason = "data_gap";
                break;
            }
            const ao = ask(b, "open", stress),
                ah = ask(b, "high", stress),
                al = ask(b, "low", stress),
                ac = ask(b, "close", stress);
            const sl = e.sign === 1 ? b.low <= activeStop : ah >= activeStop;
            const tp = activeTarget !== null && (e.sign === 1 ? b.high >= activeTarget : al <= activeTarget);
            if (sl && tp) ambiguous++;
            if (sl) {
                close = e.sign === 1 ? Math.min(activeStop, b.open) : Math.max(activeStop, ao);
                ct = b.t + step * MIN;
                reason = activeStop === l.stop ? "stop" : trailActive ? "trailing" : "breakeven";
                break;
            }
            if (tp && (k !== fi || entryStyle === "market")) {
                close = activeTarget;
                ct = b.t + step * MIN;
                reason = "target";
                break;
            }
            if (c.be !== null && e.sign * ((e.sign === 1 ? b.close : ac) - fill) >= l.dist * c.be)
                activeStop = e.sign === 1 ? Math.max(activeStop, fill) : Math.min(activeStop, fill);

            const executable = e.sign === 1 ? b.close : ac;
            best = e.sign === 1 ? Math.max(best, executable) : Math.min(best, executable);
            if (c.trail !== "off" && e.sign * (executable - fill) >= l.dist * c.activation) {
                const first = Math.max(fi, k - Math.ceil(15 / step)),
                    move = e.sign * (b.close - rows[first].close);
                let path = 0;
                for (let j = first + 1; j <= k; j++) path += Math.abs(rows[j].close - rows[j - 1].close);
                const strong = move >= e.r.atr * c.burst && path > 0 && move / path >= 0.6;
                if (c.trail === "always" || strong) {
                    trailActive = true;
                    activeTarget = e.sign === 1 ? Infinity : -Infinity;
                    const distance = executable * rules[e.symbol].minDistancePct / 100;
                    const proposed = best - e.sign * l.dist * c.trailDistance;
                    const next = e.sign === 1 ? Math.min(proposed, executable - distance) : Math.max(proposed, executable + distance);
                    activeStop = e.sign === 1 ? Math.max(activeStop, next) : Math.min(activeStop, next);
                }
            }
            if (c.exitFamily === "opposite" && (b.t + step * MIN) % (c.tf * MIN) === 0) {
                const report = data.get(e.symbol).report?.[c.tf], closedAt = b.t + step * MIN,
                    signalIndex = report ? atOrBefore(report.rows, closedAt - c.tf * MIN) : -1,
                    nextBar = rows[k + 1];
                if (signalIndex >= 0 && report.rows[signalIndex].t + c.tf * MIN === closedAt
                    && e.sign * reportScore(report.features[signalIndex], c) <= -c.signalThreshold
                    && nextBar?.t === closedAt) {
                    close = e.sign === 1 ? nextBar.open : ask(nextBar, "open", stress);
                    ct = nextBar.t;
                    reason = "opposite_signal";
                    break;
                }
            }
        }
        if (close === null) {
            const b = rows[last];
            close = e.sign === 1 ? b.close : ask(b, "close", stress);
            ct = b.t + step * MIN;
            reason = ct >= flat ? "daily_flat" : "hold";
        }
        return {
            ...l,
            filled: true,
            trailActive,
            fill,
            opened: rows[fi].t,
            release: ct,
            closed: ct,
            close,
            reason,
            ambiguous,
            r: (e.sign * (close - fill)) / l.dist,
            fillRisk: (e.sign * (fill - l.stop)) / l.dist,
        };
    }
    function quotePerEuro(symbol, t) {
        const quote = symbol.slice(3);
        if (quote === "EUR") return 1;
        const direct = data.get("EUR" + quote)?.[60];
        if (direct) {
            const i = atOrBefore(direct, t - 60 * MIN);
            if (i >= 0) return direct[i].close;
        }
        const eu = data.get("EURUSD")[60],
            ui = atOrBefore(eu, t - 60 * MIN);
        if (ui < 0) return null;
        if (quote === "USD") return eu[ui].close;
        const usd = data.get("USD" + quote)?.[60];
        if (usd) {
            const i = atOrBefore(usd, t - 60 * MIN);
            return i >= 0 ? eu[ui].close * usd[i].close : null;
        }
        const inv = data.get(quote + "USD")?.[60];
        if (inv) {
            const i = atOrBefore(inv, t - 60 * MIN);
            return i >= 0 ? eu[ui].close / inv[i].close : null;
        }
        return null;
    }
    const eventFilterCache = new Map();
    function candidateEvents(c, start, end, stress) {
        const alternative = (c.strategy ?? "greenred") !== "greenred",
            sourceEvents = alternative ? marketEventsByTf.get(c.tf ?? 15) : eventsByTf.get(c.tf ?? 15);
        if (c.dailyStop || c.lossCap) return sourceEvents;
        const key = JSON.stringify([start, end, stress, c.tf ?? 15, c.pivotWidth, c.direction, c.higherSwing, c.pool,
            c.spread, c.body, c.bodyAtr, c.eff, c.activity, c.atrMin, c.atrMax, c.volume,
            c.filter, c.room, c.score, c.htf, c.hbars, c.hmove, c.kronos, c.onlySymbol, c.skipDirection,
            c.ema, c.emaSlope, c.sessions, c.entryCutoff, c.strategy, c.lookback, c.signalThreshold, c.regime,
            c.bundle, c.contextAlign, c.adxMax, c.excludeSymbol, c.profileMode, c.baseScore, c.minScoreEdge,
            c.dynamicLiquidity, c.symbols, c.productionMask, c.productionThreshold, c.productionEdge, c.productionTie,
            c.symmetricTrend,c.stateSpread,c.stateVolume,c.sessionModel,c.sessionMinSamples,c.sessionCalibration,
            c.sessionSkillWindow,c.sessionMinEdge,c.adaptiveContext,c.bandPosition,c.impulseZ,c.widthZ,c.rsiZ,c.bodyZ,
            c.requirePattern,c.scoreMode,c.confirmScore,c.rsiLevel,c.adxLevel,c.wickRatio,c.emaConfirm,
            c.rsiMode,c.rsiLow,c.rsiMid,c.rsiHigh,c.bbMode,c.waveMinProgress,c.waveMinBars,
            c.correctionMin,c.correctionMax,c.pairRankMode,c.memoryMode,c.memoryThreshold,c.qualityScreen]);
        if (!eventFilterCache.has(key)) {
            if (eventFilterCache.size >= (options.profitTournament?1:options.reportCandidates || options.dynamicProfiles || options.productionStudy ? 2
                : options.m5Scalping ? 32 : 5000)) eventFilterCache.clear();
            const filtered = [];
            for (const base of sourceEvents) {
                if (base.t < start) continue;
                if (base.t >= end) break;
                const e = alternative ? signedAlternative(base, c) : base;
                if (e && allowed(e, c, stress)) filtered.push(e);
            }
            if (c.qualityScreen) filtered.sort((a,b)=>a.t-b.t||qualityBreakdown(b,c).total-qualityBreakdown(a,c).total
                ||b.quality-a.quality||a.symbol.localeCompare(b.symbol));
            else if (c.kronos?.mode === "quality") filtered.sort((a, b) => a.t - b.t || kronosQuality(b, c) - kronosQuality(a, c)
                || b.quality - a.quality || a.symbol.localeCompare(b.symbol));
            else if (alternative) filtered.sort((a, b) => a.t - b.t || b.quality - a.quality || a.symbol.localeCompare(b.symbol));
            eventFilterCache.set(key, filtered);
        }
        return eventFilterCache.get(key);
    }
    function evaluate(c, start, end, step = 5, stress = 1, details = false) {
        let balance = 500,
            peak = 500,
            dd = 0,
            gp = 0,
            gl = 0,
            wins = 0,
            n = 0,
            sumR = 0,
            holdSum = 0,
            maxMargin = 0,
            maxNominalRisk = 0,
            maxFilledRisk = 0,
            maxOpenRisk = 0,
            ambiguous = 0,
            gaps = 0,
            trailed = 0;
        let placed = 0,
            expired = 0;
        const active = [],
            trades = [],
            sessions = Array(options.productionStudy?5:4).fill(0),
            pair = {},
            daily = new Map(),
            dailyR = new Map(),
            dailyTrades = new Map(),
            dailyWins = new Map(),
            dailyTradePnl = new Map(),
            dailySessions = Array.from({length:options.productionStudy?5:4},()=>new Set()),
            month = {},
            dailyStart = new Map();
        const dailyOrders = new Map(), sessionOrders = new Map(), pairSkill = new Map(), sessionPairSelections = new Map();
        const events = candidateEvents(c, start, end, stress);
        let dayLosses = new Map();
        const skillKey=(session,symbol)=>`${session}|${symbol}`;
        const selectedByPairMemory=(e,sessionKey)=>{
            if(!c.pairMemory)return true;
            if(!sessionPairSelections.has(sessionKey)){
                const ranks=rankUniverse(e.tf,e.t,c.pairRankMode??"opportunity"),memory=c.pairMemory;
                const candidates=symbols.map(symbol=>({symbol,rank:ranks[symbol]??99,
                    skill:pairSkill.get(skillKey(e.s,symbol))??{count:0,ewma:0}}))
                    .filter(item=>item.rank<=c.pool)
                    .sort((a,b)=>{
                        const adjusted=item=>item.skill.ewma*item.skill.count/(item.skill.count+memory.shrinkage)
                            +memory.exploration/Math.sqrt(item.skill.count+1);
                        return adjusted(b)-adjusted(a)||a.rank-b.rank||a.symbol.localeCompare(b.symbol);
                    }).slice(0,memory.pool).map(item=>item.symbol);
                sessionPairSelections.set(sessionKey,new Set(candidates));
            }
            return sessionPairSelections.get(sessionKey).has(e.symbol);
        };
        function settle(t) {
            active.sort((a, b) => a.release - b.release);
            while (active.length && active[0].release <= t) {
                const p = active.shift();
                if (!p.filled) {
                    expired++;
                    continue;
                }
                const exitConv = quotePerEuro(p.symbol, p.closed) ?? p.conv;
                const pnl = (p.units * p.sign * (p.close - p.fill)) / exitConv;
                balance += pnl;
                n++;
                wins += pnl > 0 ? 1 : 0;
                gp += Math.max(0, pnl);
                gl += Math.max(0, -pnl);
                sumR += p.r;
                if(c.pairMemory){
                    const key=skillKey(p.s,p.symbol),previous=pairSkill.get(key),alpha=c.pairMemory.alpha;
                    pairSkill.set(key,{count:(previous?.count??0)+1,
                        ewma:previous?alpha*p.r+(1-alpha)*previous.ewma:p.r});
                }
                holdSum += (p.closed - p.opened) / MIN;
                ambiguous += p.ambiguous;
                gaps += p.reason === "data_gap" ? 1 : 0;
                trailed += p.trailActive ? 1 : 0;
                peak = Math.max(peak, balance);
                dd = Math.max(dd, ((peak - balance) / peak) * 100);
                sessions[p.s]++;
                pair[p.symbol] = (pair[p.symbol] ?? 0) + pnl;
                const day = Math.floor(p.closed / DAY);
                daily.set(day, (daily.get(day) ?? 0) + pnl);
                dailyR.set(day, (dailyR.get(day) ?? 0) + p.r);
                const tradeDay = Math.floor(p.opened / DAY);
                dailyTrades.set(tradeDay, (dailyTrades.get(tradeDay) ?? 0) + 1);
                dailyWins.set(tradeDay, (dailyWins.get(tradeDay) ?? 0) + (pnl > 0 ? 1 : 0));
                dailyTradePnl.set(tradeDay, (dailyTradePnl.get(tradeDay) ?? 0) + pnl);
                dailySessions[p.s].add(tradeDay);
                const mo = iso(p.closed).slice(0, 7);
                month[mo] = (month[mo] ?? 0) + pnl;
                if (pnl < 0) dayLosses.set(day, (dayLosses.get(day) ?? 0) + 1);
                if (details)
                    trades.push({
                        symbol: p.symbol,
                        session: ["asia", "london", "overlap", "newYork", "offHours"][p.s],
                        side: p.sign === 1 ? "BUY" : "SELL",
                        signalAt: iso(p.signalAt),
                        opened: iso(p.opened),
                        closed: iso(p.closed),
                        entry: p.fill,
                        stop: p.stop,
                        target: p.target,
                        units: p.units,
                        pnl: +pnl.toFixed(2),
                        r: +p.r.toFixed(3),
                        reason: p.reason,
                        ...(p.productionContext?{productionContext:p.productionContext}:{}),
                        ...(p.sessionState?{sessionState:p.sessionState}:{}),
                    });
            }
        }
        for (const e of events) {
            if (e.t < start) continue;
            if (e.t >= end) break;
            settle(e.t);
            if (balance <= 0) break;
            const day = Math.floor(e.t / DAY);
            if (!dailyStart.has(day)) dailyStart.set(day, balance);
            if (c.dailyOrderCap > 0 && (dailyOrders.get(day) ?? 0) >= c.dailyOrderCap) continue;
            const sessionKey = `${day}|${e.s}`;
            if (!selectedByPairMemory(e,sessionKey)) continue;
            if (c.sessionOrderCap > 0 && (sessionOrders.get(sessionKey) ?? 0) >= c.sessionOrderCap) continue;
            if (c.dailyStop > 0 && (daily.get(day) ?? 0) <= -dailyStart.get(day) * c.dailyStop) continue;
            if (c.lossCap > 0 && (dayLosses.get(day) ?? 0) >= c.lossCap) continue;
            if (active.length >= c.slots || active.some((p) => p.symbol === e.symbol) || !allowed(e, c, stress)) continue;
            const outcome = resolve(e, c, end, step, stress);
            if (!outcome) continue;
            const conv = quotePerEuro(e.symbol, e.t);
            if (!(conv > 0)) continue;
            const usedMargin = active.reduce((s, p) => s + p.margin, 0),
                usedRisk = active.reduce((s, p) => s + p.risk, 0);
            const leverage = 100 / rules[e.symbol].marginFactor,
                marginPerUnit = outcome.entry / conv / leverage;
            const marginCap = Math.min(Math.max(0, 0.9 * balance - usedMargin), (0.9 * balance) / c.slots);
            const riskCap = Math.min(balance * c.risk, Math.max(0, balance * c.portfolioRisk - usedRisk));
            const units = Math.floor(Math.min((riskCap * conv) / outcome.dist, marginCap / marginPerUnit) / 100) * 100;
            if (units < rules[e.symbol].minDealSize) continue;
            const risk = (units * outcome.dist) / conv,
                margin = units * marginPerUnit;
            maxNominalRisk = Math.max(maxNominalRisk, (100 * risk) / balance);
            if (outcome.filled) maxFilledRisk = Math.max(maxFilledRisk, (100 * risk * outcome.fillRisk) / balance);
            maxOpenRisk = Math.max(maxOpenRisk, (100 * (usedRisk + risk)) / balance);
            maxMargin = Math.max(maxMargin, (100 * (usedMargin + margin)) / balance);
            active.push({ ...outcome, units, risk, margin, conv, symbol: e.symbol, sign: e.sign, s: e.s, signalAt: e.t,
                productionContext:e.productionContext,sessionState:e.sessionState });
            dailyOrders.set(day, (dailyOrders.get(day) ?? 0) + 1);
            sessionOrders.set(sessionKey, (sessionOrders.get(sessionKey) ?? 0) + 1);
            placed++;
        }
        settle(Infinity);
        const pnl = balance - 500;
        const dailyReturnPct = new Map([...daily].map(([day,value])=>[day,100*value/(dailyStart.get(day)??500)]));
        const calendarDays = [];
        for (let day = Math.floor(start / DAY); day * DAY < end; day++) {
            const weekday = new Date(day * DAY).getUTCDay();
            if (weekday !== 0 && weekday !== 6) calendarDays.push(day);
        }
        const activeDayKeys = [...daily.keys()], activeR = activeDayKeys.map(day => dailyR.get(day) ?? 0),
            activeReturns = activeDayKeys.map(day => dailyReturnPct.get(day) ?? 0),
            allR = calendarDays.map(day => dailyR.get(day) ?? 0), allReturns = calendarDays.map(day => dailyReturnPct.get(day) ?? 0);
        const quantile = (values, q) => {
            if (!values.length) return 0;
            const sorted = [...values].sort((a,b) => a-b), position = (sorted.length - 1) * q;
            const low = Math.floor(position), fraction = position - low;
            return sorted[low] + fraction * ((sorted[low + 1] ?? sorted[low]) - sorted[low]);
        };
        const calendarTradeCounts = calendarDays.map(day => dailyTrades.get(day) ?? 0);
        const threeTradeDays = calendarDays.filter(day => (dailyTrades.get(day) ?? 0) >= 3);
        const twoOfThreeDays = calendarDays.filter(day => {
            const count = dailyTrades.get(day) ?? 0,
                dayWins = dailyWins.get(day) ?? 0;
            return count >= 3 && dayWins * 3 >= count * 2 && (dailyTradePnl.get(day) ?? 0) > 0;
        });
        const sessionCoveragePct = dailySessions.map(days => calendarDays.length ? 100 * days.size / calendarDays.length : 0);
        let lossStreak = 0, maxLossStreak = 0;
        for (const value of allReturns) {
            lossStreak = value < 0 ? lossStreak + 1 : 0;
            maxLossStreak = Math.max(maxLossStreak, lossStreak);
        }
        const dailyStats = {
            calendarDays: calendarDays.length, activeDays: activeReturns.length,
            noTradeDays: calendarDays.length - activeReturns.length,
            positiveDays: activeReturns.filter(value => value > 0).length,
            negativeDays: activeReturns.filter(value => value < 0).length,
            positiveActivePct: activeReturns.length ? 100 * activeReturns.filter(value => value > 0).length / activeReturns.length : 0,
            positiveCalendarPct: calendarDays.length ? 100 * activeReturns.filter(value => value > 0).length / calendarDays.length : 0,
            meanCalendarReturnPct: allReturns.length ? allReturns.reduce((sum,value)=>sum+value,0) / allReturns.length : 0,
            meanCalendarR: allR.length ? allR.reduce((sum,value)=>sum+value,0) / allR.length : 0,
            medianActiveR: quantile(activeR, .5), p10ActiveR: quantile(activeR, .1), worstR: Math.min(0,...activeR),
            threeTradeDays: threeTradeDays.length,
            threeTradeDayPct: calendarDays.length ? 100 * threeTradeDays.length / calendarDays.length : 0,
            twoOfThreeDays: twoOfThreeDays.length,
            twoOfThreeCalendarPct: calendarDays.length ? 100 * twoOfThreeDays.length / calendarDays.length : 0,
            twoOfThreeAmongActivePct: threeTradeDays.length ? 100 * twoOfThreeDays.length / threeTradeDays.length : 0,
            averageTradesPerCalendarDay: calendarTradeCounts.length ? calendarTradeCounts.reduce((sum,value)=>sum+value,0) / calendarTradeCounts.length : 0,
            medianTradesPerCalendarDay: quantile(calendarTradeCounts, .5),
            sessionCoveragePct,
            minSessionCoveragePct: Math.min(...sessionCoveragePct),
            maxLossStreak,
        };
        for (const key of Object.keys(dailyStats)) if (typeof dailyStats[key] === "number") dailyStats[key] = +dailyStats[key].toFixed(3);
        return {
            returnPct: +(pnl / 5).toFixed(3),
            pnl: +pnl.toFixed(2),
            balance: +balance.toFixed(2),
            trades: n,
            winRate: n ? +((100 * wins) / n).toFixed(2) : 0,
            pf: gl ? +(gp / gl).toFixed(4) : gp ? 99 : 0,
            dd: +dd.toFixed(3),
            totalR: +sumR.toFixed(3),
            avgHoldMinutes: n ? +(holdSum / n).toFixed(1) : 0,
            placed,
            expired,
            sessions,
            positiveDays: [...daily.values()].filter((v) => v > 0).length,
            activeDays: daily.size,
            dailyStats,
            ...(details ? { dailyR: Object.fromEntries([...dailyR].map(([day,value])=>[iso(day*DAY).slice(0,10),+value.toFixed(4)])) } : {}),
            ...(details ? { dailyReturnPct: Object.fromEntries([...dailyReturnPct].map(([day,value])=>[iso(day*DAY).slice(0,10),+value.toFixed(4)])) } : {}),
            month: Object.fromEntries(Object.entries(month).map(([k, v]) => [k, +v.toFixed(2)])),
            pair: Object.fromEntries(Object.entries(pair).map(([k, v]) => [k, +v.toFixed(2)])),
            maxNominalRisk: +maxNominalRisk.toFixed(3),
            maxFilledRisk: +maxFilledRisk.toFixed(3),
            maxOpenRisk: +maxOpenRisk.toFixed(3),
            maxMargin: +maxMargin.toFixed(3),
            ambiguous,
            gaps,
            trailed,
            ...(details ? { detail: trades } : {}),
        };
    }

    function counterfactualFilterAudit(c,start,end){
        const source=eventsByTf.get(c.tf??15)??[],byFilter={},totals={rawSignals:0,filledSignals:0,passedSignals:0,
            passedFilled:0,passedWinners:0,passedLosers:0,passedTotalR:0};
        const record=(name,outcome)=>{
            const item=byFilter[name]??={blockedSignals:0,blockedFilled:0,missedWinners:0,avoidedLosers:0,flat:0,totalR:0};
            item.blockedSignals++;
            if(!outcome?.filled)return;
            item.blockedFilled++;item.totalR+=outcome.r;
            if(outcome.r>0)item.missedWinners++;else if(outcome.r<0)item.avoidedLosers++;else item.flat++;
        };
        for(const e of source){
            if(e.t<start)continue;if(e.t>=end)break;totals.rawSignals++;
            const outcome=resolve(e,c,end,1,1);if(outcome?.filled)totals.filledSignals++;
            const failures=[],r=e.r,pairRank=e.ranks?.[c.pairRankMode??"spread"]??e.rank;
            if(c.sessions&&!c.sessions.includes(e.s))failures.push("session");
            if(c.entryCutoff>0&&e.t>e.sessionEnd-c.entryCutoff*MIN)failures.push("sessionEntryCutoff");
            if(pairRank>c.pool)failures.push(`pairRank:${c.pairRankMode??"spread"}`);
            if(e.spreadAtr>c.spread)failures.push("spread");
            if(r.bodyRatio<c.body)failures.push("signalBodyRatio");
            if(r.bodyAtr<c.bodyAtr)failures.push("signalBodyAtr");
            if(r.efficiency<c.eff)failures.push("efficiency");
            if(r.activity<c.activity)failures.push("activity");
            if(r.atrPercentile<c.atrMin||r.atrPercentile>c.atrMax)failures.push("atrPercentile");
            if(c.volume>0&&(r.volumeRatio??0)<c.volume)failures.push("volume");
            if(c.rsiMode==="notExtreme"&&(e.sign===1?e.rsiValue>c.rsiHigh:e.rsiValue<c.rsiLow))failures.push("rsi:notExtreme");
            if(c.rsiMode==="momentum"&&(e.sign===1?e.rsiValue<c.rsiMid:e.rsiValue>100-c.rsiMid))failures.push("rsi:momentum");
            if(c.rsiMode==="pullback"&&(e.sign===1?e.rsiValue<c.rsiLow||e.rsiValue>c.rsiMid:e.rsiValue>c.rsiHigh||e.rsiValue<100-c.rsiMid))failures.push("rsi:pullback");
            if(c.rsiMode==="reversal"&&(e.sign===1?e.rsiValue>c.rsiLow:e.rsiValue<c.rsiHigh))failures.push("rsi:reversal");
            if(c.bbMode==="room"&&e.room<c.room)failures.push("bollinger:room");
            if(c.bbMode==="breakout"&&(e.sign===1?e.bandPosition<1:e.bandPosition>0))failures.push("bollinger:breakout");
            if(c.bbMode==="roomOrBreakout"&&!(e.room>=c.room||(e.sign===1?e.bandPosition>=1:e.bandPosition<=0)))failures.push("bollinger:roomOrBreakout");
            if(c.htf&&!(e.moves[c.htf+"_"+c.hbars]>=c.hmove))failures.push("higherTimeframeMove");
            if(e.wave&&(e.wave.progressAtr<c.waveMinProgress||e.wave.impulseBars<c.waveMinBars))failures.push("waveQuality");
            if(e.wave&&(e.wave.correctionBars<c.correctionMin||e.wave.correctionBars>c.correctionMax))failures.push("correctionLength");
            const priorMove=e.priorSession?.move;
            if(c.memoryMode==="align"&&(!Number.isFinite(priorMove)||e.sign*priorMove<c.memoryThreshold))failures.push("previousSession:align");
            if(c.memoryMode==="avoidOpposite"&&Number.isFinite(priorMove)&&e.sign*priorMove<-c.memoryThreshold)failures.push("previousSession:avoidOpposite");
            if(c.memoryMode==="meanRevert"&&(!Number.isFinite(priorMove)||e.sign*priorMove>-c.memoryThreshold))failures.push("previousSession:meanRevert");
            if(!failures.length){totals.passedSignals++;if(outcome?.filled){totals.passedFilled++;totals.passedTotalR+=outcome.r;
                if(outcome.r>0)totals.passedWinners++;else if(outcome.r<0)totals.passedLosers++;}}
            else for(const name of new Set(failures))record(name,outcome);
        }
        for(const item of Object.values(byFilter)){
            item.totalR=+item.totalR.toFixed(3);item.meanR=item.blockedFilled?+(item.totalR/item.blockedFilled).toFixed(3):0;
            item.blockedWinRatePct=item.blockedFilled?+(100*item.missedWinners/item.blockedFilled).toFixed(2):0;
        }
        totals.passedTotalR=+totals.passedTotalR.toFixed(3);
        return {definition:"non-exclusive per-filter attribution; every raw signal is resolved independently on M1 with the selected exit",totals,byFilter};
    }

    const baseline = { ...RESEARCH_BASE };
    if(options.adaptivePairStudy){
        const common={...baseline,skipDirection:true,higherSwing:0,pool:5,spread:.5,body:0,bodyAtr:0,eff:0,
            activity:0,atrMin:0,atrMax:1,volume:0,filter:"none",score:0,htf:0,hmove:0,ema:0,emaSlope:0,
            entry:"market",offset:0,sl:"atr",buffer:0,minStop:.25,tp:"r",expiry:60,be:null,trail:"off",
            activation:1,trailDistance:1,burst:0,risk:.005,dailyStop:0,lossCap:0,sessions:[0,1,2,3],
            entryCutoff:0,dailyOrderCap:0,sessionOrderCap:2},seeds=[];
        const add=(family,strategy,tf,variants)=>variants.forEach((variant,index)=>seeds.push({family,
            base:{...common,strategy,tf,...variant,name:`${family}-${index+1}`}}));
        for(const tf of [15,60,240]){
            const contexts=tf===15?[0,60]:tf===60?[0,240]:[0],expand=variants=>contexts.flatMap(adaptiveContext=>
                variants.map(variant=>({...variant,adaptiveContext})));
            add(`bb-momentum-${tf}`,"adaptiveBbMomentum",tf,expand([
                {lookback:2,bandPosition:.8,impulseZ:.5,widthZ:-.5},
                {lookback:4,bandPosition:1,impulseZ:.5,widthZ:0},
                {lookback:8,bandPosition:.8,impulseZ:1,widthZ:-.5},
            ]));
            add(`bb-rsi-${tf}`,"adaptiveBbRsi",tf,expand([.5,1,1.5].map(rsiZ=>({rsiZ}))));
            add(`bb-pattern-${tf}`,"adaptiveBbPattern",tf,expand([0,.5,1].map(bodyZ=>({bodyZ}))));
        }
        const exits=[
            {exitName:"intraday-1r",target:1,hold:240,sessionFlat:true,allowOvernight:false},
            {exitName:"day-2r",target:2,hold:1440,sessionFlat:false,allowOvernight:true},
        ],grid=[];
        for(const seed of seeds)for(const stopAtr of [1.5,2.5])for(const exit of exits)for(const slots of [1,5]){
            const c={...seed.base,...exit,stopAtr,slots,portfolioRisk:.005*slots};
            c.name=[seed.base.name,exit.exitName,`sl${stopAtr}`,`slots${slots}`].join("-");
            grid.push({family:seed.family,c});
        }
        const compact=result=>({balance:result.balance,pnl:result.pnl,returnPct:result.returnPct,trades:result.trades,
            winRate:result.winRate,pf:result.pf,dd:result.dd,totalR:result.totalR,sessions:result.sessions,
            month:result.month,pair:result.pair,maxNominalRisk:result.maxNominalRisk,maxOpenRisk:result.maxOpenRisk,
            maxMargin:result.maxMargin,dailyStats:result.dailyStats}),
            foldBounds=[["2026-02-01","2026-03-01"],["2026-03-01","2026-04-01"],
                ["2026-04-01","2026-05-01"],["2026-05-01","2026-06-01"]],
            rate=(result,days)=>result.balance>0?100*Math.log(result.balance/500)/Math.max(1,days):-1e6,results=[];
        if(options.candidate){
            const c={...common,...options.candidate},riskSweep=[.005,.01,.02,.03].map(risk=>{
                const candidate={...c,risk,portfolioRisk:Math.min(.15,risk*c.slots)};
                return {riskPct:100*risk,test:compact(evaluate(candidate,VALEND,END,1)),
                    testStress125:compact(evaluate(candidate,VALEND,END,1,1.25)),full:compact(evaluate(candidate,START,END,1))};
            });
            let unchanged=sha(fs.readFileSync(new URL("./autoresearch/prepare.js",import.meta.url),"utf8"))===sourceHash;
            for(const symbol of symbols)for(const tf of [1,15]){
                const stat=fs.statSync(`${dir}/${symbol}_M${tf}.jsonl`),before=tf===1?coverage[symbol]:coverage[symbol].native15;
                unchanged&&=stat.size===before.size&&stat.mtimeMs===before.mtimeMs;
            }
            return {protocol:"adaptive-pair-rolling-200-candidate-v1",from:iso(START),trainEnd:iso(TRAINEND),
                validationEnd:iso(VALEND),to:iso(END),sourceHash,rulesHash,fileFingerprint,unchanged,config:c,
                train:compact(evaluate(c,START,TRAINEND,1)),validation:compact(evaluate(c,TRAINEND,VALEND,1)),
                validationStress125:compact(evaluate(c,TRAINEND,VALEND,1,1.25)),
                test:compact(evaluate(c,VALEND,END,1)),testStress125:compact(evaluate(c,VALEND,END,1,1.25)),
                full:compact(evaluate(c,START,END,1)),riskSweep};
        }
        for(let index=0;index<grid.length;index++){
            const {family,c}=grid[index],train=evaluate(c,START,TRAINEND,15),validation=evaluate(c,TRAINEND,VALEND,15),
                stress=evaluate(c,TRAINEND,VALEND,15,1.25),
                folds=foldBounds.map(([from,to])=>evaluate(c,Date.parse(from+"T00:00:00Z"),Date.parse(to+"T00:00:00Z"),15)),
                sufficient=train.trades>=30&&validation.trades>=20,
                eligible=sufficient&&train.returnPct>0&&validation.returnPct>0&&stress.returnPct>0
                    &&train.pf>1&&validation.pf>1&&stress.pf>=1
                    &&folds.filter(result=>result.returnPct>0&&result.pf>1).length>=3,
                score=(eligible?1e6:0)+(sufficient?0:-1e6)
                    +30*Math.min(rate(train,(TRAINEND-START)/DAY),rate(validation,(VALEND-TRAINEND)/DAY))
                    -.5*Math.max(train.dd,validation.dd)+.1*Math.min(...folds.map(result=>result.returnPct));
            results.push({family,c,train,validation,stress,folds,eligible,score});
            if((index+1)%48===0||index+1===grid.length)console.log("ADAPTIVE_PAIR_PROGRESS",JSON.stringify({done:index+1,total:grid.length}));
        }
        results.sort((a,b)=>b.score-a.score);
        const selected=results[0],report=result=>({family:result.family,config:result.c,
            developmentEligible:result.eligible,train:compact(result.train),validation:compact(result.validation),
            validationStress125:compact(result.stress),folds:result.folds.map(compact),
            test:compact(evaluate(result.c,VALEND,END,1)),testStress125:compact(evaluate(result.c,VALEND,END,1,1.25)),
            full:compact(evaluate(result.c,START,END,1))}),selectedReport=report(selected),
            familyChampions=[...new Set(results.map(result=>result.family))].map(family=>report(results.find(result=>result.family===family))),
            riskSweep=[.005,.01,.02,.03].map(risk=>{
                const c={...selected.c,risk,portfolioRisk:Math.min(.15,risk*selected.c.slots)};
                return {riskPct:100*risk,test:compact(evaluate(c,VALEND,END,1)),full:compact(evaluate(c,START,END,1))};
            });
        let unchanged=sha(fs.readFileSync(new URL("./autoresearch/prepare.js",import.meta.url),"utf8"))===sourceHash;
        for(const symbol of symbols)for(const tf of [1,15]){
            const stat=fs.statSync(`${dir}/${symbol}_M${tf}.jsonl`),before=tf===1?coverage[symbol]:coverage[symbol].native15;
            unchanged&&=stat.size===before.size&&stat.mtimeMs===before.mtimeMs;
        }
        return {protocol:"adaptive-pair-rolling-200-study-v1",from:iso(START),trainEnd:iso(TRAINEND),
            validationEnd:iso(VALEND),to:iso(END),testStatus:"previously-inspected chronological diagnostic",
            sourceHash,rulesHash,fileFingerprint,unchanged,scenarios:grid.length,
            profile:{scope:"per pair and timeframe",window:200,inputs:["Bollinger width and position","momentum 2/4/8",
                "RSI","candle body"],forbidden:["pair P&L","future candles","manual pair thresholds"]},
            developmentEligible:results.filter(result=>result.eligible).length,
            promotion:{status:"shadow-only",reason:"all chronological periods have been inspected; new forward data required"},
            selected:selectedReport,riskSweep,familyChampions,
            leaders:results.slice(0,12).map(result=>({family:result.family,config:result.c,
                developmentEligible:result.eligible,train:compact(result.train),validation:compact(result.validation),
                validationStress125:compact(result.stress)}))};
    }
    if(options.institutionalStudy){
        const sessionEvents=(marketEventsByTf.get(60)??[]).filter(event=>event.sessionAge===60&&event.priorSession),
            clip=(value,low=-3,high=3)=>Number.isFinite(value)?Math.max(low,Math.min(high,value)):0,
            featureNames=["bias","priorMove","priorRange","priorTravel","priorEfficiency","priorCloseLocation",
                "priorSpreadAtr","priorVolumeRatioLog","sessionGap","openingMove","atrPercentile","h4Move","h4Ema",
                "asia","london","overlap","newYork"],
            features=event=>{
                const state=event.priorSession;
                return [1,clip(state.move/3),clip(state.range/5,0,2),clip(state.travel/10,0,2),
                    clip(2*state.efficiency-1,-1,1),clip(2*state.closeLocation-1,-1,1),
                    clip(state.averageSpreadAtr,0,2),clip(Math.log(Math.max(.1,state.averageVolumeRatio)),-2,2),
                    clip(event.sessionGap/2),clip((event.r.close-event.r.open)/event.r.atr/2),
                    clip(2*(event.r.atrPercentile??.5)-1,-1,1),clip(event.rawMoves["240_1"]/2),
                    clip(event.rawEma[240]/2),...[0,1,2,3].map(session=>event.s===session?1:0)];
            },
            onlineSpecs=[
                {key:"h2-slow",horizon:2,learningRate:.03,l2:.001,forgetting:.9999},
                {key:"h2-fast",horizon:2,learningRate:.1,l2:.01,forgetting:.999},
                {key:"h4-slow",horizon:4,learningRate:.03,l2:.001,forgetting:.9999},
                {key:"h4-fast",horizon:4,learningRate:.1,l2:.01,forgetting:.999},
            ];
        for(const spec of onlineSpecs){
            const examples=sessionEvents.map(event=>{
                const rows=data.get(event.symbol)[60],targetStart=event.t+(spec.horizon-1)*60*MIN,
                    index=atOrBefore(rows,targetStart),target=rows[index],
                    label=target?.t===targetStart&&event.r.atr>0?(target.close-event.r.close)/event.r.atr:NaN;
                return {event,x:features(event),label,labelAt:event.t+spec.horizon*60*MIN};
            }),weights=Array(featureNames.length).fill(0),agreements=[];
            let mature=0,samples=0;
            for(const current of examples){
                while(mature<examples.length&&examples[mature].labelAt<=current.event.t){
                    const learned=examples[mature++];
                    if(!Number.isFinite(learned.label))continue;
                    const historical=learned.event.sessionOnline?.[spec.key]?.score;
                    if(Number.isFinite(historical)){
                        agreements.push(Math.sign(historical)*Math.sign(learned.label));
                        if(agreements.length>200)agreements.shift();
                    }
                    const prediction=Math.tanh(weights.reduce((sum,weight,index)=>sum+weight*learned.x[index],0)),
                        target=Math.tanh(learned.label),error=target-prediction,
                        importance=Math.max(.25,Math.min(2,Math.abs(learned.label)));
                    for(let index=0;index<weights.length;index++)weights[index]=spec.forgetting*(1-spec.learningRate*spec.l2)*weights[index]
                        +spec.learningRate*error*learned.x[index]*importance;
                    samples++;
                }
                const score=Math.tanh(weights.reduce((sum,weight,index)=>sum+weight*current.x[index],0));
                const edge=window=>agreements.length>=window
                    ?agreements.slice(-window).reduce((sum,value)=>sum+value,0)/window:NaN;
                current.event.sessionOnline??={};
                current.event.sessionOnline[spec.key]={score,samples,calibrationSamples:agreements.length,
                    edge50:edge(50),edge200:edge(200)};
            }
        }
        const common={...baseline,skipDirection:true,higherSwing:0,pool:5,spread:.5,body:0,bodyAtr:0,eff:0,
            activity:0,atrMin:0,atrMax:1,volume:0,filter:"none",score:0,htf:0,hmove:0,ema:0,emaSlope:0,
            entry:"market",offset:0,sl:"atr",buffer:0,minStop:.25,tp:"r",expiry:60,be:null,trail:"off",
            activation:1,trailDistance:1,burst:0,risk:.005,dailyStop:0,lossCap:0,sessions:[0,1,2,3],
            entryCutoff:0,dailyOrderCap:0,sessionOrderCap:2},seeds=[];
        const add=(family,strategy,tf,variants)=>variants.forEach((variant,index)=>seeds.push({family,
            base:{...common,strategy,tf,...variant,name:`${family}-${index+1}`}}));
        const states=[
            {signalThreshold:.5,regime:.3,stateSpread:1,stateVolume:0},
            {signalThreshold:1,regime:.5,stateSpread:.75,stateVolume:.75},
            {signalThreshold:1.5,regime:.7,stateSpread:.5,stateVolume:1},
        ];
        add("session-continuation","sessionContinuation",60,states);
        add("session-reversal","sessionReversal",60,states);
        add("session-adaptive","sessionAdaptive",60,states);
        for(const spec of onlineSpecs)add("session-online","sessionOnline",60,[.1,.2,.3].map(signalThreshold=>({
            sessionModel:spec.key,sessionMinSamples:200,signalThreshold,
        })));
        for(const spec of onlineSpecs)add("session-online-calibrated","sessionOnline",60,[
            {sessionCalibration:"align",sessionSkillWindow:50,sessionMinEdge:.05},
            {sessionCalibration:"flip",sessionSkillWindow:50,sessionMinEdge:.05},
            {sessionCalibration:"align",sessionSkillWindow:200,sessionMinEdge:.02},
            {sessionCalibration:"flip",sessionSkillWindow:200,sessionMinEdge:.02},
        ].map(calibration=>({sessionModel:spec.key,sessionMinSamples:200,signalThreshold:.2,...calibration})));
        add("multi-timeframe","multiTimeframeTrend",60,[
            {lookback:4,signalThreshold:.1},{lookback:8,signalThreshold:.25},{lookback:16,signalThreshold:.5},
        ]);
        add("h1-momentum","momentum",60,[
            {lookback:4,signalThreshold:.25},{lookback:8,signalThreshold:.5},{lookback:16,signalThreshold:.75},
        ]);
        add("h4-momentum","momentum",240,[
            {lookback:2,signalThreshold:.25},{lookback:4,signalThreshold:.5},{lookback:8,signalThreshold:.75},
        ]);
        add("h1-breakout","breakout",60,[
            {lookback:8,signalThreshold:0},{lookback:16,signalThreshold:.1},{lookback:32,signalThreshold:.25},
        ]);
        add("h4-breakout","breakout",240,[
            {lookback:4,signalThreshold:0},{lookback:8,signalThreshold:.1},{lookback:16,signalThreshold:.25},
        ]);
        const exits=[
            {exitName:"intraday-1r",target:1,hold:240,sessionFlat:true,allowOvernight:false},
            {exitName:"day-2r",target:2,hold:1440,sessionFlat:false,allowOvernight:true},
        ],grid=[];
        for(const seed of seeds)for(const stopAtr of [1.5,2.5])for(const exit of exits)for(const slots of [1,5]){
            const c={...seed.base,...exit,stopAtr,slots,portfolioRisk:.005*slots};
            c.name=[seed.family,seed.base.name.split("-").at(-1),exit.exitName,`sl${stopAtr}`,`slots${slots}`].join("-");
            grid.push({family:seed.family,c});
        }
        const compact=r=>({balance:r.balance,pnl:r.pnl,returnPct:r.returnPct,trades:r.trades,winRate:r.winRate,pf:r.pf,
            dd:r.dd,totalR:r.totalR,sessions:r.sessions,month:r.month,pair:r.pair,maxNominalRisk:r.maxNominalRisk,
            maxOpenRisk:r.maxOpenRisk,maxMargin:r.maxMargin,dailyStats:r.dailyStats}),
            foldBounds=[["2026-02-01","2026-03-01"],["2026-03-01","2026-04-01"],
                ["2026-04-01","2026-05-01"],["2026-05-01","2026-06-01"]],
            rate=(r,days)=>r.balance>0?100*Math.log(r.balance/500)/Math.max(1,days):-1e6,results=[];
        for(let index=0;index<grid.length;index++){
            const {family,c}=grid[index],train=evaluate(c,START,TRAINEND,15),validation=evaluate(c,TRAINEND,VALEND,15),
                stress=evaluate(c,TRAINEND,VALEND,15,1.25),folds=foldBounds.map(([from,to])=>evaluate(c,Date.parse(from+"T00:00:00Z"),Date.parse(to+"T00:00:00Z"),15)),
                sufficient=train.trades>=20&&validation.trades>=12,
                eligible=sufficient&&train.returnPct>0&&validation.returnPct>0
                    &&stress.returnPct>0&&train.pf>1&&validation.pf>1&&stress.pf>=1
                    &&folds.filter(r=>r.returnPct>0&&r.pf>1).length>=3,
                score=(eligible?1e6:0)+(sufficient?0:-1e6)
                    +30*Math.min(rate(train,(TRAINEND-START)/DAY),rate(validation,(VALEND-TRAINEND)/DAY))
                    -.5*Math.max(train.dd,validation.dd)+.1*Math.min(...folds.map(r=>r.returnPct));
            results.push({family,c,train,validation,stress,folds,eligible,score});
            if((index+1)%48===0||index+1===grid.length)console.log("INSTITUTIONAL_PROGRESS",JSON.stringify({done:index+1,total:grid.length}));
        }
        results.sort((a,b)=>b.score-a.score);
        const selected=results[0],report=x=>({family:x.family,config:x.c,eligible:x.eligible,
            train:compact(x.train),validation:compact(x.validation),validationStress125:compact(x.stress),
            folds:x.folds.map(compact),test:compact(evaluate(x.c,VALEND,END,1)),
            testStress125:compact(evaluate(x.c,VALEND,END,1,1.25)),full:compact(evaluate(x.c,START,END,1))}),
            familyChampions=[...new Set(results.map(x=>x.family))].map(family=>report(results.find(x=>x.family===family))),
            selectedReport=report(selected);
        let kronosStudy=null;
        if(options.kronosRuntime||options.kronosPlan){
            const possible=candidateEvents(selected.c,START,END,1),grouped=new Map(),aliases=new Map(),lookback=64;
            for(const event of possible){
                const rows=data.get(event.symbol)[60],index=atOrBefore(rows,event.t-60*MIN);
                if(index<lookback-1||event.t-(rows[index].t+60*MIN)>=60*MIN)continue;
                const signalKey=`${event.symbol}|${event.t}|60`,contextEnd=rows[index].t+60*MIN,
                    contextKey=`${event.symbol}|${contextEnd}|60`;
                if(!grouped.has(contextKey))grouped.set(contextKey,{key:contextKey,contextEnd,
                    rows:rows.slice(index-lookback+1,index+1).map(row=>[row.t,row.open,row.high,row.low,row.close])});
                if(!aliases.has(contextKey))aliases.set(contextKey,[]);
                aliases.get(contextKey).push(signalKey);
            }
            const jobs=[...grouped.values()],batches=[];
            for(let index=0;index<jobs.length;index+=8)batches.push({tf:60,horizon:2,jobs:jobs.slice(index,index+8)});
            const counts={qualifyingSignals:possible.length,contexts:jobs.length,batches:batches.length};
            console.log("INSTITUTIONAL_KRONOS_PLAN",JSON.stringify(counts));
            if(options.kronosPlan)return {protocol:"institutional-kronos-plan-v1",from:iso(START),to:iso(END),
                sourceHash,rulesHash,fileFingerprint,base:selectedReport.config,counts};
            const inference=await inferKronos(path.resolve(options.kronosRuntime),batches,prediction=>{
                for(const key of aliases.get(prediction.key)??[])forecasts.set(key,{contextEnd:prediction.contextEnd,bars:prediction.bars,paths:prediction.paths});
            },options.kronosModel,options.kronosSamples,options.kronosCache),forecastHash=sha(JSON.stringify([...forecasts])),configs=[];
            for(const slots of [1,5]){
                const shared={...selected.c,slots,risk:.005,portfolioRisk:.005*slots},schedule=`slots-${slots}`;
                configs.push({...shared,name:`session-online-no-kronos-${schedule}`});
                for(const horizon of [1,2]){
                    for(const threshold of [.1,.25,.5])for(const efficiency of [0,.6])configs.push({...shared,
                        name:`session-online-kronos-filter-h${horizon}-t${threshold}-e${efficiency}-${schedule}`,
                        kronos:{mode:"filter",tf:60,horizon,threshold,efficiency}});
                    for(const threshold of [.1,.25,.5])configs.push({...shared,
                        name:`session-online-kronos-veto-h${horizon}-t${threshold}-${schedule}`,
                        kronos:{mode:"veto",tf:60,horizon,threshold,efficiency:0}});
                    configs.push({...shared,name:`session-online-kronos-quality-h${horizon}-${schedule}`,
                        kronos:{mode:"quality",tf:60,horizon,threshold:0,efficiency:0}});
                    for(const threshold of [.5,1,1.5])for(const adverse of [.5,1])configs.push({...shared,
                        name:`session-online-kronos-room-h${horizon}-t${threshold}-a${adverse}-${schedule}`,
                        kronos:{mode:"room",tf:60,horizon,threshold,adverse}});
                }
            }
            const development=configs.map(c=>{
                const train=evaluate(c,START,TRAINEND,15),validation=evaluate(c,TRAINEND,VALEND,15),
                    stress=evaluate(c,TRAINEND,VALEND,15,1.25),
                    folds=foldBounds.map(([from,to])=>evaluate(c,Date.parse(from+"T00:00:00Z"),Date.parse(to+"T00:00:00Z"),15)),
                    sufficient=train.trades>=20&&validation.trades>=12,
                    eligible=sufficient&&train.returnPct>0&&validation.returnPct>0&&stress.returnPct>0
                        &&train.pf>1&&validation.pf>1&&stress.pf>=1
                        &&folds.filter(result=>result.returnPct>0&&result.pf>1).length>=3,
                    score=(eligible?1e6:0)+(sufficient?0:-1e6)
                        +30*Math.min(rate(train,(TRAINEND-START)/DAY),rate(validation,(VALEND-TRAINEND)/DAY))
                        -.5*Math.max(train.dd,validation.dd)+.1*Math.min(...folds.map(result=>result.returnPct));
                return {family:c.kronos?.mode??"no-kronos",c,train,validation,stress,folds,eligible,score};
            }).sort((a,b)=>b.score-a.score),models=development.filter(result=>result.c.kronos),modelSelected=models[0],
                modelReport=report(modelSelected),champions=[];
            for(const mode of ["filter","veto","quality","room"]){
                const champion=development.find(result=>result.c.kronos?.mode===mode);
                if(champion)champions.push(report(champion));
            }
            kronosStudy={counts,inference,forecastHash,scenarios:configs.length,
                eligibleModels:models.filter(result=>result.eligible).length,selected:modelReport,champions,
                promotion:{status:"rejected",reason:"development-selected model failed the chronological diagnostic"},
                leaders:models.slice(0,10).map(result=>({family:result.family,config:result.c,eligible:result.eligible,
                    train:compact(result.train),validation:compact(result.validation),validationStress125:compact(result.stress)}))};
        }
        let unchanged=sha(fs.readFileSync(new URL("./autoresearch/prepare.js",import.meta.url),"utf8"))===sourceHash;
        for(const symbol of symbols)for(const tf of [1,15]){
            const stat=fs.statSync(`${dir}/${symbol}_M${tf}.jsonl`),before=tf===1?coverage[symbol]:coverage[symbol].native15;
            unchanged&&=stat.size===before.size&&stat.mtimeMs===before.mtimeMs;
        }
        return {protocol:"institutional-causal-session-online-study-v2",from:iso(START),trainEnd:iso(TRAINEND),
            validationEnd:iso(VALEND),to:iso(END),testStatus:"previously-inspected chronological diagnostic",
            sourceHash,rulesHash,fileFingerprint,unchanged,scenarios:grid.length,
            developmentEligible:results.filter(x=>x.eligible).length,
            promotion:{status:"rejected",reason:"development-selected online model failed the chronological diagnostic"},
            stateSchema:["open","close","move","range","travel","efficiency","closeLocation","averageSpreadAtr",
                "averageVolumeRatio","high","low","sessionGap"],
            onlineSessionModel:{scope:"one universal pooled model; no pair identity or P&L features",features:featureNames,
                records:sessionEvents.length,minSamples:200,specs:onlineSpecs},
            selected:selectedReport,kronosStudy,familyChampions,leaders:results.slice(0,10).map(x=>({family:x.family,config:x.c,
                eligible:x.eligible,train:compact(x.train),validation:compact(x.validation),validationStress125:compact(x.stress)}))};
    }
    if (options.productionStudy) {
        const commitSymbols=["EURUSD","GBPUSD","EURGBP","AUDUSD","USDCAD"],
            common={...baseline,strategy:"productionScore",tf:15,pivotWidth:2,direction:"both",higherSwing:0,
                pool:17,spread:10,body:0,bodyAtr:0,eff:0,activity:0,atrMin:0,atrMax:1,volume:0,filter:"none",
                score:0,htf:0,hmove:0,ema:0,emaSlope:0,entry:"market",offset:0,sl:"atr",stopAtr:1.5,
                buffer:0,minStop:.25,tp:"r",target:2,expiry:15,hold:10080,be:null,trail:"off",activation:1,
                trailDistance:1,burst:0,slots:5,risk:.02,portfolioRisk:.1,dailyStop:0,lossCap:0,
                sessionFlat:false,allowOvernight:true,entryCutoff:0,sessionOrderCap:0,dailyOrderCap:0,
                sessions:[0,1,2,3,4],symbols:commitSymbols,productionMask:[0,1,2,3,4,5,6],
                productionThreshold:3,productionEdge:0,productionTie:"buyPriority",symmetricTrend:false};
        const exact={...common,name:"production-commit-signal-broker-corrected-sizing"};
        const masks=[
            {name:"all7",mask:[0,1,2,3,4,5,6],threshold:4},
            {name:"trend4",mask:[0,1,2,4],threshold:3},
            {name:"trend-pullback6",mask:[0,1,2,3,5,6],threshold:4},
            {name:"setup-entry5",mask:[2,3,4,5,6],threshold:3},
        ],universes=[
            {name:"commit5",symbols:commitSymbols,pool:17},
            {name:"liquid5",symbols:null,pool:5},
            {name:"all17",symbols:null,pool:17},
        ],grid=[];
        for(const mask of masks)for(const universe of universes)for(const target of [1,2])
        for(const hold of [240,1440])for(const slots of [1,5]){
            const c={...common,productionMask:mask.mask,productionThreshold:mask.threshold,productionTie:"edge",
                productionEdge:1,symmetricTrend:true,...universe,spread:.5,stopAtr:1.5,target,hold,slots,
                risk:.01,portfolioRisk:Math.min(.15,.01*slots)};
            c.name=[mask.name,`threshold${mask.threshold}`,"edge1","symmetric",
                universe.name,"spread-0.5","sl-1.5atr",`tp-${target}r`,
                `hold-${hold}`,`slots-${slots}`].join("-");
            grid.push(c);
        }
        const allGrid=[...new Map(grid.map(c=>[JSON.stringify(Object.fromEntries(Object.entries(c).filter(([key])=>key!=="name"))),c])).values()],
            uniqueGrid=Number.isInteger(options.evaluations)&&options.evaluations>0?allGrid.slice(0,options.evaluations):allGrid,
            compact=r=>({balance:r.balance,pnl:r.pnl,returnPct:r.returnPct,trades:r.trades,winRate:r.winRate,pf:r.pf,
                dd:r.dd,totalR:r.totalR,placed:r.placed,expired:r.expired,sessions:r.sessions,month:r.month,pair:r.pair,
                maxNominalRisk:r.maxNominalRisk,maxOpenRisk:r.maxOpenRisk,maxMargin:r.maxMargin,dailyStats:r.dailyStats}),
            rate=(r,days)=>r.balance>0?100*Math.log(r.balance/500)/Math.max(1,days):-1e6,
            trainDays=(TRAINEND-START)/DAY,validationDays=(VALEND-TRAINEND)/DAY,
            rank=x=>{
                const eligible=x.train.trades>=20&&x.validation.trades>=20&&x.train.returnPct>0&&x.validation.returnPct>0
                    &&x.train.pf>1&&x.validation.pf>1;
                const score=Math.min(rate(x.train,trainDays),rate(x.validation,validationDays))*30-.4*Math.max(x.train.dd,x.validation.dd);
                return {eligible,score:(eligible?1e6:0)+score};
            },results=[];
        for(let index=0;index<uniqueGrid.length;index++){
            const c=uniqueGrid[index],train=evaluate(c,START,TRAINEND,15),validation=evaluate(c,TRAINEND,VALEND,15),
                ranked=rank({train,validation});
            results.push({c,train,validation,...ranked});
            if((index+1)%500===0||index+1===uniqueGrid.length)console.log("PRODUCTION_PROGRESS",JSON.stringify({done:index+1,total:uniqueGrid.length}));
        }
        results.sort((a,b)=>b.score-a.score);
        const finalists=results.slice(0,16),selected=finalists[0],test=evaluate(selected.c,VALEND,END,1),
            full=evaluate(selected.c,START,END,1,1,true),
            exactFull=evaluate(exact,START,END,1),
            exactSplits={config:exact,searchResolution:"M15; full M1",train:compact(evaluate(exact,START,TRAINEND,15)),
                validation:compact(evaluate(exact,TRAINEND,VALEND,15)),test:compact(evaluate(exact,VALEND,END,15)),
                full:compact(exactFull)};
        function bucket(trades,key){
            const groups={};
            for(const trade of trades){
                const name=key(trade),g=groups[name]??={trades:0,wins:0,pnl:0,gp:0,gl:0,r:0};
                g.trades++;g.wins+=trade.pnl>0?1:0;g.pnl+=trade.pnl;g.gp+=Math.max(0,trade.pnl);g.gl+=Math.max(0,-trade.pnl);g.r+=trade.r;
            }
            return Object.fromEntries(Object.entries(groups).map(([name,g])=>[name,{trades:g.trades,winRate:+(100*g.wins/g.trades).toFixed(2),
                pnl:+g.pnl.toFixed(2),pf:g.gl?+(g.gp/g.gl).toFixed(4):g.gp?99:0,totalR:+g.r.toFixed(3)}]));
        }
        const trades=full.detail,analysis={
            month:bucket(trades,trade=>trade.closed.slice(0,7)),
            session:bucket(trades,trade=>trade.session),
            side:bucket(trades,trade=>trade.side),
            regime:bucket(trades,trade=>trade.productionContext?.regime??"unknown"),
            volatility:bucket(trades,trade=>{const value=trade.productionContext?.volatility;return value<.33?"low":value<.67?"middle":"high";}),
            score:bucket(trades,trade=>`${trade.side}-${trade.productionContext?.buyScore}:${trade.productionContext?.sellScore}`),
        };
        const selectedReport={config:selected.c,eligible:selected.eligible,selectionResolution:"M15 fixed grid; M1 frozen test/full",
            train:compact(selected.train),validation:compact(selected.validation),
            test:compact(test),testStress125:compact(evaluate(selected.c,VALEND,END,1,1.25)),full:compact(full),analysis,
            riskSweepResolution:"M15 diagnostic",riskSweep:[.005,.01,.02,.03].map(risk=>({riskPct:100*risk,full:compact(evaluate({...selected.c,risk,
                portfolioRisk:Math.min(.15,risk*selected.c.slots)},START,END,15))}))};
        let kronosStudy=null;
        if(options.kronosRuntime||options.kronosPlan){
            const possible=candidateEvents(selected.c,START,END,1),grouped=new Map(),aliases=new Map(),lookback=64;
            for(const e of possible){
                const rows=data.get(e.symbol)[60],i=atOrBefore(rows,e.t-60*MIN);
                if(i<lookback-1||e.t-(rows[i].t+60*MIN)>=60*MIN)continue;
                const signalKey=`${e.symbol}|${e.t}|60`,contextEnd=rows[i].t+60*MIN,
                    contextKey=`${e.symbol}|${contextEnd}|60`;
                if(!grouped.has(contextKey))grouped.set(contextKey,{key:contextKey,contextEnd,
                    rows:rows.slice(i-lookback+1,i+1).map(r=>[r.t,r.open,r.high,r.low,r.close])});
                if(!aliases.has(contextKey))aliases.set(contextKey,[]);
                aliases.get(contextKey).push(signalKey);
            }
            const jobs=[...grouped.values()],batches=[];
            for(let index=0;index<jobs.length;index+=8)batches.push({tf:60,horizon:2,jobs:jobs.slice(index,index+8)});
            const counts={qualifyingSignals:possible.length,contexts:jobs.length,batches:batches.length};
            console.log("PRODUCTION_KRONOS_PLAN",JSON.stringify(counts));
            if(options.kronosPlan)return {protocol:"production-kronos-plan-v1",from:iso(START),to:iso(END),
                sourceHash,rulesHash,fileFingerprint,base:selectedReport.config,counts};
            const inference=await inferKronos(path.resolve(options.kronosRuntime),batches,p=>{
                for(const key of aliases.get(p.key)??[])forecasts.set(key,{contextEnd:p.contextEnd,bars:p.bars,paths:p.paths});
            },options.kronosModel,options.kronosSamples,options.kronosCache),forecastHash=sha(JSON.stringify([...forecasts])),configs=[];
            for(const slots of [1,3,5]){
                const shared={...selected.c,slots,risk:.01,portfolioRisk:.01*slots},schedule=`slots-${slots}`;
                configs.push({...shared,name:`no-kronos-${schedule}`});
                for(const horizon of [1,2]){
                    for(const mode of ["filter","veto","vote"])
                    for(const threshold of [0,.1,.25,.5])configs.push({...shared,
                        name:`kronos-${mode}-h${horizon}-t${threshold}-${schedule}`,
                        kronos:{mode,tf:60,horizon,threshold,efficiency:0}});
                    for(const threshold of [0,.1,.25,.5])for(const efficiency of [0,.6])configs.push({...shared,
                        name:`kronos-detector-h${horizon}-t${threshold}-e${efficiency}-${schedule}`,
                        kronos:{mode:"detector",tf:60,horizon,threshold,efficiency}});
                    configs.push({...shared,name:`kronos-quality-h${horizon}-${schedule}`,
                        kronos:{mode:"quality",tf:60,horizon,threshold:0,efficiency:0}});
                    for(const threshold of [.5,1,1.5])configs.push({...shared,
                        name:`kronos-room-h${horizon}-t${threshold}-${schedule}`,
                        kronos:{mode:"room",tf:60,horizon,threshold,adverse:1}});
                }
            }
            const development=configs.map(c=>{
                const train=evaluate(c,START,TRAINEND,15),validation=evaluate(c,TRAINEND,VALEND,15),
                    stress=evaluate(c,TRAINEND,VALEND,15,1.25),
                    eligible=train.trades>=20&&validation.trades>=20&&train.returnPct>0&&validation.returnPct>0
                        &&stress.returnPct>0&&train.pf>1&&validation.pf>1&&stress.pf>=1,
                    score=(eligible?1e6:0)+Math.min(rate(train,trainDays),rate(validation,validationDays))*30
                        -.4*Math.max(train.dd,validation.dd)-.2*stress.dd;
                return {c,train,validation,stress,eligible,score};
            }).sort((a,b)=>b.score-a.score),models=development.filter(x=>x.c.kronos),modelSelected=models[0];
            const report=x=>({config:x.c,eligible:x.eligible,selectionResolution:"M15 development; M1 frozen test/full",
                train:compact(x.train),validation:compact(x.validation),validationStress125:compact(x.stress),
                test:compact(evaluate(x.c,VALEND,END,1)),testStress125:compact(evaluate(x.c,VALEND,END,1,1.25)),
                full:compact(evaluate(x.c,START,END,1))}),champions=[];
            for(const mode of [null,"filter","veto","vote","detector","quality","room"]){
                const match=development.find(x=>mode?x.c.kronos?.mode===mode:!x.c.kronos);
                if(match)champions.push(report(match));
            }
            kronosStudy={counts,inference,forecastHash,scenarios:configs.length,
                eligibleModels:models.filter(x=>x.eligible).length,selected:report(modelSelected),champions,
                leaders:models.slice(0,10).map(x=>({config:x.c,eligible:x.eligible,train:compact(x.train),
                    validation:compact(x.validation),validationStress125:compact(x.stress)}))};
        }
        let unchanged=sha(fs.readFileSync(new URL("./autoresearch/prepare.js",import.meta.url),"utf8"))===sourceHash;
        for(const symbol of symbols)for(const tf of [1,15]){
            const stat=fs.statSync(`${dir}/${symbol}_M${tf}.jsonl`),before=tf===1?coverage[symbol]:coverage[symbol].native15;
            unchanged&&=stat.size===before.size&&stat.mtimeMs===before.mtimeMs;
        }
        return {protocol:"production-commit-causal-study-v1",commit:"a8f33bb4f5a40bcd5c33dd61042667fbed61dd11",
            from:iso(START),trainEnd:iso(TRAINEND),validationEnd:iso(VALEND),to:iso(END),
            testStatus:"previously-inspected chronological diagnostic",sourceHash,rulesHash,fileFingerprint,unchanged,
            scenarios:uniqueGrid.length,exact:exactSplits,selected:selectedReport,kronosStudy,
            leaders:finalists.slice(0,12).map(x=>({config:x.c,eligible:x.eligible,train:compact(x.train),validation:compact(x.validation)}))};
    }
    if (options.dynamicProfiles) {
        const split = Date.parse(options.split ?? "2026-06-01T00:00:00Z");
        if (!Number.isFinite(split) || !(START < split && split < END)) throw Error("Dynamic profiles require from < split < to.");
        const common = { ...baseline, strategy:"dynamicGreenred", tf:15, pivotWidth:4, direction:"lows", higherSwing:0,
            pool:17, spread:2, body:.4, bodyAtr:.15, eff:.1, activity:1, atrMin:.3, atrMax:.9, volume:0,
            filter:"score", score:2, htf:0, hmove:.25, ema:0, emaSlope:0, offset:.1, buffer:.2, minStop:.5,
            tp:"r", expiry:30, hold:240, be:null, sessions:[0,1,2,3], entryCutoff:15, dailyOrderCap:0,
            sessionOrderCap:0, dailyStop:0, lossCap:0, sessionFlat:false, risk:.01, portfolioRisk:.15 };
        const exits = [
            { exitName:"fixed-1r", target:1, trail:"off", activation:1.5, trailDistance:.75, burst:.5 },
            { exitName:"fixed-1.5r", target:1.5, trail:"off", activation:1.5, trailDistance:.75, burst:.5 },
            { exitName:"fixed-2r", target:2, trail:"off", activation:1.5, trailDistance:.75, burst:.5 },
            { exitName:"conditional-trail", target:2, trail:"conditional", activation:1.5, trailDistance:.75, burst:.5 },
        ];
        const stops = [
            { stopName:"signal-candle", sl:"candle", stopAtr:1 },
            { stopName:"atr-1", sl:"atr", stopAtr:1 },
            { stopName:"atr-1.5", sl:"atr", stopAtr:1.5 },
        ];
        const grid = [];
        for (const profileMode of ["balanced","trend","pullback"])
        for (const baseScore of [3,5,7]) for (const minScoreEdge of [1,3])
        for (const dynamicLiquidity of ["loose","strict"]) for (const entry of ["market","stop","adaptive"])
        for (const stop of stops) for (const exit of exits) for (const slots of [1,3,5]) {
            const c = { ...common, profileMode, baseScore, minScoreEdge, dynamicLiquidity, entry, ...stop, ...exit, slots };
            c.name = [profileMode,`score${baseScore}`,`edge${minScoreEdge}`,dynamicLiquidity,entry,stop.stopName,exit.exitName,`slots${slots}`].join("-");
            grid.push(c);
        }
        const searchGrid = Number.isInteger(options.evaluations) && options.evaluations > 0 ? grid.slice(0, options.evaluations) : grid;
        const compact = r => ({ balance:r.balance,pnl:r.pnl,returnPct:r.returnPct,trades:r.trades,winRate:r.winRate,pf:r.pf,dd:r.dd,
            totalR:r.totalR,placed:r.placed,expired:r.expired,sessions:r.sessions,month:r.month,pair:r.pair,maxNominalRisk:r.maxNominalRisk,
            maxFilledRisk:r.maxFilledRisk,maxOpenRisk:r.maxOpenRisk,maxMargin:r.maxMargin,dailyStats:r.dailyStats });
        const rank = r => {
            const days = Math.max(1,r.dailyStats.calendarDays), activity = r.trades/days;
            if (r.trades < 45 || r.sessions.some(value=>value<1) || !(r.balance>0)) return -1e6+r.returnPct+activity;
            return 35*Math.log(r.balance/500)+8*Math.log(Math.max(.01,r.pf))-.7*r.dd
                +.1*r.dailyStats.positiveCalendarPct+.04*r.dailyStats.minSessionCoveragePct+Math.min(3,activity);
        };
        const results=[];
        for (let index=0;index<searchGrid.length;index++) {
            const c=searchGrid[index], first=evaluate(c,START,split,1), second=evaluate(c,split,END,1);
            results.push({c,first,second,firstRank:rank(first),secondRank:rank(second)});
            if ((index+1)%250===0 || index+1===searchGrid.length)
                console.log("DYNAMIC_PROGRESS",JSON.stringify({done:index+1,total:searchGrid.length}));
        }
        const controlResult={c:{...baseline,name:"current-greenred-control"},first:evaluate(baseline,START,split,1),second:evaluate(baseline,split,END,1)};
        controlResult.firstRank=rank(controlResult.first);controlResult.secondRank=rank(controlResult.second);
        const contenders=[...results,controlResult],
            firstChoice=[...contenders].sort((a,b)=>b.firstRank-a.firstRank)[0],
            secondChoice=[...contenders].sort((a,b)=>b.secondRank-a.secondRank)[0];
        const transferEligible=(train,test)=>train.returnPct>0&&test.returnPct>0&&train.pf>1&&test.pf>1
            &&train.trades>=45&&test.trades>=45&&train.sessions.every(value=>value>0)&&test.sessions.every(value=>value>0);
        const summarizeChoice=(choice,trainKey,testKey)=>({
            config:choice.c, train:compact(choice[trainKey]), test:compact(choice[testKey]),
            testStress125:compact(evaluate(choice.c,testKey==="second"?split:START,testKey==="second"?END:split,1,1.25)),
            transferEligible:transferEligible(choice[trainKey],choice[testKey]),
        });
        let forward=summarizeChoice(firstChoice,"first","second"), reverse=summarizeChoice(secondChoice,"second","first"),
            inference=null,forecastHash=null,counts=null,modelScenarios=0,modelProfitableBothCount=0,modelTransfer=[];

        if (options.kronosRuntime || options.kronosPlan) {
            const selectedBases=[controlResult.c,firstChoice.c,secondChoice.c], possibleByKey=new Map();
            for (const c of selectedBases) for (const e of candidateEvents(c,START,END,1)) possibleByKey.set(`${e.symbol}|${e.t}`,e);
            const grouped=new Map(),aliases=new Map(),lookback=64;
            for (const e of possibleByKey.values()) {
                const rows=data.get(e.symbol)[60],i=atOrBefore(rows,e.t-60*MIN);
                if (i<lookback-1 || e.t-(rows[i].t+60*MIN)>=60*MIN) continue;
                const signalKey=`${e.symbol}|${e.t}|60`,contextEnd=rows[i].t+60*MIN,contextKey=`${e.symbol}|${contextEnd}|60`;
                if(!grouped.has(contextKey))grouped.set(contextKey,{key:contextKey,contextEnd,
                    rows:rows.slice(i-lookback+1,i+1).map(r=>[r.t,r.open,r.high,r.low,r.close])});
                if(!aliases.has(contextKey))aliases.set(contextKey,[]);
                aliases.get(contextKey).push(signalKey);
            }
            const jobs=[...grouped.values()],batches=[];
            for(let index=0;index<jobs.length;index+=8)batches.push({tf:60,horizon:2,jobs:jobs.slice(index,index+8)});
            counts={signals:[...aliases.values()].reduce((sum,keys)=>sum+keys.length,0),contexts:jobs.length,batches:batches.length};
            console.log("DYNAMIC_KRONOS_PLAN",JSON.stringify(counts));
            if (options.kronosPlan) return {protocol:"dynamic-greenred-reciprocal-v1",from:iso(START),split:iso(split),to:iso(END),
                sourceHash,rulesHash,fileFingerprint,scenarios:searchGrid.length,counts,forward,reverse};
            inference=await inferKronos(path.resolve(options.kronosRuntime),batches,p=>{
                for(const key of aliases.get(p.key)??[])forecasts.set(key,{contextEnd:p.contextEnd,bars:p.bars,paths:p.paths});
            },options.kronosModel,options.kronosSamples,options.kronosCache);
            forecastHash=sha(JSON.stringify([...forecasts]));
            const variants=base=>{
                const out=[{...base,name:`${base.name}-no-kronos`}];
                for(const horizon of [1,2]) {
                    for(const threshold of [.1,.25,.5]) {
                        out.push({...base,name:`${base.name}-filter-h${horizon}-${threshold}`,kronos:{mode:"filter",tf:60,horizon,threshold,efficiency:0}});
                        out.push({...base,name:`${base.name}-filter-efficient-h${horizon}-${threshold}`,kronos:{mode:"filter",tf:60,horizon,threshold,efficiency:.6}});
                        out.push({...base,name:`${base.name}-veto-h${horizon}-${threshold}`,kronos:{mode:"veto",tf:60,horizon,threshold,efficiency:0}});
                        out.push({...base,name:`${base.name}-detector-h${horizon}-${threshold}`,kronos:{mode:"detector",tf:60,horizon,threshold,efficiency:0}});
                        out.push({...base,name:`${base.name}-detector-efficient-h${horizon}-${threshold}`,kronos:{mode:"detector",tf:60,horizon,threshold,efficiency:.6}});
                    }
                    for(const threshold of [.5,1,1.5])out.push({...base,name:`${base.name}-room-h${horizon}-${threshold}`,
                        kronos:{mode:"room",tf:60,horizon,threshold,adverse:1}});
                    out.push({...base,name:`${base.name}-quality-h${horizon}`,kronos:{mode:"quality",tf:60,horizon,threshold:0,efficiency:0}});
                }
                return out;
            };
            const unique=[...new Map(selectedBases.flatMap(variants).map(c=>[c.name,c])).values()],
                evaluated=unique.map(c=>({c,first:evaluate(c,START,split,1),second:evaluate(c,split,END,1)}));
            modelScenarios=evaluated.length;
            const selectModel=(trainKey,testKey,testStart,testEnd)=>{
                const ordered=[...evaluated].sort((a,b)=>rank(b[trainKey])-rank(a[trainKey])),selected=ordered[0],
                    stress=evaluate(selected.c,testStart,testEnd,1,1.25);
                return {config:selected.c,train:compact(selected[trainKey]),test:compact(selected[testKey]),testStress125:compact(stress),
                    transferEligible:transferEligible(selected[trainKey],selected[testKey])&&stress.returnPct>0,
                    champions:ordered.slice(0,8).map(x=>({config:x.c,train:compact(x[trainKey]),test:compact(x[testKey])}))};
            };
            forward=selectModel("first","second",split,END);
            reverse=selectModel("second","first",START,split);
            const profitableBoth=evaluated.filter(x=>x.first.returnPct>0&&x.second.returnPct>0&&x.first.pf>1&&x.second.pf>1);
            modelProfitableBothCount=profitableBoth.length;
            modelTransfer=[...profitableBoth].sort((a,b)=>Math.min(rank(b.first),rank(b.second))-Math.min(rank(a.first),rank(a.second)))
                .slice(0,12).map(x=>({config:x.c,first:compact(x.first),second:compact(x.second),
                    profitableBoth:true}));
        }
        const riskSweep=choice=>[.005,.01,.02,.03].map(risk=>{
            const c={...choice.config,risk,portfolioRisk:Math.min(.15,risk*choice.config.slots)};
            return {riskPct:100*risk,first:compact(evaluate(c,START,split,1)),second:compact(evaluate(c,split,END,1))};
        });
        let unchanged=sha(fs.readFileSync(new URL("./autoresearch/prepare.js",import.meta.url),"utf8"))===sourceHash;
        for(const symbol of symbols)for(const tf of [1,15]){
            const stat=fs.statSync(`${dir}/${symbol}_M${tf}.jsonl`),before=tf===1?coverage[symbol]:coverage[symbol].native15;
            unchanged&&=stat.size===before.size&&stat.mtimeMs===before.mtimeMs;
        }
        const control={config:baseline,first:compact(controlResult.first),second:compact(controlResult.second)};
        return {protocol:"dynamic-greenred-reciprocal-v1",from:iso(START),split:iso(split),to:iso(END),
            testStatus:"reciprocal-out-of-sample-diagnostic; both halves have been inspected",sourceHash,rulesHash,fileFingerprint,unchanged,
            scenarios:searchGrid.length,modelScenarios,modelProfitableBothCount,counts,inference,forecastHash,control,forward,reverse,modelTransfer,
            riskSweep:{forward:riskSweep(forward),reverse:riskSweep(reverse)},
            leaders:{first:[...results].sort((a,b)=>b.firstRank-a.firstRank).slice(0,5).map(x=>({config:x.c,train:compact(x.first),test:compact(x.second)})),
                second:[...results].sort((a,b)=>b.secondRank-a.secondRank).slice(0,5).map(x=>({config:x.c,train:compact(x.second),test:compact(x.first)}))}};
    }
    if (options.kronosRuntime || options.kronosPlan) {
        const modelBase = options.kronosCore ? { ...baseline, ...options.kronosCore } : baseline;
        if (!(modelBase.risk > 0 && modelBase.risk <= .03 && modelBase.portfolioRisk > 0 && modelBase.portfolioRisk <= .15))
            throw Error("kronos-core violates risk limits");
        const precursor = options.kronosCore ? { ...modelBase, ...((options.dailyActivity||options.swingContinuation||options.humanWaveContinuation) ? { skipDirection:true, higherSwing:0 } : {}) } : options.dailyObjective
            ? { ...modelBase, pool:17, filter:"none", score:0, body:0, bodyAtr:0, eff:0, activity:0, atrMin:0, atrMax:1, volume:0 }
            : { ...baseline, pool:17, skipDirection:true };
        const possible = candidateEvents(precursor, START, END, 1);
        const batches = [], counts = {}, aliases = new Map();
        for (const tf of (options.dailyObjective||options.swingContinuation||options.humanWaveContinuation ? [60] : [15, 60])) {
            const grouped = new Map(), lookback = tf === 15 ? 128 : 80;
            for (const e of possible) {
                const rows = data.get(e.symbol)[tf], i = atOrBefore(rows, e.t - tf * MIN);
                if (i < lookback - 1 || e.t - (rows[i].t + tf * MIN) >= tf * MIN) continue;
                const signalKey=`${e.symbol}|${e.t}|${tf}`, contextEnd=rows[i].t+tf*MIN, contextKey=`${e.symbol}|${contextEnd}|${tf}`;
                if(!grouped.has(contextKey)) grouped.set(contextKey,{key:contextKey,contextEnd,
                    rows:rows.slice(i-lookback+1,i+1).map(r=>[r.t,r.open,r.high,r.low,r.close])});
                if(!aliases.has(contextKey))aliases.set(contextKey,[]);
                aliases.get(contextKey).push(signalKey);
            }
            const jobs=[...grouped.values()];
            counts[tf] = {signals:[...aliases].filter(([key])=>key.endsWith(`|${tf}`)).reduce((sum,[,keys])=>sum+keys.length,0),contexts:jobs.length};
            for (let i = 0; i < jobs.length; i += 8) batches.push({ tf, horizon: tf === 15 ? 8 : 2, jobs: jobs.slice(i, i + 8) });
        }
        console.log("KRONOS_PLAN", JSON.stringify({ counts, qualifyingSignals: possible.length, pairs: symbols.length, baseline }));
        if (options.kronosPlan) return { counts, qualifyingSignals: possible.length, sourceHash, rulesHash, fileFingerprint };
        const inference = await inferKronos(path.resolve(options.kronosRuntime), batches, p => {
            for(const key of aliases.get(p.key)??[])forecasts.set(key,{contextEnd:p.contextEnd,bars:p.bars,paths:p.paths});
        },options.kronosModel,options.kronosSamples,options.kronosCache);
        const forecastHash = sha(JSON.stringify([...forecasts]));
        const comparatorName = options.kronosCore ? "core-no-model" : "accepted-base";
        const configs = [{ name: comparatorName, ...modelBase }];
        const presets = options.kronosCore ? [{name:"core", values:{}}] : options.dailyObjective
            ? [{ name:"pure", values:{ filter:"none",score:0,body:0,bodyAtr:0,eff:0,activity:0,atrMin:0,atrMax:1,volume:0 } }]
            : [{ name:"accepted", values:{} }];
        const pools = options.kronosCore ? [modelBase.pool] : options.dailyObjective ? [17] : [5,17];
        const slotValues = options.kronosCore ? [1,2,3,4,5] : options.dailyObjective ? [1,2,3,5] : [1,2,3,4,5];
        const sessionValues = options.kronosCore ? [modelBase.sessions ?? [0,1,2,3]] : options.dailyObjective ? [[0,1,2,3],[0,1,2],[1,2],[2,3]] : [null];
        const capValues = options.kronosCore ? [0] : options.dailyObjective ? [0,1,2,4] : [0];
        const screenProfiles=options.qualityScreenStudy?[
                {name:"pa-only",weights:{pa:1,rsi:0,bollinger:0,volume:0,kronos:0}},
                {name:"pa-rsi",weights:{pa:3,rsi:1,bollinger:0,volume:0,kronos:0}},
                {name:"pa-bollinger",weights:{pa:3,rsi:0,bollinger:1,volume:0,kronos:0}},
                {name:"pa-volume",weights:{pa:3,rsi:0,bollinger:0,volume:1,kronos:0}},
                {name:"pa-kronos",weights:{pa:3,rsi:0,bollinger:0,volume:0,kronos:1}},
                {name:"technical",weights:{pa:2,rsi:1,bollinger:1,volume:.5,kronos:0}},
                {name:"kronos-light",weights:{pa:3,rsi:1,bollinger:1,volume:.5,kronos:.5}},
                {name:"balanced",weights:{pa:2,rsi:1,bollinger:1,volume:.5,kronos:1}},
                {name:"pa-first",weights:{pa:4,rsi:.5,bollinger:.5,volume:.25,kronos:.75}},
            ]:[];
        if(options.qualityScreenStudy){
            const screenExits=[
                {name:"rr1",tp:"r",target:1,trail:"off",be:null,activation:.5,trailDistance:.5},
                {name:"rr2",tp:"r",target:2,trail:"off",be:null,activation:.5,trailDistance:.5},
                {name:"rr3",tp:"r",target:3,trail:"off",be:null,activation:.5,trailDistance:.5},
                {name:"trail05",tp:"none",target:3,trail:"always",be:null,activation:.5,trailDistance:.5},
                {name:"trail10",tp:"none",target:3,trail:"always",be:null,activation:1,trailDistance:.5},
            ];
            for(const slots of [1,2,3,4,5])for(const horizon of [1,2])for(const profile of screenProfiles)for(const exit of screenExits)
            for(const minimum of [45,55,65,75]){
                const usesKronos=profile.weights.kronos>0;
                configs.push({...modelBase,...exit,name:`screen-${profile.name}-${exit.name}-h${horizon}-q${minimum}-slots${slots}`,
                    slots,qualityScreen:{minimum,weights:profile.weights},
                    ...(usesKronos?{kronos:{mode:"screener",tf:60,horizon}}:{kronos:null})});
            }
            const adaptiveProfiles=screenProfiles.filter(profile=>["pa-only","pa-bollinger","pa-kronos"].includes(profile.name)),
                adaptivePresets=[
                    {name:"slow3",pool:3,alpha:.35,shrinkage:3,exploration:.25},
                    {name:"fast3",pool:3,alpha:.6,shrinkage:2,exploration:.1},
                    {name:"broad4",pool:4,alpha:.35,shrinkage:4,exploration:.2},
                ],exit=screenExits.find(item=>item.name==="trail10");
            for(const pairMemory of adaptivePresets)for(const slots of [2,3,4])for(const horizon of [1,2])
            for(const profile of adaptiveProfiles)for(const minimum of [65,75]){
                const usesKronos=profile.weights.kronos>0;
                configs.push({...modelBase,...exit,
                    name:`adaptive-${pairMemory.name}-${profile.name}-trail10-h${horizon}-q${minimum}-slots${slots}`,
                    slots,pairMemory,qualityScreen:{minimum,weights:profile.weights},
                    ...(usesKronos?{kronos:{mode:"screener",tf:60,horizon}}:{kronos:null})});
            }
        }else for (const preset of presets) for (const pool of pools) for (const slots of slotValues)
        for (const sessions of sessionValues) for (const dailyOrderCap of capValues) {
            const shared = { ...modelBase, ...preset.values, pool, slots, ...(sessions?{sessions}:{}), ...(dailyOrderCap?{dailyOrderCap}:{}) };
            const schedule = `${sessions?.join("")??"all"}-cap${dailyOrderCap||"none"}`;
            if (!options.kronosCore && (pool !== 5 || slots !== 1 || preset.name !== "accepted"))
                configs.push({ name: `no-model-${preset.name}-pool${pool}-slots${slots}-${schedule}`, ...shared });
            for (const tf of (options.dailyObjective||options.swingContinuation||options.humanWaveContinuation ? [60] : [15, 60])) for (const horizon of (tf === 15 ? [2, 4, 8] : [1, 2])) {
                for (const mode of (options.dailyObjective
                    ? ["filter", "veto", ...((options.dailyActivity || options.alternative || options.swingContinuation) ? ["detector", "quality"] : [])]
                    : ["filter","detector","veto", ...(options.reportCandidates ? ["quality"] : [])])) for (const threshold of (mode === "quality" ? [0] : [0, 0.1, 0.25, 0.5])) {
                    if (mode === "quality" && slots >= pool) continue;
                    const efficiencies = mode === "detector" ? [0, 0.6] : [0];
                    for (const efficiency of efficiencies) configs.push({ name: `${mode}-${preset.name}-${tf}-${horizon}-${threshold}-${efficiency}-${pool}-${slots}-${schedule}`,
                        ...shared, ...(mode === "detector" ? { skipDirection:true, higherSwing:0 } : {}), kronos: { mode, tf, horizon, threshold, efficiency } });
                }
                for (const threshold of [0.5, 1, 1.5]) configs.push({ name: `room-${preset.name}-${tf}-${horizon}-${threshold}-${pool}-${slots}-${schedule}`,
                    ...shared, kronos: { mode: "room", tf, horizon, threshold, adverse: 1 } });
                for (const threshold of [0, 0.1, 0.25]) for (const probability of [0.5, 2/3, 5/6])
                    configs.push({ name: `consensus-${preset.name}-${tf}-${horizon}-${threshold}-${probability}-${pool}-${slots}-${schedule}`,
                        ...shared, kronos: { mode: "consensus", tf, horizon, threshold, probability } });
            }
        }
        const development = configs.map(c => {
            const train = evaluate(c, START, TRAINEND, 1), validation = evaluate(c, TRAINEND, VALEND, 1), stress = evaluate(c, TRAINEND, VALEND, 1, 1.25);
            const standardEligible = train.trades >= 60 && validation.trades >= 15 && train.returnPct > 0 && validation.returnPct > 0
                && stress.returnPct > 0 && train.pf >= 1.05 && validation.pf >= 1.05 && stress.pf >= 1 && train.sessions.every(n => n >= 3);
            const monthlyReturns=[...Object.values(train.month),...Object.values(validation.month)].map(pnl=>pnl/5),
                positiveMonthPct=monthlyReturns.length?100*monthlyReturns.filter(value=>value>0).length/monthlyReturns.length:0,
                worstMonthPct=monthlyReturns.length?Math.min(...monthlyReturns):-Infinity;
            const screenEligible=options.qualityScreenStudy&&train.trades>=120&&validation.trades>=50
                &&train.returnPct>0&&validation.returnPct>0&&train.pf>1&&validation.pf>1
                &&validation.dailyStats.averageTradesPerCalendarDay>=2
                &&validation.dailyStats.minSessionCoveragePct>=40&&validation.sessions.every(n=>n>=8)
                &&positiveMonthPct>=70&&worstMonthPct>=-3;
            const eligible=options.qualityScreenStudy?screenEligible:standardEligible;
            const dailyScore = r => 2*r.dailyStats.positiveActivePct + r.dailyStats.positiveCalendarPct
                + 4*r.dailyStats.meanCalendarReturnPct + 2*r.dailyStats.p10ActiveR - 3*r.dailyStats.maxLossStreak;
            const activityScore = r => 5*r.dailyStats.twoOfThreeCalendarPct + 2*r.dailyStats.threeTradeDayPct
                + .5*r.dailyStats.positiveCalendarPct + .25*r.dailyStats.minSessionCoveragePct
                + 4*r.dailyStats.meanCalendarReturnPct - 2*r.dailyStats.maxLossStreak;
            const profitScore = r => (r.trades < 2.5*r.dailyStats.calendarDays || r.sessions.some(n => n < 1)
                ? -1e6 + r.returnPct
                : 35*Math.log(Math.max(.01,r.balance)/500) + 8*Math.log(Math.max(.01,r.pf)) - .7*r.dd
                    + .12*r.dailyStats.positiveCalendarPct + .05*r.dailyStats.minSessionCoveragePct);
            const screenScore=r=>20*Math.log(Math.max(.01,r.balance)/500)+6*Math.log(Math.max(.01,r.pf))
                -.5*r.dd+.35*r.dailyStats.minSessionCoveragePct+5*Math.min(4,r.dailyStats.averageTradesPerCalendarDay)
                +.08*r.dailyStats.positiveCalendarPct;
            const stabilityScore=positiveMonthPct+5*worstMonthPct;
            const foldBounds = [["2026-03-01","2026-04-01"],["2026-04-01","2026-05-01"],["2026-05-01","2026-06-01"],
                ["2026-06-01","2026-07-01"],["2026-07-01","2026-08-01"]];
            const folds = options.dailyObjective ? foldBounds.map(([from,to])=>evaluate(c,Date.parse(from+"T00:00:00Z"),Date.parse(to+"T00:00:00Z"),1)) : null;
            const robust = options.dailyObjective ? [...folds,stress] : [];
            const dailyEligible = options.dailyObjective && robust.every(r => options.alternative
                ? r.returnPct > 0 && r.pf > 1 && r.winRate > 50
                    && r.dailyStats.averageTradesPerCalendarDay >= 2.5
                    && r.dailyStats.positiveCalendarPct > 50 && r.sessions.every(n => n >= 1)
                : options.dailyActivity
                ? r.dailyStats.threeTradeDayPct === 100 && r.dailyStats.twoOfThreeCalendarPct === 100
                    && r.winRate > 50 && r.dailyStats.meanCalendarReturnPct > 0 && r.sessions.every(n => n >= 1)
                : r.dailyStats.activeDays >= 5 && r.dailyStats.positiveActivePct > 50 && r.dailyStats.meanCalendarReturnPct > 0);
            const rank = options.qualityScreenStudy
                ?((screenEligible?1e6:0)+Math.min(screenScore(train),screenScore(validation))+.2*stabilityScore)
                :options.dailyObjective
                ? ((dailyEligible ? 1e6 : 0) + Math.min(...robust.map(options.alternative ? profitScore : options.dailyActivity ? activityScore : dailyScore)))
                : ((eligible ? 1e6 : 0) + Math.min(100 * Math.log(train.balance / 500) / ((TRAINEND - START) / DAY),
                    100 * Math.log(validation.balance / 500) / ((VALEND - TRAINEND) / DAY)) * 30 - 0.25 * validation.dd);
            return { c, train, validation, stress, ...(options.qualityScreenStudy?{positiveMonthPct,worstMonthPct}:{}),
                ...(folds?{folds}:{}), eligible: options.dailyObjective ? dailyEligible : eligible, rank };
        }).sort((a,b) => b.rank - a.rank);
        const selected = options.dailyObjective||options.qualityScreenStudy ? development.find(x=>x.c.name!==comparatorName) : development[0];
        console.log("KRONOS_FROZEN", JSON.stringify(selected));
        const champions = [development.find(x => x.c.name === comparatorName)];
        if(options.dailyObjective&&!options.kronosCore)champions.push(development.find(x=>x.c.name.startsWith("no-model-pure")));
        if(options.qualityScreenStudy)for(const profile of screenProfiles.map(item=>item.name))
            champions.push(development.find(x=>x.c.name.startsWith(`screen-${profile}-`)));
        else for (const mode of ["filter", "detector", "veto", "quality", "room", "consensus"]) champions.push(development.find(x => x.c.kronos?.mode === mode));
        const report = x => ({ ...x, test: evaluate(x.c, VALEND, END, 1), testStress: evaluate(x.c, VALEND, END, 1, 1.25),
            full: evaluate(x.c, START, END, 1), pairs: Object.fromEntries(symbols.map(symbol => [symbol,
                evaluate({ ...x.c, pool: 17, onlySymbol: symbol }, VALEND, END, 1)])) });
        let unchanged = sha(fs.readFileSync(new URL("./autoresearch/prepare.js", import.meta.url), "utf8")) === sourceHash;
        for (const symbol of symbols) for (const tf of [1,15]) {
            const stat = fs.statSync(`${dir}/${symbol}_M${tf}.jsonl`), before = tf === 1 ? coverage[symbol] : coverage[symbol].native15;
            unchanged &&= stat.size === before.size && stat.mtimeMs === before.mtimeMs;
        }
        function monteCarlo(dailyReturnPct, start, end, trials=10000, days=20) {
            const values=[];
            for(let day=Math.floor(start/DAY);day*DAY<end;day++){
                const date=new Date(day*DAY), key=iso(day*DAY).slice(0,10);
                if(date.getUTCDay()!==0&&date.getUTCDay()!==6)values.push(dailyReturnPct[key]??0);
            }
            const outcomes=[];let losingMonths=0;
            let mcState=0x20260907;
            const rand=()=>{mcState=(1664525*mcState+1013904223)>>>0;return mcState/4294967296};
            for(let trial=0;trial<trials;trial++){
                let equity=1,peak=1,maxDd=0;
                for(let day=0;day<days;day++){
                    equity*=Math.max(.0001,1+values[Math.floor(rand()*values.length)]/100);
                    peak=Math.max(peak,equity);maxDd=Math.max(maxDd,1-equity/peak);
                }
                outcomes.push({returnPct:100*(equity-1),ddPct:100*maxDd});if(equity<1)losingMonths++;
            }
            outcomes.sort((a,b)=>a.returnPct-b.returnPct);
            const at=q=>outcomes[Math.floor((outcomes.length-1)*q)];
            return {trials,days,losingMonthPct:+(100*losingMonths/trials).toFixed(2),p05ReturnPct:+at(.05).returnPct.toFixed(2),
                medianReturnPct:+at(.5).returnPct.toFixed(2),p95ReturnPct:+at(.95).returnPct.toFixed(2),medianMaxDdPct:+outcomes.map(x=>x.ddPct).sort((a,b)=>a-b)[Math.floor(trials/2)].toFixed(2)};
        }
        function qualityAuditRange(c,start,end){
            const components=["total","pa","rsi","bollinger","volume","kronos"],
                fresh=()=>({signals:0,filled:0,wins:0,losses:0,sumR:0,components:Object.fromEntries(components.map(key=>[key,0]))}),
                groups={accepted:fresh(),rejected:fresh()},execution={...c,qualityScreen:null,kronos:null};
            for(const e of possible){
                if(e.t<start||e.t>=end)continue;
                const quality=qualityBreakdown(e,c),predictionReady=!c.kronos||forecasts.has(`${e.symbol}|${e.t}|${c.kronos.tf}`),
                    accepted=predictionReady&&quality.total>=c.qualityScreen.minimum,
                    group=accepted?groups.accepted:groups.rejected;
                group.signals++;
                const outcome=resolve(e,execution,end,1,1);
                if(!outcome?.filled)continue;
                group.filled++;group.wins+=outcome.r>0?1:0;group.losses+=outcome.r<=0?1:0;group.sumR+=outcome.r;
                for(const key of components)group.components[key]+=quality[key];
            }
            for(const group of Object.values(groups)){
                group.winRate=group.filled?100*group.wins/group.filled:0;group.meanR=group.filled?group.sumR/group.filled:0;
                for(const key of components)group.components[key]=group.filled?group.components[key]/group.filled:0;
                for(const key of ["winRate","meanR","sumR"])group[key]=+group[key].toFixed(4);
                for(const key of components)group.components[key]=+group.components[key].toFixed(3);
            }
            const profitable=groups.accepted.wins+groups.rejected.wins;
            return {method:"independent signal counterfactual; ignores portfolio slot competition",...groups,
                profitableRejectedPct:profitable?+(100*groups.rejected.wins/profitable).toFixed(3):0};
        }
        const selectedDays=options.dailyObjective?evaluate(selected.c,START,END,1,1,true):null;
        const qualityAudit=options.qualityScreenStudy?{
            train:qualityAuditRange(selected.c,START,TRAINEND),validation:qualityAuditRange(selected.c,TRAINEND,VALEND),
            test:qualityAuditRange(selected.c,VALEND,END),full:qualityAuditRange(selected.c,START,END),
        }:null;
        return { protocol: options.qualityScreenStudy?"price-action-quality-screener-kronos-v1"
            :options.alternative ? "kronos-regime-ensemble-v2" : options.dailyObjective ? "kronos-daily-universal-v2" : "kronos-universal-v1", from: iso(START), trainEnd: iso(TRAINEND), validationEnd: iso(VALEND), to: iso(END),
            testStatus: "previously-inspected-diagnostic", sourceHash, rulesHash, fileFingerprint, forecastHash, unchanged, inference,
            scenarios: configs.length, selected: report(selected), champions: champions.filter(Boolean).map(report),
            development: development.slice(0,10), baseline: baseline,
            ...(qualityAudit?{qualityAudit}:{}),
            ...(options.dailyObjective ? {monteCarlo:monteCarlo(selectedDays.dailyReturnPct,START,END), selectedDailyR:selectedDays.dailyR,
                selectedDailyReturnPct:selectedDays.dailyReturnPct} : {}) };
    }
    if (options.check) return { sourceHash, fileFingerprint, coverage, events: eventsByTf.get(15).length, baseline };
    if (options.candidate) {
        if(options.profitTournament){
            const c={...baseline,...options.candidate};
            if(c.tf!==(profitTf||c.tf)||!(c.risk>0&&c.risk<=.03)||!(c.portfolioRisk>0&&c.portfolioRisk<=.15)
                ||!Number.isInteger(c.slots)||c.slots<1||c.slots>5||typeof c.strategy!=="string"
                ||![1,5,15,60,240,1440].includes(c.tf)||Object.values(c).some(value=>typeof value==="number"&&!Number.isFinite(value)))
                throw Error("Invalid frozen profit-tournament candidate.");
            const sweep=[1,2,3,4,5].flatMap(slots=>[.005,.01,.02,.03].map(risk=>{
                const variant={...c,slots,risk,portfolioRisk:Math.min(.15,slots*risk)};
                return {slots,riskPct:100*risk,validation:evaluate(variant,TRAINEND,VALEND,1),
                    test:evaluate(variant,VALEND,END,1),testStress125:evaluate(variant,VALEND,END,1,1.25),
                    full:evaluate(variant,START,END,1)};
            }));
            return {mode:"frozen-profit-tournament-candidate-replay",config:c,sourceHash,rulesHash,fileFingerprint,
                from:iso(START),trainEnd:iso(TRAINEND),validationEnd:iso(VALEND),to:iso(END),
                train:evaluate(c,START,TRAINEND,1),validation:evaluate(c,TRAINEND,VALEND,1),
                validationStress125:evaluate(c,TRAINEND,VALEND,1,1.25),test:evaluate(c,VALEND,END,1),
                testStress125:evaluate(c,VALEND,END,1,1.25),full:evaluate(c,START,END,1),riskSweep:sweep};
        }
        if(options.humanWaveContinuation){
            const c={...baseline,...options.candidate,pivotWidth:null,direction:null,skipDirection:true};
            if(![5,15,60,240].includes(c.tf)||c.entry!=="stop"||c.sl!=="candle"||!["r","none"].includes(c.tp)
                ||c.pool!==5||![1,2,3].includes(c.target)||!(c.be===null||[.5,1].includes(c.be))
                ||!(c.risk>0&&c.risk<=.03)||!(c.portfolioRisk>0&&c.portfolioRisk<=.15)
                ||!Number.isInteger(c.slots)||c.slots<1||c.slots>5
                ||!["off","always","conditional"].includes(c.trail)||!["spread","activity","opportunity"].includes(c.pairRankMode)
                ||Object.values(c).some(value=>typeof value==="number"&&!Number.isFinite(value)))
                throw Error("Invalid frozen causal human-wave candidate.");
            const sweep=[1,2,3,4,5].flatMap(slots=>[.005,.01,.02,.03].map(risk=>{
                const variant={...c,slots,risk,portfolioRisk:Math.min(.15,slots*risk)};
                return {slots,riskPct:100*risk,validation:evaluate(variant,TRAINEND,VALEND,1),
                    test:evaluate(variant,VALEND,END,1),testStress125:evaluate(variant,VALEND,END,1,1.25),
                    full:evaluate(variant,START,END,1)};
            }));
            return {mode:"frozen-causal-human-wave-replay",config:c,sourceHash,rulesHash,fileFingerprint,
                from:iso(START),trainEnd:iso(TRAINEND),validationEnd:iso(VALEND),to:iso(END),
                train:evaluate(c,START,TRAINEND,1),validation:evaluate(c,TRAINEND,VALEND,1),
                validationStress125:evaluate(c,TRAINEND,VALEND,1,1.25),test:evaluate(c,VALEND,END,1),
                testStress125:evaluate(c,VALEND,END,1,1.25),full:evaluate(c,START,END,1),riskSweep:sweep,
                filterAudit:{development:counterfactualFilterAudit(c,START,VALEND),diagnostic:counterfactualFilterAudit(c,VALEND,END)}};
        }
        if(options.swingContinuation){
            const c={...baseline,...options.candidate};
            if(c.tf!==15||c.entry!=="stop"||c.sl!=="candle"||c.tp!=="r"
                ||c.pool!==5||c.target!==2||c.be!==null||c.trail!=="off"
                ||!(c.risk>0&&c.risk<=.03)||!(c.portfolioRisk>0&&c.portfolioRisk<=.15)
                ||!Number.isInteger(c.slots)||c.slots<1||c.slots>5||![2,3,4].includes(c.pivotWidth)
                ||!["side","both"].includes(c.direction)||!["off","always","conditional"].includes(c.trail)
                ||![1,2].includes(c.offsetSteps)||Object.values(c).some(value=>typeof value==="number"&&!Number.isFinite(value)))
                throw Error("Invalid frozen M15 swing-continuation candidate.");
            const sweep=[1,2,3,4,5].flatMap(slots=>[.005,.01,.02,.03].map(risk=>{
                const variant={...c,slots,risk,portfolioRisk:Math.min(.15,slots*risk)};
                return {slots,riskPct:100*risk,validation:evaluate(variant,TRAINEND,VALEND,1),
                    test:evaluate(variant,VALEND,END,1),testStress125:evaluate(variant,VALEND,END,1,1.25),
                    full:evaluate(variant,START,END,1)};
            }));
            return {mode:"frozen-m15-swing-continuation-replay",config:c,sourceHash,rulesHash,fileFingerprint,
                from:iso(START),trainEnd:iso(TRAINEND),validationEnd:iso(VALEND),to:iso(END),
                train:evaluate(c,START,TRAINEND,1),validation:evaluate(c,TRAINEND,VALEND,1),
                validationStress125:evaluate(c,TRAINEND,VALEND,1,1.25),test:evaluate(c,VALEND,END,1),
                testStress125:evaluate(c,VALEND,END,1,1.25),full:evaluate(c,START,END,1),riskSweep:sweep};
        }
        if(options.m5Scalping){
            const c={...baseline,...options.candidate};
            if(c.tf!==5||c.entry!=="market"||c.expiry!==5||c.trail!=="off"
                ||!(c.risk>0&&c.risk<=.03)||!(c.portfolioRisk>0&&c.portfolioRisk<=.15)
                ||!Number.isInteger(c.slots)||c.slots<1||c.slots>5
                ||!["adaptiveBbRsi","adaptiveBbPattern","adaptiveBbMomentum","m5ScalpScore"].includes(c.strategy))
                throw Error("Invalid frozen M5 scalping candidate.");
            const sweep=[1,3,5].flatMap(slots=>[.005,.01,.02,.03].map(risk=>{
                const variant={...c,slots,risk,portfolioRisk:Math.min(.15,slots*risk)};
                return {slots,riskPct:100*risk,validation:evaluate(variant,TRAINEND,VALEND,1),
                    test:evaluate(variant,VALEND,END,1),testStress125:evaluate(variant,VALEND,END,1,1.25),
                    full:evaluate(variant,START,END,1)};
            }));
            return {mode:"frozen-universal-m5-candidate-replay",testStatus:"opened only after configuration freeze",
                config:c,sourceHash,rulesHash,fileFingerprint,from:iso(START),trainEnd:iso(TRAINEND),
                validationEnd:iso(VALEND),to:iso(END),train:evaluate(c,START,TRAINEND,1),
                validation:evaluate(c,TRAINEND,VALEND,1),validationStress125:evaluate(c,TRAINEND,VALEND,1,1.25),
                test:evaluate(c,VALEND,END,1),testStress125:evaluate(c,VALEND,END,1,1.25),
                full:evaluate(c,START,END,1),riskSweep:sweep};
        }
        const c = { ...baseline, ...options.candidate };
        if (Object.keys(c).some((key) => !(key in baseline)) || c.tf !== 15 || c.expiry !== 30 || c.sl !== "candle" || c.tp !== "r"
            || !(c.risk > 0 && c.risk <= 0.03) || !(c.portfolioRisk > 0 && c.portfolioRisk <= 0.15)
            || !Number.isInteger(c.slots) || c.slots < 1 || c.slots > 5
            || ![2, 3, 4].includes(c.pivotWidth) || !["both", "highs", "lows"].includes(c.direction)
            || !["off", "always", "conditional"].includes(c.trail) || !["stop", "limit"].includes(c.entry)
            || !(c.target > 0 && c.hold > 0 && c.activation > 0 && c.trailDistance > 0)
            || Object.values(c).some((value) => typeof value === "number" && !Number.isFinite(value))) {
            throw Error("Invalid frozen candidate or violation of global research limits.");
        }
        return {
            mode: "frozen-candidate-replay", config: c, sourceHash, rulesHash, fileFingerprint,
            from: iso(START), trainEnd: iso(TRAINEND), validationEnd: iso(VALEND), to: iso(END),
            train: evaluate(c, START, TRAINEND, 1), validation: evaluate(c, TRAINEND, VALEND, 1),
            test: evaluate(c, VALEND, END, 1), testStress: evaluate(c, VALEND, END, 1, 1.25),
            full: evaluate(c, START, END, 1, 1, Boolean(options.trades)),
        };
    }
    let state = Number(options.seed ?? 20260906) >>> 0;
    function random() {
        state = (state + 0x6d2b79f5) | 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const pick = (a) => a[Math.floor(random() * a.length)];
    const space = {
        strategy: ["greenred"],
        lookback: [2, 4, 8, 16, 32],
        signalThreshold: [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2],
        regime: [0.1, 0.2, 0.3, 0.4],
        tf: [15, 15, 15, 60],
        pivotWidth: [2, 3, 4],
        direction: ["both", "highs", "lows"],
        higherSwing: [0, 0, 60, 240],
        pool: [3, 5, 7, 17],
        spread: [0.1, 0.15, 0.2, 0.3, 0.5],
        body: [0, 0.2, 0.4],
        bodyAtr: [0, 0.15, 0.3],
        eff: [0, 0.1, 0.2],
        activity: [0, 0.75, 1],
        atrMin: [0, 0.15, 0.3],
        atrMax: [0.8, 0.9, 1],
        volume: [0, 1, 1.25],
        ema: [0, 0, 0.1, 0.25, 0.5],
        emaSlope: [0, 0, 0.05, 0.1, 0.2],
        filter: ["none", "score", "bb", "rsi", "volume"],
        score: [1, 2],
        room: [0.5, 1, 1.5],
        htf: [0, 0, 60, 240],
        hbars: [1, 2, 4],
        hmove: [0, 0.1, 0.25],
        entry: ["stop", "stop", "limit"],
        offset: [0, 0.05, 0.1],
        sl: ["candle", "candle", "swing3", "swing6", "atr"],
        stopAtr: [0.75, 1, 1.5],
        buffer: [0, 0.05, 0.1, 0.2],
        minStop: [0.25, 0.5, 0.75],
        tp: ["r", "r", "atr", "structure"],
        target: [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3],
        targetAtr: [0.5, 0.75, 1, 1.5, 2],
        expiry: [15, 30, 45, 60, 120],
        hold: [30, 60, 120, 240, 480, 720],
        be: [null, null, 1, 1.5],
        trail: ["off", "off", "always", "conditional"],
        activation: [0.75, 1, 1.5],
        trailDistance: [0.35, 0.5, 0.75],
        burst: [0.25, 0.5, 0.75],
        slots: [1, 2, 3, 4, 5],
        entryCutoff: [0, 15, 30, 60],
        sessionOrderCap: [0],
    };
    if (options.alternative) Object.assign(space, {
        strategy: ["momentum", "breakout", "ema", "meanReversion", "vwapReversion", "vwapMomentum", "trendPullback", "adaptive",
            "sessionMomentum", "sessionReversion", "openingMomentum", "openingMomentum", "openingReversion"],
        tf: [15, 15, 15, 60], pivotWidth: [2], direction: ["both"], higherSwing: [0],
        entry: ["market"], offset: [0], expiry: [15],
        filter: ["none", "none", "score", "rsi", "volume"],
        tp: ["r", "r", "atr", "vwap"], target: [0.75, 1, 1.25, 1.5, 2, 2.5, 3],
        risk: [0.005, 0.01, 0.02, 0.03],
        sessionFlat: [false, false, true],
        sessionOrderCap: [1, 1, 2, 3],
    });
    if(options.m5Scalping)Object.assign(space,{
        strategy:["adaptiveBbRsi","adaptiveBbPattern","adaptiveBbMomentum","m5ScalpScore"],
        tf:[5],lookback:[2,4,8],signalThreshold:[0],higherSwing:[0],pool:[5,7,17],spread:[.15,.25,.35,.5],
        body:[0],bodyAtr:[0],eff:[0],activity:[0,.75],atrMin:[0,.1],atrMax:[.9,1],volume:[0,1],
        ema:[0],emaSlope:[0],filter:["none"],htf:[0],entry:["market"],offset:[0],
        sl:["atr","candle","swing3"],stopAtr:[.75,1,1.5,2],buffer:[0,.1],minStop:[.25,.5],tp:["r"],
        target:[.75,1,1.25,1.5],expiry:[5],hold:[15,30,60,120],be:[null],trail:["off"],
        slots:[1,3,5],risk:[.005],sessionFlat:[false,true],entryCutoff:[0,5,15],sessionOrderCap:[0,2,3],
        adaptiveContext:[0,15],bandPosition:[.8,1],impulseZ:[0,.5,1],widthZ:[-.5,0,.5],rsiZ:[.5,1,1.5],
        bodyZ:[0,.5,1],requirePattern:[false,true],scoreMode:["reversion","continuation"],confirmScore:[2,3,4],
    });
    const profitStrategies=["greenredRaw","momentum","breakout","ema","meanReversion","vwapReversion","vwapMomentum",
        "trendPullback","adaptive","sessionMomentum","sessionReversion","openingMomentum","openingReversion",
        "rsiReversion","bollingerRsi","macdTrend","adxMomentum","engulfing","pinBar","insideBreakout",
        "emaPullback","regimeSwitch"];
    if(options.profitTournament)Object.assign(space,{
        strategy:profitStrategies,tf:profitTf?[profitTf]:[1,5,15,60,240,1440],lookback:[2,4,8,16,32],
        signalThreshold:[0,.1,.25,.5,1,1.5],regime:[.15,.25,.35,.5],pivotWidth:[2],direction:["both"],
        higherSwing:[0],pool:[3],spread:[.15,.25,.35,.5,1],body:[0,.2,.4],bodyAtr:[0,.1,.25],
        eff:[0,.1,.25,.4],activity:[0,.75,1,1.25],atrMin:[0,.15,.3],atrMax:[.8,.9,1],volume:[0,1,1.25],
        ema:[0,.1,.25],emaSlope:[0,.05,.15],filter:["none","none","bb","rsi","volume","score"],
        score:[1,2,3],room:[.5,1,1.5],htf:[0,15,60,240],hbars:[1,2,4],hmove:[0,.1,.25,.5],
        entry:["market","market","stop","limit"],offset:[0,.05,.1,.25],sl:["atr","candle","swing3","swing6"],
        stopAtr:[.5,.75,1,1.5,2,3],buffer:[0,.05,.1,.2],minStop:[.25,.5,.75],tp:["r","r","atr","vwap","structure"],
        target:[.5,.75,1,1.25,1.5,2,2.5,3,4],targetAtr:[.5,.75,1,1.5,2,3],
        expiry:[1,5,15,30,60,240,1440],hold:[5,15,30,60,120,240,480,720,1440,2880,7200,10080],
        be:[null,null,1,1.5],trail:["off","off","always","conditional"],activation:[.75,1,1.5,2],
        trailDistance:[.35,.5,.75,1],burst:[.25,.5,1],slots:[1,2,3,4,5],risk:[.005],
        sessionFlat:[false,true],allowOvernight:[false,true],entryCutoff:[0,15,30,60],sessionOrderCap:[0,1,2,3],
        rsiLevel:[20,25,30,35,40],adxLevel:[15,20,25,30],wickRatio:[1.5,2,3,4],emaConfirm:[false,true],
    });
    if(options.swingContinuation)Object.assign(space,{
        strategy:["greenred"],tf:[15],lookback:[2],signalThreshold:[0],regime:[.2],
        pivotWidth:[2,3,4],direction:["side","both"],higherSwing:[0,60],pool:[5],
        spread:[.15,.25,.35,.5,1],body:[0,.2,.4],bodyAtr:[0,.15,.3],eff:[0,.1,.25],
        activity:[0,.75,1],atrMin:[0,.15,.3],atrMax:[.8,.9,1],volume:[0,1,1.25],
        ema:[0],emaSlope:[0],filter:["none"],score:[0],room:[.5,1,1.5],
        rsiMode:["off","notExtreme","momentum","pullback","reversal"],rsiLow:[25,30,35],
        rsiMid:[45,50,55],rsiHigh:[65,70,75],bbMode:["off","room","breakout","roomOrBreakout"],
        htf:[0,60],hbars:[1,2,4],hmove:[0,.1,.25,.5],entry:["stop"],offset:[0],offsetSteps:[1,2],
        sl:["candle"],stopAtr:[1],buffer:[0,.05,.1],bufferSteps:[0,1,2],minStop:[.25,.5,.75],
        tp:["r"],target:[2],targetAtr:[1.5],expiry:[15,30],hold:[30,60,120,240,480],
        be:[null],trail:["off"],activation:[1],
        trailDistance:[.35,.5,.75],burst:[.25,.5,.75],slots:[1,2,3,4,5],risk:[.005],
        sessionFlat:[false],sessionHandoff:[false,true],allowOvernight:[false],entryCutoff:[0,15,30],
        sessionOrderCap:[0,1,2],
    });
    if(options.humanWaveContinuation)Object.assign(space,{
        strategy:["greenred"],tf:[5,15,15,15,60,240],lookback:[2],signalThreshold:[0],regime:[.2],
        pivotWidth:[null],direction:[null],higherSwing:[0],pool:[5],pairRankMode:["spread","activity","opportunity"],
        waveMinProgress:[0,.1,.25,.5,1],waveMinBars:[1,2,3],correctionMin:[1,2,3],correctionMax:[2,4,8,16],
        memoryMode:["off","off","align","avoidOpposite","meanRevert"],memoryThreshold:[0,.25,.5,1],
        spread:[.15,.25,.35,.5,1],body:[0,.2,.4],bodyAtr:[0,.15,.3],eff:[0,.1,.25],
        activity:[0,.75,1],atrMin:[0,.15,.3],atrMax:[.8,.9,1],volume:[0,1,1.25],
        ema:[0],emaSlope:[0],filter:["none"],score:[0],room:[.5,1,1.5],
        rsiMode:["off","off","notExtreme","momentum","pullback"],rsiLow:[25,30,35],
        rsiMid:[45,50,55],rsiHigh:[65,70,75],bbMode:["off","off","room","breakout","roomOrBreakout"],
        htf:[0,60],hbars:[1,2,4],hmove:[0,.1,.25,.5],entry:["stop"],offset:[0],offsetSteps:[1,2],
        sl:["candle"],stopAtr:[1],buffer:[0,.05,.1],bufferSteps:[0,1,2],minStop:[.25,.5,.75],
        tp:["r","none"],target:[1,2,3],targetAtr:[1.5],expiry:[15,30,60],hold:[60,120,240,480,720],
        be:[null,null,.5,1],trail:["off","off","always","conditional"],activation:[.5,1],
        trailDistance:[.25,.5,.75],burst:[.25,.5,.75],slots:[1,2,3,4,5],risk:[.005],
        sessionFlat:[false],sessionHandoff:[false,true],allowOvernight:[false],entryCutoff:[0,15,30],sessionOrderCap:[0,1,2],
    });
    if (options.fixed2r) space.target = [2];
    const seen = new Set(),
        leaders = [],
        familyCounts = {};
    const dailyScore = (r) => 2 * r.dailyStats.positiveActivePct + r.dailyStats.positiveCalendarPct
        + 4 * r.dailyStats.meanCalendarReturnPct + 2 * r.dailyStats.p10ActiveR - 3 * r.dailyStats.maxLossStreak;
    const activityScore = (r) => 5*r.dailyStats.twoOfThreeCalendarPct + 2*r.dailyStats.threeTradeDayPct
        + .5*r.dailyStats.positiveCalendarPct + .25*r.dailyStats.minSessionCoveragePct
        + 4*r.dailyStats.meanCalendarReturnPct - 2*r.dailyStats.maxLossStreak;
    const profitScore = r => (options.profitTournament
        ? (r.trades<20?-1e6+r.returnPct:100*Math.log(Math.max(.01,r.balance)/500))
        : options.reportCandidates
        ? (r.trades < 30 ? -1e6 + r.returnPct
            : 35*Math.log(Math.max(.01,r.balance)/500) + 10*Math.log(Math.max(.01,r.pf)) - .8*r.dd
                + .08*r.dailyStats.positiveCalendarPct + 20*Math.min(...Object.values(r.month).map(pnl => pnl/5)))
        : r.trades < 2.5*r.dailyStats.calendarDays || r.sessions.some(n => n < 5)
        ? -1e6 + r.returnPct
        : 35*Math.log(Math.max(.01,r.balance)/500) + 8*Math.log(Math.max(.01,r.pf)) - .7*r.dd
            + .12*r.dailyStats.positiveCalendarPct + .05*r.dailyStats.minSessionCoveragePct + .12*r.winRate
            + 25*Math.min(...Object.values(r.month).map(pnl => pnl/5)));
    const score = (r) => options.swingContinuation||options.humanWaveContinuation
        ? (r.trades < 45 || r.sessions.some(n => n < 3) ? -1e6 + r.returnPct
            : 100*Math.log(Math.max(.01,r.balance)/500) - .35*r.dd + .04*r.dailyStats.positiveCalendarPct)
        : options.alternative ? profitScore(r) : options.dailySearch
        ? (options.dailyActivity
            ? (r.trades < 2*r.dailyStats.calendarDays || r.sessions.some(n => n < 5) ? -1e6 + r.returnPct : activityScore(r))
            : (r.trades < 45 || r.sessions.some((n) => n < 3) ? -1e6 + r.returnPct : dailyScore(r)))
        : (r.trades < 60 || r.sessions.some((n) => n < 3) || r.returnPct <= 0 || r.pf < 1.05
            ? -1e6 + r.returnPct : 100 * Math.log(r.balance / 500) - 0.4 * r.dd);
    function insert(c, r) {
        const signature = [r.trades, r.returnPct, r.totalR, r.dd].join("|");
        if (leaders.some((x) => x.signature === signature)) return;
        const group = [c.strategy, c.lookback, c.tf, c.direction, c.entry, c.sl, c.tp, c.trail, c.slots, c.htf, c.higherSwing].join("|");
        leaders.push({ c, r, score: score(r), signature, group });
        leaders.sort((a, b) => b.score - a.score);
        const count = new Map();
        for (let i = 0; i < leaders.length; ) {
            const n = (count.get(leaders[i].group) ?? 0) + 1;
            count.set(leaders[i].group, n);
            if (n > 3) leaders.splice(i, 1);
            else i++;
        }
        const leaderLimit = options.profitTournament?8:options.swingContinuation||options.humanWaveContinuation?32:options.reportCandidates ? 80 : options.alternative ? 52 : 60;
        if (leaders.length > leaderLimit) {
            if (options.alternative) {
                const keep = [], perStrategy = new Map();
                for (const candidate of leaders) {
                    const count = perStrategy.get(candidate.c.strategy) ?? 0;
                    if (count < (options.profitTournament?1:options.reportCandidates ? 12 : 4)) {
                        keep.push(candidate);
                        perStrategy.set(candidate.c.strategy, count + 1);
                    }
                }
                leaders.splice(0, leaders.length, ...keep.slice(0, leaderLimit));
            } else leaders.length = leaderLimit;
        }
    }
    const profitBaseline={...baseline,strategy:"momentum",tf:profitTf||60,lookback:8,signalThreshold:.25,regime:.25,
        skipDirection:true,higherSwing:0,pool:3,spread:.5,body:0,bodyAtr:0,eff:0,activity:0,atrMin:0,atrMax:1,
        volume:0,ema:0,emaSlope:0,filter:"none",score:0,htf:0,hbars:1,hmove:0,entry:"market",offset:0,
        sl:"atr",stopAtr:1.5,buffer:0,minStop:.25,tp:"r",target:2,targetAtr:1.5,expiry:60,hold:720,
        be:null,trail:"off",activation:1,trailDistance:.5,burst:.5,slots:1,sessions:[0,1,2,3],dailyOrderCap:0,
        dailyStop:0,lossCap:0,sessionFlat:false,allowOvernight:false,entryCutoff:0,sessionOrderCap:0,
        risk:.005,portfolioRisk:.005,rsiLevel:30,adxLevel:20,wickRatio:2,emaConfirm:false};
    const swingBaseline={...baseline,strategy:"greenred",tf:15,lookback:2,signalThreshold:0,regime:.2,
        skipDirection:false,pivotWidth:2,direction:"side",higherSwing:0,pool:5,spread:.5,body:0,bodyAtr:0,
        eff:0,activity:0,atrMin:0,atrMax:1,volume:0,ema:0,emaSlope:0,filter:"none",score:0,
        rsiMode:"off",rsiLow:30,rsiMid:50,rsiHigh:70,bbMode:"off",room:1,htf:0,hbars:1,hmove:0,
        entry:"stop",offset:0,offsetSteps:1,sl:"candle",stopAtr:1,buffer:0,bufferSteps:1,minStop:.25,
        tp:"r",target:2,targetAtr:1.5,expiry:30,hold:240,be:null,trail:"off",activation:1,
        trailDistance:.5,burst:.5,slots:5,sessions:[0,1,2,3],dailyOrderCap:0,dailyStop:0,lossCap:0,
        sessionFlat:false,sessionHandoff:true,allowOvernight:false,entryCutoff:15,sessionOrderCap:0,
        risk:.005,portfolioRisk:.025};
    const humanWaveBaseline={...swingBaseline,name:"causal-human-wave",skipDirection:true,pivotWidth:null,direction:null,
        tf:15,target:2,be:null,trail:"off",activation:.5,trailDistance:.5,hold:480,expiry:30,
        waveMinProgress:0,waveMinBars:1,correctionMin:1,correctionMax:8,pairRankMode:"opportunity",
        memoryMode:"off",memoryThreshold:0,pool:5,slots:3,risk:.005,portfolioRisk:.015};
    const searchBaseline = options.humanWaveContinuation ? humanWaveBaseline
        : options.swingContinuation ? swingBaseline
        : options.profitTournament ? profitBaseline
        : options.m5Scalping ? {...baseline,strategy:"adaptiveBbRsi",tf:5,lookback:4,signalThreshold:0,
        skipDirection:true,higherSwing:0,pool:17,spread:.35,body:0,bodyAtr:0,eff:0,activity:0,atrMin:0,atrMax:1,
        volume:0,ema:0,emaSlope:0,filter:"none",score:0,htf:0,entry:"market",offset:0,sl:"atr",stopAtr:1,
        buffer:0,minStop:.25,tp:"r",target:1,expiry:5,hold:60,be:null,trail:"off",activation:1,
        trailDistance:.5,burst:0,slots:3,sessions:[0,1,2,3],dailyOrderCap:0,dailyStop:0,lossCap:0,
        sessionFlat:true,entryCutoff:5,sessionOrderCap:0,risk:.005,portfolioRisk:.015,adaptiveContext:0,
        bandPosition:1,impulseZ:.5,widthZ:-.5,rsiZ:1,bodyZ:0,requirePattern:true,
        scoreMode:"reversion",confirmScore:3}
        : options.reportCandidates ? { ...baseline, strategy:"trendEnsemble", bundle:1, signalThreshold:.55,
        contextAlign:false, adxMax:20, tf:15, skipDirection:true, higherSwing:0, pool:17, spread:1, body:0, bodyAtr:0,
        eff:0, activity:0, atrMin:0, atrMax:1, volume:0, ema:0, emaSlope:0, filter:"none", score:0, htf:60,
        entry:"market", offset:0, sl:"atr", stopAtr:2, buffer:0, minStop:.25, tp:"r", target:2, expiry:15, hold:720,
        be:null, trail:"off", activation:.5, trailDistance:1.5, burst:0, slots:1, sessions:[0,1,2,3], dailyOrderCap:0,
        dailyStop:0, lossCap:0, sessionFlat:false, entryCutoff:0, sessionOrderCap:0, risk:.005, portfolioRisk:.03 }
        : options.alternative ? { ...baseline, strategy:"momentum", lookback:8, signalThreshold:.25, regime:.2,
        tf:15, skipDirection:true, higherSwing:0, pool:5, spread:.3, body:0, bodyAtr:0,
        eff:0, activity:.75, atrMin:.15, atrMax:.9, volume:0, ema:0, emaSlope:0, filter:"none", score:0, htf:0,
        entry:"market", offset:0, sl:"atr", stopAtr:1, buffer:0, minStop:.5, tp:"r", target:1.5, expiry:15, hold:240,
        be:1, trail:"off", slots:3, sessions:[0,1,2,3], dailyOrderCap:0, dailyStop:0, lossCap:0,
        sessionFlat:false, entryCutoff:30, sessionOrderCap:1, risk:.01, portfolioRisk:.15 }
        : options.dailyActivity ? { ...baseline, tf:15, higherSwing:0, pool:17, spread:.5, body:0, bodyAtr:0,
        eff:0, activity:0, atrMin:0, atrMax:1, volume:0, ema:0, emaSlope:0, filter:"none", score:0, htf:0,
        entry:"stop", offset:0, sl:"candle", buffer:.1, minStop:.25, tp:"r", target:1, expiry:30, hold:120,
        be:null, trail:"off", slots:5, sessions:[0,1,2,3], dailyOrderCap:0, dailyStop:0, lossCap:0,
        sessionFlat:true, entryCutoff:15, risk:.03, portfolioRisk:.15 }
        : options.dailySearch ? { ...baseline, pool: 7, sessions: [0, 1, 2, 3], dailyOrderCap: 0,
        dailyStop: 0, lossCap: 0, sessionFlat: true, entryCutoff: 15, risk: 0.03, portfolioRisk: 0.15 } : baseline;
    const searchStep=options.profitTournament?1:options.m5Scalping?5:options.swingContinuation||options.humanWaveContinuation?5:options.alternative?1:5;
    const baselineTrain = evaluate(searchBaseline, START, TRAINEND, searchStep);
    insert(searchBaseline, baselineTrain);
    console.log("BASELINE_TRAIN", JSON.stringify(baselineTrain));
    const seconds = Number(options.seconds ?? 1200);
    if (!(seconds > 0 && Number.isFinite(seconds))) throw Error("seconds must be positive");
    const evaluationLimit = options.evaluations === undefined ? null : Number(options.evaluations);
    if (evaluationLimit !== null && (!Number.isInteger(evaluationLimit) || evaluationLimit < 1)) throw Error("evaluations must be a positive integer");
    let iterations = 0;
    const started = Date.now(),
        deadline = started + seconds * 1000;
    const reportGrid = [];
    if (options.reportCandidates) {
        for (const strategy of ["reportMomentum","reportTrend","reportBreakout","trendEnsemble","regimeMeanReversion"])
            for (const tf of [15,60]) for (const bundle of strategy === "reportBreakout" ? [0,1] : [0,1,2]) for (const signalThreshold of [.35,.55,.75])
                for (const contextAlign of [false,true]) for (const stopAtr of [1.5,2,2.5]) for (const exit of [
                    { exit:"fixed", target:2, hold:720, trail:"off", trailingAtr:null },
                    { exit:"time", target:20, hold:tf === 15 ? 240 : 720, trail:"off", trailingAtr:null },
                    { exit:"opposite", target:20, hold:720, trail:"off", trailingAtr:null },
                    ...[2,3,4].map(trailingAtr => ({ exit:"trail", target:20, hold:720, trail:"always", trailingAtr })),
                ]) reportGrid.push({ ...searchBaseline, strategy, tf, bundle, signalThreshold, contextAlign, stopAtr,
                    target:exit.target, hold:exit.hold, trail:exit.trail,
                    trailDistance:exit.trailingAtr ? exit.trailingAtr/stopAtr : 1,
                    htf:tf === 15 ? 60 : 240, exitFamily:exit.exit, trailingAtr:exit.trailingAtr });
    }
    const swingGrid=[];
    if(options.swingContinuation)for(const pivotWidth of [2,3,4])for(const direction of ["side","both"])
        for(const rsiMode of ["off","notExtreme","momentum","pullback"])
        for(const bbMode of ["off","room","breakout","roomOrBreakout"])
        for(const higherSwing of [0,60])swingGrid.push({...swingBaseline,
            pivotWidth,direction,rsiMode,bbMode,higherSwing,htf:higherSwing?0:60});
    const humanWaveGrid=[];
    if(options.humanWaveContinuation)for(const tf of [5,15,60,240])for(const target of [1,2,3])
        for(const pairRankMode of ["spread","activity","opportunity"])
        for(const exit of [{tp:"r",trail:"off",be:null,activation:.5,trailDistance:.5},
            {trail:"always",be:null,activation:.5,trailDistance:.5},
            {tp:"none",trail:"always",be:null,activation:.5,trailDistance:.5},
            {trail:"conditional",be:null,activation:.5,trailDistance:.5},
            {trail:"off",be:.5,activation:.5,trailDistance:.5}])humanWaveGrid.push({...humanWaveBaseline,tf,target,pairRankMode,...exit});
    const seedQueue = options.reportCandidates ? reportGrid : options.humanWaveContinuation ? humanWaveGrid
        : options.swingContinuation ? swingGrid : options.profitTournament
        ? [1,2].flatMap(target=>profitStrategies.flatMap(strategy=>(profitTf?[profitTf]:[1,5,15,60,240,1440]).map(tf=>({
            ...profitBaseline,strategy,tf,target,lookback:tf<=15?8:4,signalThreshold:
                strategy==="breakout"?0:strategy==="meanReversion"?1:.25,
            expiry:tf,hold:Math.min(10080,Math.max(tf*4,tf===1?30:tf===5?60:tf===15?240:tf*6)),
            allowOvernight:tf>=240,sessionFlat:tf<240,entry:strategy.startsWith("opening")?"market":profitBaseline.entry,
        }))))
        : options.m5Scalping
        ? ["adaptiveBbRsi","adaptiveBbPattern","adaptiveBbMomentum","m5ScalpScore"].flatMap(strategy=>
            [.75,1,1.25,1.5].flatMap(target=>[1,3,5].map(slots=>({...searchBaseline,strategy,target,slots,
                portfolioRisk:.005*slots,requirePattern:strategy==="adaptiveBbRsi"?true:searchBaseline.requirePattern,
                confirmScore:strategy==="m5ScalpScore"?3:searchBaseline.confirmScore}))))
        : options.alternative
        ? ["momentum", "breakout", "ema", "meanReversion", "vwapReversion", "vwapMomentum", "trendPullback", "adaptive",
            "sessionMomentum", "sessionReversion", "openingMomentum", "openingReversion"].flatMap(strategy =>
            [15, 60].flatMap(tf => [.75, 1, 1.5, 2].map(target => ({
            ...searchBaseline, strategy, tf, target,
            lookback: strategy.startsWith("opening") ? 2 : tf === 15 ? 16 : 4,
            signalThreshold: strategy === "breakout" ? 0 : strategy === "meanReversion" ? 1 : .5,
        }))))
        : [];
    let last = started;
    const effectiveLimit = options.reportCandidates && evaluationLimit === null ? reportGrid.length : evaluationLimit;
    while (effectiveLimit === null ? Date.now() < deadline : seen.size < effectiveLimit) {
        const seeded = seedQueue.shift(),
            c = { ...(seeded ?? (leaders.length && random() < 0.7 ? pick(leaders.slice(0, 20)).c : searchBaseline)) };
        if (!seeded) {
            const keys = random() < 0.3 ? Object.keys(space) : Array.from({ length: pick([1, 2, 3, 5]) }, () => pick(Object.keys(space)));
            for (const k of keys) c[k] = pick(space[k]);
        }
        if (c.higherSwing) c.htf = 0;
        if (c.tf === 60 && c.higherSwing === 60) c.higherSwing = 0;
        if (!options.reportCandidates) c.trailDistance = Math.min(c.trailDistance, c.activation);
        c.stopAtr ??= 1;
        c.targetAtr ??= 1.5;
        if (options.dailySearch) Object.assign(c, {
            sessions: [0, 1, 2, 3], dailyOrderCap: 0, dailyStop: 0, lossCap: 0,
            ...(!options.alternative ? { sessionFlat: true, risk: 0.03 } : {}), portfolioRisk: 0.15,
        });
        if(options.profitTournament){
            c.pool=3;c.risk=.005;c.portfolioRisk=.005*c.slots;c.sessions=[0,1,2,3];
            c.dailyOrderCap=0;c.dailyStop=0;c.lossCap=0;c.expiry=Math.max(1,c.entry==="market"?c.tf:Math.max(c.tf,c.expiry));
            c.hold=Math.max(c.tf,c.hold);if(c.htf&&c.htf<=c.tf)c.htf=0;
            if(c.tf>=240)c.allowOvernight=true;
        }
        if(options.swingContinuation){
            c.strategy="greenred";c.tf=15;c.entry="stop";c.sl="candle";c.tp="r";c.offset=0;
            c.pool=5;c.target=2;c.be=null;c.trail="off";
            c.risk=.005;c.portfolioRisk=.005*c.slots;c.sessions=[0,1,2,3];c.dailyOrderCap=0;
            c.dailyStop=0;c.lossCap=0;c.sessionFlat=false;c.allowOvernight=false;c.skipDirection=false;
            if(c.higherSwing)c.htf=0;
        }
        if(options.humanWaveContinuation){
            c.strategy="greenred";c.skipDirection=true;c.pivotWidth=null;c.direction=null;c.higherSwing=0;c.entry="stop";c.sl="candle";
            if(!["r","none"].includes(c.tp))c.tp="r";
            c.offset=0;c.pool=5;c.risk=.005;c.portfolioRisk=Math.min(.15,.005*c.slots);c.sessions=[0,1,2,3];
            c.dailyOrderCap=0;c.dailyStop=0;c.lossCap=0;c.sessionFlat=false;c.allowOvernight=false;
            c.target=[1,2,3].includes(c.target)?c.target:2;c.correctionMin=Math.max(1,c.correctionMin);
            c.correctionMax=Math.max(c.correctionMin,c.correctionMax);c.trailDistance=Math.min(c.trailDistance,c.activation);
        }
        if(options.m5Scalping){c.tf=5;c.risk=.005;c.portfolioRisk=.005*c.slots;c.entry="market";c.expiry=5;c.trail="off";}
        const fingerprint = JSON.stringify(c);
        iterations++;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        const r = evaluate(c, START, TRAINEND, searchStep);
        insert(c, r);
        const group = c.slots + "/" + c.trail;
        familyCounts[group] = (familyCounts[group] ?? 0) + 1;
        if (Date.now() - last >= 30000) {
            last = Date.now();
            console.log(
                "PROGRESS",
                JSON.stringify({
                    seconds: Math.round((Date.now() - started) / 1000),
                    evaluated: seen.size,
                    best: leaders
                        .slice(0, 3)
                        .map((x) => ({
                            returnPct: x.r.returnPct,
                            pf: x.r.pf,
                            trades: x.r.trades,
                            strategy: x.c.strategy,
                            tf: x.c.tf,
                            lookback: x.c.lookback,
                            threshold: x.c.signalThreshold,
                            target: x.c.target,
                            slots: x.c.slots,
                            trail: x.c.trail,
                            direction: x.c.direction,
                        })),
                }),
            );
        }
    }
    const search = { seconds: (Date.now() - started) / 1000, iterations, evaluated: seen.size, familyCounts };
    console.log("SEARCH_DONE", JSON.stringify(search));
    const finalists = [];
    for (const x of leaders) {
        const train = evaluate(x.c, START, TRAINEND, 1),
            validation = evaluate(x.c, TRAINEND, VALEND, 1),
            stress = evaluate(x.c, TRAINEND, VALEND, 1, 1.25);
        if (options.dailySearch || options.reportCandidates) {
            const folds = [];
            if(options.profitTournament){
                const middle=START+Math.floor((TRAINEND-START)/2);
                for(const [from,to] of [[START,middle],[middle,TRAINEND],[TRAINEND,VALEND]])folds.push(evaluate(x.c,from,to,1));
            }else for (let cursor = new Date(START); cursor.getTime() < VALEND;) {
                    const from = cursor.getTime();
                    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
                    const to = Math.min(cursor.getTime(), VALEND);
                    folds.push(evaluate(x.c, from, to, 1));
                }
            const robust = [...folds, stress];
            const eligible = options.humanWaveContinuation
                ? train.trades>=60&&validation.trades>=15&&train.returnPct>0&&validation.returnPct>0&&stress.returnPct>0
                    &&train.pf>1&&validation.pf>1&&stress.pf>=1
                    &&folds.filter(r=>r.returnPct>0&&r.pf>1).length>=Math.ceil(.7*folds.length)
                    &&Math.min(...folds.map(r=>r.returnPct))>-3
                : options.swingContinuation
                ? train.trades>=60&&validation.trades>=15&&train.returnPct>0&&validation.returnPct>0&&stress.returnPct>0
                    &&train.pf>1&&validation.pf>1&&stress.pf>=1
                    &&folds.filter(r=>r.returnPct>0&&r.pf>1).length>=Math.ceil(.6*folds.length)
                : options.profitTournament
                ? train.trades>=50&&validation.trades>=15&&train.returnPct>0&&validation.returnPct>0&&stress.returnPct>0
                    &&train.pf>1&&validation.pf>1&&stress.pf>=1
                    &&folds.filter(r=>r.returnPct>0&&r.pf>1).length>=Math.ceil(.6*folds.length)
                : options.m5Scalping
                ? train.trades>=100&&validation.trades>=30&&train.returnPct>0&&validation.returnPct>0&&stress.returnPct>0
                    &&train.pf>1&&validation.pf>1&&stress.pf>=1
                    &&folds.filter(r=>r.returnPct>0&&r.pf>1).length>=Math.ceil(.6*folds.length)
                : options.reportCandidates
                ? train.trades >= 60 && validation.trades >= 15 && train.returnPct > 0 && validation.returnPct > 0
                    && stress.returnPct > 0 && train.pf >= 1.05 && validation.pf >= 1.15 && stress.pf >= 1.05
                    && folds.filter(r => r.returnPct > 0).length >= Math.ceil(.7*folds.length)
                : robust.every(r => options.alternative
                ? r.returnPct > 0 && r.pf > 1 && r.winRate > 50
                    && r.dailyStats.averageTradesPerCalendarDay >= 2.5
                    && r.dailyStats.positiveCalendarPct > 50 && r.sessions.every(n => n >= 1)
                : options.dailyActivity
                ? r.dailyStats.threeTradeDayPct === 100 && r.dailyStats.twoOfThreeCalendarPct === 100
                    && r.winRate > 50 && r.dailyStats.meanCalendarReturnPct > 0 && r.returnPct > 0 && r.sessions.every(n => n >= 1)
                : r.dailyStats.activeDays >= 5 && r.dailyStats.positiveActivePct > 50
                    && r.dailyStats.meanCalendarReturnPct > 0 && r.returnPct > 0 && r.sessions.every(n => n >= 1))
                && train.sessions.every(n => n >= 3);
            const complexityPenalty = options.reportCandidates
                ? ({ trendEnsemble: 1, regimeMeanReversion: 1 }[x.c.strategy] ?? 0)
                : 0;
            const rank = (eligible ? 1e6 : 0)
                + Math.min(...robust.map(options.swingContinuation||options.humanWaveContinuation ? score : options.alternative ? profitScore : options.dailyActivity ? activityScore : dailyScore))
                - complexityPenalty;
            finalists.push({ c: x.c, train, validation, stress, folds, eligible, rank });
        } else {
            const eligible = train.trades >= 60 && validation.trades >= 15 && train.returnPct > 0 && validation.returnPct > 0
                && stress.returnPct > 0 && train.pf >= 1.05 && validation.pf >= 1.05 && stress.pf >= 1
                && train.sessions.every((n) => n >= 3);
            const rank = (eligible ? 1e6 : 0) + Math.min(
                (100 * Math.log(train.balance / 500)) / ((TRAINEND - START) / DAY),
                (100 * Math.log(validation.balance / 500)) / ((VALEND - TRAINEND) / DAY)) * 30 - 0.25 * validation.dd;
            finalists.push({ c: x.c, train, validation, stress, eligible, rank });
        }
    }
    finalists.sort((a, b) => b.rank - a.rank);
    const compactStats = r => ({ balance:r.balance, pnl:r.pnl, returnPct:r.returnPct, trades:r.trades,
        winRate:r.winRate, pf:r.pf, dd:r.dd, avgHoldMinutes:r.avgHoldMinutes,
        maxMargin:r.maxMargin, maxNominalRisk:r.maxNominalRisk,
        positiveDays:r.dailyStats.positiveCalendarPct, tradesPerDay:r.dailyStats.averageTradesPerCalendarDay,
        sessionCoverage:r.dailyStats.sessionCoveragePct, month:r.month });
    if (options.alternative && !options.reportCandidates) console.log("FINALIST_SUMMARY", JSON.stringify(finalists.slice(0, 12).map(x => ({
        c: x.c, eligible: x.eligible, rank: x.rank, train:compactStats(x.train), validation:compactStats(x.validation),
        stress:compactStats(x.stress),
        months: x.folds.map(r => ({ returnPct:r.returnPct, trades:r.trades, winRate:r.winRate, pf:r.pf,
            positiveDays:r.dailyStats.positiveCalendarPct, tradesPerDay:r.dailyStats.averageTradesPerCalendarDay }))
    }))));
    const selected = finalists[0];
    console.log("FROZEN_SELECTION", JSON.stringify(options.alternative ? { c:selected.c, eligible:selected.eligible, rank:selected.rank,
        train:compactStats(selected.train), validation:compactStats(selected.validation), stress:compactStats(selected.stress) } : selected));
    const test = evaluate(selected.c, VALEND, END, 1),
        testStress = evaluate(selected.c, VALEND, END, 1, 1.25),
        testStress15 = options.reportCandidates ? evaluate(selected.c, VALEND, END, 1, 1.5) : null,
        testStress20 = options.reportCandidates ? evaluate(selected.c, VALEND, END, 1, 2) : null,
        full = evaluate(selected.c, START, END, 1, 1, Boolean(options.trades)),
        filterAudit=options.humanWaveContinuation?{
            development:counterfactualFilterAudit(selected.c,START,VALEND),
            diagnostic:counterfactualFilterAudit(selected.c,VALEND,END),
        }:null;
    const familyChampions = options.reportCandidates ? [...reportStrategies].map(strategy => finalists.find(x => x.c.strategy === strategy)).filter(Boolean)
        .map(x => ({ strategy:x.c.strategy, c:x.c, eligible:x.eligible, rank:x.rank, train:compactStats(x.train),
            validation:compactStats(x.validation), stress:compactStats(x.stress), test:compactStats(evaluate(x.c,VALEND,END,1)),
            stress15:compactStats(evaluate(x.c,VALEND,END,1,1.5)), stress20:compactStats(evaluate(x.c,VALEND,END,1,2)),
            full:compactStats(evaluate(x.c,START,END,1)),
            risk1Test:compactStats(evaluate({...x.c,risk:.01},VALEND,END,1)),
            risk1Full:compactStats(evaluate({...x.c,risk:.01},START,END,1)),
            portfolioVariants:[1,3,5].flatMap(slots => [.005,.01].map(risk => {
                const config = {...x.c,slots,risk,portfolioRisk:Math.min(.15,slots*risk)};
                return { slots, risk, validation:compactStats(evaluate(config,TRAINEND,VALEND,1)),
                    test:compactStats(evaluate(config,VALEND,END,1)), full:compactStats(evaluate(config,START,END,1)) };
            })) })) : null;
    const comparisons = [];
    if (!options.reportCandidates&&!options.m5Scalping&&!options.profitTournament&&!options.swingContinuation&&!options.humanWaveContinuation)
        for (const slots of [1, 2, 3, 4, 5])
            for (const trail of ["off", "always", "conditional"]) {
                const c = { ...selected.c, slots, trail };
                comparisons.push({
                    slots,
                    trail,
                    train: evaluate(c, START, TRAINEND, 1),
                    validation: evaluate(c, TRAINEND, VALEND, 1),
                    test: evaluate(c, VALEND, END, 1),
                });
            }
    const scalpingRiskSweep=options.m5Scalping?[1,3,5].flatMap(slots=>[.005,.01,.02,.03].map(risk=>{
        const c={...selected.c,slots,risk,portfolioRisk:Math.min(.15,slots*risk)};
        return {slots,riskPct:100*risk,validation:compactStats(evaluate(c,TRAINEND,VALEND,1)),
            test:compactStats(evaluate(c,VALEND,END,1)),testStress125:compactStats(evaluate(c,VALEND,END,1,1.25)),
            full:compactStats(evaluate(c,START,END,1))};
    })):null;
    const profitRiskSweep=options.profitTournament&&!options.skipRiskSweep?[1,2,3,4,5].flatMap(slots=>[.005,.01,.02,.03].map(risk=>{
        const c={...selected.c,slots,risk,portfolioRisk:Math.min(.15,slots*risk)};
        return {slots,riskPct:100*risk,validation:compactStats(evaluate(c,TRAINEND,VALEND,1)),
            test:compactStats(evaluate(c,VALEND,END,1)),testStress125:compactStats(evaluate(c,VALEND,END,1,1.25)),
            full:compactStats(evaluate(c,START,END,1))};
    })):null;
    const swingRiskSweep=options.swingContinuation&&!options.skipRiskSweep?[1,2,3,4,5].flatMap(slots=>[.005,.01,.02,.03].map(risk=>{
        const c={...selected.c,slots,risk,portfolioRisk:Math.min(.15,slots*risk)};
        return {slots,riskPct:100*risk,validation:compactStats(evaluate(c,TRAINEND,VALEND,1)),
            test:compactStats(evaluate(c,VALEND,END,1)),testStress125:compactStats(evaluate(c,VALEND,END,1,1.25)),
            full:compactStats(evaluate(c,START,END,1))};
    })):null;
    const humanWaveRiskSweep=options.humanWaveContinuation&&!options.skipRiskSweep?[1,2,3,4,5].flatMap(slots=>[.005,.01,.02,.03].map(risk=>{
        const c={...selected.c,slots,risk,portfolioRisk:Math.min(.15,slots*risk)};
        return {slots,riskPct:100*risk,nominalPortfolioRiskPct:100*c.portfolioRisk,
            validation:compactStats(evaluate(c,TRAINEND,VALEND,1)),test:compactStats(evaluate(c,VALEND,END,1)),
            testStress125:compactStats(evaluate(c,VALEND,END,1,1.25)),full:compactStats(evaluate(c,START,END,1))};
    })):null;
    let unchanged = sha(fs.readFileSync(new URL("./autoresearch/prepare.js", import.meta.url), "utf8")) === sourceHash;
    for (const symbol of symbols) {
        const stat = fs.statSync(dir + "/" + symbol + "_M1.jsonl");
        unchanged &&= stat.size === coverage[symbol].size && stat.mtimeMs === coverage[symbol].mtimeMs;
        for(const tf of options.profitTournament||options.humanWaveContinuation?tfs:[15]){
            const label={5:"M5",15:"M15",60:"H1",240:"H4",1440:"D1"}[tf],file=dir+"/"+symbol+"_"+label+".jsonl",
                native=fs.statSync(file),record=coverage[symbol][`native${tf}`];
            unchanged&&=native.size===record.size;
            if(record.mtimeMs!==undefined)unchanged&&=native.mtimeMs===record.mtimeMs;
        }
    }
    const selectedOutput = options.reportCandidates ? { c:selected.c, eligible:selected.eligible, rank:selected.rank,
        train:compactStats(selected.train), validation:compactStats(selected.validation), stress:compactStats(selected.stress) }
        : selected;
    const comparisonBaseline = options.reportCandidates||options.m5Scalping||options.profitTournament||options.swingContinuation||options.humanWaveContinuation ? searchBaseline : baseline;
    return {
        protocol: {
            name: options.humanWaveContinuation ? "causal-human-wave-continuation-no-pivot-v1"
                : options.swingContinuation ? "universal-m15-swing-continuation-fixed-2r-v2"
                : options.profitTournament ? "universal-profit-tournament-v1"
                : options.m5Scalping ? "universal-m5-bollinger-rsi-greenred-scalping-v1"
                : options.reportCandidates ? "research-report-candidate-grid-v1"
                : options.alternative ? "universal-regime-ensemble-v2" : "global-confirmed-swings-greenred-v2-broker-rules",
            from: iso(START),
            trainEnd: iso(TRAINEND),
            validationEnd: iso(VALEND),
            to: iso(END),
            startCapital: 500,
            expiryMinutes: 30,
            pairProfiles: false,
            partialExits: false,
            ...(options.humanWaveContinuation ? { rewardRiskSearched:[1,2,3],
                signalTimeframes:[5,15,60,240].includes(fixedFamilyTf)?[fixedFamilyTf]:[5,15,60,240],sessionPoolSize:5,
                signalDefinition:"two causally confirmed same-colour wave extrema, correction, first closed continuation candle; no pivot/future window" }
                : options.swingContinuation ? { initialRewardRisk: 2, sessionPoolSize: 5 } : {}),
            dailyObjective: Boolean(options.dailySearch),
            dailyActivityObjective: Boolean(options.dailyActivity),
            sessionFlat: options.swingContinuation||options.humanWaveContinuation ? "session handoff searched"
                : options.alternative ? "searched" : Boolean(options.dailySearch),
            seed: options.seed ?? 20260906,
            testStatus: options.profitTournament
                ? "excluded from this selection, but calendar region was inspected by earlier experiments"
                : "previously-inspected-chronological-diagnostic",
        },
        sourceHash,
        rulesHash,
        fileFingerprint,
        unchanged,
        search,
        selected:selectedOutput,
        test,
        testStress,
        ...(options.reportCandidates ? { testStress15, testStress20, familyChampions } : {}),
        full,
        ...(filterAudit?{filterAudit}:{}),
        baseline: { config: comparisonBaseline, full: evaluate(comparisonBaseline, START, END, 1),
            test: evaluate(comparisonBaseline, VALEND, END, 1) },
        comparisons,
        ...(options.m5Scalping?{scalpingRiskSweep}:{}),
        ...(options.profitTournament?{profitRiskSweep}:{}),
        ...(options.swingContinuation?{swingRiskSweep}:{}),
        ...(options.humanWaveContinuation?{humanWaveRiskSweep}:{}),
        finalists: options.alternative ? finalists.slice(0, 5).map(x => ({ c:x.c, eligible:x.eligible, rank:x.rank,
            train:compactStats(x.train), validation:compactStats(x.validation), stress:compactStats(x.stress),
            months:x.folds?.map(compactStats) })) : finalists.slice(0, 5),
    };
}
function parseArgs(argv) {
    const options = {};
    const names = {
        "--dataset": "dataset",
        "--seconds": "seconds",
        "--seed": "seed",
        "--from": "from",
        "--to": "to",
        "--train-end": "trainEnd",
        "--validation-end": "validationEnd",
        "--split": "split",
        "--profit-timeframe": "profitTimeframe",
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (names[arg]) {
            if (!argv[i + 1]) throw Error("Missing value for " + arg);
            options[names[arg]] = argv[++i];
        } else if (arg === "--check") options.check = true;
        else if (arg === "--trades") options.trades = true;
        else if (arg === "--fixed-2r") options.fixed2r = true;
        else if (arg === "--evaluations") options.evaluations = Number(argv[++i]);
        else if (arg === "--candidate") options.candidate = JSON.parse(argv[++i]);
        else if (arg === "--kronos-runtime") options.kronosRuntime = argv[++i];
        else if (arg === "--kronos-model") options.kronosModel = argv[++i];
        else if (arg === "--kronos-samples") options.kronosSamples = Number(argv[++i]);
        else if (arg === "--kronos-cache") options.kronosCache = argv[++i];
        else if (arg === "--kronos-plan") options.kronosPlan = true;
        else if (arg === "--kronos-core") options.kronosCore = JSON.parse(argv[++i]);
        else if (arg === "--daily-objective") options.dailyObjective = true;
        else if (arg === "--daily-search") options.dailySearch = true;
        else if (arg === "--daily-activity-search") options.dailyActivitySearch = true;
        else if (arg === "--daily-activity-objective") options.dailyActivityObjective = true;
        else if (arg === "--alternative-search") options.alternativeSearch = true;
        else if (arg === "--alternative-objective") options.alternativeObjective = true;
        else if (arg === "--report-candidates") options.reportCandidates = true;
        else if (arg === "--dynamic-profiles") options.dynamicProfiles = true;
        else if (arg === "--production-study") options.productionStudy = true;
        else if (arg === "--institutional-study") options.institutionalStudy = true;
        else if (arg === "--adaptive-pair-study") options.adaptivePairStudy = true;
        else if (arg === "--m5-scalping") options.m5Scalping = true;
        else if (arg === "--profit-tournament") options.profitTournament = true;
        else if (arg === "--swing-continuation") options.swingContinuation = true;
        else if (arg === "--human-wave-continuation") options.humanWaveContinuation = true;
        else if (arg === "--quality-screen-study") options.qualityScreenStudy = true;
        else if (arg === "--skip-risk-sweep") options.skipRiskSweep = true;
        else if (arg === "--help") options.help = true;
        else throw Error("Unknown argument: " + arg);
    }
    return options;
}
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    const options = parseArgs(process.argv.slice(2));
    if (options.help)
        console.log(
            "node lab/replay.js --dataset <remote directory> [--seconds 1200 | --evaluations N | --candidate JSON | --kronos-runtime PATH [--kronos-model small|base] [--kronos-samples 6] [--kronos-cache lab/PATH] | --kronos-plan] [--quality-screen-study | --daily-objective | --daily-search | --daily-activity-search | --daily-activity-objective | --alternative-search | --alternative-objective | --report-candidates | --dynamic-profiles | --production-study | --institutional-study | --adaptive-pair-study | --m5-scalping | --profit-tournament --profit-timeframe N | --swing-continuation] [--from ISO --split ISO --train-end ISO --validation-end ISO --to ISO] [--fixed-2r] [--skip-risk-sweep] [--check] [--trades]",
        );
    else
        runGlobalResearch(options)
            .then((result) => console.log("RESULT", JSON.stringify(result)))
            .catch((error) => {
                console.error(error.stack);
                process.exitCode = 1;
            });
}
