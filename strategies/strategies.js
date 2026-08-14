class Strategy {
    getSignal(context) {
        const { symbol, profile, indicators, candles } = context ?? {};

        if (!symbol || !profile || !indicators || !candles) {
            return {
                signal: null,
                reason: "missing_data",
            };
        }

        // Pair-specific strategies are connected here. When another pair gets
        // its own researched rules, add one clearly named case below.
        switch (symbol.toUpperCase()) {
            case "EURUSD":
                if (profile.strategy?.name !== "eurusdLondonCloseBreakout") {
                    return {
                        signal: null,
                        reason: "eurusd_strategy_not_configured",
                    };
                }

                return this.getEurUsdLondonCloseBreakoutSignal(context);

            case "GBPJPY":
                if (profile.strategy?.name !== "gbpjpyLondonStructuralContinuation") {
                    return {
                        signal: null,
                        reason: "gbpjpy_strategy_not_configured",
                    };
                }

                return this.getGbpJpyLondonStructuralSignal(context);

            case "GBPUSD":
                if (profile.strategy?.name !== "gbpusdLondonOverlapM15EmaCross") {
                    return {
                        signal: null,
                        reason: "gbpusd_strategy_not_configured",
                    };
                }

                return this.getGbpUsdM15EmaCrossSignal(context);

            default:
                return this.getGreenRedSignal(context);
        }
    }

    getGreenRedSignal({ symbol, profile, indicators, candles, bid, ask }) {
        const timeframe = profile.signal.timeframe.toLowerCase();
        const signalCandles = candles[timeframe];
        const signalIndicators = indicators[timeframe];

        if (!signalIndicators || !Array.isArray(signalCandles) || signalCandles.length < 12) {
            return {
                signal: null,
                reason: "not_enough_data",
            };
        }

        const previous = signalCandles[signalCandles.length - 2];
        const current = signalCandles[signalCandles.length - 1];

        // Green-Red belongs only to this fallback strategy, so its complete
        // definition stays here instead of being hidden in a class helper.
        const movementCandles = signalCandles.slice(0, -2).slice(-15);
        let signal = null;

        if (
            movementCandles.length >= 10 &&
            [...movementCandles, previous, current].every((candle) =>
                [candle?.open, candle?.close].every(Number.isFinite),
            )
        ) {
            const movementStart = movementCandles[0].open;
            const movementEnd = movementCandles[movementCandles.length - 1].close;
            const netMove = movementEnd - movementStart;
            let travelled = 0;
            let previousPrice = movementStart;
            let bullishCandles = 0;
            let bearishCandles = 0;
            let totalBody = 0;

            for (const candle of movementCandles) {
                travelled += Math.abs(candle.close - previousPrice);
                totalBody += Math.abs(candle.close - candle.open);
                if (candle.close > candle.open) bullishCandles += 1;
                if (candle.close < candle.open) bearishCandles += 1;
                previousPrice = candle.close;
            }

            const averageBody = totalBody / movementCandles.length;
            const efficiency = travelled > 0 ? Math.abs(netMove) / travelled : 0;
            const directionalMinimum = Math.ceil(movementCandles.length * 0.55);
            const meaningfulMove = averageBody > 0 && Math.abs(netMove) >= averageBody * 2.5;
            const redToGreen = previous.close < previous.open && current.close > current.open;
            const greenToRed = previous.close > previous.open && current.close < current.open;

            if (meaningfulMove && efficiency >= 0.3 && netMove > 0 && bullishCandles >= directionalMinimum && redToGreen) {
                signal = "BUY";
            } else if (meaningfulMove && efficiency >= 0.3 && netMove < 0 && bearishCandles >= directionalMinimum && greenToRed) {
                signal = "SELL";
            }
        }

        if (!signal) {
            return {
                signal: null,
                reason: "pattern_failed",
            };
        }

        const atr = Number(signalIndicators.atr);
        const bidPrice = Number(bid);
        const askPrice = Number(ask);
        const hasValidMarketData =
            Number.isFinite(atr) &&
            Number.isFinite(bidPrice) &&
            Number.isFinite(askPrice) &&
            atr > 0 &&
            bidPrice > 0 &&
            askPrice >= bidPrice;

        if (!hasValidMarketData) {
            return {
                signal: null,
                reason: "invalid_market_data",
            };
        }

        const spread = askPrice - bidPrice;
        const spreadAtr = spread / atr;
        const maxSpreadAtr = Number(profile.signal.maxSpreadAtr);

        if (Number.isFinite(maxSpreadAtr) && spreadAtr > maxSpreadAtr) {
            return {
                signal: null,
                reason: "spread_too_large",
            };
        }

        const candleRange = Number(current.high) - Number(current.low);
        const candleBody = Math.abs(Number(current.close) - Number(current.open));
        const bodyRatio = candleRange > 0 ? candleBody / candleRange : 0;
        const bodyAtr = candleBody / atr;

        if (![candleRange, candleBody, bodyRatio, bodyAtr].every(Number.isFinite) || candleRange <= 0 || bodyAtr < Number(profile.signal.minBody ?? 0)) {
            return {
                signal: null,
                reason: "body_too_small",
            };
        }

        const entryBuffer = atr * Number(profile.entry.bufferAtr ?? 0);
        const rawEntryPrice =
            profile.entry.type === "stop"
                ? signal === "BUY"
                    ? Number(current.high) + entryBuffer
                    : Number(current.low) - entryBuffer
                : null;
        const entryPrice = Number.isFinite(rawEntryPrice) ? (signal === "BUY" ? rawEntryPrice + spread : rawEntryPrice) : null;

        const stopBuffer = atr * Number(profile.stop.bufferAtr ?? 0);
        let rawStopLoss = null;

        if (profile.stop.type === "atr") {
            rawStopLoss = signal === "BUY" ? entryPrice - atr * profile.stop.distanceAtr : entryPrice + atr * profile.stop.distanceAtr;
        } else if (profile.stop.type === "signal") {
            rawStopLoss = signal === "BUY" ? Number(current.low) - stopBuffer : Number(current.high) + stopBuffer;
        } else {
            const candleCount = profile.stop.type === "swing2" ? 2 : profile.stop.type === "swing4" ? 4 : 0;
            const recentCandles = candleCount ? signalCandles.slice(-candleCount) : [];

            if (recentCandles.length === candleCount) {
                rawStopLoss =
                    signal === "BUY"
                        ? Math.min(...recentCandles.map((candle) => Number(candle.low))) - stopBuffer
                        : Math.max(...recentCandles.map((candle) => Number(candle.high))) + stopBuffer;
            }
        }
        const stopLoss = Number.isFinite(rawStopLoss) ? (signal === "SELL" ? rawStopLoss + spread : rawStopLoss) : null;

        if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss)) {
            return {
                signal: null,
                reason: "invalid_entry_or_stop",
            };
        }

        const stopDistanceAtr = Math.abs(entryPrice - stopLoss) / atr;
        const minStopAtr = Number(profile.stop.minAtr);
        const maxStopAtr = Number(profile.stop.maxAtr);

        if (!(stopDistanceAtr > 0) || (Number.isFinite(minStopAtr) && stopDistanceAtr < minStopAtr) || (Number.isFinite(maxStopAtr) && stopDistanceAtr > maxStopAtr)) {
            return {
                signal: null,
                reason: "stop_distance_failed",
            };
        }

        const quality = bodyRatio + bodyAtr - spreadAtr;

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
            reason: `green_red_${profile.signal.timeframe}`,
        };
    }

    /**
     * EUR/USD London close breakout.
     *
     * 1. Build the high/low range from 07:00 until 08:00 London time.
     * 2. Between 08:00 and 12:00, wait for a closed M15 candle to cross it.
     * 3. Place a pending STOP at the signal-candle extreme.
     * 4. Put the stop behind the opposite side of the London range.
     */
    getEurUsdLondonCloseBreakoutSignal({ symbol, profile, indicators, candles, bid, ask }) {
        const settings = profile.strategy;
        const timeframe = profile.signal.timeframe.toLowerCase();
        const signalCandles = candles[timeframe];
        const signalIndicators = indicators[timeframe];

        if (!signalIndicators || !Array.isArray(signalCandles) || signalCandles.length < 6) {
            return {
                signal: null,
                reason: "not_enough_data",
            };
        }

        if (profile.stop?.type !== "londonRange") {
            return {
                signal: null,
                reason: "invalid_eurusd_stop_config",
            };
        }

        const atr = Number(signalIndicators.atr);
        const bidPrice = Number(bid);
        const askPrice = Number(ask);
        const hasValidMarketData =
            Number.isFinite(atr) &&
            Number.isFinite(bidPrice) &&
            Number.isFinite(askPrice) &&
            atr > 0 &&
            bidPrice > 0 &&
            askPrice >= bidPrice;

        if (!hasValidMarketData) {
            return {
                signal: null,
                reason: "invalid_market_data",
            };
        }

        const spread = askPrice - bidPrice;
        const spreadAtr = spread / atr;
        const maxSpreadAtr = Number(profile.signal.maxSpreadAtr);

        if (Number.isFinite(maxSpreadAtr) && spreadAtr > maxSpreadAtr) {
            return {
                signal: null,
                reason: "spread_too_large",
            };
        }

        const current = signalCandles[signalCandles.length - 1];
        const previous = signalCandles[signalCandles.length - 2];
        let formatter = null;

        try {
            formatter = new Intl.DateTimeFormat("en-GB", {
                timeZone: settings.timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            });
        } catch {
            return {
                signal: null,
                reason: "invalid_eurusd_time_zone",
            };
        }

        const getLondonTime = (candle) => {
            const timestamp = Date.parse(candle?.timestamp);
            if (!Number.isFinite(timestamp)) return null;

            const parts = Object.fromEntries(
                formatter.formatToParts(timestamp).map(({ type, value }) => [type, value]),
            );
            const hour = Number(parts.hour);
            const minute = Number(parts.minute);
            if (![hour, minute].every(Number.isFinite)) return null;

            return {
                date: `${parts.year}-${parts.month}-${parts.day}`,
                minute: hour * 60 + minute,
            };
        };

        const currentTime = getLondonTime(current);
        const previousTime = getLondonTime(previous);

        if (!currentTime || !previousTime) {
            return {
                signal: null,
                reason: "invalid_candle_time",
            };
        }

        const isInsideSignalWindow =
            currentTime.minute >= settings.signalStartMinute && currentTime.minute < settings.signalEndMinute;

        if (!isInsideSignalWindow || previousTime.date !== currentTime.date) {
            return {
                signal: null,
                reason: "outside_eurusd_signal_window",
            };
        }

        const rangeCandles = signalCandles.filter((candle) => {
            const candleTime = getLondonTime(candle);

            return (
                candleTime?.date === currentTime.date &&
                candleTime.minute >= settings.rangeStartMinute &&
                candleTime.minute < settings.rangeEndMinute
            );
        });

        if (rangeCandles.length < settings.minimumRangeCandles) {
            return {
                signal: null,
                reason: "london_range_incomplete",
            };
        }

        const rangeHighBid = Math.max(...rangeCandles.map((candle) => Number(candle.high)));
        const rangeLowBid = Math.min(...rangeCandles.map((candle) => Number(candle.low)));
        const previousCloseBid = Number(previous.close);
        const currentOpenBid = Number(current.open);
        const currentCloseBid = Number(current.close);
        const currentHighBid = Number(current.high);
        const currentLowBid = Number(current.low);

        const candlePrices = [rangeHighBid, rangeLowBid, previousCloseBid, currentOpenBid, currentCloseBid, currentHighBid, currentLowBid];
        const hasValidCandlePrices = candlePrices.every(Number.isFinite) && rangeHighBid > rangeLowBid;

        if (!hasValidCandlePrices) {
            return {
                signal: null,
                reason: "invalid_candle_prices",
            };
        }

        // Historical candles contain bid prices. Add the current spread where
        // the executable ask side is needed for BUY entries and SELL checks.
        const rangeHighAsk = rangeHighBid + spread;
        const previousCloseAsk = previousCloseBid + spread;
        const currentCloseAsk = currentCloseBid + spread;

        const mustCrossRangeBoundary = settings.requirePreviousCloseBeforeBreak !== false;
        const buyStartedBeforeBoundary = !mustCrossRangeBoundary || previousCloseBid <= rangeHighAsk;
        const sellStartedBeforeBoundary = !mustCrossRangeBoundary || previousCloseAsk >= rangeLowBid;
        const buyBreakout = buyStartedBeforeBoundary && currentCloseBid > rangeHighAsk;
        const sellBreakout = sellStartedBeforeBoundary && currentCloseAsk < rangeLowBid;
        const signal = buyBreakout ? "BUY" : sellBreakout ? "SELL" : null;

        if (!signal) {
            return {
                signal: null,
                reason: "london_range_not_broken",
            };
        }

        const stopBuffer = atr * Number(profile.stop.bufferAtr ?? 0);
        const entryPrice = signal === "BUY" ? currentHighBid + spread : currentLowBid;
        const stopLoss = signal === "BUY" ? rangeLowBid - stopBuffer : rangeHighAsk + stopBuffer;
        const hasValidStop = signal === "BUY" ? stopLoss < entryPrice : stopLoss > entryPrice;

        if (![entryPrice, stopLoss, stopBuffer].every(Number.isFinite) || !hasValidStop) {
            return {
                signal: null,
                reason: "invalid_entry_or_stop",
            };
        }

        const candleRange = currentHighBid - currentLowBid;
        const candleBody = Math.abs(currentCloseBid - currentOpenBid);
        const bodyRatio = candleRange > 0 ? candleBody / candleRange : 0;
        const breakoutDistance = signal === "BUY" ? currentCloseBid - rangeHighAsk : rangeLowBid - currentCloseAsk;
        const quality = breakoutDistance / atr - spreadAtr;

        return {
            symbol,
            strategy: settings.name,
            signal,
            entryType: profile.entry.type,
            entryPrice,
            stopLoss,
            atr,
            quality,
            bodyRatio,
            spreadAtr,
            sessionRange: {
                high: rangeHighAsk,
                low: rangeLowBid,
            },
            reason: `eurusd_london_close_breakout_${profile.signal.timeframe}`,
        };
    }

    /**
     * GBP/JPY London structural continuation.
     *
     * The setup is a directional M15 impulse, a 1-6 candle pullback and the
     * first candle that resumes the impulse. H1 or H4 must point in the same
     * direction. No EMA, RSI, MACD or Green-Red trigger is used here.
     */
    getGbpJpyLondonStructuralSignal({ symbol, profile, indicators, candles, bid, ask }) {
        const settings = profile.strategy;
        const timeframe = profile.signal.timeframe.toLowerCase();
        const signalCandles = candles[timeframe];
        const signalIndicators = indicators[timeframe];
        const h1Candles = candles.h1;
        const h4Candles = candles.h4;

        if (
            !signalIndicators ||
            !Array.isArray(signalCandles) ||
            !Array.isArray(h1Candles) ||
            !Array.isArray(h4Candles) ||
            signalCandles.length < settings.impulseContextBars + settings.maximumPullbackBars + 2
        ) {
            return {
                signal: null,
                reason: "not_enough_data",
            };
        }

        const atr = Number(signalIndicators.atr);
        const bidPrice = Number(bid);
        const askPrice = Number(ask);
        const hasValidMarketData =
            Number.isFinite(atr) &&
            Number.isFinite(bidPrice) &&
            Number.isFinite(askPrice) &&
            atr > 0 &&
            bidPrice > 0 &&
            askPrice >= bidPrice;

        if (!hasValidMarketData) {
            return {
                signal: null,
                reason: "invalid_market_data",
            };
        }

        const spread = askPrice - bidPrice;
        const spreadAtr = spread / atr;
        const maxSpreadAtr = Number(profile.signal.maxSpreadAtr);

        if (Number.isFinite(maxSpreadAtr) && spreadAtr > maxSpreadAtr) {
            return {
                signal: null,
                reason: "spread_too_large",
            };
        }

        const current = signalCandles[signalCandles.length - 1];
        let londonFormatter = null;
        let newYorkFormatter = null;

        try {
            const formatterOptions = {
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            };
            londonFormatter = new Intl.DateTimeFormat("en-GB", {
                ...formatterOptions,
                timeZone: settings.londonTimeZone,
            });
            newYorkFormatter = new Intl.DateTimeFormat("en-GB", {
                ...formatterOptions,
                timeZone: settings.newYorkTimeZone,
            });
        } catch {
            return {
                signal: null,
                reason: "invalid_gbpjpy_time_zone",
            };
        }

        const getSessionMinute = (formatter) => {
            const timestamp = Date.parse(current?.timestamp);
            if (!Number.isFinite(timestamp)) return null;

            const parts = Object.fromEntries(
                formatter.formatToParts(timestamp).map(({ type, value }) => [type, value]),
            );
            const hour = Number(parts.hour);
            const minute = Number(parts.minute);
            return [hour, minute].every(Number.isFinite) ? hour * 60 + minute : null;
        };

        const londonMinute = getSessionMinute(londonFormatter);
        const newYorkMinute = getSessionMinute(newYorkFormatter);

        if (!Number.isFinite(londonMinute) || !Number.isFinite(newYorkMinute)) {
            return {
                signal: null,
                reason: "invalid_candle_time",
            };
        }

        const londonSessionIsOpen =
            londonMinute >= settings.londonOpenMinute && newYorkMinute < settings.newYorkOpenMinute;

        if (!londonSessionIsOpen) {
            return {
                signal: null,
                reason: "outside_gbpjpy_london_session",
            };
        }

        const getStructuralSetup = (signal) => {
            const currentIndex = signalCandles.length - 1;
            const followsDirection = (candle) =>
                signal === "BUY"
                    ? Number(candle?.close) > Number(candle?.open)
                    : Number(candle?.close) < Number(candle?.open);
            const opposesDirection = (candle) =>
                signal === "BUY"
                    ? Number(candle?.close) < Number(candle?.open)
                    : Number(candle?.close) > Number(candle?.open);

            if (!followsDirection(current)) return null;

            let pullbackBars = 0;
            for (let index = currentIndex - 1; index >= 0 && opposesDirection(signalCandles[index]); index -= 1) {
                pullbackBars += 1;
            }

            if (pullbackBars < settings.minimumPullbackBars || pullbackBars > settings.maximumPullbackBars) {
                return null;
            }

            const impulseEnd = currentIndex - pullbackBars - 1;
            if (impulseEnd < 0 || !followsDirection(signalCandles[impulseEnd])) return null;

            let impulseStart = impulseEnd;
            while (
                impulseStart > 0 &&
                impulseEnd - impulseStart < settings.maximumImpulseBars - 1 &&
                followsDirection(signalCandles[impulseStart - 1])
            ) {
                impulseStart -= 1;
            }

            const impulseContext = signalCandles.slice(
                Math.max(0, impulseStart - settings.impulseContextBars),
                impulseEnd + 1,
            );
            const impulseCandles = signalCandles.slice(impulseStart, impulseEnd + 1);
            const pullbackCandles = signalCandles.slice(impulseEnd + 1, currentIndex);
            const highs = (values) => values.map((candle) => Number(candle.high));
            const lows = (values) => values.map((candle) => Number(candle.low));
            let impulseAtr;
            let swingGapAtr;
            let retrace;

            if (signal === "SELL") {
                const priorSwing = Math.max(...highs(impulseContext));
                const impulseExtreme = Math.min(...lows(impulseCandles));
                const pullbackExtreme = Math.max(...highs(pullbackCandles));
                const impulseDistance = priorSwing - impulseExtreme;
                impulseAtr = impulseDistance / atr;
                swingGapAtr = (priorSwing - pullbackExtreme) / atr;
                retrace = impulseDistance > 0 ? (pullbackExtreme - impulseExtreme) / impulseDistance : null;
            } else {
                const priorSwing = Math.min(...lows(impulseContext));
                const impulseExtreme = Math.max(...highs(impulseCandles));
                const pullbackExtreme = Math.min(...lows(pullbackCandles));
                const impulseDistance = impulseExtreme - priorSwing;
                impulseAtr = impulseDistance / atr;
                swingGapAtr = (pullbackExtreme - priorSwing) / atr;
                retrace = impulseDistance > 0 ? (impulseExtreme - pullbackExtreme) / impulseDistance : null;
            }

            const signalBodyAtr = Math.abs(Number(current.close) - Number(current.open)) / atr;
            const passesThresholds =
                [impulseAtr, swingGapAtr, retrace, signalBodyAtr].every(Number.isFinite) &&
                impulseAtr >= settings.minImpulseAtr &&
                swingGapAtr >= settings.minSwingGapAtr &&
                signalBodyAtr >= settings.minSignalBodyAtr &&
                retrace <= settings.maxRetrace;

            return passesThresholds
                ? { signal, pullbackBars, impulseAtr, swingGapAtr, retrace, signalBodyAtr }
                : null;
        };

        const buySetup = getStructuralSetup("BUY");
        const sellSetup = getStructuralSetup("SELL");
        const setup = buySetup ?? sellSetup;

        if (!setup) {
            return {
                signal: null,
                reason: "gbpjpy_structure_failed",
            };
        }

        const confirmationFrames = { H1: h1Candles, H4: h4Candles };
        const confirmations = settings.confirmationFrames.filter((frame) => {
            const frameCandles = confirmationFrames[frame];
            const lookback = settings.confirmationLookbackBars;
            if (!Array.isArray(frameCandles) || frameCandles.length <= lookback) return false;

            const currentClose = Number(frameCandles[frameCandles.length - 1].close);
            const previousClose = Number(frameCandles[frameCandles.length - 1 - lookback].close);
            if (![currentClose, previousClose].every(Number.isFinite)) return false;

            return setup.signal === "BUY" ? currentClose >= previousClose : currentClose <= previousClose;
        });

        if (confirmations.length < settings.minimumConfirmations) {
            return {
                signal: null,
                reason: "gbpjpy_context_failed",
            };
        }

        const currentOpenBid = Number(current.open);
        const currentHighBid = Number(current.high);
        const currentLowBid = Number(current.low);
        const currentCloseBid = Number(current.close);
        const stopBuffer = atr * Number(profile.stop.bufferAtr ?? 0);
        const entryPrice = setup.signal === "BUY" ? currentHighBid + spread : currentLowBid;
        const stopLoss = setup.signal === "BUY" ? currentLowBid - stopBuffer : currentHighBid + spread + stopBuffer;
        const hasValidPrices = [currentOpenBid, currentHighBid, currentLowBid, currentCloseBid, stopBuffer, entryPrice, stopLoss].every(Number.isFinite);
        const hasValidStop = setup.signal === "BUY" ? stopLoss < entryPrice : stopLoss > entryPrice;

        if (!hasValidPrices || !hasValidStop) {
            return {
                signal: null,
                reason: "invalid_entry_or_stop",
            };
        }

        const candleRange = currentHighBid - currentLowBid;
        const candleBody = Math.abs(currentCloseBid - currentOpenBid);
        const bodyRatio = candleRange > 0 ? candleBody / candleRange : 0;
        const quality =
            setup.impulseAtr +
            setup.swingGapAtr +
            setup.signalBodyAtr +
            confirmations.length -
            setup.retrace -
            spreadAtr;

        return {
            symbol,
            strategy: settings.name,
            signal: setup.signal,
            entryType: profile.entry.type,
            entryPrice,
            stopLoss,
            pendingInvalidationPrice: profile.entry.cancelIfStopTouchedBeforeEntry ? stopLoss : null,
            atr,
            quality,
            bodyRatio,
            spreadAtr,
            structure: {
                pullbackBars: setup.pullbackBars,
                impulseAtr: setup.impulseAtr,
                swingGapAtr: setup.swingGapAtr,
                retrace: setup.retrace,
                signalBodyAtr: setup.signalBodyAtr,
                confirmations,
            },
            reason: `gbpjpy_london_structural_continuation_${profile.signal.timeframe}`,
        };
    }

    /**
     * GBP/USD M15 EMA cross during London and the London/New York overlap.
     *
     * The function is intentionally self-contained: session conversion, EMA
     * calculation, signal, entry and stop are visible in one place.
     */
    getGbpUsdM15EmaCrossSignal({ symbol, profile, indicators, candles, bid, ask }) {
        const settings = profile.strategy;
        const timeframe = profile.signal.timeframe.toLowerCase();
        const signalCandles = candles[timeframe];
        const signalIndicators = indicators[timeframe];
        const minimumCandles = settings.slowEmaPeriod + 2;

        if (!signalIndicators || !Array.isArray(signalCandles) || signalCandles.length < minimumCandles) {
            return {
                signal: null,
                reason: "not_enough_data",
            };
        }

        if (profile.stop?.type !== "signal") {
            return {
                signal: null,
                reason: "invalid_gbpusd_stop_config",
            };
        }

        const atr = Number(signalIndicators.atr);
        const bidPrice = Number(bid);
        const askPrice = Number(ask);
        const hasValidMarketData =
            Number.isFinite(atr) &&
            Number.isFinite(bidPrice) &&
            Number.isFinite(askPrice) &&
            atr > 0 &&
            bidPrice > 0 &&
            askPrice >= bidPrice;

        if (!hasValidMarketData) {
            return {
                signal: null,
                reason: "invalid_market_data",
            };
        }

        const spread = askPrice - bidPrice;
        const spreadAtr = spread / atr;
        const maxSpreadAtr = Number(profile.signal.maxSpreadAtr);

        if (Number.isFinite(maxSpreadAtr) && spreadAtr > maxSpreadAtr) {
            return {
                signal: null,
                reason: "spread_too_large",
            };
        }

        const current = signalCandles[signalCandles.length - 1];
        let londonFormatter = null;

        try {
            londonFormatter = new Intl.DateTimeFormat("en-GB", {
                timeZone: settings.timeZone,
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            });
        } catch {
            return {
                signal: null,
                reason: "invalid_gbpusd_time_zone",
            };
        }

        const timestamp = Date.parse(current?.timestamp);
        if (!Number.isFinite(timestamp)) {
            return {
                signal: null,
                reason: "invalid_candle_time",
            };
        }

        const timeParts = Object.fromEntries(
            londonFormatter.formatToParts(timestamp).map(({ type, value }) => [type, value]),
        );
        const londonHour = Number(timeParts.hour);
        const londonMinutePart = Number(timeParts.minute);
        const londonMinute = londonHour * 60 + londonMinutePart;

        if (![londonHour, londonMinutePart, londonMinute].every(Number.isFinite)) {
            return {
                signal: null,
                reason: "invalid_candle_time",
            };
        }

        if (londonMinute < settings.sessionStartMinute || londonMinute >= settings.sessionEndMinute) {
            return {
                signal: null,
                reason: "outside_gbpusd_london_overlap_session",
            };
        }

        const closes = signalCandles.map((candle) => Number(candle.close));
        if (!closes.every(Number.isFinite)) {
            return {
                signal: null,
                reason: "invalid_candle_prices",
            };
        }

        // Standard EMA: seed with an SMA, then apply the recursive multiplier.
        const calculateEma = (period) => {
            const multiplier = 2 / (period + 1);
            let ema = closes.slice(0, period).reduce((sum, close) => sum + close, 0) / period;
            const values = Array(period - 1).fill(null);
            values.push(ema);

            for (let index = period; index < closes.length; index += 1) {
                ema = (closes[index] - ema) * multiplier + ema;
                values.push(ema);
            }

            return values;
        };

        const fastEma = calculateEma(settings.fastEmaPeriod);
        const slowEma = calculateEma(settings.slowEmaPeriod);
        const currentFast = fastEma[fastEma.length - 1];
        const previousFast = fastEma[fastEma.length - 2];
        const currentSlow = slowEma[slowEma.length - 1];
        const previousSlow = slowEma[slowEma.length - 2];

        if (![currentFast, previousFast, currentSlow, previousSlow].every(Number.isFinite)) {
            return {
                signal: null,
                reason: "ema_not_ready",
            };
        }

        const buyCross = previousFast <= previousSlow && currentFast > currentSlow;
        const sellCross = previousFast >= previousSlow && currentFast < currentSlow;
        const signal = buyCross ? "BUY" : sellCross ? "SELL" : null;

        if (!signal) {
            return {
                signal: null,
                reason: "gbpusd_ema_cross_failed",
            };
        }

        const currentOpenBid = Number(current.open);
        const currentHighBid = Number(current.high);
        const currentLowBid = Number(current.low);
        const currentCloseBid = Number(current.close);
        const stopBuffer = atr * Number(profile.stop.bufferAtr ?? 0);
        const entryPrice = signal === "BUY" ? currentHighBid + spread : currentLowBid;
        const stopLoss = signal === "BUY" ? currentLowBid - stopBuffer : currentHighBid + spread + stopBuffer;
        const prices = [currentOpenBid, currentHighBid, currentLowBid, currentCloseBid, stopBuffer, entryPrice, stopLoss];
        const hasValidStop = signal === "BUY" ? stopLoss < entryPrice : stopLoss > entryPrice;

        if (!prices.every(Number.isFinite) || !hasValidStop) {
            return {
                signal: null,
                reason: "invalid_entry_or_stop",
            };
        }

        const candleRange = currentHighBid - currentLowBid;
        const candleBody = Math.abs(currentCloseBid - currentOpenBid);
        const bodyRatio = candleRange > 0 ? candleBody / candleRange : 0;
        const emaDistanceAtr = Math.abs(currentFast - currentSlow) / atr;
        const emaCrossSpeedAtr = Math.abs((currentFast - currentSlow) - (previousFast - previousSlow)) / atr;
        const quality = emaDistanceAtr + emaCrossSpeedAtr - spreadAtr;

        return {
            symbol,
            strategy: settings.name,
            signal,
            entryType: profile.entry.type,
            entryPrice,
            stopLoss,
            pendingInvalidationPrice: profile.entry.cancelIfStopTouchedBeforeEntry ? stopLoss : null,
            atr,
            quality,
            bodyRatio,
            spreadAtr,
            ema: {
                fast: currentFast,
                slow: currentSlow,
                fastPeriod: settings.fastEmaPeriod,
                slowPeriod: settings.slowEmaPeriod,
            },
            reason: `gbpusd_m15_ema_cross_${profile.signal.timeframe}`,
        };
    }

}

export default new Strategy();
