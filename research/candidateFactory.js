function mulberry32(seed) {
    let value = seed >>> 0;
    return function next() {
        value += 0x6d2b79f5;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(rng, values) {
    return values[Math.floor(rng() * values.length)];
}

function uniqHours(values) {
    return [...new Set(values.map(Number).filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23))].sort((a, b) => a - b);
}

export function createCandidateRng(seed) {
    return mulberry32(Number(seed || 20260505));
}

export function buildCandidate(index, rng) {
    const overrides = {
        setupMode: pick(rng, ["aggressive", "aggressive", "confirmed"]),
        pivotWindow: pick(rng, [1, 2, 2, 3]),
        signalMode: pick(rng, ["simple", "strict"]),
        entryMode: pick(rng, ["entry_on_close", "entry_on_break"]),
        stopVariant: pick(rng, [
            "signal_candle_extreme_with_buffer_1pip",
            "signal_candle_extreme_with_buffer_2pip",
            "signal_candle_extreme_with_buffer_3pip",
            "signal_candle_extreme_with_range_buffer_25",
            "signal_candle_extreme_with_range_buffer_40",
            "structure_pivot_with_buffer_2pip",
        ]),
        exitVariant: pick(rng, [
            "fixed_r_2",
            "fixed_r_3",
            "fixed_r_4",
            "fixed_r_5",
            "fixed_r_6",
            "time_exit_3",
            "time_exit_8",
            "time_exit_16",
            "adaptive_trail_1r_0_5",
            "adaptive_trail_1r_1",
            "adaptive_trail_2r_1",
            "adaptive_breakeven_trail_1r_1",
            "adaptive_intraday_trail_1r_0_5",
        ]),
        takeProfitR: pick(rng, [8, 10, 15, 20, 25]),
        safetyTakeProfitR: pick(rng, [8, 10, 15, 20, 25]),
        maxSignalWaitBars: pick(rng, [4, 6, 8, 10, 12, 14]),
        entryBreakMaxBars: pick(rng, [1, 2, 3, 4]),
        minStopDistancePips: pick(rng, [2, 2.5, 3]),
        maxStopPips: pick(rng, [8, 10, 12, 15, 18, 22, 25]),
        dailyForcedCloseUTC: true,
        entryCutoffMinuteUTC: pick(rng, [23 * 60, 23 * 60 + 30]),
        avoidHoursUTC: pick(rng, [[], [21], [22], [0], [0, 21], [21, 22], [0, 1]]),
        managementProfile: {
            mode: "adaptive_trail_r",
            activationR: pick(rng, [0.8, 1, 1.2, 1.5, 2]),
            trailR: pick(rng, [0.4, 0.5, 0.75, 1]),
            breakevenR: pick(rng, [0.8, 1, 1.2]),
            maxHoldBars: pick(rng, [16, 32, 64, 96]),
            timeframe: "M15",
        },
    };

    if (overrides.entryMode === "entry_on_close") overrides.entryBreakMaxBars = 3;
    overrides.avoidHoursUTC = uniqHours(overrides.avoidHoursUTC);

    return {
        label: `search_${String(index).padStart(4, "0")}`,
        overrides,
        changedKnobs: Object.keys(overrides).length + Object.keys(overrides.managementProfile).length,
        notes: "AutoSearch realistic HLLH parameter variation",
    };
}
