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
    LONDON: ["GBPJPY", "USDJPY", "AUDJPY", "EURJPY", "NZDJPY", "NZDUSD", "AUDCAD"],
    NY: ["GBPJPY", "USDJPY", "AUDJPY", "EURJPY", "NZDJPY", "NZDUSD", "AUDCAD"],
    SYDNEY: ["GBPJPY", "USDJPY", "AUDJPY", "EURJPY", "NZDJPY", "NZDUSD", "AUDCAD"],
    TOKYO: ["GBPJPY", "USDJPY", "AUDJPY", "EURJPY", "NZDJPY", "NZDUSD", "AUDCAD"],
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

export const HLLH_SYMBOL_PROFILES = {
    AUDJPY: {
        enabled: true,
        setupMode: "aggressive",
        pivotWindow: 2,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_buffer_2pip",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 8,
        avoidHoursUTC: [],
        maxStopPips: 12,
        research: { trades: 134, winRate: 43.28, profitFactor: 3.09, expectancyR: 1.172, totalR: 157 },
    },
    NZDJPY: {
        enabled: true,
        setupMode: "aggressive",
        pivotWindow: 2,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_buffer_2pip",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 11,
        avoidHoursUTC: [],
        maxStopPips: 12,
        research: { trades: 158, winRate: 39.24, profitFactor: 2.56, expectancyR: 0.943, totalR: 149.02 },
    },
    AUDCAD: {
        enabled: true,
        setupMode: "aggressive",
        pivotWindow: 2,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_buffer_2pip",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 11,
        avoidHoursUTC: [],
        maxStopPips: 12,
        research: { trades: 166, winRate: 37.35, profitFactor: 2.43, expectancyR: 0.866, totalR: 143.79 },
    },
    USDJPY: {
        enabled: true,
        setupMode: "aggressive",
        pivotWindow: 2,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_buffer_2pip",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 8,
        avoidHoursUTC: [],
        maxStopPips: 12,
        research: { trades: 125, winRate: 40, profitFactor: 2.72, expectancyR: 1.012, totalR: 126.48 },
    },
    NZDUSD: {
        enabled: true,
        setupMode: "aggressive",
        pivotWindow: 2,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_buffer_3pip",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 8,
        avoidHoursUTC: [0, 10, 21, 22, 23],
        maxStopPips: 12,
        research: { trades: 121, winRate: 33.06, profitFactor: 1.98, expectancyR: 0.656, totalR: 79.35 },
    },
    USDCAD: {
        enabled: true,
        setupMode: "aggressive",
        pivotWindow: 2,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_buffer_2pip",
        exitVariant: "fixed_r_3",
        takeProfitR: 3,
        maxSignalWaitBars: 14,
        avoidHoursUTC: [],
        maxStopPips: 12,
        research: { trades: 155, winRate: 38.06, profitFactor: 1.85, expectancyR: 0.517, totalR: 80.2 },
    },
    AUDUSD: {
        enabled: true,
        setupMode: "confirmed",
        pivotWindow: 2,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_buffer_2pip",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 11,
        avoidHoursUTC: [],
        maxStopPips: 25,
        research: { trades: 93, winRate: 36.56, profitFactor: 2.16, expectancyR: 0.735, totalR: 68.4 },
    },
    USDCHF: {
        enabled: true,
        setupMode: "aggressive",
        pivotWindow: 3,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_range_buffer_40",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 11,
        avoidHoursUTC: [0, 10, 18, 21, 22, 23],
        maxStopPips: 17.39,
        research: { trades: 88, winRate: 34.09, profitFactor: 1.93, expectancyR: 0.589, totalR: 51.8 },
    },
    GBPCHF: {
        enabled: true,
        setupMode: "confirmed",
        pivotWindow: 3,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_buffer_3pip",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 8,
        avoidHoursUTC: [0, 1, 2, 3, 4, 5, 6, 7, 10, 18, 19, 20, 21, 22, 23],
        maxStopPips: 12,
        research: { trades: 20, winRate: 65, profitFactor: 7.67, expectancyR: 2.107, totalR: 42.14 },
    },
    EURCHF: {
        enabled: true,
        setupMode: "aggressive",
        pivotWindow: 3,
        signalMode: "simple",
        stopVariant: "signal_candle_extreme_with_buffer_2pip",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 11,
        avoidHoursUTC: [0, 1, 2, 3, 4, 5, 6, 7, 10, 18, 19, 20, 21, 22, 23],
        maxStopPips: 12,
        research: { trades: 53, winRate: 32.08, profitFactor: 1.65, expectancyR: 0.443, totalR: 23.46 },
    },
    EURGBP: {
        enabled: false,
        setupMode: "confirmed",
        pivotWindow: 2,
        signalMode: "simple",
        stopVariant: "structure_pivot_with_buffer_1pip",
        exitVariant: "fixed_r_4",
        takeProfitR: 4,
        maxSignalWaitBars: 8,
        avoidHoursUTC: [0, 1, 2, 3, 4, 5, 6, 7, 10, 18, 19, 20, 21, 22, 23],
        maxStopPips: 12,
        research: { trades: 23, winRate: 43.48, profitFactor: 1.83, expectancyR: 0.47, totalR: 10.8 },
    },
};

const PORTFOLIO_SYMBOLS = Object.entries(HLLH_SYMBOL_PROFILES)
    .filter(([, profile]) => profile.enabled)
    .map(([symbol]) => symbol);

// Technical Analysis Configuration
export const ANALYSIS = {
    TIMEFRAMES,
    SYMBOLS: PORTFOLIO_SYMBOLS,
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
