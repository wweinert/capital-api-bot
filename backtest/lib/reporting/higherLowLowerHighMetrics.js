import { pipSizeForSymbol } from "../strategies/higherLowLowerHigh.js";

function percentile(sortedValues, pct) {
    if (!sortedValues.length) return null;
    const rank = Math.min(sortedValues.length - 1, Math.max(0, (sortedValues.length - 1) * pct));
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    if (low === high) return sortedValues[low];
    const weight = rank - low;
    return sortedValues[low] * (1 - weight) + sortedValues[high] * weight;
}

export function summarizeTrades(trades) {
    let totalR = 0;
    let totalPips = 0;
    let wins = 0;
    let losses = 0;
    let grossWinR = 0;
    let grossLossR = 0;
    let equityR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;

    for (const trade of trades) {
        const pnlR = Number(trade.pnlR || 0);
        totalR += pnlR;
        totalPips += Number(trade.pnlPips || 0);
        equityR += pnlR;
        peakR = Math.max(peakR, equityR);
        maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR);
        if (pnlR > 0) {
            wins += 1;
            grossWinR += pnlR;
        } else if (pnlR < 0) {
            losses += 1;
            grossLossR += Math.abs(pnlR);
        }
    }

    const tradeCount = trades.length;
    return {
        trades: tradeCount,
        wins,
        losses,
        winRate: tradeCount ? wins / tradeCount : null,
        totalR,
        totalPips,
        expectancyR: tradeCount ? totalR / tradeCount : null,
        profitFactor: grossLossR > 0 ? grossWinR / grossLossR : grossWinR > 0 ? Number.POSITIVE_INFINITY : null,
        maxDrawdownR,
    };
}

export function monthlyBreakdown(trades) {
    const buckets = new Map();
    for (const trade of trades) {
        const key = String(trade.entryTimestamp || "").slice(0, 7);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(trade);
    }
    return [...buckets.entries()].map(([month, monthTrades]) => ({
        month,
        ...summarizeTrades(monthTrades),
    }));
}

export function buildStopDistanceStats(trades, symbol, realismStopThresholdPips = 2) {
    const pipSize = pipSizeForSymbol(symbol);
    const distances = trades
        .map((trade) => Number(trade?.riskDistance || 0) / pipSize)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    if (!distances.length) return null;
    return {
        minStopPips: distances[0],
        avgStopPips: distances.reduce((sum, value) => sum + value, 0) / distances.length,
        medianStopPips: percentile(distances, 0.5),
        maxStopPips: distances[distances.length - 1],
        under1Pip: distances.filter((value) => value < 1).length,
        under2Pips: distances.filter((value) => value < 2).length,
        realismStopThresholdPips,
        belowRealismThreshold: Number.isFinite(realismStopThresholdPips)
            ? distances.filter((value) => value < realismStopThresholdPips).length
            : null,
    };
}

export function buildExitReasonDistribution(trades, simulationStats = {}) {
    const distribution = {
        stop: 0,
        takeProfit: 0,
        timeExit: 0,
        endOfData: 0,
        other: 0,
        breakEntryExpired: Number(simulationStats.breakEntryExpiredCount || 0),
        breakEntryInvalidated: Number(simulationStats.breakEntryInvalidatedCount || 0),
        stopBelowMinDistance: Number(simulationStats.stopBelowMinDistanceCount || 0),
    };
    for (const trade of trades) {
        const reason = String(trade?.exitReason || "");
        if (reason.startsWith("stop_loss")) distribution.stop += 1;
        else if (reason === "take_profit") distribution.takeProfit += 1;
        else if (reason.startsWith("time_exit_")) distribution.timeExit += 1;
        else if (reason === "end_of_data") distribution.endOfData += 1;
        else distribution.other += 1;
    }
    return distribution;
}

export function buildRDistribution(trades) {
    const all = trades.map((trade) => Number(trade.pnlR)).filter(Number.isFinite).sort((a, b) => a - b);
    const wins = all.filter((value) => value > 0);
    const losses = all.filter((value) => value < 0);
    if (!all.length) return null;
    return {
        averageR: all.reduce((sum, value) => sum + value, 0) / all.length,
        medianR: percentile(all, 0.5),
        averageWinR: wins.length ? wins.reduce((sum, value) => sum + value, 0) / wins.length : null,
        averageLossR: losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : null,
        p90R: percentile(all, 0.9),
    };
}

export function buildLosingStreakStats(trades) {
    let current = 0;
    let max = 0;
    for (const trade of trades) {
        if (Number(trade.pnlR || 0) < 0) {
            current += 1;
            max = Math.max(max, current);
        } else {
            current = 0;
        }
    }
    return { maxLosingStreak: max };
}

export function buildTradeDiagnostics(trades, { symbol, realismStopThresholdPips = 2, simulationStats = {}, detectorStats = {} } = {}) {
    return {
        stopDistanceDistribution: symbol ? buildStopDistanceStats(trades, symbol, realismStopThresholdPips) : null,
        exitReasonDistribution: buildExitReasonDistribution(trades, simulationStats),
        rDistribution: buildRDistribution(trades),
        losingStreak: buildLosingStreakStats(trades),
        detectorStats,
        simulationStats,
    };
}

export function scoreScenario(summary) {
    const trades = Number(summary?.trades || 0);
    const pf = Number.isFinite(summary?.profitFactor) ? Math.min(summary.profitFactor, 4) : 0;
    const expectancy = Number(summary?.expectancyR || 0);
    const totalR = Number(summary?.totalR || 0);
    const drawdown = Number(summary?.maxDrawdownR || 0);
    const tradePenalty = trades >= 12 ? 0 : (12 - trades) * 0.2;
    return totalR + expectancy * 20 + pf * 2 - drawdown * 0.8 - tradePenalty;
}
