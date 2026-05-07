import fs from "fs";
import path from "path";
import axios from "axios";
import { ACTIVE_INTRADAY_PROFILE, MODEL_DECISION, TRADING_STRATEGY_MODE } from "../config.js";
import logger from "../utils/logger.js";

const LOG_DIR = path.join(process.cwd(), "logs");
const FORECAST_LOG_PATH = path.join(LOG_DIR, "model_forecasts.jsonl");
const SIGNAL_QUALITY_LOG_PATH = path.join(LOG_DIR, "model_signal_quality.jsonl");
const MODEL_DECISIONS_LOG_PATH = path.join(LOG_DIR, "model_decisions.jsonl");

const VALID_MODES = new Set(["disabled", "shadow", "forecast_filter", "signal_quality_filter", "full_filter"]);
const FORECAST_DIRECTIONS = new Set(["BUY", "SELL", "NEUTRAL", "NO_TRADE"]);
const FORECAST_BIASES = new Set(["bullish", "bearish", "neutral", "unclear"]);
const QUALITY_DECISIONS = new Set(["ALLOW_TRADE", "BLOCK_TRADE", "REDUCE_RISK", "NO_OPINION"]);
const SIGNAL_QUALITIES = new Set(["BAD", "NEUTRAL", "GOOD", "EXCELLENT"]);

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function clean(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (typeof value !== "object") return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function appendJsonl(filePath, payload) {
    ensureLogDir();
    fs.appendFileSync(filePath, `${JSON.stringify(clean(payload))}\n`);
}

function toNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

function clamp01(value, fallback = 0) {
    const num = toNumber(value);
    if (num === null) return fallback;
    return Math.max(0, Math.min(1, num));
}

function toIsoTimestamp(value) {
    if (!value) return null;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function latestClosedCandle(series = []) {
    if (!Array.isArray(series) || series.length === 0) return null;
    const candle = series.length > 1 ? series[series.length - 2] : series[series.length - 1];
    return summarizeCandle(candle);
}

function summarizeCandle(candle) {
    if (!candle) return null;
    return {
        timestamp: toIsoTimestamp(candle.timestamp ?? candle.snapshotTimeUTC ?? candle.snapshotTime),
        open: toNumber(candle.open ?? candle.openPrice?.bid ?? candle.openPrice?.ask),
        high: toNumber(candle.high ?? candle.highPrice?.bid ?? candle.highPrice?.ask),
        low: toNumber(candle.low ?? candle.lowPrice?.bid ?? candle.lowPrice?.ask),
        close: toNumber(candle.close ?? candle.closePrice?.bid ?? candle.closePrice?.ask),
    };
}

function candleSummary(candles = {}) {
    return {
        H1: latestClosedCandle(candles.h1Candles),
        M15: latestClosedCandle(candles.m15Candles),
        M5: latestClosedCandle(candles.m5Candles),
        M1: latestClosedCandle(candles.m1Candles),
    };
}

function indicatorSnapshot(indicators = {}) {
    const compact = {};
    for (const [timeframe, item] of Object.entries(indicators || {})) {
        if (!item || typeof item !== "object") {
            compact[timeframe] = null;
            continue;
        }
        compact[timeframe] = {
            trend: item.trend ?? null,
            ema8: toNumber(item.ema8),
            ema9: toNumber(item.ema9),
            ema20: toNumber(item.ema20),
            ema50: toNumber(item.ema50),
            ema200: toNumber(item.ema200),
            rsi: toNumber(item.rsi),
            atr: toNumber(item.atr),
            macdHistogram: toNumber(item.macdHistogram ?? item.macd?.histogram),
        };
    }
    return compact;
}

function currentSessionUTC(now = new Date()) {
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (minutes >= 7 * 60 && minutes < 12 * 60) return "london";
    if (minutes >= 13 * 60 && minutes < 21 * 60) return "ny";
    if (minutes >= 0 && minutes < 7 * 60) return "asian";
    return "off_session";
}

function mode() {
    const raw = MODEL_DECISION.MODE || "disabled";
    return VALID_MODES.has(raw) ? raw : "disabled";
}

function isEnabled() {
    return MODEL_DECISION.ENABLED && mode() !== "disabled";
}

function stableId(prefix, symbol, timestamp = new Date().toISOString()) {
    return `${prefix}_${String(symbol || "unknown").toLowerCase()}_${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

export function isForecastValid(forecast, now = new Date()) {
    const validUntilMs = Date.parse(forecast?.validUntil || "");
    return Number.isFinite(validUntilMs) && validUntilMs > now.getTime();
}

export function doesSignalAgreeWithForecast(signal, forecast) {
    const direction = String(signal || "").toUpperCase();
    const preferred = String(forecast?.preferredDirection || "").toUpperCase();
    if (!["BUY", "SELL"].includes(direction)) return false;
    if (preferred === "NO_TRADE") return false;
    if (forecast?.noTradeZone === true) return false;
    if (preferred === "NEUTRAL") return true;
    return preferred === direction;
}

export function buildMarketContext({ symbol, indicators, candles, bid, ask, strategyContext = {}, openPositionsContext = {}, recentTradeContext = {} } = {}) {
    const now = new Date();
    const spread = Number.isFinite(Number(bid)) && Number.isFinite(Number(ask)) ? Math.abs(Number(ask) - Number(bid)) : null;
    return {
        symbol,
        timeframe: strategyContext.timeframe || strategyContext.executionTimeframe || "M5",
        session: currentSessionUTC(now),
        timestamp: now.toISOString(),
        bid: toNumber(bid),
        ask: toNumber(ask),
        spread,
        spreadPips: strategyContext.currentSpreadPips ?? null,
        latestCandles: candleSummary(candles),
        indicators: indicatorSnapshot(indicators),
        strategy: {
            mode: strategyContext.strategyMode || TRADING_STRATEGY_MODE,
            profileId: strategyContext.profileId || ACTIVE_INTRADAY_PROFILE?.id || null,
            strategyFamily: strategyContext.strategyFamily || strategyContext.strategyType || ACTIVE_INTRADAY_PROFILE?.strategyFamily?.family || null,
            candidateId: strategyContext.normalizedCandidateId || null,
        },
        openPositionsContext: clean(openPositionsContext),
        recentTradeContext: clean(recentTradeContext),
    };
}

export function buildSignalQualityContext({ signal, reason, forecast, marketContext, strategyContext = {}, riskContext = {} } = {}) {
    return {
        signal: {
            direction: String(signal || "").toUpperCase(),
            reason: reason || null,
            strategyFamily: strategyContext.strategyFamily || strategyContext.strategyType || null,
            strategyName: strategyContext.strategyName || null,
            profileId: strategyContext.profileId || null,
            candidateId: strategyContext.normalizedCandidateId || null,
            expectedEntryPrice: toNumber(strategyContext.expectedEntryPrice),
            expectedStopPrice: toNumber(strategyContext.expectedStopPrice),
            takeProfitR: toNumber(strategyContext.takeProfitR),
            context: clean(strategyContext.candidateContext || strategyContext),
        },
        forecast: clean(forecast),
        marketContext: clean(marketContext),
        riskContext: clean(riskContext),
    };
}

export function validateForecast30m(payload = {}) {
    const errors = [];
    if (payload.type !== "FORECAST_30M") errors.push("type must be FORECAST_30M");
    if (typeof payload.symbol !== "string" || !payload.symbol) errors.push("symbol must be non-empty string");
    if (payload.timeframe !== "M5") errors.push("timeframe must be M5");
    if (!Number.isFinite(Date.parse(payload.createdAt || ""))) errors.push("createdAt must be ISO timestamp");
    if (!Number.isFinite(Date.parse(payload.validUntil || ""))) errors.push("validUntil must be ISO timestamp");
    if (Number(payload.horizonMinutes) !== 30) errors.push("horizonMinutes must be 30");
    if (!FORECAST_DIRECTIONS.has(payload.preferredDirection)) errors.push("preferredDirection is invalid");
    if (!FORECAST_BIASES.has(payload.marketBias)) errors.push("marketBias is invalid");
    for (const key of ["confidence", "probabilityProfitBuy", "probabilityProfitSell"]) {
        const value = Number(payload[key]);
        if (!Number.isFinite(value) || value < 0 || value > 1) errors.push(`${key} must be number 0..1`);
    }
    for (const key of ["expectedMovePips", "expectedR"]) {
        if (!Number.isFinite(Number(payload[key]))) errors.push(`${key} must be numeric`);
    }
    if (typeof payload.noTradeZone !== "boolean") errors.push("noTradeZone must be boolean");
    if (typeof payload.reason !== "string") errors.push("reason must be string");
    if (typeof payload.modelVersion !== "string") errors.push("modelVersion must be string");
    return { valid: errors.length === 0, errors };
}

export function validateSignalQuality(payload = {}) {
    const errors = [];
    if (payload.type !== "SIGNAL_QUALITY") errors.push("type must be SIGNAL_QUALITY");
    if (typeof payload.symbol !== "string" || !payload.symbol) errors.push("symbol must be non-empty string");
    if (typeof payload.strategyFamily !== "string" || !payload.strategyFamily) errors.push("strategyFamily must be non-empty string");
    if (!["BUY", "SELL"].includes(payload.direction)) errors.push("direction must be BUY or SELL");
    if (!QUALITY_DECISIONS.has(payload.decision)) errors.push("decision is invalid");
    if (!SIGNAL_QUALITIES.has(payload.signalQuality)) errors.push("signalQuality is invalid");
    if (!Number.isFinite(Number(payload.confidence)) || Number(payload.confidence) < 0 || Number(payload.confidence) > 1) errors.push("confidence must be number 0..1");
    if (!Number.isFinite(Number(payload.expectedR))) errors.push("expectedR must be numeric");
    if (!Number.isFinite(Number(payload.riskPct))) errors.push("riskPct must be numeric");
    if (typeof payload.reason !== "string") errors.push("reason must be string");
    if (!Array.isArray(payload.warnings)) errors.push("warnings must be array");
    return { valid: errors.length === 0, errors };
}

class ModelDecisionService {
    constructor() {
        this.forecastCache = new Map();
        this.warnedUnavailable = false;
    }

    get config() {
        return MODEL_DECISION;
    }

    providerName() {
        if (this.config.ENDPOINT_URL) return "http_endpoint";
        if (this.config.ALLOW_MOCK) return "mock";
        return "none";
    }

    canCallProvider() {
        return Boolean(this.config.ENDPOINT_URL || this.config.ALLOW_MOCK);
    }

    async getOrCreateForecast30m(symbol, marketContext = {}) {
        const currentMode = mode();
        if (!isEnabled()) return { forecast: null, source: "disabled" };
        this.warnIfMisconfigured();

        const cached = this.forecastCache.get(symbol);
        if (isForecastValid(cached)) return { forecast: cached, source: "cache" };

        if (!this.canCallProvider()) {
            const error = "model_provider_unavailable";
            this.logForecast({ mode: currentMode, symbol, marketContext, error });
            return { forecast: null, source: "unavailable", error };
        }

        let forecast = null;
        try {
            forecast = this.config.ENDPOINT_URL ? await this.callEndpointForecast(symbol, marketContext) : this.mockForecast(symbol, marketContext);
        } catch (error) {
            this.logForecast({ mode: currentMode, symbol, marketContext, error: error.message || "forecast_provider_error" });
            return { forecast: null, source: this.providerName(), error: "forecast_provider_error", details: error.message };
        }
        const validation = validateForecast30m(forecast);
        if (!validation.valid) {
            this.logForecast({ mode: currentMode, symbol, marketContext, forecast, error: "invalid_forecast_json", validationErrors: validation.errors });
            return { forecast: null, source: this.providerName(), error: "invalid_forecast_json", validationErrors: validation.errors };
        }

        this.forecastCache.set(symbol, forecast);
        this.logForecast({ mode: currentMode, symbol, timeframe: "M5", forecastId: stableId("forecast", symbol, forecast.createdAt), marketContext, forecast, modelVersion: forecast.modelVersion });
        return { forecast, source: this.providerName() };
    }

    async checkSignalQuality({ signal, forecast, marketContext, strategyContext = {}, riskContext = {}, reason = "" } = {}) {
        const currentMode = mode();
        if (!isEnabled()) return { qualityDecision: null, source: "disabled" };
        this.warnIfMisconfigured();
        if (!this.canCallProvider()) {
            const error = "model_provider_unavailable";
            this.logSignalQuality({ mode: currentMode, symbol: marketContext?.symbol, strategySignal: signal, forecast, marketContext, error });
            return { qualityDecision: null, source: "unavailable", error };
        }

        const context = buildSignalQualityContext({ signal, reason, forecast, marketContext, strategyContext, riskContext });
        let qualityDecision = null;
        try {
            qualityDecision = this.config.ENDPOINT_URL ? await this.callEndpointSignalQuality(context) : this.mockSignalQuality(context);
        } catch (error) {
            this.logSignalQuality({ mode: currentMode, symbol: marketContext?.symbol, strategySignal: signal, forecast, marketContext, error: error.message || "signal_quality_provider_error" });
            return { qualityDecision: null, source: this.providerName(), error: "signal_quality_provider_error", details: error.message };
        }
        const validation = validateSignalQuality(qualityDecision);
        if (!validation.valid) {
            this.logSignalQuality({ mode: currentMode, symbol: marketContext?.symbol, strategySignal: signal, forecast, marketContext, qualityDecision, error: "invalid_signal_quality_json", validationErrors: validation.errors });
            return { qualityDecision: null, source: this.providerName(), error: "invalid_signal_quality_json", validationErrors: validation.errors };
        }

        this.logSignalQuality({
            mode: currentMode,
            symbol: marketContext?.symbol,
            timeframe: marketContext?.timeframe,
            forecastId: forecast ? stableId("forecast", forecast.symbol, forecast.createdAt) : null,
            candidateId: strategyContext.normalizedCandidateId || null,
            strategySignal: context.signal,
            marketContext,
            forecast,
            qualityDecision,
            modelVersion: forecast?.modelVersion || "unknown",
        });
        return { qualityDecision, source: this.providerName() };
    }

    async observeMarket({ symbol, indicators, candles, bid, ask, strategyContext = {}, openPositionsContext = {}, recentTradeContext = {} } = {}) {
        if (!isEnabled()) return { enabled: false };
        const marketContext = buildMarketContext({ symbol, indicators, candles, bid, ask, strategyContext, openPositionsContext, recentTradeContext });
        const forecastResult = await this.getOrCreateForecast30m(symbol, marketContext);
        return { enabled: true, marketContext, ...forecastResult };
    }

    async evaluateTradeSignal({ symbol, signal, reason, strategyContext = {}, indicators, candles, bid, ask, riskContext = {}, openPositionsContext = {}, recentTradeContext = {} } = {}) {
        const currentMode = mode();
        if (!isEnabled()) {
            return { enabled: false, shouldBlock: false, finalBotDecision: "model_disabled" };
        }

        const marketContext = buildMarketContext({ symbol, indicators, candles, bid, ask, strategyContext, openPositionsContext, recentTradeContext });
        const forecastResult = await this.getOrCreateForecast30m(symbol, marketContext);
        const forecast = forecastResult.forecast;

        let qualityResult = { qualityDecision: null };
        if (signal) {
            qualityResult = await this.checkSignalQuality({ signal, forecast, marketContext, strategyContext, riskContext, reason });
        }

        const forecastRequired = currentMode === "forecast_filter" || currentMode === "full_filter";
        const providerError = (forecastRequired ? forecastResult.error : null) || qualityResult.error || null;
        const filterDecision = this.applyModeDecision({ mode: currentMode, signal, forecast, qualityDecision: qualityResult.qualityDecision, providerError });
        const finalBotDecision = filterDecision.shouldBlock ? "blocked_by_model_layer" : currentMode === "shadow" ? "shadow_no_behavior_change" : "allowed_by_model_layer";

        this.logModelDecision({
            mode: currentMode,
            symbol,
            timeframe: marketContext.timeframe,
            forecastId: forecast ? stableId("forecast", forecast.symbol, forecast.createdAt) : null,
            candidateId: strategyContext.normalizedCandidateId || null,
            strategySignal: clean({ signal, reason, context: strategyContext }),
            marketContext,
            forecast,
            qualityDecision: qualityResult.qualityDecision,
            finalBotDecision,
            blockedReason: filterDecision.blockedReason,
            modelVersion: forecast?.modelVersion || "unknown",
            error: providerError,
        });

        return {
            enabled: true,
            mode: currentMode,
            shouldBlock: filterDecision.shouldBlock,
            blockedReason: filterDecision.blockedReason,
            finalBotDecision,
            forecast,
            qualityDecision: qualityResult.qualityDecision,
            marketContext,
        };
    }

    applyModeDecision({ mode: currentMode, signal, forecast, qualityDecision, providerError }) {
        if (currentMode === "shadow") return { shouldBlock: false, blockedReason: null };
        if (providerError) return { shouldBlock: true, blockedReason: providerError };

        if (currentMode === "forecast_filter" || currentMode === "full_filter") {
            if (!forecast) return { shouldBlock: true, blockedReason: "missing_forecast" };
            const confidence = Number(forecast.confidence);
            const confidentEnough = Number.isFinite(confidence) && confidence >= this.config.MIN_FORECAST_CONFIDENCE;
            const agrees = doesSignalAgreeWithForecast(signal, forecast);
            if (confidentEnough && !agrees) return { shouldBlock: true, blockedReason: "forecast_disagrees_with_signal" };
        }

        if (currentMode === "signal_quality_filter" || currentMode === "full_filter") {
            if (!qualityDecision) return { shouldBlock: true, blockedReason: "missing_signal_quality_decision" };
            if (qualityDecision.decision === "BLOCK_TRADE") return { shouldBlock: true, blockedReason: "model_block_trade" };
            if (qualityDecision.decision === "REDUCE_RISK") return { shouldBlock: true, blockedReason: "model_reduce_risk_not_supported_yet" };
            if (qualityDecision.decision !== "ALLOW_TRADE") return { shouldBlock: true, blockedReason: "model_no_trade_approval" };
            if (Number(qualityDecision.confidence) < this.config.MIN_SIGNAL_CONFIDENCE) return { shouldBlock: true, blockedReason: "model_signal_confidence_too_low" };
            if (Number(qualityDecision.expectedR) < this.config.MIN_EXPECTED_R) return { shouldBlock: true, blockedReason: "model_expected_r_too_low" };
        }

        return { shouldBlock: false, blockedReason: null };
    }

    async callEndpointForecast(symbol, marketContext) {
        const response = await axios.post(
            this.config.ENDPOINT_URL,
            { type: "FORECAST_30M_REQUEST", symbol, marketContext },
            { timeout: this.config.REQUEST_TIMEOUT_MS, headers: this.endpointHeaders() },
        );
        return response?.data?.forecast || response?.data;
    }

    async callEndpointSignalQuality(signalQualityContext) {
        const response = await axios.post(
            this.config.ENDPOINT_URL,
            { type: "SIGNAL_QUALITY_REQUEST", signalQualityContext },
            { timeout: this.config.REQUEST_TIMEOUT_MS, headers: this.endpointHeaders() },
        );
        return response?.data?.qualityDecision || response?.data;
    }

    endpointHeaders() {
        const headers = { "Content-Type": "application/json" };
        if (this.config.API_KEY) headers.Authorization = `Bearer ${this.config.API_KEY}`;
        return headers;
    }

    mockForecast(symbol, marketContext = {}) {
        const createdAt = new Date();
        const validUntil = new Date(createdAt.getTime() + Math.max(1, Number(this.config.FORECAST_TTL_MINUTES || 30)) * 60_000);
        const m5 = marketContext.latestCandles?.M5;
        const m15 = marketContext.latestCandles?.M15;
        const m5Move = m5 && Number.isFinite(m5.open) && Number.isFinite(m5.close) ? m5.close - m5.open : 0;
        const m15Move = m15 && Number.isFinite(m15.open) && Number.isFinite(m15.close) ? m15.close - m15.open : 0;
        const combined = m5Move + m15Move;
        const preferredDirection = combined > 0 ? "BUY" : combined < 0 ? "SELL" : "NEUTRAL";
        const magnitude = Math.min(1, Math.abs(combined) * 10_000);
        return {
            type: "FORECAST_30M",
            symbol,
            timeframe: "M5",
            createdAt: createdAt.toISOString(),
            validUntil: validUntil.toISOString(),
            horizonMinutes: 30,
            preferredDirection,
            confidence: clamp01(0.5 + magnitude * 0.08, 0.5),
            probabilityProfitBuy: preferredDirection === "BUY" ? 0.56 : preferredDirection === "SELL" ? 0.44 : 0.5,
            probabilityProfitSell: preferredDirection === "SELL" ? 0.56 : preferredDirection === "BUY" ? 0.44 : 0.5,
            expectedMovePips: Number((Math.abs(combined) / (String(symbol).includes("JPY") ? 0.01 : 0.0001)).toFixed(2)),
            expectedR: Number((magnitude * 0.35).toFixed(3)),
            marketBias: preferredDirection === "BUY" ? "bullish" : preferredDirection === "SELL" ? "bearish" : "neutral",
            noTradeZone: preferredDirection === "NEUTRAL",
            reason: "mock momentum forecast from latest M5/M15 candle bodies",
            modelVersion: "mock-v0",
        };
    }

    mockSignalQuality(context = {}) {
        const direction = context.signal?.direction;
        const forecast = context.forecast;
        const agrees = doesSignalAgreeWithForecast(direction, forecast);
        const confidence = agrees ? Math.max(0.66, Number(forecast?.confidence || 0.66)) : 0.45;
        const expectedR = agrees ? Math.max(0.55, Number(forecast?.expectedR || 0.55)) : 0.1;
        return {
            type: "SIGNAL_QUALITY",
            symbol: context.marketContext?.symbol || forecast?.symbol || "unknown",
            strategyFamily: context.signal?.strategyFamily || "unknown",
            direction,
            decision: agrees ? "ALLOW_TRADE" : "BLOCK_TRADE",
            signalQuality: agrees ? "GOOD" : "BAD",
            confidence: clamp01(confidence),
            expectedR,
            riskPct: toNumber(context.riskContext?.riskPct) ?? 0,
            reason: agrees ? "mock signal quality allows signal aligned with forecast" : "mock signal quality blocks signal against forecast/no-trade zone",
            warnings: ["mock_provider_not_for_live_filtering"],
        };
    }

    logForecast(payload) {
        appendJsonl(FORECAST_LOG_PATH, { timestamp: new Date().toISOString(), ...payload });
    }

    logSignalQuality(payload) {
        appendJsonl(SIGNAL_QUALITY_LOG_PATH, { timestamp: new Date().toISOString(), ...payload });
    }

    logModelDecision(payload) {
        appendJsonl(MODEL_DECISIONS_LOG_PATH, { timestamp: new Date().toISOString(), ...payload });
    }

    warnIfMisconfigured() {
        if (!isEnabled() || this.canCallProvider() || this.warnedUnavailable) return;
        this.warnedUnavailable = true;
        logger.warn(`[ModelDecision] mode=${mode()} enabled but no MODEL_ENDPOINT_URL and MODEL_ALLOW_MOCK is not true.`);
    }
}

const modelDecisionService = new ModelDecisionService();

export { FORECAST_LOG_PATH, MODEL_DECISIONS_LOG_PATH, SIGNAL_QUALITY_LOG_PATH };
export default modelDecisionService;
