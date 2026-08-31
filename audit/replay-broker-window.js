#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { calcIndicators } from "../indicators/indicators.js";
import { PORTFOLIO, SESSIONS, getMarketSession, getProfile } from "../config.js";
import Strategy from "../strategies/strategies.js";

const MINUTE = 60_000;
const M15 = 15 * MINUTE;
const H1 = 60 * MINUTE;
const SYMBOLS = ["AUDUSD", "AUDJPY", "EURJPY", "GBPJPY", "USDCHF", "EURUSD", "GBPUSD", "GBPCHF", "USDJPY"];

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, ...value] = arg.replace(/^--/, "").split("=");
        return [key, value.join("=")];
    }),
);
const datasetDir = path.resolve(args.dataset || "/private/tmp/capital-broker-audit-final-20260827");
const reportPath = path.resolve(args.report || "/private/tmp/capital-broker-audit-replay-20260827.json");
const read = (name) => JSON.parse(fs.readFileSync(path.join(datasetDir, `${name}.json`), "utf8"));
const number = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const timestamp = (value) => {
    const text = String(value || "");
    return Date.parse(/[zZ]|[+\-]\d\d:\d\d$/.test(text) ? text : `${text}Z`);
};
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));

function price(row, field, side) {
    return number(row?.[`${field}Price`]?.[side]);
}

function loadPrices(symbol, timeframe, endExclusive) {
    const duration = timeframe === "M1" ? MINUTE : timeframe === "M15" ? M15 : H1;
    return (read(`${symbol}_${timeframe}`).prices || [])
        .map((row) => ({
            t: timestamp(row.snapshotTimeUTC || row.snapshotTime),
            timestamp: new Date(timestamp(row.snapshotTimeUTC || row.snapshotTime)).toISOString(),
            open: price(row, "open", "bid"),
            high: price(row, "high", "bid"),
            low: price(row, "low", "bid"),
            close: price(row, "close", "bid"),
            askOpen: price(row, "open", "ask"),
            askHigh: price(row, "high", "ask"),
            askLow: price(row, "low", "ask"),
            askClose: price(row, "close", "ask"),
            volume: number(row.lastTradedVolume) ?? 0,
        }))
        .filter((row) => [row.t, row.open, row.high, row.low, row.close, row.askOpen, row.askHigh, row.askLow, row.askClose].every(Number.isFinite))
        .filter((row) => row.t + duration <= endExclusive)
        .sort((left, right) => left.t - right.t);
}

function atOrBefore(rows, target) {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (rows[middle].t <= target) low = middle + 1;
        else high = middle;
    }
    return rows[low - 1] ?? null;
}

function rowAt(rows, target) {
    return rows.find((row) => row.t === target) ?? atOrBefore(rows, target);
}

function roundedPrice(value, symbol) {
    return round(value, symbol.includes("JPY") ? 3 : 5);
}

function marketRules(symbol) {
    const body = read(`market_${symbol}`);
    const marginFactor = number(body.instrument?.marginFactor);
    return {
        leverage: marginFactor > 0 ? 100 / marginFactor : null,
        minSize: number(body.dealingRules?.minDealSize?.value) ?? 100,
        decimals: number(body.snapshot?.decimalPlacesFactor) ?? (symbol.includes("JPY") ? 3 : 5),
    };
}

const meta = read("meta");
const start = Date.parse(meta.from);
const endExclusive = Date.parse(meta.toExclusive);
const prices = new Map(
    SYMBOLS.map((symbol) => [
        symbol,
        {
            M1: loadPrices(symbol, "M1", endExclusive),
            M15: loadPrices(symbol, "M15", endExclusive),
            H1: loadPrices(symbol, "H1", endExclusive),
        },
    ]),
);
const rules = new Map(SYMBOLS.map((symbol) => [symbol, marketRules(symbol)]));

function quotePerEur(symbol, target) {
    const quote = symbol.slice(3, 6);
    if (quote === "EUR") return 1;
    const mid = (pair) => {
        const row = atOrBefore(prices.get(pair)?.M1 || [], target) ?? atOrBefore(prices.get(pair)?.M15 || [], target);
        return row ? (row.close + row.askClose) / 2 : null;
    };
    if (quote === "USD") return mid("EURUSD");
    if (quote === "JPY") return mid("EURJPY");
    if (quote === "CHF") {
        const eurUsd = mid("EURUSD");
        const usdChf = mid("USDCHF");
        return Number.isFinite(eurUsd) && Number.isFinite(usdChf) ? eurUsd * usdChf : null;
    }
    return null;
}

async function buildCandidates(cadenceMinutes) {
    const step = cadenceMinutes * MINUTE;
    const first = Math.ceil(start / step) * step;
    const candidates = [];
    const audits = [];
    const indicatorCache = new Map();

    for (let decision = first; decision < endExclusive; decision += step) {
        const session = getMarketSession(decision);
        const symbols = SESSIONS[session]?.SYMBOLS ?? [];
        for (const symbol of symbols) {
            const profile = getProfile(symbol, session);
            if (!profile) continue;
            const source = prices.get(symbol);
            const m15 = source.M15.filter((row) => row.t + M15 <= decision).slice(-322);
            const h1 = source.H1.filter((row) => row.t + H1 <= decision).slice(-322);
            if (m15.length < 321) {
                audits.push({ decision, symbol, session, reason: "not_enough_m15" });
                continue;
            }
            const candleId = `${symbol}:${m15.at(-1).t}:${h1.at(-1)?.t ?? "none"}`;
            let indicators = indicatorCache.get(candleId);
            if (!indicators) {
                indicators = { m15: await calcIndicators(m15) };
                if (profile.signal.context === "h1") indicators.h1 = await calcIndicators(h1);
                indicatorCache.set(candleId, indicators);
            }
            const market = rowAt(source.M1, decision);
            if (!market) continue;
            const result = Strategy.getSignal({
                symbol,
                profile,
                indicators,
                candles: { m15, ...(profile.signal.context === "h1" ? { h1 } : {}) },
                bid: market.open,
                ask: market.askOpen,
            });
            audits.push({
                decision,
                signalCandle: m15.at(-1).t,
                symbol,
                session,
                signal: result.signal,
                reason: result.reason,
                quality: Number.isFinite(result.quality) ? round(result.quality, 3) : null,
            });
            if (result.signal) candidates.push({ ...result, profile, session, decision, signalCandle: m15.at(-1).t });
        }
    }
    candidates.sort((left, right) => left.decision - right.decision || right.quality - left.quality || left.symbol.localeCompare(right.symbol));
    return { candidates, audits };
}

function initialCashBalance() {
    const account = read("accounts").accounts?.[0];
    const closingCash = number(account?.balance?.deposit) ?? number(account?.balance?.balance);
    const closedPnl = (read("transactions").transactions || []).reduce((sum, item) => sum + Number(item.size || 0), 0);
    return closingCash - closedPnl;
}

function simulate(candidates, trailingCadenceMinutes, label) {
    const balanceStart = initialCashBalance();
    let balance = balanceStart;
    const pending = [];
    const positions = [];
    const trades = [];
    const orders = [];
    const cooldownUntil = new Map();
    let sequence = 1;
    const candidateGroups = new Map();
    for (const candidate of candidates) {
        const group = candidateGroups.get(candidate.decision) ?? [];
        group.push(candidate);
        candidateGroups.set(candidate.decision, group);
    }
    const reservedMargin = () => [...pending, ...positions].reduce((sum, item) => sum + item.margin * (item.remainingSize / item.initialSize), 0);
    const occupied = () => new Set([...pending, ...positions].map((item) => item.symbol));

    const sizeCandidate = (candidate) => {
        const conversion = quotePerEur(candidate.symbol, candidate.decision);
        const leverage = rules.get(candidate.symbol)?.leverage;
        const minSize = rules.get(candidate.symbol)?.minSize ?? 100;
        const distance = Math.abs(candidate.entryPrice - candidate.stopLoss);
        if (![conversion, leverage, distance].every(Number.isFinite) || distance <= 0) return null;
        const requestedRisk = balance * Math.min(0.03, Number(candidate.profile.risk.perTrade ?? 0.03));
        const rawSize = requestedRisk * conversion / distance;
        const availableMargin = Math.max(0, balance - reservedMargin());
        const maxMargin = Math.min(availableMargin, balance / PORTFOLIO.MAX_POSITIONS) * PORTFOLIO.MARGIN_USAGE;
        const rawMargin = rawSize * candidate.entryPrice / conversion / leverage;
        const scale = rawMargin > maxMargin ? maxMargin / rawMargin : 1;
        let size = Math.floor(rawSize * scale / minSize) * minSize;
        const marginFor = (units) => units * candidate.entryPrice / conversion / leverage;
        if (marginFor(size) > maxMargin) size = Math.floor(maxMargin * leverage * conversion / candidate.entryPrice / minSize) * minSize;
        if (size < minSize) return null;
        const margin = marginFor(size);
        const initialRisk = size * distance / conversion;
        return {
            size,
            conversion,
            leverage,
            margin,
            initialRisk,
            effectiveRiskPct: initialRisk / balance,
            requestedRisk,
            marginCapHit: rawMargin > maxMargin || size < Math.floor(rawSize / minSize) * minSize,
        };
    };

    const realize = (position, size, exitPrice) => {
        const pnlQuote = position.side === "BUY" ? size * (exitPrice - position.entry) : size * (position.entry - exitPrice);
        const pnl = pnlQuote / position.conversion;
        position.realizedPnl += pnl;
        position.remainingSize -= size;
        balance += pnl;
        return pnl;
    };

    const close = (position, time, exitPrice, reason) => {
        if (position.remainingSize > 0) realize(position, position.remainingSize, exitPrice);
        positions.splice(positions.indexOf(position), 1);
        const pnl = position.realizedPnl;
        const trade = {
            id: position.id,
            symbol: position.symbol,
            session: position.session,
            side: position.side,
            signalAt: new Date(position.signalAt).toISOString(),
            signalCandle: new Date(position.signalCandle).toISOString(),
            opened: new Date(position.opened).toISOString(),
            closed: new Date(time).toISOString(),
            entry: position.entry,
            initialStop: position.initialStop,
            exit: exitPrice,
            size: position.initialSize,
            requestedRiskPct: 3,
            effectiveRiskPct: round(100 * position.effectiveRiskPct, 3),
            initialRiskEur: round(position.initialRisk, 2),
            pnlEur: round(pnl, 2),
            r: round(pnl / position.initialRisk, 3),
            reason,
            partialTaken: position.partialTaken,
            trailingActivated: position.trailingEnabled,
        };
        trades.push(trade);
        cooldownUntil.set(position.symbol, time + Number(position.profile.risk.cooldownMinutes || 0) * MINUTE);
    };

    const firstMinute = Math.ceil(start / MINUTE) * MINUTE;
    for (let time = firstMinute; time < endExclusive; time += MINUTE) {
        const newCandidates = candidateGroups.get(time) ?? [];
        const occupiedSymbols = occupied();
        const free = Math.max(0, PORTFOLIO.MAX_POSITIONS - occupiedSymbols.size);
        for (const candidate of newCandidates.filter((item) => !occupiedSymbols.has(item.symbol)).slice(0, free)) {
            if (time < (cooldownUntil.get(candidate.symbol) ?? -Infinity)) continue;
            const market = rowAt(prices.get(candidate.symbol).M1, time);
            if (!market) continue;
            const entry = roundedPrice(candidate.entryPrice, candidate.symbol);
            const stop = roundedPrice(candidate.stopLoss, candidate.symbol);
            const isAhead = candidate.signal === "BUY" ? entry > market.askOpen : entry < market.open;
            if (!isAhead) {
                orders.push({ symbol: candidate.symbol, session: candidate.session, side: candidate.signal, signalAt: new Date(time).toISOString(), status: "behind_market" });
                continue;
            }
            const sizing = sizeCandidate({ ...candidate, entryPrice: entry, stopLoss: stop });
            if (!sizing) continue;
            const distance = Math.abs(entry - stop);
            const profile = candidate.profile;
            let partialSize = 0;
            let runnerSize = sizing.size;
            if (profile.exit.mode === "partial") {
                partialSize = Math.floor(sizing.size * profile.exit.partialFraction / 100) * 100;
                runnerSize = sizing.size - partialSize;
                if (partialSize < 100 || runnerSize < 100) continue;
            }
            const target = profile.exit.mode === "fixed"
                ? roundedPrice(candidate.signal === "BUY" ? entry + distance * profile.exit.targetR : entry - distance * profile.exit.targetR, candidate.symbol)
                : roundedPrice(candidate.signal === "BUY" ? entry + distance * profile.exit.partialAtR : entry - distance * profile.exit.partialAtR, candidate.symbol);
            const order = {
                id: sequence++,
                symbol: candidate.symbol,
                session: candidate.session,
                side: candidate.signal,
                signalAt: time,
                signalCandle: candidate.signalCandle,
                entry,
                stop,
                target,
                expires: time + profile.entry.expiryBars * M15,
                profile,
                signalAtr: candidate.atr,
                initialSize: sizing.size,
                remainingSize: sizing.size,
                partialSize,
                runnerSize,
                ...sizing,
                status: "pending",
            };
            pending.push(order);
            orders.push(order);
            occupiedSymbols.add(candidate.symbol);
        }

        for (const order of [...pending]) {
            if (time >= order.expires) {
                order.status = "expired";
                pending.splice(pending.indexOf(order), 1);
                continue;
            }
            const bar = rowAt(prices.get(order.symbol).M1, time);
            if (!bar || bar.t !== time) continue;
            const invalidated = order.side === "BUY" ? bar.low <= order.stop : bar.askHigh >= order.stop;
            const touched = order.side === "BUY" ? bar.askHigh >= order.entry : bar.low <= order.entry;
            if (invalidated) {
                order.status = "invalidated";
                pending.splice(pending.indexOf(order), 1);
                continue;
            }
            if (!touched) continue;
            const fill = order.side === "BUY" ? Math.max(order.entry, bar.askOpen) : Math.min(order.entry, bar.open);
            order.status = "filled";
            order.filled = new Date(time).toISOString();
            order.fill = roundedPrice(fill, order.symbol);
            pending.splice(pending.indexOf(order), 1);
            positions.push({
                ...order,
                opened: time,
                entry: fill,
                initialStop: order.stop,
                activeStop: order.stop,
                initialDistance: Math.abs(fill - order.stop),
                initialRisk: order.initialSize * Math.abs(fill - order.stop) / order.conversion,
                realizedPnl: 0,
                partialTaken: false,
                breakEvenMoved: false,
                trailingEnabled: false,
                trailingDistance: null,
                status: "open",
            });
        }

        for (const position of [...positions]) {
            const bar = rowAt(prices.get(position.symbol).M1, time);
            if (!bar || bar.t !== time || time < position.opened) continue;
            const stopTouched = position.side === "BUY" ? bar.low <= position.activeStop : bar.askHigh >= position.activeStop;
            if (stopTouched) {
                const exit = position.side === "BUY" ? Math.min(position.activeStop, bar.open) : Math.max(position.activeStop, bar.askOpen);
                close(position, time + MINUTE, exit, position.trailingEnabled ? "trailing_stop" : position.breakEvenMoved ? "break_even" : "stop_loss");
                continue;
            }
            if (position.profile.exit.mode === "fixed") {
                const hit = position.side === "BUY" ? bar.high >= position.target : bar.askLow <= position.target;
                if (hit) {
                    close(position, time + MINUTE, position.target, "take_profit");
                    continue;
                }
            } else if (!position.partialTaken) {
                const hit = position.side === "BUY" ? bar.high >= position.target : bar.askLow <= position.target;
                if (hit) {
                    realize(position, position.partialSize, position.target);
                    position.partialTaken = true;
                }
            }

            if (position.trailingEnabled) {
                const proposed = position.side === "BUY" ? bar.high - position.trailingDistance : bar.askLow + position.trailingDistance;
                position.activeStop = position.side === "BUY" ? Math.max(position.activeStop, proposed) : Math.min(position.activeStop, proposed);
            }

            const heldMinutes = (time + MINUTE - position.opened) / MINUTE;
            if (heldMinutes >= Number(position.profile.exit.maxHoldMinutes)) {
                close(position, time + MINUTE, position.side === "BUY" ? bar.close : bar.askClose, "max_hold");
                continue;
            }

            if ((time + MINUTE) % (trailingCadenceMinutes * MINUTE) !== 0) continue;
            const current = position.side === "BUY" ? bar.close : bar.askClose;
            const favorable = position.side === "BUY" ? current - position.entry : position.entry - current;
            if (position.profile.exit.mode === "partial") {
                if (favorable < position.initialDistance * position.profile.exit.partialAtR) continue;
                if (!position.breakEvenMoved) {
                    position.activeStop = position.entry;
                    position.breakEvenMoved = true;
                }
                if (!position.trailingEnabled) {
                    const distance = position.signalAtr * position.profile.exit.trailAtr;
                    if (favorable >= distance) {
                        position.trailingEnabled = true;
                        position.trailingDistance = distance;
                    }
                }
                continue;
            }
            const breakEvenAtR = number(position.profile.exit.breakEvenAtR);
            if (!position.breakEvenMoved && breakEvenAtR !== null && favorable >= position.initialDistance * breakEvenAtR) {
                position.activeStop = position.entry;
                position.breakEvenMoved = true;
            }
            const activationR = number(position.profile.exit.trailActivationR);
            const distanceR = number(position.profile.exit.trailDistanceR);
            if (!position.trailingEnabled && activationR !== null && distanceR !== null && favorable >= position.initialDistance * activationR) {
                position.trailingEnabled = true;
                position.trailingDistance = position.initialDistance * Math.min(distanceR, activationR);
            }
        }
    }

    const openPositions = positions.map((position) => {
        const bar = prices.get(position.symbol).M1.at(-1);
        const mark = position.side === "BUY" ? bar.close : bar.askClose;
        const floating = position.realizedPnl + (position.side === "BUY"
            ? position.remainingSize * (mark - position.entry) / position.conversion
            : position.remainingSize * (position.entry - mark) / position.conversion);
        return {
            symbol: position.symbol,
            side: position.side,
            opened: new Date(position.opened).toISOString(),
            entry: position.entry,
            stop: position.activeStop,
            target: position.target,
            size: position.initialSize,
            remainingSize: position.remainingSize,
            effectiveRiskPct: round(100 * position.effectiveRiskPct, 3),
            floatingPnlEur: round(floating, 2),
            partialTaken: position.partialTaken,
            trailingActivated: position.trailingEnabled,
        };
    });
    const realizedPnl = trades.reduce((sum, trade) => sum + trade.pnlEur, 0);
    const floatingPnl = openPositions.reduce((sum, position) => sum + position.floatingPnlEur, 0);
    return {
        label,
        trailingCadenceMinutes,
        startBalance: round(balanceStart, 2),
        closingCash: round(balance, 2),
        equity: round(balance + floatingPnl, 2),
        realizedPnl: round(realizedPnl, 2),
        floatingPnl: round(floatingPnl, 2),
        orders: orders.map((order) => ({
            symbol: order.symbol,
            session: order.session,
            side: order.side,
            signalAt: order.signalAt instanceof Date ? order.signalAt.toISOString() : new Date(order.signalAt).toISOString(),
            status: order.status,
            entry: order.entry,
            stop: order.stop,
            target: order.target,
            size: order.initialSize,
            effectiveRiskPct: Number.isFinite(order.effectiveRiskPct) ? round(100 * order.effectiveRiskPct, 3) : null,
            filled: order.filled ?? null,
        })),
        trades,
        openPositions,
        pendingOrders: pending.map((order) => ({ symbol: order.symbol, side: order.side, entry: order.entry, expires: new Date(order.expires).toISOString() })),
    };
}

function brokerLedger() {
    const activity = read("activity").activities || [];
    const transactions = read("transactions").transactions || [];
    const account = read("accounts").accounts?.[0];
    const entries = activity.filter(
        (item) => item.type === "POSITION" && item.status === "ACCEPTED" && item.source === "USER" && item.details?.openPrice == null,
    );
    const closes = activity.filter((item) => item.type === "POSITION" && item.status === "ACCEPTED" && item.source !== "USER");
    const transactionPool = [...transactions];
    const rows = entries.map((entry) => {
        const details = entry.details || {};
        const close = closes.find((item) => item.dealId === entry.dealId);
        let transaction = null;
        if (close) {
            const closeTime = timestamp(close.dateUTC || close.date);
            const index = transactionPool.findIndex((item) => item.instrumentName === entry.epic && Math.abs(timestamp(item.dateUtc || item.dateUTC || item.date) - closeTime) < 2_000);
            if (index >= 0) transaction = transactionPool.splice(index, 1)[0];
        } else {
            const userClose = activity.find((item) =>
                item.type === "POSITION" && item.source === "USER" && item.details?.openPrice != null && item.dealId === entry.dealId && timestamp(item.dateUTC || item.date) > timestamp(entry.dateUTC || entry.date));
            if (userClose) {
                const closeTime = timestamp(userClose.dateUTC || userClose.date);
                const index = transactionPool.findIndex((item) => item.instrumentName === entry.epic && Math.abs(timestamp(item.dateUtc || item.dateUTC || item.date) - closeTime) < 2_000);
                if (index >= 0) transaction = transactionPool.splice(index, 1)[0];
            }
        }
        const conversion = quotePerEur(entry.epic, timestamp(entry.dateUTC || entry.date));
        const size = number(details.size);
        const initialRisk = size * Math.abs(number(details.level) - number(details.stopLevel)) / conversion;
        const pnl = transaction ? number(transaction.size) : null;
        return {
            symbol: entry.epic,
            side: details.direction,
            opened: new Date(timestamp(entry.dateUTC || entry.date)).toISOString(),
            closed: transaction ? new Date(timestamp(transaction.dateUtc || transaction.dateUTC || transaction.date)).toISOString() : null,
            entry: number(details.level),
            stop: number(details.stopLevel),
            target: number(details.profitLevel),
            size,
            initialRiskEur: round(initialRisk, 2),
            effectiveRiskPct: round(100 * initialRisk / initialCashBalance(), 3),
            pnlEur: pnl,
            r: pnl === null ? null : round(pnl / initialRisk, 3),
            reason: close?.source === "SL" ? "stop_loss" : transaction ? "user_or_timeout" : "open",
        };
    });
    const tradeTransactions = transactions.filter((item) => item.transactionType === "TRADE");
    const transactionAmount = (item) => Number(item.size || 0);
    const matchedClosedPnl = rows.reduce((sum, row) => sum + (row.pnlEur ?? 0), 0);
    const closedPnl = tradeTransactions.reduce((sum, item) => sum + transactionAmount(item), 0);
    const totalTransactionCashflow = transactions.reduce((sum, item) => sum + transactionAmount(item), 0);
    const unmatchedTransactions = transactionPool.map((item) => ({
        symbol: item.instrumentName,
        closed: new Date(timestamp(item.dateUtc || item.dateUTC || item.date)).toISOString(),
        pnlEur: number(item.size),
        reference: item.reference ?? null,
        reason: "opened_before_window_or_unmatched_activity",
    }));
    const groupedStats = (items, key) => Object.fromEntries(
        [...new Set(items.map((item) => item[key] || "UNKNOWN"))].sort().map((name) => {
            const group = items.filter((item) => (item[key] || "UNKNOWN") === name);
            const values = group.map(transactionAmount);
            return [name, {
                count: group.length,
                wins: values.filter((value) => value > 0).length,
                losses: values.filter((value) => value < 0).length,
                netEur: round(values.reduce((sum, value) => sum + value, 0), 2),
            }];
        }),
    );
    const wins = tradeTransactions.filter((item) => transactionAmount(item) > 0).length;
    const losses = tradeTransactions.filter((item) => transactionAmount(item) < 0).length;
    const breakeven = tradeTransactions.length - wins - losses;
    const grossProfit = tradeTransactions.reduce((sum, item) => sum + Math.max(0, transactionAmount(item)), 0);
    const grossLoss = tradeTransactions.reduce((sum, item) => sum + Math.min(0, transactionAmount(item)), 0);
    const closingBalance = number(account?.balance?.deposit) ?? number(account?.balance?.balance);
    const startBalance = closingBalance - totalTransactionCashflow;
    const reconstructedTradePnl = matchedClosedPnl + unmatchedTransactions.reduce((sum, item) => sum + item.pnlEur, 0);
    return {
        sources: ["GET /history/transactions", "GET /history/activity", "GET /accounts", "GET /positions", "GET /workingorders"],
        startBalance: round(startBalance, 2),
        closingBalance: round(closingBalance, 2),
        closedPnl: round(closedPnl, 2),
        matchedClosedPnl: round(matchedClosedPnl, 2),
        closedLegs: transactions.length,
        matchedClosedLegs: rows.filter((row) => row.closed).length,
        unmatchedClosedLegs: unmatchedTransactions.length,
        openLegs: rows.filter((row) => !row.closed).length,
        unmatchedTransactions,
        transactionStatistics: {
            currency: account?.currency ?? null,
            tradeClosures: tradeTransactions.length,
            wins,
            losses,
            breakeven,
            winRatePct: tradeTransactions.length ? round(100 * wins / tradeTransactions.length, 2) : 0,
            grossProfit: round(grossProfit, 2),
            grossLoss: round(grossLoss, 2),
            netTradePnl: round(closedPnl, 2),
            nonTradeCashflow: round(totalTransactionCashflow - closedPnl, 2),
            totalTransactionCashflow: round(totalTransactionCashflow, 2),
            bySymbol: groupedStats(tradeTransactions, "instrumentName"),
            byType: groupedStats(transactions, "transactionType"),
        },
        reconciliation: {
            reconstructedTradePnl: round(reconstructedTradePnl, 2),
            deltaVsTransactionHistory: round(reconstructedTradePnl - closedPnl, 2),
            expectedClosingBalance: round(startBalance + totalTransactionCashflow, 2),
            deltaVsAccountBalance: round(startBalance + totalTransactionCashflow - closingBalance, 2),
        },
        rows,
    };
}

const m15Signals = await buildCandidates(15);
const m5Signals = await buildCandidates(5);
const variants = [1, 5, 15].map((cadence) => simulate(m15Signals.candidates, cadence, `M15 signals / M${cadence} trailing monitor`));
const currentCadence = simulate(m5Signals.candidates, 1, "M5 signal checks / M1 trailing monitor");
const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dataset: { directory: datasetDir, from: meta.from, toExclusive: meta.toExclusive, symbols: SYMBOLS },
    policy: {
        signalTimeframe: "M15",
        risk: "target 3% per trade, constrained by broker leverage, 18% per-position margin budget, available margin and 100-unit sizing",
        portfolio: "maximum five occupied symbols; no global daily/session entry caps; one position/order per symbol",
        cooldown: "profile cooldown begins after the position closes",
        execution: "broker bid/ask M1, conservative stop/invalidation first within ambiguous M1 candles",
        trailing: "activation sampled at M1/M5/M15 close; once enabled, broker trailing ratchets on subsequent M1 extremes",
    },
    coverage: Object.fromEntries(
        SYMBOLS.map((symbol) => [
            symbol,
            Object.fromEntries(
                ["M1", "M15", "H1"].map((tf) => {
                    const rows = prices.get(symbol)[tf];
                    return [tf, { rows: rows.length, first: rows[0]?.timestamp, last: rows.at(-1)?.timestamp }];
                }),
            ),
        ]),
    ),
    broker: brokerLedger(),
    signals: {
        m15: m15Signals.candidates.map((candidate) => ({ decision: new Date(candidate.decision).toISOString(), signalCandle: new Date(candidate.signalCandle).toISOString(), symbol: candidate.symbol, session: candidate.session, side: candidate.signal, quality: round(candidate.quality, 3), entry: roundedPrice(candidate.entryPrice, candidate.symbol), stop: roundedPrice(candidate.stopLoss, candidate.symbol) })),
        m5: m5Signals.candidates.map((candidate) => ({ decision: new Date(candidate.decision).toISOString(), signalCandle: new Date(candidate.signalCandle).toISOString(), symbol: candidate.symbol, session: candidate.session, side: candidate.signal, quality: round(candidate.quality, 3), entry: roundedPrice(candidate.entryPrice, candidate.symbol), stop: roundedPrice(candidate.stopLoss, candidate.symbol) })),
    },
    variants,
    currentCadence,
    limitations: [
        "The live getMarketDetails snapshot was not logged; the replay uses the opening bid/ask of the broker M1 candle at each decision time.",
        "Intraminute path is unavailable, so simultaneous M1 stop/fill/target touches are resolved conservatively with invalidation/stop first.",
        "Broker-native trailing is approximated with M1 extremes after activation; tick-level trailing may differ within a minute.",
        "Open-position P&L is marked using the last fully closed M1 candle in the frozen window.",
    ],
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
    reportPath,
    broker: report.broker,
    signalCounts: { m15: report.signals.m15.length, m5: report.signals.m5.length },
    variants: variants.map(({ label, startBalance, closingCash, equity, realizedPnl, floatingPnl, orders, trades, openPositions }) => ({ label, startBalance, closingCash, equity, realizedPnl, floatingPnl, orders: orders.length, trades: trades.length, openPositions: openPositions.length })),
    currentCadence: { realizedPnl: currentCadence.realizedPnl, floatingPnl: currentCadence.floatingPnl, orders: currentCadence.orders.length, trades: currentCadence.trades.length, openPositions: currentCadence.openPositions.length },
}, null, 2));
