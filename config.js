import "dotenv/config";
import { STRATEGY_2_PROFILES } from "./strategies/strategy_2.js";

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
    MAX_POSITIONS: 1,
    MAX_POSITIONS_PER_SYMBOL: 1,
    MAX_DAILY_LOSS_PCT: 0.1,
    MAX_WEEKLY_LOSS_PCT: 0.2,
    MARGIN_USAGE: 0.9,
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
    asiaCore: {
        START: 0,
        END: 7 * 60,
    },
    londonCore: {
        START: 7 * 60,
        END: 13 * 60,
    },
    newYorkCore: {
        START: 13 * 60,
        END: 20 * 60,
    },
};

export const PROFILES = STRATEGY_2_PROFILES;
