import fs from "fs";
import path from "path";
import { ACTIVE_INTRADAY_PROFILE } from "../config.js";
import { runIntradayExperiment } from "../research/intraday/runIntradayExperiment.js";

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, "logs");
const TRADE_LOG_DIR = path.join(ROOT, "backtest", "logs");
const PRICE_LOG_DIR = path.join(ROOT, "backtest", "prices");
const DATASET_DIR = path.join(ROOT, "backtest", "capital-dataset");
const ML_PROCESSED_DIR = path.join(ROOT, "ml", "datasets", "processed");
const ML_LLM_DIR = path.join(ROOT, "ml", "datasets", "llm");
const ML_REPORT_DIR = path.join(ROOT, "ml", "reports");
const RESEARCH_REPORT_DIR = path.join(ROOT, "research", "reports");

const SIGNAL_JSONL_PATH = path.join(ML_PROCESSED_DIR, "signal_quality_dataset.jsonl");
const SIGNAL_CSV_PATH = path.join(ML_PROCESSED_DIR, "signal_quality_dataset.csv");
const SIGNAL_SFT_PATH = path.join(ML_LLM_DIR, "trading_signal_quality_sft.jsonl");
const FORECAST_JSONL_PATH = path.join(ML_PROCESSED_DIR, "forecast30m_dataset.jsonl");
const FORECAST_CSV_PATH = path.join(ML_PROCESSED_DIR, "forecast30m_dataset.csv");
const MODEL_DECISION_OUTCOMES_PATH = path.join(ML_PROCESSED_DIR, "model_decision_outcomes.jsonl");
const DATASET_REPORT_PATH = path.join(ML_REPORT_DIR, "signal-quality-dataset-report.md");
const TODAY_REPORT_PATH = path.join(RESEARCH_REPORT_DIR, "live-vs-backtest-2026-05-07.md");

const PRICE_CACHE = new Map();
const MARKET_CACHE = new Map();

function ensureDirs() {
    for (const dir of [ML_PROCESSED_DIR, ML_LLM_DIR, ML_REPORT_DIR, RESEARCH_REPORT_DIR]) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readJsonl(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return fs
        .readFileSync(filePath, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

function writeJsonl(filePath, rows) {
    const body = rows.map((row) => JSON.stringify(row)).join("\n");
    fs.writeFileSync(filePath, `${body}${body ? "\n" : ""}`);
}

function csvEscape(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, rows, columns) {
    const lines = [columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))];
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function toNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

function round(value, digits = 4) {
    const num = toNumber(value);
    if (num === null) return null;
    const factor = 10 ** digits;
    return Math.round(num * factor) / factor;
}

function iso(value) {
    if (!value) return null;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function tsMs(value) {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : null;
}

function pipSize(symbol) {
    return String(symbol || "").toUpperCase().includes("JPY") ? 0.01 : 0.0001;
}

function sessionName(timestamp) {
    const date = new Date(timestamp);
    const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
    if (minute >= 0 && minute < 7 * 60) return "asian";
    if (minute >= 7 * 60 && minute < 12 * 60) return "london";
    if (minute >= 13 * 60 && minute < 20 * 60) return "ny";
    return "off_session";
}

function normalizeDirection(side) {
    const value = String(side || "").toUpperCase();
    if (value === "LONG") return "BUY";
    if (value === "SHORT") return "SELL";
    return value;
}

function riskDistanceFromTrade(entryPrice, stopPrice) {
    const entry = toNumber(entryPrice);
    const stop = toNumber(stopPrice);
    if (entry === null || stop === null) return null;
    const distance = Math.abs(entry - stop);
    return distance > 0 ? distance : null;
}

function loadPriceRows(symbol) {
    const key = String(symbol || "").toUpperCase();
    if (PRICE_CACHE.has(key)) return PRICE_CACHE.get(key);
    const rows = readJsonl(path.join(PRICE_LOG_DIR, `${key}.jsonl`))
        .map((row) => ({
            timestamp: iso(row.timestamp),
            tsMs: tsMs(row.timestamp),
            bid: toNumber(row.bid),
            ask: toNumber(row.ask),
            mid: toNumber(row.mid ?? row.price),
            spread: toNumber(row.spread),
        }))
        .filter((row) => row.tsMs !== null)
        .sort((a, b) => a.tsMs - b.tsMs);
    PRICE_CACHE.set(key, rows);
    return rows;
}

function loadMarketRows(symbol, preferredTimeframe = "M5") {
    const key = `${String(symbol || "").toUpperCase()}|${preferredTimeframe}`;
    if (MARKET_CACHE.has(key)) return MARKET_CACHE.get(key);
    const candidates = [preferredTimeframe, "M5", "M15", "M1"];
    for (const timeframe of candidates) {
        const filePath = path.join(DATASET_DIR, `${String(symbol || "").toUpperCase()}_${timeframe}.jsonl`);
        if (!fs.existsSync(filePath)) continue;
        const rows = readJsonl(filePath)
            .map((row) => ({
                timestamp: iso(row.timestamp),
                tsMs: tsMs(row.timestamp),
                open: toNumber(row.open),
                high: toNumber(row.high),
                low: toNumber(row.low),
                close: toNumber(row.close),
                timeframe,
            }))
            .filter((row) => row.tsMs !== null)
            .sort((a, b) => a.tsMs - b.tsMs);
        if (rows.length) {
            MARKET_CACHE.set(key, rows);
            return rows;
        }
    }
    MARKET_CACHE.set(key, []);
    return [];
}

function lowerBound(rows, targetMs) {
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (rows[mid].tsMs < targetMs) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function selectWindowRows(rows, startMs, horizonMinutes) {
    const endMs = startMs + horizonMinutes * 60_000;
    const startIndex = lowerBound(rows, startMs);
    const out = [];
    for (let index = startIndex; index < rows.length; index += 1) {
        const row = rows[index];
        if (row.tsMs > endMs) break;
        out.push(row);
    }
    return out;
}

function classifyDirectionByMove(movePips, pip) {
    const threshold = pip * 2;
    if (movePips > threshold) return "BUY";
    if (movePips < -threshold) return "SELL";
    return "NEUTRAL";
}

function computeLiveWindowMetrics({ symbol, direction, entryTimestamp, entryPrice, stopPrice, horizonMinutes }) {
    const rows = loadPriceRows(symbol);
    const startMs = tsMs(entryTimestamp);
    const riskDistance = riskDistanceFromTrade(entryPrice, stopPrice);
    if (!rows.length || startMs === null) return null;
    const window = selectWindowRows(rows, startMs, horizonMinutes);
    if (!window.length) return null;

    const dir = normalizeDirection(direction);
    const entry = Number(entryPrice);
    const pip = pipSize(symbol);
    let maxFavorable = Number.NEGATIVE_INFINITY;
    let maxAdverse = Number.POSITIVE_INFINITY;
    let hitProfitBeforeStop = null;

    for (const row of window) {
        const mark = dir === "BUY" ? row.bid ?? row.mid ?? row.ask : row.ask ?? row.mid ?? row.bid;
        if (!Number.isFinite(mark)) continue;
        const move = dir === "BUY" ? mark - entry : entry - mark;
        maxFavorable = Math.max(maxFavorable, move);
        maxAdverse = Math.min(maxAdverse, move);
        if (riskDistance) {
            const r = move / riskDistance;
            if (hitProfitBeforeStop === null) {
                if (r >= 1) hitProfitBeforeStop = true;
                else if (r <= -1) hitProfitBeforeStop = false;
            }
        }
    }

    const last = window.at(-1);
    const finalMark = dir === "BUY" ? last.bid ?? last.mid ?? last.ask : last.ask ?? last.mid ?? last.bid;
    const finalMove = Number.isFinite(finalMark) ? (dir === "BUY" ? finalMark - entry : entry - finalMark) : null;
    const finalMoveMid = Number.isFinite(last.mid) ? last.mid - entry : finalMove;
    return {
        horizonMinutes,
        rowCount: window.length,
        lastTimestamp: last.timestamp,
        finalR: riskDistance && finalMove !== null ? finalMove / riskDistance : null,
        maxFavorableR: riskDistance && Number.isFinite(maxFavorable) ? maxFavorable / riskDistance : null,
        maxAdverseR: riskDistance && Number.isFinite(maxAdverse) ? maxAdverse / riskDistance : null,
        finalMovePipsSigned: finalMoveMid !== null ? finalMoveMid / pip : null,
        hitProfitBeforeStop,
    };
}

function computeCandleWindowMetrics({ symbol, side, entryTimestamp, entryPrice, stopPrice, horizonMinutes, timeframe = "M5" }) {
    const rows = loadMarketRows(symbol, timeframe);
    const startMs = tsMs(entryTimestamp);
    const riskDistance = riskDistanceFromTrade(entryPrice, stopPrice);
    if (!rows.length || startMs === null) return null;
    const window = selectWindowRows(rows, startMs, horizonMinutes);
    if (!window.length) return null;

    const direction = normalizeDirection(side);
    const entry = Number(entryPrice);
    const pip = pipSize(symbol);
    let maxFavorableR = Number.NEGATIVE_INFINITY;
    let maxAdverseR = Number.POSITIVE_INFINITY;
    let hitProfitBeforeStop = null;

    for (const row of window) {
        const favorableMove = direction === "BUY" ? row.high - entry : entry - row.low;
        const adverseMove = direction === "BUY" ? row.low - entry : entry - row.high;
        const favorableR = riskDistance ? favorableMove / riskDistance : null;
        const adverseR = riskDistance ? adverseMove / riskDistance : null;
        if (favorableR !== null) maxFavorableR = Math.max(maxFavorableR, favorableR);
        if (adverseR !== null) maxAdverseR = Math.min(maxAdverseR, adverseR);
        if (riskDistance && hitProfitBeforeStop === null) {
            const tpHit = favorableR >= 1;
            const slHit = adverseR <= -1;
            if (tpHit && slHit) hitProfitBeforeStop = false;
            else if (tpHit) hitProfitBeforeStop = true;
            else if (slHit) hitProfitBeforeStop = false;
        }
    }

    const last = window.at(-1);
    const finalMove = direction === "BUY" ? last.close - entry : entry - last.close;
    return {
        horizonMinutes,
        rowCount: window.length,
        timeframe: last.timeframe,
        lastTimestamp: last.timestamp,
        finalR: riskDistance ? finalMove / riskDistance : null,
        maxFavorableR: Number.isFinite(maxFavorableR) ? maxFavorableR : null,
        maxAdverseR: Number.isFinite(maxAdverseR) ? maxAdverseR : null,
        finalMovePipsSigned: finalMove / pip,
        hitProfitBeforeStop,
    };
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function decisionLabelFor(row) {
    const spreadPips = toNumber(row.spreadPips);
    const realizedR = toNumber(row.realizedR);
    const maxFavorableR30m = toNumber(row.maxFavorableR30m);
    const maxAdverseR30m = toNumber(row.maxAdverseR30m);
    const maxFavorableR60m = toNumber(row.maxFavorableR60m);
    const maxAdverseR60m = toNumber(row.maxAdverseR60m);
    const hitProfitBeforeStop60m = row.hitProfitBeforeStop60m === true;
    const warnings = [];

    if (spreadPips !== null && spreadPips >= 8) {
        warnings.push("wide_spread");
        return {
            decision: "BLOCK_TRADE",
            signalQuality: "BAD",
            confidence: 0.86,
            expectedR: round(Math.max(maxFavorableR30m || 0, maxFavorableR60m || 0), 3),
            reason: "spread_too_wide_for_reliable_entry",
            warnings,
        };
    }
    if (realizedR !== null && realizedR <= -0.75 && (maxFavorableR30m ?? 0) < 0.5) {
        return {
            decision: "BLOCK_TRADE",
            signalQuality: "BAD",
            confidence: 0.82,
            expectedR: round(maxFavorableR60m || 0, 3),
            reason: "trade_never_proved_itself_and_lost_heavily",
            warnings,
        };
    }
    if ((maxAdverseR30m ?? 0) <= -1 && (maxFavorableR60m ?? 0) < 0.75) {
        return {
            decision: "BLOCK_TRADE",
            signalQuality: "BAD",
            confidence: 0.78,
            expectedR: round(maxFavorableR60m || 0, 3),
            reason: "stop_like_adverse_move_happened_before_any_meaningful_follow_through",
            warnings,
        };
    }
    if (hitProfitBeforeStop60m || (realizedR !== null && realizedR >= 1.25) || (maxFavorableR60m ?? 0) >= 1.5) {
        return {
            decision: "ALLOW_TRADE",
            signalQuality: "EXCELLENT",
            confidence: 0.84,
            expectedR: round(Math.max(realizedR || 0, maxFavorableR60m || 0), 3),
            reason: "signal_delivered_strong_follow_through",
            warnings,
        };
    }
    if ((realizedR !== null && realizedR >= 0.25) || (maxFavorableR30m ?? 0) >= 0.75) {
        return {
            decision: "ALLOW_TRADE",
            signalQuality: "GOOD",
            confidence: 0.72,
            expectedR: round(Math.max(realizedR || 0, maxFavorableR60m || 0), 3),
            reason: "signal_showed_positive_follow_through",
            warnings,
        };
    }
    if ((maxFavorableR60m ?? 0) >= 0.75 && ((maxAdverseR30m ?? 0) <= -0.75 || (maxAdverseR60m ?? 0) <= -1)) {
        return {
            decision: "REDUCE_RISK",
            signalQuality: "NEUTRAL",
            confidence: 0.64,
            expectedR: round(maxFavorableR60m || 0, 3),
            reason: "opportunity_existed_but_adverse_excursion_was_too_large_for_full_risk",
            warnings,
        };
    }
    return {
        decision: "NO_OPINION",
        signalQuality: "NEUTRAL",
        confidence: 0.55,
        expectedR: round(maxFavorableR60m || realizedR || 0, 3),
        reason: "outcome_was_mixed_or_too_small_for_confident_filtering",
        warnings,
    };
}

function tradeRootCause(row) {
    const realizedR = toNumber(row.realizedR);
    const maxFavorableR60m = toNumber(row.maxFavorableR60m);
    const maxAdverseR30m = toNumber(row.maxAdverseR30m);
    if (realizedR === null) return "open_trade";
    if (realizedR < 0 && (maxFavorableR60m ?? 0) < 0.4) return "entry_failure";
    if (realizedR < 0 && (maxFavorableR60m ?? 0) >= 1) return "exit_or_management_failure";
    if (realizedR < 0 && (maxFavorableR60m ?? 0) >= 0.4) return "timing_or_protection_failure";
    if ((maxAdverseR30m ?? 0) <= -1 && realizedR > 0) return "high_volatility_but_recovered";
    return "worked_or_neutral";
}

function firstNonNull(...values) {
    for (const value of values) {
        if (value !== null && value !== undefined && value !== "") return value;
    }
    return null;
}

function buildLiveRows() {
    const rows = [];
    for (const fileName of fs.readdirSync(TRADE_LOG_DIR).filter((name) => name.endsWith(".jsonl") && name !== "strategy-decisions.jsonl")) {
        for (const trade of readJsonl(path.join(TRADE_LOG_DIR, fileName))) {
            const direction = normalizeDirection(trade.signal ?? trade.side ?? trade.direction);
            if (!["BUY", "SELL"].includes(direction)) continue;
            const entryPrice = toNumber(trade.entryPrice);
            const stopPrice = firstNonNull(toNumber(trade.stopLoss), toNumber(trade.strategyContext?.expectedStopPrice));
            const riskDistance = riskDistanceFromTrade(entryPrice, stopPrice);
            const finalPoints = toNumber(trade.tradeStats?.pnlPoints);
            const realizedR = riskDistance && finalPoints !== null ? finalPoints / riskDistance : null;
            const signalTimestamp = firstNonNull(iso(trade.strategyContext?.signalTimestamp), iso(trade.openedAt));
            const entryTimestamp = iso(trade.openedAt);
            const context = trade.strategyContext || {};
            const signalFeatures = {
                signalOpen: toNumber(context.signalCandle?.open),
                signalHigh: toNumber(context.signalCandle?.high),
                signalLow: toNumber(context.signalCandle?.low),
                signalClose: toNumber(context.signalCandle?.close),
                ema8: toNumber(context.candidateContext?.ema8),
                ema20: toNumber(context.candidateContext?.ema20),
                atr: toNumber(context.candidateContext?.atr),
                atrPct: toNumber(context.candidateContext?.atrPct),
                body: toNumber(context.candidateContext?.body),
            };
            const metrics30 = computeLiveWindowMetrics({ symbol: trade.symbol, direction, entryTimestamp, entryPrice, stopPrice, horizonMinutes: 30 }) || {};
            const metrics60 = computeLiveWindowMetrics({ symbol: trade.symbol, direction, entryTimestamp, entryPrice, stopPrice, horizonMinutes: 60 }) || {};
            const label = decisionLabelFor({
                realizedR,
                spreadPips: context.currentSpreadPips,
                maxFavorableR30m: metrics30.maxFavorableR,
                maxAdverseR30m: metrics30.maxAdverseR,
                maxFavorableR60m: metrics60.maxFavorableR,
                maxAdverseR60m: metrics60.maxAdverseR,
                hitProfitBeforeStop60m: metrics60.hitProfitBeforeStop,
            });
            rows.push({
                datasetSource: "live_trade_log",
                strategyMode: context.strategyMode || context.strategyName || "unknown",
                profileId: context.profileId || null,
                strategyFamily: context.strategyFamily || context.strategyType || context.strategyName || "unknown",
                symbol: trade.symbol,
                session: context.session || sessionName(signalTimestamp || entryTimestamp),
                direction,
                signalTimestamp,
                entryTimestamp,
                exitTimestamp: iso(trade.closedAt),
                signalTimeframe: context.timeframe || null,
                executionTimeframe: context.executionTimeframe || null,
                entryMode: context.entryMode || null,
                entryReason: trade.openReason || context.reason || null,
                exitReason: trade.closeReason || null,
                entryPrice: round(entryPrice, 5),
                stopPrice: round(stopPrice, 5),
                takeProfitPrice: round(toNumber(trade.takeProfit), 5),
                spreadPips: round(context.currentSpreadPips, 3),
                riskPct: round(firstNonNull(toNumber(trade.positionSizing?.actual?.effectiveRiskPct), toNumber(trade.positionSizing?.planned?.effectiveRiskPct), toNumber(context.riskProfile?.riskPerTrade)), 4),
                realizedR: round(realizedR, 4),
                finalR30m: round(metrics30.finalR, 4),
                maxAdverseR30m: round(metrics30.maxAdverseR, 4),
                maxFavorableR30m: round(metrics30.maxFavorableR, 4),
                finalR60m: round(metrics60.finalR, 4),
                maxAdverseR60m: round(metrics60.maxAdverseR, 4),
                maxFavorableR60m: round(metrics60.maxFavorableR, 4),
                hitProfitBeforeStop30m: metrics30.hitProfitBeforeStop ?? null,
                hitProfitBeforeStop60m: metrics60.hitProfitBeforeStop ?? null,
                actualDirection30m: classifyDirectionByMove((metrics30.finalMovePipsSigned || 0) * pipSize(trade.symbol), pipSize(trade.symbol)),
                actualMovePips30m: round(metrics30.finalMovePipsSigned, 2),
                actualMovePips60m: round(metrics60.finalMovePipsSigned, 2),
                executed: true,
                sourceQuality: "real_live",
                signalFeatures,
                labelDecision: label.decision,
                labelSignalQuality: label.signalQuality,
                labelConfidence: label.confidence,
                labelExpectedR: label.expectedR,
                labelReason: label.reason,
                labelWarnings: label.warnings.join(","),
                rootCause: tradeRootCause({
                    realizedR,
                    maxFavorableR60m: metrics60.maxFavorableR,
                    maxAdverseR30m: metrics30.maxAdverseR,
                }),
            });
        }
    }
    return rows;
}

function buildResearchRows() {
    const result = runIntradayExperiment({
        candidate: ACTIVE_INTRADAY_PROFILE,
        symbols: ACTIVE_INTRADAY_PROFILE.symbols,
        days: 90,
        mode: "aggressiveIntraday",
        includeTrades: true,
    });

    return result.trades.map((trade) => {
        const direction = normalizeDirection(trade.side);
        const metrics30 = computeCandleWindowMetrics({
            symbol: trade.symbol,
            side: trade.side,
            entryTimestamp: trade.entryTimestamp,
            entryPrice: trade.entryPrice,
            stopPrice: trade.stopPrice,
            horizonMinutes: 30,
            timeframe: trade.executionTimeframe || "M5",
        }) || {};
        const metrics60 = computeCandleWindowMetrics({
            symbol: trade.symbol,
            side: trade.side,
            entryTimestamp: trade.entryTimestamp,
            entryPrice: trade.entryPrice,
            stopPrice: trade.stopPrice,
            horizonMinutes: 60,
            timeframe: trade.executionTimeframe || "M5",
        }) || {};
        const label = decisionLabelFor({
            realizedR: trade.pnlR,
            spreadPips: trade.spreadPips,
            maxFavorableR30m: metrics30.maxFavorableR,
            maxAdverseR30m: metrics30.maxAdverseR,
            maxFavorableR60m: metrics60.maxFavorableR,
            maxAdverseR60m: metrics60.maxAdverseR,
            hitProfitBeforeStop60m: metrics60.hitProfitBeforeStop,
        });
        return {
            datasetSource: "research_backtest",
            strategyMode: "intraday_lab",
            profileId: ACTIVE_INTRADAY_PROFILE.id,
            strategyFamily: trade.family,
            symbol: trade.symbol,
            session: trade.session || sessionName(trade.signalTimestamp),
            direction,
            signalTimestamp: iso(trade.signalTimestamp),
            entryTimestamp: iso(trade.entryTimestamp),
            exitTimestamp: iso(trade.exitTimestamp),
            signalTimeframe: trade.signalTimeframe,
            executionTimeframe: trade.executionTimeframe,
            entryMode: trade.entryMode,
            entryReason: trade.entryReason,
            exitReason: trade.exitReason,
            entryPrice: round(trade.entryPrice, 5),
            stopPrice: round(trade.stopPrice, 5),
            takeProfitPrice: round(trade.takeProfit, 5),
            spreadPips: round(trade.spreadPips, 3),
            riskPct: round(ACTIVE_INTRADAY_PROFILE.riskProfile?.riskPerTrade, 4),
            realizedR: round(trade.pnlR, 4),
            finalR30m: round(metrics30.finalR, 4),
            maxAdverseR30m: round(metrics30.maxAdverseR, 4),
            maxFavorableR30m: round(metrics30.maxFavorableR, 4),
            finalR60m: round(metrics60.finalR, 4),
            maxAdverseR60m: round(metrics60.maxAdverseR, 4),
            maxFavorableR60m: round(metrics60.maxFavorableR, 4),
            hitProfitBeforeStop30m: metrics30.hitProfitBeforeStop ?? null,
            hitProfitBeforeStop60m: metrics60.hitProfitBeforeStop ?? null,
            actualDirection30m: classifyDirectionByMove((metrics30.finalMovePipsSigned || 0) * pipSize(trade.symbol), pipSize(trade.symbol)),
            actualMovePips30m: round(metrics30.finalMovePipsSigned, 2),
            actualMovePips60m: round(metrics60.finalMovePipsSigned, 2),
            executed: true,
            sourceQuality: "research_simulated",
            signalFeatures: {
                signalOpen: round(trade.signalContext?.row?.open, 5),
                signalHigh: round(trade.signalContext?.row?.high, 5),
                signalLow: round(trade.signalContext?.row?.low, 5),
                signalClose: round(trade.signalContext?.row?.close, 5),
                ema8: round(trade.signalContext?.row?.ema8, 5),
                ema20: round(trade.signalContext?.row?.ema20, 5),
                ema50: round(trade.signalContext?.row?.ema50, 5),
                atr: round(trade.signalContext?.row?.atr, 5),
                atrPct: round(trade.signalContext?.row?.atrPct, 6),
                rsi14: round(trade.signalContext?.row?.rsi14, 2),
                body: round(trade.signalContext?.row?.body, 5),
                range: round(trade.signalContext?.row?.range, 5),
            },
            labelDecision: label.decision,
            labelSignalQuality: label.signalQuality,
            labelConfidence: label.confidence,
            labelExpectedR: label.expectedR,
            labelReason: label.reason,
            labelWarnings: [...safeArray(trade.warnings), ...label.warnings].join(","),
            rootCause: tradeRootCause({
                realizedR: trade.pnlR,
                maxFavorableR60m: metrics60.maxFavorableR,
                maxAdverseR30m: metrics30.maxAdverseR,
            }),
        };
    });
}

function buildForecastRows() {
    return readJsonl(path.join(LOG_DIR, "model_forecasts.jsonl")).map((row) => {
        const symbol = row.symbol || row.forecast?.symbol;
        const timestamp = iso(row.forecast?.createdAt || row.timestamp);
        const startMs = tsMs(timestamp);
        const priceRows = loadPriceRows(symbol);
        const window = startMs !== null ? selectWindowRows(priceRows, startMs, 30) : [];
        const first = priceRows[lowerBound(priceRows, startMs ?? 0)];
        const base = toNumber(first?.mid ?? first?.bid ?? first?.ask);
        const last = window.at(-1);
        const finalMid = toNumber(last?.mid ?? last?.bid ?? last?.ask);
        let maxUpPips = null;
        let maxDownPips = null;
        if (base !== null && window.length) {
            const pip = pipSize(symbol);
            maxUpPips = Math.max(...window.map((item) => ((item.mid ?? item.bid ?? item.ask) - base) / pip));
            maxDownPips = Math.min(...window.map((item) => ((item.mid ?? item.bid ?? item.ask) - base) / pip));
        }
        return {
            datasetSource: "model_forecast_log",
            symbol,
            mode: row.mode || null,
            forecastTimestamp: timestamp,
            forecastId: row.forecastId || null,
            preferredDirection: row.forecast?.preferredDirection || null,
            confidence: round(row.forecast?.confidence, 4),
            probabilityProfitBuy: round(row.forecast?.probabilityProfitBuy, 4),
            probabilityProfitSell: round(row.forecast?.probabilityProfitSell, 4),
            expectedMovePips: round(row.forecast?.expectedMovePips, 2),
            expectedR: round(row.forecast?.expectedR, 4),
            marketBias: row.forecast?.marketBias || null,
            noTradeZone: row.forecast?.noTradeZone ?? null,
            modelVersion: row.forecast?.modelVersion || row.modelVersion || null,
            actualDirection30m: base !== null && finalMid !== null ? classifyDirectionByMove(finalMid - base, pipSize(symbol)) : null,
            actualMovePips30m: base !== null && finalMid !== null ? round((finalMid - base) / pipSize(symbol), 2) : null,
            maxFavorablePipsBuy30m: round(maxUpPips, 2),
            maxAdversePipsBuy30m: round(maxDownPips, 2),
            maxFavorablePipsSell30m: round(maxDownPips !== null ? -maxDownPips : null, 2),
            maxAdversePipsSell30m: round(maxUpPips !== null ? -maxUpPips : null, 2),
            rowCount30m: window.length,
        };
    });
}

function buildModelDecisionOutcomeRows() {
    return readJsonl(path.join(LOG_DIR, "model_decisions.jsonl")).map((row) => {
        const symbol = row.symbol;
        const timestamp = iso(row.timestamp);
        const startMs = tsMs(timestamp);
        const priceRows = loadPriceRows(symbol);
        const window = startMs !== null ? selectWindowRows(priceRows, startMs, 30) : [];
        const first = priceRows[lowerBound(priceRows, startMs ?? 0)];
        const direction = normalizeDirection(row.strategySignal?.signal);
        const base = toNumber(first?.mid ?? first?.bid ?? first?.ask);
        const last = window.at(-1);
        const finalMid = toNumber(last?.mid ?? last?.bid ?? last?.ask);
        return {
            timestamp,
            symbol,
            mode: row.mode || null,
            forecastId: row.forecastId || null,
            candidateId: row.candidateId || null,
            signal: direction,
            forecastDirection: row.forecast?.preferredDirection || null,
            qualityDecision: row.qualityDecision?.decision || null,
            finalBotDecision: row.finalBotDecision || null,
            blockedReason: row.blockedReason || null,
            actualDirection30m: base !== null && finalMid !== null ? classifyDirectionByMove(finalMid - base, pipSize(symbol)) : null,
            actualMovePips30m: base !== null && finalMid !== null ? round((finalMid - base) / pipSize(symbol), 2) : null,
            rowCount30m: window.length,
            modelVersion: row.modelVersion || row.forecast?.modelVersion || null,
        };
    });
}

function flattenSignalRow(row) {
    return {
        datasetSource: row.datasetSource,
        strategyMode: row.strategyMode,
        profileId: row.profileId,
        strategyFamily: row.strategyFamily,
        symbol: row.symbol,
        session: row.session,
        direction: row.direction,
        signalTimestamp: row.signalTimestamp,
        entryTimestamp: row.entryTimestamp,
        exitTimestamp: row.exitTimestamp,
        signalTimeframe: row.signalTimeframe,
        executionTimeframe: row.executionTimeframe,
        entryMode: row.entryMode,
        entryReason: row.entryReason,
        exitReason: row.exitReason,
        entryPrice: row.entryPrice,
        stopPrice: row.stopPrice,
        takeProfitPrice: row.takeProfitPrice,
        spreadPips: row.spreadPips,
        riskPct: row.riskPct,
        realizedR: row.realizedR,
        finalR30m: row.finalR30m,
        maxAdverseR30m: row.maxAdverseR30m,
        maxFavorableR30m: row.maxFavorableR30m,
        finalR60m: row.finalR60m,
        maxAdverseR60m: row.maxAdverseR60m,
        maxFavorableR60m: row.maxFavorableR60m,
        hitProfitBeforeStop30m: row.hitProfitBeforeStop30m,
        hitProfitBeforeStop60m: row.hitProfitBeforeStop60m,
        actualDirection30m: row.actualDirection30m,
        actualMovePips30m: row.actualMovePips30m,
        actualMovePips60m: row.actualMovePips60m,
        executed: row.executed,
        sourceQuality: row.sourceQuality,
        signalOpen: row.signalFeatures?.signalOpen ?? null,
        signalHigh: row.signalFeatures?.signalHigh ?? null,
        signalLow: row.signalFeatures?.signalLow ?? null,
        signalClose: row.signalFeatures?.signalClose ?? null,
        ema8: row.signalFeatures?.ema8 ?? null,
        ema20: row.signalFeatures?.ema20 ?? null,
        ema50: row.signalFeatures?.ema50 ?? null,
        atr: row.signalFeatures?.atr ?? null,
        atrPct: row.signalFeatures?.atrPct ?? null,
        rsi14: row.signalFeatures?.rsi14 ?? null,
        body: row.signalFeatures?.body ?? null,
        range: row.signalFeatures?.range ?? null,
        labelDecision: row.labelDecision,
        labelSignalQuality: row.labelSignalQuality,
        labelConfidence: row.labelConfidence,
        labelExpectedR: row.labelExpectedR,
        labelReason: row.labelReason,
        labelWarnings: row.labelWarnings,
        rootCause: row.rootCause,
    };
}

function buildSftRows(signalRows) {
    return signalRows.map((row) => {
        const input = {
            symbol: row.symbol,
            strategyFamily: row.strategyFamily,
            session: row.session,
            direction: row.direction,
            signalTimestamp: row.signalTimestamp,
            signalTimeframe: row.signalTimeframe,
            executionTimeframe: row.executionTimeframe,
            entryMode: row.entryMode,
            entryReason: row.entryReason,
            entryPrice: row.entryPrice,
            stopPrice: row.stopPrice,
            takeProfitPrice: row.takeProfitPrice,
            spreadPips: row.spreadPips,
            riskPct: row.riskPct,
            signalFeatures: row.signalFeatures,
        };
        const output = {
            type: "SIGNAL_QUALITY",
            symbol: row.symbol,
            strategyFamily: row.strategyFamily,
            direction: row.direction,
            decision: row.labelDecision,
            signalQuality: row.labelSignalQuality,
            confidence: row.labelConfidence,
            expectedR: row.labelExpectedR,
            riskPct: row.riskPct,
            reason: row.labelReason,
            warnings: row.labelWarnings ? row.labelWarnings.split(",").filter(Boolean) : [],
        };
        return {
            messages: [
                {
                    role: "system",
                    content:
                        "You are a trading signal quality model. Return only strict JSON following the SIGNAL_QUALITY schema. Never place orders. Never mention future outcomes.",
                },
                {
                    role: "user",
                    content: JSON.stringify(input),
                },
                {
                    role: "assistant",
                    content: JSON.stringify(output),
                },
            ],
            metadata: {
                datasetSource: row.datasetSource,
                symbol: row.symbol,
                strategyFamily: row.strategyFamily,
                session: row.session,
                signalTimestamp: row.signalTimestamp,
            },
        };
    });
}

function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort();
}

function summaryStats(signalRows, forecastRows) {
    const timestamps = signalRows.map((row) => row.signalTimestamp).filter(Boolean).sort();
    const classes = {};
    const sessions = {};
    const families = {};
    let executedLive = 0;
    let researchRows = 0;
    let liveRows = 0;
    let missingSpread = 0;
    let missingRealizedR = 0;
    let realizedSum = 0;
    let realizedCount = 0;

    for (const row of signalRows) {
        classes[row.labelDecision] = (classes[row.labelDecision] || 0) + 1;
        sessions[row.session] = (sessions[row.session] || 0) + 1;
        families[row.strategyFamily] = (families[row.strategyFamily] || 0) + 1;
        if (row.datasetSource === "live_trade_log") {
            liveRows += 1;
            if (row.executed) executedLive += 1;
        }
        if (row.datasetSource === "research_backtest") researchRows += 1;
        if (row.spreadPips === null) missingSpread += 1;
        if (row.realizedR === null) missingRealizedR += 1;
        if (row.realizedR !== null) {
            realizedSum += row.realizedR;
            realizedCount += 1;
        }
    }

    return {
        rowCount: signalRows.length,
        forecastRowCount: forecastRows.length,
        dateRange: {
            from: timestamps[0] || null,
            to: timestamps.at(-1) || null,
        },
        symbols: uniqueSorted(signalRows.map((row) => row.symbol)),
        sessions,
        families,
        classes,
        executedLive,
        liveRows,
        researchRows,
        averageRealizedR: realizedCount ? round(realizedSum / realizedCount, 4) : null,
        missingSpread,
        missingRealizedR,
    };
}

function todayDiagnosticRows(signalRows) {
    return signalRows
        .filter((row) => row.datasetSource === "live_trade_log" && String(row.entryTimestamp || "").startsWith("2026-05-07"))
        .sort((a, b) => String(a.entryTimestamp).localeCompare(String(b.entryTimestamp)));
}

function buildDatasetReport(signalRows, forecastRows, modelDecisionRows, todayRows, decisionStats) {
    const stats = summaryStats(signalRows, forecastRows);
    const classLines = Object.entries(stats.classes)
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");
    const sessionLines = Object.entries(stats.sessions)
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");
    const familyLines = Object.entries(stats.families)
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");

    const missing = [
        stats.missingSpread ? `spreadPips missing in ${stats.missingSpread} rows` : null,
        stats.missingRealizedR ? `realizedR missing in ${stats.missingRealizedR} rows` : null,
        forecastRows.length < 50 ? `forecast log sample is too small (${forecastRows.length} rows)` : null,
        modelDecisionRows.length < 50 ? `model decision sample is too small (${modelDecisionRows.length} rows)` : null,
        "capital-dataset M15 rows stop at 2026-05-04 while live price logs continue into 2026-05-07",
        "M1 archive is only partial for 4 symbols",
    ]
        .filter(Boolean)
        .map((line) => `- ${line}`)
        .join("\n");

    const trainingReady = signalRows.length >= 500 && forecastRows.length >= 100 ? "partially" : "no";
    const leakageRisks = [
        "- trading_signal_quality_sft.jsonl uses only pre-trade fields in the prompt, but labels are still heuristic and derived from realized future outcomes.",
        "- Research rows come from backtest simulation, not broker fills; they are useful for pretraining but not sufficient for live deployment validation.",
        "- Live logging historically skipped strategy evaluation when MAX_POSITIONS was already filled; this was fixed forward in services/trading.js, but past missed-opportunity labels remain unavailable.",
        "- Wide-spread live signals are present and were not filtered out by strategy runtime, which can poison labels if not modelled explicitly.",
    ].join("\n");

    const todaySummary = todayRows
        .map(
            (row) =>
                `- ${row.entryTimestamp} ${row.symbol} ${row.direction}: realizedR=${row.realizedR}, maxFav60=${row.maxFavorableR60m}, maxAdv30=${row.maxAdverseR30m}, rootCause=${row.rootCause}`,
        )
        .join("\n");

    const report = `# Signal Quality Dataset Report

- generatedAt: ${new Date().toISOString()}
- signalDataset: ${SIGNAL_JSONL_PATH}
- signalCsv: ${SIGNAL_CSV_PATH}
- signalSft: ${SIGNAL_SFT_PATH}
- forecastDataset: ${FORECAST_JSONL_PATH}
- modelDecisionOutcomes: ${MODEL_DECISION_OUTCOMES_PATH}
- rowCount: ${stats.rowCount}
- forecastRowCount: ${stats.forecastRowCount}
- dateRange: ${stats.dateRange.from || "n/a"} .. ${stats.dateRange.to || "n/a"}
- symbols: ${stats.symbols.join(", ")}
- executedLiveRows: ${stats.executedLive}
- liveRows: ${stats.liveRows}
- researchRows: ${stats.researchRows}
- averageRealizedR: ${stats.averageRealizedR ?? "n/a"}

## Class Balance

${classLines || "- none"}

## Sessions

${sessionLines || "- none"}

## Strategy Families

${familyLines || "- none"}

## Today Live Snapshot

- strategy decision rows on 2026-05-07: ${decisionStats.total}
- blocked:max_positions_reached on 2026-05-07: ${decisionStats.blockedMaxPositions}
- signal rows on 2026-05-07: ${decisionStats.signalCount}
- today live trade rows used in dataset: ${todayRows.length}

${todaySummary || "- no live rows for 2026-05-07"}

## Missing Fields

${missing}

## Data Leakage Risks

${leakageRisks}

## Training Readiness

- Signal-quality dataset readiness: ${trainingReady}
- Forecast dataset readiness: ${forecastRows.length >= 100 ? "partial" : "no"}
- RTX 4090 training suitability: signal-quality pretraining can start, but a production-grade Trading LLM still needs more real forecast/model logs, fresher full candle archives, and human-reviewed labels before deployment.
`;

    fs.writeFileSync(DATASET_REPORT_PATH, report);
}

function buildTodayDiagnosticReport(signalRows, strategyDecisionSummary, spreadIssues) {
    const todayRows = todayDiagnosticRows(signalRows);
    const lines = todayRows
        .map(
            (row) =>
                `| ${row.symbol} | ${row.direction} | ${row.entryTimestamp} | ${row.realizedR ?? ""} | ${row.maxFavorableR30m ?? ""} | ${row.maxFavorableR60m ?? ""} | ${row.maxAdverseR30m ?? ""} | ${row.hitProfitBeforeStop60m ?? ""} | ${row.rootCause} |`,
        )
        .join("\n");
    const report = `# Live vs Backtest 2026-05-07

- generatedAt: ${new Date().toISOString()}
- liveSignals: ${strategyDecisionSummary.signalCount}
- liveBlockedMaxPositions: ${strategyDecisionSummary.blockedMaxPositions}
- liveNoSignal: ${strategyDecisionSummary.noSignalCount}
- liveTradeRows: ${todayRows.length}

## Findings

- Today is dominated by max_positions_reached: ${strategyDecisionSummary.blockedMaxPositions} blocked rows out of ${strategyDecisionSummary.total} total strategy decision rows.
- This means the bot spent most of the day unable to evaluate new opportunities in a way that is recoverable from old logs. Forward logging is now fixed to still record blocked signals after strategy evaluation.
- Several recent intraday signals had extreme spread at signal time. The widest examples are listed below; this strongly suggests a missing spread filter in the live strategy surface.
- Formal candle backtest parity for 2026-05-07 is limited because backtest/capital-dataset/*_M15.jsonl currently stops at 2026-05-04, while live backtest/prices/*.jsonl continue through 2026-05-07.

## Today Trades

| Symbol | Dir | Entry | realizedR | maxFav30 | maxFav60 | maxAdv30 | hitProfitBeforeStop60m | Root Cause |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${lines || ""}

## Spread Warnings

${spreadIssues.length ? spreadIssues.map((item) => `- ${item.timestamp} ${item.symbol} spreadPips=${item.spreadPips} reason=${item.reason}`).join("\n") : "- none"}

## Interpretation

- entry_failure means price never gave enough favorable excursion; the setup quality was poor at entry.
- exit_or_management_failure means the trade had enough positive excursion but still finished poorly; this points to management, trailing, breakeven, or forced-flat logic.
- timing_or_protection_failure means the setup had some edge, but the live path was noisy enough that the current entry/management combination did not hold it.
`;
    fs.writeFileSync(TODAY_REPORT_PATH, report);
}

function computeStrategyDecisionSummary() {
    const rows = readJsonl(path.join(TRADE_LOG_DIR, "strategy-decisions.jsonl")).filter((row) => String(row.timestamp || "").startsWith("2026-05-07"));
    return {
        total: rows.length,
        signalCount: rows.filter((row) => row.decision === "signal").length,
        blockedMaxPositions: rows.filter((row) => row.decision === "blocked" && row.blockedReason === "max_positions_reached").length,
        noSignalCount: rows.filter((row) => row.decision === "no_signal").length,
    };
}

function computeSpreadIssues() {
    return readJsonl(path.join(TRADE_LOG_DIR, "strategy-decisions.jsonl"))
        .filter((row) => row.strategyMode === "intraday_lab" && row.decision === "signal" && Number(row.spreadPips) > 5)
        .map((row) => ({
            timestamp: row.timestamp,
            symbol: row.symbol,
            spreadPips: row.spreadPips,
            reason: row.entrySignalReason,
        }));
}

function main() {
    ensureDirs();
    const liveRows = buildLiveRows();
    const researchRows = buildResearchRows();
    const signalRows = [...researchRows, ...liveRows]
        .filter((row) => row.signalTimestamp && row.symbol && row.direction)
        .sort((a, b) => String(a.signalTimestamp).localeCompare(String(b.signalTimestamp)));
    const forecastRows = buildForecastRows();
    const modelDecisionRows = buildModelDecisionOutcomeRows();

    writeJsonl(SIGNAL_JSONL_PATH, signalRows);
    writeCsv(
        SIGNAL_CSV_PATH,
        signalRows.map(flattenSignalRow),
        Object.keys(flattenSignalRow(signalRows[0] || {})),
    );
    writeJsonl(SIGNAL_SFT_PATH, buildSftRows(signalRows));
    writeJsonl(FORECAST_JSONL_PATH, forecastRows);
    writeCsv(FORECAST_CSV_PATH, forecastRows, forecastRows.length ? Object.keys(forecastRows[0]) : []);
    writeJsonl(MODEL_DECISION_OUTCOMES_PATH, modelDecisionRows);

    const decisionSummary = computeStrategyDecisionSummary();
    const spreadIssues = computeSpreadIssues();
    buildDatasetReport(signalRows, forecastRows, modelDecisionRows, todayDiagnosticRows(signalRows), decisionSummary);
    buildTodayDiagnosticReport(signalRows, decisionSummary, spreadIssues);

    console.log(
        JSON.stringify(
            {
                signalDataset: {
                    jsonl: SIGNAL_JSONL_PATH,
                    csv: SIGNAL_CSV_PATH,
                    sft: SIGNAL_SFT_PATH,
                    rows: signalRows.length,
                },
                forecastDataset: {
                    jsonl: FORECAST_JSONL_PATH,
                    csv: FORECAST_CSV_PATH,
                    rows: forecastRows.length,
                },
                modelDecisionOutcomes: {
                    jsonl: MODEL_DECISION_OUTCOMES_PATH,
                    rows: modelDecisionRows.length,
                },
                reports: {
                    dataset: DATASET_REPORT_PATH,
                    todayDiagnostic: TODAY_REPORT_PATH,
                },
                liveRows: liveRows.length,
                researchRows: researchRows.length,
            },
            null,
            2,
        ),
    );
}

main();
