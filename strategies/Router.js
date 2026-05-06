import { createPaHigherLowLowerHighLiveStrategy } from "./paHigherLowLowerHigh.js";
import { TRADING_STRATEGY_MODE } from "../config.js";
import { createSessionMomentumIntradayStrategy } from "./sessionMomentumIntraday.js";

const NO_SIGNAL = { signal: null, reason: "no_strategy_signal", context: {} };

export class Router {
    constructor({ strategies = null } = {}) {
        const defaultStrategies =
            TRADING_STRATEGY_MODE === "intraday_lab"
                ? [createSessionMomentumIntradayStrategy()]
                : [createPaHigherLowLowerHighLiveStrategy()];
        this.strategies = (strategies || defaultStrategies).filter(Boolean);
    }

    evaluate(input = {}) {
        for (const strategy of this.strategies) {
            const result = strategy.evaluate(input);
            if (result?.signal) {
                return {
                    ...result,
                    context: {
                        strategyName: strategy.name,
                        ...(result.context || {}),
                    },
                };
            }
        }
        return { ...NO_SIGNAL };
    }

    generateHigherLowLowerHighSignal(input = {}) {
        const strategy = this.strategies.find((item) => item.id === "PA_HIGHER_LOW_LOWER_HIGH");
        return strategy ? strategy.evaluate(input) : { ...NO_SIGNAL, reason: "hllh_strategy_not_registered" };
    }

    pickTrend(indicators = {}) {
        const explicitTrend = String(indicators?.trend || "").toLowerCase();
        if (explicitTrend === "bullish" || explicitTrend === "bearish") return explicitTrend;

        const emaFast = Number(indicators?.ema9 ?? indicators?.ema20);
        const emaSlow = Number(indicators?.ema20 ?? indicators?.ema50);
        if (Number.isFinite(emaFast) && Number.isFinite(emaSlow)) {
            if (emaFast > emaSlow) return "bullish";
            if (emaFast < emaSlow) return "bearish";
        }

        const macd = indicators?.macd;
        const histogram = Number(macd?.histogram ?? indicators?.macdHistogram);
        if (Number.isFinite(histogram)) {
            if (histogram > 0) return "bullish";
            if (histogram < 0) return "bearish";
        }

        return "neutral";
    }
}

export default new Router();
