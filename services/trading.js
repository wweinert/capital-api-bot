import { TRADING, ANALYSIS } from "../config.js";
import { placeOrder, placePosition, updateTrailingStop, getHistorical } from "../api.js";
const { FOREX_MIN_SIZE, RISK_PER_TRADE } = TRADING;

const RSI_CONFIG = {
  OVERBOUGHT: 70,
  OVERSOLD: 30,
  EXIT_OVERBOUGHT: 65,
  EXIT_OVERSOLD: 35,
}; // Added missing properties

const AUTORESEARCH_ENTRY_PROFILE = {
  id: "candidate_25881",
  symbols: ["AUDUSD", "EURGBP", "GBPUSD", "USDCAD"],
  allowedHoursUtc: [13, 14, 15, 16, 17, 18, 19, 20],
  minBuyScore: 2,
  minSellScore: 2,
  scoreEdge: 0,
  m15RsiBuyMax: 43,
  m15RsiSellMin: 43,
  bbTolerance: 0.00137,
  stopAtrMultiplier: 2.43,
  rewardRisk: 2.4,
  marginUse: 0.9,
  leverage: 30,
};

class TradingService {
  constructor() {
    this.openTrades = [];
    this.accountBalance = 0;
    this.profitThresholdReached = false;
    this.symbolMinSizes = {};
    this.virtualBalance = 10000;
    this.virtualPositions = [];
    this.orderAttempts = new Map();
  }

  setAccountBalance(balance) {
    this.accountBalance = balance;
  }
  setOpenTrades(trades) {
    this.openTrades = trades;
  }
  setProfitThresholdReached(reached) {
    this.profitThresholdReached = reached;
  }
  setSymbolMinSizes(minSizes) {
    this.symbolMinSizes = minSizes;
  }
  isSymbolTraded(symbol) {
    return this.openTrades.includes(symbol);
  }

  validatePrices(bid, ask, symbol) {
    if (typeof bid !== "number" || typeof ask !== "number" || isNaN(bid) || isNaN(ask)) {
      console.error(`[PriceValidation] Invalid prices for ${symbol}. Bid: ${bid}, Ask: ${ask}`);
      return false;
    }
    return true;
  }

  validateIndicatorData(h4Data, h4Indicators, h1Indicators, m15Indicators, trendAnalysis) {
    if (!h4Data || !h4Indicators || !h1Indicators || !m15Indicators || !trendAnalysis) {
      console.log("[Signal] Missing required indicators data");
      return false;
    }
    return true;
  }

  logMarketConditions(symbol, bid, ask, h4Indicators, h1Indicators, m15Indicators, trendAnalysis) {
    // console.log(`\n=== Analyzing ${symbol} ===`);
    // console.log("Current price:", { bid, ask });
    // console.log("[H4] EMA Fast:", h4Indicators.emaFast, "EMA Slow:", h4Indicators.emaSlow, "MACD:", h4Indicators.macd?.histogram);
    // console.log("[H1] EMA9:", h1Indicators.ema9, "EMA21:", h1Indicators.ema21, "RSI:", h1Indicators.rsi);
    // console.log("[M15] EMA9:", m15Indicators.ema9, "EMA21:", m15Indicators.ema21, "RSI:", m15Indicators.rsi, "BB:", m15Indicators.bb);
    // console.log("Trend:", trendAnalysis.h4Trend);
  }

  evaluateSignals(buyConditions, sellConditions) {
    const buyScore = buyConditions.filter(Boolean).length;
    const sellScore = sellConditions.filter(Boolean).length;
    console.log(`[Signal] BuyScore: ${buyScore}/${buyConditions.length}, SellScore: ${sellScore}/${sellConditions.length}`);
    let signal = null;
    if (buyScore >= AUTORESEARCH_ENTRY_PROFILE.minBuyScore && buyScore >= sellScore + AUTORESEARCH_ENTRY_PROFILE.scoreEdge) {
      signal = "buy";
    } else if (sellScore >= AUTORESEARCH_ENTRY_PROFILE.minSellScore && sellScore >= buyScore + AUTORESEARCH_ENTRY_PROFILE.scoreEdge) {
      signal = "sell";
    }
    return { signal, buyScore, sellScore };
  }

  getSignalTimestampMs(message) {
    const raw =
      message?.timestamp ||
      message?.snapshotTimeUTC ||
      message?.snapshotTime ||
      message?.updateTimeUTC ||
      message?.updateTime;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  isAutoresearchProfileActive(symbol, timestampMs = Date.now()) {
    const upperSymbol = String(symbol || "").toUpperCase();
    if (!AUTORESEARCH_ENTRY_PROFILE.symbols.includes(upperSymbol)) {
      return { active: false, reason: "symbol_not_in_profile" };
    }
    const hourUtc = new Date(timestampMs).getUTCHours();
    if (!AUTORESEARCH_ENTRY_PROFILE.allowedHoursUtc.includes(hourUtc)) {
      return { active: false, reason: `outside_profile_hours_${hourUtc}` };
    }
    return { active: true, reason: "active" };
  }

  async generateAndValidateSignal(candle, message, symbol, bid, ask) {
    const indicators = candle.indicators || {};
    // Log all indicator values for debugging
    // console.log(`[Signal] Generating signal for ${symbol}`);
    // console.log("[Indicators] H4:", indicators.h4);
    // console.log("[Indicators] H1:", indicators.h1);
    // console.log("[Indicators] M15:", indicators.m15);
    const trendAnalysis = message.trendAnalysis;
    const timestampMs = this.getSignalTimestampMs(message);
    const result = this.generateSignals(symbol, message.h4Data, indicators.h4, indicators.h1, indicators.m15, trendAnalysis, bid, ask, timestampMs);
    if (!result.signal) {
      console.log(`[Signal] No valid signal for ${symbol}. Reason: ${result.reason || "no_signal"} BuyScore: ${result.buyScore}, SellScore: ${result.sellScore}`);
    } else {
      console.log(`[Signal] Signal for ${symbol}: ${result.signal.toUpperCase()} (${AUTORESEARCH_ENTRY_PROFILE.id})`);
    }
    return result;
  }
  generateBuyConditions(h4Indicators, h1Indicators, m15Indicators, trendAnalysis, bid) {
    return [
      h4Indicators.macd?.histogram > 0,
      h1Indicators.ema9 > h1Indicators.ema21,
      m15Indicators.rsi < AUTORESEARCH_ENTRY_PROFILE.m15RsiBuyMax,
      bid <= (m15Indicators.bb?.lower ?? -Infinity) * (1 + AUTORESEARCH_ENTRY_PROFILE.bbTolerance),
    ];
  }

  generateSellConditions(h4Indicators, h1Indicators, m15Indicators, trendAnalysis, ask) {
    return [
      h4Indicators.macd?.histogram < 0,
      h1Indicators.ema9 < h1Indicators.ema21,
      m15Indicators.rsi > AUTORESEARCH_ENTRY_PROFILE.m15RsiSellMin,
      ask >= (m15Indicators.bb?.upper ?? Infinity) * (1 - AUTORESEARCH_ENTRY_PROFILE.bbTolerance),
    ];
  }

  async executeTrade(signal, symbol, bid, ask, indicators = {}) {
    console.log(`\n🎯 ${symbol} ${signal.toUpperCase()} signal generated!`);
    const params = await this.calculateTradeParameters(signal, symbol, bid, ask, indicators);
    // this.logTradeParameters(signal, params.size, params.stopLossPrice, params.takeProfitPrice, params.stopLossPips);
    try {
      await this.executePosition(signal, symbol, params);
    } catch (error) {
      console.error(`[TradeExecution] Failed for ${symbol}:`, error);
      throw error;
    }
  }

  async calculateTradeParameters(signal, symbol, bid, ask, indicators = {}) {
    const price = signal === "buy" ? ask : bid;
    const atr = Number.isFinite(indicators?.m15?.atr) && indicators.m15.atr > 0 ? indicators.m15.atr : await this.calculateATR(symbol);
    const stopLossDistance = AUTORESEARCH_ENTRY_PROFILE.stopAtrMultiplier * atr;
    const stopLossPrice = signal === "buy" ? price - stopLossDistance : price + stopLossDistance;
    const takeProfitDistance = AUTORESEARCH_ENTRY_PROFILE.rewardRisk * stopLossDistance;
    const takeProfitPrice = signal === "buy" ? price + takeProfitDistance : price - takeProfitDistance;
    const size = this.positionSize(this.accountBalance, price, stopLossDistance, symbol);
    console.log(`[calculateTradeParameters] Size: ${size}`);

    // Trailing stop parameters
    const trailingStopParams = {
      activationPrice:
        signal === "buy"
          ? price + stopLossDistance // Activate at 1R profit
          : price - stopLossDistance,
      trailingDistance: atr, // Trail by 1 ATR
    };

    return {
      size,
      stopLossPrice,
      takeProfitPrice,
      stopLossPips: stopLossDistance / this.getPipValue(symbol),
      takeProfitPips: takeProfitDistance / this.getPipValue(symbol),
      trailingStopParams,
      partialTakeProfit:
        signal === "buy"
          ? price + stopLossDistance // Take partial at 1R
          : price - stopLossDistance,
    };
  }

  logTradeParameters(signal, size, stopLossPrice, takeProfitPrice, stopLossPips) {
    console.log(
      `[TradeParams] Entry: ${signal.toUpperCase()} | Size: ${size} | SL: ${stopLossPrice} (${stopLossPips}) | TP: ${takeProfitPrice}`
    );
  }

  async executePosition(signal, symbol, params) {
    const { size, stopLossPrice, takeProfitPrice, trailingStopParams } = params;
    try {
      const position = await placePosition(symbol, signal, size, null, stopLossPrice, takeProfitPrice);
      if (position?.dealReference) {
        // Fetch and log deal confirmation
        const { getDealConfirmation } = await import("../api.js");
        const confirmation = await getDealConfirmation(position.dealReference);
        if (confirmation.dealStatus !== 'ACCEPTED' && confirmation.dealStatus !== 'OPEN') {
          console.error(`[Order] Not placed: ${confirmation.reason || confirmation.reasonCode}`);
        }
      }
      return position;
    } catch (error) {
      console.error(`[Position] Failed for ${symbol}:`, error);
      throw error;
    }
  }

  async setupTrailingStop(symbol, signal, dealId, params) {
    if (!dealId || !params?.trailingDistance) {
      console.warn("[TrailingStop] Missing required parameters");
      return;
    }

    setTimeout(async () => {
      try {
        const positions = await getOpenPositions();
        const position = positions?.positions?.find((p) => p.market.epic === symbol);
        if (position && position.profit > 0) {
          await updateTrailingStop(dealId, params.trailingDistance);
        }
      } catch (error) {
        console.error("[TrailingStop] Error:", error.message);
      }
    }, 5 * 60 * 1000);
  }

  async calculateATR(symbol) {
    try {
      const data = await getHistorical(symbol, ANALYSIS.TIMEFRAMES.ENTRY, 15);
      if (!data?.prices || data.prices.length < 14) {
        throw new Error("Insufficient data for ATR calculation");
      }
      let tr = [];
      const prices = data.prices;
      for (let i = 1; i < prices.length; i++) {
        const high = prices[i].highPrice?.ask || prices[i].high;
        const low = prices[i].lowPrice?.bid || prices[i].low;
        const prevClose = prices[i - 1].closePrice?.bid || prices[i - 1].close;
        const tr1 = high - low;
        const tr2 = Math.abs(high - prevClose);
        const tr3 = Math.abs(low - prevClose);
        tr.push(Math.max(tr1, tr2, tr3));
      }
      const atr = tr.slice(-14).reduce((sum, val) => sum + val, 0) / 14;
      return atr;
    } catch (error) {
      console.error("[ATR] Error:", error);
      return 0.001;
    }
  }

  async processPrice(message, maxOpenTrades) {
    let symbol = null;
    try {
      if (!message) return;
      const candle = message;
      symbol = candle.symbol || candle.epic;
      console.log(`\n=== Processing ${symbol} ===`);
      console.log(`[ProcessPrice] Open trades: ${this.openTrades.length}/${maxOpenTrades} | Balance: ${this.accountBalance}€`);
      if (this.openTrades.length >= maxOpenTrades) {
        console.log(`[ProcessPrice] Max trades reached. Skipping ${symbol}.`);
        return;
      }
      if (this.isSymbolTraded(symbol)) {
        console.log(`[ProcessPrice] ${symbol} already has an open position.`);
        return;
      }
      // const hour = new Date().getUTCHours();
      // if (hour < 6 || hour > 22) {
      //   console.log(`[ProcessPrice] Outside main trading session. Skipping ${symbol}.`);
      //   return;
      // }
      const bid = candle.bid || candle.closePrice?.bid || candle.c || candle.close;
      const ask = candle.ask || candle.closePrice?.ask || candle.c || candle.close;
      if (!this.validatePrices(bid, ask, symbol)) return;

      // --- ADD THIS ---
      const { signal } = await this.generateAndValidateSignal(candle, message, symbol, bid, ask);
      if (signal) {
        await this.executeTrade(signal, symbol, bid, ask, candle.indicators || {});
      }
      // ---------------
    } catch (error) {
      console.error(`[ProcessPrice] Error for ${symbol}:`, error);
    }
  }

  positionSize(balance, entryPrice, stopLossDistance, symbol) {
    const maxMargin = balance * AUTORESEARCH_ENTRY_PROFILE.marginUse;
    let size = Math.floor((maxMargin * AUTORESEARCH_ENTRY_PROFILE.leverage) / entryPrice / 100) * 100;
    if (size < 100) size = 100;
    const marginRequired = (size * entryPrice) / AUTORESEARCH_ENTRY_PROFILE.leverage;
    console.log(`[PositionSize] ${AUTORESEARCH_ENTRY_PROFILE.id} size=${size}, margin=${marginRequired.toFixed(2)}, maxMargin=${maxMargin.toFixed(2)}`);
    return size;
  }

  // Add pip value determination
  getPipValue(symbol) {
    return symbol.includes("JPY") ? 0.01 : 0.0001;
  }

  generateSignals(symbol, h4Data, h4Indicators, h1Indicators, m15Indicators, trendAnalysis, bid, ask, timestampMs = Date.now()) {
    if (!this.validateIndicatorData(h4Data, h4Indicators, h1Indicators, m15Indicators, trendAnalysis)) {
      return { signal: null };
    }
    const profileStatus = this.isAutoresearchProfileActive(symbol, timestampMs);
    if (!profileStatus.active) {
      return { signal: null, reason: profileStatus.reason, buyScore: 0, sellScore: 0 };
    }
    // this.logMarketConditions(symbol, bid, ask, h4Indicators, h1Indicators, m15Indicators, trendAnalysis);
    const buyConditions = this.generateBuyConditions(h4Indicators, h1Indicators, m15Indicators, trendAnalysis, bid);
    const sellConditions = this.generateSellConditions(h4Indicators, h1Indicators, m15Indicators, trendAnalysis, ask);
    const { signal, buyScore, sellScore } = this.evaluateSignals(buyConditions, sellConditions);
    return {
      signal,
      buyScore,
      sellScore,
    };
  }
}

export default new TradingService();
