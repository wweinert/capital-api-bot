import "dotenv/config";

const ENV = process.env;

export const TRADING_STRATEGY_MODE = ENV.TRADING_STRATEGY_MODE || "intraday_lab";
export const DEFAULT_INTRADAY_PROFILE_ID = "intraday_15012_5bcdee846128";
export const EXECUTION = {
    MODE: ENV.TRADING_EXECUTION_MODE || "live",
    ALLOW_INTRADAY_LIVE_ORDERS: ENV.ALLOW_INTRADAY_LIVE_ORDERS === "true",
};

export const MODEL_DECISION = {
    ENABLED: ENV.MODEL_DECISION_ENABLED === "true",
    MODE: ENV.MODEL_DECISION_MODE || "disabled",
    ENDPOINT_URL: ENV.MODEL_ENDPOINT_URL || "",
    API_KEY: ENV.MODEL_API_KEY || "",
    FORECAST_TTL_MINUTES: Number(ENV.MODEL_FORECAST_TTL_MINUTES || 30),
    MIN_FORECAST_CONFIDENCE: Number(ENV.MODEL_MIN_FORECAST_CONFIDENCE || 0.6),
    MIN_SIGNAL_CONFIDENCE: Number(ENV.MODEL_MIN_SIGNAL_CONFIDENCE || 0.65),
    MIN_EXPECTED_R: Number(ENV.MODEL_MIN_EXPECTED_R || 0.5),
    REQUEST_TIMEOUT_MS: Number(ENV.MODEL_REQUEST_TIMEOUT_MS || 8000),
    ALLOW_MOCK: ENV.MODEL_ALLOW_MOCK === "true",
};

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

export const INTRADAY_PROFILES = {
    intraday_15012_5bcdee846128: {
        id: "intraday_15012_5bcdee846128",
        source: "research/intraday/candidates/aggressiveIntraday/best-endCapital__intraday_15012_5bcdee846128.json",
        strategyFamily: {
            family: "momentum_continuation",
            impulseAtrMultiplier: 1.25,
            followThroughBars: 2,
            avoidAfterTooLargeCandle: true,
        },
        entryProfile: {
            signalTimeframe: "M15",
            executionTimeframe: "M5",
            entryMode: "next_open",
            entryWindowBars: 12,
            pullbackPips: 3,
            breakoutBufferPips: 1.5,
            momentumAtrMultiplier: 0.35,
            stopBufferPips: 1,
        },
        exitProfile: {
            kind: "adaptive_r_trail",
            stopModel: "fixed_pips",
            stopAtrMultiplier: 1.2,
            stopPips: 10,
            minStopPips: 3,
            maxStopPips: 18,
            noOvernight: true,
            tpR: 5,
            activationR: 0.5,
            trailR: 1.5,
            breakevenR: 1.2,
        },
        managementProfile: {
            kind: "session_flat",
            closeBeforeSessionEndMinutes: 30,
            maxHoldBars: 48,
        },
        riskProfile: {
            kind: "aggressive_guarded_3pct",
            riskPerTrade: 0.03,
            maxPositions: 1,
            maxTradesPerDay: 16,
            maxTradesPerSymbolPerDay: 4,
            dailyStopLossPct: 0.14,
            dailyTakeProfitLockPct: 0.24,
            stopAfterLosses: 6,
            reduceRiskAfterDrawdownPct: 35,
            reducedRiskMultiplier: 0.75,
            marginCapPct: 0.75,
        },
        symbols: [
            "AUDCAD",
            "AUDJPY",
            "AUDUSD",
            "EURAUD",
            "EURCHF",
            "EURGBP",
            "EURJPY",
            "EURUSD",
            "GBPAUD",
            "GBPCHF",
            "GBPJPY",
            "GBPUSD",
            "NZDJPY",
            "NZDUSD",
            "USDCAD",
            "USDCHF",
            "USDJPY",
        ],
        metrics: {
            trades: 947,
            winRate: 66,
            profitFactor: 1.544,
            expectancyR: 0.2256,
            maxDrawdownPct: 28.69,
            startCapital: 500,
            endCapital: 160469.94,
            rawPnl: 159969.94,
            averageHoldBars: 7.19,
            days: 90,
        },
        riskFlags: [
            "very_interesting",
            "reliability_bonus",
            "live_parity_risk",
            "same_candle_ambiguity_conservative",
            "execution_timeframe_fallback_signal_tf",
        ],
    },
    intraday_09473_be83a91c4f2b: {
        id: "intraday_09473_be83a91c4f2b",
        source: "research/intraday/candidates/aggressiveIntraday/best-maxDD-lt60__intraday_09473_be83a91c4f2b.json",
        strategyFamily: {
            family: "session_momentum",
            session: "ny",
            minAtrPct: 0,
            trendFilter: "ema8_20",
        },
        entryProfile: {
            timeframe: "M15",
            entryMode: "next_open",
        },
        exitProfile: {
            kind: "adaptive_r_trail",
            stopModel: "fixed_pips",
            stopAtrMultiplier: 1.5,
            stopPips: 6,
            minStopPips: 2,
            maxStopPips: 35,
            noOvernight: true,
            tpR: null,
            activationR: 0.5,
            trailR: 1,
            breakevenR: 1.2,
        },
        managementProfile: {
            kind: "protect_profit",
            minProfitR: 2,
            givebackPct: 0.6,
        },
        riskProfile: {
            kind: "aggressive_3pct",
            riskPerTrade: 0.03,
            maxPositions: 1,
            maxTradesPerDay: 12,
            maxTradesPerSymbolPerDay: 3,
            dailyStopLossPct: 0.09,
            dailyTakeProfitLockPct: 0.16,
            stopAfterLosses: 5,
            reduceRiskAfterDrawdownPct: 25,
            reducedRiskMultiplier: 0.7,
        },
        symbols: [
            "AUDCAD",
            "AUDJPY",
            "AUDUSD",
            "EURAUD",
            "EURCHF",
            "EURGBP",
            "EURJPY",
            "EURUSD",
            "GBPAUD",
            "GBPCHF",
            "GBPJPY",
            "GBPUSD",
            "NZDJPY",
            "NZDUSD",
            "USDCAD",
            "USDCHF",
            "USDJPY",
        ],
        metrics: {
            trades: 542,
            winRate: 65.68,
            profitFactor: 1.575,
            expectancyR: 0.3004,
            maxDrawdownPct: 41.65,
            startCapital: 500,
            endCapital: 33008.39,
            rawPnl: 32508.39,
            averageHoldBars: 1.9,
            days: 90,
        },
        riskFlags: ["very_interesting", "reliability_bonus", "elevated_drawdown", "live_parity_risk"],
    },
};

export const ACTIVE_INTRADAY_PROFILE = INTRADAY_PROFILES[DEFAULT_INTRADAY_PROFILE_ID];
const IS_INTRADAY_LAB_MODE = TRADING_STRATEGY_MODE === "intraday_lab";

export const RISK = {
    PER_TRADE: IS_INTRADAY_LAB_MODE ? ACTIVE_INTRADAY_PROFILE.riskProfile.riskPerTrade : 0.03,
    MAX_POSITIONS: IS_INTRADAY_LAB_MODE ? ACTIVE_INTRADAY_PROFILE.riskProfile.maxPositions : 1,
    MARGIN_CAP_PCT: IS_INTRADAY_LAB_MODE ? ACTIVE_INTRADAY_PROFILE.riskProfile.marginCapPct || 0.75 : 0.75,
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

const HLLH_PORTFOLIO_SYMBOLS = Object.entries(HLLH_SYMBOL_PROFILES)
    .filter(([, profile]) => profile.enabled)
    .map(([symbol]) => symbol);
const PORTFOLIO_SYMBOLS = IS_INTRADAY_LAB_MODE ? ACTIVE_INTRADAY_PROFILE.symbols : HLLH_PORTFOLIO_SYMBOLS;

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
