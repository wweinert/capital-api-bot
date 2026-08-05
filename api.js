import { API } from "./config.js";
import axios from "axios";
import logger from "./utils/logger.js";

let cst, xsecurity;
let sessionStartTime = Date.now();

const MAX_GET_REQUESTS_PER_SECOND = 8;
const requestStarts = [];

async function acquireGetSlot() {
    while (true) {
        const now = Date.now();

        while (requestStarts.length && now - requestStarts[0] >= 1000) {
            requestStarts.shift();
        }

        if (requestStarts.length < MAX_GET_REQUESTS_PER_SECOND) {
            requestStarts.push(now);
            return;
        }

        const waitMs = Math.max(1, 1000 - (now - requestStarts[0]) + 10);
        await delay(waitMs);
    }
}

async function apiGet(url, options = {}) {
    await acquireGetSlot();
    return axios.get(url, options);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRoundedNumber(value, decimals = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return NaN;
    const digits = Number.isInteger(decimals) && decimals >= 0 ? decimals : 0;
    return Number(num.toFixed(digits));
}

export const getHeaders = (includeContentType = false) => {
    const baseHeaders = {
        "X-SECURITY-TOKEN": xsecurity,
        "X-CAP-API-KEY": API.KEY,
        CST: cst,
    };
    return includeContentType ? { ...baseHeaders, "Content-Type": "application/json" } : baseHeaders;
};

export const getAccountActivity = async (from, to) =>
    withSessionRetry(async () => {
        const response = await apiGet(`${API.BASE_URL}/history/activity`, {
            headers: getHeaders(),
            params: { from, to, detailed: true },
        });

        return response.data?.activities || [];
    });

export const getAccountTransactions = async (from, to) =>
    withSessionRetry(async () => {
        const response = await apiGet(`${API.BASE_URL}/history/transactions`, {
            headers: getHeaders(),
            params: { from, to, type: "TRADE" },
        });

        return response.data?.transactions || [];
    });

export const startSession = async () => {
    try {
        const response = await axios.post(
            `${API.BASE_URL}/session`,
            {
                identifier: API.IDENTIFIER,
                password: API.PASSWORD,
                encryptedPassword: false,
            },
            {
                headers: getHeaders(true),
            },
        );

        console.log("");
        logger.info("Session started");
        cst = response.headers["cst"];
        xsecurity = response.headers["x-security-token"];

        sessionStartTime = Date.now();
        if (!cst || !xsecurity) {
            logger.warn("Session tokens not received in response headers");
            logger.info("Response headers:", response.headers);
        }

        return response.data;
    } catch (error) {
        logger.error("[api.js] Failed to start session:", error.response ? error.response.data : error.message);
        if (error.response) {
            logger.error("[api.js] Response status:", error.response.status);
            logger.error("[api.js] Response headers:", error.response.headers);
        }
        throw error;
    }
};

export const pingSession = async () => {
    try {
        const response = await apiGet(`${API.BASE_URL}/ping`, { headers: getHeaders() });
        logger.info(`[API] Ping response: ${JSON.stringify(response.data)}`);
        // logger.info(`[API] securityToken: ${xsecurity}`);
        // logger.info(`[API] CST: ${cst}`);
    } catch (error) {
        logger.error(`[api.js][API] Error pinging session: ${error.message}`);
        throw error;
    }
};

export const refreshSession = async () => {
    await startSession();
};

export const getSessionDetails = async () => {
    try {
        const response = await apiGet(`${API.BASE_URL}/session`, { headers: getHeaders() });
        logger.info(`[API] Session details: ${JSON.stringify(response.data)}`);
    } catch (error) {
        logger.error("[api.js][API] Session details error:", error.response?.data || error.message);
    }
};

async function withSessionRetry(fn, ...args) {
    try {
        return await fn(...args);
    } catch (error) {
        const status = error.response?.status;
        const errorCode = error.response?.data?.errorCode || "";
        if (
            status === 401 ||
            status === 403 ||
            errorCode === "error.invalid.session.token" ||
            (typeof errorCode === "string" && errorCode.toLowerCase().includes("session"))
        ) {
            logger.warn("[API] Session error detected. Refreshing session and retrying...");
            await refreshSession();
            return await fn(...args); // Retry once
        }
        throw error;
    }
}

async function apiPost(path, payload) {
    return await withSessionRetry(async () => {
        return await axios.post(`${API.BASE_URL}${path}`, payload, {
            headers: getHeaders(true),
        });
    });
}

export const getAccountInfo = async () =>
    withSessionRetry(async () => {
        const response = await apiGet(`${API.BASE_URL}/accounts`, { headers: getHeaders() });
        return response.data;
    });

export const getMarkets = async () =>
    withSessionRetry(async () => {
        const response = await apiGet(`${API.BASE_URL}/markets?searchTerm=EURUSD`, { headers: getHeaders() });
        return Array.isArray(response.data.markets) ? response.data.markets : [];
    });

export async function getMarketDetails(symbol) {
    return await withSessionRetry(async () => {
        const response = await apiGet(`${API.BASE_URL}/markets/${symbol}`, { headers: getHeaders() });
        // logger.info(`Market details for ${symbol}: ${JSON.stringify(response.data)}`);
        return response.data;
    });
}

export const getOpenPositions = async () =>
    withSessionRetry(async () => {
        const response = await apiGet(`${API.BASE_URL}/positions`, { headers: getHeaders() });
        // logger.info("<========= open positions =========>\n" + JSON.stringify(response.data, null, 2) + "\n\n");
        return response.data;
    });

export async function getHistorical(symbol, resolution, count) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await apiGet(`${API.BASE_URL}/prices/${symbol}?resolution=${resolution}&max=${count}`, { headers: getHeaders(true) });
            return {
                prices: response.data.prices.map((p) => ({
                    close: p.closePrice?.bid,
                    high: p.highPrice?.bid,
                    low: p.lowPrice?.bid,
                    open: p.openPrice?.bid,
                    timestamp: `${p.snapshotTimeUTC}Z`,
                })),
            };
        } catch (error) {
            if (error.response?.status === 429 && attempt < maxAttempts) {
                const waitMs = 1500 * attempt;
                logger.warn(`[API] Rate limited fetching ${symbol} ${resolution}. Retry ${attempt}/${maxAttempts} in ${waitMs}ms`);
                await delay(waitMs);
                continue;
            }
            throw error;
        }
    }
}

export const getWorkingOrders = async () =>
    withSessionRetry(async () => {
        const response = await apiGet(`${API.BASE_URL}/workingorders`, { headers: getHeaders() });

        return response.data;
    });

export const cancelWorkingOrder = async (dealId) =>
    withSessionRetry(async () => {
        const response = await axios.delete(`${API.BASE_URL}/workingorders/${dealId}`, {
            headers: getHeaders(),
        });

        return response.data;
    });

export async function placeOrder({ symbol, type = "STOP", direction, size, level, stopLevel, profitLevel, goodTillDate }) {
    const rules = await getAllowedTPRange(symbol);
    const decimals = rules.decimals;

    const entry = toRoundedNumber(level, decimals);
    const stop = toRoundedNumber(stopLevel, decimals);
    const target = toRoundedNumber(profitLevel, decimals);

    if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) {
        throw new Error(`Invalid pending order prices for ${symbol}`);
    }

    const isBuy = direction.toUpperCase() === "BUY";

    const marketPrice = isBuy ? Number(rules.market.offer) : Number(rules.market.bid);

    const orderType = type.toUpperCase();

    const entryIsValid = orderType === "STOP" ? (isBuy ? entry > marketPrice : entry < marketPrice) : isBuy ? entry < marketPrice : entry > marketPrice;

    if (!entryIsValid) {
        logger.warn(`[API] ${symbol}: ${orderType} entry is behind market price`);
        return { skipped: true };
    }

    const protection = validateMarketProtection({
        symbol,
        direction,
        stopLevel: stop,
        profitLevel: target,
        bid: entry,
        offer: entry,
        minSLDistancePrice: rules.minSLDistancePrice,
        minTPDistancePrice: rules.minTPDistancePrice,
    });

    if (protection.skipped) {
        logger.warn(`[API] ${symbol}: pending order skipped — ${protection.reason}`);
        return protection;
    }

    const order = {
        epic: symbol,
        direction: direction.toUpperCase(),
        size: Number(size),
        level: entry,
        type: orderType,
        guaranteedStop: false,
        trailingStop: false,
        stopLevel: stop,
        profitLevel: target,
        goodTillDate,
    };

    logger.info(`[API] Placing ${orderType} order for ${symbol} at ${entry}`);

    const response = await apiPost("/workingorders", order);

    return response.data;
}

export const enableTrailingStop = async (dealId, stopDistance, profitLevel) =>
    withSessionRetry(async () => {
        const response = await axios.put(
            `${API.BASE_URL}/positions/${dealId}`,
            {
                trailingStop: true,
                stopDistance: Number(stopDistance),
                profitLevel: Number(profitLevel),
            },
            {
                headers: getHeaders(true),
            },
        );

        return response.data;
    });

function validateMarketProtection({ symbol, direction, stopLevel, profitLevel, bid, offer, minSLDistancePrice, minTPDistancePrice }) {
    const isBuy = String(direction).toUpperCase() === "BUY";
    const hasBid = Number.isFinite(bid);
    const hasOffer = Number.isFinite(offer);

    // Without a market reference we cannot validate distances; let the order through.
    if (!hasBid && !hasOffer) return { skipped: false };

    const reference = hasBid && hasOffer ? (bid + offer) / 2 : hasBid ? bid : offer;
    const minSL = Number.isFinite(minSLDistancePrice) ? minSLDistancePrice : 0;
    const minTP = Number.isFinite(minTPDistancePrice) ? minTPDistancePrice : 0;
    const skip = (reason, minDistance) => ({ skipped: true, reason, bid, offer, minDistance, symbol });

    if (isBuy) {
        if (stopLevel >= reference) return skip("stop loss not below market for BUY", minSL);
        if (profitLevel <= reference) return skip("take profit not above market for BUY", minTP);
        if (reference - stopLevel < minSL) return skip("stop loss closer than minimum distance", minSL);
        if (profitLevel - reference < minTP) return skip("take profit closer than minimum distance", minTP);
    } else {
        if (stopLevel <= reference) return skip("stop loss not above market for SELL", minSL);
        if (profitLevel >= reference) return skip("take profit not below market for SELL", minTP);
        if (stopLevel - reference < minSL) return skip("stop loss closer than minimum distance", minSL);
        if (reference - profitLevel < minTP) return skip("take profit closer than minimum distance", minTP);
    }

    return { skipped: false };
}

export async function placePosition(symbol, direction, size, price, SL, TP) {
    try {
        const range = await getAllowedTPRange(symbol);
        const decimals = Number.isInteger(range.decimals) ? range.decimals : symbol.includes("JPY") ? 3 : 5;
        const stopLevel = toRoundedNumber(SL, decimals);
        const profitLevel = toRoundedNumber(TP, decimals);

        if (!Number.isFinite(stopLevel) || !Number.isFinite(profitLevel)) {
            throw new Error(`Invalid stop/profit levels for ${symbol}. stop=${SL} profit=${TP}`);
        }

        const protectionSkip = validateMarketProtection({
            symbol,
            direction,
            stopLevel,
            profitLevel,
            bid: Number(range.market?.bid),
            offer: Number(range.market?.offer),
            minSLDistancePrice: range.minSLDistancePrice,
            minTPDistancePrice: range.minTPDistancePrice,
        });
        if (protectionSkip?.skipped) {
            logger.warn(
                `[API] Skip ${direction} ${symbol} position: ${protectionSkip.reason} ` +
                    `(SL=${stopLevel} TP=${profitLevel} bid=${protectionSkip.bid} offer=${protectionSkip.offer} minDist=${protectionSkip.minDistance})`,
            );
            return protectionSkip;
        }

        logger.info(`[API] Placing ${direction} position for ${symbol} at market price. Size: ${size}, SL: ${stopLevel}, TP: ${profitLevel}`);
        const position = {
            epic: symbol,
            direction: direction.toUpperCase(),
            size: Number(size),
            orderType: "MARKET",
            guaranteedStop: false,
            stopLevel,
            profitLevel,
        };
        logger.info(`[API] Sending position request: ${JSON.stringify(position)}`);

        const requestedAt = new Date().toISOString();
        const response = await apiPost("/positions", position, { label: `placePosition ${symbol}` });

        logger.info(`[API] Position created successfully: ${JSON.stringify(response.data)}`);
        return {
            ...response.data,
            executionSnapshot: {
                requestedAt,
                symbol,
                direction: direction.toUpperCase(),
                requestedPrice: Number(price),
                bid: Number(range.market?.bid),
                offer: Number(range.market?.offer),
                mid:
                    Number.isFinite(Number(range.market?.bid)) && Number.isFinite(Number(range.market?.offer))
                        ? (Number(range.market.bid) + Number(range.market.offer)) / 2
                        : null,
                spread:
                    Number.isFinite(Number(range.market?.bid)) && Number.isFinite(Number(range.market?.offer))
                        ? Math.abs(Number(range.market.offer) - Number(range.market.bid))
                        : null,
                minSLDistancePrice: range.minSLDistancePrice,
                minTPDistancePrice: range.minTPDistancePrice,
                decimals,
                source: "pre_order_market_snapshot",
            },
        };
    } catch (error) {
        logger.error(`[API] Error placing position for ${symbol}:`, error.response ? JSON.stringify(error.response.data) : error.message);
        if (error.response) {
            logger.error(`[API] Response status:`, error.response.status);
            logger.error(`[API] Response headers:`, JSON.stringify(error.response.headers));
        }
        throw error;
    }
}

export async function gevtDealConfirmation(dealReference) {
    return await withSessionRetry(async () => {
        logger.info(`[API] Getting confirmation for deal: ${dealReference}`);
        const response = await apiGet(`${API.BASE_URL}/confirms/${dealReference}`, { headers: getHeaders() });
        logger.info("[API] DealConfirmation", response.data);
        return response.data;
    });
}

// In api.js, update getDealConfirmation method
export async function getDealConfirmation(dealReference) {
    return await withSessionRetry(async () => {
        logger.info(`[API] Getting confirmation for deal: ${dealReference}`);
        const response = await apiGet(`${API.BASE_URL}/confirms/${dealReference}`, { headers: getHeaders() });

        if (!response.data || !response.data.status) {
            throw new Error("Invalid deal confirmation data received");
        }

        logger.info("[API] DealConfirmation", response.data);
        return response.data;
    });
}

export async function closePosition(dealId) {
    try {
        const response = await axios.delete(`${API.BASE_URL}/positions/${dealId}`, {
            headers: getHeaders(true),
        });
        logger.info(`[API] Position closed:`, response.data);
        return response.data;
    } catch (error) {
        logger.error(`[api.js][API] Failed to close position for dealId: ${dealId}`, error.response?.data || error.message);
        throw error;
    }
}

export function getSessionTokens() {
    return { cst, xsecurity };
}

export async function getAllowedTPRange(symbol) {
    const details = await getMarketDetails(symbol);
    const snapshot = details?.snapshot || {};
    const distanceRule = details?.dealingRules?.minStopOrProfitDistance;

    const bid = Number(snapshot.bid);
    const offer = Number(snapshot.offer);
    const marketPrice = (bid + offer) / 2;

    const ruleValue = Number(distanceRule?.value);

    const minDistance = distanceRule?.unit === "PERCENTAGE" ? marketPrice * (ruleValue / 100) : ruleValue;

    return {
        decimals: Number(snapshot.decimalPlacesFactor) || 5,
        minSLDistancePrice: Number.isFinite(minDistance) ? minDistance : 0,
        minTPDistancePrice: Number.isFinite(minDistance) ? minDistance : 0,
        market: snapshot,
    };
}
