import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { detectWave } from "./detect-wave-simple.js";

const [dataset, rulesFile, reportFile, refinementSource] = process.argv.slice(2);
if (!reportFile) throw new Error("Usage: node dynamic-activity-study.mjs DATASET RULES REPORT");
const minute = 60_000;
const symbols = ["USDJPY", "GBPUSD", "AUDJPY", "EURUSD", "USDCHF", "AUDUSD", "EURJPY", "GBPCHF"];
let library = fs.readFileSync(new URL("./h1-wave-top5-portfolio.js", import.meta.url), "utf8")
    .split("const args = parseArgs(process.argv.slice(2));")[0]
    .replace(/^import .*;\n/gm, "")
    .replace(/const SYMBOLS = \[[\s\S]*?\];/, `const SYMBOLS = ${JSON.stringify(symbols)};`)
    .replace("...bid, bid, ask });", "...bid, bid, ask, volume: Number(raw.volume ?? 0) });")
    .replace("signal.execution?.trailActivationR ?? experiment.trailActivationR",
        "(signal.execution && Object.hasOwn(signal.execution, 'trailActivationR') ? signal.execution.trailActivationR : experiment.trailActivationR)")
    .replaceAll("22 * 60", "21 * 60")
    .replace("minute === 21 * 60", "minute >= 21 * 60")
    .replace("date.getUTCHours() === 20 && date.getUTCMinutes() === 0", "date.getUTCHours() >= 20");
const managementStart = library.indexOf("    const managePosition =");
const managementEnd = library.indexOf("    const placeSignals =", managementStart);
library = library.slice(0, managementStart) + `    const managePosition = (position, bar, askClose) => {
        const management = position.management;
        if (!management) return false;
        const price = position.side === 'BUY' ? bar.bid.close : askClose;
        const sign = position.side === 'BUY' ? 1 : -1;
        const profitR = sign * (price-position.entry) / position.distance;
        if (profitR < management.activationR) return false;
        const rows = data[position.symbol][management.stepTimeframe];
        const minutes = management.stepTimeframe === 'm15' ? 15 : 5;
        const index = atOrBefore(rows,bar.t+MINUTE-minutes*MINUTE);
        const candle = rows[index];
        if (!candle) return false;
        const candidate = position.side === 'BUY'
            ? Math.max(position.entry,candle.low-management.bufferAtr*candle.atr)
            : Math.min(position.entry,candle.high+management.bufferAtr*candle.atr);
        const improves = sign*(candidate-position.activeStop)>0;
        const behind = sign*(price-candidate)>0;
        if (improves && behind) { position.activeStop=candidate;position.stopMoves+=1; }
        return false;
    };\n` + library.slice(managementEnd);
const engine = vm.runInNewContext(library + "\n({loadMerged,addAtr,emaSeries,atOrBefore,activeContext,buildSignals,simulate,DEFAULT_EXPERIMENT})", {fs,path,detectWave});
const data = {};
const audit = {};
for (const symbol of symbols) {
    data[symbol] = {};
    for (const frame of ["H1","M15","M5","M1"]) {
        const loaded = engine.loadMerged([dataset],symbol,frame,frame!=="M1");
        data[symbol][frame.toLowerCase()] = loaded.rows;
        audit[`${symbol}_${frame}`] = loaded.audit;
    }
    console.log(JSON.stringify({loaded:symbol}));
}
const end = Math.min(...symbols.map(symbol=>data[symbol].m1.at(-1).t+minute));
const partitions = {
    train:[Date.parse("2026-01-01T00:00:00Z"),Date.parse("2026-06-01T00:00:00Z")],
    validation:[Date.parse("2026-06-01T00:00:00Z"),Date.parse("2026-09-01T00:00:00Z")],
    diagnostic:[Date.parse("2026-09-01T00:00:00Z"),Date.parse("2026-11-01T00:00:00Z")],
    november:[Date.parse("2026-11-01T00:00:00Z"),end],
    full:[Date.parse("2026-01-01T00:00:00Z"),end],
};
const rulesDoc = JSON.parse(fs.readFileSync(rulesFile,"utf8"));
const rules = rulesDoc.symbols ?? rulesDoc;
const quantile = (values,p) => { const rows=values.slice().sort((a,b)=>a-b);return rows[Math.floor((rows.length-1)*p)] ?? 0; };
const mean = values => values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
function enrich(rows) {
    engine.addAtr(rows);
    const fast = engine.emaSeries(rows,20), slow = engine.emaSeries(rows,50);
    let gain=0,loss=0;
    for (let i=0;i<rows.length;i++) {
        const change=i?rows[i].close-rows[i-1].close:0;
        gain=i<=14?gain+Math.max(0,change)/14:(gain*13+Math.max(0,change))/14;
        loss=i<=14?loss+Math.max(0,-change)/14:(loss*13+Math.max(0,-change))/14;
        rows[i].rsi=loss>0?100-100/(1+gain/loss):gain>0?100:50;
        rows[i].ema20=fast[i];rows[i].ema50=slow[i];
    }
}
function aggregate30(rows) {
    const output=[];
    for(let i=1;i<rows.length;i++) {
        const a=rows[i-1],b=rows[i];
        if(a.t%1_800_000!==0||b.t-a.t!==900_000) continue;
        const side=name=>({open:a[name].open,high:Math.max(a[name].high,b[name].high),low:Math.min(a[name].low,b[name].low),close:b[name].close});
        output.push({t:a.t,timestamp:a.timestamp,...side("bid"),bid:side("bid"),ask:side("ask"),volume:a.volume+b.volume});
    }
    return output;
}
const observations=[];
for(const symbol of symbols) {
    const frames=data[symbol];frames.m30=aggregate30(frames.m15);
    for(const tf of ["h1","m30","m15"]) enrich(frames[tf]);
    for(const [tf,minutes] of [["h1",60],["m30",30],["m15",15]]) {
        const rows=frames[tf];
        for(let i=60;i<rows.length;i++) {
            const row=rows[i],previous=rows[i-1],time=row.t+minutes*minute;
            if(time<partitions.full[0]||time>=end||!(row.atr>0)) continue;
            const day=new Date(time).getUTCDay(),hour=new Date(time).getUTCHours();
            if(day===0||day===6||hour>=20||(day===5&&hour>=18))continue;
            const context=engine.activeContext(time),rank=context.symbols.indexOf(symbol);
            if(rank<0)continue;
            const h=engine.atOrBefore(frames.h1,time-60*minute);
            const h1=frames.h1[h];if(!h1?.ema50)continue;
            const midnight=Math.floor(time/86_400_000)*86_400_000;
            const boundaries=[0,8,13,21];
            const previousEnd=boundaries.filter(value=>value<=hour).at(-1);
            const previousStart=boundaries[boundaries.indexOf(previousEnd)-1];
            const sessionFrom=previousStart===undefined?midnight-3*60*minute:midnight+previousStart*60*minute;
            const sessionTo=midnight+previousEnd*60*minute;
            const sessionRows=frames.h1.slice(Math.max(0,h-26),h+1).filter(candle=>candle.t>=sessionFrom&&candle.t+60*minute<=sessionTo);
            const sessionMid=sessionRows.length?(Math.max(...sessionRows.map(candle=>candle.high))+Math.min(...sessionRows.map(candle=>candle.low)))/2:null;
            const lower={};const indicator={};
            for(const [frame,period] of [["m5",5],["m15",15]]) {
                const last=engine.atOrBefore(frames[frame],time-period*minute);
                lower[frame]=frames[frame].slice(Math.max(0,last-63),last+1);
                indicator[frame]={atr:frames[frame][last]?.atr};
            }
            const strict=detectWave(symbol,indicator,lower,{mode:"requireBoth"}).waveDirection;
            const m15Wave=detectWave(symbol,indicator,lower,{mode:"m15"}).waveDirection;
            const m5Wave=detectWave(symbol,indicator,lower,{mode:"m5"}).waveDirection;
            const pattern=previous.close<previous.open&&row.close>row.open?"BUY":previous.close>previous.open&&row.close<row.open?"SELL":null;
            const last3=rows.slice(i-3,i),window=rows.slice(i-20,i);
            const trend=row.close>Math.max(...last3.map(r=>r.high))&&row.ema20>row.ema50?"BUY"
                :row.close<Math.min(...last3.map(r=>r.low))&&row.ema20<row.ema50?"SELL":null;
            const priorRsi=rows.slice(i-60,i).map(r=>r.rsi);
            const rangeSide=(low,high)=>previous.rsi<=low&&row.close>row.open?"BUY":previous.rsi>=high&&row.close<row.open?"SELL":null;
            const marketIndex=engine.atOrBefore(frames.m1,time-1);if(marketIndex<0)continue;
            const market=frames.m1[marketIndex];
            let path=0;for(let j=i-5;j<=i;j++)path+=Math.abs(rows[j].close-rows[j-1].close);
            const efficiency=path>0?Math.abs(row.close-rows[i-6].close)/path:0;
            const atrHistory=rows.slice(i-60,i).map(r=>r.atr).filter(a=>a>0);
            const spread=(market.ask.close-market.bid.close)/row.atr;
            observations.push({symbol,tf,time,row,previous,strict,m15Wave,m5Wave,pattern,trend,sessionMid,
                range:rangeSide(35,65),adaptiveRange:rangeSide(Math.max(20,Math.min(45,quantile(priorRsi,.2))),Math.min(80,Math.max(55,quantile(priorRsi,.8)))),
                h1Trend:(h1.ema20-h1.ema50)/h1.atr,efficiency,
                atrRegime:row.atr/mean(atrHistory),atrLow:quantile(atrHistory,.2),atrHigh:quantile(atrHistory,.9),
                volumeRatio:row.volume/Math.max(1,mean(window.map(r=>r.volume))),spreadAtr:spread,
                priority:rank,sessions:context.names,marketBid:market.bid.close,marketAsk:market.ask.close,
                strength:Math.abs(row.close-row.open)/row.atr,
                pairScore:efficiency+Math.min(2,row.atr/mean(atrHistory))*.2-8*spread});
        }
    }
    console.log(JSON.stringify({observations:symbol,total:observations.length}));
}
const groups=new Map();for(const row of observations){const key=`${row.tf}:${row.time}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
for(const group of groups.values())group.sort((a,b)=>b.pairScore-a.pairScore).forEach((row,i)=>row.pairRank=i+1);
const base={...engine.DEFAULT_EXPERIMENT,signalMode:"combined",detector:{mode:"requireBoth"},bufferPips:3,expiryMinutes:45,targetR:2.5,
    trailActivationR:null,ranking:"adaptive",continuousTrading:false};
const weights={strength:-.984903,riskAtr:-.199351,spreadAtr:-3.289938,entryGapAtr:-.74576,trendScore:.539907,priceEmaScore:-.432509,
    emaSlopeScore:.316831,efficiency6:.170911,rejectionWick:.273558,previousBodyAtr:.651536};
const core=symbols.flatMap(symbol=>engine.buildSignals(symbol,data[symbol],base)).filter(signal=>{
    const hour=new Date(signal.signalAt).getUTCHours();const score=Object.entries(weights).reduce((sum,[key,weight])=>sum+signal[key]*weight,0);
    signal.adaptiveRankScore=score;
    signal.execution={targetR:2.5,expiryMinutes:45,trailActivationR:null,management:{activationR:1,bufferAtr:.15,stepTimeframe:signal.trendScore>=1&&signal.efficiency6>=.2?"m15":"m5"}};
    return hour<=7&&signal.strength<=.75&&signal.trendScore>=0&&score>=-.833014;
});
function signalsFor(config) {
    const signals=[];
    for(const state of observations) {
        if(state.tf!==config.tf)continue;
        const hour=new Date(state.time).getUTCHours();
        if(config.addCore&&hour<8)continue;
        if(config.hours==="day"&&(hour<8||hour>17))continue;
        const wave=config.confirm==="strict"?state.strict:config.confirm==="m15"?state.m15Wave:state.m5Wave;
        const side=config.setup==="wavePattern"?(wave===state.pattern?wave:null):config.setup==="wave"?wave
            :config.setup==="trend"?state.trend:config.adaptive?state.adaptiveRange:state.range;
        if(!side)continue;
        const sign=side==="BUY"?1:-1;
        if(config.h1Align!==null&&config.h1Align!==undefined&&sign*state.h1Trend<config.h1Align)continue;
        if(config.rsiGate&&(side==="BUY"?state.row.rsi>70:state.row.rsi<30))continue;
        if(config.sessionAlign&&(state.sessionMid===null||sign*(state.row.close-state.sessionMid)<0))continue;
        if(state.spreadAtr>config.spread||state.strength>config.maxBody)continue;
        if(config.adaptive&&(state.row.atr<state.atrLow||state.row.atr>state.atrHigh||state.volumeRatio<config.volume||state.pairRank>config.topN))continue;
        if(config.setup==="trend"&&(sign*state.h1Trend<config.h1Trend||state.efficiency<config.efficiency))continue;
        if(config.setup==="range"&&Math.abs(state.h1Trend)>config.maxRangeTrend)continue;
        const pip=state.symbol.includes("JPY")?.01:.0001;
        const spread=state.marketAsk-state.marketBid;
        const buffer=config.adaptive?Math.max(pip,spread,config.buffer*state.row.atr):pip*2;
        const entry=side==="BUY"?state.row.high+buffer:state.row.low-buffer;
        const stopBuffer=state.row.atr*config.stopBuffer;
        let stop=side==="BUY"?Math.min(state.row.low,state.previous.low)-stopBuffer:Math.max(state.row.high,state.previous.high)+stopBuffer;
        const minDistance=state.row.atr*config.minStop;
        stop=side==="BUY"?Math.min(stop,entry-minDistance):Math.max(stop,entry+minDistance);
        const distance=Math.abs(entry-stop);if(distance/state.row.atr>3)continue;
        const targetR=config.adaptive?Math.max(1,Math.min(2,config.target+sign*state.h1Trend*.15+state.efficiency*.2)):config.target;
        const riskPct=config.riskAdapt?config.risk*(.5+.5*Math.min(1,state.efficiency/.4))*(state.spreadAtr>.12?.75:1)*(state.atrRegime>1.5?.75:1):config.risk;
        const execution={targetR,expiryMinutes:config.expiry,trailActivationR:null,riskPct,
            management:config.step?{activationR:1,bufferAtr:.15,stepTimeframe:sign*state.h1Trend>=1&&state.efficiency>=.2?"m15":"m5"}:null};
        signals.push({symbol:state.symbol,side,signalAt:state.time,entry,stop,distance,atr:state.row.atr,
            target:entry+sign*targetR*distance,activeRank:state.priority,sessions:state.sessions,marketBid:state.marketBid,marketAsk:state.marketAsk,
            adaptiveRankScore:state.efficiency+state.strength*.25+Math.min(2,sign*state.h1Trend)*.15-8*state.spreadAtr,
            source:config.setup,execution});
    }
    if(config.addCore)signals.push(...core);
    return signals.sort((a,b)=>a.signalAt-b.signalAt||b.adaptiveRankScore-a.adaptiveRankScore||a.activeRank-b.activeRank);
}
const daysFor=([from,to])=>new Set(data.EURUSD.m1.filter(row=>row.t>=from&&row.t<to).map(row=>row.timestamp.slice(0,10))).size;
function evaluate(signals,period,stress={},trades=false) {
    const result=engine.simulate({signals,data,rules,slots:1,from:period[0],to:period[1],experiment:{...base,...stress},includeTradeLog:trades});
    const days=daysFor(period);const monthKeys=[];
    for(let date=new Date(period[0]);date.getTime()<period[1];date.setUTCMonth(date.getUTCMonth()+1))monthKeys.push(date.toISOString().slice(0,7));
    const monthly=Object.fromEntries(monthKeys.map(month=>[month,result.monthly[month]??0]));
    return {returnPct:result.returnPct,trades:result.trades,tradesPerDay:result.trades/Math.max(1,days),profitFactor:result.profitFactor,
        maxDrawdownPct:result.maxDrawdownPct,winRate:result.winRate,coverage:100*result.activeDays/Math.max(1,days),
        losingMonths:Object.values(monthly).filter(pnl=>pnl<0).length,monthly,rejections:result.rejections,
        ...(trades?{tradeLog:result.tradeLog}: {})};
}
let seed=0x4112026;
const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const pick=values=>values[Math.floor(random()*values.length)];
const configs=[];
if(refinementSource) {
    const source=JSON.parse(fs.readFileSync(refinementSource,"utf8"));
    const seedConfig=source.developmentRanking.filter(row=>row.config.adaptive).sort((a,b)=>b.score-a.score)[0].config;
    for(const h1Align of [null,0,.5])for(const rsiGate of [false,true])for(const sessionAlign of [false,true])
        for(const volume of [.5,1])for(const riskAdapt of [false,true])
            configs.push({...seedConfig,h1Align,rsiGate,sessionAlign,volume,riskAdapt});
} else {
for(let i=0;i<144;i++) {
    const adaptive=i%2===1;
    const config={tf:pick(["h1","m30","m15"]),setup:pick(["wavePattern","wave","trend","range"]),confirm:pick(["strict","m15","m5"]),
        adaptive,addCore:pick([false,true]),hours:pick(["all","day"]),spread:pick([.08,.15,.25]),maxBody:pick([.75,1.5,3]),volume:pick([.5,1]),
        topN:pick([3,5,8]),h1Trend:pick([0,.25]),efficiency:pick([0,.2]),maxRangeTrend:pick([.5,1,2]),buffer:.04,
        stopBuffer:pick([.05,.15]),minStop:pick([.5,.8]),target:pick([1,1.25,1.5,2]),expiry:pick([15,30,45]),risk:pick([.0075,.015,.03]),step:pick([false,true])};
    configs.push(config);
}
}
const score=(train,validation)=> {
    const worst=Math.min(train.returnPct,validation.returnPct);
    const frequency=Math.min(train.tradesPerDay,validation.tradesPerDay);
    const pf=Math.min(train.profitFactor??0,validation.profitFactor??0);
    const acceptable=worst>0&&pf>=1.05&&train.trades>=60&&validation.trades>=30;
    return (acceptable?10000:0)+Math.min(3,frequency)*100+Math.min(100,worst)*2+Math.min(2,pf)*40
        -20*(train.losingMonths+validation.losingMonths)-Math.max(train.maxDrawdownPct,validation.maxDrawdownPct);
};
const search=[];
for(let i=0;i<configs.length;i++) {
    const signals=signalsFor(configs[i]);
    const train=evaluate(signals,partitions.train),validation=evaluate(signals,partitions.validation);
    search.push({id:i,config:configs[i],signalCount:signals.length,train,validation,score:score(train,validation)});
    if(i%12===11)console.log(JSON.stringify({tested:i+1,best:search.slice().sort((a,b)=>b.score-a.score)[0].id}));
}
search.sort((a,b)=>b.score-a.score);
const finalists=search.slice(0,3).map(row=>({...row}));
for(const row of finalists) {
    const signals=signalsFor(row.config);
    row.diagnostic=evaluate(signals,partitions.diagnostic);
    row.november=evaluate(signals,partitions.november);
    row.full=evaluate(signals,partitions.full,{},true);
    row.stress=evaluate(signals,partitions.full,{spreadMultiplier:1.25,slippagePips:.5});
    const staticConfig={...row.config,adaptive:false};
    const adaptiveConfig={...row.config,adaptive:true};
    row.ablation={static:Object.fromEntries(["train","validation","diagnostic"].map(p=>[p,evaluate(signalsFor(staticConfig),partitions[p])])),
        adaptive:Object.fromEntries(["train","validation","diagnostic"].map(p=>[p,evaluate(signalsFor(adaptiveConfig),partitions[p])]))};
}
const walkForward=[];
for(let month=3;month<=9;month++) {
    const history=[Date.UTC(2026,month-3,1),Date.UTC(2026,month,1)];
    const next=[Date.UTC(2026,month,1),Date.UTC(2026,month+1,1)];
    let chosen=null;
    for(const row of search.slice().sort((a,b)=>a.id-b.id)) {
        const result=evaluate(signalsFor(row.config),history);
        const value=score(result,result);
        if(!chosen||value>chosen.score)chosen={id:row.id,config:row.config,score:value,prior:result};
    }
    chosen.month=new Date(next[0]).toISOString().slice(0,7);
    chosen.result=evaluate(signalsFor(chosen.config),next);
    walkForward.push(chosen);
    console.log(JSON.stringify({walkForward:chosen.month,id:chosen.id,returnPct:chosen.result.returnPct,trades:chosen.result.trades}));
}
const baseline=Object.fromEntries(Object.entries(partitions).map(([name,period])=>[name,evaluate(core,period)]));
const qualified=search.filter(row=>row.train.returnPct>0&&row.validation.returnPct>0&&row.train.profitFactor>=1.05&&row.validation.profitFactor>=1.05
    &&row.train.tradesPerDay>=2&&row.validation.tradesPerDay>=2);
const output={protocol:refinementSource?"causal-dynamic-intraday-activity-refinement-v1":"causal-dynamic-intraday-activity-v1",refinementSource:refinementSource??null,generatedAt:new Date().toISOString(),dataEnd:new Date(end).toISOString(),
    dataset,audit,seed:"0x4112026",partitions,baseline,configsTested:search.length,qualifiedTwoTradesPerDay:qualified.length,
    finalists,walkForward,developmentRanking:search,
    limitations:["Previously inspected history; no fresh holdout", "Tick volume and spread are activity/cost proxies, not consolidated FX volume or order-book depth", "M1 stop-first simulation; pending fills omit gap slippage except explicit stress", "All boundaries use configured fixed UTC sessions", "Walk-forward candidate family is research-informed and not an untouched prospective experiment", "Explicit-null legacy trailing corrected; no live files changed"]};
fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify({reportFile,qualified:qualified.length,baseline:baseline.full,finalists:finalists.map(row=>({id:row.id,config:row.config,train:row.train,validation:row.validation,diagnostic:row.diagnostic,full:{...row.full,tradeLog:undefined},stress:row.stress})),walkForward},null,2));
