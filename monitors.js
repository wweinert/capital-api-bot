import { getOpenPositions, getWorkingOrders, cancelWorkingOrder } from "./api.js";
import { RISK } from "./config.js";

import tradingService from "./services/trading.js";
import webSocketService from "./services/websocket.js";

import logger from "./utils/logger.js";

export async function startMonitorOpenTrades(bot, intervalMs = 20 * 1000) {
    logger.info(`[Monitoring] Checking open trades at ${new Date().toISOString()}`);
    if (bot.monitorInterval) clearInterval(bot.monitorInterval);
    if (!bot.dealIdMonitorInterval) logDeals(bot);

    bot.monitorInterval = setInterval(async () => {
        if (bot.monitorInProgress) {
            logger.warn("[Monitoring] Previous monitor tick still running; skipping.");
            return;
        }

        bot.monitorInProgress = true;
        try {
            await trailingStopCheck(bot);
            await bot.delay(3000);
            await weekendFlatCheck(bot);
            await bot.delay(3000);
            await dailyFlatCheck(bot);
            await bot.delay(3000);
            await maxHoldCheck(bot);
            await bot.delay(3000);
        } finally {
            bot.monitorInProgress = false;
        }
    }, intervalMs);
}

export async function trailingStopCheck() {
    try {
        logger.info(`[Monitoring] Trailing stop check at ${new Date().toISOString()}`);

        const positions = await getOpenPositions();

        if (!positions?.positions?.length) {
            return;
        }

        for (const item of positions.positions) {
            const position = item.position;
            const market = item.market;
            const symbol = market?.epic ?? position?.epic;
            const profile = tradingService.getPositionProfile(item, symbol);

            await tradingService.updateTrailingStopIfNeeded({
                symbol,
                profile,
                dealId: position.dealId,
                direction: position.direction,
                entryPrice: position.level,
                stopLoss: position.stopLevel,
                takeProfit: position.profitLevel,
                currentPrice: tradingService.resolveMarketPrice(position.direction, market.bid, market.offer ?? market.ask),
                trailingStop: position.trailingStop,
            });
        }
    } catch (error) {
        logger.error("[Monitoring] Trailing stop error:", error);
    }
}

async function cancelOrders(shouldCancel) {
    const result = await getWorkingOrders();
    const orders = result?.workingOrders || [];

    for (const item of orders) {
        const order = item?.workingOrderData;

        if (!order?.dealId || !shouldCancel(order)) {
            continue;
        }

        await cancelWorkingOrder(order.dealId);
        logger.info(`[Orders] Cancelled ${order.epic}`);
    }
}

const getCloseMinute = (profile) => Math.min(profile?.exit?.dailyCloseMinute ?? RISK.DAILY_CLOSE_MINUTE_UTC, RISK.DAILY_CLOSE_MINUTE_UTC);

export async function dailyFlatCheck(bot) {
    if (!RISK.DAILY_FORCED_CLOSE_UTC) return;

    const now = new Date();
    const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();

    try {
        await cancelOrders((order) => {
            const closeMinute = getCloseMinute(tradingService.getPositionProfile({ position: order }, order.epic));

            return closeMinute < 24 * 60 && currentMinute >= closeMinute;
        });
        const positions = await getOpenPositions();
        if (!positions?.positions?.length) return;

        for (const pos of positions.positions) {
            const dealId = pos?.position?.dealId ?? pos?.dealId;
            const symbol = pos?.market?.epic ?? pos?.position?.epic ?? "unknown";
            const closeMinute = getCloseMinute(tradingService.getPositionProfile(pos, symbol));

            if (closeMinute >= 24 * 60 || currentMinute < closeMinute) {
                continue;
            }

            if (!dealId) {
                logger.error(`[DailyFlat] Missing dealId for ${symbol}, cannot close.`);
                continue;
            }

            await tradingService.closePosition(dealId, "daily_forced_close_utc");
            logger.info(`[DailyFlat] Closed ${symbol} before UTC day rollover at/after minute `);
            await bot.delay(500);
        }
    } catch (error) {
        logger.error("[DailyFlat] Error closing positions before UTC day rollover:", error);
    }
}

export async function weekendFlatCheck(bot) {
    if (!RISK.WEEKEND_FLAT) return;

    const now = new Date();
    const closeHour = Number.isFinite(Number(RISK.FRIDAY_CLOSE_HOUR_UTC)) ? Number(RISK.FRIDAY_CLOSE_HOUR_UTC) : 20;
    if (now.getUTCDay() !== 5 || now.getUTCHours() < closeHour) return;

    try {
        await cancelOrders(() => true);
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

export async function maxHoldCheck(bot) {
    try {
        const positions = await getOpenPositions();
        if (!positions?.positions?.length) return;

        const nowMs = Date.now();

        for (const pos of positions.positions) {
            const openRaw = pos?.position?.openTime ?? pos?.position?.createdDateUTC ?? pos?.position?.createdDate ?? pos?.openTime;

            logger.debug(`[Bot] Position ${pos?.market?.epic} - Open Time raw: ${openRaw}`);

            const openMs = parseOpenTimeMs(openRaw);

            if (Number.isNaN(openMs)) {
                logger.error(`[Bot] Could not parse open time for ${pos?.market?.epic}: ${openRaw}`);
                continue;
            }

            const heldMs = Math.max(0, nowMs - openMs);
            const minutesHeld = heldMs / 60000;

            const dealId = pos?.position?.dealId ?? pos?.dealId;
            const symbol = pos?.market?.epic ?? pos?.position?.epic ?? "unknown";
            const maxHoldMinutes = resolveMaxHoldMinutes(pos, symbol);

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

function resolveMaxHoldMinutes(pos, symbol) {
    return tradingService.getPositionProfile(pos, symbol)?.exit?.maxHoldMinutes ?? RISK.MAX_HOLD_TIME;
}

export function logDeals(bot) {
    if (bot.dealIdMonitorInterval) {
        logger.warn("[DealID Monitor] Already running; skipping start.");
        return;
    }
    logger.info(`[DealID Monitor] Starting (every ${bot.checkInterval}ms)`);

    const run = async () => {
        if (bot.dealIdMonitorInProgress) {
            logger.warn("[DealID Monitor] Previous tick still running; skipping.");
            return;
        }
        bot.dealIdMonitorInProgress = true;
        logger.info(`[DealID Monitor] tick ${new Date().toISOString()}`);

        try {
            const res = await getOpenPositions();
            const positions = Array.isArray(res?.positions) ? res.positions : [];

            const brokerDealIds = positions.map((position) => position?.position?.dealId ?? position?.dealId).filter(Boolean);

            for (const dealId of brokerDealIds) {
                if (!bot.openedBrockerDealIds.includes(dealId)) {
                    bot.openedBrockerDealIds.push(dealId);
                }
            }

            const closedDealIds = bot.openedBrockerDealIds.filter((id) => !brokerDealIds.includes(id));

            bot.openedBrockerDealIds = bot.openedBrockerDealIds.filter((id) => brokerDealIds.includes(id));

            if (closedDealIds.length) {
                logger.info(`[DealID Monitor] Closed deals: ${closedDealIds.join(", ")}`);
            }
            return [];
        } catch (error) {
            logger.error("[DealID Monitor] Error:", error);
            return [];
        } finally {
            bot.dealIdMonitorInProgress = false;
        }
    };

    run();
    bot.dealIdMonitorInterval = setInterval(run, bot.checkInterval);
}

function parseOpenTimeMs(openTime) {
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

export async function startWebSocket(bot) {
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
