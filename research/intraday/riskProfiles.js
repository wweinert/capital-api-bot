export const RISK_PROFILE_DEFINITIONS = {
    conservative: {
        kind: "conservative",
        riskPerTrade: 0.01,
        maxPositions: 1,
        maxTradesPerDay: 4,
        maxTradesPerSymbolPerDay: 1,
        dailyStopLossPct: 0.03,
        dailyTakeProfitLockPct: 0.06,
        stopAfterLosses: 3,
        reduceRiskAfterDrawdownPct: 10,
        reducedRiskMultiplier: 0.5,
    },
    balanced: {
        kind: "balanced",
        riskPerTrade: 0.02,
        maxPositions: 2,
        maxTradesPerDay: 8,
        maxTradesPerSymbolPerDay: 2,
        dailyStopLossPct: 0.06,
        dailyTakeProfitLockPct: 0.1,
        stopAfterLosses: 4,
        reduceRiskAfterDrawdownPct: 18,
        reducedRiskMultiplier: 0.65,
    },
    aggressive_3pct: {
        kind: "aggressive_3pct",
        riskPerTrade: 0.03,
        maxPositions: 2,
        maxTradesPerDay: 12,
        maxTradesPerSymbolPerDay: 3,
        dailyStopLossPct: 0.09,
        dailyTakeProfitLockPct: 0.16,
        stopAfterLosses: 5,
        reduceRiskAfterDrawdownPct: 25,
        reducedRiskMultiplier: 0.7,
    },
    aggressive_4pct: {
        kind: "aggressive_4pct",
        riskPerTrade: 0.04,
        maxPositions: 3,
        maxTradesPerDay: 16,
        maxTradesPerSymbolPerDay: 4,
        dailyStopLossPct: 0.14,
        dailyTakeProfitLockPct: 0.24,
        stopAfterLosses: 6,
        reduceRiskAfterDrawdownPct: 35,
        reducedRiskMultiplier: 0.75,
    },
};

export function riskProfileId(profile = {}) {
    return [profile.kind, `${Math.round(Number(profile.riskPerTrade || 0) * 100)}pct`, `pos${profile.maxPositions}`, `day${profile.maxTradesPerDay}`].join("_");
}
