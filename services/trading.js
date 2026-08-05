import {
    placePosition,
    placeOrder,
    enableTrailingStop,
    getDealConfirmation,
    closePosition as apiClosePosition,
    getOpenPositions,
    getWorkingOrders,
    getMarketDetails,
    getAccountActivity,
    getAccountTransactions,
} from "../api.js";
import { RISK, PORTFOLIO, PROFILES } from "../config.js";
import logger from "../utils/logger.js";

const { PER_TRADE } = RISK;

class TradingService {
    constructor() {
        this.openTrades = [];
        this.accountBalance = 0;
        this.availableMargin = 0;

        this.quotePerEurCache = new Map();
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

        if (dir === "BUY" && Number.isFinite(bid)) return bid;
        if (dir === "SELL" && Number.isFinite(ask)) return ask;
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

    async syncOpenTradesFromBroker() {
        const [positionsResult, ordersResult] = await Promise.all([getOpenPositions(), getWorkingOrders()]);

        const positions = positionsResult?.positions || [];

        const orders = ordersResult?.workingOrders || [];

        const positionSymbols = positions.map((item) => item?.market?.epic || item?.position?.epic);

        const orderSymbols = orders.map((item) => item?.workingOrderData?.epic);

        this.openTrades = [...new Set([...positionSymbols, ...orderSymbols].filter(Boolean))];
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

    async getAllowedCandidates(candidates) {
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

        const [activities, weeklyTransactions] = await Promise.all([
            getAccountActivity(formatDate(dayStart), formatDate(now)),
            getAccountTransactions(formatDate(weekStart), formatDate(now)),
        ]);

        const todayEntries = [
            ...new Map(
                activities
                    .filter((activity) => activity.type === "POSITION" && activity.status === "ACCEPTED" && activity.source === "USER")
                    .map((activity) => [activity.dealId, activity]),
            ).values(),
        ];

        const todayTransactions = weeklyTransactions.filter((transaction) => getTime(transaction.dateUtc || transaction.dateUTC) >= dayStart.getTime());

        const getProfit = (transactions) => transactions.reduce((total, transaction) => total + Number(transaction.size || 0), 0);

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
        return candidates.filter((candidate) => {
            const risk = candidate.profile.risk;

            const symbolEntries = todayEntries.filter((entry) => entry.epic === candidate.symbol);

            const lastEntryTime = Math.max(0, ...symbolEntries.map((entry) => getTime(entry.dateUTC)));

            const cooldownPassed = !lastEntryTime || now.getTime() - lastEntryTime >= risk.cooldownMinutes * 60_000;

            const lastEntryMinute = Math.min(risk.lastEntryMinute, RISK.DAILY_LAST_ENTRY_MINUTE_UTC);

            return currentMinute < lastEntryMinute && symbolEntries.length < risk.maxDailyTrades && cooldownPassed;
        });
    }

    async processCandidates(candidates = []) {
        await this.syncOpenTradesFromBroker();

        const freePositions = PORTFOLIO.MAX_POSITIONS - this.openTrades.length;

        if (freePositions <= 0) {
            logger.info("[Trading] No free positions");
            return [];
        }
        const allowedCandidates = await this.getAllowedCandidates(candidates);

        const selected = allowedCandidates.filter((candidate) => !this.isSymbolTraded(candidate.symbol)).slice(0, freePositions);

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

    async positionSize(balance, entryPrice, stopLossPrice, symbol, riskPct = PER_TRADE) {
        const safeRiskPct = Math.min(Number(riskPct), 0.03);

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

    // ============================================================
    //                    Place the Trade
    // ============================================================
    async executeCandidate(candidate) {
        const { symbol, signal, entryType, entryPrice, stopLoss, profile } = candidate;

        const riskDistance = Math.abs(entryPrice - stopLoss);

        const takeProfit = signal === "BUY" ? entryPrice + riskDistance * profile.exit.targetR : entryPrice - riskDistance * profile.exit.targetR;
        const sizing = await this.positionSize(this.accountBalance, entryPrice, stopLoss, symbol, profile.risk.perTrade);

        if (!sizing.size) {
            return false;
        }

        let result;

        if (entryType === "stop" || entryType === "limit") {
            const timeframeMinutes = {
                M5: 5,
                M15: 15,
                H1: 60,
            };

            const expiryMinutes = timeframeMinutes[profile.signal.timeframe] * profile.entry.expiryBars;

            const goodTillDate = new Date(Date.now() + expiryMinutes * 60_000).toISOString().slice(0, 19);

            result = await placeOrder({
                symbol,
                type: entryType.toUpperCase(),
                direction: signal,
                size: sizing.size,
                level: entryPrice,
                stopLevel: stopLoss,
                profitLevel: takeProfit,
                goodTillDate,
            });
        } else {
            result = await placePosition(symbol, signal, sizing.size, entryPrice, stopLoss, takeProfit);
        }

        if (!result?.dealReference) {
            logger.warn(`[Trading] ${symbol}: order was not created`);

            return false;
        }

        const confirmation = await getDealConfirmation(result.dealReference);

        if (!["ACCEPTED", "OPEN"].includes(confirmation.dealStatus)) {
            logger.warn(`[Trading] ${symbol}: ${confirmation.reason}`);

            return false;
        }

        this.availableMargin = Math.max(0, sizing.availableMargin - sizing.marginRequired);

        logger.info(`[Trading] ${symbol} ${signal} ${entryType} accepted`);

        return true;
    }
    // ============================================================
    //               Trailing Stop (Improved)
    // ============================================================
    async updateTrailingStopIfNeeded(position) {
        const { symbol, dealId, direction, entryPrice, takeProfit, currentPrice, trailingStop } = position;

        if (trailingStop) return;

        const profile = PROFILES[symbol];
        const entry = Number(entryPrice);
        const target = Number(takeProfit);
        const price = Number(currentPrice);
        const targetR = Number(profile?.exit?.targetR);
        const activationR = Number(profile?.exit?.trailActivationR);
        const configuredDistanceR = Number(profile?.exit?.trailDistanceR);

        if (!profile || !dealId || ![entry, target, price, targetR, activationR, configuredDistanceR].every(Number.isFinite)) {
            return;
        }

        const riskDistance = Math.abs(target - entry) / targetR;

        const isBuy = direction === "BUY";
        const favorableMove = isBuy ? price - entry : entry - price;

        if (favorableMove < riskDistance * activationR) {
            return;
        }

        // Не позволяет брокерскому trailing начать ниже безубытка.
        const distanceR = Math.min(configuredDistanceR, activationR);
        const stopDistance = this.roundPrice(riskDistance * distanceR, symbol);

        await enableTrailingStop(dealId, stopDistance, target);

        logger.info(`[Trail] ${symbol}: broker trailing enabled, distance=${stopDistance}`);
    }
    // ============================================================
    //                     Close Position
    // ============================================================
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
}

export default new TradingService();
