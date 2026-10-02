import { ATR } from "technicalindicators";
import { SESSIONS } from "../config.js";

const SESSION_CLOCKS = new Map();

export function getMarketSession(timestamp = Date.now()) {
    const date =
        timestamp instanceof Date
            ? timestamp
            : typeof timestamp === "string" && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(timestamp)
              ? new Date(`${timestamp.replace(" ", "T")}Z`)
              : new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "offHours";

    for (const [name, session] of Object.entries(SESSIONS)) {
        if (!SESSION_CLOCKS.has(session.TIME_ZONE)) {
            SESSION_CLOCKS.set(
                session.TIME_ZONE,
                new Intl.DateTimeFormat("en-GB", {
                    timeZone: session.TIME_ZONE,
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                }),
            );
        }

        const parts = Object.fromEntries(
            SESSION_CLOCKS.get(session.TIME_ZONE)
                .formatToParts(date)
                .map(({ type, value }) => [type, value]),
        );
        const minute = Number(parts.hour) * 60 + Number(parts.minute);
        if (minute < session.END_MINUTE) return name;
    }

    return "offHours";
}

function continuationSetup(rows, index, side, atr) {
    const follows = (row) => (side === "BUY" ? row.close > row.open : row.close < row.open);
    const opposes = (row) => (side === "BUY" ? row.close < row.open : row.close > row.open);
    if (!follows(rows[index])) return null;

    let pullbackBars = 0;
    for (let cursor = index - 1; cursor >= 0 && opposes(rows[cursor]); cursor -= 1) pullbackBars += 1;
    if (pullbackBars < 1 || pullbackBars > 6) return null;

    const impulseEnd = index - pullbackBars - 1;
    if (impulseEnd < 8 || !follows(rows[impulseEnd])) return null;
    let impulseStart = impulseEnd;
    while (impulseStart > 0 && impulseEnd - impulseStart < 5 && follows(rows[impulseStart - 1])) impulseStart -= 1;

    const context = rows.slice(Math.max(0, impulseStart - 72), impulseEnd + 1);
    const impulse = rows.slice(impulseStart, impulseEnd + 1);
    const pullback = rows.slice(impulseEnd + 1, index);
    if (side === "SELL") {
        const priorSwing = Math.max(...context.map(({ high }) => Number(high)));
        const impulseExtreme = Math.min(...impulse.map(({ low }) => Number(low)));
        const pullbackExtreme = Math.max(...pullback.map(({ high }) => Number(high)));
        const impulseAtr = (priorSwing - impulseExtreme) / atr;
        return { impulseAtr, swingGapAtr: (priorSwing - pullbackExtreme) / atr, retrace: (pullbackExtreme - impulseExtreme) / (priorSwing - impulseExtreme) };
    }

    const priorSwing = Math.min(...context.map(({ low }) => Number(low)));
    const impulseExtreme = Math.max(...impulse.map(({ high }) => Number(high)));
    const pullbackExtreme = Math.min(...pullback.map(({ low }) => Number(low)));
    const impulseAtr = (impulseExtreme - priorSwing) / atr;
    return { impulseAtr, swingGapAtr: (pullbackExtreme - priorSwing) / atr, retrace: (impulseExtreme - pullbackExtreme) / (impulseExtreme - priorSwing) };
}

class Strategy {
    getSignal(context) {
        if (!context?.symbol || !context?.profile || !context?.indicators || !context?.candles) {
            return { signal: null, reason: "missing_data" };
        }

        if (context.profile.signal.strategy === "openingMomentum") {
            return this.getOpeningMomentumSignal(context);
        }

        return this.getGreenRedSignal(context);
    }

    getOpeningMomentumSignal({ symbol, profile, indicators, candles, bid, ask }) {
        const timeframe = profile.signal.timeframe.toLowerCase();
        const rows = candles[timeframe];
        const state = indicators[timeframe];
        if (!state || !Array.isArray(rows) || rows.length < profile.signal.historyBars) {
            return { signal: null, reason: "not_enough_data" };
        }

        const atrValues = ATR.calculate({
            period: 21,
            high: rows.map(({ high }) => Number(high)),
            low: rows.map(({ low }) => Number(low)),
            close: rows.map(({ close }) => Number(close)),
        });
        const atr = atrValues.at(-1);
        const current = rows.at(-1);
        const bidPrice = Number(bid);
        const askPrice = Number(ask);
        const timestamp = Date.parse(current.timestamp) + 15 * 60_000;
        if (![atr, bidPrice, askPrice, timestamp].every(Number.isFinite) || atr <= 0 || askPrice < bidPrice) {
            return { signal: null, reason: "invalid_market_data" };
        }

        const session = getMarketSession(timestamp);
        if (!profile.signal.sessions.includes(session)) return { signal: null, reason: "outside_session" };

        const utcDay = Math.floor(timestamp / 86_400_000);
        let sessionStart = rows.length - 1;
        while (sessionStart > 0) {
            const previousClose = Date.parse(rows[sessionStart - 1].timestamp) + 15 * 60_000;
            if (Math.floor(previousClose / 86_400_000) !== utcDay || getMarketSession(previousClose) !== session) break;
            sessionStart -= 1;
        }

        const sessionStartTime = Date.parse(rows[sessionStart].timestamp) + 15 * 60_000;
        const sessionAgeMinutes = (timestamp - sessionStartTime) / 60_000;
        if (sessionAgeMinutes !== profile.signal.openingMinutes) {
            return { signal: null, reason: "outside_opening_signal" };
        }

        const sessionOpen = Number(rows[sessionStart].open);
        const sessionMoveAtr = (Number(current.close) - sessionOpen) / atr;
        if (!Number.isFinite(sessionMoveAtr) || Math.abs(sessionMoveAtr) < profile.signal.minOpeningMoveAtr) {
            return { signal: null, reason: "opening_move_too_small" };
        }

        const signal = sessionMoveAtr > 0 ? "BUY" : "SELL";
        const spreadAtr = (askPrice - bidPrice) / atr;
        const bodyAtr = Math.abs(Number(current.close) - Number(current.open)) / atr;
        const activity = rows.slice(-4).reduce((sum, candle) => sum + Number(candle.high) - Number(candle.low), 0) / (4 * atr);
        const rankedAtr = atrValues.slice(-300);
        const atrPercentile = rankedAtr.filter((value) => value <= atr).length / rankedAtr.length;
        const recent24 = rows.slice(-24);
        const travelled = recent24
            .slice(1)
            .reduce((sum, candle, index) => sum + Math.abs(Number(candle.close) - Number(recent24[index].close)), 0);
        const efficiency = travelled > 0 ? Math.abs(Number(current.close) - Number(recent24[0].open)) / travelled : 0;
        const priorVolumes = rows.slice(-21, -1).map((candle) => Number(candle.volume ?? 0));
        const averageVolume = priorVolumes.reduce((sum, volume) => sum + volume, 0) / priorVolumes.length;
        const volumeRatio = averageVolume > 0 ? Number(current.volume ?? 0) / averageVolume : 0;
        const rsi = Number(state.rsi);
        const rsiAligned = signal === "BUY" ? rsi >= profile.signal.rsiBuy : rsi <= profile.signal.rsiSell;

        if (
            ![spreadAtr, bodyAtr, activity, atrPercentile, efficiency, volumeRatio, rsi].every(Number.isFinite) ||
            spreadAtr > profile.signal.maxSpreadAtr ||
            bodyAtr < profile.signal.minBodyAtr ||
            activity < profile.signal.minActivity ||
            atrPercentile < profile.signal.minAtrPercentile ||
            atrPercentile > profile.signal.maxAtrPercentile ||
            !rsiAligned
        ) {
            return { signal: null, reason: "filters_failed" };
        }

        const entryPrice = signal === "BUY" ? askPrice : bidPrice;
        const riskDistance = atr * profile.stop.distanceAtr;
        const stopLoss = signal === "BUY" ? entryPrice - riskDistance : entryPrice + riskDistance;
        const bollingerAligned = signal === "BUY" ? Number(current.close) >= state.bb?.middle : Number(current.close) <= state.bb?.middle;
        const score = [bollingerAligned, rsiAligned, volumeRatio >= 1].filter(Boolean).length;

        return {
            symbol,
            signal,
            entryType: profile.entry.type,
            entryPrice,
            stopLoss,
            atr,
            quality: Math.abs(sessionMoveAtr) + score + efficiency + volumeRatio - spreadAtr,
            activity,
            efficiency,
            atrPercentile,
            bodyAtr,
            spreadAtr,
            sessionMoveAtr,
            reason: "opening_momentum_M15",
        };
    }

    getGreenRedSignal({ symbol, profile, indicators, candles, bid, ask }) {
        const timeframe = profile.signal.timeframe.toLowerCase();
        const rows = candles[timeframe];
        const state = indicators[timeframe];
        if (!state || !Array.isArray(rows) || rows.length < 321) return { signal: null, reason: "not_enough_data" };

        const atrSeries = (values) =>
            ATR.calculate({
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
        const follows = (side, candle) => (side === "BUY" ? candle.close > candle.open : candle.close < candle.open);
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

        const timestamp = Date.parse(current.timestamp) + 15 * 60_000;
        if (!Number.isFinite(timestamp)) return { signal: null, reason: "invalid_candle_time" };
        const session = getMarketSession(timestamp);
        if (profile.signal.sessions?.length && !profile.signal.sessions.includes(session)) {
            return { signal: null, reason: "outside_session" };
        }

        const side = signal === "BUY" ? "buy" : "sell";
        const spread = askPrice - bidPrice;
        const spreadAtr = spread / atr;
        const range = Number(current.high) - Number(current.low);
        const bodyRatio = Math.abs(Number(current.close) - Number(current.open)) / range;
        const bodyAtr = Math.abs(Number(current.close) - Number(current.open)) / atr;
        const recent24 = rows.slice(-24);
        const travelled = recent24.slice(1).reduce((sum, candle, index) => sum + Math.abs(candle.close - recent24[index].close), 0);
        const efficiency = travelled > 0 ? Math.abs(recent24.at(-1).close - recent24[0].open) / travelled : 0;
        const activity = rows.slice(-4).reduce((sum, candle) => sum + candle.high - candle.low, 0) / (4 * atr);
        const rankedAtr = atrValues.slice(-300);
        const atrPercentile = rankedAtr.filter((value) => value <= atr).length / rankedAtr.length;
        const priorVolumes = rows.slice(-21, -1).map((candle) => Number(candle.volume));
        const averageVolume = priorVolumes.reduce((sum, value) => sum + value, 0) / priorVolumes.length;
        const volumeRatio = averageVolume > 0 ? Number(current.volume) / averageVolume : 0;
        let sessionActivity = activity;
        let sessionEfficiency = efficiency;
        let sessionAtrPercentile = atrPercentile;

        if (profile.exit.maxHoldSource === "session") {
            let sessionStart = rows.length - 1;
            while (sessionStart > 0 && getMarketSession(Date.parse(rows[sessionStart - 1].timestamp) + 15 * 60_000) === session) sessionStart -= 1;

            const values = [];
            const atrOffset = rows.length - atrValues.length;
            for (let index = sessionStart; index < rows.length; index += 1) {
                const rowAtr = atrValues[index - atrOffset];
                const recent = rows.slice(index - 23, index + 1);
                const distance = recent.slice(1).reduce((sum, candle, cursor) => sum + Math.abs(candle.close - recent[cursor].close), 0);
                const recentAtr = atrValues.slice(Math.max(0, index - atrOffset - 299), index - atrOffset + 1);
                if (recent.length === 24 && rowAtr > 0 && distance > 0 && recentAtr.length) {
                    values.push({
                        activity: rows.slice(index - 3, index + 1).reduce((sum, candle) => sum + candle.high - candle.low, 0) / (4 * rowAtr),
                        efficiency: Math.abs(recent.at(-1).close - recent[0].open) / distance,
                        atrPercentile: recentAtr.filter((value) => value <= rowAtr).length / recentAtr.length,
                    });
                }
            }
            if (values.length) {
                sessionActivity = values.reduce((sum, value) => sum + value.activity, 0) / values.length;
                sessionEfficiency = values.reduce((sum, value) => sum + value.efficiency, 0) / values.length;
                sessionAtrPercentile = values.reduce((sum, value) => sum + value.atrPercentile, 0) / values.length;
            }
        }

        const bb = state.bb;
        const rsi = Number(state.rsi);
        const bollingerRejection =
            signal === "BUY" ? current.low <= bb?.lower && current.close > bb?.lower : current.high >= bb?.upper && current.close < bb?.upper;
        const bollingerRoom = signal === "BUY" ? (bb?.upper - current.close - spread) / atr : (current.close - bb?.lower) / atr;
        const rsiExtreme = signal === "BUY" ? rsi <= 35 : rsi >= 65;
        const score = [bollingerRejection || bollingerRoom >= 1, rsiExtreme, volumeRatio >= 1].filter(Boolean).length;
        const indicatorMode = profile.signal.indicatorMode ?? "none";
        const indicatorPassed =
            indicatorMode === "none" ||
            (indicatorMode === "score" && score >= Number(profile.signal.minIndicatorScore ?? 0)) ||
            (indicatorMode === "bollinger" && (bollingerRejection || bollingerRoom >= Number(profile.signal.minBollingerRoomAtr ?? 0))) ||
            (indicatorMode === "rsi" && rsiExtreme) ||
            (indicatorMode === "volume" && volumeRatio >= 1);
        const continuation = profile.signal.structureMode === "continuation" ? continuationSetup(rows, rows.length - 1, signal, atr) : null;
        const structurePassed =
            profile.signal.structureMode !== "continuation" ||
            (continuation &&
                continuation.impulseAtr >= Number(profile.signal.minImpulseAtr ?? 0) &&
                continuation.swingGapAtr >= Number(profile.signal.minSwingGapAtr ?? 0) &&
                continuation.retrace <= Number(profile.signal.maxRetrace ?? Infinity));

        if (
            ![range, bodyRatio, bodyAtr, efficiency, activity, atrPercentile, volumeRatio].every(Number.isFinite) ||
            range <= 0 ||
            spreadAtr > profile.signal.maxSpreadAtr ||
            bodyRatio < Number(profile.signal.minBodyRatio ?? 0) ||
            bodyAtr < Number(profile.signal.minBodyAtr ?? 0) ||
            efficiency < Number(profile.signal.minEfficiency ?? 0) ||
            activity < Number(profile.signal.minActivity ?? 0) ||
            atrPercentile < Number(profile.signal.minAtrPercentile ?? 0) ||
            atrPercentile > Number(profile.signal.maxAtrPercentile ?? 1) ||
            volumeRatio < Number(profile.signal.minVolumeRatio ?? 0) ||
            !indicatorPassed ||
            !structurePassed
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
            atr,
            quality: score + efficiency + volumeRatio - spreadAtr,
            activity,
            efficiency,
            atrPercentile,
            sessionActivity,
            sessionEfficiency,
            sessionAtrPercentile,
            bodyRatio,
            spreadAtr,
            reason: `${profile.signal.structureMode}_M15`,
        };
    }
}

export default new Strategy();
