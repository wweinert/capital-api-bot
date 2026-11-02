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

    const atr = ATR.calculate({
        period: ATR_PERIOD,
        close: normalized.map(({ close }) => close),
        high: normalized.map(({ high }) => high),
        low: normalized.map(({ low }) => low),
    }).at(-1);
    const closes = normalized.map(({ close }) => close);
    const ema20 = EMA.calculate({ period: 20, values: closes }).at(-1);
    const ema50 = EMA.calculate({ period: 50, values: closes }).at(-1);

    return {
        atr: Number.isFinite(atr) ? atr : null,
        ema20: Number.isFinite(ema20) ? ema20 : null,
        ema50: Number.isFinite(ema50) ? ema50 : null,
    };
}
