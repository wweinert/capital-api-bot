import { startSession, pingSession, getHistorical, getSessionTokens, refreshSession } from "./api.js";
import { DEV, TIMEFRAMES, SESSIONS } from "./config.js";
import tradingService from "./services/trading.js";
import { calcIndicators, aggregateM30 } from "./indicators/indicators.js";
import logger from "./utils/logger.js";
import tradeMonitor from "./monitors.js";
import Strategy from "./strategies/strategies.js";

class TradingBot {
    #analysisRepeatMs = 15 * 60_000;
    #analysisDelayMs = 2_000;
    #timeframeMinutes = { m1: 1, m5: 5, m15: 15, m30: 30, h1: 60, h4: 240, d1: 1440 };
    #monitorIntervalMs = 60_000;

    analysisInterval = null;
    analysisStartTimeout = null;
    analysisInProgress = false;
    sessionPingInterval = null;
    pingInterval = 9 * 60_000;
    maxRetries = 3;
    retryDelay = 30_000;
    maxCandleHistory = 322;
    lastAnalyzedCandles = {};
    tokens = null;

    // Startup and scheduling
    async initialize() {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                await startSession();
                const tokens = getSessionTokens();
                if (!tokens.cst || !tokens.xsecurity) throw new Error("Invalid session tokens");
                this.tokens = tokens;
                await this.startLiveTrading();
                this.scheduleMidnightSessionRefresh();
                return;
            } catch (error) {
                logger.error(`[Bot] Initialization attempt ${attempt} failed:`, error);
                if (attempt < this.maxRetries) {
                    logger.info(`[Bot] Retrying in ${this.retryDelay / 1000}s...`);
                    await this.delay(this.retryDelay);
                    await refreshSession();
                } else {
                    logger.error("[Bot] Max retry attempts reached. Shutting down.");
                    process.exit(1);
                }
            }
        }
    }

    async startLiveTrading() {
        try {
            this.startSessionPing();
            this.startAnalysisInterval();
            tradeMonitor.startMonitorOpenTrades(this, this.#monitorIntervalMs);
        } catch (error) {
            logger.error("[bot.js][Bot] Error starting live trading:", error);
            throw error;
        }
    }

    startSessionPing() {
        this.sessionPingInterval = setInterval(async () => {
            try {
                await pingSession();
                logger.info("Session pinged successfully");
            } catch (error) {
                logger.error("[bot.js] Session ping failed:", error.message);
            }
        }, this.pingInterval);
    }

    async startAnalysisInterval() {
        const runAnalysis = async () => {
            if (this.analysisInProgress) {
                logger.warn("[bot.js] Previous analysis still running; skipping this tick.");
                return;
            }

            this.analysisInProgress = true;
            try {
                await this.analyzeAllSymbols();
            } catch (error) {
                logger.error("[bot.js] Analysis interval error:", error);
            } finally {
                this.analysisInProgress = false;
            }
        };

        // First run: align to the next M15 candle close + 2 seconds
        const interval = this.getInitialIntervalMs();

        logger.info(`[${DEV.MODE ? "DEV" : "PROD"}] Setting up analysis interval: ${interval}ms`);

        this.analysisStartTimeout = setTimeout(() => {
            void runAnalysis();

            // Repeat after every M15 candle
            this.analysisInterval = setInterval(() => {
                void runAnalysis();
            }, this.getRepeatIntervalMs());
        }, interval);
    }

    // Session selection and signal analysis
    getActiveSymbols(timestamp = Date.now()) {
        const now = timestamp instanceof Date ? timestamp : new Date(timestamp);

        if (Number.isNaN(now.getTime())) return [];

        const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
        const activeSessions = Object.entries(SESSIONS).filter(([, session]) => {
            const [startHour, startMinute] = session.START.split(":").map(Number);
            const [endHour, endMinute] = session.END.split(":").map(Number);
            const start = startHour * 60 + startMinute;
            const end = endHour * 60 + endMinute;

            return start < end ? currentMinutes >= start && currentMinutes < end : currentMinutes >= start || currentMinutes < end;
        });
        const symbols = [...new Set(activeSessions.flatMap(([, session]) => session.SYMBOLS))];

        logger.info(`[Bot] ${activeSessions.map(([name]) => name).join(" + ") || "offHours"} symbols: ${symbols.join(", ") || "none"}`);
        return symbols;
    }

    async analyzeAllSymbols() {
        if (!Strategy.getTimeframe()) return [];
        const symbols = this.getActiveSymbols();
        const pairAnalyses = Promise.all(
            symbols.map(async (symbol) => {
                try {
                    const candles = await this.fetchAllCandles(symbol);
                    return await this.analyzeSymbol(symbol, candles);
                } catch (error) {
                    logger.error(`[Bot] ${symbol} analysis failed: ${error.message}`);
                    return null;
                }
            }),
        );

        const [results] = await Promise.all([pairAnalyses, tradingService.updateAccountInfo()]);

        const candidates = results.filter(Boolean);

        const signals = candidates.filter((candidate) => candidate.signal);
        logger.info(`[Bot] Candidates: ${signals.length ? signals.map((candidate) => `${candidate.symbol} ${candidate.signal}`).join(", ") : "none"}`);

        return tradingService.processCandidates(candidates, symbols);
    }

    async fetchAllCandles(symbol) {
        try {
            const timeframes = ["H1", "M15", "M5"];
            const candleData = {};

            await Promise.all(
                timeframes.map(async (tf) => {
                    const count = tf === "M15" ? this.maxCandleHistory * 2 : this.maxCandleHistory;
                    const data = await getHistorical(symbol, TIMEFRAMES[tf], count);

                    candleData[tf.toLowerCase()] = data.prices;
                }),
            );

            return candleData;
        } catch (error) {
            logger.error(`[CandleFetch] Error fetching candles for ${symbol}: ${error.message}`);
            return {};
        }
    }

    shouldAnalyzeCandle(symbol, candles, timeframe = "h1") {
        const signalCandles = candles[timeframe];

        if (!Array.isArray(signalCandles) || signalCandles.length === 0) {
            logger.warn(`[Bot] No ${timeframe} candles for ${symbol}`);

            return false;
        }

        const lastCandle = signalCandles[signalCandles.length - 1];
        const candleId = `${timeframe}:${lastCandle.timestamp}`;

        if (this.lastAnalyzedCandles[symbol] === candleId) {
            logger.debug(`[Bot] ${symbol}: ${candleId} already analyzed`);

            return false;
        }

        this.lastAnalyzedCandles[symbol] = candleId;

        return true;
    }

    // Analyzes a single symbol: fetches data, calculates indicators, and triggers trading logic.
    async analyzeSymbol(symbol, candleData) {
        logger.info(`\n\n=== Processing ${symbol} ===`);
        const candles = {};

        for (const [tf, prices] of Object.entries(candleData)) {
            if (!Array.isArray(prices) || prices.length < 2) {
                logger.warn(`[Bot] Missing ${tf} candles for ${symbol}`);
                return null;
            }
            candles[tf] = prices.filter((candle) => {
                const closeTime = Date.parse(candle.timestamp) + this.#timeframeMinutes[tf] * 60_000;

                return closeTime <= Date.now();
            });
        }

        const timeframe = Strategy.getTimeframe();
        if (timeframe === "m30") candles.m30 = aggregateM30(candles.m15);
        if (!timeframe || !this.shouldAnalyzeCandle(symbol, candles, timeframe)) {
            return null;
        }
        const decisionTime = Date.parse(candles[timeframe].at(-1).timestamp) + this.#timeframeMinutes[timeframe] * 60_000;
        if (Strategy.getTimeframe(decisionTime) !== timeframe) return null;

        const indicators = {};

        await Promise.all(
            Object.entries(candles).map(async ([tf, prices]) => {
                indicators[tf] = await calcIndicators(prices);
            }),
        );

        const candidate = Strategy.getSignal({
            symbol,
            indicators,
            candles,
            timeframe,
        });

        if (!candidate || (!candidate.signal && timeframe !== "m30")) {
            return null;
        }

        return {
            ...candidate,
            indicators,
            candles,
            timeframe,
            decisionTime,
        };
    }

    // Session renewal and timer alignment
    scheduleMidnightSessionRefresh() {
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0); // Next 00:00
        const msUntilMidnight = nextMidnight - now;
        setTimeout(() => {
            this.refreshSessionAtMidnight();
            // After first run, repeat every 24h
            setInterval(() => this.refreshSessionAtMidnight(), 24 * 60 * 60 * 1000);
        }, msUntilMidnight);
        logger.info(`[Bot] Scheduled session refresh at midnight in ${(msUntilMidnight / 1000 / 60).toFixed(2)} minutes.`);
    }

    async refreshSessionAtMidnight() {
        try {
            logger.info("[Bot] Refreshing session at midnight...");
            await refreshSession();
            logger.info("[Bot] Session refreshed at midnight.");
        } catch (error) {
            logger.error("[bot.js][Bot] Midnight session refresh failed:", error);
        }
    }

    getInitialIntervalMs() {
        if (DEV.MODE) {
            return DEV.INTERVAL;
        }

        const now = Date.now();

        const currentCandleClose = Math.floor(now / this.#analysisRepeatMs) * this.#analysisRepeatMs;

        const currentAnalysisTime = currentCandleClose + this.#analysisDelayMs;

        if (currentAnalysisTime > now) {
            return currentAnalysisTime - now;
        }

        const nextAnalysisTime = currentAnalysisTime + this.#analysisRepeatMs;

        return nextAnalysisTime - now;
    }

    getRepeatIntervalMs() {
        return DEV.MODE ? DEV.INTERVAL : this.#analysisRepeatMs;
    }

    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

const bot = new TradingBot();

if ([0, 6].includes(new Date().getUTCDay())) {
    logger.info("[Bot] It's the weekend. Bot will not start until Monday.");
} else {
    bot.initialize().catch((error) => {
        logger.error("[bot.js] Bot initialization failed:", error);
        process.exit(1);
    });
}
