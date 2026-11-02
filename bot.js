import { startSession, pingSession, getHistorical, getAccountInfo, getSessionTokens, refreshSession } from "./api.js";
import { DEV, TIMEFRAMES, SESSIONS } from "./config.js";
import tradingService from "./services/trading.js";
import { calcIndicators } from "./indicators/indicators.js";
import logger from "./utils/logger.js";
import { startMonitorOpenTrades, maxHoldCheck, dailyFlatCheck, logDeals, startWebSocket } from "./monitors.js";
import Strategy from "./strategies/strategies.js";

const ANALYSIS_REPEAT_MS = 15 * 60 * 1000;
const ANALYSIS_DELAY_MS = 2 * 1000;
const TIMEFRAME_MINUTES = {
    m1: 1,
    m5: 5,
    m15: 15,
    h1: 60,
    h4: 240,
    d1: 1440,
};
class TradingBot {
    constructor() {
        this.isRunning = false;
        this.analysisInterval = null;
        this.analysisStartTimeout = null;
        this.analysisInProgress = false;
        this.sessionRefreshInterval = null;
        this.sessionPingInterval = null;
        this.pingInterval = 9 * 60 * 1000;
        this.checkInterval = 15 * 1000;
        this.maxRetries = 3;
        this.retryDelay = 30000; // 30 seconds
        this.monitorInterval = null; // Add monitor interval for open trades
        this.monitorInProgress = false; // Prevent overlapping monitor runs
        this.priceMonitorInProgress = false;
        this.dealIdMonitorInProgress = false; // Prevent overlapping dealId checks
        this.maxCandleHistory = 322; // Rolling window size for indicators
        this.openedPositions = {}; // Track opened positions
        this.MONITOR_INTERVAL_MS = 60 * 1000; // 1 minute
        this.openedBrockerDealIds = [];
        this.activeSymbols = [];
        this.lastAnalyzedCandles = {};
        this.tokens = null;
    }

    async initialize() {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                await startSession();
                const tokens = getSessionTokens();
                if (!tokens.cst || !tokens.xsecurity) throw new Error("Invalid session tokens");
                this.tokens = tokens;
                await this.startLiveTrading(tokens);
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
            // startWebSocket(this);
            this.startSessionPing();
            this.startAnalysisInterval();
            this.startMonitorOpenTrades();
            this.isRunning = true;
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

    // Updates account balance, margin, and open trades in the trading service.
    async updateAccountInfo() {
        let retries = 3;
        while (retries > 0) {
            try {
                const accountData = await getAccountInfo();
                if (accountData?.accounts?.[0]?.balance?.balance) {
                    tradingService.setAccountBalance(accountData.accounts[0].balance.balance);
                    if (typeof accountData.accounts[0].balance.available !== "undefined") {
                        tradingService.setAvailableMargin(accountData.accounts[0].balance.available);
                    }

                    return; // Success - exit the method
                }
            } catch (error) {
                retries--;
                if (retries === 0) {
                    logger.error("[bot.js] Failed to update account info after all retries:", error);
                    // Don't throw - just continue with old values
                    return;
                }
                logger.warn(`Account info update failed, retrying... (${retries} attempts left)`);
                await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            }
        }
    }

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
        const symbols = this.getActiveSymbols();
        this.activeSymbols = symbols;

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

        const [results] = await Promise.all([pairAnalyses, this.updateAccountInfo()]);

        const candidates = results.filter(Boolean);

        logger.info(`[Bot] Candidates: ${candidates.length ? candidates.map((candidate) => `${candidate.symbol} ${candidate.signal}`).join(", ") : "none"}`);

        return tradingService.processCandidates(candidates);
    }

    async fetchAllCandles(symbol) {
        try {
            const timeframes = ["H1", "M15", "M5"];
            const candleData = {};

            await Promise.all(
                timeframes.map(async (tf) => {
                    const data = await getHistorical(symbol, TIMEFRAMES[tf], this.maxCandleHistory);

                    candleData[tf.toLowerCase()] = data.prices;
                }),
            );

            return candleData;
        } catch (error) {
            logger.error(`[CandleFetch] Error fetching candles for ${symbol}: ${error.message}`);
            return {};
        }
    }

    shouldAnalyzeCandle(symbol, candles) {
        const signalCandles = candles.h1;

        if (!Array.isArray(signalCandles) || signalCandles.length === 0) {
            logger.warn(`[Bot] No H1 candles for ${symbol}`);

            return false;
        }

        const lastCandle = signalCandles[signalCandles.length - 1];
        const candleId = `H1:${lastCandle.timestamp}`;

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
                const closeTime = Date.parse(candle.timestamp) + TIMEFRAME_MINUTES[tf] * 60 * 1000;

                return closeTime <= Date.now();
            });
        }

        if (!this.shouldAnalyzeCandle(symbol, candles)) {
            return null;
        }

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
        });

        if (!candidate?.signal) {
            return null;
        }

        return {
            ...candidate,
            indicators,
            candles,
        };
    }

    async startMonitorOpenTrades() {
        return startMonitorOpenTrades(this, this.MONITOR_INTERVAL_MS);
    }

    async maxHoldCheck() {
        return maxHoldCheck(this);
    }

    async dailyFlatCheck() {
        return dailyFlatCheck(this);
    }

    logDeals() {
        return logDeals(this);
    }

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

        const currentCandleClose = Math.floor(now / ANALYSIS_REPEAT_MS) * ANALYSIS_REPEAT_MS;

        const currentAnalysisTime = currentCandleClose + ANALYSIS_DELAY_MS;

        if (currentAnalysisTime > now) {
            return currentAnalysisTime - now;
        }

        const nextAnalysisTime = currentAnalysisTime + ANALYSIS_REPEAT_MS;

        return nextAnalysisTime - now;
    }

    getRepeatIntervalMs() {
        return DEV.MODE ? DEV.INTERVAL : ANALYSIS_REPEAT_MS;
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
