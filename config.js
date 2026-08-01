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
    MARGIN_RESERVE_PCT: 0.7,
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
        enabled: false,
        signal: {
            timeframe: "H1",
            context: "h4",
            pattern: "engulfing",
            confirmation: "none",
            minBodyRatio: 0.25,
            session: "london",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "market",
        },
        stop: {
            type: "atr",
            distanceAtr: 2.5,
            minAtr: 0.25,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1.5,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 5,
            maxHoldMinutes: 1440,
            dailyCloseMinute: 1425,
        },
        risk: {
            perTrade: 0.01,
            maxDailyTrades: 5,
            cooldownMinutes: 15,
            lastEntryMinute: 1320,
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
            confirmation: "none",
            minBodyRatio: 0.5,
            session: "all",
            maxSpreadAtr: 0.2,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.2,
            expiryBars: 12,
        },
        stop: {
            type: "atr",
            distanceAtr: 2,
            minAtr: 0.5,
            maxAtr: 3,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 8,
            maxHoldMinutes: 240,
            dailyCloseMinute: 1425,
        },
        risk: {
            perTrade: 0.025,
            maxDailyTrades: 1,
            cooldownMinutes: 15,
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
            context: "h4",
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
            type: "swing4",
            bufferAtr: 0.3,
            minAtr: 0.5,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 1,
            safetyTargetAtr: 10,
            maxHoldMinutes: 240,
            dailyCloseMinute: 1425,
        },
        risk: {
            perTrade: 0.005,
            maxDailyTrades: 1,
            cooldownMinutes: 30,
            lastEntryMinute: 1320,
        },
    },

    EURCHF: {
        enabled: true,
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
            minBodyRatio: 0.25,
            session: "london",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "limit",
            pullbackRatio: 0.5,
            expiryBars: 2,
        },
        stop: {
            type: "atr",
            distanceAtr: 3,
            minAtr: 0.25,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1.5,
            trailDistanceAtr: 1,
            safetyTargetAtr: 10,
            maxHoldMinutes: 480,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.005,
            maxDailyTrades: 1,
            cooldownMinutes: 15,
            lastEntryMinute: 1320,
        },
    },

    EURUSD: {
        enabled: true,
        signal: {
            timeframe: "M15",
            context: "h1",
            pattern: "closeBreak",
            confirmation: "adx_strength",
            adxMin: 10,
            minBodyRatio: 0.5,
            session: "all",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.1,
            expiryBars: 6,
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
        enabled: false,
        signal: {
            timeframe: "H1",
            context: "h4",
            pattern: "closeBreak",
            confirmation: "none",
            minBodyRatio: 0.25,
            session: "overlap",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.05,
            expiryBars: 12,
        },
        stop: {
            type: "atr",
            distanceAtr: 1.5,
            minAtr: 0.25,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 1,
            safetyTargetAtr: 5,
            maxHoldMinutes: 120,
            dailyCloseMinute: 1425,
        },
        risk: {
            perTrade: 0.01,
            maxDailyTrades: 5,
            cooldownMinutes: 15,
            lastEntryMinute: 1320,
        },
    },

    GBPJPY: {
        enabled: true,
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
        enabled: false,
        signal: {
            timeframe: "M5",
            context: "h4",
            pattern: "closeBreak",
            confirmation: "adx_strength",
            adxMin: 10,
            minBodyRatio: 0.5,
            session: "overlap",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.2,
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
            trailDistanceAtr: 1,
            safetyTargetAtr: 10,
            maxHoldMinutes: 240,
            dailyCloseMinute: 1425,
        },
        risk: {
            perTrade: 0.01,
            maxDailyTrades: 1,
            cooldownMinutes: 0,
            lastEntryMinute: 1320,
        },
    },

    NZDUSD: {
        enabled: true,
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

    USDCAD: {
        enabled: true,
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

    AUDUSD: {
        enabled: true,
        signal: {
            timeframe: "M15",
            context: "h1",
            pattern: "flip",
            confirmation: "stochastic_turn",
            stochasticMode: "previousExtreme",
            stochasticLevel: 40,
            minBodyRatio: 0.5,
            session: "all",
            maxSpreadAtr: 0.2,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.2,
            expiryBars: 6,
        },
        stop: {
            type: "atr",
            distanceAtr: 2.5,
            minAtr: 0.5,
            maxAtr: 3,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 10,
            maxHoldMinutes: 1440,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.005,
            maxDailyTrades: 1,
            cooldownMinutes: 30,
            lastEntryMinute: 1200,
        },
    },

    EURAUD: {
        enabled: true,
        signal: {
            timeframe: "M15",
            context: "majority",
            pattern: "flip",
            confirmation: "none",
            minBodyRatio: 0,
            session: "overlap",
            maxSpreadAtr: 0.5,
        },
        entry: {
            type: "stop",
            bufferAtr: 0.2,
            expiryBars: 3,
        },
        stop: {
            type: "atr",
            distanceAtr: 3,
            minAtr: 0.5,
            maxAtr: 4,
        },
        exit: {
            trailActivationAtr: 1,
            trailDistanceAtr: 0.75,
            safetyTargetAtr: 5,
            maxHoldMinutes: 240,
            dailyCloseMinute: 1320,
        },
        risk: {
            perTrade: 0.015,
            maxDailyTrades: 1,
            cooldownMinutes: 15,
            lastEntryMinute: 1200,
        },
    },
};

// export const BEST_ADAPTIVE_HLLH_PROFILE = {
//     enabled: true,
//     strategy: "hllh",
//     setupMode: "aggressive",
//     pivotWindow: 2,
//     signalMode: "simple",
//     entryMode: "entry_on_close",
//     stopVariant: "signal_candle_extreme_with_buffer_2pip",
//     exitVariant: "adaptive_trail_1r_0_5",
//     timeframe: "M15",
//     takeProfitR: 20,
//     safetyTakeProfitR: 20,
//     maxSignalWaitBars: 8,
//     entryBreakMaxBars: 3,
//     minStopDistancePips: 2,
//     avoidHoursUTC: [],
//     maxStopPips: 12,
//     dailyForcedCloseUTC: true,
//     managementProfile: {
//         mode: "adaptive_trail_r",
//         activationR: 1,
//         trailR: 0.5,
//         breakevenR: 1,
//         maxHoldBars: 96,
//         timeframe: "M15",
//     },
//     research: {
//         report: "pa_hllh_m15_portfolio_deep_decision_logs_avg_slip0_overnight0p5_2026-05-03T17-26-35-686Z",
//         portfolioTrades: 1743,
//         winRate: 56.91,
//         profitFactor: 2.44,
//         expectancyR: 0.772,
//         maxDrawdownPct: 22.29,
//         startCapital: 500,
//         endCapital: 6241.53,
//         overnightTradeCount: 0,
//     },
// };
