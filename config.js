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
    REQUIRED_SCORE: 3,
    WEEKEND_FLAT: true,
    DYNAMIC_TRAIL_MIN_R: 0.7,
    DYNAMIC_TRAIL_DISTANCE_R: 0.35,
    DYNAMIC_TRAIL_STALL_MINUTES: 45,
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

const profile = (signal, entry, stop, exit) => ({
    signal: { context: signal.timeframe.toLowerCase(), ...signal },
    entry: { type: "stop", ...entry },
    stop,
    exit,
    risk: {
        perTrade: RISK.PER_TRADE,
        lastEntryMinute: RISK.DAILY_LAST_ENTRY_MINUTE_UTC,
    },
});

const p = (symbol, session, structure, filters, execution, exit) => ({
    symbol,
    session,
    structure,
    filters,
    execution,
    exit,
});

const SESSION_PROFILE_SETTINGS = [
    p(
        "USDCHF",
        "asia",
        ["greenred", 0.75, 0, 0.8, "both"],
        [0.4, 0.9, 0.05, 0.75, 0.3, 0.3, 0, 1, "none", 1, 0.75, 0, 0.05],
        [0.01, 15, 0.075, "stop", 0],
        ["fixed", 2, null, 1.5, 0.5, 0.75, 0.5, 3, 480],
    ),
    p(
        "GBPUSD",
        "asia",
        ["greenred", 0.25, 0.05, 0.95, "both"],
        [0, 0.9, 0.15, 0, 0.4, 0, 0, 0.5, "rsi", 2, 1, 0, 0.05],
        [0.05, 60, 0.02, "stop", 0],
        ["partial", 2, null, 0.75, null, 1, 0.5, 4, 360],
    ),
    p(
        "AUDJPY",
        "asia",
        ["greenred", 0.75, 0, 1.2, "both"],
        [0, 0.75, 0.15, 1, 0.4, 0.3, 0, 1.5, "none", 2, 1, 2, 0.25],
        [0.03, 90, 0, "stop", 0],
        ["partial", 1.1, null, null, null, 1, 0.5, 4, 480],
    ),
    p(
        "EURJPY",
        "asia",
        ["greenred", 0.5, 0, 0.95, "both"],
        [0.6, 0.9, 0.05, 0, 0.4, 0.3, 0, 1, "none", 1, 1, 0, 0.25],
        [0.02, 45, 0.075, "stop", 0],
        ["fixed", 1.25, null, null, null, 0.65, 0.6, 2, 240],
    ),
    p(
        "USDJPY",
        "asia",
        ["greenred", 0.5, 0.1, 0.95, "sell"],
        [0.4, 0.9, 0.05, 1.25, 0, 0, 0, 1, "none", 1, 1, 1, 0.1],
        [0.05, 60, 0.075, "limit", 0],
        ["fixed", 2, 0.75, 0.75, 0.4, 1, 0.6, 2, 120],
    ),
    p(
        "NZDUSD",
        "asia",
        ["continuation", 0.25, 0.1, 1.2, "buy"],
        [0.4, 0.75, 0.05, 0.75, 0.2, 0.3, 0, 1, "none", 1, 1, 2, 0.25],
        [0.01, 90, 0.03, "stop", 0.1],
        ["fixed", 2, null, 1, null, 0.75, 0.5, 3, 120],
    ),

    p("GBPUSD", "london", ["greenred", 0.25, 0.1, 1.05, "both"], [0.1, 0.9, 0, 0, 0.4, 0, 0.8, 0.5, "bollinger", 1, 1, 4, 0], [0, 15, 0, "stop", 0], ["fixed", 2, null, null, null, 0.65, 0.5, 2, 480]),
    p("USDJPY", "london", ["greenred", 0.5, 0.2, 0.8, "both"], [0, 0.75, 0.05, 0, 0.3, 0, 0, 1.5, "rsi", 1, 0.75, 0, 0.4], [0.05, 90, 0.075, "stop", 0], ["fixed", 1.1, null, null, null, 0.75, 0.5, 3, 120]),
    p("EURJPY", "london", ["greenred", 0.5, 0.1, 1.2, "buy"], [0.25, 0.75, 0.25, 0, 0.4, 0.3, 0, 0.75, "none", 2, 0.75, 1, 0.15], [0, 75, 0.02, "stop", 0], ["fixed", 2, null, null, null, 0.75, 0.6, 3, 360]),
    p("GBPCHF", "london", ["greenred", 0.5, 0.05, 1.2, "both"], [0.4, 0.9, 0.15, 1, 0, 0.2, 0, 0.75, "bollinger", 1, 0.5, 0, 0.15], [0.03, 30, 0.05, "stop", 0], ["partial", 1.25, null, null, null, 1, 0.5, 3, 240]),
    p("GBPAUD", "london", ["continuation", 0.25, 0.1, 1.05, "sell"], [0.1, 1, 0.25, 0, 0, 0.2, 0, 1, "bollinger", 1, 0.5, 1, 0], [0.02, 15, 0.05, "stop", 0], ["fixed", 2, null, null, null, 0.75, 0.5, 2, 480]),
    p("EURUSD", "london", ["greenred", 0.75, 0.1, 0.8, "both"], [0.4, 0.9, 0, 0, 0.2, 0, 1, 1, "volume", 1, 0.75, 2, 0.25], [0, 45, 0, "stop", 0], ["fixed", 2, null, null, null, 1, 0.6, 2, 480]),
    p("AUDJPY", "london", ["continuation", 0.25, 0.2, 1.2, "buy"], [0.25, 1, 0.05, 1.25, 0.2, 0.2, 0, 1.25, "none", 2, 1, 0, 0.05], [0.01, 45, 0, "market", 0.2], ["fixed", 2, null, 1, null, 1, 0.5, 3, 180]),

    p("EURUSD", "overlap", ["continuation", 0.25, 0.2, 0.8, "both"], [0.6, 0.75, 0, 0.75, 0, 0.3, 1, 0.5, "none", 1, 1, 4, 0], [0, 45, 0.05, "stop", 0.4], ["fixed", 2, null, null, null, 1, 0.6, 2, 120]),
    p("AUDUSD", "overlap", ["greenred", 0.75, 0.05, 0.95, "sell"], [0.6, 1, 0.15, 0, 0, 0, 0, 1.5, "score", 1, 0.5, 2, 0], [0.03, 15, 0, "stop", 0], ["fixed", 1.1, 1.25, 1.25, 0.4, 0.65, 0.6, 4, 360]),
    p("AUDJPY", "overlap", ["greenred", 0.25, 0.1, 0.8, "both"], [0.4, 1, 0.25, 1, 0.2, 0.2, 0, 0.5, "bollinger", 1, 0.5, 0, 0.15], [0.02, 75, 0.03, "stop", 0], ["partial", 1.1, null, 1, null, 1, 0.6, 2, 180]),
    p("USDCAD", "overlap", ["greenred", 0.5, 0.1, 1.05, "buy"], [0.1, 0.9, 0.25, 1, 0.4, 0.2, 1, 0.75, "volume", 2, 1, 0, 0.25], [0.03, 60, 0.02, "stop", 0], ["fixed", 1.5, null, null, null, 1, 0.5, 3, 120]),
    p("USDJPY", "overlap", ["greenred", 0.5, 0.2, 1.05, "both"], [0.1, 0.75, 0.25, 0.75, 0.2, 0, 0, 1.25, "bollinger", 1, 0.5, 0, 0.15], [0.03, 15, 0.075, "stop", 0], ["partial", 1.5, null, 1.25, null, 0.75, 0.5, 2, 240]),
    p("GBPUSD", "overlap", ["continuation", 0.5, 0, 0.8, "both"], [0.4, 0.75, 0, 0.75, 0.3, 0.2, 0, 1.5, "none", 1, 0.75, 1, 0.4], [0.01, 30, 0.02, "stop", 0], ["fixed", 2, null, null, null, 1, 0.5, 4, 180]),
    p("GBPAUD", "overlap", ["greenred", 0.5, 0, 0.95, "buy"], [0.1, 1, 0.25, 1, 0.2, 0, 0, 0.5, "none", 1, 1, 2, 0.15], [0.01, 15, 0.03, "stop", 0], ["fixed", 1, 1.25, 1.25, null, 1, 0.5, 4, 180]),

    p("USDJPY", "newYork", ["greenred", 0.5, 0.1, 1.05, "buy"], [0.25, 1, 0, 1, 0.2, 0.2, 0, 0.75, "bollinger", 1, 0.75, 0, 0.4], [0.03, 60, 0.02, "stop", 0], ["fixed", 2, null, null, null, 1, 0.5, 4, 120]),
    p("EURJPY", "newYork", ["greenred", 0.25, 0.2, 1.2, "both"], [0.25, 0.9, 0, 1, 0.2, 0, 0, 0.5, "bollinger", 1, 1, 0, 0], [0.02, 15, 0.02, "stop", 0], ["fixed", 2, null, null, null, 0.75, 0.5, 4, 120]),
    p("EURUSD", "newYork", ["greenred", 0.5, 0.1, 0.95, "both"], [0.6, 0.75, 0.05, 0.75, 0.2, 0.3, 0, 1.5, "none", 1, 0.75, 2, 0.15], [0.01, 15, 0.02, "limit", 0], ["fixed", 2, null, null, null, 0.75, 0.6, 3, 120]),
    p("AUDJPY", "newYork", ["continuation", 0.5, 0.2, 1.05, "buy"], [0.25, 1, 0.15, 0.75, 0.4, 0.2, 0, 1, "none", 1, 1, 2, 0.4], [0.03, 90, 0.02, "limit", 0.1], ["partial", 2, 0.75, 0.75, 0.5, 1, 0.5, 3, 120]),
    p("AUDUSD", "newYork", ["greenred", 0.5, 0.1, 1.05, "both"], [0.6, 1, 0.15, 1, 0, 0, 0.8, 0.5, "none", 1, 1, 0, 0.4], [0, 60, 0.03, "stop", 0], ["fixed", 2, 1.25, null, null, 0.65, 0.5, 2, 120]),
    p("GBPUSD", "newYork", ["continuation", 0.75, 0.2, 1.05, "both"], [0, 1, 0, 1, 0, 0, 0.8, 0.5, "none", 1, 0.75, 0, 0.4], [0.05, 15, 0.02, "stop", 0], ["partial", 1.1, null, null, 0.4, 1, 0.5, 4, 240]),
];

const toProfile = ({ session, structure, filters, execution, exit }) => {
    const [structureMode, minImpulseAtr, minSwingGapAtr, maxRetrace, directionMode = "both"] = structure;
    const [
        minAtrPercentile,
        maxAtrPercentile,
        minEfficiency,
        minActivity,
        minBodyRatio,
        minBodyAtr,
        minVolumeRatio,
        maxSpreadAtr,
        indicatorMode,
        minIndicatorScore,
        minBollingerRoomAtr,
        h1DirectionBars,
        minH1TrendAtr,
    ] = filters;
    const [bufferAtr, expiryMinutes, stopBufferAtr, entryType = "stop", limitRetraceAtr = 0] = execution;
    const [mode, targetR, breakEvenAtR, trailActivationR, trailDistanceR, partialAtR, partialFraction, trailAtr, maxHoldMinutes] = exit;

    return profile(
        {
            timeframe: "M15",
            context: h1DirectionBars > 0 ? "h1" : "m15",
            sessions: [session],
            structureMode,
            directionMode,
            minImpulseAtr,
            minSwingGapAtr,
            maxRetrace,
            minAtrPercentile,
            maxAtrPercentile,
            minEfficiency,
            minActivity,
            minBodyRatio,
            minBodyAtr,
            minVolumeRatio,
            maxSpreadAtr,
            indicatorMode,
            minIndicatorScore,
            minBollingerRoomAtr,
            h1DirectionBars,
            minH1TrendAtr,
        },
        {
            type: entryType,
            bufferAtr,
            limitRetraceAtr,
            expiryBars: Math.max(1, Math.ceil(expiryMinutes / 15)),
        },
        { type: "signal", bufferAtr: stopBufferAtr },
        { mode, targetR, breakEvenAtR, trailActivationR, trailDistanceR, partialAtR, partialFraction, trailAtr, maxHoldMinutes },
    );
};
export const PROFILES = SESSION_PROFILE_SETTINGS.reduce((profiles, settings) => {
    profiles[settings.symbol] ??= {};
    profiles[settings.symbol][settings.session] = toProfile(settings);
    return profiles;
}, {});

export const SESSIONS = Object.fromEntries(
    ["asia", "london", "overlap", "newYork"].map((session) => [
        session,
        { SYMBOLS: SESSION_PROFILE_SETTINGS.filter((settings) => settings.session === session).map(({ symbol }) => symbol) },
    ]),
);

const SESSION_CLOCKS = new Map();
const minuteIn = (timestamp, timeZone) => {
    if (!SESSION_CLOCKS.has(timeZone)) {
        SESSION_CLOCKS.set(timeZone, new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
    }
    const parts = Object.fromEntries(
        SESSION_CLOCKS.get(timeZone)
            .formatToParts(timestamp)
            .map(({ type, value }) => [type, value]),
    );
    return Number(parts.hour) * 60 + Number(parts.minute);
};

const asUtcTimestamp = (value) => {
    if (typeof value !== "string" || /[zZ]|[+\-]\d{2}:?\d{2}$/.test(value)) return new Date(value);
    return new Date(`${value.replace(" ", "T")}Z`);
};

export function getMarketSession(timestamp = Date.now()) {
    const date = timestamp instanceof Date ? timestamp : asUtcTimestamp(timestamp);
    if (Number.isNaN(date.getTime())) return "offHours";
    const londonMinute = minuteIn(date, "Europe/London");
    const newYorkMinute = minuteIn(date, "America/New_York");
    if (londonMinute < 8 * 60) return "asia";
    if (newYorkMinute < 8 * 60) return "london";
    if (londonMinute < 17 * 60) return "overlap";
    if (newYorkMinute < 17 * 60) return "newYork";
    return "offHours";
}

export const getProfile = (symbol, session = getMarketSession()) => PROFILES[symbol]?.[session] ?? null;
