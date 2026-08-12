class Strategy {
    // getSignal({ symbol, profile, indicators, candles, bid, ask }) {
    //     if (!symbol || !profile || !indicators || !candles) {
    //         return {
    //             signal: null,
    //             reason: "missing_data",
    //         };
    //     }

    //     const timeframe = profile.signal.timeframe.toLowerCase();
    //     const signalCandles = candles[timeframe];
    //     const signalIndicators = indicators[timeframe];

    //     if (!signalIndicators || !signalCandles || signalCandles.length < 2) {
    //         return {
    //             signal: null,
    //             reason: "not_enough_data",
    //         };
    //     }

    //     const previous = signalCandles[signalCandles.length - 2];
    //     const current = signalCandles[signalCandles.length - 1];

    //     const signal = this.getPatternSignal(previous, current, profile.signal.pattern);

    //     if (!signal) {
    //         return {
    //             signal: null,
    //             reason: "pattern_failed",
    //         };
    //     }

    //     const bodyRatio = this.getBodyRatio(current);

    //     if (bodyRatio < profile.signal.minBodyRatio) {
    //         return {
    //             signal: null,
    //             reason: "body_too_small",
    //         };
    //     }

    //     if (!this.matchesTrend(signal, profile.signal.context, indicators)) {
    //         return {
    //             signal: null,
    //             reason: "trend_failed",
    //         };
    //     }

    //     if (!this.isConfirmed(signal, profile.signal, signalIndicators)) {
    //         return {
    //             signal: null,
    //             reason: "confirmation_failed",
    //         };
    //     }

    //     const atr = Number(signalIndicators.atr);
    //     const bidPrice = Number(bid);
    //     const askPrice = Number(ask);

    //     if (!Number.isFinite(atr) || !Number.isFinite(bidPrice) || !Number.isFinite(askPrice) || atr <= 0) {
    //         return {
    //             signal: null,
    //             reason: "invalid_market_data",
    //         };
    //     }

    //     const spreadAtr = Math.abs(askPrice - bidPrice) / atr;

    //     if (spreadAtr > profile.signal.maxSpreadAtr) {
    //         return {
    //             signal: null,
    //             reason: "spread_too_large",
    //         };
    //     }

    //     const entryPrice = this.getEntryPrice(signal, current, profile.entry, atr, bidPrice, askPrice);

    //     const stopLoss = this.getStopLoss(signal, entryPrice, signalCandles, profile.stop, atr);

    //     if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss)) {
    //         return {
    //             signal: null,
    //             reason: "invalid_entry_or_stop",
    //         };
    //     }

    //     const stopDistanceAtr = Math.abs(entryPrice - stopLoss) / atr;

    //     if (stopDistanceAtr < profile.stop.minAtr || stopDistanceAtr > profile.stop.maxAtr) {
    //         return {
    //             signal: null,
    //             reason: "stop_distance_failed",
    //         };
    //     }
    //     const quality = this.getQuality(signal, previous, current, profile.signal, signalIndicators, bodyRatio, spreadAtr);

    //     return {
    //         symbol,
    //         signal,
    //         entryType: profile.entry.type,
    //         entryPrice,
    //         stopLoss,
    //         atr,
    //         quality,
    //         bodyRatio,
    //         spreadAtr,
    //         reason: `${profile.signal.pattern}_${profile.signal.timeframe}`,
    //     };
    // }

    // // helpers for getSignal
    // getEntryPrice(signal, candle, settings, atr, bid, ask) {
    //     if (settings.type === "stop") {
    //         const buffer = atr * settings.bufferAtr;

    //         return signal === "BUY" ? candle.high + buffer : candle.low - buffer;
    //     }

    //     if (settings.type === "limit") {
    //         const body = Math.abs(candle.close - candle.open);
    //         const pullback = body * settings.pullbackRatio;

    //         return signal === "BUY" ? candle.close - pullback : candle.close + pullback;
    //     }

    //     return signal === "BUY" ? ask : bid;
    // }

    // getStopLoss(signal, entryPrice, candles, settings, atr) {
    //     if (settings.type === "atr") {
    //         return signal === "BUY" ? entryPrice - atr * settings.distanceAtr : entryPrice + atr * settings.distanceAtr;
    //     }

    //     if (settings.type === "signal") {
    //         const signalCandle = candles[candles.length - 1];
    //         const buffer = atr * settings.bufferAtr;

    //         return signal === "BUY" ? signalCandle.low - buffer : signalCandle.high + buffer;
    //     }

    //     const candleCount = settings.type === "swing2" ? 2 : settings.type === "swing4" ? 4 : 0;

    //     if (!candleCount || candles.length < candleCount) {
    //         return null;
    //     }

    //     const recentCandles = candles.slice(-candleCount);
    //     const buffer = atr * settings.bufferAtr;

    //     if (signal === "BUY") {
    //         const swingLow = Math.min(...recentCandles.map((candle) => candle.low));

    //         return swingLow - buffer;
    //     }

    //     const swingHigh = Math.max(...recentCandles.map((candle) => candle.high));

    //     return swingHigh + buffer;
    // }

    // getQuality(signal, previous, current, settings, indicator, bodyRatio, spreadAtr) {
    //     let confirmationQuality = 0;

    //     if (settings.confirmation === "rsi_momentum") {
    //         confirmationQuality = Math.abs(indicator.rsi - 50) / 10;
    //     }

    //     if (settings.confirmation === "rsi_pullback" && Number.isFinite(indicator.rsi)) {
    //         confirmationQuality = Math.abs(indicator.rsi - 50) / 10;
    //     }

    //     if (settings.confirmation === "adx_strength") {
    //         confirmationQuality = indicator.adx.adx / 25;
    //     }

    //     if (settings.confirmation === "stochastic_turn" && Number.isFinite(indicator.stochastic?.k)) {
    //         const k = indicator.stochastic.k;

    //         confirmationQuality = (signal === "BUY" ? 100 - k : k) / 20;
    //     }

    //     const engulfingQuality = this.getPatternSignal(previous, current, "engulfing") === signal ? 1 : 0;

    //     const closeBreakQuality = this.getPatternSignal(previous, current, "closeBreak") === signal ? 1 : 0;

    //     return confirmationQuality + engulfingQuality + closeBreakQuality + bodyRatio - spreadAtr;
    // }

    // getPatternSignal(previous, current, pattern) {
    //     const buyFlip = previous.close < previous.open && current.close > current.open;

    //     const sellFlip = previous.close > previous.open && current.close < current.open;

    //     if (!buyFlip && !sellFlip) {
    //         return null;
    //     }

    //     const signal = buyFlip ? "BUY" : "SELL";

    //     if (pattern === "flip") {
    //         return signal;
    //     }

    //     if (pattern === "engulfing") {
    //         const previousLow = Math.min(previous.open, previous.close);

    //         const previousHigh = Math.max(previous.open, previous.close);

    //         const currentLow = Math.min(current.open, current.close);

    //         const currentHigh = Math.max(current.open, current.close);

    //         const engulfing = currentLow <= previousLow && currentHigh >= previousHigh;

    //         return engulfing ? signal : null;
    //     }

    //     if (pattern === "closeBreak") {
    //         const breakPassed = signal === "BUY" ? current.close > previous.high : current.close < previous.low;

    //         return breakPassed ? signal : null;
    //     }

    //     return null;
    // }

    getBodyRatio(candle) {
        const range = candle.high - candle.low;

        if (range <= 0) {
            return 0;
        }

        return Math.abs(candle.close - candle.open) / range;
    }

    // isConfirmed(signal, settings, indicator) {
    //     if (settings.confirmation === "none") {
    //         return true;
    //     }

    //     if (settings.confirmation === "rsi_pullback") {
    //         const currentRsi = indicator.rsi;
    //         const previousRsi = indicator.rsiPrev;
    //         const level = settings.rsiPullbackLevel;

    //         if (![currentRsi, previousRsi, level].every(Number.isFinite)) {
    //             return false;
    //         }

    //         return signal === "BUY" ? previousRsi <= level && currentRsi > previousRsi : previousRsi >= 100 - level && currentRsi < previousRsi;
    //     }

    //     if (settings.confirmation === "rsi_momentum") {
    //         if (!Number.isFinite(indicator.rsi)) {
    //             return false;
    //         }

    //         return signal === "BUY" ? indicator.rsi >= settings.rsiMomentumLevel : indicator.rsi <= 100 - settings.rsiMomentumLevel;
    //     }

    //     if (settings.confirmation === "adx_strength") {
    //         const adx = indicator.adx?.adx;

    //         return Number.isFinite(adx) && adx >= settings.adxMin;
    //     }

    //     if (settings.confirmation === "stochastic_turn") {
    //         const currentK = indicator.stochastic?.k;
    //         const previousK = indicator.stochasticPrev?.k;
    //         const level = settings.stochasticLevel;

    //         if (![currentK, previousK, level].every(Number.isFinite)) {
    //             return false;
    //         }

    //         return signal === "BUY" ? previousK <= level && currentK > previousK : previousK >= 100 - level && currentK < previousK;
    //     }
    //     return false;
    // }

    getSignal({ symbol, profile, indicators, candles, bid, ask }) {
        if (!symbol || !indicators || !candles) {
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

        const trend = this.getTrend(indicators.m15);

        const signal = this.greenRedCandlePattern(trend, previous, current);

        if (!signal) {
            return {
                signal: null,
                reason: "pattern_failed",
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

        return {
            symbol,
            signal,
            entryType: profile.entry.type,
            entryPrice,
            stopLoss,

            quality,
            bodyRatio,
            spreadAtr,
            reason: `${profile.signal.pattern}_${profile.signal.timeframe}`,
        };
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

    // scoring strategy
    scoring = () => {
        const ema9h1 = indicators.h1.ema9;
        const emaFastH1 = indicators.h1.emaFast;
        const emaSlowH1 = indicators.h1.emaSlow;
        const h1Trend = this.getTrend(indicators.h1);
        const fixedH1Adx = Number(indicators.h1.adx.adx.toFixed(2));
        const fixedM15Adx = Number(indicators.m15.adx.adx.toFixed(2));
        const fixedM15Atr = Number(indicators.m15.atr.toFixed(4));
        const patternDir = this.greenRedCandlePattern(h1Trend, prev, last);
        const getClose = (c) => c.close;
        const lastClose = getClose(last);
        // Build conditions explicitly
        const buyConditions = [
            patternDir === "bullish",
            emaFastH1 != null && emaSlowH1 != null ? emaFastH1 > emaSlowH1 : false,
            ema9h1 != null ? lastClose > ema9h1 : false,
            indicators.m15.macd.histogram != null ? indicators.m15.macd.histogram > 0 : false,
        ];
        const sellConditions = [
            patternDir === "bearish",
            emaFastH1 != null && emaSlowH1 != null ? emaFastH1 < emaSlowH1 : false,
            ema9h1 != null ? lastClose < ema9h1 : false,
            indicators.m15.macd.histogram != null ? indicators.m15.macd.histogram < 0 : false,
        ];
        const buyScore = buyConditions.filter(Boolean).length;
        const sellScore = sellConditions.filter(Boolean).length;
        logger.info(`[Signal Analysis] ${symbol}
            Pattern: ${patternDir}
            RequiredScore: ${REQUIRED_SCORE}
            BuyScore:  ${buyScore}/${buyConditions.length} | [${buyConditions.map(Boolean)}]
            SellScore: ${sellScore}/${sellConditions.length} | [${sellConditions.map(Boolean)}]
            M15 MACD hist: ${indicators.m15.macd.histogram}
            M15 RSI: ${indicators.m15.rsi}
            M15 ADX: ${fixedM15Adx}
            M15 ATR: ${fixedM15Atr}
            H1 ADX: ${fixedH1Adx}
        `);
        const longOK = buyScore >= REQUIRED_SCORE && fixedH1Adx > 15.0;
        const shortOK = sellScore >= REQUIRED_SCORE && fixedM15Adx > 15.0;
        let signal = null;
        let reason = null;
        if (longOK && !shortOK) {
            signal = "BUY";
        } else if (shortOK && !longOK) {
            signal = "SELL";
        } else if (longOK && shortOK) {
            // If both sides qualify, follow the pattern direction if any
            if (patternDir === "bullish") signal = "BUY";
            else if (patternDir === "bearish") signal = "SELL";
            else reason = "both_sides_ok";
        } else {
            reason = `score_too_low: buy ${buyScore}/${REQUIRED_SCORE}, sell ${sellScore}/${REQUIRED_SCORE}`;
        }
        if (!signal) return { signal: null, reason };
        if (fixedM15Atr < 0.0005) {
            logger.info(`[Signal] ${symbol}: ATR too low, skipping signal.`);
            return { signal: null, reason: "low_volatility" };
        }
        return { signal, reason: "rules" };
    };

    // Green Red Candle Pattern
    greenRedCandlePattern = (trend, prev, last) => {
        if (!prev || !last || !trend) return false;

        // Support both {open, close} and {o, c}
        const getOpen = (c) => (typeof c.o !== "undefined" ? c.o : c.open);
        const getClose = (c) => (typeof c.c !== "undefined" ? c.c : c.close);

        if (getOpen(prev) == null || getClose(prev) == null || getOpen(last) == null || getClose(last) == null) {
            return false;
        }

        const isBullish = (c) => getClose(c) > getOpen(c);
        const isBearish = (c) => getClose(c) < getOpen(c);

        const trendDirection = String(trend).toLowerCase();

        if (trendDirection === "bullish" && isBearish(prev) && isBullish(last)) {
            // red -> green in bullish trend
            return "bullish";
        }
        if (trendDirection === "bearish" && isBullish(prev) && isBearish(last)) {
            // green -> red in bearish trend
            return "bearish";
        }
        return false;
    };
}

export default new Strategy();
