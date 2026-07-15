import "dotenv/config";

// API Configuration
export const API = {
  KEY: process.env.API_KEY,
  IDENTIFIER: process.env.API_IDENTIFIER,
  PASSWORD: process.env.API_PASSWORD,
  BASE_URL: `${process.env.BASE_URL}${process.env.API_PATH}`,
  WS_URL: process.env.WS_BASE_URL,
};


export const SESSIONS = {
  LONDON: {
    START: "08:00",
    END: "17:00",
    SYMBOLS: ["EURJPY", "USDJPY", "EURUSD", "GBPUSD", "EURGBP", "USDCHF"],
  },
  NY: {
    START: "13:00",
    END: "21:00",
    SYMBOLS:  ["USDJPY", "EURJPY", "EURUSD", "GBPUSD", "USDCAD", "USDCHF"],
  },
  SYDNEY: {
    START: "22:00",
    END: "07:00",
    SYMBOLS:["EURJPY", "USDJPY", "AUDUSD", "AUDJPY", "NZDUSD", "NZDJPY"],
  },
  TOKYO: {
    START: "00:00",
    END: "09:00",
    SYMBOLS: ["EURJPY", "USDJPY", "AUDUSD", "AUDJPY", "NZDUSD", "NZDJPY"],
  },
};

// Trading Configuration
export const TRADING = {
  // Instruments and timeframes
  // s : ["EURUSD", "GBPUSD", "EURGBP", "AUDUSD", "USDCAD"],
  TIMEFRAMES: [
    "MINUTE",
    "MINUTE_5",
    "MINUTE_15",
    "MINUTE_30",
    "HOUR",
    "HOUR_4",
    "DAY",
  ],

  // Position sizing and risk management
  LEVERAGE: 30,
  RISK_PER_TRADE: 0.02,
  MAX_POSITIONS: 5,

  // Slippage control (in pips)
  MAX_SLIPPAGE_PIPS: 2, // Maximum allowed slippage in pips

  // Signal threshold for entry
  MIN_BUY_CONDITIONS: 3, // Minimum buy conditions for a signal
  MIN_SELL_CONDITIONS: 3, // Minimum sell conditions for a signal

  // Daily risk control
  MAX_DAILY_LOSS: 0.04, // Stop trading after 4% loss in a day
  MAX_DAILY_PROFIT: 0.06, // Stop trading after 6% profit in a day
};

// Technical Analysis Configuration
export const ANALYSIS = {
  // Multi-Timeframe Strategy
  TIMEFRAMES: {
    TREND: "HOUR_4", // Trend direction
    SETUP: "HOUR", // Trade setup
    ENTRY: "MINUTE_15", // Entry/Exit timing
  },

  // EMAs for trend and entry
  EMA: {
    TREND: {
      FAST: 50,
      SLOW: 200,
    },
    ENTRY: {
      FAST: 9,
      SLOW: 21,
    },
  },

  // RSI settings
  RSI: {
    PERIOD: 14,
    OVERBOUGHT: 70,
    OVERSOLD: 30,
    EXIT_OVERBOUGHT: 65, // Earlier exit
    EXIT_OVERSOLD: 35,
  },

  // MACD settings
  MACD: {
    FAST: 12,
    SLOW: 26,
    SIGNAL: 9,
  },

  // Bollinger Bands
  BOLLINGER: {
    PERIOD: 20,
    STD_DEV: 2,
  },

  // ATR for stop loss and trailing
  ATR: {
    PERIOD: 14,
    STOP_MULTIPLIER: 1.5,
    TRAILING_MULTIPLIER: 1.0,
  },

  // Risk Management
  RISK: {
    PER_TRADE: 0.02, // 2% risk per trade
    REWARD_RATIO: 2.0, // Target 2:1 reward/risk
    PARTIAL_TAKE_PROFIT: 0.5, // Take 50% profit at 1:1
  },
  // Range filter: skip signals in low volatility/ranging markets
  RANGE_FILTER: {
    ENABLED: false,
    MIN_ATR_PCT: 0.0005, // ATR must be at least 0.05% of price
    MIN_BB_WIDTH_PCT: 0.001, // BB width must be at least 0.1% of price
    MIN_EMA_DIST_PCT: 0.0003, // Fast/slow EMA must be at least 0.03% apart
  },
};

// Mode Configuration
export const MODE = {
  BACKTEST_MODE: false,
  DEV_MODE: true, // Set to false in production
};

// Development overrides for faster testing
export const DEV = {
  TIMEFRAMES: {
    TREND: "MINUTE_15", // Trend direction (was HOUR_4)
    SETUP: "MINUTE_5", // Setup (was HOUR)
    ENTRY: "MINUTE", // Entry/Exit (was MINUTE_15)
  },
  ANALYSIS_INTERVAL_MS: 60 * 1000, // 1 minute between analyses (was 15 min)
};

// For convenience in error messages and logging
export const VERSION = "1.0.0";
