import {
    placeOrder,
    getDealConfirmation,
    closePosition as apiClosePosition,
    getOpenPositions,
    getWorkingOrders,
    getMarketDetails,
    getAccountTransactions,
    getAccountInfo,
    getHistorical,
    updatePositionProtection,
} from "../api.js";
import { calcIndicators } from "../indicators/indicators.js";
import { RISK, PORTFOLIO, TIMEFRAMES } from "../config.js";
import logger from "../utils/logger.js";

class TradingService {
    #orderBufferPips = 3;
    #orderExpiryMinutes = 45;
    #targetR = RISK.DYNAMIC_TARGET_R;
    #minSignalRating = -0.833014;
    #signalRatingWeights = {
        strength: -0.984903,
        risk: -0.199351,
        spread: -3.289938,
        entryGap: -0.74576,
        trend: 0.539907,
        priceEma: -0.432509,
        emaSlope: 0.316831,
        efficiency: 0.170911,
        rejectionWick: 0.273558,
        previousBody: 0.651536,
    };

    openTrades = [];
    accountBalance = 0;
    availableMargin = 0;
    quotePerEurCache = new Map();
    dynamicPlanByDeal = new Map();

    // Account and candidate selection
    async updateAccountInfo() {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const data = await getAccountInfo();
                const balance = data?.accounts?.[0]?.balance;
                if (!balance?.balance) throw new Error("Missing account balance");

                this.accountBalance = balance.balance;
                if (balance.available !== undefined) this.availableMargin = balance.available;
                return;
            } catch (error) {
                if (attempt === 3) {
                    logger.error("[Trading] Failed to update account info after all retries:", error);
                    return;
                }
                logger.warn(`Account info update failed, retrying... (${3 - attempt} attempts left)`);
                await new Promise((resolve) => setTimeout(resolve, 2_000));
            }
        }
    }

    async syncOpenTradesFromBroker() {
        const [positionsResult, ordersResult] = await Promise.all([getOpenPositions(), getWorkingOrders()]);

        const positions = positionsResult?.positions || [];

        const orders = ordersResult?.workingOrders || [];

        const positionSymbols = positions.map((item) => item?.market?.epic || item?.position?.epic);

        const orderSymbols = orders.map((item) => item?.workingOrderData?.epic);

        this.openTrades = [...new Set([...positionSymbols, ...orderSymbols].filter(Boolean))];
    }

    async processCandidates(candidates = []) {
        await this.syncOpenTradesFromBroker();

        const freePositions = PORTFOLIO.MAX_POSITIONS - this.openTrades.length;

        if (freePositions <= 0) {
            logger.info("[Trading] No free positions");
            return [];
        }
        const allowedCandidates = await this.getAllowedCandidates(candidates);

        const ratedCandidates = allowedCandidates
            .filter((candidate) => !this.isSymbolTraded(candidate.symbol))
            .map((candidate) => ({ candidate, rating: this.rateCandidate(candidate) }))
            .filter(({ rating }) => Number.isFinite(rating) && rating >= this.#minSignalRating)
            .sort((left, right) => right.rating - left.rating);
        const selected = ratedCandidates.slice(0, freePositions).map(({ candidate }) => candidate);

        logger.info(
            `[Trading] Rated: ${
                ratedCandidates.length ? ratedCandidates.map(({ candidate, rating }) => `${candidate.symbol} ${rating.toFixed(3)}`).join(", ") : "none"
            }`,
        );
        logger.info(`[Trading] Selected: ${selected.length ? selected.map((candidate) => candidate.symbol).join(", ") : "none"}`);

        const executed = [];

        for (const candidate of selected) {
            const success = await this.executeCandidate(candidate);

            if (success) {
                this.openTrades.push(candidate.symbol);
                executed.push(candidate);
            }
        }

        return executed;
    }

    async getAllowedCandidates(candidates) {
        if (!candidates.length) return [];

        const now = new Date();

        const dayStart = new Date(now);
        dayStart.setUTCHours(0, 0, 0, 0);

        const weekStart = new Date(dayStart);
        const daysFromMonday = (weekStart.getUTCDay() + 6) % 7;
        weekStart.setUTCDate(weekStart.getUTCDate() - daysFromMonday);

        const formatDate = (date) => date.toISOString().slice(0, 19);

        const getTime = (value) => {
            const date = String(value || "");
            return Date.parse(date.endsWith("Z") ? date : `${date}Z`);
        };

        const weeklyTransactions = await getAccountTransactions(formatDate(weekStart), formatDate(now));

        const todayTransactions = weeklyTransactions.filter((transaction) => getTime(transaction.dateUtc || transaction.dateUTC) >= dayStart.getTime());

        const getProfit = (transactions) =>
            transactions.reduce((total, transaction) => {
                const profitAndLoss = Number(transaction.profitAndLoss ?? transaction.size);
                return total + (Number.isFinite(profitAndLoss) ? profitAndLoss : 0);
            }, 0);

        const dailyProfit = getProfit(todayTransactions);
        const weeklyProfit = getProfit(weeklyTransactions);

        const dailyStartBalance = this.accountBalance - dailyProfit;
        const weeklyStartBalance = this.accountBalance - weeklyProfit;

        const tradingBlocked =
            dailyProfit <= -dailyStartBalance * PORTFOLIO.MAX_DAILY_LOSS_PCT || weeklyProfit <= -weeklyStartBalance * PORTFOLIO.MAX_WEEKLY_LOSS_PCT;

        if (tradingBlocked) {
            logger.info("[Trading] Account entry limit reached");
            return [];
        }

        const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();

        const fridayEntryClosed = now.getUTCDay() === 5 && now.getUTCHours() >= RISK.FRIDAY_LAST_ENTRY_HOUR_UTC;

        if (fridayEntryClosed) {
            return [];
        }
        return candidates.filter(() => currentMinute < RISK.DAILY_LAST_ENTRY_MINUTE_UTC);
    }

    rateCandidate(candidate) {
        const { symbol, signal, candles, indicators } = candidate;
        const rows = candles?.h1;
        const current = rows?.at(-1);
        const previous = rows?.at(-2);
        const atr = Number(indicators?.h1?.atr);
        const ema20 = Number(indicators?.h1?.ema20);
        const ema50 = Number(indicators?.h1?.ema50);
        const ema20Previous3 = Number(indicators?.h1?.ema20Previous3);
        const direction = signal === "bullish" ? 1 : signal === "bearish" ? -1 : 0;

        if (
            !Array.isArray(rows) ||
            rows.length < 7 ||
            !current ||
            !previous ||
            !(atr > 0) ||
            !direction ||
            ![ema20, ema50, ema20Previous3].every(Number.isFinite)
        )
            return null;

        const open = Number(current.open);
        const high = Number(current.high);
        const low = Number(current.low);
        const close = Number(current.close);
        const previousOpen = Number(previous.open);
        const previousClose = Number(previous.close);
        const spread = Number(current.spread);
        const orderBuffer = this.getPipValue(symbol) * this.#orderBufferPips;
        const entry = direction > 0 ? high + orderBuffer : low - orderBuffer;
        const range = high - low;

        if (![open, high, low, close, previousOpen, previousClose, spread, entry].every(Number.isFinite) || range <= 0 || spread < 0) return null;

        let path = 0;
        for (let index = rows.length - 6; index < rows.length; index += 1) {
            path += Math.abs(Number(rows[index].close) - Number(rows[index - 1].close));
        }

        const features = {
            strength: Math.abs(close - open) / atr,
            risk: (range + 2 * orderBuffer) / atr,
            spread: spread / atr,
            entryGap: (direction > 0 ? entry - (close + spread) : close - entry) / atr,
            trend: (direction * (ema20 - ema50)) / atr,
            priceEma: (direction * (close - ema20)) / atr,
            emaSlope: (direction * (ema20 - ema20Previous3)) / atr,
            efficiency: path > 0 ? Math.abs(close - Number(rows.at(-7).close)) / path : 0,
            rejectionWick: direction > 0 ? (Math.min(open, close) - low) / range : (high - Math.max(open, close)) / range,
            previousBody: Math.abs(previousClose - previousOpen) / atr,
        };

        return Object.entries(this.#signalRatingWeights).reduce((rating, [feature, weight]) => rating + features[feature] * weight, 0);
    }

    // Order execution and sizing
    async executeCandidate(candidate) {
        const { symbol, signal, candles } = candidate;
        const direction = signal === "bullish" ? "BUY" : signal === "bearish" ? "SELL" : null;
        const current = candles?.h1?.at(-1);
        if (!direction || !current) {
            logger.error(`[Trading] ${symbol}: invalid signal or execution context`);
            return false;
        }

        const market = await getMarketDetails(symbol);
        const bid = Number(market?.snapshot?.bid);
        const ask = Number(market?.snapshot?.offer ?? market?.snapshot?.ask);
        const orderBuffer = this.getPipValue(symbol) * this.#orderBufferPips;
        const entryPrice = direction === "BUY" ? Number(current.high) + orderBuffer : Number(current.low) - orderBuffer;
        const stopLoss = direction === "BUY" ? Number(current.low) - orderBuffer : Number(current.high) + orderBuffer;
        const riskDistance = direction === "BUY" ? entryPrice - stopLoss : stopLoss - entryPrice;
        const entryIsPending = direction === "BUY" ? entryPrice > ask : entryPrice < bid;
        if (![bid, ask, entryPrice, stopLoss, riskDistance].every(Number.isFinite) || ask < bid || riskDistance <= 0 || !entryIsPending) {
            logger.warn(`[Trading] ${symbol}: pending entry is invalid or already crossed`);
            return false;
        }

        const sizing = await this.positionSize(this.accountBalance, entryPrice, stopLoss, symbol, RISK.PER_TRADE);
        if (!sizing.size) return false;

        const takeProfit = direction === "BUY" ? entryPrice + riskDistance * this.#targetR : entryPrice - riskDistance * this.#targetR;
        const goodTillDate = new Date(Date.now() + this.#orderExpiryMinutes * 60_000).toISOString().slice(0, 19);

        try {
            const result = await placeOrder({
                symbol,
                direction,
                size: sizing.size,
                level: entryPrice,
                stopLevel: stopLoss,
                profitLevel: takeProfit,
                goodTillDate,
            });
            if (!result?.dealReference) {
                logger.warn(`[Trading] ${symbol}: STOP order was not created`);
                return false;
            }

            const confirmation = await getDealConfirmation(result.dealReference);
            const status = confirmation.dealStatus ?? confirmation.status;
            if (!["ACCEPTED", "OPEN"].includes(status)) {
                logger.warn(`[Trading] ${symbol}: STOP order rejected: ${confirmation.reason}`);
                return false;
            }

            this.availableMargin = Math.max(0, sizing.availableMargin - sizing.marginRequired);
            logger.info(`[Trading] ${symbol} ${direction} STOP order accepted`);
            return true;
        } catch (error) {
            logger.error(`[Trading] ${symbol}: STOP order failed: ${error.message}`);
            return false;
        }
    }

    async positionSize(balance, entryPrice, stopLossPrice, symbol, riskPct = RISK.PER_TRADE) {
        const safeRiskPct = Math.min(Number(riskPct), RISK.PER_TRADE);

        if (!Number.isFinite(safeRiskPct) || safeRiskPct <= 0) {
            return this.emptyPositionSizing(symbol, "invalid_risk");
        }
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

        const requestedRiskAmount = accountBalance * safeRiskPct;
        const rawSize = (requestedRiskAmount * quotePerEur) / riskDistance;
        const leverage = await this.leverageForSymbol(symbol);

        if (!leverage) {
            return this.emptyPositionSizing(symbol, "missing_leverage");
        }

        const notionalEurForSize = (value) => (value * entry) / quotePerEur;
        const marginForSize = (value) => notionalEurForSize(value) / leverage;

        const brokerAvailableMargin = this.toNumber(this.availableMargin);
        const availableMargin = Number.isFinite(brokerAvailableMargin) && brokerAvailableMargin > 0 ? brokerAvailableMargin : accountBalance;
        const maxMarginPerTrade = Math.min(availableMargin, accountBalance / PORTFOLIO.MAX_POSITIONS) * PORTFOLIO.MARGIN_USAGE;

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
            requestedRiskPct: safeRiskPct,
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
            marginCapHit,
        };

        logger.debug(
            `[PositionSize] ${symbol}: targetRisk=${(safeRiskPct * 100).toFixed(2)}% effectiveRisk=${(effectiveRiskPct * 100).toFixed(3)}% raw=${rawSize.toFixed(2)} final=${size} margin=${marginRequired.toFixed(2)}/${maxMarginPerTrade.toFixed(2)}`,
        );
        return positionSizing;
    }

    emptyPositionSizing(symbol, reason) {
        return {
            symbol,
            size: 0,
            reason,
            requestedRiskPct: RISK.PER_TRADE,
            requestedRiskAmount: 0,
            effectiveRiskPct: 0,
            effectiveRiskAmount: 0,
            marginCapHit: false,
        };
    }

    // Market data and currency conversion
    async leverageForSymbol(symbol) {
        try {
            const details = await getMarketDetails(symbol);
            const marginFactor = Number(details?.instrument?.marginFactor);

            if (details?.instrument?.marginFactorUnit !== "PERCENTAGE" || !Number.isFinite(marginFactor) || marginFactor <= 0) {
                return null;
            }

            return 100 / marginFactor;
        } catch (error) {
            logger.warn(`[PositionSize] Cannot get leverage for ${symbol}: ${error.message}`);
            return null;
        }
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

    async getMarketMid(symbol) {
        const details = await getMarketDetails(symbol);
        const mid = this.marketMid(details);
        return Number.isFinite(mid) && mid > 0 ? mid : null;
    }

    marketMid(details) {
        const bid = this.firstNumber(details?.snapshot?.bid, details?.bid);
        const ask = this.firstNumber(details?.snapshot?.offer, details?.snapshot?.ask, details?.offer, details?.ask);
        if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) return (bid + ask) / 2;
        return this.firstNumber(details?.snapshot?.mid, details?.mid, bid, ask);
    }

    parseSymbol(symbol) {
        const normalized = String(symbol || "").toUpperCase();
        return {
            base: normalized.slice(0, 3),
            quote: normalized.slice(3, 6),
        };
    }

    getPipValue(symbol) {
        return symbol.includes("JPY") ? 0.01 : 0.0001;
    }

    isSymbolTraded(symbol) {
        return this.openTrades.includes(symbol);
    }

    // Position management
    async updateDynamicStopIfNeeded(position) {
        const { symbol, dealId, direction, entryPrice, stopLoss, takeProfit, openedAt, currentPrice, trailingStop } = position;
        const normalizedDirection = this.normalizeDirection(direction);
        const entry = Number(entryPrice);
        const stop = Number(stopLoss);
        const target = Number(takeProfit);
        const price = Number(currentPrice);

        if (!symbol || !dealId || trailingStop || !["BUY", "SELL"].includes(normalizedDirection) || ![entry, stop, target, price].every(Number.isFinite))
            return;

        let plan = this.dynamicPlanByDeal.get(dealId);

        if (!plan) {
            const riskDistance = Math.abs(target - entry) / this.#targetR;
            const initialStopDistance = Math.abs(entry - stop);

            if (!(riskDistance > 0) || Math.abs(initialStopDistance / riskDistance - 1) > 0.15) return;
            let stepTimeframe = "M5";

            try {
                stepTimeframe = await this.getDynamicStepTimeframe(symbol, normalizedDirection, openedAt);
            } catch (error) {
                logger.warn(`[DynamicStop] ${symbol}: cannot restore entry regime, using M5: ${error.message}`);
            }

            plan = { riskDistance, stepTimeframe };
            this.dynamicPlanByDeal.set(dealId, plan);
        }

        const { riskDistance, stepTimeframe } = plan;
        const favorableMove = normalizedDirection === "BUY" ? price - entry : entry - price;
        if (favorableMove < riskDistance * RISK.DYNAMIC_BREAK_EVEN_R) return;

        let stepCandle;
        let stepAtr;

        try {
            const now = Date.now();
            const closed = (prices, minutes) => (prices || []).filter(({ timestamp }) => Date.parse(timestamp) + minutes * 60_000 <= now);
            const minutes = stepTimeframe === "M15" ? 15 : 5;
            const rows = closed((await getHistorical(symbol, TIMEFRAMES[stepTimeframe], 60)).prices, minutes);
            const indicators = await calcIndicators(rows);

            stepCandle = rows.at(-1);
            stepAtr = indicators.atr;
        } catch (error) {
            logger.warn(`[DynamicStop] ${symbol}: candle step unavailable, applying break-even only: ${error.message}`);
        }

        const nextStop = this.calculateDynamicStop({
            direction: normalizedDirection,
            entryPrice: entry,
            currentStop: stop,
            currentPrice: price,
            riskDistance,
            candle: stepCandle,
            atr: stepAtr,
        });

        if (!Number.isFinite(nextStop)) return;

        const decimals = symbol.includes("JPY") ? 3 : 5;
        const roundedStop = Number(nextStop.toFixed(decimals));
        const improvesAfterRounding = normalizedDirection === "BUY" ? roundedStop > stop : roundedStop < stop;
        if (!improvesAfterRounding) return;

        const update = await updatePositionProtection(dealId, roundedStop, target);
        if (update?.dealReference) {
            const confirmation = await getDealConfirmation(update.dealReference);
            const status = confirmation.dealStatus ?? confirmation.status;
            if (!["ACCEPTED", "OPEN"].includes(status)) {
                throw new Error(`protection update rejected: ${confirmation.reason ?? status}`);
            }
        }
        logger.info(`[DynamicStop] ${symbol}: ${stepTimeframe} stop ${stop} -> ${roundedStop} at ${(favorableMove / riskDistance).toFixed(2)}R`);
    }

    async getDynamicStepTimeframe(symbol, direction, openedAt) {
        const decisionTime = Math.floor(Number(openedAt) / 3_600_000) * 3_600_000;
        if (!Number.isFinite(decisionTime)) return "M5";

        const h1 = (await getHistorical(symbol, TIMEFRAMES.H1, 100)).prices.filter(({ timestamp }) => Date.parse(timestamp) + 3_600_000 <= decisionTime);
        const indicators = await calcIndicators(h1);
        const atr = Number(indicators.atr);
        let path = 0;

        for (let index = h1.length - 6; index < h1.length; index += 1) {
            path += Math.abs(Number(h1[index]?.close) - Number(h1[index - 1]?.close));
        }

        const directionSign = this.normalizeDirection(direction) === "BUY" ? 1 : -1;
        const trendScore = atr > 0 ? (directionSign * (Number(indicators.ema20) - Number(indicators.ema50))) / atr : 0;
        const efficiency = path > 0 && h1.length >= 7 ? Math.abs(Number(h1.at(-1).close) - Number(h1.at(-7).close)) / path : 0;

        return trendScore >= RISK.DYNAMIC_TREND_SCORE && efficiency >= RISK.DYNAMIC_TREND_EFFICIENCY ? "M15" : "M5";
    }

    calculateDynamicStop({ direction, entryPrice, currentStop, currentPrice, riskDistance, candle, atr }) {
        const entry = Number(entryPrice);
        const stop = Number(currentStop);
        const price = Number(currentPrice);
        const risk = Number(riskDistance);
        const candleAtr = Number(atr);
        const normalizedDirection = this.normalizeDirection(direction);

        if (!["BUY", "SELL"].includes(normalizedDirection) || ![entry, stop, price, risk].every(Number.isFinite) || !(risk > 0)) return null;

        const favorableMove = normalizedDirection === "BUY" ? price - entry : entry - price;
        if (favorableMove < risk * RISK.DYNAMIC_BREAK_EVEN_R) return null;

        let candidate = entry;
        const candleExtreme = normalizedDirection === "BUY" ? Number(candle?.low) : Number(candle?.high);

        if (Number.isFinite(candleExtreme) && candleAtr > 0) {
            const candleStop =
                normalizedDirection === "BUY"
                    ? candleExtreme - candleAtr * RISK.DYNAMIC_STEP_BUFFER_ATR
                    : candleExtreme + candleAtr * RISK.DYNAMIC_STEP_BUFFER_ATR;
            candidate = normalizedDirection === "BUY" ? Math.max(candidate, candleStop) : Math.min(candidate, candleStop);
        }

        const improves = normalizedDirection === "BUY" ? candidate > stop : candidate < stop;
        const remainsBehindMarket = normalizedDirection === "BUY" ? candidate < price : candidate > price;

        return improves && remainsBehindMarket ? candidate : null;
    }

    async closePosition(dealId, label) {
        const requestedReason = label || "manual_close";
        let symbol;
        let priceHint;
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
        } catch (logErr) {
            logger.error(`[ClosePos] Failed to process closure for ${dealId}:`, logErr);
        }
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

    // Value normalization
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

        if (dir === "BUY" && Number.isFinite(bid)) return bid;
        if (dir === "SELL" && Number.isFinite(ask)) return ask;
        if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;

        return bid ?? ask ?? null;
    }
}

export default new TradingService();
