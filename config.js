import "dotenv/config";

const ENV = process.env;

// API Configuration
export const API = {
    KEY: ENV.API_KEY,
    IDENTIFIER: ENV.API_IDENTIFIER,
    PASSWORD: ENV.API_PASSWORD,
    BASE_URL: `${ENV.BASE_URL}${ENV.API_PATH}`,
    WS_URL: ENV.WS_BASE_URL,
};

export const RISK = {
    PER_TRADE: 0.03,
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
    MAX_POSITIONS: 5,
    MAX_DAILY_LOSS_PCT: 0.1, // need atention
    MAX_WEEKLY_LOSS_PCT: 0.2, // need atention
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

export const SESSIONS_ = {
    all: {
        START: 0,
        END: 24 * 60,
    },
    asia: {
        START: 0,
        END: 8 * 60,
    },
    london: {
        START: 7 * 60,
        END: 17 * 60,
    },
    overlap: {
        START: 12 * 60,
        END: 16 * 60,
    },
    newYork: {
        START: 13 * 60,
        END: 21 * 60,
    },
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
        SYMBOLS: ["AUDUSD", "AUDJPY", "AUDNZD", "NZDUSD", "NZDJPY"],
    },

    TOKYO: {
        START: 0 * 60,
        END: 9 * 60,
        SYMBOLS: ["USDJPY", "AUDJPY", "EURJPY", "GBPJPY", "AUDUSD"],
    },
};

const profile = (signal, entry, stop, exit, risk = {}) => ({
    signal: {
        context: signal.timeframe.toLowerCase(),
        ...signal,
    },

    entry: {
        type: "stop",
        ...entry,
    },

    stop,
    exit,

    risk: {
        perTrade: RISK.PER_TRADE,
        lastEntryMinute: RISK.DAILY_LAST_ENTRY_MINUTE_UTC,
        ...risk,
    },
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
        { maxDailyTrades: 1, cooldownMinutes: 30 },
    ),

    AUDJPY: profile(
        {
            timeframe: "M15",
            trendLookback: 24,
            minTrendAtr: 1.5,
            structure: "move",
            consolidationBars: 2,
            maxPauseAtr: 1.5,
            minBody: 0.2,
            breakout: "none",
            pressure: "flow",
            pressureLevel: 52,
            flowLevel: 0.1,
            location: "bollingerRetest",
            locationAtr: 0,
        },
        { bufferAtr: 0.1, expiryBars: 4 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 2, trailActivationR: 0.7, trailDistanceR: 1, maxHoldMinutes: 240 },
        { maxDailyTrades: 1, cooldownMinutes: 30 },
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
        { maxDailyTrades: 1, cooldownMinutes: 30 },
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
        { maxDailyTrades: 1, cooldownMinutes: 30 },
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
        { maxDailyTrades: 1, cooldownMinutes: 30 },
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
            trendLookback: 16,
            minTrendAtr: 1.5,
            structure: "both",
            consolidationBars: 4,
            maxPauseAtr: 2.25,
            minBody: 0.5,
            breakout: "none",
            pressure: "rsi",
            pressureLevel: 52,
            flowLevel: 0.3,
            location: "bollingerRoom",
            locationAtr: 0,
        },
        { bufferAtr: 0, expiryBars: 4 },
        { type: "signal", bufferAtr: 0.2 },
        { targetR: 5, trailActivationR: 1.5, trailDistanceR: 0.75, maxHoldMinutes: 480 },
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
            trendLookback: 8,
            minTrendAtr: 0.5,
            structure: "both",
            consolidationBars: 2,
            maxPauseAtr: 1,
            minBody: 0.5,
            breakout: "wick",
            pressure: "rsi",
            pressureLevel: 55,
            flowLevel: 0.05,
            location: "bollingerRoom",
            locationAtr: 0.25,
        },
        { bufferAtr: 0.1, expiryBars: 4 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 5, trailActivationR: 2, trailDistanceR: 0.75, maxHoldMinutes: 480 },
    ),

    GBPUSD: profile(
        {
            timeframe: "M15",
            trendLookback: 24,
            minTrendAtr: 0.5,
            structure: "move",
            consolidationBars: 2,
            maxPauseAtr: 2.25,
            minBody: 0.2,
            breakout: "none",
            pressure: "rsi",
            pressureLevel: 55,
            flowLevel: 0.1,
            location: "localLevel",
            locationAtr: 0.5,
        },
        { bufferAtr: 0, expiryBars: 4 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 5, trailActivationR: 0.7, trailDistanceR: 1.5, maxHoldMinutes: 480 },
        { maxDailyTrades: 1, cooldownMinutes: 30 },
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
        { maxDailyTrades: 1, cooldownMinutes: 30 },
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
        { maxDailyTrades: 1, cooldownMinutes: 30 },
    ),
    AUDNZD: profile(
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
        { maxDailyTrades: 1, cooldownMinutes: 30 },
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
        { maxDailyTrades: 1, cooldownMinutes: 30 },
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
        { maxDailyTrades: 1, cooldownMinutes: 30 },
    ),

    USDJPY: profile(
        {
            timeframe: "M15",
            trendLookback: 12,
            minTrendAtr: 0.5,
            structure: "halves",
            consolidationBars: 3,
            maxPauseAtr: 2.25,
            minBody: 0.2,
            breakout: "none",
            pressure: "flow",
            pressureLevel: 50,
            flowLevel: 0.2,
            location: "localLevel",
            locationAtr: 0,
        },
        { bufferAtr: 0.1, expiryBars: 1 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 3, trailActivationR: 2, trailDistanceR: 1.5, maxHoldMinutes: 1440 },
        { maxDailyTrades: 1, cooldownMinutes: 30 },
    ),
};
