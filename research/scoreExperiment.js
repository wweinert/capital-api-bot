export function finiteNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function safeLogGrowth(endCapital, startCapital) {
    const end = finiteNumber(endCapital);
    const start = finiteNumber(startCapital, 500);
    if (!(end > 0 && start > 0)) return -10;
    return Math.log(end / start);
}

function tradesQualityBonus(trades) {
    const count = finiteNumber(trades);
    if (count >= 300) return 18;
    if (count >= 200) return 12;
    if (count >= 100) return 6;
    if (count >= 30) return 0;
    return -12;
}

function negativeProfitPenalty(metrics = {}) {
    const startCapital = finiteNumber(metrics.startCapital, 500);
    const endCapital = finiteNumber(metrics.endCapital);
    const rawPnl = finiteNumber(metrics.rawPnl);
    if (endCapital > startCapital && rawPnl > 0) return 0;
    return Math.max(80, Math.abs(rawPnl) / 2);
}

export function robustScore(metrics = {}, penalties = {}) {
    const expectancyR = finiteNumber(metrics.expectancyR);
    const rawProfitFactor = Number(metrics.profitFactor);
    const profitFactor = Number.isFinite(rawProfitFactor) ? clamp(rawProfitFactor, 0, 4) : 0;
    const winRate = finiteNumber(metrics.winRatePct ?? metrics.winRate);
    const maxDrawdownPct = finiteNumber(metrics.maxDrawdownPct);

    const overfitPenalty = finiteNumber(penalties.overfitPenalty);
    const lowTradeCountPenalty = finiteNumber(penalties.lowTradeCountPenalty);
    const symbolConcentrationPenalty = finiteNumber(penalties.symbolConcentrationPenalty);
    const liveReplayMismatchPenalty = finiteNumber(penalties.liveReplayMismatchPenalty);
    const complexityPenalty = finiteNumber(penalties.complexityPenalty);

    return (
        expectancyR * 40 +
        profitFactor * 25 +
        winRate * 0.2 -
        maxDrawdownPct * 2.5 -
        overfitPenalty -
        lowTradeCountPenalty -
        symbolConcentrationPenalty -
        liveReplayMismatchPenalty -
        complexityPenalty
    );
}

export function balancedScore(metrics = {}, penalties = {}) {
    const growth = safeLogGrowth(metrics.endCapital, metrics.startCapital);
    const pf = Number.isFinite(Number(metrics.profitFactor)) ? clamp(Number(metrics.profitFactor), 0, 5) : 0;
    const expectancyR = finiteNumber(metrics.expectancyR);
    const winRate = finiteNumber(metrics.winRatePct ?? metrics.winRate);
    const maxDrawdownPct = finiteNumber(metrics.maxDrawdownPct);
    const rawPnl = finiteNumber(metrics.rawPnl);
    const lowTradePenalty = finiteNumber(metrics.trades) >= 100 ? 0 : Math.max(0, 100 - finiteNumber(metrics.trades)) * 0.35;
    return (
        growth * 180 +
        rawPnl / 10 +
        pf * 22 +
        expectancyR * 45 +
        winRate * 0.15 -
        maxDrawdownPct * 1.2 -
        lowTradePenalty -
        finiteNumber(penalties.complexityPenalty) * 0.5 -
        negativeProfitPenalty(metrics)
    );
}

export function aggressiveScore(metrics = {}, penalties = {}) {
    const startCapital = finiteNumber(metrics.startCapital, 500);
    const endCapital = finiteNumber(metrics.endCapital);
    const maxDrawdownPct = finiteNumber(metrics.maxDrawdownPct);
    const pf = Number.isFinite(Number(metrics.profitFactor)) ? clamp(Number(metrics.profitFactor), 0, 6) : 0;
    const expectancyR = finiteNumber(metrics.expectancyR);
    const winRate = finiteNumber(metrics.winRatePct ?? metrics.winRate);
    const trades = finiteNumber(metrics.trades);
    const lowTradeCountPenalty = trades >= 30 ? 0 : (30 - trades) * 2;
    const destructiveDrawdownPenalty = Math.max(0, maxDrawdownPct - 60) * 1.5 + Math.max(0, maxDrawdownPct - 80) * 4;
    return (
        safeLogGrowth(endCapital, startCapital) * 300 +
        pf * 25 +
        expectancyR * 60 +
        winRate * 0.2 +
        tradesQualityBonus(trades) -
        destructiveDrawdownPenalty -
        lowTradeCountPenalty -
        negativeProfitPenalty(metrics)
    );
}

export function maxProfitScore(metrics = {}) {
    const startCapital = finiteNumber(metrics.startCapital, 500);
    const endCapital = finiteNumber(metrics.endCapital);
    const rawPnl = finiteNumber(metrics.rawPnl);
    const maxDrawdownPct = finiteNumber(metrics.maxDrawdownPct);
    const pf = Number.isFinite(Number(metrics.profitFactor)) ? clamp(Number(metrics.profitFactor), 0, 6) : 0;
    return (
        safeLogGrowth(endCapital, startCapital) * 500 +
        rawPnl / 20 +
        pf * 10 -
        Math.max(0, maxDrawdownPct - 90) * 5 -
        negativeProfitPenalty(metrics)
    );
}

export function scoreExperiment(metrics = {}, penalties = {}, mode = "robust") {
    const normalizedMode = String(mode || "robust").toLowerCase();
    if (normalizedMode === "balanced") return balancedScore(metrics, penalties);
    if (normalizedMode === "aggressive") return aggressiveScore(metrics, penalties);
    if (normalizedMode === "max-profit" || normalizedMode === "max_profit") return maxProfitScore(metrics, penalties);
    return robustScore(metrics, penalties);
}

export function scoreSet(metrics = {}, penalties = {}) {
    return {
        robust: robustScore(metrics, penalties),
        balanced: balancedScore(metrics, penalties),
        aggressive: aggressiveScore(metrics, penalties),
        maxProfit: maxProfitScore(metrics, penalties),
    };
}

export function riskFlagsFor(metrics = {}) {
    const flags = [];
    const trades = finiteNumber(metrics.trades);
    const maxDrawdownPct = finiteNumber(metrics.maxDrawdownPct);
    const endCapital = finiteNumber(metrics.endCapital);
    const startCapital = finiteNumber(metrics.startCapital, 500);
    const profitFactor = Number(metrics.profitFactor);
    if (trades < 30) flags.push("low_sample");
    else if (trades < 100) flags.push("weak_sample");
    else if (trades >= 200) flags.push("reliability_bonus");
    if (maxDrawdownPct > 90) flags.push("extremely_dangerous");
    else if (maxDrawdownPct > 80) flags.push("very_high_drawdown");
    else if (maxDrawdownPct > 60) flags.push("high_drawdown");
    else if (maxDrawdownPct > 40) flags.push("elevated_drawdown");
    if (endCapital <= startCapital) flags.push("negative_profit");
    if (Number.isFinite(profitFactor) && profitFactor < 1) flags.push("profit_factor_below_1");
    return flags;
}

export function buildPenalties({ metrics = {}, symbolCounts = {}, changedKnobs = 0, baselineDelta = null } = {}) {
    const trades = finiteNumber(metrics.trades);
    const symbols = Object.keys(symbolCounts).filter((symbol) => Number(symbolCounts[symbol] || 0) > 0);
    const largestSymbolShare = trades > 0 ? Math.max(0, ...Object.values(symbolCounts).map((count) => Number(count || 0) / trades)) : 0;
    const lowTradeCountPenalty = trades >= 40 ? 0 : (40 - trades) * 1.5;
    const symbolConcentrationPenalty = largestSymbolShare <= 0.55 ? 0 : (largestSymbolShare - 0.55) * 60;
    const complexityPenalty = Math.max(0, changedKnobs) * 0.5;

    let overfitPenalty = 0;
    if (symbols.length < 3) overfitPenalty += 8;
    if (finiteNumber(metrics.trades) < 60 && finiteNumber(metrics.profitFactor) > 2.5) overfitPenalty += 6;
    if (baselineDelta && finiteNumber(baselineDelta.trades) < -20) overfitPenalty += 4;

    return {
        overfitPenalty,
        lowTradeCountPenalty,
        symbolConcentrationPenalty,
        liveReplayMismatchPenalty: 0,
        complexityPenalty,
    };
}

export function rejectionReasonFor(metrics = {}, penalties = {}) {
    const reasons = [];
    if (finiteNumber(metrics.trades) < 20) reasons.push("low_trade_count");
    if (finiteNumber(metrics.maxDrawdownPct) > 35) reasons.push("high_drawdown");
    if (finiteNumber(metrics.expectancyR) <= 0) reasons.push("non_positive_expectancy");
    if (finiteNumber(penalties.symbolConcentrationPenalty) > 0) reasons.push("symbol_concentration");
    if (finiteNumber(penalties.overfitPenalty) >= 8) reasons.push("overfit_risk");
    return reasons.join(",");
}
