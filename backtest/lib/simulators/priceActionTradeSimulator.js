import { replayPaHigherLowLowerHighScenario } from "../../../strategies/paHigherLowLowerHigh.js";
import { buildStopPrice, buildTakeProfit } from "./priceActionTradeCore.js";

export { buildStopPrice, buildTakeProfit };

export function simulatePriceActionTradeScenario(rows, config, meta = {}) {
    return replayPaHigherLowLowerHighScenario(rows, config, meta);
}
