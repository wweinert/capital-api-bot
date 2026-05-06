export const MANAGEMENT_PROFILE_DEFINITIONS = {
    passive: {
        kind: "passive",
        description: "Exit profile controls the trade; no extra monitoring exits.",
    },
    fast_cut: {
        kind: "fast_cut",
        adverseBarsValues: [1, 2, 3],
        maxAdverseRValues: [0.4, 0.6, 0.8],
    },
    protect_profit: {
        kind: "protect_profit",
        minProfitRValues: [0.8, 1, 1.5, 2],
        givebackPctValues: [0.35, 0.45, 0.6],
    },
    momentum_watch: {
        kind: "momentum_watch",
        minProfitRValues: [0.5, 1, 1.5],
        closeAgainstBarsValues: [1, 2, 3],
    },
    session_flat: {
        kind: "session_flat",
        closeBeforeSessionEndMinutesValues: [15, 30, 60],
    },
    daily_flat: {
        kind: "daily_flat",
        closeMinuteUTCValues: [20 * 60 + 45, 21 * 60, 21 * 60 + 30],
    },
};

export function managementProfileId(profile = {}) {
    return [profile.kind, profile.adverseBars, profile.maxAdverseR, profile.minProfitR, profile.givebackPct, profile.closeAgainstBars, profile.closeMinuteUTC]
        .filter((value) => value !== undefined && value !== null)
        .join("_");
}
