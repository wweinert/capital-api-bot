import { getOpenPositions, getHistorical } from "../api.js";
import { RISK } from "../config.js";
import { calcIndicators } from "../indicators/indicators.js";
import tradingService from "../services/trading.js";
import webSocketService from "../services/websocket.js";
import { tradeWatchIndicators } from "../indicators/indicators.js";

import { getTradeEntry, tradeTracker } from "../utils/tradeLogger.js";
import logger from "../utils/logger.js";
import { priceLogger } from "../utils/priceLogger.js";

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

export async function trailingStopCheck(bot) {
    try {
        logger.info(`[Monitoring] Trailing stop check at ${new Date().toISOString()}`);
        const positions = await getOpenPositions();
        if (!positions?.positions?.length) return;
        for (const pos of positions.positions) {
            const symbol = pos.market ? pos.market.epic : pos.position.epic;

            let indicators;
            try {
                const h1Data = await getHistorical(symbol, "HOUR", 50);
                await bot.delay(400);
                const m15Data = await getHistorical(symbol, "MINUTE_15", 50);
                await bot.delay(400);
                const m5Data = await getHistorical(symbol, "MINUTE_5", 50);
                if (!h1Data?.prices || !m15Data?.prices || !m5Data?.prices) {
                    logger.warn(`[Monitoring] Missing candles for ${symbol}, skipping trailing stop update.`);
                    continue;
                }
                indicators = {
                    h1: await calcIndicators(h1Data.prices),
                    m15: await calcIndicators(m15Data.prices),
                    m5: await calcIndicators(m5Data.prices),
                };
            } catch (error) {
                logger.warn(`[Monitoring] Failed to fetch indicators for ${symbol}: ${error.message}`);
                continue;
            }

            const positionData = {
                symbol,
                dealId: pos.position.dealId,
                currency: pos.position.currency,
                direction: pos.position.direction,
                size: pos.position.size,
                leverage: pos.position.leverage,
                entryPrice: pos.position.level,
                takeProfit: pos.position.profitLevel,
                stopLoss: pos.position.stopLevel,
                currentPrice: tradingService.resolveMarketPrice(pos.position.direction, pos.market.bid, pos.market.offer ?? pos.market.ask),
                trailingStop: pos.position.trailingStop,
            };

            await tradingService.updateTrailingStopIfNeeded(positionData, indicators);
        }
    } catch (error) {
        logger.error("[bot.js][Bot] Error in monitorOpenTrades:", error);
    }
}

export async function dailyFlatCheck(bot) {
    if (!RISK.DAILY_FORCED_CLOSE_UTC) return;

    const now = new Date();
    const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
    const closeMinute = Number.isFinite(Number(RISK.DAILY_CLOSE_MINUTE_UTC)) ? Number(RISK.DAILY_CLOSE_MINUTE_UTC) : 23 * 60 + 50;
    if (currentMinute < closeMinute) return;

    try {
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

export async function weekendFlatCheck(bot) {
    if (!RISK.WEEKEND_FLAT) return;

    const now = new Date();
    const closeHour = Number.isFinite(Number(RISK.FRIDAY_CLOSE_HOUR_UTC)) ? Number(RISK.FRIDAY_CLOSE_HOUR_UTC) : 20;
    if (now.getUTCDay() !== 5 || now.getUTCHours() < closeHour) return;

    try {
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

function timeframeMinutes(timeframe) {
    const normalized = String(timeframe || "").toUpperCase();
    if (normalized === "M1") return 1;
    if (normalized === "M5") return 5;
    if (normalized === "M15") return 15;
    if (normalized === "H1") return 60;
    if (normalized === "H4") return 240;
    if (normalized === "D1") return 1440;
    return null;
}

function resolveMaxHoldMinutes(pos, symbol) {
    const fallback = Number.isFinite(Number(RISK.MAX_HOLD_TIME)) ? Number(RISK.MAX_HOLD_TIME) : 3600;
    const dealId = pos?.position?.dealId ?? pos?.dealId;
    if (!dealId) return fallback;

    const { entry } = getTradeEntry(dealId, symbol);
    const context = entry?.strategyContext || {};
    const managementProfile = context.managementProfile || {};
    const maxHoldBars = Number(managementProfile.maxHoldBars);
    const managementTimeframe = managementProfile.timeframe || context.timeframe;
    const managementMinutes = timeframeMinutes(managementTimeframe);
    if (Number.isFinite(maxHoldBars) && maxHoldBars > 0 && Number.isFinite(managementMinutes) && managementMinutes > 0) {
        return maxHoldBars * managementMinutes;
    }

    const match = String(context.exitVariant || "").match(/^time_exit_(\d+)$/);
    if (!match) return fallback;

    const bars = Number(match[1]);
    const minutes = timeframeMinutes(context.timeframe);
    if (!(Number.isFinite(bars) && bars > 0 && Number.isFinite(minutes) && minutes > 0)) return fallback;
    return bars * minutes;
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

            const brokerDeals = positions
                .map((p) => ({
                    dealId: p?.position?.dealId ?? p?.dealId,
                    symbol: p?.market?.epic ?? p?.position?.epic,
                }))
                .filter(Boolean);

            const brokerDealIds = brokerDeals.map((d) => d.dealId);

            for (const { dealId, symbol } of brokerDeals) {
                if (!bot.openedBrockerDealIds.includes(dealId)) {
                    bot.openedBrockerDealIds.push(dealId);
                    tradeTracker.registerOpenBrockerDeal(dealId, symbol);
                }
            }
            console.log("openedBrockerDealIds:", bot.openedBrockerDealIds);

            const closedDealIds = bot.openedBrockerDealIds.filter((id) => !brokerDealIds.includes(id));

            bot.openedBrockerDealIds = bot.openedBrockerDealIds.filter((id) => brokerDealIds.includes(id));

            if (closedDealIds.length) {
                console.log("closedDealIds", closedDealIds);
                await tradeTracker.reconcileClosedDeals(closedDealIds);
                closedDealIds.length = 0;
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

export function startPriceMonitor(bot) {
    const interval = (60 - new Date().getUTCSeconds()) * 1000 - new Date().getUTCMilliseconds() + 1000;
    logger.info(`[PriceMonitor] Starting (every 1 minute) after ${interval}ms at ${new Date().toISOString()}`);
    if (bot.priceMonitorInterval) clearInterval(bot.priceMonitorInterval);

    const run = async () => {
        if (bot.priceMonitorInProgress) {
            logger.warn("[PriceMonitor] Previous tick still running; skipping.");
            return;
        }
        bot.priceMonitorInProgress = true;
        try {
            await priceLogger.logSnapshotsForSymbols(bot.activeSymbols);
        } finally {
            bot.priceMonitorInProgress = false;
        }
    };

    setTimeout(() => {
        run();
        bot.priceMonitorInterval = setInterval(run, 60 * 1000);
    }, interval);
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
