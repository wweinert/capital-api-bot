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
    p("USDCHF", "asia", ["greenred", 0.75, 0, 0.8], [0.4, 0.9, 0.05, 0.75, 0.3, 0, 0, 1, "none", 1, 0.75, 0, 0.05], [0, 15, 0.075], ["fixed", 2, null, 0.75, null, 0.75, 0.5, 3, 480]),
    p("AUDUSD", "asia", ["greenred", 0.25, 0.05, 0.95], [0, 0.75, 0.15, 1, 0.2, 0.3, 0, 0.5, "volume", 1, 0.5, 1, 0.1], [0.05, 30, 0], ["partial", 1, null, null, null, 1, 0.5, 4, 360]),
    p("EURJPY", "asia", ["greenred", 1, 0.2, 0.95], [0.6, 0.9, 0.05, 0, 0.2, 0.2, 0, 1.25, "none", 1, 0.5, 0, 0.25], [0.01, 45, 0], ["fixed", 1.5, null, 1.25, null, 0.65, 0.6, 2, 480]),
    p("EURUSD", "asia", ["continuation", 0.25, 0.1, 1.2], [0, 0.9, 0, 1, 0, 0.3, 1, 1.5, "bollinger", 1, 0.5, 0, 0.25], [0.01, 30, 0], ["fixed", 2, null, null, null, 0.65, 0.6, 4, 240]),
    p("AUDJPY", "asia", ["greenred", 0.75, 0, 1.2], [0, 0.75, 0.15, 1, 0.2, 0.3, 0, 1.25, "none", 2, 1, 2, 0.25], [0.03, 90, 0.075], ["partial", 1.1, null, null, null, 1, 0.5, 4, 480]),

    p("EURUSD", "london", ["greenred", 0.75, 0.1, 0.8], [0.4, 0.9, 0, 0, 0.2, 0, 1, 1, "volume", 1, 0.75, 2, 0.25], [0, 45, 0], ["fixed", 2, null, null, null, 1, 0.6, 2, 480]),
    p("GBPUSD", "london", ["greenred", 0.25, 0.1, 1.05], [0.1, 0.9, 0.05, 0, 0.4, 0, 0.8, 0.5, "bollinger", 1, 1, 4, 0], [0, 15, 0], ["fixed", 2, null, null, null, 0.65, 0.5, 2, 480]),
    p("AUDUSD", "london", ["greenred", 0.75, 0, 1.2], [0.25, 0.75, 0.15, 0.75, 0, 0, 0.8, 1, "score", 1, 1, 0, 0.15], [0.05, 75, 0], ["fixed", 1.5, null, 1, null, 0.65, 0.5, 2, 180]),
    p("GBPCHF", "london", ["greenred", 1, 0, 0.95], [0.4, 0.9, 0.15, 1.25, 0, 0, 0, 1.25, "bollinger", 2, 0.5, 0, 0.4], [0.05, 15, 0.02], ["fixed", 2, null, 1, null, 0.65, 0.6, 2, 240]),
    p("USDCHF", "london", ["continuation", 0.25, 0.05, 1.05], [0.4, 0.9, 0.05, 0, 0.4, 0.2, 0, 1.25, "score", 1, 0.75, 0, 0.25], [0.05, 30, 0], ["fixed", 1.5, null, null, null, 0.75, 0.6, 4, 360]),
    
    p("USDJPY", "overlap", ["greenred", 0.25, 0.2, 1.05], [0.1, 1, 0.25, 0.75, 0, 0, 0, 1.25, "score", 1, 1, 0, 0.05], [0.02, 15, 0.02], ["partial", 1.25, null, null, null, 0.75, 0.5, 2, 240]),
    p("GBPUSD", "overlap", ["continuation", 0.25, 0.1, 0.95], [0.4, 0.75, 0, 0, 0.3, 0, 0, 1.5, "none", 2, 0.75, 1, 0.4], [0.01, 60, 0.02], ["fixed", 2, null, null, null, 1, 0.5, 2, 180]),
    p("AUDJPY", "overlap", ["greenred", 0.25, 0.2, 1.2], [0.4, 0.9, 0.15, 0.75, 0.2, 0.2, 0, 1, "none", 1, 0.75, 0, 0.15], [0.01, 30, 0.03], ["partial", 2, null, 1, null, 1, 0.5, 3, 120]),
    p("EURUSD", "overlap", ["continuation", 0.75, 0, 1.2], [0.25, 0.9, 0.05, 0.75, 0, 0, 0.8, 1.25, "score", 2, 1, 0, 0.1], [0.05, 45, 0.05], ["partial", 0.75, null, null, null, 1, 0.6, 3, 180]),
    p("USDCHF", "overlap", ["greenred", 0.25, 0, 0.8], [0.1, 0.75, 0, 1, 0, 0, 0, 1, "bollinger", 2, 0.75, 4, 0.1], [0.01, 90, 0], ["partial", 2, null, null, null, 1, 0.5, 4, 360]),

    p("USDJPY", "newYork", ["continuation", 0.75, 0.1, 1.05], [0.4, 1, 0, 1, 0, 0.2, 0, 0.5, "bollinger", 1, 0.75, 0, 0.15], [0.02, 60, 0.02], ["fixed", 1.5, null, null, null, 0.75, 0.5, 4, 120]),
    p("GBPUSD", "newYork", ["continuation", 0.75, 0.2, 1.05], [0.1, 1, 0, 1, 0, 0, 0.8, 1.25, "none", 1, 0.75, 0, 0.25], [0.05, 15, 0.02], ["partial", 1.1, null, null, 0.4, 1, 0.5, 4, 240]),
    p("AUDUSD", "newYork", ["greenred", 1, 0.2, 0.95], [0.6, 1, 0.15, 0, 0.4, 0.3, 0, 1.25, "score", 1, 0.5, 0, 0.05], [0.02, 30, 0.03], ["fixed", 2, 1, null, null, 0.65, 0.5, 4, 240]),
    p("AUDJPY", "newYork", ["greenred", 0.25, 0.05, 1.05], [0.6, 1, 0.05, 0.75, 0.4, 0.3, 0, 0.75, "none", 1, 1, 2, 0.4], [0.05, 45, 0.03], ["fixed", 2, null, null, null, 1, 0.6, 3, 120]),
    p("EURJPY", "newYork", ["greenred", 0.75, 0.1, 1.2], [0.25, 1, 0, 1, 0.2, 0, 0, 1.25, "score", 1, 1, 0, 0.25], [0.01, 15, 0], ["fixed", 2, null, null, null, 0.65, 0.5, 4, 120]),
];

const toProfile = ({ session, structure, filters, execution, exit }) => {
    const [structureMode, minImpulseAtr, minSwingGapAtr, maxRetrace] = structure;
    const [minAtrPercentile, maxAtrPercentile, minEfficiency, minActivity, minBodyRatio, minBodyAtr, minVolumeRatio, maxSpreadAtr,
        indicatorMode, minIndicatorScore, minBollingerRoomAtr, h1DirectionBars, minH1TrendAtr] = filters;
    const [bufferAtr, expiryMinutes, stopBufferAtr] = execution;
    const [mode, targetR, breakEvenAtR, trailActivationR, trailDistanceR, partialAtR, partialFraction, trailAtr, maxHoldMinutes] = exit;

    return profile(
        {
            timeframe: "M15",
            context: h1DirectionBars > 0 ? "h1" : "m15",
            sessions: [session],
            structureMode,
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
        { bufferAtr, expiryBars: Math.max(1, Math.ceil(expiryMinutes / 15)) },
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
    const parts = Object.fromEntries(SESSION_CLOCKS.get(timeZone).formatToParts(timestamp).map(({ type, value }) => [type, value]));
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
