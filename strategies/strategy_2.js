
const profile = (signal, entry, stop, exit, risk) => ({
    enabled: true,

    signal: {
        context: signal.timeframe.toLowerCase(),
        ...signal,
    },

    entry: {
        type: "stop",
        ...entry,
    },

    stop,

    exit: {
        dailyCloseMinute: 21 * 60 + 55,
        ...exit,
    },

    risk: {
        maxDailyTrades: Number.MAX_SAFE_INTEGER,
        cooldownMinutes: 0,
        lastEntryMinute: 21 * 60,
        ...risk,
    },
});

export const STRATEGY_2_PROFILES = {
    AUDCAD: profile(
        { timeframe: "M15", trendLookback: 12, minTrendAtr: 0.5, structure: "both", consolidationBars: 2, maxPauseAtr: 1, minBody: 0.2, breakout: "close", pressure: "rsi", pressureLevel: 52, flowLevel: 0.1, location: "localLevel", locationAtr: 0.1, session: "overlap" },
        { bufferAtr: 0.05, expiryBars: 1 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 5, trailActivationR: 0.7, trailDistanceR: 1, maxHoldMinutes: 240 },
        { perTrade: 0.03 },
    ),

    AUDJPY: profile(
        { timeframe: "H1", trendLookback: 24, minTrendAtr: 1.5, structure: "move", consolidationBars: 2, maxPauseAtr: 1.5, minBody: 0.2, breakout: "none", pressure: "flow", pressureLevel: 52, flowLevel: 0.1, location: "bollingerRetest", locationAtr: 0, session: "asia" },
        { bufferAtr: 0.1, expiryBars: 4 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 2, trailActivationR: 0.7, trailDistanceR: 1, maxHoldMinutes: 240 },
        { perTrade: 0.03 },
    ),

    AUDUSD: profile(
        { timeframe: "M15", trendLookback: 24, minTrendAtr: 2, structure: "move", consolidationBars: 3, maxPauseAtr: 1.5, minBody: 0.2, breakout: "none", pressure: "rsi", pressureLevel: 58, flowLevel: 0.05, location: "localLevel", locationAtr: 0.5, session: "asia" },
        { bufferAtr: 0.1, expiryBars: 1 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 4, trailActivationR: 2, trailDistanceR: 0.75, maxHoldMinutes: 480 },
        { perTrade: 0.03 },
    ),

    EURCHF: profile(
        { timeframe: "M15", trendLookback: 12, minTrendAtr: 2, structure: "halves", consolidationBars: 2, maxPauseAtr: 1, minBody: 0.5, breakout: "none", pressure: "flow", pressureLevel: 55, flowLevel: 0.05, location: "bollingerRoom", locationAtr: 0.25, session: "overlap" },
        { bufferAtr: 0, expiryBars: 4 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 5, trailActivationR: 2, trailDistanceR: 1.5, maxHoldMinutes: 480 },
        { perTrade: 0.03 },
    ),

    EURGBP: profile(
        { timeframe: "H1", trendLookback: 8, minTrendAtr: 1, structure: "both", consolidationBars: 3, maxPauseAtr: 2.25, minBody: 0.2, breakout: "wick", pressure: "rsi", pressureLevel: 58, flowLevel: 0.1, location: "bollingerRoom", locationAtr: 0.5, session: "asia" },
        { bufferAtr: 0, expiryBars: 1 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 4, trailActivationR: 2, trailDistanceR: 0.5, maxHoldMinutes: 720 },
        { perTrade: 0.03 },
    ),

    EURJPY: profile(
        { timeframe: "M15", trendLookback: 24, minTrendAtr: 0.5, structure: "move", consolidationBars: 2, maxPauseAtr: 2.25, minBody: 0.2, breakout: "none", pressure: "flow", pressureLevel: 50, flowLevel: 0.2, location: "bollingerRetest", locationAtr: 0.25, session: "asia" },
        { bufferAtr: 0.05, expiryBars: 3 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 5, trailActivationR: 0.7, trailDistanceR: 0.75, maxHoldMinutes: 480 },
        { perTrade: 0.03 },
    ),

    EURUSD: profile(
        { timeframe: "H1", trendLookback: 16, minTrendAtr: 1.5, structure: "both", consolidationBars: 4, maxPauseAtr: 2.25, minBody: 0.5, breakout: "none", pressure: "rsi", pressureLevel: 52, flowLevel: 0.3, location: "bollingerRoom", locationAtr: 0, session: "asia" },
        { bufferAtr: 0, expiryBars: 4 },
        { type: "signal", bufferAtr: 0.2 },
        { targetR: 5, trailActivationR: 1.5, trailDistanceR: 0.75, maxHoldMinutes: 480 },
        { perTrade: 0.03 },
    ),

    GBPAUD: profile(
        { timeframe: "M15", trendLookback: 24, minTrendAtr: 1, structure: "both", consolidationBars: 4, maxPauseAtr: 2.25, minBody: 0.5, breakout: "close", pressure: "rsi", pressureLevel: 50, flowLevel: 0.05, location: "bollingerRetest", locationAtr: 0.25, session: "overlap" },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 2, trailActivationR: 2, trailDistanceR: 1.5, maxHoldMinutes: 240 },
        { perTrade: 0.03 },
    ),

    GBPCHF: profile(
        { timeframe: "H1", trendLookback: 16, minTrendAtr: 1.5, structure: "both", consolidationBars: 2, maxPauseAtr: 2.25, minBody: 0.5, breakout: "wick", pressure: "rsi", pressureLevel: 50, flowLevel: 0.05, location: "bollingerRoom", locationAtr: 0, session: "london" },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 5, trailActivationR: 1, trailDistanceR: 1, maxHoldMinutes: 240 },
        { perTrade: 0.03 },
    ),

    GBPJPY: profile(
        { timeframe: "M15", trendLookback: 8, minTrendAtr: 0.5, structure: "both", consolidationBars: 2, maxPauseAtr: 1, minBody: 0.5, breakout: "wick", pressure: "rsi", pressureLevel: 55, flowLevel: 0.05, location: "bollingerRoom", locationAtr: 0.25, session: "asia" },
        { bufferAtr: 0.1, expiryBars: 4 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 5, trailActivationR: 2, trailDistanceR: 0.75, maxHoldMinutes: 480 },
        { perTrade: 0.03 },
    ),

    GBPUSD: profile(
        { timeframe: "H1", trendLookback: 24, minTrendAtr: 0.5, structure: "move", consolidationBars: 2, maxPauseAtr: 2.25, minBody: 0.2, breakout: "none", pressure: "rsi", pressureLevel: 55, flowLevel: 0.1, location: "localLevel", locationAtr: 0.5, session: "asia" },
        { bufferAtr: 0, expiryBars: 4 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 5, trailActivationR: 0.7, trailDistanceR: 1.5, maxHoldMinutes: 480 },
        { perTrade: 0.03 },
    ),

    NZDJPY: profile(
        { timeframe: "H1", trendLookback: 12, minTrendAtr: 1, structure: "both", consolidationBars: 4, maxPauseAtr: 1.5, minBody: 0.2, breakout: "none", pressure: "rsi", pressureLevel: 52, flowLevel: 0.1, location: "bollingerRoom", locationAtr: 0.1, session: "london" },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 5, trailActivationR: 1, trailDistanceR: 1, maxHoldMinutes: 480 },
        { perTrade: 0.03 },
    ),

    NZDUSD: profile(
        { timeframe: "M15", trendLookback: 16, minTrendAtr: 1.5, structure: "both", consolidationBars: 3, maxPauseAtr: 1.5, minBody: 0.2, breakout: "none", pressure: "rsi", pressureLevel: 55, flowLevel: 0.05, location: "bollingerRetest", locationAtr: 0.5, session: "london" },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0.2 },
        { targetR: 4, trailActivationR: 1, trailDistanceR: 1, maxHoldMinutes: 480 },
        { perTrade: 0.03 },
    ),

    USDCAD: profile(
        { timeframe: "M15", trendLookback: 24, minTrendAtr: 0.5, structure: "move", consolidationBars: 2, maxPauseAtr: 1, minBody: 0.2, breakout: "close", pressure: "rsi", pressureLevel: 52, flowLevel: 0.05, location: "localLevel", locationAtr: 0.5, session: "overlap" },
        { bufferAtr: 0, expiryBars: 3 },
        { type: "signal", bufferAtr: 0.1 },
        { targetR: 3, trailActivationR: 1.5, trailDistanceR: 0.5, maxHoldMinutes: 240 },
        { perTrade: 0.03 },
    ),

    USDCHF: profile(
        { timeframe: "M15", trendLookback: 12, minTrendAtr: 0.5, structure: "move", consolidationBars: 6, maxPauseAtr: 1.5, minBody: 0.35, breakout: "wick", pressure: "flow", pressureLevel: 55, flowLevel: 0.2, location: "bollingerRetest", locationAtr: 0.1, session: "asia" },
        { bufferAtr: 0, expiryBars: 2 },
        { type: "signal", bufferAtr: 0.2 },
        { targetR: 3, trailActivationR: 1, trailDistanceR: 0.5, maxHoldMinutes: 240 },
        { perTrade: 0.03 },
    ),

    USDJPY: profile(
        { timeframe: "H1", trendLookback: 12, minTrendAtr: 0.5, structure: "halves", consolidationBars: 3, maxPauseAtr: 2.25, minBody: 0.2, breakout: "none", pressure: "flow", pressureLevel: 50, flowLevel: 0.2, location: "localLevel", locationAtr: 0, session: "overlap" },
        { bufferAtr: 0.1, expiryBars: 1 },
        { type: "signal", bufferAtr: 0 },
        { targetR: 3, trailActivationR: 2, trailDistanceR: 1.5, maxHoldMinutes: 1440 },
        { perTrade: 0.03 },
    ),
};

class Strategy {
    getSignal({ symbol, profile: configuredProfile, candles }) {
        const profile = configuredProfile ?? STRATEGY_2_PROFILES[symbol];
        const settings = profile?.signal;
        const rows = candles?.[settings?.timeframe.toLowerCase()];

        if (!settings || !Array.isArray(rows)) {
            return { signal: null, reason: "missing_profile_or_data" };
        }

        const index = rows.length - 1;
        const minimumRows = settings.trendLookback + settings.consolidationBars + 21;

        if (rows.length < minimumRows) {
            return { signal: null, reason: "not_enough_data" };
        }

        const current = rows[index];
        const market = this.getMarketState(rows);

        if (!market || !this.isSessionActive(settings.session, current.timestamp, settings.timeframe)) {
            return { signal: null, reason: "market_or_session_failed" };
        }

        const buy = current.close > current.open;

        if (current.close === current.open) {
            return { signal: null, reason: "doji" };
        }

        const range = current.high - current.low;
        const bodyRatio = range > 0 ? Math.abs(current.close - current.open) / range : 0;

        if (bodyRatio < settings.minBody) {
            return { signal: null, reason: "body_failed" };
        }

        if (!this.trendPass(rows, index, settings, buy, market.atr)) {
            return { signal: null, reason: "trend_failed" };
        }

        const pause = rows.slice(index - settings.consolidationBars, index);
        const pauseHigh = Math.max(...pause.map((candle) => candle.high));
        const pauseLow = Math.min(...pause.map((candle) => candle.low));
        const pauseRange = pauseHigh - pauseLow;
        const pauseMove = Math.abs(pause.at(-1).close - pause[0].open);

        if (pauseRange > market.atr * settings.maxPauseAtr || pauseMove > pauseRange * 0.8) {
            return { signal: null, reason: "consolidation_failed" };
        }

        if (settings.breakout === "close") {
            const passed = buy ? current.close > pauseHigh : current.close < pauseLow;
            if (!passed) return { signal: null, reason: "breakout_failed" };
        }

        if (settings.breakout === "wick") {
            const passed = buy ? current.high > pauseHigh : current.low < pauseLow;
            if (!passed) return { signal: null, reason: "breakout_failed" };
        }

        if (settings.pressure === "rsi") {
            const passed = buy
                ? market.rsi >= settings.pressureLevel
                : market.rsi <= 100 - settings.pressureLevel;

            if (!passed) return { signal: null, reason: "pressure_failed" };
        } else {
            const passed = buy
                ? market.flow >= settings.flowLevel
                : market.flow <= -settings.flowLevel;

            if (!passed) return { signal: null, reason: "pressure_failed" };
        }

        if (!this.locationPass(current, pause, pauseHigh, pauseLow, settings, market, buy)) {
            return { signal: null, reason: "location_failed" };
        }

        const signal = buy ? "BUY" : "SELL";
        const entryPrice = buy
            ? current.high + market.atr * profile.entry.bufferAtr
            : current.low - market.atr * profile.entry.bufferAtr;

        const stopLoss = buy
            ? current.low - market.atr * profile.stop.bufferAtr
            : current.high + market.atr * profile.stop.bufferAtr;

        const stopDistanceAtr = Math.abs(entryPrice - stopLoss) / market.atr;

        if (stopDistanceAtr < 0.25 || stopDistanceAtr > 2.5) {
            return { signal: null, reason: "stop_failed" };
        }

        const trendStart = index - settings.consolidationBars - settings.trendLookback;
        const trendEnd = index - settings.consolidationBars - 1;
        const trendStrength = Math.abs(rows[trendEnd].close - rows[trendStart].close) / market.atr;

        return {
            symbol,
            signal,
            entryType: "stop",
            entryPrice,
            stopLoss,
            atr: market.atr,
            quality: trendStrength + bodyRatio + Math.abs(market.flow),
            reason: `continuation_${settings.timeframe}`,
        };
    }

    trendPass(rows, index, settings, buy, atr) {
        const consolidationStart = index - settings.consolidationBars;
        const originIndex = consolidationStart - settings.trendLookback;
        const origin = rows[originIndex];
        const beforePause = rows[consolidationStart - 1];
        const moveAtr = (beforePause.close - origin.close) / atr;

        if (buy ? moveAtr < settings.minTrendAtr : moveAtr > -settings.minTrendAtr) {
            return false;
        }

        if (settings.structure === "move") {
            return true;
        }

        const trendRows = rows.slice(originIndex, consolidationStart);
        const half = Math.floor(trendRows.length / 2);
        const oldRows = trendRows.slice(0, half);
        const recentRows = trendRows.slice(half);

        const oldHigh = Math.max(...oldRows.map((candle) => candle.high));
        const oldLow = Math.min(...oldRows.map((candle) => candle.low));
        const recentHigh = Math.max(...recentRows.map((candle) => candle.high));
        const recentLow = Math.min(...recentRows.map((candle) => candle.low));

        return buy
            ? recentHigh > oldHigh && recentLow > oldLow
            : recentHigh < oldHigh && recentLow < oldLow;
    }

    locationPass(current, pause, pauseHigh, pauseLow, settings, market, buy) {
        if (settings.location === "bollingerRetest") {
            const touched = buy
                ? pause.some((candle) => candle.low <= market.middle + market.atr * settings.locationAtr)
                : pause.some((candle) => candle.high >= market.middle - market.atr * settings.locationAtr);

            return touched && (buy ? current.close > market.middle : current.close < market.middle);
        }

        if (settings.location === "bollingerRoom") {
            return buy
                ? current.close < market.upper + market.atr * settings.locationAtr
                : current.close > market.lower - market.atr * settings.locationAtr;
        }

        return buy
            ? current.close >= pauseHigh - market.atr * settings.locationAtr
            : current.close <= pauseLow + market.atr * settings.locationAtr;
    }

    getMarketState(rows) {
        const index = rows.length - 1;
        let trueRange = 0;
        let gain = 0;
        let loss = 0;

        for (let cursor = index - 13; cursor <= index; cursor += 1) {
            const current = rows[cursor];
            const previous = rows[cursor - 1];

            trueRange += Math.max(
                current.high - current.low,
                Math.abs(current.high - previous.close),
                Math.abs(current.low - previous.close),
            );

            const change = current.close - previous.close;

            if (change > 0) gain += change;
            else loss -= change;
        }

        const atr = trueRange / 14;
        const rsi = loss === 0
            ? 100
            : gain === 0
              ? 0
              : 100 - 100 / (1 + gain / loss);

        const bandRows = rows.slice(-20);
        const middle = bandRows.reduce((sum, candle) => sum + candle.close, 0) / bandRows.length;
        const variance = bandRows.reduce(
            (sum, candle) => sum + (candle.close - middle) ** 2,
            0,
        ) / bandRows.length;

        const deviation = Math.sqrt(variance);
        const flowRows = rows.slice(-6);
        const flowRange = flowRows.reduce(
            (sum, candle) => sum + Math.max(candle.high - candle.low, 1e-12),
            0,
        );

        const flow = flowRows.reduce(
            (sum, candle) => sum + candle.close - candle.open,
            0,
        ) / flowRange;

        if (![atr, rsi, middle, deviation, flow].every(Number.isFinite) || atr <= 0) {
            return null;
        }

        return {
            atr,
            rsi,
            flow,
            middle,
            upper: middle + deviation * 2,
            lower: middle - deviation * 2,
        };
    }

    isSessionActive(session, timestamp, timeframe) {
        const timeframeMinutes = { M15: 15, H1: 60 };
        const decisionTime = Date.parse(timestamp) + timeframeMinutes[timeframe] * 60_000;
        const date = new Date(decisionTime);
        const minute = date.getUTCHours() * 60 + date.getUTCMinutes();

        if (session === "asia") return minute < 8 * 60;
        if (session === "london") return minute >= 7 * 60 && minute < 13 * 60;
        if (session === "overlap") return minute >= 12 * 60 && minute < 16 * 60;

        return false;
    }
}

export default new Strategy();

