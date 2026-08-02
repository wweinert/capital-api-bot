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
    MAX_POSITIONS: 3,
    MARGIN_RESERVE_PCT: 1,
    MAX_HOLD_TIME: 24 * 60,
    DAILY_FORCED_CLOSE_UTC: true,
    DAILY_LAST_ENTRY_MINUTE_UTC: 22 * 60,
    DAILY_CLOSE_MINUTE_UTC: 22 * 60,
    FRIDAY_LAST_ENTRY_HOUR_UTC: 18,
    FRIDAY_CLOSE_HOUR_UTC: 20,
    REQUIRED_SCORE: 3,
    WEEKEND_FLAT: true,
};

export const PORTFOLIO = {
    MAX_POSITIONS: 3,
    MAX_POSITIONS_PER_SYMBOL: 1,
    MAX_DAILY_TRADES: 5,
    MAX_DAILY_LOSS_PCT: 0.1,
    MAX_WEEKLY_LOSS_PCT: 0.2,
    MAX_LOSS_STREAK: 5,
};

const TIMEFRAMES = {
    D1: "DAY", // Daily trend direction
    H4: "HOUR_4", // 4-hour trend direction
    H1: "HOUR", // 1-hour entry timeframe
    M15: "MINUTE_15", // 15-minute entry timeframe
    M5: "MINUTE_5", // 5-minute entry timeframe
    M1: "MINUTE", // 1-minute entry timeframe
};

const EMA = {
    TREND: {
        FAST: 50,
        SLOW: 200,
    },
    ENTRY: {
        FAST: 9,
        SLOW: 21,
    },
};
// Technical Analysis Configuration
export const ANALYSIS = {
    TIMEFRAMES,
    EMA,
};

// Development overrides for faster testing
export const DEV = {
    INTERVAL: 60 * 1000, // 60 seconds between analyses for live-safe HLLH polling
    MODE: false,
};

export const SESSIONS = {
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
        END: 13 * 60,
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

export const PROFILES = {
    AUDCAD: {
        enabled: true,
        signal: {
            timeframe: "M15",
            context: "d1",
            pattern: "engulfing",
            confirmation: "rsi_pullback",
            rsiPullbackLevel: 50,
            minBodyRatio: 0,
            session: "asia",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "market",
        },
        stop: {
            type: "swing2",
            distanceAtr: 0.75,
            bufferAtr: 0.3,
            minAtr: 0.75,
            maxAtr: 1.5,
        },
        exit: {
            trailActivationAtr: 2,
            trailDistanceAtr: 3,
            safetyTargetAtr: 8,
            maxHoldMinutes: 480,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.03,
            maxDailyTrades: 3,
            cooldownMinutes: 0,
            lastEntryMinute: 1200,
        },
    },

    AUDJPY: {
        enabled: false,
        signal: {
            timeframe: "H1",
            context: "h4",
            pattern: "flip",
            confirmation: "none",
            minBodyRatio: 0,
            session: "all",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "market",
        },
        stop: {
            type: "atr",
            distanceAtr: 3,
            minAtr: 0.75,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 5,
            maxHoldMinutes: 1440,
            dailyCloseMinute: 1425,
        },
        risk: {
            perTrade: 0.015,
            maxDailyTrades: 1,
            cooldownMinutes: 60,
            lastEntryMinute: 1320,
        },
    },

    AUDUSD: {
        enabled: true,
        signal: {
            timeframe: "M5",
            context: "h1",
            pattern: "flip",
            confirmation: "adx_strength",
            adxMin: 20,
            minBodyRatio: 0.25,
            session: "all",
            maxSpreadAtr: 0.2,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.2,
            expiryBars: 3,
        },
        stop: {
            type: "atr",
            distanceAtr: 1.5,
            bufferAtr: 0.1,
            minAtr: 0.5,
            maxAtr: 3,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 2.5,
            safetyTargetAtr: 8,
            maxHoldMinutes: 240,
            dailyCloseMinute: 1425,
        },
        risk: {
            perTrade: 0.025,
            maxDailyTrades: 1,
            cooldownMinutes: 60,
            lastEntryMinute: 1320,
        },
    },

    BTCUSD: {
        enabled: false,
        signal: {
            timeframe: "H1",
            context: "majority",
            pattern: "flip",
            confirmation: "none",
            minBodyRatio: 0,
            session: "all",
            maxSpreadAtr: 0.3,
        },
        entry: {
            type: "market",
        },
        stop: {
            type: "atr",
            distanceAtr: 3,
            minAtr: 0.75,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 10,
            maxHoldMinutes: 1440,
            dailyCloseMinute: 1425,
        },
        risk: {
            perTrade: 0.01,
            maxDailyTrades: 1,
            cooldownMinutes: 15,
            lastEntryMinute: 1320,
        },
    },

    ETHUSD: {
        enabled: false,
        signal: {
            timeframe: "H1",
            context: "h1",
            pattern: "flip",
            confirmation: "none",
            minBodyRatio: 0,
            session: "all",
            maxSpreadAtr: 0.2,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.1,
            expiryBars: 3,
        },
        stop: {
            type: "swing4",
            bufferAtr: 0.2,
            minAtr: 0.25,
            maxAtr: 3,
        },
        exit: {
            trailActivationAtr: 1.5,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 10,
            maxHoldMinutes: 480,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.005,
            maxDailyTrades: 5,
            cooldownMinutes: 0,
            lastEntryMinute: 1200,
        },
    },

    EURAUD: {
        enabled: true,
        signal: {
            timeframe: "H1",
            context: "h1",
            pattern: "flip",
            confirmation: "adx_strength",
            adxMin: 15,
            minBodyRatio: 0,
            session: "overlap",
            maxSpreadAtr: 0.3,
        },
        entry: {
            type: "market",
        },
        stop: {
            type: "swing2",
            distanceAtr: 3,
            bufferAtr: 0.3,
            minAtr: 0.5,
            maxAtr: 1.5,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 1.5,
            safetyTargetAtr: 10,
            maxHoldMinutes: 240,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.03,
            maxDailyTrades: 5,
            cooldownMinutes: 0,
            lastEntryMinute: 1200,
        },
    },

    EURCHF: {
        enabled: false,
        signal: {
            timeframe: "H1",
            context: "h4",
            pattern: "flip",
            confirmation: "none",
            minBodyRatio: 0,
            session: "london",
            maxSpreadAtr: 0.3,
        },
        entry: {
            type: "limit",
            pullbackRatio: 0.25,
            expiryBars: 12,
        },
        stop: {
            type: "atr",
            distanceAtr: 2,
            minAtr: 0.5,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 2.5,
            trailDistanceAtr: 1.5,
            safetyTargetAtr: 8,
            maxHoldMinutes: 480,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.015,
            maxDailyTrades: 5,
            cooldownMinutes: 0,
            lastEntryMinute: 1200,
        },
    },

    EURGBP: {
        enabled: true,
        signal: {
            timeframe: "M15",
            context: "h4",
            pattern: "flip",
            confirmation: "none",
            indicatorPair: "ema_adx",
            emaMode: "fast",
            rsiLevel: 50,
            adxMin: 20,
            minBodyRatio: 0.25,
            session: "london",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "limit",
            pullbackRatio: 0.5,
            expiryBars: 6,
        },
        stop: {
            type: "atr",
            distanceAtr: 3,
            bufferAtr: 0.1,
            minAtr: 0.75,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 3,
            trailDistanceAtr: 2.5,
            safetyTargetAtr: 8,
            maxHoldMinutes: 480,
            dailyCloseMinute: 1425,
        },
        risk: {
            perTrade: 0.03,
            maxDailyTrades: 2,
            cooldownMinutes: 0,
            lastEntryMinute: 1320,
        },
    },

    EURUSD: {
        enabled: true,
        signal: {
            timeframe: "M15",
            context: "h1",
            pattern: "flip",
            confirmation: "rsi_pullback",
            indicatorPair: "ema_adx",
            emaMode: "fast",
            rsiLevel: 50,
            rsiPullbackLevel: 50,
            adxMin: 15,
            minBodyRatio: 0,
            session: "all",
            maxSpreadAtr: 0.2,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.1,
            expiryBars: 3,
        },
        stop: {
            type: "atr",
            distanceAtr: 2.5,
            bufferAtr: 0,
            minAtr: 0.75,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 3,
            trailDistanceAtr: 2,
            safetyTargetAtr: 10,
            maxHoldMinutes: 1440,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.03,
            maxDailyTrades: 1,
            cooldownMinutes: 0,
            lastEntryMinute: 1200,
        },
    },

    GBPCHF: {
        enabled: true,
        signal: {
            timeframe: "H1",
            context: "h4",
            pattern: "closeBreak",
            confirmation: "none",
            adxMin: 30,
            minBodyRatio: 0.5,
            session: "newYork",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "limit",
            pullbackRatio: 0.25,
            expiryBars: 2,
        },
        stop: {
            type: "swing4",
            distanceAtr: 1,
            bufferAtr: 0.2,
            minAtr: 0.75,
            maxAtr: 2,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 2,
            safetyTargetAtr: 5,
            maxHoldMinutes: 240,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.025,
            maxDailyTrades: 2,
            cooldownMinutes: 0,
            lastEntryMinute: 1200,
        },
    },

    GBPJPY: {
        enabled: false,
        signal: {
            timeframe: "M5",
            context: "h1",
            pattern: "flip",
            confirmation: "rsi_momentum",
            rsiMomentumLevel: 50,
            minBodyRatio: 0,
            session: "london",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.1,
            expiryBars: 12,
        },
        stop: {
            type: "swing4",
            bufferAtr: 0.3,
            minAtr: 0.75,
            maxAtr: 3,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 10,
            maxHoldMinutes: 120,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.005,
            maxDailyTrades: 1,
            cooldownMinutes: 30,
            lastEntryMinute: 1320,
        },
    },

    GBPUSD: {
        enabled: true,
        signal: {
            timeframe: "M5",
            context: "h4",
            pattern: "closeBreak",
            confirmation: "adx_strength",
            adxMin: 10,
            minBodyRatio: 0,
            session: "london",
            maxSpreadAtr: 0.3,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.2,
            expiryBars: 3,
        },
        stop: {
            type: "atr",
            distanceAtr: 2.5,
            bufferAtr: 0.2,
            minAtr: 0.25,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 2,
            trailDistanceAtr: 1,
            safetyTargetAtr: 10,
            maxHoldMinutes: 240,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.03,
            maxDailyTrades: 1,
            cooldownMinutes: 0,
            lastEntryMinute: 1200,
        },
    },

    NZDUSD: {
        enabled: false,
        signal: {
            timeframe: "H1",
            context: "h4",
            pattern: "flip",
            confirmation: "none",
            minBodyRatio: 0,
            session: "all",
            maxSpreadAtr: 0.3,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.05,
            expiryBars: 1,
        },
        stop: {
            type: "atr",
            distanceAtr: 2,
            minAtr: 0.5,
            maxAtr: 3,
        },
        exit: {
            trailActivationAtr: 2,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 5,
            maxHoldMinutes: 240,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.005,
            maxDailyTrades: 1,
            cooldownMinutes: 15,
            lastEntryMinute: 1200,
        },
    },

    NZDJPY: {
        enabled: true,
        signal: {
            timeframe: "M15",
            context: "majority",
            pattern: "engulfing",
            confirmation: "stochastic_turn",
            stochasticMode: "previousExtreme",
            stochasticLevel: 35,
            minBodyRatio: 0.25,
            session: "asia",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.1,
            expiryBars: 2,
        },
        stop: {
            type: "signal",
            distanceAtr: 2,
            bufferAtr: 0.1,
            minAtr: 0.75,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 1,
            safetyTargetAtr: 10,
            maxHoldMinutes: 1440,
            dailyCloseMinute: 1440,
        },
        risk: {
            perTrade: 0.03,
            maxDailyTrades: 1,
            cooldownMinutes: 0,
            lastEntryMinute: 1440,
        },
    },

    USDCAD: {
        enabled: false,
        signal: {
            timeframe: "M15",
            context: "h1",
            pattern: "flip",
            confirmation: "none",
            minBodyRatio: 0,
            session: "overlap",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "market",
        },
        stop: {
            type: "atr",
            distanceAtr: 3,
            minAtr: 0.75,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 8,
            maxHoldMinutes: 480,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.005,
            maxDailyTrades: 1,
            cooldownMinutes: 30,
            lastEntryMinute: 1320,
        },
    },
    USDJPY: {
        enabled: false,
        signal: {
            timeframe: "H1",
            context: "h1",
            pattern: "flip",
            confirmation: "none",
            minBodyRatio: 0,
            session: "overlap",
            maxSpreadAtr: 0.2,
        },
        entry: {
            type: "market",
        },
        stop: {
            type: "atr",
            distanceAtr: 3,
            minAtr: 0.75,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 1,
            safetyTargetAtr: 5,
            maxHoldMinutes: 120,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.03,
            maxDailyTrades: 2,
            cooldownMinutes: 60,
            lastEntryMinute: 1200,
        },
    },
};
