import { ATR, EMA } from "technicalindicators";

const ATR_PERIOD = 14;

export async function calcIndicators(bars) {
    if (!Array.isArray(bars) || bars.length < ATR_PERIOD + 1) return null;

    const normalized = bars.map((bar) => ({
        close: Number(bar?.close ?? bar?.Close ?? bar?.closePrice?.bid),
        high: Number(bar?.high ?? bar?.High ?? bar?.highPrice?.bid),
        low: Number(bar?.low ?? bar?.Low ?? bar?.lowPrice?.bid),
    }));
    if (normalized.some(({ close, high, low }) => ![close, high, low].every(Number.isFinite))) return null;

    const atrValues = ATR.calculate({
        period: ATR_PERIOD,
        close: normalized.map(({ close }) => close),
        high: normalized.map(({ high }) => high),
        low: normalized.map(({ low }) => low),
    });
    const atr = atrValues.at(-1);
    const closes = normalized.map(({ close }) => close);
    const ema20Values = EMA.calculate({ period: 20, values: closes });
    const ema20 = ema20Values.at(-1);
    const ema20Previous3 = ema20Values.at(-4);
    const ema50 = EMA.calculate({ period: 50, values: closes }).at(-1);
    const priorAtr = atrValues.slice(-61, -1);
    const sortedAtr = priorAtr.slice().sort((a, b) => a - b);
    const atrMean = priorAtr.reduce((sum, value) => sum + value, 0) / priorAtr.length;
    const priorVolume = bars.slice(-21, -1).map((bar) => Number(bar.volume));
    const volumeMean = priorVolume.reduce((sum, value) => sum + value, 0) / priorVolume.length;
    const volume = Number(bars.at(-1).volume);
    const path = closes.slice(-6).reduce((sum, close, index) => sum + Math.abs(close - closes[closes.length - 7 + index]), 0);

    return {
        atr: Number.isFinite(atr) ? atr : null,
        ema20: Number.isFinite(ema20) ? ema20 : null,
        ema20Previous3: Number.isFinite(ema20Previous3) ? ema20Previous3 : null,
        ema50: Number.isFinite(ema50) ? ema50 : null,
        efficiency6: closes.length >= 7 ? (path > 0 ? Math.abs(closes.at(-1) - closes.at(-7)) / path : 0) : null,
        atrRegime: priorAtr.length === 60 && atrMean > 0 ? atr / atrMean : null,
        atrLow60: priorAtr.length === 60 ? sortedAtr[Math.floor(59 * 0.2)] : null,
        atrHigh60: priorAtr.length === 60 ? sortedAtr[Math.floor(59 * 0.9)] : null,
        volumeRatio20: priorVolume.length === 20 && priorVolume.every(Number.isFinite) && Number.isFinite(volume)
            ? volume / Math.max(1, volumeMean) : null,
    };
}

export function aggregateM30(bars = []) {
    const result = [];
    for (let index = 1; index < bars.length; index++) {
        const first = bars[index - 1];
        const second = bars[index];
        const timestamp = Date.parse(first.timestamp);
        if (timestamp % 1_800_000 !== 0 || Date.parse(second.timestamp) - timestamp !== 900_000) continue;
        result.push({
            timestamp: first.timestamp,
            open: Number(first.open),
            high: Math.max(Number(first.high), Number(second.high)),
            low: Math.min(Number(first.low), Number(second.low)),
            close: Number(second.close),
            spread: Number(second.spread),
            volume: Number(first.volume) + Number(second.volume),
        });
    }
    return result;
}
