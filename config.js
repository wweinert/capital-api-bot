import "dotenv/config";

const ENV = process.env;

// API Configuration
export const API = {
    KEY: ENV.API_KEY,
    IDENTIFIER: ENV.API_IDENTIFIER,
    PASSWORD: ENV.API_PASSWORD,
    BASE_URL: `${ENV.BASE_URL}${ENV.API_PATH}`,
    WS_URL: ENV.WS_BASE_URL,
    DEMO_HOST: "demo-api-capital.backend-capital.com",
};

export const RISK = {
    PER_TRADE: 0.01,
    MAX_DAILY_TRADES_PER_SYMBOL: 1,
    MAX_LOSSES_PER_SYMBOL_DAY: 2,
    COOLDOWN_MINUTES: 30,
    MAX_HOLD_TIME: 24 * 60,
    DAILY_FORCED_CLOSE_UTC: true,
    DAILY_LAST_ENTRY_MINUTE_UTC: 22 * 60,
    DAILY_CLOSE_MINUTE_UTC: 22 * 60,
    FRIDAY_LAST_ENTRY_HOUR_UTC: 18,
    FRIDAY_CLOSE_HOUR_UTC: 20,
    REQUIRED_SCORE: 3,
    WEEKEND_FLAT: true,

    DYNAMIC_TRAIL_MIN_R: 0.7,
    DYNAMIC_TRAIL_DISTANCE_R: 0.35,
    DYNAMIC_TRAIL_STALL_MINUTES: 45,
};

export const PORTFOLIO = {
    // Only the fixed-exit profile that passed nominal and spread-stress
    // development gates is enabled for demo forward observation.
    SYMBOLS: ["EURUSD"],
    MAX_POSITIONS: 1,
    MAX_POSITIONS_PER_SYMBOL: 1,
    MAX_DAILY_LOSS_PCT: 0.03,
    MAX_WEEKLY_LOSS_PCT: 0.06,
    MARGIN_USAGE: 0.9,
};

export const TIMEFRAMES = {
    D1: "DAY", // Daily trend direction
    H4: "HOUR_4", // 4-hour trend direction
    H1: "HOUR", // 1-hour entry timeframe
    M15: "MINUTE_15", // 15-minute entry timeframe
    M5: "MINUTE_5", // 5-minute entry timeframe
    M1: "MINUTE", // 1-minute entry timeframe
};

// Development overrides for faster testing
export const DEV = {
    INTERVAL: 60 * 1000, // 60 seconds between analyses for live-safe HLLH polling
    MODE: false,
};

export const SESSIONS = {
    LONDON: {
        START: 7 * 60,
        END: 17 * 60,
        SYMBOLS: ["EURUSD", "GBPUSD", "GBPJPY", "USDCHF", "EURGBP"],
    },

    NY: {
        START: 13 * 60,
        END: 21 * 60,
        SYMBOLS: ["EURUSD", "GBPUSD", "USDCAD", "USDJPY", "AUDUSD"],
    },

    SYDNEY: {
        START: 22 * 60,
        END: 7 * 60,
        SYMBOLS: ["AUDUSD", "AUDJPY", "EURAUD", "NZDUSD", "NZDJPY"],
    },

    TOKYO: {
        START: 0 * 60,
        END: 9 * 60,
        SYMBOLS: ["USDJPY", "AUDJPY", "EURJPY", "GBPJPY", "AUDUSD"],
    },
};

const profile = (signal, entry, stop, exit, strategy = { name: "greenRedContinuation" }) => ({
    strategy,

    signal: {
        maxSpreadAtr: 0.5,
        context: signal.timeframe.toLowerCase(),
        ...signal,
    },

    entry: {
        ...entry,
        type: "stop",
    },

    stop,
    exit,
});

export const PROFILES = {
    AUDCAD: profile(
        {
            timeframe: "M15",
            trendLookback: 12,
            minTrendAtr: 0.5,
            structure: "both",
            consolidationBars: 2,
            maxPauseAtr: 1,
            minBody: 0.2,
            breakout: "close",
            pressure: "rsi",
            pressureLevel: 52,
            flowLevel: 0.1,
            location: "localLevel",
            locationAtr: 0.1,
        },
        { bufferAtr: 0.05, expiryBars: 1 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 5, trailActivationR: 0.7, trailDistanceR: 1, maxHoldMinutes: 240 },
    ),

    AUDJPY: profile(
        {
            timeframe: "M15",
            context: "h1",
            maxSpreadAtr: 0.5,
        },
        {
            bufferAtr: 0,
            expiryBars: 4,
            cancelIfStopTouchedBeforeEntry: true,
        },
        {
            type: "signal",
            bufferAtr: 0.05,
        },
        {
            targetR: 2,
            trailActivationR: 1,
            trailDistanceR: 0.5,
            maxHoldMinutes: 240,
            dailyCloseMinute: 22 * 60,
        },
        {
            name: "audjpyAsiaM15Breakout20H1Rsi",
            londonTimeZone: "Europe/London",
            londonOpenMinute: 8 * 60,
            riskPerTrade: 0.01,
        },
    ),

    AUDUSD: profile(
        {
            timeframe: "M15",
            trendLookback: 24,
            minTrendAtr: 2,
            structure: "move",
            consolidationBars: 3,
            maxPauseAtr: 1.5,
            minBody: 0.2,
            breakout: "none",
            pressure: "rsi",
            pressureLevel: 58,
            flowLevel: 0.05,
            location: "localLevel",
            locationAtr: 0.5,
        },
        { bufferAtr: 0.1, expiryBars: 1 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 4, trailActivationR: 2, trailDistanceR: 0.75, maxHoldMinutes: 480 },
    ),

    EURCHF: profile(
        {
            timeframe: "M15",
            trendLookback: 12,
            minTrendAtr: 2,
            structure: "halves",
            consolidationBars: 2,
            maxPauseAtr: 1,
            minBody: 0.5,
            breakout: "none",
            pressure: "flow",
            pressureLevel: 55,
            flowLevel: 0.05,
            location: "bollingerRoom",
            locationAtr: 0.25,
        },
        { bufferAtr: 0, expiryBars: 4 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 5, trailActivationR: 2, trailDistanceR: 1.5, maxHoldMinutes: 480 },
    ),

    EURGBP: profile(
        {
            timeframe: "M15",
            trendLookback: 8,
            minTrendAtr: 1,
            structure: "both",
            consolidationBars: 3,
            maxPauseAtr: 2.25,
            minBody: 0.2,
            breakout: "wick",
            pressure: "rsi",
            pressureLevel: 58,
            flowLevel: 0.1,
            location: "bollingerRoom",
            locationAtr: 0.5,
        },
        { bufferAtr: 0, expiryBars: 1 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 4, trailActivationR: 2, trailDistanceR: 0.5, maxHoldMinutes: 720 },
    ),

    EURJPY: profile(
        {
            timeframe: "M15",
            trendLookback: 24,
            minTrendAtr: 0.5,
            structure: "move",
            consolidationBars: 2,
            maxPauseAtr: 2.25,
            minBody: 0.2,
            breakout: "none",
            pressure: "flow",
            pressureLevel: 50,
            flowLevel: 0.2,
            location: "bollingerRetest",
            locationAtr: 0.25,
        },
        { bufferAtr: 0.05, expiryBars: 3 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 5, trailActivationR: 0.7, trailDistanceR: 0.75, maxHoldMinutes: 480 },
    ),

    EURUSD: profile(
        {
            timeframe: "M15",
            context: "h1",
            sessions: ["london"],
            h1DirectionBars: 1,
            minH1TrendAtr: 0.1,
            minScore: 0,
            minAtrPercentile: 0.1,
            minEfficiency: 0.05,
            minActivity: 1.25,
            minBodyRatio: 0.3,
            minVolumeRatio: 0.8,
            maxSpreadAtr: 1,
        },
        { bufferAtr: 0, expiryBars: 5, cancelIfStopTouchedBeforeEntry: true },
        { type: "signal", bufferAtr: 0.03 },
        { targetR: 0.75, maxHoldMinutes: 180, dailyCloseMinute: 22 * 60 },
        {
            name: "greenRedContinuation",
            riskPerTrade: 0.01,
            maxDailyTrades: 1,
            cooldownMinutes: 30,
        },
    ),

    GBPAUD: profile(
        {
            timeframe: "M15",
            trendLookback: 24,
            minTrendAtr: 1,
            structure: "both",
            consolidationBars: 4,
            maxPauseAtr: 2.25,
            minBody: 0.5,
            breakout: "close",
            pressure: "rsi",
            pressureLevel: 50,
            flowLevel: 0.05,
            location: "bollingerRetest",
            locationAtr: 0.25,
        },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 2, trailActivationR: 2, trailDistanceR: 1.5, maxHoldMinutes: 240 },
    ),

    GBPCHF: profile(
        {
            timeframe: "M15",
            trendLookback: 16,
            minTrendAtr: 1.5,
            structure: "both",
            consolidationBars: 2,
            maxPauseAtr: 2.25,
            minBody: 0.5,
            breakout: "wick",
            pressure: "rsi",
            pressureLevel: 50,
            flowLevel: 0.05,
            location: "bollingerRoom",
            locationAtr: 0,
        },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 5, trailActivationR: 1, trailDistanceR: 1, maxHoldMinutes: 240 },
    ),

    GBPJPY: profile(
        {
            timeframe: "M15",
            context: "majority",
            maxSpreadAtr: 0.5,
        },
        { bufferAtr: 0, expiryBars: 4, cancelIfStopTouchedBeforeEntry: true },
        { type: "signal", bufferAtr: 0.05 },
        { targetR: 2, maxHoldMinutes: 480, dailyCloseMinute: 22 * 60 },
        {
            name: "gbpjpyLondonStructuralContinuation",

            // London lasts from 08:00 London time until 08:00 New York time.
            // Using both time zones keeps the boundary correct through DST.
            londonTimeZone: "Europe/London",
            newYorkTimeZone: "America/New_York",
            londonOpenMinute: 8 * 60,
            newYorkOpenMinute: 8 * 60,

            // Strong M15 impulse -> pullback -> resumption price action.
            minimumPullbackBars: 1,
            maximumPullbackBars: 6,
            maximumImpulseBars: 6,
            impulseContextBars: 24,
            minImpulseAtr: 1.5,
            minSwingGapAtr: 0.25,
            minSignalBodyAtr: 0.3,
            maxRetrace: 0.65,

            // At least one of H1/H4 must point in the signal direction.
            confirmationFrames: ["H1", "H4"],
            confirmationLookbackBars: 2,
            minimumConfirmations: 1,

            riskPerTrade: 0.03,
            maxRiskPerTrade: 0.03,
            maxDailyTrades: 3,
            cooldownMinutes: 30,
            maxPositions: 1,
        },
    ),

    GBPUSD: profile(
        {
            timeframe: "M15",
            context: "h1",
            sessions: ["overlap"],
            h1DirectionBars: 1,
            minH1TrendAtr: 0.15,
            minScore: 1,
            minAtrPercentile: 0.25,
            minEfficiency: 0.05,
            minActivity: 1,
            minBodyRatio: 0.2,
            minVolumeRatio: 1,
            maxSpreadAtr: 1.25,
        },
        { bufferAtr: 0.01, expiryBars: 5, cancelIfStopTouchedBeforeEntry: true },
        { type: "signal", bufferAtr: 0.03 },
        { targetR: 3, trailActivationR: 0.65, trailDistanceR: 0.65, maxHoldMinutes: 360 },
        {
            name: "greenRedContinuation",
            riskPerTrade: 0.01,
            maxDailyTrades: 1,
            cooldownMinutes: 45,
        },
    ),

    NZDJPY: profile(
        {
            timeframe: "M15",
            trendLookback: 12,
            minTrendAtr: 1,
            structure: "both",
            consolidationBars: 4,
            maxPauseAtr: 1.5,
            minBody: 0.2,
            breakout: "none",
            pressure: "rsi",
            pressureLevel: 52,
            flowLevel: 0.1,
            location: "bollingerRoom",
            locationAtr: 0.1,
        },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 5, trailActivationR: 1, trailDistanceR: 1, maxHoldMinutes: 480 },
    ),

    NZDUSD: profile(
        {
            timeframe: "M15",
            trendLookback: 16,
            minTrendAtr: 1.5,
            structure: "both",
            consolidationBars: 3,
            maxPauseAtr: 1.5,
            minBody: 0.2,
            breakout: "none",
            pressure: "rsi",
            pressureLevel: 55,
            flowLevel: 0.05,
            location: "bollingerRetest",
            locationAtr: 0.5,
        },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0.2 },
        { targetR: 4, trailActivationR: 1, trailDistanceR: 1, maxHoldMinutes: 480 },
    ),
    EURAUD: profile(
        {
            timeframe: "M15",
            context: "h1",
            maxSpreadAtr: 0.5,
        },
        {
            type: "stop",
            bufferAtr: 0,
            expiryBars: 4,
            cancelIfStopTouchedBeforeEntry: true,
        },
        {
            type: "signal",
            bufferAtr: 0.05,
        },
        {
            targetR: 2,
            trailActivationR: 1,
            trailDistanceR: 0.5,
            maxHoldMinutes: 240,
            dailyCloseMinute: 22 * 60,
        },
        {
            name: "euraudSydneyM15BreakoutMomentumH1Macd",
            timeZone: "Australia/Sydney",
            sessionStartMinute: 11 * 60,
            sessionEndMinute: 17 * 60,
            riskPerTrade: 0.01,
        },
    ),

    USDCAD: profile(
        {
            timeframe: "M15",
            trendLookback: 24,
            minTrendAtr: 0.5,
            structure: "move",
            consolidationBars: 2,
            maxPauseAtr: 1,
            minBody: 0.2,
            breakout: "close",
            pressure: "rsi",
            pressureLevel: 52,
            flowLevel: 0.05,
            location: "localLevel",
            locationAtr: 0.5,
        },
        { bufferAtr: 0, expiryBars: 3 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 3, trailActivationR: 1.5, trailDistanceR: 0.5, maxHoldMinutes: 240 },
    ),

    USDCHF: profile(
        {
            timeframe: "M15",
            trendLookback: 12,
            minTrendAtr: 0.5,
            structure: "move",
            consolidationBars: 6,
            maxPauseAtr: 1.5,
            minBody: 0.35,
            breakout: "wick",
            pressure: "flow",
            pressureLevel: 55,
            flowLevel: 0.2,
            location: "bollingerRetest",
            locationAtr: 0.1,
        },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0.2 },
        { targetR: 3, trailActivationR: 1, trailDistanceR: 0.5, maxHoldMinutes: 240 },
    ),

    USDJPY: profile(
        {
            timeframe: "M15",
            sessions: ["london", "overlap"],
            minScore: 1,
            minAtrPercentile: 0.25,
            minEfficiency: 0.25,
            minActivity: 0.75,
            minBodyRatio: 0.2,
            maxSpreadAtr: 1,
        },
        { bufferAtr: 0.02, expiryBars: 2, cancelIfStopTouchedBeforeEntry: true },
        { type: "signal", bufferAtr: 0.03 },
        { targetR: 3, trailActivationR: 0.65, trailDistanceR: 0.65, maxHoldMinutes: 360 },
        { name: "greenRedContinuation", riskPerTrade: 0.01, maxDailyTrades: 2, cooldownMinutes: 45 },
    ),
};
