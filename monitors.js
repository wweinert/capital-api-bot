import { getOpenPositions, getWorkingOrders, cancelWorkingOrder } from "./api.js";
import { RISK } from "./config.js";

import tradingService from "./services/trading.js";
import webSocketService from "./services/websocket.js";

import logger from "./utils/logger.js";

class TradeMonitor {
    monitorInterval = null;
    monitorInProgress = false;

    async startMonitorOpenTrades(bot, intervalMs = 20 * 1000) {
        logger.info(`[Monitoring] Checking open trades at ${new Date().toISOString()}`);
        if (this.monitorInterval) clearInterval(this.monitorInterval);

        this.monitorInterval = setInterval(async () => {
            if (this.monitorInProgress) {
                logger.warn("[Monitoring] Previous monitor tick still running; skipping.");
                return;
            }

            this.monitorInProgress = true;

            try {
                await this.dynamicStopCheck();
                await this.weekendFlatCheck(bot);
                await this.dailyFlatCheck(bot);
                await this.maxHoldCheck();
            } catch (error) {
                logger.error(`[Monitoring] Monitor cycle failed: ${error.message}`);
            } finally {
                this.monitorInProgress = false;
            }
        }, intervalMs);
    }

    async dynamicStopCheck() {
        try {
            const positions = await getOpenPositions();

            for (const item of positions?.positions || []) {
                const position = item.position;
                const market = item.market;

                await tradingService.updateDynamicStopIfNeeded({
                    symbol: market?.epic ?? position?.epic,
                    dealId: position?.dealId,
                    direction: position?.direction,
                    entryPrice: position?.level,
                    stopLoss: position?.stopLevel,
                    takeProfit: position?.profitLevel,
                    openedAt: this.parseOpenTimeMs(position?.openTime ?? position?.createdDateUTC ?? position?.createdDate),
                    currentPrice: tradingService.resolveMarketPrice(position?.direction, market?.bid, market?.offer ?? market?.ask),
                    trailingStop: position?.trailingStop,
                });
            }
        } catch (error) {
            logger.error(`[Monitoring] Dynamic stop error: ${error.message}`);
        }
    }

    async cancelOrders(shouldCancel) {
        const result = await getWorkingOrders();
        const orders = result?.workingOrders || [];

        for (const item of orders) {
            const order = item?.workingOrderData;
            if (!order?.dealId || !(await shouldCancel(order))) {
                continue;
            }
            await cancelWorkingOrder(order.dealId);
            logger.info(`[Orders] Cancelled ${order.epic}`);
        }
    }

    async dailyFlatCheck(bot) {
        if (!RISK.DAILY_FORCED_CLOSE_UTC) return;

        const now = new Date();
        const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
        const closeMinute = RISK.DAILY_CLOSE_MINUTE_UTC;
        if (closeMinute >= 24 * 60 || currentMinute < closeMinute) return;

        try {
            await this.cancelOrders(() => closeMinute < 24 * 60 && currentMinute >= closeMinute);
            const positions = await getOpenPositions();
            if (!positions?.positions?.length) return;

            for (const pos of positions.positions) {
                const dealId = pos?.position?.dealId ?? pos?.dealId;
                const symbol = pos?.market?.epic ?? pos?.position?.epic ?? "unknown";
                if (!dealId) {
                    logger.error(`[DailyFlat] Missing dealId for ${symbol}, cannot close.`);
                    continue;
                }

                await tradingService.closePosition(dealId, "daily_forced_close_utc");
                logger.info(`[DailyFlat] Closed ${symbol} before UTC day rollover at/after minute ${closeMinute}`);
                await bot.delay(500);
            }
        } catch (error) {
            logger.error("[DailyFlat] Error closing positions before UTC day rollover:", error);
        }
    }

    async weekendFlatCheck(bot) {
        if (!RISK.WEEKEND_FLAT) return;

        const now = new Date();
        const closeHour = Number.isFinite(Number(RISK.FRIDAY_CLOSE_HOUR_UTC)) ? Number(RISK.FRIDAY_CLOSE_HOUR_UTC) : 20;
        if (now.getUTCDay() !== 5 || now.getUTCHours() < closeHour) return;

        try {
            await this.cancelOrders(() => true);
            const positions = await getOpenPositions();
            if (!positions?.positions?.length) return;

            for (const pos of positions.positions) {
                const dealId = pos?.position?.dealId ?? pos?.dealId;
                const symbol = pos?.market?.epic ?? pos?.position?.epic ?? "unknown";
                if (!dealId) {
                    logger.error(`[WeekendFlat] Missing dealId for ${symbol}, cannot close.`);
                    continue;
                }

                await tradingService.closePosition(dealId, "weekend_flat");
                logger.info(`[WeekendFlat] Closed ${symbol} before weekend at/after Friday ${closeHour}:00 UTC`);
                await bot.delay(500);
            }
        } catch (error) {
            logger.error("[WeekendFlat] Error closing positions before weekend:", error);
        }
    }

    async maxHoldCheck() {
        try {
            const positions = await getOpenPositions();
            if (!positions?.positions?.length) return;

            const nowMs = Date.now();

            for (const pos of positions.positions) {
                const openRaw = pos?.position?.openTime ?? pos?.position?.createdDateUTC ?? pos?.position?.createdDate ?? pos?.openTime;

                logger.debug(`[Bot] Position ${pos?.market?.epic} - Open Time raw: ${openRaw}`);

                const openMs = this.parseOpenTimeMs(openRaw);

                if (Number.isNaN(openMs)) {
                    logger.error(`[Bot] Could not parse open time for ${pos?.market?.epic}: ${openRaw}`);
                    continue;
                }

                const heldMs = Math.max(0, nowMs - openMs);
                const minutesHeld = heldMs / 60000;

                const dealId = pos?.position?.dealId ?? pos?.dealId;
                const symbol = pos?.market?.epic ?? pos?.position?.epic ?? "unknown";
                const maxHoldMinutes = RISK.MAX_HOLD_TIME;

                logger.debug(`[Bot] Position ${pos?.market?.epic} held for ${minutesHeld.toFixed(2)} minutes of max ${maxHoldMinutes}`);

                if (minutesHeld >= maxHoldMinutes) {
                    if (!dealId) {
                        logger.error(`[Bot] Missing dealId for ${pos?.market?.epic}, cannot close.`);
                        continue;
                    }
                    await tradingService.closePosition(dealId, "timeout");
                    logger.info(`[Bot] Closed position ${pos?.market?.epic} after ${minutesHeld.toFixed(1)} minutes (max hold: ${maxHoldMinutes})`);
                }
            }
        } catch (error) {
            logger.error("[Bot] Error in max hold monitor:", error);
        }
    }

    parseOpenTimeMs(openTime) {
        if (!openTime && openTime !== 0) return NaN;

        if (typeof openTime === "number") {
            return openTime < 1e12 ? openTime * 1000 : openTime;
        }

        if (typeof openTime === "string") {
            let s = openTime.trim();

            if (/^\d{4}[-/]\d{2}[-/]\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
                s = s.replace(" ", "T").replace(/\//g, "-");
            }

            if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) {
                s += "Z";
            }

            const t = Date.parse(s);
            return Number.isNaN(t) ? NaN : t;
        }

        return NaN;
    }

    async startWebSocket(bot) {
        try {
            const activeSymbols = await bot.getActiveSymbols();
            // Initialize price tracker for all active symbols
            bot.latestPrices = {};
            activeSymbols.forEach((symbol) => {
                bot.latestPrices[symbol] = { analyzeSymbol: null, ask: null, ts: null };
            });

            webSocketService.connect(bot.tokens, activeSymbols, (data) => {
                const msg = JSON.parse(data.toString());
                const { payload } = msg;
                const epic = payload?.epic;
                if (!epic) return;

                bot.latestCandles[epic] = { latest: payload };

                // Update bid or ask based on priceType
                if (!bot.latestPrices[epic]) {
                    bot.latestPrices[epic] = { bid: null, ask: null, ts: null };
                }

                if (payload.priceType === "bid") {
                    bot.latestPrices[epic].bid = payload.c;
                } else if (payload.priceType === "ask") {
                    bot.latestPrices[epic].ask = payload.c;
                }

                bot.latestPrices[epic].ts = Date.now();
                // Only log when we have both bid and ask
                if (bot.latestPrices[epic].bid !== null && bot.latestPrices[epic].ask !== null) {
                    logger.debug(`[WebSocket] ${epic} - bid: ${bot.latestPrices[epic].bid}, ask: ${bot.latestPrices[epic].ask}`);
                }
            });
        } catch (error) {
            logger.error("[bot.js] WebSocket message processing error:", error.message);
        }
    }
}

export default new TradeMonitor();
