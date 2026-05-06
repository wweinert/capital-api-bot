import { placePosition, updateTrailingStop, getDealConfirmation, closePosition as apiClosePosition, getOpenPositions, getHistorical, getMarketDetails } from "../api.js";
import { RISK, ANALYSIS, EXECUTION, TRADING_STRATEGY_MODE } from "../config.js";
import logger from "../utils/logger.js";
import { getTradeEntry, logTradeClose, logTradeOpen, tradeTracker } from "../utils/tradeLogger.js";
import strategyRouter from "../strategies/Router.js";
import { logStrategyDecision } from "../utils/strategyDecisionLogger.js";

const { PER_TRADE, MAX_POSITIONS } = RISK;
const HLLH_TRAIL_ACTIVATION_TP_PROGRESS = 0.45;
const HLLH_BREAKEVEN_ACTIVATION_TP_PROGRESS = 0.5;
const HLLH_TRAIL_DISTANCE_TP_FRACTION = 0.12;

class TradingService {
    constructor() {
        this.openTrades = [];
        this.accountBalance = 0;
        this.availableMargin = 0;
        this.dailyLoss = 0;
        this.dailyLossLimitPct = 0.05;
        this.executedHllhSignals = new Set();
        this.quotePerEurCache = new Map();
        this.intradayDealState = new Map();
    }

    setAccountBalance(balance) {
        this.accountBalance = balance;
    }
    setOpenTrades(trades) {
        this.openTrades = trades;
    }
    setAvailableMargin(m) {
        this.availableMargin = m;
    }

    normalizeDirection(direction) {
        return String(direction || "").toUpperCase();
    }

    toNumber(value) {
        if (value === undefined || value === null || value === "") return null;
        const num = typeof value === "number" ? value : Number(value);
        return Number.isFinite(num) ? num : null;
    }

    firstNumber(...values) {
        for (const value of values) {
            const num = this.toNumber(value);
            if (num !== null) return num;
        }
        return null;
    }

    resolveMarketPrice(direction, bid, ask) {
        const dir = this.normalizeDirection(direction);
        if (dir === "BUY" && Number.isFinite(ask)) return ask;
        if (dir === "SELL" && Number.isFinite(bid)) return bid;
        if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
        return bid ?? ask ?? null;
    }

    getPipValue(symbol) {
        return symbol.includes("JPY") ? 0.01 : 0.0001;
    }

    isSymbolTraded(symbol) {
        return this.openTrades.includes(symbol);
    }

    roundPrice(price, symbol) {
        const decimals = symbol.includes("JPY") ? 3 : 5;
        return Number(price).toFixed(decimals) * 1;
    }

    getTpProgress(direction, entryPrice, takeProfit, currentPrice) {
        const entry = Number(entryPrice);
        const tp = Number(takeProfit);
        const price = Number(currentPrice);
        if (!Number.isFinite(entry) || !Number.isFinite(tp) || !Number.isFinite(price)) return null;
        const tpDist = Math.abs(tp - entry);
        if (tpDist <= 0) return null;
        const dir = this.normalizeDirection(direction);
        if (dir === "BUY") return (price - entry) / tpDist;
        if (dir === "SELL") return (entry - price) / tpDist;
        return null;
    }

    async syncOpenTradesFromBroker() {
        const res = await getOpenPositions();
        const positions = Array.isArray(res?.positions) ? res.positions : [];
        const symbols = positions.map((p) => p?.market?.epic ?? p?.position?.epic).filter(Boolean);

        this.openTrades = [...new Set(symbols)];
    }

    async getPositionContext(dealId) {
        try {
            const positions = await getOpenPositions();
            const match = positions?.positions?.find((p) => p?.position?.dealId === dealId || p?.dealId === dealId);
            if (!match) return null;

            const symbol = match?.market?.epic || match?.position?.epic || match?.market?.instrumentName || null;
            const direction = match?.position?.direction;

            const bid = match?.market?.bid;
            const ask = match?.market?.offer ?? match?.market?.ask;
            const price = this.resolveMarketPrice(direction, bid, ask);

            return { symbol, direction, price };
        } catch (error) {
            logger.warn(`[ClosePos] Could not fetch position context for ${dealId}: ${error.message}`);
            return null;
        }
    }

    // ============================================================
    //                   MAIN PRICE LOOP
    // ============================================================
    async processPrice({ symbol, indicators, candles, bid, ask }) {
        try {
            await this.syncOpenTradesFromBroker();
            logger.info(`[ProcessPrice] Open trades: ${this.openTrades.length}/${MAX_POSITIONS} | Balance: ${this.accountBalance}€`);

            if (this.openTrades.length >= MAX_POSITIONS) {
                logger.info(`[ProcessPrice] Max trades reached. Skipping ${symbol}.`);
                logStrategyDecision({
                    strategyMode: TRADING_STRATEGY_MODE,
                    symbol,
                    decision: "blocked",
                    blockedReason: "max_positions_reached",
                    bid,
                    ask,
                    candidateContext: { openTrades: this.openTrades.length, maxPositions: MAX_POSITIONS },
                });
                return;
            }
            if (this.isSymbolTraded(symbol)) {
                logger.debug(`[ProcessPrice] ${symbol} already in market.`);
                logStrategyDecision({
                    strategyMode: TRADING_STRATEGY_MODE,
                    symbol,
                    decision: "blocked",
                    blockedReason: "symbol_already_traded",
                    bid,
                    ask,
                    candidateContext: { openTrades: this.openTrades },
                });
                return;
            }
            const primary = strategyRouter.evaluate({ symbol, indicators, candles, bid, ask });
            let { signal, reason = "", context = {} } = primary;
            const decisionBase = {
                strategyMode: context.strategyMode || TRADING_STRATEGY_MODE,
                profileId: context.profileId,
                strategyFamily: context.strategyFamily || context.strategyType,
                symbol,
                timeframe: context.timeframe,
                entrySignalReason: reason,
                exitProfile: context.exitProfile,
                managementProfile: context.managementProfile,
                riskProfile: context.riskProfile,
                bid,
                ask,
                spreadPips: context.currentSpreadPips,
                normalizedCandidateId: context.normalizedCandidateId,
                candidateContext: context.candidateContext || context,
            };

            if (!signal) {
                logger.debug(`[ProcessPrice] No strategy signal for ${symbol}: ${reason}`);
                logStrategyDecision({ ...decisionBase, decision: "no_signal", blockedReason: reason });
                return;
            }
            if (context?.normalizedCandidateId && this.executedHllhSignals.has(context.normalizedCandidateId)) {
                logger.debug(`[ProcessPrice] Duplicate strategy signal blocked for ${symbol}: ${context.normalizedCandidateId}`);
                logStrategyDecision({ ...decisionBase, decision: "blocked", blockedReason: "duplicate_signal" });
                return;
            }
            // Re-check just placing
            if (this.openTrades.length >= MAX_POSITIONS) {
                logStrategyDecision({ ...decisionBase, decision: "blocked", blockedReason: "max_positions_reached_before_order" });
                return;
            }
            if (this.isSymbolTraded(symbol)) {
                logStrategyDecision({ ...decisionBase, decision: "blocked", blockedReason: "symbol_already_traded_before_order" });
                return;
            }

            logger.info(`[Signal] ${symbol}: ${signal} ${reason} ${context?.normalizedCandidateId || ""}`);
            logStrategyDecision({ ...decisionBase, decision: "signal" });

            const toIsoTimestamp = (value) => {
                if (value === undefined || value === null || value === "") return null;
                if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
                const parsed = new Date(value);
                return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
            };
            const toLastClosedCandle = (series = []) => {
                if (!Array.isArray(series) || series.length === 0) return null;
                const candle = series.length > 1 ? series[series.length - 2] : series[series.length - 1];
                return {
                    t: toIsoTimestamp(candle?.timestamp ?? candle?.snapshotTime ?? candle?.snapshotTimeUTC),
                    o: this.toNumber(candle?.open ?? candle?.openPrice?.bid ?? candle?.openPrice?.ask),
                    h: this.toNumber(candle?.high ?? candle?.highPrice?.bid ?? candle?.highPrice?.ask),
                    l: this.toNumber(candle?.low ?? candle?.lowPrice?.bid ?? candle?.lowPrice?.ask),
                    c: this.toNumber(candle?.close ?? candle?.closePrice?.bid ?? candle?.closePrice?.ask),
                };
            };
            const candlesSnapshot = {
                d1: toLastClosedCandle(candles?.d1Candles),
                h4: toLastClosedCandle(candles?.h4Candles),
                h1: toLastClosedCandle(candles?.h1Candles),
                m15: toLastClosedCandle(candles?.m15Candles),
                m5: toLastClosedCandle(candles?.m5Candles),
                m1: toLastClosedCandle(candles?.m1Candles),
            };

            await this.executeTrade(symbol, signal, bid, ask, indicators, reason, context, candlesSnapshot);
        } catch (error) {
            logger.error("[ProcessPrice] Error:", error);
        }
    }

    // ============================================================
    //               ATR-Based Trade Parameters
    // ============================================================
    async calculateATR(symbol) {
        try {
            const data = await getHistorical(symbol, ANALYSIS.TIMEFRAMES.M15, 15);
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
            logger.error(`[ATR] Error calculating ATR for ${symbol}: ${error.message}`);
            return 0.001;
        }
    }

    async calculateTradeParameters(signal, symbol, bid, ask, context = {}) {
        const direction = this.normalizeDirection(signal);
        if (!["BUY", "SELL"].includes(direction)) {
            throw new Error(`[Trade Params] Invalid signal for ${symbol}: ${signal}`);
        }

        const isBuy = direction === "BUY";
        const price = this.resolveMarketPrice(direction, bid, ask);
        if (!Number.isFinite(price)) {
            throw new Error(`[Trade Params] Missing valid market price for ${symbol} (${direction})`);
        }

        const contextStopPrice = this.toNumber(context?.expectedStopPrice);
        if (Number.isFinite(contextStopPrice)) {
            const expectedStop = this.toNumber(context.expectedStopPrice);
            if (!Number.isFinite(expectedStop)) {
                throw new Error(`[Trade Params] Missing strategy stop price for ${symbol}`);
            }
            const riskDistance = isBuy ? price - expectedStop : expectedStop - price;
            if (!(Number.isFinite(riskDistance) && riskDistance > 0)) {
                throw new Error(`[Trade Params] Invalid strategy risk distance for ${symbol}: entry=${price} stop=${expectedStop}`);
            }
            const takeProfitR = Number.isFinite(Number(context.takeProfitR)) ? Number(context.takeProfitR) : 1.5;
            const stopLossPrice = this.roundPrice(expectedStop, symbol);
            const takeProfitPrice = this.roundPrice(isBuy ? price + riskDistance * takeProfitR : price - riskDistance * takeProfitR, symbol);
            const positionSizing = await this.positionSize(this.accountBalance, price, stopLossPrice, symbol);
            const size = positionSizing.size;

            return {
                size,
                positionSizing,
                stopLossPrice,
                takeProfitPrice,
                stopLossPips: riskDistance,
                takeProfitPips: riskDistance * takeProfitR,
                trailingStopParams: {
                    activationPrice: isBuy ? price + riskDistance * HLLH_TRAIL_ACTIVATION_TP_PROGRESS : price - riskDistance * HLLH_TRAIL_ACTIVATION_TP_PROGRESS,
                    trailingDistance: Math.abs(takeProfitPrice - price) * HLLH_TRAIL_DISTANCE_TP_FRACTION,
                },
                partialTakeProfit: isBuy ? price + riskDistance : price - riskDistance,
                price,
                patternMeta: context,
            };
        }

        const atr = await this.calculateATR(symbol);
        const spread = Number.isFinite(bid) && Number.isFinite(ask) ? Math.abs(ask - bid) : 0;
        const stopLossPips = Math.max(1.5 * atr, spread * 2);
        const stopLossPrice = isBuy ? price - stopLossPips : price + stopLossPips;
        const takeProfitPips = 2 * stopLossPips; // 2:1 reward-risk ratio
        const takeProfitPrice = isBuy ? price + takeProfitPips : price - takeProfitPips;
        const positionSizing = await this.positionSize(this.accountBalance, price, stopLossPrice, symbol);
        const size = positionSizing.size;

        // Trailing stop parameters
        const trailingStopParams = {
            activationPrice: isBuy
                ? price + stopLossPips // Activate at 1R profit
                : price - stopLossPips,
            trailingDistance: atr, // Trail by 1 ATR
        };

        return {
            size,
            positionSizing,
            stopLossPrice,
            takeProfitPrice,
            stopLossPips,
            takeProfitPips,
            trailingStopParams,
            partialTakeProfit: isBuy
                ? price + stopLossPips // Take partial at 1R
                : price - stopLossPips,
            price,
        };
    }

    leverageForSymbol(symbol) {
        return String(symbol || "").includes("USD") ? 30 : 20;
    }

    parseSymbol(symbol) {
        const normalized = String(symbol || "").toUpperCase();
        return {
            base: normalized.slice(0, 3),
            quote: normalized.slice(3, 6),
        };
    }

    marketMid(details) {
        const bid = this.firstNumber(details?.snapshot?.bid, details?.bid);
        const ask = this.firstNumber(details?.snapshot?.offer, details?.snapshot?.ask, details?.offer, details?.ask);
        if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) return (bid + ask) / 2;
        return this.firstNumber(details?.snapshot?.mid, details?.mid, bid, ask);
    }

    async getMarketMid(symbol) {
        const details = await getMarketDetails(symbol);
        const mid = this.marketMid(details);
        return Number.isFinite(mid) && mid > 0 ? mid : null;
    }

    async getQuotePerEur(quoteCurrency) {
        const quote = String(quoteCurrency || "").toUpperCase();
        if (!quote) return null;
        if (quote === "EUR") return 1;

        const cached = this.quotePerEurCache.get(quote);
        if (cached && Date.now() - cached.ts < 60_000) return cached.value;

        const resolve = async () => {
            const direct = await this.getMarketMid(`EUR${quote}`).catch(() => null);
            if (Number.isFinite(direct) && direct > 0) return direct;

            const inverse = await this.getMarketMid(`${quote}EUR`).catch(() => null);
            if (Number.isFinite(inverse) && inverse > 0) return 1 / inverse;

            const eurusd = await this.getMarketMid("EURUSD").catch(() => null);
            if (!(Number.isFinite(eurusd) && eurusd > 0)) return null;

            if (quote === "USD") return eurusd;

            const usdQuote = await this.getMarketMid(`USD${quote}`).catch(() => null);
            if (Number.isFinite(usdQuote) && usdQuote > 0) return eurusd * usdQuote;

            const quoteUsd = await this.getMarketMid(`${quote}USD`).catch(() => null);
            if (Number.isFinite(quoteUsd) && quoteUsd > 0) return eurusd / quoteUsd;

            return null;
        };

        const value = await resolve();
        if (Number.isFinite(value) && value > 0) {
            this.quotePerEurCache.set(quote, { value, ts: Date.now() });
            return value;
        }
        return null;
    }

    emptyPositionSizing(symbol, reason) {
        return {
            symbol,
            size: 0,
            reason,
            requestedRiskPct: PER_TRADE,
            requestedRiskAmount: 0,
            effectiveRiskPct: 0,
            effectiveRiskAmount: 0,
            marginCapHit: false,
        };
    }

    async positionSize(balance, entryPrice, stopLossPrice, symbol) {
        const accountBalance = this.toNumber(balance);
        if (!(Number.isFinite(accountBalance) && accountBalance > 0)) {
            logger.error(`[PositionSize] Invalid account balance for ${symbol}: ${balance}`);
            return this.emptyPositionSizing(symbol, "invalid_balance");
        }

        const entry = this.toNumber(entryPrice);
        const stop = this.toNumber(stopLossPrice);
        const riskDistance = Math.abs(entry - stop);
        if (!(Number.isFinite(entry) && entry > 0 && Number.isFinite(stop) && stop > 0 && Number.isFinite(riskDistance) && riskDistance > 0)) {
            logger.error(`[PositionSize] Invalid price inputs for ${symbol}: entry=${entryPrice}, stop=${stopLossPrice}`);
            return this.emptyPositionSizing(symbol, "invalid_prices");
        }

        const { base, quote } = this.parseSymbol(symbol);
        if (!base || !quote) {
            logger.error(`[PositionSize] Invalid symbol for sizing: ${symbol}`);
            return this.emptyPositionSizing(symbol, "invalid_symbol");
        }

        const quotePerEur = await this.getQuotePerEur(quote);
        if (!(Number.isFinite(quotePerEur) && quotePerEur > 0)) {
            logger.error(`[PositionSize] Could not resolve ${quote}/EUR conversion for ${symbol}`);
            return this.emptyPositionSizing(symbol, "missing_quote_conversion");
        }

        const requestedRiskAmount = accountBalance * PER_TRADE;
        const rawSize = (requestedRiskAmount * quotePerEur) / riskDistance;
        const leverage = this.leverageForSymbol(symbol);
        const notionalEurForSize = (value) => (value * entry) / quotePerEur;
        const marginForSize = (value) => notionalEurForSize(value) / leverage;

        const brokerAvailableMargin = this.toNumber(this.availableMargin);
        const availableMargin = Number.isFinite(brokerAvailableMargin) && brokerAvailableMargin > 0 ? brokerAvailableMargin : accountBalance;
        const maxMarginPerTrade = availableMargin * 0.7;

        if (!(Number.isFinite(maxMarginPerTrade) && maxMarginPerTrade > 0)) {
            logger.error(`[PositionSize] Invalid margin budget for ${symbol}: availableMargin=${this.availableMargin}, balance=${accountBalance}`);
            return this.emptyPositionSizing(symbol, "invalid_margin_budget");
        }

        const rawMargin = marginForSize(rawSize);
        const marginScale = rawMargin > maxMarginPerTrade ? maxMarginPerTrade / rawMargin : 1;
        let size = Math.floor((rawSize * marginScale) / 100) * 100;
        if (size < 100) {
            logger.warn(`[PositionSize] ${symbol}: minimum size 100 exceeds sizing constraints. raw=${rawSize}, marginCap=${maxMarginPerTrade}`);
            return this.emptyPositionSizing(symbol, "below_min_size");
        }

        let marginRequired = marginForSize(size);
        if (marginRequired > maxMarginPerTrade) {
            size = Math.floor((maxMarginPerTrade * leverage * quotePerEur) / entry / 100) * 100;
            marginRequired = marginForSize(size);
        }

        if (!(Number.isFinite(size) && size >= 100 && marginRequired <= maxMarginPerTrade)) {
            logger.warn(`[PositionSize] ${symbol}: adjusted size still exceeds margin cap. size=${size}, margin=${marginRequired}, cap=${maxMarginPerTrade}`);
            return this.emptyPositionSizing(symbol, "margin_cap_too_small");
        }

        const effectiveRiskAmount = (size * riskDistance) / quotePerEur;
        const effectiveRiskPct = effectiveRiskAmount / accountBalance;
        const stopLossPips = riskDistance / this.getPipValue(symbol);
        const marginCapHit = rawMargin > maxMarginPerTrade || size < Math.floor(rawSize / 100) * 100;
        const positionSizing = {
            symbol,
            baseCurrency: base,
            quoteCurrency: quote,
            quotePerEur,
            size,
            rawSize,
            requestedRiskPct: PER_TRADE,
            requestedRiskAmount,
            effectiveRiskPct,
            effectiveRiskAmount,
            riskDistance,
            stopLossPips,
            leverage,
            notionalEur: notionalEurForSize(size),
            rawMargin,
            marginRequired,
            availableMargin,
            maxMarginPerTrade,
            marginCapPct: 0.7,
            marginCapHit,
        };

        logger.debug(
            `[PositionSize] ${symbol}: targetRisk=${(PER_TRADE * 100).toFixed(2)}% effectiveRisk=${(effectiveRiskPct * 100).toFixed(3)}% raw=${rawSize.toFixed(2)} final=${size} margin=${marginRequired.toFixed(2)}/${maxMarginPerTrade.toFixed(2)}`,
        );
        return positionSizing;
    }

    // ============================================================
    //                    Place the Trade
    // ============================================================
    async executeTrade(symbol, signal, bid, ask, indicators, reason, context, candlesSnapshot) {
        try {
            if (EXECUTION.MODE === "demo" || (TRADING_STRATEGY_MODE === "intraday_lab" && !EXECUTION.ALLOW_INTRADAY_LIVE_ORDERS)) {
                logger.info(
                    `[DemoOrder] ${symbol} ${signal} blocked before broker order. strategyMode=${TRADING_STRATEGY_MODE} executionMode=${EXECUTION.MODE} allowIntradayLive=${EXECUTION.ALLOW_INTRADAY_LIVE_ORDERS}`,
                );
                logStrategyDecision({
                    strategyMode: context?.strategyMode || TRADING_STRATEGY_MODE,
                    profileId: context?.profileId,
                    strategyFamily: context?.strategyFamily || context?.strategyType,
                    symbol,
                    timeframe: context?.timeframe,
                    entrySignalReason: reason,
                    exitProfile: context?.exitProfile,
                    managementProfile: context?.managementProfile,
                    riskProfile: context?.riskProfile,
                    decision: "demo_order_blocked",
                    blockedReason: EXECUTION.MODE === "demo" ? "execution_mode_demo" : "intraday_live_orders_not_allowed",
                    candidateContext: context?.candidateContext || context,
                    bid,
                    ask,
                    spreadPips: context?.currentSpreadPips,
                    normalizedCandidateId: context?.normalizedCandidateId,
                });
                return;
            }
            const { size, price, stopLossPrice, takeProfitPrice, positionSizing } = await this.calculateTradeParameters(signal, symbol, bid, ask, context);
            if (!(Number.isFinite(size) && size > 0)) {
                logger.warn(`[Order] Skipping ${symbol}: calculated size is not tradable (${size}).`);
                return;
            }

            const pos = await placePosition(symbol, signal, size, price, stopLossPrice, takeProfitPrice);

            if (!pos?.dealReference) {
                logger.error(`[Order] Missing deal reference for ${symbol}`);
                return;
            }

            const confirmation = await getDealConfirmation(pos.dealReference);
            if (!["ACCEPTED", "OPEN"].includes(confirmation.dealStatus)) {
                logger.error(`[Order] Not placed: ${confirmation.reason}`);
                return;
            }

            logger.info(
                `[Order] OPENED ${symbol} ${signal} size=${size} entry=${price} SL=${stopLossPrice} TP=${takeProfitPrice} risk=${((positionSizing?.effectiveRiskPct || 0) * 100).toFixed(3)}% margin=${positionSizing?.marginRequired?.toFixed?.(2) ?? "n/a"}`,
            );

            const affectedDealId = confirmation?.affectedDeals?.find((d) => d?.status === "OPENED")?.dealId;
            // or: const affectedDealId = confirmation?.affectedDeals?.[0]?.dealId;

            try {
                if (!affectedDealId) {
                    logger.warn(`[Order] Missing dealId for ${symbol}, skipping trade log.`);
                } else {
                    // const indicatorSnapshot = this.buildIndicatorSnapshot(indicators, price, symbol);
                    const entryPrice = confirmation?.level ?? price;
                    const stopLossRounded = this.roundPrice(stopLossPrice, symbol);
                    const takeProfitRounded = this.roundPrice(takeProfitPrice, symbol);
                    const logTimestamp = new Date().toISOString();
                    const actualPositionSizing = await this.positionSize(this.accountBalance, entryPrice, stopLossRounded, symbol);

                    logTradeOpen({
                        dealId: affectedDealId,
                        symbol,
                        signal,
                        openReason: reason,
                        entryPrice,
                        stopLoss: stopLossRounded,
                        takeProfit: takeProfitRounded,
                        indicatorsOnOpening: indicators,
                        candlesOnOpening: candlesSnapshot,
                        strategyContext: context,
                        positionSizing: {
                            planned: positionSizing,
                            actual: actualPositionSizing,
                        },
                        timestamp: logTimestamp,
                    });

                    tradeTracker.registerOpenDeal(affectedDealId, symbol);
                    if (context?.normalizedCandidateId) this.executedHllhSignals.add(context.normalizedCandidateId);
                    // track open deal in memory
                }
            } catch (logError) {
                logger.error(`[Order] Failed to log open trade for ${symbol}:`, logError);
            }

            this.openTrades.push(symbol);
        } catch (error) {
            logger.error(`[Order] Error placing order for ${symbol}:`, error);
        }
    }

    // ============================================================
    //               Trailing Stop (Improved)
    // ============================================================
    async updateTrailingStopIfNeeded(position, indicators) {
        const { dealId, direction, entryPrice, stopLoss, takeProfit, currentPrice, symbol } = position;

        if (!dealId) return;

        const { entry: loggedEntry } = getTradeEntry(dealId, symbol);
        const managementProfile = loggedEntry?.strategyContext?.managementProfile || {};
        const managementMode = managementProfile?.mode;
        if (managementMode === "none") {
            logger.debug(`[Trail] Skipped for ${dealId}: strategy managementProfile=none`);
            return;
        }

        if (managementMode === "atr_trail_after_r") {
            await this.updateAtrTrailIfNeeded(position, indicators, loggedEntry, managementProfile);
            return;
        }

        if (managementMode === "adaptive_trail_r") {
            await this.updateAdaptiveRTrailIfNeeded(position, loggedEntry, managementProfile);
            return;
        }

        const tpProgress = this.getTpProgress(direction, entryPrice, takeProfit, currentPrice);
        if (tpProgress === null || tpProgress < HLLH_TRAIL_ACTIVATION_TP_PROGRESS) {
            return; // HLLH tighter_trail activates after 45% TP progress.
        }

        // --- Trend misalignment → Breakeven exit ---
        const m5 = indicators.m5;
        const m15 = indicators.m15;
        if (m5 && m15 && tpProgress >= HLLH_BREAKEVEN_ACTIVATION_TP_PROGRESS) {
            const m5Trend = strategyRouter.pickTrend(m5, { symbol, timeframe: "M5", atr: m5.atr });
            const m15Trend = strategyRouter.pickTrend(m15, { symbol, timeframe: "M15", atr: m15.atr });

            const broken =
                (direction === "BUY" && (m5Trend === "bearish" || m15Trend === "bearish")) ||
                (direction === "SELL" && (m5Trend === "bullish" || m15Trend === "bullish"));

            if (broken) {
                await this.softExitToBreakeven(position);
                return;
            }
        }

        const entry = Number(entryPrice);
        const tp = Number(takeProfit);
        const price = Number(currentPrice);
        if (!Number.isFinite(entry) || !Number.isFinite(tp) || !Number.isFinite(price)) return;
        const tpDist = Math.abs(tp - entry);
        if (tpDist <= 0) return;

        const dir = this.normalizeDirection(direction);
        const activation = dir === "BUY" ? entry + tpDist * HLLH_TRAIL_ACTIVATION_TP_PROGRESS : entry - tpDist * HLLH_TRAIL_ACTIVATION_TP_PROGRESS;

        const activated = (dir === "BUY" && price >= activation) || (dir === "SELL" && price <= activation);

        if (!activated) return;

        const trailDist = tpDist * HLLH_TRAIL_DISTANCE_TP_FRACTION;
        let newSL = dir === "BUY" ? price - trailDist : price + trailDist;

        const stop = Number(stopLoss);
        if (Number.isFinite(stop)) {
            if ((dir === "BUY" && newSL <= stop) || (dir === "SELL" && newSL >= stop)) return;
        }

        try {
            await updateTrailingStop(dealId, price, entry, tp, dir, symbol, {
                activationProgress: HLLH_TRAIL_ACTIVATION_TP_PROGRESS,
                trailDistanceTpFraction: HLLH_TRAIL_DISTANCE_TP_FRACTION,
            });
            logger.info(`[Trail] Updated SL → ${newSL} for ${dealId}`);
        } catch (error) {
            logger.error(`[Trail] Error updating trailing stop:`, error);
        }
    }

    async updateAtrTrailIfNeeded(position, indicators, loggedEntry, managementProfile) {
        const { dealId, direction, entryPrice, stopLoss, takeProfit, currentPrice, symbol } = position;
        const entry = Number(entryPrice);
        const initialStop = this.toNumber(loggedEntry?.strategyContext?.expectedStopPrice) ?? this.toNumber(loggedEntry?.stopLoss) ?? this.toNumber(stopLoss);
        const tp = Number(takeProfit);
        const price = Number(currentPrice);
        const atrSource = String(managementProfile?.atrTimeframe || "H1").toLowerCase();
        const atr = this.toNumber(indicators?.[atrSource]?.atr) ?? this.toNumber(indicators?.h1?.atr) ?? this.toNumber(indicators?.m15?.atr);
        const activationR = Number.isFinite(Number(managementProfile?.activationR)) ? Number(managementProfile.activationR) : 1.5;
        const atrMultiplier = Number.isFinite(Number(managementProfile?.atrMultiplier)) ? Number(managementProfile.atrMultiplier) : 2;

        if (![entry, initialStop, tp, price, atr].every(Number.isFinite) || atr <= 0) return;

        const dir = this.normalizeDirection(direction);
        const initialRisk = Math.abs(entry - initialStop);
        const tpDistance = Math.abs(tp - entry);
        if (!(initialRisk > 0 && tpDistance > 0)) return;

        const currentR = dir === "BUY" ? (price - entry) / initialRisk : (entry - price) / initialRisk;
        if (currentR < activationR) return;

        const desiredDistance = atr * atrMultiplier;
        const trailDistanceTpFraction = desiredDistance / tpDistance;
        if (!(Number.isFinite(trailDistanceTpFraction) && trailDistanceTpFraction > 0)) return;

        const newSL = dir === "BUY" ? price - desiredDistance : price + desiredDistance;
        const currentStop = Number(stopLoss);
        if (Number.isFinite(currentStop)) {
            if ((dir === "BUY" && newSL <= currentStop) || (dir === "SELL" && newSL >= currentStop)) return;
        }

        try {
            await updateTrailingStop(dealId, price, entry, tp, dir, symbol, {
                activationProgress: activationR / (tpDistance / initialRisk),
                trailDistanceTpFraction,
            });
            logger.info(`[Trail] ATR profile updated SL distance for ${dealId}: atr=${atr}, multiplier=${atrMultiplier}, approxSL=${newSL}`);
        } catch (error) {
            logger.error(`[Trail] ATR profile error:`, error);
        }
    }

    async updateAdaptiveRTrailIfNeeded(position, loggedEntry, managementProfile) {
        const { dealId, direction, entryPrice, stopLoss, currentPrice, symbol } = position;
        const entry = Number(entryPrice);
        const price = Number(currentPrice);
        const initialStop = this.toNumber(loggedEntry?.strategyContext?.expectedStopPrice) ?? this.toNumber(loggedEntry?.stopLoss) ?? this.toNumber(stopLoss);
        if (![entry, price, initialStop].every(Number.isFinite)) return;

        const dir = this.normalizeDirection(direction);
        if (!["BUY", "SELL"].includes(dir)) return;

        const initialRisk = Math.abs(entry - initialStop);
        if (!(initialRisk > 0)) return;

        const currentR = dir === "BUY" ? (price - entry) / initialRisk : (entry - price) / initialRisk;
        const activationR = Number.isFinite(Number(managementProfile?.activationR)) ? Number(managementProfile.activationR) : 1;
        const trailR = Number.isFinite(Number(managementProfile?.trailR)) ? Number(managementProfile.trailR) : 0.5;
        const breakevenR = Number.isFinite(Number(managementProfile?.breakevenR)) ? Number(managementProfile.breakevenR) : activationR;

        const protectProfit = managementProfile?.protectProfit || {};
        const minProfitR = Number(protectProfit.minProfitR);
        const givebackPct = Number(protectProfit.givebackPct);
        if (Number.isFinite(minProfitR) && Number.isFinite(givebackPct) && minProfitR > 0 && givebackPct > 0) {
            const state = this.intradayDealState.get(dealId) || { maxFavorableR: currentR };
            state.maxFavorableR = Math.max(Number(state.maxFavorableR || 0), currentR);
            this.intradayDealState.set(dealId, state);
            if (state.maxFavorableR >= minProfitR) {
                const giveback = state.maxFavorableR > 0 ? (state.maxFavorableR - currentR) / state.maxFavorableR : 0;
                if (giveback >= givebackPct) {
                    logger.info(
                        `[ProtectProfit] Closing ${symbol} ${dealId}: currentR=${currentR.toFixed(2)} maxR=${state.maxFavorableR.toFixed(2)} giveback=${giveback.toFixed(2)}`,
                    );
                    await this.closePosition(dealId, "intraday_protect_profit_giveback");
                    return;
                }
            }
        }
        if (currentR < Math.min(activationR, breakevenR)) return;

        let desiredStop = null;
        if (currentR >= breakevenR) {
            desiredStop = entry;
        }
        if (currentR >= activationR) {
            const trailingStop = dir === "BUY" ? price - initialRisk * trailR : price + initialRisk * trailR;
            desiredStop = desiredStop === null ? trailingStop : dir === "BUY" ? Math.max(desiredStop, trailingStop) : Math.min(desiredStop, trailingStop);
        }
        if (!Number.isFinite(desiredStop)) return;

        const currentStop = Number(stopLoss);
        if (Number.isFinite(currentStop)) {
            if ((dir === "BUY" && desiredStop <= currentStop) || (dir === "SELL" && desiredStop >= currentStop)) return;
        }

        const stopDistance = Math.abs(price - desiredStop);
        if (!(Number.isFinite(stopDistance) && stopDistance > 0)) return;

        try {
            await updateTrailingStop(dealId, price, entry, null, dir, symbol, { stopDistance });
            logger.info(
                `[Trail] Adaptive R profile updated ${symbol} ${dealId}: currentR=${currentR.toFixed(2)} stopDistance=${stopDistance.toFixed(6)} approxSL=${desiredStop}`,
            );
        } catch (error) {
            logger.error(`[Trail] Adaptive R profile error:`, error);
        }
    }

    // ============================================================
    //               Breakeven Soft Exit
    // ============================================================
    async softExitToBreakeven(position) {
        const { dealId, entryPrice, takeProfit, currentPrice, direction, symbol } = position;

        const newSL = entryPrice;
        try {
            const tpProgress = this.getTpProgress(direction, entryPrice, takeProfit, currentPrice);
            if (tpProgress === null || tpProgress < HLLH_BREAKEVEN_ACTIVATION_TP_PROGRESS) {
                logger.info(
                    `[SoftExit] Skipped breakeven: TP progress ${(tpProgress ?? 0).toFixed(2)} < ${HLLH_BREAKEVEN_ACTIVATION_TP_PROGRESS.toFixed(2)} for ${dealId}`,
                );
                return;
            }

            await updateTrailingStop(dealId, currentPrice, entryPrice, takeProfit, direction, symbol, {
                activationProgress: HLLH_BREAKEVEN_ACTIVATION_TP_PROGRESS,
                trailDistanceTpFraction: HLLH_TRAIL_DISTANCE_TP_FRACTION,
            });

            logger.info(`[SoftExit] ${symbol}: misalignment → moved SL to breakeven for ${dealId}`);
        } catch (e) {
            logger.error(`[SoftExit] Error updating SL to breakeven:`, e);
        }
    }

    // ============================================================
    //                     Close Position
    // ============================================================
    async closePosition(dealId, label) {
        const requestedReason = label || "manual_close";
        let symbol;
        let priceHint;
        let indicatorSnapshot = null;
        let closePayload;
        let confirmation;

        try {
            const context = await this.getPositionContext(dealId);
            if (context) {
                symbol = context.symbol;
                priceHint = context.price;
            }
        } catch (contextError) {
            logger.warn(`[ClosePos] Could not capture close snapshot for ${dealId}: ${contextError.message}`);
        }

        try {
            if (symbol) {
                indicatorSnapshot = await tradeTracker.getCloseIndicators(symbol);
            }
        } catch (snapshotError) {
            logger.warn(`[ClosePos] Could not capture close indicators for ${dealId}: ${snapshotError.message}`);
        }

        try {
            closePayload = await apiClosePosition(dealId);
            logger.info(`[ClosePos] Raw close payload for ${dealId}:`, closePayload);
        } catch (err) {
            logger.error(`[ClosePos] Error closing deal ${dealId}:`, err);
            return;
        }

        try {
            if (closePayload?.dealReference) {
                try {
                    confirmation = await getDealConfirmation(closePayload.dealReference);
                    logger.info(`[ClosePos] Close confirmation for ${dealId}:`, confirmation);
                } catch (confirmError) {
                    logger.warn(`[ClosePos] Close confirmation failed for ${dealId}: ${confirmError.message}`);
                }
            }

            const brokerPrice = this.firstNumber(
                confirmation?.closeLevel,
                confirmation?.level,
                confirmation?.dealLevel,
                confirmation?.price,
                closePayload?.closeLevel,
                closePayload?.level,
                closePayload?.price,
                priceHint,
            );

            const brokerReason =
                confirmation?.reason ?? confirmation?.status ?? confirmation?.dealStatus ?? closePayload?.reason ?? closePayload?.status ?? null;

            const brokerReasonText = brokerReason ? String(brokerReason) : "";
            const requestedReasonText = requestedReason ? String(requestedReason) : "";
            const hasExplicitBrokerReason = /stop|sl|limit|tp|take|profit|loss/i.test(brokerReasonText);
            const hasGenericBrokerReason = /closed|close|deleted|cancel|rejected|filled|accepted/i.test(brokerReasonText);
            const finalReason = hasExplicitBrokerReason ? brokerReasonText : requestedReasonText || (!hasGenericBrokerReason && brokerReasonText) || "unknown";

            logger.info("[ClosePos] Derived closeReason", {
                dealId,
                requestedReason,
                brokerReason,
                finalReason,
                closePrice: brokerPrice,
                priceHint,
                hasConfirmation: Boolean(confirmation),
            });

            const updated = logTradeClose({
                dealId,
                symbol,
                closePrice: brokerPrice ?? priceHint ?? null,
                closeReason: finalReason,
                indicatorsOnClosing: indicatorSnapshot,
                timestamp: new Date().toISOString(),
            });
            if (updated) tradeTracker.markDealClosed(dealId);
        } catch (logErr) {
            logger.error(`[ClosePos] Failed to log closure for ${dealId}:`, logErr);
        }
    }
}

export default new TradingService();
