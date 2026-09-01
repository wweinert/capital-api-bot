#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { discoverSymbols, prepareSessionProfileSearch } from "./prepare.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const M15 = 15 * MINUTE;
const CADENCES = [1, 5, 15];
const SLOT_COUNTS = [1, 2, 3, 4, 5, 6, 7];
const DEFAULT_RULES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "reference", "capital-market-rules-2026-08-29.json");

function parseArgs(values) {
    const parsed = {};
    for (let index = 0; index < values.length; index += 1) {
        const token = values[index];
        if (!token.startsWith("--")) continue;
        const separator = token.indexOf("=");
        if (separator >= 0) {
            parsed[token.slice(2, separator)] = token.slice(separator + 1);
            continue;
        }
        const next = values[index + 1];
        parsed[token.slice(2)] = next && !next.startsWith("--") ? values[++index] : true;
    }
    return parsed;
}

function number(value) {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function timestampOf(row) {
    const raw = row?.timestamp ?? row?.snapshotTimeUTC ?? row?.snapshotTime;
    if (raw == null) return NaN;
    const value = String(raw);
    return Date.parse(/[zZ]|[+\-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

function sidePrice(row, key, side) {
    return number(row?.[side]?.[key])
        ?? number(row?.[`${key}Price`]?.[side])
        ?? number(row?.[key]?.[side])
        ?? number(row?.[`${key}${side[0].toUpperCase()}${side.slice(1)}`])
        ?? (side === "bid" ? number(row?.[key]) : null);
}

function roundPrice(value, symbol) {
    return Number(Number(value).toFixed(symbol.includes("JPY") ? 3 : 5));
}

function increment(map, key) {
    map.set(key, (map.get(key) ?? 0) + 1);
}

function sha256File(filePath) {
    const hash = crypto.createHash("sha256");
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    try {
        while (true) {
            const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
            if (!bytes) break;
            hash.update(buffer.subarray(0, bytes));
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest("hex");
}

async function loadMinuteRows(filePath, from, toExclusive) {
    if (!fs.existsSync(filePath)) throw new Error(`Missing M1 file: ${filePath}`);
    const rows = [];
    let malformed = 0;
    let sourceRows = 0;
    const reader = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of reader) {
        if (!line.trim()) continue;
        sourceRows += 1;
        try {
            const raw = JSON.parse(line);
            const t = timestampOf(raw);
            if (!(t >= from && t < toExclusive)) continue;
            const values = [
                t,
                sidePrice(raw, "open", "bid"),
                sidePrice(raw, "high", "bid"),
                sidePrice(raw, "low", "bid"),
                sidePrice(raw, "close", "bid"),
                sidePrice(raw, "open", "ask"),
                sidePrice(raw, "high", "ask"),
                sidePrice(raw, "low", "ask"),
                sidePrice(raw, "close", "ask"),
            ];
            if (!values.every(Number.isFinite) || values[2] < values[3] || values[6] < values[7]) {
                malformed += 1;
                continue;
            }
            rows.push({ t, open: values[1], high: values[2], low: values[3], close: values[4], askOpen: values[5], askHigh: values[6], askLow: values[7], askClose: values[8] });
        } catch {
            malformed += 1;
        }
    }
    rows.sort((left, right) => left.t - right.t);
    const deduplicated = [];
    let duplicates = 0;
    let unexpectedGaps = 0;
    for (const row of rows) {
        if (deduplicated.at(-1)?.t === row.t) {
            deduplicated[deduplicated.length - 1] = row;
            duplicates += 1;
            continue;
        }
        const previous = deduplicated.at(-1);
        if (previous && row.t - previous.t > MINUTE && row.t - previous.t < 2 * DAY) unexpectedGaps += 1;
        deduplicated.push(row);
    }
    if (!deduplicated.length) throw new Error(`${path.basename(filePath)} has no M1 rows in the requested range.`);
    return {
        rows: deduplicated,
        audit: {
            sourceRows,
            rows: deduplicated.length,
            malformed,
            duplicates,
            unexpectedGaps,
            first: new Date(deduplicated[0].t).toISOString(),
            last: new Date(deduplicated.at(-1).t).toISOString(),
            sha256: sha256File(filePath),
        },
    };
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

function adjustedBar(row, spreadMultiplier) {
    const ask = (key) => row[key] + (row[`ask${key[0].toUpperCase()}${key.slice(1)}`] - row[key]) * spreadMultiplier;
    return {
        ...row,
        askOpen: ask("open"),
        askHigh: ask("high"),
        askLow: ask("low"),
        askClose: ask("close"),
    };
}

function candidateAllows(event, candidate, spreadMultiplier) {
    if (event.symbol !== candidate.symbol || event.session !== candidate.session) return false;
    if (candidate.directionMode === "buy" && event.side !== "BUY") return false;
    if (candidate.directionMode === "sell" && event.side !== "SELL") return false;
    if (event.spreadAtr * spreadMultiplier > candidate.maxSpreadAtr) return false;
    if (event.atrPercentile < candidate.minAtrPercentile || event.atrPercentile > candidate.maxAtrPercentile) return false;
    if (event.efficiency < candidate.minEfficiency || event.activity < candidate.minActivity) return false;
    if (event.bodyRatio < candidate.minBodyRatio || event.bodyAtr < candidate.minBodyAtr) return false;
    if (candidate.minVolumeRatio > 0 && event.volumeRatio < candidate.minVolumeRatio) return false;
    if (candidate.structureMode === "continuation") {
        const setup = event.continuation;
        if (!setup || setup.impulseAtr < candidate.minImpulseAtr || setup.swingGapAtr < candidate.minSwingGapAtr || setup.retrace > candidate.maxRetrace) return false;
    }
    if (candidate.indicatorMode === "score" && event.indicatorScore < candidate.minIndicatorScore) return false;
    if (candidate.indicatorMode === "bollinger" && !(event.bollinger || event.bollingerRoom >= candidate.minBollingerRoomAtr)) return false;
    if (candidate.indicatorMode === "rsi" && !event.rsi) return false;
    if (candidate.indicatorMode === "volume" && !event.volume) return false;
    if (candidate.h1Bars > 0) {
        const move = event.h1Moves[candidate.h1Bars];
        if (!Number.isFinite(move) || (event.side === "BUY" ? move < candidate.minH1MoveAtr : move > -candidate.minH1MoveAtr)) return false;
    }
    return true;
}

function buildSignals(prepared, profiles, spreadMultiplier) {
    const signals = [];
    for (const profile of profiles) {
        const candidate = profile.candidate;
        const rows = prepared.data.get(candidate.symbol).M15;
        const events = prepared.eventsByKey.get(`${candidate.symbol}:${candidate.session}`) ?? [];
        for (const event of events) {
            if (!candidateAllows(event, candidate, spreadMultiplier)) continue;
            const signal = rows[event.rowIndex];
            const signalSpread = (signal.askClose - signal.close) * spreadMultiplier;
            const signalHighWithSpread = signal.high + signalSpread;
            const entryMode = candidate.entryMode ?? "stop";
            const entry = entryMode === "limit"
                ? event.side === "BUY"
                    ? signal.askClose - event.atr * Number(candidate.limitRetraceAtr ?? 0)
                    : signal.close + event.atr * Number(candidate.limitRetraceAtr ?? 0)
                : event.side === "BUY"
                    ? signalHighWithSpread + event.atr * candidate.entryOffsetAtr
                    : signal.low - event.atr * candidate.entryOffsetAtr;
            const stop = event.side === "BUY"
                ? signal.low - event.atr * candidate.stopBufferAtr
                : signalHighWithSpread + event.atr * candidate.stopBufferAtr;
            if (!(event.side === "BUY" ? stop < entry : stop > entry)) continue;
            signals.push({
                symbol: candidate.symbol,
                session: candidate.session,
                side: event.side,
                t: signal.t + M15,
                signalAt: signal.t + M15,
                signalCandle: signal.t,
                entry: roundPrice(entry, candidate.symbol),
                stop: roundPrice(stop, candidate.symbol),
                signalAtr: event.atr,
                activity: event.activity,
                candidate,
                priority: event.indicatorScore + event.efficiency + event.volumeRatio - event.spreadAtr * spreadMultiplier,
                fold: event.fold,
            });
        }
    }
    signals.sort((left, right) => left.t - right.t || right.priority - left.priority || left.symbol.localeCompare(right.symbol));
    return signals;
}

function quotePerEur(symbol, timestamp, minuteRows) {
    const quote = symbol.slice(3, 6);
    if (quote === "EUR") return 1;
    const mid = (pair) => {
        const row = atOrBefore(minuteRows.get(pair) ?? [], timestamp);
        return row ? (row.close + row.askClose) / 2 : null;
    };
    const direct = mid(`EUR${quote}`);
    if (direct > 0) return direct;
    const inverse = mid(`${quote}EUR`);
    if (inverse > 0) return 1 / inverse;
    const eurUsd = mid("EURUSD");
    if (!(eurUsd > 0)) return null;
    if (quote === "USD") return eurUsd;
    const usdQuote = mid(`USD${quote}`);
    if (usdQuote > 0) return eurUsd * usdQuote;
    const quoteUsd = mid(`${quote}USD`);
    if (quoteUsd > 0) return eurUsd / quoteUsd;
    return null;
}

function foldBounds(start, endExclusive) {
    const span = endExclusive - start;
    return [start + span / 3, start + (2 * span) / 3];
}

function foldFor(timestamp, bounds) {
    return timestamp < bounds[0] ? "early" : timestamp < bounds[1] ? "middle" : "recent";
}

function statsForTrades(trades, startBalance, finalBalance, maxDrawdownPct) {
    const wins = trades.filter((trade) => trade.pnlEur > 0);
    const losses = trades.filter((trade) => trade.pnlEur < 0);
    const grossWin = wins.reduce((sum, trade) => sum + trade.pnlEur, 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnlEur, 0));
    const risks = trades.map((trade) => trade.effectiveRiskPct).sort((left, right) => left - right);
    const percentile = (fraction) => risks.length ? risks[Math.min(risks.length - 1, Math.floor((risks.length - 1) * fraction))] : 0;
    return {
        entries: trades.length,
        wins: wins.length,
        losses: losses.length,
        breakeven: trades.length - wins.length - losses.length,
        winRate: trades.length ? +(100 * wins.length / trades.length).toFixed(2) : 0,
        profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(3) : grossWin > 0 ? 10 : 0,
        totalR: +trades.reduce((sum, trade) => sum + trade.r, 0).toFixed(3),
        finalBalance: +finalBalance.toFixed(2),
        pnl: +(finalBalance - startBalance).toFixed(2),
        returnPct: +(100 * (finalBalance - startBalance) / startBalance).toFixed(2),
        maxDrawdownPct: +maxDrawdownPct.toFixed(2),
        effectiveRiskPct: {
            average: trades.length ? +(risks.reduce((sum, value) => sum + value, 0) / trades.length).toFixed(3) : 0,
            median: +percentile(0.5).toFixed(3),
            p90: +percentile(0.9).toFixed(3),
            max: +(risks.at(-1) ?? 0).toFixed(3),
        },
    };
}

function isoWeek(timestamp) {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
    const weekYear = date.getUTCFullYear();
    const weekOne = new Date(Date.UTC(weekYear, 0, 4));
    const week = 1 + Math.round(((date - weekOne) / DAY - 3 + ((weekOne.getUTCDay() + 6) % 7)) / 7);
    return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

function weeklyStatsForTrades(trades, startCapital) {
    const weeks = new Map();
    for (const trade of [...trades].sort((left, right) => Date.parse(left.closed) - Date.parse(right.closed))) {
        const key = isoWeek(trade.closed);
        if (!weeks.has(key)) weeks.set(key, []);
        weeks.get(key).push(trade);
    }
    let balance = startCapital;
    return [...weeks].map(([week, selected]) => {
        const startBalance = balance;
        let peak = balance;
        let maxDrawdownPct = 0;
        for (const trade of selected) {
            balance += trade.pnlEur;
            peak = Math.max(peak, balance);
            maxDrawdownPct = Math.max(maxDrawdownPct, 100 * (peak - balance) / Math.max(peak, Number.EPSILON));
        }
        const stats = statsForTrades(selected, startBalance, balance, maxDrawdownPct);
        return {
            week,
            startBalance: +startBalance.toFixed(2),
            endBalance: +balance.toFixed(2),
            pnl: stats.pnl,
            returnPct: stats.returnPct,
            entries: stats.entries,
            wins: stats.wins,
            losses: stats.losses,
            winRate: stats.winRate,
            profitFactor: stats.profitFactor,
            totalR: stats.totalR,
            maxDrawdownPct: stats.maxDrawdownPct,
            averageRiskPct: stats.effectiveRiskPct.average,
        };
    });
}

function simulatePortfolio({ prepared, signals, minuteRows, symbols, marketRules, slots, cadenceMinutes, spreadMultiplier, startCapital = 500, targetRiskPct = 0.03, cooldownMinutes = 0, pendingInvalidation = true, placementBufferSpreads = 1, riskMode = "fixed", currencyExposureMode = "none" }) {
    let balance = startCapital;
    let peak = balance;
    let maxDrawdownPct = 0;
    let maximumOccupied = 0;
    let maximumMarginPct = 0;
    let sequence = 1;
    const pending = [];
    const positions = [];
    const trades = [];
    const cooldownUntil = new Map();
    const dailyPnl = new Map();
    const weeklyPnl = new Map();
    const rejections = new Map();
    const orders = { signals: signals.length, placed: 0, rebased: 0, filled: 0, invalidated: 0, ambiguousInvalidation: 0, expired: 0, behindMarket: 0, sizing: 0, portfolioFull: 0, occupied: 0, currencyExposure: 0 };
    const reasons = new Map();
    const foldBoundsValue = foldBounds(prepared.start, prepared.endExclusive);
    let signalIndex = 0;
    const pointers = new Map(symbols.map((symbol) => [symbol, 0]));

    const occupiedSymbols = () => new Set([...pending, ...positions].map((item) => item.symbol));
    const reservedMargin = () => [...pending, ...positions].reduce((sum, item) => sum + item.margin * (item.remainingSize / item.initialSize), 0);
    const auditExposure = () => {
        maximumOccupied = Math.max(maximumOccupied, pending.length + positions.length);
        maximumMarginPct = Math.max(maximumMarginPct, 100 * reservedMargin() / Math.max(balance, Number.EPSILON));
    };
    const reject = (reason) => {
        increment(rejections, reason);
        if (Object.prototype.hasOwnProperty.call(orders, reason)) orders[reason] += 1;
    };
    const updateBalance = (pnl) => {
        balance += pnl;
        peak = Math.max(peak, balance);
        maxDrawdownPct = Math.max(maxDrawdownPct, 100 * (peak - balance) / Math.max(peak, Number.EPSILON));
    };
    const weekStart = (timestamp) => {
        const date = new Date(timestamp);
        date.setUTCHours(0, 0, 0, 0);
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
        return date.getTime();
    };
    const realize = (position, size, exitPrice, timestamp) => {
        const conversion = quotePerEur(position.symbol, timestamp, minuteRows) ?? position.quotePerEur;
        const pnlQuote = position.side === "BUY" ? size * (exitPrice - position.entry) : size * (position.entry - exitPrice);
        const pnl = pnlQuote / conversion;
        position.realizedPnl += pnl;
        position.remainingSize -= size;
        updateBalance(pnl);
    };
    const close = (position, timestamp, exitPrice, reason) => {
        if (position.remainingSize > 0) realize(position, position.remainingSize, exitPrice, timestamp);
        positions.splice(positions.indexOf(position), 1);
        const initialRisk = position.actualRiskEur > 0 ? position.actualRiskEur : position.plannedRiskEur;
        trades.push({
            id: position.id,
            symbol: position.symbol,
            session: position.session,
            side: position.side,
            signalAt: new Date(position.signalAt).toISOString(),
            signalCandle: new Date(position.signalCandle).toISOString(),
            opened: new Date(position.opened).toISOString(),
            closed: new Date(timestamp).toISOString(),
            entry: position.entry,
            initialStop: position.initialStop,
            exit: exitPrice,
            size: position.initialSize,
            effectiveRiskPct: 100 * initialRisk / position.balanceAtOrder,
            marginPct: 100 * position.margin / position.balanceAtOrder,
            pnlEur: position.realizedPnl,
            r: position.realizedPnl / initialRisk,
            reason,
            partialTaken: position.partialTaken,
            breakEvenMoved: position.breakEvenMoved,
            trailingActivated: position.trailingEnabled,
            fold: foldFor(position.signalAt, foldBoundsValue),
        });
        const day = new Date(timestamp).toISOString().slice(0, 10);
        dailyPnl.set(day, (dailyPnl.get(day) ?? 0) + position.realizedPnl);
        const week = weekStart(timestamp);
        weeklyPnl.set(week, (weeklyPnl.get(week) ?? 0) + position.realizedPnl);
        increment(reasons, reason);
        const cooldown = cooldownMinutes ?? Number(position.candidate.cooldownMinutes ?? 0);
        cooldownUntil.set(position.symbol, timestamp + cooldown * MINUTE);
        auditExposure();
    };

    const sizeSignal = (signal) => {
        const conversion = quotePerEur(signal.symbol, signal.t, minuteRows);
        const distance = Math.abs(signal.entry - signal.stop);
        if (!(conversion > 0 && distance > 0 && balance > 0)) return null;
        const rules = marketRules.get(signal.symbol);
        const leverage = rules?.marginFactorUnit === "PERCENTAGE" && rules.marginFactor > 0 ? 100 / rules.marginFactor : null;
        if (!(leverage > 0)) return null;
        const volatilityScale = riskMode === "inverse-atr"
            ? Math.max(0.5, Math.min(1, 1 / Math.max(1, Number(signal.activity ?? 1))))
            : 1;
        const requestedRisk = balance * Math.min(0.03, targetRiskPct) * volatilityScale;
        const riskSized = requestedRisk * conversion / distance;
        const availableMargin = Math.max(0, balance - reservedMargin());
        const maxMargin = Math.min(availableMargin, balance / slots) * 0.9;
        const marginSized = maxMargin * leverage * conversion / signal.entry;
        const sizeStep = 100;
        const minimumSize = Number(rules.minDealSize ?? 100);
        const size = Math.floor(Math.min(riskSized, marginSized) / sizeStep) * sizeStep;
        if (size < minimumSize) return null;
        const margin = size * signal.entry / conversion / leverage;
        const plannedRiskEur = size * distance / conversion;
        if (signal.candidate.exitMode === "partial") {
            const partialSize = Math.floor(size * signal.candidate.partialFraction / 100) * 100;
            if (partialSize < 100 || size - partialSize < 100) return null;
        }
        return { size, margin, plannedRiskEur, quotePerEur: conversion, leverage, marginCapHit: marginSized < riskSized };
    };

    const placeSignals = (timestamp, barsAtTime) => {
        while (signalIndex < signals.length && signals[signalIndex].t < timestamp) {
            reject("missingTimeline");
            signalIndex++;
        }
        while (signalIndex < signals.length && signals[signalIndex].t === timestamp) {
            const signal = signals[signalIndex++];
            const day = new Date(timestamp).toISOString().slice(0, 10);
            const week = weekStart(timestamp);
            const dayProfit = dailyPnl.get(day) ?? 0;
            const weekProfit = weeklyPnl.get(week) ?? 0;
            if (dayProfit <= -(balance - dayProfit) * 0.10) {
                reject("dailyLossLimit");
                continue;
            }
            if (weekProfit <= -(balance - weekProfit) * 0.20) {
                reject("weeklyLossLimit");
                continue;
            }
            const occupied = occupiedSymbols();
            if (occupied.has(signal.symbol)) {
                reject("occupied");
                continue;
            }
            if (occupied.size >= slots) {
                reject("portfolioFull");
                continue;
            }
            if (currencyExposureMode === "no-shared") {
                const signalCurrencies = new Set([signal.symbol.slice(0, 3), signal.symbol.slice(3, 6)]);
                const sharesCurrency = [...pending, ...positions].some((item) => signalCurrencies.has(item.symbol.slice(0, 3)) || signalCurrencies.has(item.symbol.slice(3, 6)));
                if (sharesCurrency) {
                    reject("currencyExposure");
                    continue;
                }
            }
            if (timestamp < (cooldownUntil.get(signal.symbol) ?? -Infinity)) {
                reject("cooldown");
                continue;
            }
            const market = barsAtTime.get(signal.symbol) ?? atOrBefore(minuteRows.get(signal.symbol), timestamp);
            if (!market) {
                reject("missingMarket");
                continue;
            }
            const bar = adjustedBar(market, spreadMultiplier);
            const entryMode = signal.candidate.entryMode ?? "stop";
            const rules = marketRules.get(signal.symbol);
            const tickSize = 10 ** -Number(rules?.decimals ?? (signal.symbol.includes("JPY") ? 3 : 5));
            const placementGap = Math.max(tickSize, (bar.askOpen - bar.open) * placementBufferSpreads);
            const entry = roundPrice(entryMode === "market"
                ? signal.side === "BUY" ? bar.askOpen : bar.open
                : entryMode === "limit"
                    ? signal.side === "BUY" ? Math.min(signal.entry, bar.askOpen - placementGap) : Math.max(signal.entry, bar.open + placementGap)
                    : signal.side === "BUY" ? Math.max(signal.entry, bar.askOpen + placementGap) : Math.min(signal.entry, bar.open - placementGap), signal.symbol);
            const brokerSideValid = entryMode === "limit"
                ? signal.side === "BUY" ? entry < bar.askOpen : entry > bar.open
                : signal.side === "BUY" ? entry > bar.askOpen : entry < bar.open;
            if (entryMode !== "market" && !brokerSideValid) {
                reject("behindMarket");
                continue;
            }
            if (entry !== signal.entry) orders.rebased += 1;
            const placedSignal = { ...signal, entry };
            const reference = entryMode === "market" ? entry : placedSignal.entry;
            const minimumDistance = reference * Number(rules?.minDistancePct ?? 0) / 100;
            const plannedDistance = Math.abs(placedSignal.entry - placedSignal.stop);
            const targetR = signal.candidate.exitMode === "fixed" ? signal.candidate.targetR : signal.candidate.partialAtR;
            const target = roundPrice(signal.side === "BUY" ? placedSignal.entry + plannedDistance * targetR : placedSignal.entry - plannedDistance * targetR, signal.symbol);
            const protectionValid = signal.side === "BUY"
                ? placedSignal.stop < reference && reference - placedSignal.stop >= minimumDistance && target > reference && target - reference >= minimumDistance
                : placedSignal.stop > reference && placedSignal.stop - reference >= minimumDistance && target < reference && reference - target >= minimumDistance;
            if (!protectionValid) {
                reject("brokerProtection");
                continue;
            }
            const sizing = sizeSignal(placedSignal);
            if (!sizing) {
                reject("sizing");
                continue;
            }
            const partialSize = signal.candidate.exitMode === "partial"
                ? Math.floor(sizing.size * signal.candidate.partialFraction / 100) * 100
                : 0;
            pending.push({
                ...placedSignal,
                id: sequence++,
                initialSize: sizing.size,
                remainingSize: sizing.size,
                partialSize,
                entryMode,
                target,
                expiresAt: timestamp + Number(signal.candidate.expiryMinutes) * MINUTE,
                balanceAtOrder: balance,
                ...sizing,
            });
            orders.placed += 1;
            auditExposure();
        }
    };

    const closeForScheduledFlat = (timestamp, barsAtTime) => {
        const date = new Date(timestamp);
        const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
        const fridayClose = date.getUTCDay() === 5 && minute >= 20 * 60;
        const dailyClose = minute >= 22 * 60;
        if (!fridayClose && !dailyClose) return;
        for (const order of [...pending]) {
            pending.splice(pending.indexOf(order), 1);
            increment(reasons, fridayClose ? "weekend_order_cancel" : "daily_order_cancel");
        }
        for (const position of [...positions]) {
            const source = barsAtTime.get(position.symbol);
            if (!source) continue;
            const bar = adjustedBar(source, spreadMultiplier);
            close(position, timestamp, position.side === "BUY" ? bar.open : bar.askOpen, fridayClose ? "weekend_flat" : "daily_flat");
        }
    };

    const processBar = (position, rawBar) => {
        const bar = adjustedBar(rawBar, spreadMultiplier);
        const closeTime = bar.t + MINUTE;
        const stop = position.activeStop;
        const stopTouched = position.side === "BUY" ? bar.low <= stop : bar.askHigh >= stop;
        if (stopTouched) {
            const exit = position.side === "BUY" ? Math.min(stop, bar.open) : Math.max(stop, bar.askOpen);
            close(position, closeTime, exit, position.trailingEnabled ? "trailing_stop" : position.breakEvenMoved ? "break_even" : "stop_loss");
            return;
        }

        if (position.candidate.exitMode === "fixed") {
            const targetTouched = position.side === "BUY" ? bar.high >= position.target : bar.askLow <= position.target;
            if (targetTouched) {
                close(position, closeTime, position.target, "take_profit");
                return;
            }
        } else if (!position.partialTaken) {
            const partialTouched = position.side === "BUY" ? bar.high >= position.target : bar.askLow <= position.target;
            if (partialTouched) {
                realize(position, position.partialSize, position.target, closeTime);
                position.partialTaken = true;
            }
        }

        if (position.trailingEnabled) {
            const proposed = position.side === "BUY" ? bar.high - position.trailingDistance : bar.askLow + position.trailingDistance;
            const nextStop = position.side === "BUY" ? Math.max(position.activeStop, proposed) : Math.min(position.activeStop, proposed);
            const newlyTouched = position.side === "BUY" ? bar.low <= nextStop : bar.askHigh >= nextStop;
            position.activeStop = nextStop;
            if (newlyTouched) {
                close(position, closeTime, nextStop, "trailing_stop");
                return;
            }
        }

        if (closeTime >= position.opened + Number(position.candidate.maxHoldMinutes) * MINUTE) {
            close(position, closeTime, position.side === "BUY" ? bar.close : bar.askClose, "max_hold");
            return;
        }
        if (closeTime % (cadenceMinutes * MINUTE) !== 0) return;

        const current = position.side === "BUY" ? bar.close : bar.askClose;
        const favorable = position.side === "BUY" ? current - position.entry : position.entry - current;
        const distance = position.initialDistance;
        if (position.candidate.exitMode === "partial") {
            if (favorable < distance * Number(position.candidate.partialAtR)) return;
            if (!position.breakEvenMoved) {
                position.activeStop = position.entry;
                position.breakEvenMoved = true;
            }
            if (!position.trailingEnabled) {
                const trailingDistance = position.signalAtr * Number(position.candidate.trailAtr);
                if (favorable >= trailingDistance) {
                    position.trailingEnabled = true;
                    position.trailingDistance = trailingDistance;
                    position.activeStop = position.side === "BUY"
                        ? Math.max(position.activeStop, current - trailingDistance)
                        : Math.min(position.activeStop, current + trailingDistance);
                }
            }
            return;
        }

        const breakEvenAtR = number(position.candidate.breakEvenAtR);
        if (!position.breakEvenMoved && breakEvenAtR !== null && favorable >= distance * breakEvenAtR) {
            position.activeStop = position.entry;
            position.breakEvenMoved = true;
        }
        const activationR = number(position.candidate.trailActivationR);
        const distanceR = number(position.candidate.trailDistanceR);
        if (!position.trailingEnabled && activationR !== null && distanceR !== null && favorable >= distance * activationR) {
            position.trailingEnabled = true;
            position.trailingDistance = distance * Math.min(distanceR, activationR);
            position.activeStop = position.side === "BUY"
                ? Math.max(position.activeStop, current - position.trailingDistance)
                : Math.min(position.activeStop, current + position.trailingDistance);
        }
    };

    while (true) {
        let timestamp = Infinity;
        for (const symbol of symbols) {
            const row = minuteRows.get(symbol)[pointers.get(symbol)];
            if (row) timestamp = Math.min(timestamp, row.t);
        }
        if (!Number.isFinite(timestamp) || timestamp >= prepared.endExclusive) break;
        const barsAtTime = new Map();
        for (const symbol of symbols) {
            const index = pointers.get(symbol);
            const row = minuteRows.get(symbol)[index];
            if (row?.t === timestamp) {
                barsAtTime.set(symbol, row);
                pointers.set(symbol, index + 1);
            }
        }

        closeForScheduledFlat(timestamp, barsAtTime);
        for (const order of [...pending]) {
            if (timestamp < order.expiresAt) continue;
            pending.splice(pending.indexOf(order), 1);
            orders.expired += 1;
        }
        placeSignals(timestamp, barsAtTime);

        for (const order of [...pending]) {
            const source = barsAtTime.get(order.symbol);
            if (!source) continue;
            const bar = adjustedBar(source, spreadMultiplier);
            const invalidated = order.side === "BUY" ? bar.low <= order.stop : bar.askHigh >= order.stop;
            const touched = order.entryMode === "market"
                || (order.entryMode === "limit"
                    ? order.side === "BUY" ? bar.askLow <= order.entry : bar.high >= order.entry
                    : order.side === "BUY" ? bar.askHigh >= order.entry : bar.low <= order.entry);
            if (order.entryMode !== "market" && pendingInvalidation && invalidated && !touched) {
                pending.splice(pending.indexOf(order), 1);
                orders.invalidated += 1;
                increment(reasons, "pending_invalidated");
                continue;
            }
            if (order.entryMode !== "market" && pendingInvalidation && invalidated && touched) orders.ambiguousInvalidation += 1;
            if (!touched) continue;
            const fill = order.entryMode === "market"
                ? (order.side === "BUY" ? bar.askOpen : bar.open)
                : order.entryMode === "limit"
                    ? (order.side === "BUY" ? Math.min(order.entry, bar.askOpen) : Math.max(order.entry, bar.open))
                    : (order.side === "BUY" ? Math.max(order.entry, bar.askOpen) : Math.min(order.entry, bar.open));
            pending.splice(pending.indexOf(order), 1);
            const initialDistance = Math.abs(fill - order.stop);
            const actualRiskEur = order.initialSize * initialDistance / order.quotePerEur;
            const plannedDistance = Math.abs(order.entry - order.stop);
            positions.push({
                ...order,
                opened: timestamp,
                entry: fill,
                initialStop: order.stop,
                activeStop: order.stop,
                initialDistance,
                actualRiskEur,
                target: order.target,
                realizedPnl: 0,
                partialTaken: false,
                breakEvenMoved: false,
                trailingEnabled: false,
                trailingDistance: null,
            });
            orders.filled += 1;
            auditExposure();
        }

        for (const position of [...positions]) {
            const bar = barsAtTime.get(position.symbol);
            if (bar && position.opened <= timestamp) processBar(position, bar);
        }
    }

    for (const position of [...positions]) {
        const raw = atOrBefore(minuteRows.get(position.symbol), prepared.endExclusive - 1);
        if (!raw) continue;
        const bar = adjustedBar(raw, spreadMultiplier);
        close(position, Math.min(prepared.endExclusive, raw.t + MINUTE), position.side === "BUY" ? bar.close : bar.askClose, "end_of_data");
    }
    orders.expired += pending.length;
    pending.length = 0;

    const folds = Object.fromEntries(["early", "middle", "recent"].map((fold) => {
        const selected = trades.filter((trade) => trade.fold === fold);
        const pnl = selected.reduce((sum, trade) => sum + trade.pnlEur, 0);
        const grossWin = selected.filter((trade) => trade.pnlEur > 0).reduce((sum, trade) => sum + trade.pnlEur, 0);
        const grossLoss = Math.abs(selected.filter((trade) => trade.pnlEur < 0).reduce((sum, trade) => sum + trade.pnlEur, 0));
        return [fold, { entries: selected.length, pnl: +pnl.toFixed(2), totalR: +selected.reduce((sum, trade) => sum + trade.r, 0).toFixed(3), profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(3) : grossWin > 0 ? 10 : 0 }];
    }));
    const stats = statsForTrades(trades, startCapital, balance, maxDrawdownPct);
    return {
        slots,
        cadenceMinutes,
        cooldownMinutes,
        pendingInvalidation,
        placementBufferSpreads,
        riskMode,
        currencyExposureMode,
        spreadMultiplier,
        targetRiskPct: 100 * targetRiskPct,
        ...stats,
        folds,
        maximumOccupied,
        maximumMarginPct: +maximumMarginPct.toFixed(2),
        marginCapRatePct: orders.placed ? +(100 * trades.filter((trade) => trade.effectiveRiskPct + 1e-9 < 100 * targetRiskPct).length / orders.filled).toFixed(2) : 0,
        orders,
        rejections: Object.fromEntries([...rejections].sort()),
        exitReasons: Object.fromEntries([...reasons].sort()),
        weeklyStats: weeklyStatsForTrades(trades, startCapital),
        sessionStats: Object.fromEntries(["asia", "london", "overlap", "newYork"].map((session) => [session, statsForTrades(trades.filter((trade) => trade.session === session), startCapital, startCapital + trades.filter((trade) => trade.session === session).reduce((sum, trade) => sum + trade.pnlEur, 0), 0)])),
        symbolStats: Object.fromEntries(symbols.map((symbol) => [symbol, statsForTrades(trades.filter((trade) => trade.symbol === symbol), startCapital, startCapital + trades.filter((trade) => trade.symbol === symbol).reduce((sum, trade) => sum + trade.pnlEur, 0), 0)])),
        trades,
    };
}

function robustRank(nominal, stress) {
    const foldFloor = Math.min(...Object.values(stress.folds).map((fold) => fold.totalR));
    return 4 * stress.returnPct + 2 * nominal.returnPct + 0.5 * foldFloor - 2 * stress.maxDrawdownPct;
}

export async function runTrailingSlotsStudy(options) {
    const datasetDir = path.resolve(options.datasetDir);
    const sourcePath = path.resolve(options.sourcePath);
    const rulesPath = path.resolve(options.rulesPath ?? DEFAULT_RULES_PATH);
    const startCapital = Number(options.startCapital ?? 500);
    if (!(startCapital > 0)) throw new Error(`Invalid start capital: ${options.startCapital}`);
    const targetRiskPct = Number(options.targetRiskPct ?? 3) / 100;
    if (!(targetRiskPct > 0 && targetRiskPct <= 0.03)) throw new Error(`Invalid target risk percent: ${options.targetRiskPct}`);
    const cooldownMinutes = options.cooldownMinutes == null ? 0 : Number(options.cooldownMinutes);
    if (cooldownMinutes !== null && !(cooldownMinutes >= 0)) throw new Error(`Invalid cooldown minutes: ${options.cooldownMinutes}`);
    const pendingInvalidation = options.pendingInvalidation !== false;
    const placementBufferSpreads = Number(options.placementBufferSpreads ?? 1);
    if (!(placementBufferSpreads > 0)) throw new Error(`Invalid placement buffer in spreads: ${options.placementBufferSpreads}`);
    const asNumbers = (value, defaults) => value == null
        ? defaults
        : String(value).split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
    const slotCounts = asNumbers(options.slots, [1, 2, 3, 4, 5]);
    const cadences = asNumbers(options.cadenceMinutes, [1]);
    const asStrings = (value, defaults) => value == null ? defaults : String(value).split(",").map((item) => item.trim()).filter(Boolean);
    const riskModes = asStrings(options.riskModes, ["fixed"]);
    const currencyExposureModes = asStrings(options.currencyExposureModes, ["none"]);
    if (slotCounts.some((value) => !SLOT_COUNTS.includes(value))) throw new Error(`Invalid slots: ${options.slots}`);
    if (cadences.some((value) => !CADENCES.includes(value))) throw new Error(`Invalid cadence: ${options.cadenceMinutes}`);
    if (riskModes.some((value) => !["fixed", "inverse-atr"].includes(value))) throw new Error(`Invalid risk mode: ${options.riskModes}`);
    if (currencyExposureModes.some((value) => !["none", "no-shared"].includes(value))) throw new Error(`Invalid currency exposure mode: ${options.currencyExposureModes}`);
    const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    const sourceProfiles = source.profiles ?? Object.values(source.sessionPools ?? {}).flat();
    const profiles = sourceProfiles.filter((item) => item?.candidate);
    if (!profiles.length) throw new Error("The frozen source contains no profiles.");
    const symbols = [...new Set(profiles.map((item) => item.candidate.symbol))].sort();
    const prepared = prepareSessionProfileSearch(datasetDir, symbols, { from: options.from, to: options.to });
    const rulesDocument = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
    const marketRules = new Map(Object.entries(rulesDocument.symbols ?? {}));
    const missingRules = symbols.filter((symbol) => !marketRules.has(symbol));
    if (missingRules.length) throw new Error(`Missing broker market rules: ${missingRules.join(", ")}`);

    const minuteRows = new Map();
    const coverage = {};
    const availableMinuteSymbols = discoverSymbols(datasetDir).filter((symbol) => fs.existsSync(path.join(datasetDir, `${symbol}_M1.jsonl`)));
    const availableMinuteSet = new Set(availableMinuteSymbols);
    const requiredMinuteSymbols = new Set(symbols);
    for (const symbol of symbols) {
        const quote = symbol.slice(3, 6);
        for (const conversion of [`EUR${quote}`, `${quote}EUR`, "EURUSD", `USD${quote}`, `${quote}USD`]) {
            if (availableMinuteSet.has(conversion)) requiredMinuteSymbols.add(conversion);
        }
    }
    for (const symbol of [...requiredMinuteSymbols].sort()) {
        const loaded = await loadMinuteRows(path.join(datasetDir, `${symbol}_M1.jsonl`), prepared.start, prepared.endExclusive);
        minuteRows.set(symbol, loaded.rows);
        coverage[symbol] = loaded.audit;
        console.log(`M1 loaded ${symbol}: ${loaded.rows.length} rows`);
    }

    prepared.endExclusive = Math.min(
        prepared.endExclusive,
        ...symbols.map((symbol) => minuteRows.get(symbol).at(-1).t + MINUTE),
    );

    const signalsBySpread = new Map([1, 1.25].map((spreadMultiplier) => [spreadMultiplier, buildSignals(prepared, profiles, spreadMultiplier)]));
    const variants = [];
    for (const slots of slotCounts) {
        for (const cadenceMinutes of cadences) {
            for (const riskMode of riskModes) {
                for (const currencyExposureMode of currencyExposureModes) {
                    for (const spreadMultiplier of [1, 1.25]) {
                        const result = simulatePortfolio({ prepared, signals: signalsBySpread.get(spreadMultiplier), minuteRows, symbols, marketRules, slots, cadenceMinutes, spreadMultiplier, startCapital, targetRiskPct, cooldownMinutes, pendingInvalidation, placementBufferSpreads, riskMode, currencyExposureMode });
                        variants.push(result);
                        console.log(`slots=${slots} cadence=M${cadenceMinutes} risk=${riskMode} exposure=${currencyExposureMode} spread=x${spreadMultiplier}: balance=${result.finalBalance} DD=${result.maxDrawdownPct}% risk=${result.effectiveRiskPct.average}%`);
                    }
                }
            }
        }
    }
    const nominal = variants.filter((item) => item.spreadMultiplier === 1);
    const ranked = nominal.map((item) => {
        const stress = variants.find((candidate) => candidate.slots === item.slots && candidate.cadenceMinutes === item.cadenceMinutes && candidate.riskMode === item.riskMode && candidate.currencyExposureMode === item.currencyExposureMode && candidate.spreadMultiplier === 1.25);
        return { slots: item.slots, cadenceMinutes: item.cadenceMinutes, riskMode: item.riskMode, currencyExposureMode: item.currencyExposureMode, score: +robustRank(item, stress).toFixed(3), nominal: item, stress };
    }).sort((left, right) => right.score - left.score);

    return {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        evaluator: {
            runnerSha256: sha256File(fileURLToPath(import.meta.url)),
            prepareSha256: sha256File(path.join(path.dirname(fileURLToPath(import.meta.url)), "prepare.js")),
        },
        protocol: {
            profiles: `${profiles.length} frozen pair/session profiles across ${symbols.length} symbols`,
            signal: "one decision per fully closed M15 candle; no daily or session entry caps; same-timestamp quality ordering",
            execution: `historical broker bid/ask M1; pending entry rebased at the first post-signal quote by at least ${placementBufferSpreads} current spread(s); broker minimum protection filter; SL-first intraminute ambiguity`,
            risk: `EUR ${startCapital} start; target ${100 * targetRiskPct}% per trade; actual risk constrained by 90% margin utilization, slot budget, leverage and 100-unit rounding`,
            portfolio: `one occupied order/position per symbol; ${cooldownMinutes}-minute cooldown; global 10% daily and 20% weekly loss breakers; slots ${slotCounts.join(",")}; currency exposure ${currencyExposureModes.join(",")}`,
            trailing: "activation/BE checked at the selected monitor cadence; broker-native trailing then approximated continuously with M1 extremes",
            pendingInvalidation: pendingInvalidation
                ? "enabled; M1 high/low cancels stop-only touches; simultaneous entry/stop touch resolves conservatively as fill then stop-loss"
                : "disabled for an explicit ablation only",
            stress: "historical ask spread widened by 25%",
        },
        source: { path: sourcePath, sha256: crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex") },
        brokerRules: { path: rulesPath, sha256: crypto.createHash("sha256").update(fs.readFileSync(rulesPath)).digest("hex"), generatedAt: rulesDocument.generatedAt },
        dataset: {
            directory: datasetDir,
            fingerprint: prepared.datasetFingerprint,
            start: new Date(prepared.start).toISOString(),
            endExclusive: new Date(prepared.endExclusive).toISOString(),
            marketDays: prepared.marketDays,
            minuteCoverage: coverage,
        },
        signals: Object.fromEntries([...signalsBySpread].map(([spread, signals]) => [`x${spread}`, signals.length])),
        ranking: ranked.map(({ slots, cadenceMinutes, riskMode, currencyExposureMode, score, nominal: item, stress }) => ({
            slots,
            cadenceMinutes,
            riskMode,
            currencyExposureMode,
            score,
            nominal: { finalBalance: item.finalBalance, returnPct: item.returnPct, maxDrawdownPct: item.maxDrawdownPct, entries: item.entries, profitFactor: item.profitFactor, effectiveRiskPct: item.effectiveRiskPct, folds: item.folds },
            stress: { finalBalance: stress.finalBalance, returnPct: stress.returnPct, maxDrawdownPct: stress.maxDrawdownPct, entries: stress.entries, profitFactor: stress.profitFactor, effectiveRiskPct: stress.effectiveRiskPct, folds: stress.folds },
        })),
        variants: variants.map((variant) => options.includeTrades ? variant : Object.fromEntries(Object.entries(variant).filter(([key]) => key !== "trades"))),
        limitations: [
            "This is inspected development evidence, not a fresh holdout; slot/cadence selection is post-hoc and must be forward validated.",
            "Broker tick order inside each M1 candle is unavailable; ambiguous stop/target/trailing paths use a conservative stop-first rule.",
            "The first post-signal M1 open proxies the live placement snapshot; exact sub-minute analysis and request latency are unavailable historically.",
            "Current account-specific broker margin factors, minimum size and minimum distance are enforced; their historical changes and transient rejections are unavailable.",
            "Financing, swaps and transient broker minimum-distance changes are not modeled.",
        ],
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.dataset || !args.source) {
        console.log("Usage: node lab/autoresearch/trailing-slots.js --dataset <dir> --source <frozen-report.json> [--rules <broker-rules.json>] [--report <output.json>] [--capital <eur>] [--risk-pct <1..3>] [--slots <csv:1..7>] [--cadence <csv:1|5|15>] [--risk-modes <fixed,inverse-atr>] [--currency-exposure <none,no-shared>] [--placement-buffer-spreads <number>] [--cooldown-minutes <minutes>] [--no-pending-invalidation] [--from <iso>] [--to <iso>]");
        process.exitCode = 1;
        return;
    }
    const report = await runTrailingSlotsStudy({ datasetDir: args.dataset, sourcePath: args.source, rulesPath: args.rules, startCapital: args.capital, targetRiskPct: args["risk-pct"], slots: args.slots, cadenceMinutes: args.cadence, riskModes: args["risk-modes"], currencyExposureModes: args["currency-exposure"], placementBufferSpreads: args["placement-buffer-spreads"], cooldownMinutes: args["cooldown-minutes"], pendingInvalidation: args["no-pending-invalidation"] ? false : true, from: args.from, to: args.to, includeTrades: Boolean(args["include-trades"]) });
    const reportPath = path.resolve(args.report || path.join("lab", "autoresearch", "reports", `trailing-slots-${new Date().toISOString().slice(0, 10)}.json`));
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ reportPath, best: report.ranking[0], signals: report.signals }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch((error) => {
        console.error(error?.stack || error?.message || String(error));
        process.exitCode = 1;
    });
}
