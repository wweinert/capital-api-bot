export function detectWave(symbol, indicators, candles, options = {}) {
    const waveDirections = [];
    const timeframeDirections = {};
    const timeframeTimes = {};
    const timeframeEnds = {};

    const setups = [
        { name: "m5", minutes: 5, rows: candles?.m5, atr: indicators?.m5?.atr, lookback: 24, pivotWindow: 12, breakBars: 3, bodyAtr: 0.1, closeAt: 0.6, keepBars: options.m5KeepBars ?? 12 },
        { name: "m15", minutes: 15, rows: candles?.m15, atr: indicators?.m15?.atr, lookback: 4, pivotWindow: 4, breakBars: 1, bodyAtr: 0.2, closeAt: 0.55, keepBars: options.m15KeepBars ?? 4 },
    ];

    for (const setup of setups) {
        const rows = setup.rows;
        const atr = Number(setup.atr);
        if (!Array.isArray(rows) || rows.length < setup.lookback + setup.pivotWindow + 2 || !(atr > 0)) continue;
        const lastOpenTime = Number(rows.at(-1)?.t ?? Date.parse(rows.at(-1)?.timestamp));
        timeframeEnds[setup.name] = Number.isFinite(lastOpenTime) ? lastOpenTime + setup.minutes * 60_000 : null;

        const oldestSignal = Math.max(setup.lookback + setup.pivotWindow, rows.length - setup.keepBars);

        for (let i = rows.length - 1; i >= oldestSignal; i -= 1) {
            const candle = rows[i];
            const open = Number(candle.open);
            const high = Number(candle.high);
            const low = Number(candle.low);
            const close = Number(candle.close);
            const range = high - low;

            if (![open, high, low, close].every(Number.isFinite) || range <= 0 || Math.abs(close - open) < atr * setup.bodyAtr) continue;

            const direction = close > open && (close - low) / range >= setup.closeAt
                ? "BUY"
                : close < open && (high - close) / range >= setup.closeAt
                  ? "SELL"
                  : null;
            if (!direction) continue;

            let hasRecentExtreme = false;
            for (let pivot = i; pivot >= i - setup.pivotWindow && !hasRecentExtreme; pivot -= 1) {
                let priorExtreme = direction === "BUY" ? Infinity : -Infinity;
                for (let j = pivot - setup.lookback; j < pivot; j += 1) {
                    const price = Number(direction === "BUY" ? rows[j]?.low : rows[j]?.high);
                    priorExtreme = direction === "BUY" ? Math.min(priorExtreme, price) : Math.max(priorExtreme, price);
                }
                hasRecentExtreme = direction === "BUY" ? Number(rows[pivot]?.low) <= priorExtreme : Number(rows[pivot]?.high) >= priorExtreme;
            }
            if (!hasRecentExtreme) continue;

            let structureLevel = direction === "BUY" ? -Infinity : Infinity;
            for (let j = i - setup.breakBars; j < i; j += 1) {
                const price = Number(direction === "BUY" ? rows[j]?.high : rows[j]?.low);
                structureLevel = direction === "BUY" ? Math.max(structureLevel, price) : Math.min(structureLevel, price);
            }

            if (direction === "BUY" ? close <= structureLevel : close >= structureLevel) continue;

            waveDirections.push(direction);
            timeframeDirections[setup.name] = direction;
            const openTime = Number(candle.t ?? Date.parse(candle.timestamp));
            timeframeTimes[setup.name] = Number.isFinite(openTime) ? openTime + setup.minutes * 60_000 : i * setup.minutes * 60_000;
            break;
        }
    }

    let waveDirection = null;
    if (options.mode === "m5") waveDirection = timeframeDirections.m5 ?? null;
    else if (options.mode === "m15") waveDirection = timeframeDirections.m15 ?? null;
    else if (options.mode === "requireBoth") {
        waveDirection = timeframeDirections.m5 && timeframeDirections.m5 === timeframeDirections.m15 ? timeframeDirections.m5 : null;
    } else if (options.mode === "newest") {
        waveDirection = !timeframeDirections.m5 ? timeframeDirections.m15 ?? null
            : !timeframeDirections.m15 ? timeframeDirections.m5
            : timeframeTimes.m5 >= timeframeTimes.m15 ? timeframeDirections.m5 : timeframeDirections.m15;
    } else if (options.mode === "freshM15") {
        const freshMinutes = options.m15FreshMinutes ?? 15;
        const freshM15 = timeframeDirections.m15 && timeframeEnds.m15 - timeframeTimes.m15 <= freshMinutes * 60_000;
        waveDirection = timeframeDirections.m5 ?? (freshM15 ? timeframeDirections.m15 : null);
    } else {
        waveDirection = waveDirections.length > 0 && waveDirections.every((direction) => direction === waveDirections[0])
            ? waveDirections[0]
            : null;
    }

    return { symbol, waveDirection, timeframeDirections, timeframeTimes };
}
