export const EXIT_PROFILE_DEFINITIONS = {
    fixed_r: {
        kind: "fixed_r",
        tpRValues: [1, 1.5, 2, 3, 5],
        stopModels: ["candle", "atr", "fixed_pips"],
    },
    partial_take_profit: {
        kind: "partial_take_profit",
        partialAtRValues: [0.5, 1, 1.5],
        partialClosePctValues: [0.3, 0.5, 0.7],
        runnerTrailKinds: ["r_trail", "atr_trail", "ema_trail"],
    },
    breakeven_after_r: {
        kind: "breakeven_after_r",
        breakevenRValues: [0.5, 0.8, 1, 1.5],
        tpRValues: [1.5, 2, 3, 5],
    },
    adaptive_r_trail: {
        kind: "adaptive_r_trail",
        activationRValues: [0.5, 0.8, 1, 1.5, 2],
        trailRValues: [0.4, 0.6, 0.8, 1.0, 1.5],
        breakevenRValues: [0.5, 0.8, 1, 1.2],
    },
    atr_trailing: {
        kind: "atr_trailing",
        activateAfterRValues: [0.5, 1, 1.5, 2],
        atrMultiplierValues: [1, 1.5, 2, 3],
    },
    candle_low_high_trail: {
        kind: "candle_low_high_trail",
        lookbackBarsValues: [1, 2, 3, 5],
        activateAfterRValues: [0.5, 1, 1.5],
    },
    ema_exit: {
        kind: "ema_exit",
        emaValues: [8, 13, 20, 34],
        tpRValues: [2, 3, 5],
    },
    momentum_decay_exit: {
        kind: "momentum_decay_exit",
        decayBarsValues: [1, 2, 3],
        minProfitRValues: [0.5, 1, 1.5],
        tpRValues: [2, 3, 5],
    },
    time_based_exit: {
        kind: "time_based_exit",
        maxHoldBarsValues: [4, 8, 12, 24, 48, 96],
        tpRValues: [1.5, 2, 3, 5],
    },
    profit_protection_exit: {
        kind: "profit_protection_exit",
        reachedRValues: [1, 1.5, 2, 3],
        givebackPctValues: [0.3, 0.4, 0.5, 0.6],
        tpRValues: [3, 5, 8],
    },
};

export function exitProfileId(profile = {}) {
    return [profile.kind, profile.tpR, profile.partialAtR, profile.activationR, profile.trailR, profile.maxHoldBars, profile.atrMultiplier, profile.emaPeriod]
        .filter((value) => value !== undefined && value !== null)
        .join("_");
}
