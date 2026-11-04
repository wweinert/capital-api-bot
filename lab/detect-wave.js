export function detectWave(symbol, indicators, candles) {
    if (!symbol || !indicators || !candles) {
        return { symbol: symbol ?? null, direction: null, trend: "neutral", phase: "none", reason: "missing_data" };
    }

    const detections = [];
    const frames = [
        { key: "m5", minutes: 5, lookback: 24, window: 12, breakBars: 3, minBodyAtr: 0.1, minCloseLocation: 0.6, keepBars: 3 },
        { key: "m15", minutes: 15, lookback: 4, window: 4, breakBars: 1, minBodyAtr: 0.2, minCloseLocation: 0.55, keepBars: 2 },
    ];

    for (const frame of frames) {
        const rows = candles[frame.key];
        const atr = Number(indicators[frame.key]?.atr);
        if (!Array.isArray(rows) || rows.length < frame.lookback + frame.window + 2 || !(atr > 0)) continue;

        let detection = null;
        const firstSignalIndex = Math.max(frame.lookback + frame.window, rows.length - frame.keepBars);

        for (let signalIndex = rows.length - 1; signalIndex >= firstSignalIndex && !detection; signalIndex -= 1) {
            const current = rows[signalIndex];
            const open = Number(current.open);
            const high = Number(current.high);
            const low = Number(current.low);
            const close = Number(current.close);
            const range = high - low;

            if (![open, high, low, close].every(Number.isFinite) || range <= 0 || Math.abs(close - open) / atr < frame.minBodyAtr) continue;

            for (const direction of ["BUY", "SELL"]) {
                const directionalCandle = direction === "BUY" ? close > open : close < open;
                const closeLocation = direction === "BUY" ? (close - low) / range : (high - close) / range;
                if (!directionalCandle || closeLocation < frame.minCloseLocation) continue;

                let pivotIndex = -1;
                let extremePrice = null;

                for (let cursor = signalIndex; cursor >= signalIndex - frame.window; cursor -= 1) {
                    const pivot = rows[cursor];
                    const pivotLow = Number(pivot.low);
                    const pivotHigh = Number(pivot.high);
                    if (![pivotLow, pivotHigh].every(Number.isFinite)) continue;

                    let priorExtreme = direction === "BUY" ? Infinity : -Infinity;
                    let validHistory = true;

                    for (let prior = cursor - frame.lookback; prior < cursor; prior += 1) {
                        const value = Number(direction === "BUY" ? rows[prior]?.low : rows[prior]?.high);
                        if (!Number.isFinite(value)) {
                            validHistory = false;
                            break;
                        }
                        priorExtreme = direction === "BUY" ? Math.min(priorExtreme, value) : Math.max(priorExtreme, value);
                    }

                    if (!validHistory) continue;
                    const isExtreme = direction === "BUY" ? pivotLow <= priorExtreme : pivotHigh >= priorExtreme;
                    if (isExtreme) {
                        pivotIndex = cursor;
                        extremePrice = direction === "BUY" ? pivotLow : pivotHigh;
                        break;
                    }
                }

                if (pivotIndex < 0) continue;

                let structureLevel = direction === "BUY" ? -Infinity : Infinity;
                let validStructure = true;
                for (let cursor = signalIndex - frame.breakBars; cursor < signalIndex; cursor += 1) {
                    const value = Number(direction === "BUY" ? rows[cursor]?.high : rows[cursor]?.low);
                    if (!Number.isFinite(value)) {
                        validStructure = false;
                        break;
                    }
                    structureLevel = direction === "BUY" ? Math.max(structureLevel, value) : Math.min(structureLevel, value);
                }

                const structureBroken = validStructure && (direction === "BUY" ? close > structureLevel : close < structureLevel);
                if (!structureBroken) continue;

                const parsedTime = Date.parse(current.timestamp);
                detection = {
                    timeframe: frame.key.toUpperCase(),
                    direction,
                    extremePrice,
                    structureLevel,
                    signalPrice: close,
                    detectedAt: Number.isFinite(parsedTime) ? new Date(parsedTime + frame.minutes * 60_000).toISOString() : null,
                    detectedAtMs: Number.isFinite(parsedTime) ? parsedTime + frame.minutes * 60_000 : signalIndex * frame.minutes * 60_000,
                };
                break;
            }
        }

        if (detection) detections.push(detection);
    }

    const m5 = detections.find((item) => item.timeframe === "M5") ?? null;
    const m15 = detections.find((item) => item.timeframe === "M15") ?? null;
    let selected = null;
    let phase = "none";
    let source = null;

    if (m5 && m15 && m5.direction === m15.direction) {
        selected = m5.detectedAtMs >= m15.detectedAtMs ? m5 : m15;
        phase = "confirmed";
        source = "M5+M15";
    } else if (m5 && m15) {
        selected = m5.detectedAtMs > m15.detectedAtMs ? m5 : m15;
        phase = selected === m5 ? "forming" : "confirmed";
        source = selected.timeframe;
    } else if (m15) {
        selected = m15;
        phase = "confirmed";
        source = "M15";
    } else if (m5) {
        selected = m5;
        phase = "forming";
        source = "M5";
    }

    if (!selected) {
        return { symbol, direction: null, trend: "neutral", phase: "none", source: null, reason: "no_wave" };
    }

    const h1Trend = String(indicators.h1?.trend ?? "neutral").toLowerCase();
    const alignedWithH1 = h1Trend === "neutral" ? null : selected.direction === "BUY" ? h1Trend === "bullish" : h1Trend === "bearish";

    return {
        symbol,
        direction: selected.direction,
        trend: selected.direction === "BUY" ? "bullish" : "bearish",
        phase,
        source,
        extremePrice: selected.extremePrice,
        structureLevel: selected.structureLevel,
        signalPrice: selected.signalPrice,
        detectedAt: selected.detectedAt,
        h1Trend,
        alignedWithH1,
        m5Direction: m5?.direction ?? null,
        m15Direction: m15?.direction ?? null,
        conflict: Boolean(m5 && m15 && m5.direction !== m15.direction),
        reason: phase === "confirmed" ? "wave_confirmed" : "wave_forming",
    };
}
