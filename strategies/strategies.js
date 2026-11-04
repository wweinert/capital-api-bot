class Strategy {
    #hourMs = 60 * 60_000;
    #lastSignalHourUtc = 7;
    #maxH1BodyAtr = 0.75;
    #waveSetups = [
        { timeframe: "m5", lookback: 24, pivotWindow: 12, breakBars: 3, bodyAtr: 0.1, closeAt: 0.6, keepBars: 12 },
        { timeframe: "m15", lookback: 4, pivotWindow: 4, breakBars: 1, bodyAtr: 0.2, closeAt: 0.55, keepBars: 4 },
    ];

    getSignal(context) {
        const { symbol, indicators, candles } = context;

        const rows = candles?.h1;
        const prev = rows?.at(-2);
        const last = rows?.at(-1);
        const atr = Number(indicators?.h1?.atr);
        const ema20 = Number(indicators?.h1?.ema20);
        const ema50 = Number(indicators?.h1?.ema50);
        const prevOpen = Number(prev?.open);
        const prevClose = Number(prev?.close);
        const lastOpen = Number(last?.open);
        const lastClose = Number(last?.close);

        if (!prev || !last || !(atr > 0) || ![ema20, ema50, prevOpen, prevClose, lastOpen, lastClose].every(Number.isFinite)) {
            return { symbol, signal: null };
        }

        const decisionTime = Date.parse(last.timestamp) + this.#hourMs;
        const bodyAtr = Math.abs(lastClose - lastOpen) / atr;

        if (!Number.isFinite(decisionTime) || new Date(decisionTime).getUTCHours() > this.#lastSignalHourUtc || bodyAtr > this.#maxH1BodyAtr) {
            return { symbol, signal: null };
        }

        const { waveDirection } = this.detectWave(symbol, indicators, candles);
        const bullish = waveDirection === "bullish" && ema20 >= ema50 && prevClose < prevOpen && lastClose > lastOpen;
        const bearish = waveDirection === "bearish" && ema20 <= ema50 && prevClose > prevOpen && lastClose < lastOpen;

        return { symbol, signal: bullish ? "bullish" : bearish ? "bearish" : null };
    }

    detectWave(symbol, indicators, candles) {
        const waveDirections = [];

        for (const setup of this.#waveSetups) {
            const rows = candles?.[setup.timeframe];
            const atr = Number(indicators?.[setup.timeframe]?.atr);

            if (!Array.isArray(rows) || rows.length < setup.lookback + setup.pivotWindow + 2 || !(atr > 0)) {
                continue;
            }

            const oldestSignal = Math.max(setup.lookback + setup.pivotWindow, rows.length - setup.keepBars);

            for (let i = rows.length - 1; i >= oldestSignal; i--) {
                const candle = rows[i];
                const open = Number(candle.open);
                const high = Number(candle.high);
                const low = Number(candle.low);
                const close = Number(candle.close);
                const range = high - low;

                if (![open, high, low, close].every(Number.isFinite) || range <= 0 || Math.abs(close - open) < atr * setup.bodyAtr) {
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

                waveDirections.push(direction);

                break;
            }
        }

        const waveDirection = waveDirections.length === this.#waveSetups.length && waveDirections.every((direction) => direction === waveDirections[0])
            ? waveDirections[0]
            : null;

        return {
            symbol,
            waveDirection: waveDirection === "BUY" ? "bullish" : waveDirection === "SELL" ? "bearish" : null,
        };
    }
}

export default new Strategy();
