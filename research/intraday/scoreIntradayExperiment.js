export function finiteNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function safeLogGrowth(endCapital, startCapital) {
    const end = finiteNumber(endCapital);
    const start = finiteNumber(startCapital, 500);
    if (!(end > 0 && start > 0)) return -10;
    return Math.log(end / start);
}

function negativeProfitPenalty(metrics = {}) {
    const startCapital = finiteNumber(metrics.startCapital, 500);
    const endCapital = finiteNumber(metrics.endCapital);
    const rawPnl = finiteNumber(metrics.rawPnl);
    if (endCapital > startCapital && rawPnl > 0) return 0;
    return Math.max(120, Math.abs(rawPnl) * 0.75);
}

function tradesBonus(trades) {
    const count = finiteNumber(trades);
    if (count >= 500) return 35;
    if (count >= 250) return 25;
    if (count >= 100) return 14;
    if (count >= 50) return 5;
    if (count >= 25) return 0;
    return -25;
}

function tooFewTradesPenalty(trades) {
    const count = finiteNumber(trades);
    if (count >= 40) return 0;
    return (40 - count) * 3;
}

function unrealisticTradeCountPenalty(metrics = {}) {
    const trades = finiteNumber(metrics.trades);
    const days = Math.max(1, finiteNumber(metrics.days, 90));
    const tradesPerDay = trades / days;
    if (tradesPerDay <= 18) return 0;
    return (tradesPerDay - 18) * 12;
}

export function scoreSet(metrics = {}) {
    const startCapital = finiteNumber(metrics.startCapital, 500);
    const endCapital = finiteNumber(metrics.endCapital);
    const rawPnl = finiteNumber(metrics.rawPnl);
    const profitFactor = finiteNumber(metrics.profitFactor);
    const expectancyR = finiteNumber(metrics.expectancyR);
    const winRate = finiteNumber(metrics.winRate);
    const maxDrawdownPct = finiteNumber(metrics.maxDrawdownPct);
    const trades = finiteNumber(metrics.trades);
    const growth = safeLogGrowth(endCapital, startCapital);
    const neg = negativeProfitPenalty(metrics);
    const tooFew = tooFewTradesPenalty(trades);
    const tooMany = unrealisticTradeCountPenalty(metrics);

    const maxProfit =
        growth * 650 +
        rawPnl / 8 +
        profitFactor * 20 +
        expectancyR * 40 -
        Math.max(0, maxDrawdownPct - 90) * 7 -
        neg -
        tooFew * 0.5 -
        tooMany;

    const aggressiveIntraday =
        growth * 500 +
        rawPnl / 10 +
        profitFactor * 35 +
        expectancyR * 80 +
        winRate * 0.15 +
        tradesBonus(trades) -
        Math.max(0, maxDrawdownPct - 60) * 2 -
        Math.max(0, maxDrawdownPct - 80) * 5 -
        neg -
        tooFew -
        tooMany;

    const profitWithControl =
        growth * 420 +
        rawPnl / 14 +
        profitFactor * 42 +
        expectancyR * 90 +
        tradesBonus(trades) -
        maxDrawdownPct * 0.9 -
        Math.max(0, maxDrawdownPct - 60) * 2.5 -
        neg -
        tooFew -
        tooMany;

    const stable =
        growth * 220 +
        rawPnl / 25 +
        profitFactor * 50 +
        expectancyR * 100 +
        winRate * 0.25 +
        tradesBonus(trades) -
        maxDrawdownPct * 2.2 -
        Math.max(0, maxDrawdownPct - 35) * 3 -
        neg -
        tooFew * 1.5 -
        tooMany;

    return { maxProfit, aggressiveIntraday, profitWithControl, stable };
}

export function scoreIntradayExperiment(metrics = {}, mode = "aggressiveIntraday") {
    const scores = scoreSet(metrics);
    if (mode === "maxProfit") return scores.maxProfit;
    if (mode === "profitWithControl") return scores.profitWithControl;
    if (mode === "stable") return scores.stable;
    return scores.aggressiveIntraday;
}

export function riskFlagsFor(metrics = {}, warnings = []) {
    const flags = [];
    const trades = finiteNumber(metrics.trades);
    const maxDrawdownPct = finiteNumber(metrics.maxDrawdownPct);
    const endCapital = finiteNumber(metrics.endCapital);
    const startCapital = finiteNumber(metrics.startCapital, 500);
    const profitFactor = finiteNumber(metrics.profitFactor);
    const tradesPerDay = trades / Math.max(1, finiteNumber(metrics.days, 90));

    if (endCapital >= startCapital * 10) flags.push("very_interesting");
    else if (endCapital >= startCapital * 6) flags.push("interesting");
    else if (endCapital >= startCapital * 3) flags.push("promising");
    if (trades < 30) flags.push("low_sample");
    else if (trades < 100) flags.push("weak_sample");
    else if (trades >= 250) flags.push("reliability_bonus");
    if (maxDrawdownPct > 90) flags.push("extremely_dangerous");
    else if (maxDrawdownPct > 80) flags.push("very_high_drawdown");
    else if (maxDrawdownPct > 60) flags.push("dangerous");
    else if (maxDrawdownPct > 40) flags.push("elevated_drawdown");
    if (endCapital <= startCapital) flags.push("negative_profit");
    if (profitFactor < 1) flags.push("profit_factor_below_1");
    if (tradesPerDay > 18) flags.push("unrealistic_trade_count_risk");
    for (const warning of warnings) flags.push(warning);
    return [...new Set(flags)];
}

export function rejectionReasonFor(metrics = {}, warnings = []) {
    const reasons = [];
    if (finiteNumber(metrics.trades) < 10) reasons.push("too_few_trades");
    if (finiteNumber(metrics.endCapital) <= 0) reasons.push("capital_destroyed");
    if (warnings.includes("lookahead_risk")) reasons.push("lookahead_risk");
    if (warnings.includes("same_candle_ambiguity_high")) reasons.push("same_candle_ambiguity_high");
    return reasons.join(",");
}
