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
    LONDON: ["GBPAUD", "EURAUD", "EURJPY", "GBPUSD"],
    NY: ["GBPAUD", "EURAUD", "EURJPY", "GBPUSD"],
    SYDNEY: ["GBPAUD", "EURAUD", "EURJPY", "GBPUSD"],
    TOKYO: ["GBPAUD", "EURAUD", "EURJPY", "GBPUSD"],
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
    MAX_HOLD_TIME: 24 * 60, // minutes; daily forced flat should normally close M15 trades before this fallback
    DAILY_FORCED_CLOSE_UTC: true,
    DAILY_LAST_ENTRY_MINUTE_UTC: 23 * 60 + 30,
    DAILY_CLOSE_MINUTE_UTC: 23 * 60 + 50,
    WEEKEND_FLAT: true,
    FRIDAY_LAST_ENTRY_HOUR_UTC: 18,
    FRIDAY_CLOSE_HOUR_UTC: 20,
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

const BEST_ADAPTIVE_HLLH_PROFILE = {
    enabled: true,
    setupMode: "aggressive",
    pivotWindow: 2,
    signalMode: "simple",
    entryMode: "entry_on_close",
    stopVariant: "signal_candle_extreme_with_buffer_2pip",
    exitVariant: "adaptive_trail_1r_0_5",
    timeframe: "M15",
    takeProfitR: 20,
    safetyTakeProfitR: 20,
    maxSignalWaitBars: 8,
    entryBreakMaxBars: 3,
    avoidHoursUTC: [],
    maxStopPips: 12,
    dailyForcedCloseUTC: true,
    managementProfile: {
        mode: "adaptive_trail_r",
        activationR: 1,
        trailR: 0.5,
        breakevenR: 1,
        maxHoldBars: 96,
        timeframe: "M15",
    },
    research: {
        report: "pa_hllh_m15_portfolio_deep_decision_logs_avg_slip0_overnight0p5_2026-05-03T17-26-35-686Z",
        portfolioTrades: 1743,
        winRate: 56.91,
        profitFactor: 2.44,
        expectancyR: 0.772,
        maxDrawdownPct: 22.29,
        startCapital: 500,
        endCapital: 6241.53,
        overnightTradeCount: 0,
    },
};

export const HLLH_SYMBOL_PROFILES = {
    GBPAUD: {
        ...BEST_ADAPTIVE_HLLH_PROFILE,
        research: { ...BEST_ADAPTIVE_HLLH_PROFILE.research, symbolTrades: 352 },
    },
    EURAUD: {
        ...BEST_ADAPTIVE_HLLH_PROFILE,
        research: { ...BEST_ADAPTIVE_HLLH_PROFILE.research, symbolTrades: 529 },
    },
    EURJPY: {
        ...BEST_ADAPTIVE_HLLH_PROFILE,
        research: { ...BEST_ADAPTIVE_HLLH_PROFILE.research, symbolTrades: 473 },
    },
    GBPUSD: {
        ...BEST_ADAPTIVE_HLLH_PROFILE,
        research: { ...BEST_ADAPTIVE_HLLH_PROFILE.research, symbolTrades: 389 },
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


// M15 close + 5 seconds
export const PROD = {
    INTERVAL: ((15 - (new Date().getMinutes() % 15)) * 60 - new Date().getSeconds()) * 1000 - new Date().getMilliseconds() + 5000,
};
