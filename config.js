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

// Trading Sessions (UTC times)
const SESSION_SYMBOLS = {
    LONDON: ["EURUSD", "GBPUSD", "EURGBP", "USDCHF"],
    NY: ["EURUSD", "GBPUSD", "USDJPY", "USDCAD", "EURGBP"],
    SYDNEY: ["AUDUSD", "NZDUSD", "AUDJPY", "NZDJPY"],
    TOKYO: ["USDJPY", "EURJPY", "AUDJPY", "AUDUSD", "NZDUSD"],
};

// export const CRYPTO_SYMBOLS = ["BTCUSD", "BTCEUR", "SOLUSD", "XRPUSD", "DOGEUSD", "ADAUSD"];
export const SESSIONS = {
    LONDON: {
        START: "08:00",
        END: "17:00",
        SYMBOLS: SESSION_SYMBOLS.LONDON,
    },
    NY: {
        START: "13:00",
        END: "21:00",
        SYMBOLS: SESSION_SYMBOLS.NY,
    },
    SYDNEY: {
        START: "22:00",
        END: "07:00",
        SYMBOLS: SESSION_SYMBOLS.SYDNEY,
    },
    TOKYO: {
        START: "00:00",
        END: "09:00",
        SYMBOLS: SESSION_SYMBOLS.TOKYO,
    }
};

export const RISK = {
    PER_TRADE: 0.03, // HLLH approved candidate: 3% risk per trade
    MAX_POSITIONS: 1, // HLLH approved candidate: max 1 simultaneous position
    MAX_HOLD_TIME: 2880, // HLLH aggressive TP4 needs room to reach 4R; 620m cut too many H1 trades
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
    SYMBOLS: ["USDCAD", "USDJPY", "USDCHF", "AUDUSD"],
    EMA,
};

// Development overrides for faster testing
export const DEV = {
    INTERVAL: 60 * 1000, // 60 seconds between analyses for live-safe HLLH polling
    MODE: false,
};


// 5 min
export const PROD = {
    INTERVAL: ((60 - (new Date().getMinutes() % 5)) * 60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds() + 5000,
};
