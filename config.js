import "dotenv/config";

const ENV = process.env;

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
    WEEKEND_FLAT: true,
    DYNAMIC_TRAIL_MIN_R: 1,
    DYNAMIC_TRAIL_DISTANCE_R: 0.35,
};

export const PORTFOLIO = {
    MAX_POSITIONS: 1,
    MARGIN_USAGE: 0.9,
    MAX_DAILY_LOSS_PCT: 0.1,
    MAX_WEEKLY_LOSS_PCT: 0.2,
};

export const TIMEFRAMES = {
    D1: "DAY",
    H4: "HOUR_4",
    H1: "HOUR",
    M15: "MINUTE_15",
    M5: "MINUTE_5",
    M1: "MINUTE",
};

export const DEV = {
    INTERVAL: 60 * 1000,
    MODE: false,
};

export const SESSIONS = {
    sydney: {
        START: "22:00",
        END: "07:00",
        SYMBOLS: ["USDJPY", "GBPUSD", "AUDJPY", "EURUSD", "USDCHF"],
    },
    tokyo: {
        START: "00:00",
        END: "09:00",
        SYMBOLS: ["USDCHF", "AUDUSD", "EURJPY", "EURUSD", "AUDJPY"],
    },
    london: {
        START: "08:00",
        END: "17:00",
        SYMBOLS: ["EURUSD", "GBPUSD", "AUDUSD", "GBPCHF", "USDCHF"],
    },
    newYork: {
        START: "13:00",
        END: "21:00",
        SYMBOLS: ["USDJPY", "GBPUSD", "AUDUSD", "AUDJPY", "EURJPY"],
    },
};
