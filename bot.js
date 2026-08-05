import { startSession, pingSession, getHistorical, getAccountInfo, getSessionTokens, refreshSession, getMarketDetails } from "./api.js";
import { pathToFileURL } from "url";
import { DEV, ANALYSIS, SESSIONS, PROFILES } from "./config.js";
import tradingService from "./services/trading.js";
import { calcIndicators } from "./indicators/indicators.js";
import logger from "./utils/logger.js";
import { startMonitorOpenTrades, trailingStopCheck, maxHoldCheck, dailyFlatCheck, logDeals, startWebSocket } from "./monitors.js";
// import Strategy from "./strategies/strategies.js";
import Strategy, { getStrategyProfiles } from "./strategies/strategy_2.js";

const { TIMEFRAMES } = ANALYSIS;

const ANALYSIS_REPEAT_MS = 5 * 60 * 1000;
const ANALYSIS_DELAY_MS = 1 * 1000;
const TIMEFRAME_MINUTES = {
    m1: 1,
    m5: 5,
    m15: 15,
    h1: 60,
    h4: 240,
    d1: 1440,
};
export class TradingBot {
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
        this.maxCandleHistory = 201; // Rolling window size for indicators
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
                await this.updateAccountInfo();
                await this.analyzeAllSymbols();
            } catch (error) {
                logger.error("[bot.js] Analysis interval error:", error);
            } finally {
                this.analysisInProgress = false;
            }
        };

        // First run: align to the next M5 candle close + 5 seconds
        const interval = this.getInitialIntervalMs();

        logger.info(`[${DEV.MODE ? "DEV" : "PROD"}] Setting up analysis interval: ${interval}ms`);

        this.analysisStartTimeout = setTimeout(() => {
            void runAnalysis();

            // Repeat after every M5 candle
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

    isProfileSessionActive(profile, currentMinutes) {
        const { windowStart, windowEnd } = profile.signal ?? {};

        if (Number.isFinite(windowStart) && Number.isFinite(windowEnd)) {
            return this.inSession(currentMinutes, windowStart, windowEnd);
        }

        const sessionName = profile.signal?.session;
        const session = SESSIONS[sessionName];

        if (!session) {
            logger.warn(`[Bot] Unknown session: ${sessionName}`);
            return false;
        }

        return this.inSession(currentMinutes, session.START, session.END);
    }

    getActiveSymbols() {
        const now = new Date();
        const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

        const symbols = Object.entries(PROFILES)
            .filter(([symbol]) => {
                return getStrategyProfiles(symbol).some(
                    (profile) => profile.enabled && this.isProfileSessionActive(profile, currentMinutes),
                );
            })
            .map(([symbol]) => symbol);

        logger.info(`[Bot] Tradable symbols: ${symbols.length ? symbols.join(", ") : "none"}`);

        return symbols;
    }

    async analyzeAllSymbols() {
        this.activeSymbols = await this.getActiveSymbols();

        const allCandles = await Promise.all(this.activeSymbols.map((symbol) => this.fetchAllCandles(symbol)));

        const results = await Promise.all(this.activeSymbols.map((symbol, index) => this.analyzeSymbol(symbol, allCandles[index])));

        const candidates = results.flat().filter(Boolean).sort((a, b) =>
            b.priority - a.priority || b.quality - a.quality,
        );

        logger.info(
            `[Bot] Candidates: ${
                candidates.length
                    ? candidates.map((candidate) => `${candidate.symbol} ${candidate.signal} ${candidate.profileId} (${candidate.quality.toFixed(2)})`).join(", ")
                    : "none"
            }`,
        );

        return tradingService.processCandidates(candidates);
    }

    async fetchAllCandles(symbol) {
        try {
            const profiles = getStrategyProfiles(symbol);
            const timeframes = [...new Set(profiles.flatMap((profile) => {
                const signalTimeframe = profile.signal.timeframe;
                const contextTimeframes = profile.signal.context === "majority"
                    ? ["H1", "H4", "D1"]
                    : [profile.signal.context.toUpperCase()];

                return [signalTimeframe, ...contextTimeframes];
            }))];
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

    shouldAnalyzeCandle(symbol, profile, candles) {
        const timeframe = profile.signal.timeframe.toLowerCase();
        const signalCandles = candles[timeframe];

        if (!Array.isArray(signalCandles) || signalCandles.length === 0) {
            logger.warn(`[Bot] No ${profile.signal.timeframe} candles for ${symbol}`);

            return false;
        }

        const lastCandle = signalCandles[signalCandles.length - 1];
        const candleId = `${profile.signal.timeframe}:${lastCandle.timestamp}`;

        const analysisKey = `${symbol}:${profile.id ?? "core"}`;

        if (this.lastAnalyzedCandles[analysisKey] === candleId) {
            logger.debug(`[Bot] ${symbol}: ${candleId} already analyzed`);

            return false;
        }

        this.lastAnalyzedCandles[analysisKey] = candleId;

        return true;
    }

    // Analyzes a single symbol: fetches data, calculates indicators, and triggers trading logic.
    async analyzeSymbol(symbol, candleData) {
        logger.info(`\n\n=== Processing ${symbol} ===`);

        const profiles = getStrategyProfiles(symbol);
        const candles = {};

        for (const [tf, prices] of Object.entries(candleData)) {
            if (!Array.isArray(prices) || prices.length < 2) {
                logger.warn(`[Bot] Missing ${tf} candles for ${symbol}`);
                return [];
            }
            candles[tf] = prices.filter((candle) => {
                const closeTime = Date.parse(candle.timestamp) + TIMEFRAME_MINUTES[tf] * 60 * 1000;

                return closeTime <= Date.now();
            });
        }

        const indicators = {};

        await Promise.all(
            Object.entries(candles).map(async ([tf, prices]) => {
                indicators[tf] = await calcIndicators(prices);
            }),
        );

        const { bid, ask } = await this.getBidAsk(symbol);

        const candidates = [];

        for (const profile of profiles) {
            if (!this.shouldAnalyzeCandle(symbol, profile, candles)) continue;

            const candidate = Strategy.getSignal({ symbol, profile, indicators, candles, bid, ask });

            if (!candidate.signal) {
                logger.debug(`[Bot] ${symbol} ${profile.id}: ${candidate.reason}`);
                continue;
            }

            candidates.push({ ...candidate, profile, indicators, candles, bid, ask });
        }

        return candidates;
    }

    async shutdown() {
        this.isRunning = false;
        clearTimeout(this.analysisStartTimeout);
        clearInterval(this.analysisInterval);
        clearInterval(this.sessionRefreshInterval);
        clearInterval(this.sessionPingInterval);
        clearInterval(this.monitorInterval);
    }

    async startMonitorOpenTrades() {
        return startMonitorOpenTrades(this, this.MONITOR_INTERVAL_MS);
    }

    async trailingStopCheck() {
        return trailingStopCheck(this);
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

    async getBidAsk(symbol) {
        const marketDetails = await getMarketDetails(symbol);
        return {
            bid: marketDetails?.snapshot?.bid,
            ask: marketDetails?.snapshot?.offer,
        };
    }

    inSession(currentMinutes, startMinutes, endMinutes, { inclusiveEnd = false } = {}) {
        if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return false;
        if (startMinutes < endMinutes) {
            return currentMinutes >= startMinutes && (inclusiveEnd ? currentMinutes <= endMinutes : currentMinutes < endMinutes);
        }
        return currentMinutes >= startMinutes || (inclusiveEnd ? currentMinutes <= endMinutes : currentMinutes < endMinutes); // Overnight session
    }

    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

const bot = new TradingBot();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if ([0, 6].includes(new Date().getUTCDay())) {
        logger.info("[Bot] It's the weekend. Bot will not start until Monday.");
    } else {
        bot.initialize().catch((error) => {
            logger.error("[bot.js] Bot initialization failed:", error);
            process.exit(1);
        });
    }
}
