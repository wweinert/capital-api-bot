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
class Strategy {
    getSignal(context) {
        const { symbol, indicators, candles } = context;

        const rows = candles?.h1;
        const prev = rows?.at(-2);
        const last = rows?.at(-1);

        const { waveDirection } = this.detectWave(symbol, indicators, candles);

        if (!prev || !last || !waveDirection) {
            return false;
        }

        const isBullish = (candle) => candle.close > candle.open;

        const isBearish = (candle) => candle.close < candle.open;

        if (waveDirection === "bullish" && isBearish(prev) && isBullish(last)) {
            return "bullish";
        }

        if (waveDirection === "bearish" && isBullish(prev) && isBearish(last)) {
            return "bearish";
        }

        return false;
    }

    detectWave(symbol, indicators, candles) {
        let waveDirection = null;
        let newestSignalTime = -Infinity;

        const setups = [
            {
                rows: candles?.m5,
                atr: indicators?.m5?.atr,
                minutes: 5,
                lookback: 24,
                pivotWindow: 12,
                breakBars: 3,
                bodyAtr: 0.1,
                closeAt: 0.6,
                keepBars: 3,
            },
            {
                rows: candles?.m15,
                atr: indicators?.m15?.atr,
                minutes: 15,
                lookback: 4,
                pivotWindow: 4,
                breakBars: 1,
                bodyAtr: 0.2,
                closeAt: 0.55,
                keepBars: 2,
            },
        ];

        for (const setup of setups) {
            const rows = setup.rows;
            const atr = Number(setup.atr);

            if (!Array.isArray(rows) || rows.length < setup.lookback + setup.pivotWindow + 2 || !(atr > 0)) {
                continue;
            }

            const oldestSignal = Math.max(setup.lookback + setup.pivotWindow, rows.length - setup.keepBars);

            for (let i = rows.length - 1; i >= oldestSignal; i--) {
                const candle = rows[i];
                const { open, high, low, close } = candle;
                const range = high - low;

                if (range <= 0 || Math.abs(close - open) < atr * setup.bodyAtr) {
                    continue;
                }

                const direction =
                    close > open && (close - low) / range >= setup.closeAt ? "BUY" : close < open && (high - close) / range >= setup.closeAt ? "SELL" : null;

                if (!direction) continue;

                let hasRecentExtreme = false;

                for (let pivot = i; pivot >= i - setup.pivotWindow && !hasRecentExtreme; pivot--) {
                    let priorExtreme = direction === "BUY" ? Infinity : -Infinity;

                    for (let j = pivot - setup.lookback; j < pivot; j++) {
                        const price = direction === "BUY" ? rows[j].low : rows[j].high;

                        priorExtreme = direction === "BUY" ? Math.min(priorExtreme, price) : Math.max(priorExtreme, price);
                    }

                    hasRecentExtreme = direction === "BUY" ? rows[pivot].low <= priorExtreme : rows[pivot].high >= priorExtreme;
                }

                if (!hasRecentExtreme) continue;

                let structureLevel = direction === "BUY" ? -Infinity : Infinity;

                for (let j = i - setup.breakBars; j < i; j++) {
                    structureLevel = direction === "BUY" ? Math.max(structureLevel, rows[j].high) : Math.min(structureLevel, rows[j].low);
                }

                const structureBroken = direction === "BUY" ? close > structureLevel : close < structureLevel;

                if (!structureBroken) continue;

                const signalTime = Date.parse(candle.timestamp) + setup.minutes * 60_000;

                if (signalTime > newestSignalTime) {
                    newestSignalTime = signalTime;
                    waveDirection = direction;
                }

                break;
            }
        }

        return {
            symbol,
            waveDirection: waveDirection === "BUY" ? "bullish" : waveDirection === "SELL" ? "bearish" : null,
        };
    }
}

export default new Strategy();
