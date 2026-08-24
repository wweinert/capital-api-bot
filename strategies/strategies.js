import { ATR } from "technicalindicators";

class Strategy {
    getSignal(context) {
        if (!context?.symbol || !context?.profile || !context?.indicators || !context?.candles) {
            return { signal: null, reason: "missing_data" };
        }

        return this.getGreenRedSignal(context);
    }

    getGreenRedSignal({ symbol, profile, indicators, candles, bid, ask }) {
        const timeframe = profile.signal.timeframe.toLowerCase();
        const rows = candles[timeframe];
        const state = indicators[timeframe];
        if (!state || !Array.isArray(rows) || rows.length < 321) return { signal: null, reason: "not_enough_data" };

        const atrSeries = (values) => ATR.calculate({
            period: 21,
            high: values.map(({ high }) => Number(high)),
            low: values.map(({ low }) => Number(low)),
            close: values.map(({ close }) => Number(close)),
        });
        const atrValues = atrSeries(rows);
        const atr = atrValues.at(-1);
        const bidPrice = Number(bid);
        const askPrice = Number(ask);
        if (![atr, bidPrice, askPrice].every(Number.isFinite) || atr <= 0 || askPrice < bidPrice) {
            return { signal: null, reason: "invalid_market_data" };
        }

        const current = rows.at(-1);
        const follows = (side, candle) => side === "BUY" ? candle.close > candle.open : candle.close < candle.open;
        const correctionBars = (side) => {
            if (!follows(side, current)) return 0;
            let count = 0;
            for (let index = rows.length - 2; index >= 0; index -= 1) {
                if (follows(side, rows[index])) return count;
                count += 1;
            }
            return 0;
        };
        const signal = correctionBars("BUY") > 0 ? "BUY" : correctionBars("SELL") > 0 ? "SELL" : null;
        if (!signal) return { signal: null, reason: "pattern_failed" };

        const timestamp = Date.parse(current.timestamp);
        if (!Number.isFinite(timestamp)) return { signal: null, reason: "invalid_candle_time" };
        const minuteIn = (timeZone) => {
            const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
                timeZone,
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            }).formatToParts(timestamp).map(({ type, value }) => [type, value]));
            return Number(parts.hour) * 60 + Number(parts.minute);
        };
        const londonMinute = minuteIn("Europe/London");
        const newYorkMinute = minuteIn("America/New_York");
        const session = newYorkMinute >= 8 * 60 && londonMinute < 17 * 60
            ? "overlap"
            : londonMinute >= 8 * 60 && newYorkMinute < 8 * 60
                ? "london"
                : null;
        if (profile.signal.sessions?.length && !profile.signal.sessions.includes(session)) {
            return { signal: null, reason: "outside_session" };
        }

        const side = signal === "BUY" ? "buy" : "sell";
        const spread = askPrice - bidPrice;
        const spreadAtr = spread / atr;
        const range = Number(current.high) - Number(current.low);
        const bodyRatio = Math.abs(Number(current.close) - Number(current.open)) / range;
        const recent24 = rows.slice(-24);
        const travelled = recent24.slice(1).reduce((sum, candle, index) => sum + Math.abs(candle.close - recent24[index].close), 0);
        const efficiency = travelled > 0 ? Math.abs(recent24.at(-1).close - recent24[0].open) / travelled : 0;
        const activity = rows.slice(-4).reduce((sum, candle) => sum + candle.high - candle.low, 0) / (4 * atr);
        const rankedAtr = atrValues.slice(-300);
        const atrPercentile = rankedAtr.filter((value) => value <= atr).length / rankedAtr.length;
        const priorVolumes = rows.slice(-21, -1).map((candle) => Number(candle.volume));
        const averageVolume = priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length;
        const volumeRatio = averageVolume > 0 ? Number(current.volume) / averageVolume : 0;

        const bb = state.bb;
        const rsi = Number(state.rsi);
        const bollingerRejection = signal === "BUY"
            ? current.low <= bb?.lower && current.close > bb?.lower
            : current.high >= bb?.upper && current.close < bb?.upper;
        const bollingerRoom = signal === "BUY" ? (bb?.upper - current.close - spread) / atr : (current.close - bb?.lower) / atr;
        const rsiExtreme = signal === "BUY" ? rsi <= 30 : rsi >= 70;
        const score = [bollingerRejection || bollingerRoom >= 1, rsiExtreme, volumeRatio >= 1].filter(Boolean).length;

        if (
            ![range, bodyRatio, efficiency, activity, atrPercentile, volumeRatio].every(Number.isFinite) || range <= 0 ||
            spreadAtr > profile.signal.maxSpreadAtr ||
            bodyRatio < Number(profile.signal.minBodyRatio ?? 0) ||
            efficiency < Number(profile.signal.minEfficiency ?? 0) ||
            activity < Number(profile.signal.minActivity ?? 0) ||
            atrPercentile < Number(profile.signal.minAtrPercentile ?? 0) ||
            volumeRatio < Number(profile.signal.minVolumeRatio ?? 0) ||
            score < Number(profile.signal.minScore ?? 0)
        ) {
            return { signal: null, reason: "filters_failed" };
        }

        const h1Bars = Number(profile.signal.h1DirectionBars ?? 0);
        if (h1Bars > 0) {
            const h1 = candles.h1;
            if (!Array.isArray(h1) || h1.length < h1Bars + 22) return { signal: null, reason: "h1_not_ready" };
            const h1Atr = atrSeries(h1).at(-1);
            const h1MoveAtr = (h1.at(-1).close - h1.at(-1 - h1Bars).close) / h1Atr;
            const minimum = Number(profile.signal.minH1TrendAtr ?? 0);
            if (!Number.isFinite(h1MoveAtr) || (side === "buy" ? h1MoveAtr < minimum : h1MoveAtr > -minimum)) {
                return { signal: null, reason: "h1_direction_failed" };
            }
        }

        const entryBuffer = atr * Number(profile.entry.bufferAtr ?? 0);
        const stopBuffer = atr * Number(profile.stop.bufferAtr ?? 0);
        const entryPrice = signal === "BUY" ? Number(current.high) + spread + entryBuffer : Number(current.low) - entryBuffer;
        const stopLoss = signal === "BUY" ? Number(current.low) - stopBuffer : Number(current.high) + spread + stopBuffer;
        if (![entryPrice, stopLoss].every(Number.isFinite) || (signal === "BUY" ? stopLoss >= entryPrice : stopLoss <= entryPrice)) {
            return { signal: null, reason: "invalid_entry_or_stop" };
        }

        return {
            symbol,
            signal,
            entryType: profile.entry.type,
            entryPrice,
            stopLoss,
            pendingInvalidationPrice: profile.entry.cancelIfStopTouchedBeforeEntry ? stopLoss : null,
            atr,
            quality: score + efficiency + volumeRatio - spreadAtr,
            bodyRatio,
            spreadAtr,
            reason: "green_red_M15",
        };
    }
}

export default new Strategy();
