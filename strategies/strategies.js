class Strategy {
    getSignal({ symbol, profile, indicators, candles, bid, ask }) {
        if (!symbol || !profile || !indicators || !candles) {
            return {
                signal: null,
                reason: "missing_data",
            };
        }

        const timeframe = profile.signal.timeframe.toLowerCase();
        const signalCandles = candles[timeframe];
        const signalIndicators = indicators[timeframe];

        if (!signalIndicators || !signalCandles || signalCandles.length < 2) {
            return {
                signal: null,
                reason: "not_enough_data",
            };
        }

        const previous = signalCandles[signalCandles.length - 2];
        const current = signalCandles[signalCandles.length - 1];

        const signal = this.getPatternSignal(previous, current, profile.signal.pattern);

        if (!signal) {
            return {
                signal: null,
                reason: "pattern_failed",
            };
        }

        const bodyRatio = this.getBodyRatio(current);

        if (bodyRatio < profile.signal.minBodyRatio) {
            return {
                signal: null,
                reason: "body_too_small",
            };
        }

        if (!this.matchesTrend(signal, profile.signal.context, indicators)) {
            return {
                signal: null,
                reason: "trend_failed",
            };
        }

        if (!this.isConfirmed(signal, profile.signal, signalIndicators)) {
            return {
                signal: null,
                reason: "confirmation_failed",
            };
        }

        const atr = Number(signalIndicators.atr);
        const bidPrice = Number(bid);
        const askPrice = Number(ask);

        if (!Number.isFinite(atr) || !Number.isFinite(bidPrice) || !Number.isFinite(askPrice) || atr <= 0) {
            return {
                signal: null,
                reason: "invalid_market_data",
            };
        }

        const spreadAtr = Math.abs(askPrice - bidPrice) / atr;

        if (spreadAtr > profile.signal.maxSpreadAtr) {
            return {
                signal: null,
                reason: "spread_too_large",
            };
        }

        const entryPrice = this.getEntryPrice(signal, current, profile.entry, atr, bidPrice, askPrice);

        const stopLoss = this.getStopLoss(signal, entryPrice, signalCandles, profile.stop, atr);

        if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss)) {
            return {
                signal: null,
                reason: "invalid_entry_or_stop",
            };
        }

        const stopDistanceAtr = Math.abs(entryPrice - stopLoss) / atr;

        if (stopDistanceAtr < profile.stop.minAtr || stopDistanceAtr > profile.stop.maxAtr) {
            return {
                signal: null,
                reason: "stop_distance_failed",
            };
        }
        const quality = this.getQuality(signal, previous, current, profile.signal, signalIndicators, bodyRatio, spreadAtr);

        return {
            symbol,
            signal,
            entryType: profile.entry.type,
            entryPrice,
            stopLoss,
            atr,
            quality,
            bodyRatio,
            spreadAtr,
            reason: `${profile.signal.pattern}_${profile.signal.timeframe}`,
        };
    }

    // helpers for getSignal
    getEntryPrice(signal, candle, settings, atr, bid, ask) {
        if (settings.type === "stop") {
            const buffer = atr * settings.bufferAtr;

            return signal === "BUY" ? candle.high + buffer : candle.low - buffer;
        }

        if (settings.type === "limit") {
            const body = Math.abs(candle.close - candle.open);
            const pullback = body * settings.pullbackRatio;

            return signal === "BUY" ? candle.close - pullback : candle.close + pullback;
        }

        return signal === "BUY" ? ask : bid;
    }

    getStopLoss(signal, entryPrice, candles, settings, atr) {
        if (settings.type === "atr") {
            return signal === "BUY" ? entryPrice - atr * settings.distanceAtr : entryPrice + atr * settings.distanceAtr;
        }

        if (settings.type === "signal") {
            const signalCandle = candles[candles.length - 1];
            const buffer = atr * settings.bufferAtr;

            return signal === "BUY" ? signalCandle.low - buffer : signalCandle.high + buffer;
        }

        const candleCount = settings.type === "swing2" ? 2 : settings.type === "swing4" ? 4 : 0;

        if (!candleCount || candles.length < candleCount) {
            return null;
        }

        const recentCandles = candles.slice(-candleCount);
        const buffer = atr * settings.bufferAtr;

        if (signal === "BUY") {
            const swingLow = Math.min(...recentCandles.map((candle) => candle.low));

            return swingLow - buffer;
        }

        const swingHigh = Math.max(...recentCandles.map((candle) => candle.high));

        return swingHigh + buffer;
    }

    getQuality(signal, previous, current, settings, indicator, bodyRatio, spreadAtr) {
        let confirmationQuality = 0;

        if (settings.confirmation === "rsi_momentum") {
            confirmationQuality = Math.abs(indicator.rsi - 50) / 10;
        }

        if (settings.confirmation === "rsi_pullback" && Number.isFinite(indicator.rsi)) {
            confirmationQuality = Math.abs(indicator.rsi - 50) / 10;
        }

        if (settings.confirmation === "adx_strength") {
            confirmationQuality = indicator.adx.adx / 25;
        }

        if (settings.confirmation === "stochastic_turn" && Number.isFinite(indicator.stochastic?.k)) {
            const k = indicator.stochastic.k;

            confirmationQuality = (signal === "BUY" ? 100 - k : k) / 20;
        }

        const engulfingQuality = this.getPatternSignal(previous, current, "engulfing") === signal ? 1 : 0;

        const closeBreakQuality = this.getPatternSignal(previous, current, "closeBreak") === signal ? 1 : 0;

        return confirmationQuality + engulfingQuality + closeBreakQuality + bodyRatio - spreadAtr;
    }

    getPatternSignal(previous, current, pattern) {
        const buyFlip = previous.close < previous.open && current.close > current.open;

        const sellFlip = previous.close > previous.open && current.close < current.open;

        if (!buyFlip && !sellFlip) {
            return null;
        }

        const signal = buyFlip ? "BUY" : "SELL";

        if (pattern === "flip") {
            return signal;
        }

        if (pattern === "engulfing") {
            const previousLow = Math.min(previous.open, previous.close);

            const previousHigh = Math.max(previous.open, previous.close);

            const currentLow = Math.min(current.open, current.close);

            const currentHigh = Math.max(current.open, current.close);

            const engulfing = currentLow <= previousLow && currentHigh >= previousHigh;

            return engulfing ? signal : null;
        }

        if (pattern === "closeBreak") {
            const breakPassed = signal === "BUY" ? current.close > previous.high : current.close < previous.low;

            return breakPassed ? signal : null;
        }

        return null;
    }

    getBodyRatio(candle) {
        const range = candle.high - candle.low;

        if (range <= 0) {
            return 0;
        }

        return Math.abs(candle.close - candle.open) / range;
    }

    getTrend(indicator) {
        if (!indicator) {
            return null;
        }

        if (indicator.ema20 > indicator.ema50) {
            return "BUY";
        }

        if (indicator.ema20 < indicator.ema50) {
            return "SELL";
        }

        return null;
    }

    matchesTrend(signal, context, indicators) {
        if (context === "majority") {
            const trends = [this.getTrend(indicators.h1), this.getTrend(indicators.h4), this.getTrend(indicators.d1)];

            const matches = trends.filter((trend) => trend === signal).length;

            return matches >= 2;
        }

        return this.getTrend(indicators[context]) === signal;
    }

    isConfirmed(signal, settings, indicator) {
        if (settings.confirmation === "none") {
            return true;
        }

        if (settings.confirmation === "rsi_pullback") {
            const currentRsi = indicator.rsi;
            const previousRsi = indicator.rsiPrev;
            const level = settings.rsiPullbackLevel;

            if (![currentRsi, previousRsi, level].every(Number.isFinite)) {
                return false;
            }

            return signal === "BUY" ? previousRsi <= level && currentRsi > previousRsi : previousRsi >= 100 - level && currentRsi < previousRsi;
        }

        if (settings.confirmation === "rsi_momentum") {
            if (!Number.isFinite(indicator.rsi)) {
                return false;
            }

            return signal === "BUY" ? indicator.rsi >= settings.rsiMomentumLevel : indicator.rsi <= 100 - settings.rsiMomentumLevel;
        }

        if (settings.confirmation === "adx_strength") {
            const adx = indicator.adx?.adx;

            return Number.isFinite(adx) && adx >= settings.adxMin;
        }

        if (settings.confirmation === "stochastic_turn") {
            const currentK = indicator.stochastic?.k;
            const previousK = indicator.stochasticPrev?.k;
            const level = settings.stochasticLevel;

            if (![currentK, previousK, level].every(Number.isFinite)) {
                return false;
            }

            return signal === "BUY" ? previousK <= level && currentK > previousK : previousK >= 100 - level && currentK < previousK;
        }
        return false;
    }
}

export default new Strategy();
