export function toNum(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export function pipSizeForSymbol(symbol) {
    return String(symbol || "").toUpperCase().endsWith("JPY") ? 0.01 : 0.0001;
}

export function normalizeRows(rows) {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => {
            const timestamp =
                typeof row?.timestamp === "string"
                    ? row.timestamp
                    : typeof row?.snapshotTimeUTC === "string"
                      ? row.snapshotTimeUTC
                      : typeof row?.snapshotTime === "string"
                        ? row.snapshotTime
                        : typeof row?.t === "string"
                          ? row.t
                          : null;
            return {
                timestamp,
                tsMs: toNum(row?.tsMs) ?? (timestamp ? Date.parse(timestamp) : null),
                open: toNum(row?.open ?? row?.Open ?? row?.openPrice?.bid ?? row?.openPrice?.ask ?? row?.o),
                high: toNum(row?.high ?? row?.High ?? row?.highPrice?.bid ?? row?.highPrice?.ask ?? row?.h),
                low: toNum(row?.low ?? row?.Low ?? row?.lowPrice?.bid ?? row?.lowPrice?.ask ?? row?.l),
                close: toNum(row?.close ?? row?.Close ?? row?.closePrice?.bid ?? row?.closePrice?.ask ?? row?.c),
                atr: toNum(row?.atr),
                atrPct: toNum(row?.atrPct),
            };
        })
        .filter((row) => row.timestamp && [row.tsMs, row.open, row.high, row.low, row.close].every(Number.isFinite))
        .sort((a, b) => a.tsMs - b.tsMs);
}

export function isBullish(row) {
    return Number.isFinite(row?.close) && Number.isFinite(row?.open) && row.close > row.open;
}

export function isBearish(row) {
    return Number.isFinite(row?.close) && Number.isFinite(row?.open) && row.close < row.open;
}

export function candleRange(row) {
    return Number.isFinite(row?.high) && Number.isFinite(row?.low) ? Math.max(0, row.high - row.low) : null;
}

export function closeLocation(row) {
    const range = candleRange(row);
    if (!(Number.isFinite(range) && range > 0)) return null;
    return (row.close - row.low) / range;
}

export function trendSide(row) {
    const trend = String(row?.trend || "").toLowerCase();
    if (trend === "bullish") return "LONG";
    if (trend === "bearish") return "SHORT";
    const ema20 = toNum(row?.ema20);
    const ema50 = toNum(row?.ema50);
    if (Number.isFinite(ema20) && Number.isFinite(ema50)) {
        if (ema20 > ema50) return "LONG";
        if (ema20 < ema50) return "SHORT";
    }
    return null;
}

export function trendModePasses(row, side, mode = null) {
    const normalizedMode = String(mode || "any").toLowerCase();
    if (!normalizedMode || normalizedMode === "any" || normalizedMode === "off") return true;
    const trend = trendSide(row);
    if (!trend) return false;
    if (normalizedMode === "aligned") return trend === side;
    if (normalizedMode === "counter") return trend !== side;
    return true;
}

export function createHigherLowLowerHighConfig(overrides = {}) {
    return {
        setupMode: "confirmed",
        pivotWindow: 2,
        signalMode: "simple",
        h1TrendMode: null,
        entryMode: "entry_on_close",
        stopVariant: "signal_candle_extreme_with_buffer_2pip",
        exitVariant: "atr_trail_after_1r",
        managementTimeframe: "M15",
        stopModel: "signal_2pip",
        exitModel: "atr_trail_after_1r",
        atrTrailAfterR: 1,
        atrTrailMultiplier: 1.1,
        safetyTakeProfitR: 20,
        maxSignalWaitBars: 10,
        entryBreakMaxBars: 0,
        minStopDistancePips: 2,
        realismStopThresholdPips: 2,
        ...overrides,
    };
}

function isLocalLow(rows, index, window) {
    if (index < window || index + window >= rows.length) return false;
    const currentLow = rows[index]?.low;
    if (!Number.isFinite(currentLow)) return false;
    for (let offset = 1; offset <= window; offset += 1) {
        if (!(currentLow < rows[index - offset].low && currentLow < rows[index + offset].low)) {
            return false;
        }
    }
    return true;
}

function isLocalHigh(rows, index, window) {
    if (index < window || index + window >= rows.length) return false;
    const currentHigh = rows[index]?.high;
    if (!Number.isFinite(currentHigh)) return false;
    for (let offset = 1; offset <= window; offset += 1) {
        if (!(currentHigh > rows[index - offset].high && currentHigh > rows[index + offset].high)) {
            return false;
        }
    }
    return true;
}

export function detectLocalPivots(rows, window = 2) {
    const pivotWindow = Math.max(1, Number(window || 2));
    const lows = [];
    const highs = [];

    for (let index = pivotWindow; index < rows.length - pivotWindow; index += 1) {
        if (isLocalLow(rows, index, pivotWindow)) {
            lows.push({
                side: "LONG",
                pivotIndex: index,
                confirmIndex: index + pivotWindow,
                timestamp: rows[index].timestamp,
                price: rows[index].low,
                previousPrice: null,
                previousPivotIndex: null,
                previousTimestamp: null,
                previousConfirmIndex: null,
                sequence: 0,
            });
        }
        if (isLocalHigh(rows, index, pivotWindow)) {
            highs.push({
                side: "SHORT",
                pivotIndex: index,
                confirmIndex: index + pivotWindow,
                timestamp: rows[index].timestamp,
                price: rows[index].high,
                previousPrice: null,
                previousPivotIndex: null,
                previousTimestamp: null,
                previousConfirmIndex: null,
                sequence: 0,
            });
        }
    }

    for (let index = 0; index < lows.length; index += 1) {
        const previous = lows[index - 1] || null;
        const current = lows[index];
        current.previousPrice = previous?.price ?? null;
        current.previousPivotIndex = previous?.pivotIndex ?? null;
        current.previousTimestamp = previous?.timestamp ?? null;
        current.previousConfirmIndex = previous?.confirmIndex ?? null;
        current.previousPivot = previous || null;
        current.sequence = previous && current.price > previous.price ? previous.sequence + 1 : 0;
    }

    for (let index = 0; index < highs.length; index += 1) {
        const previous = highs[index - 1] || null;
        const current = highs[index];
        current.previousPrice = previous?.price ?? null;
        current.previousPivotIndex = previous?.pivotIndex ?? null;
        current.previousTimestamp = previous?.timestamp ?? null;
        current.previousConfirmIndex = previous?.confirmIndex ?? null;
        current.previousPivot = previous || null;
        current.sequence = previous && current.price < previous.price ? previous.sequence + 1 : 0;
    }

    return { lows, highs };
}

export function signalPasses(row, side, signalMode = "simple") {
    if (side === "LONG") {
        if (!isBullish(row)) return false;
        if (signalMode === "strict") return (closeLocation(row) || 0) >= 0.6;
        return true;
    }
    if (!isBearish(row)) return false;
    if (signalMode === "strict") return (closeLocation(row) || 1) <= 0.4;
    return true;
}

export function prepareHigherLowLowerHighContext(rows, config = {}) {
    const resolved = createHigherLowLowerHighConfig(config);
    const normalizedRows = normalizeRows(rows);
    const pivots = detectLocalPivots(normalizedRows, resolved.pivotWindow);
    const lowsByConfirm = new Map();
    const highsByConfirm = new Map();

    for (const pivot of pivots.lows) {
        if (!lowsByConfirm.has(pivot.confirmIndex)) lowsByConfirm.set(pivot.confirmIndex, []);
        lowsByConfirm.get(pivot.confirmIndex).push(pivot);
    }
    for (const pivot of pivots.highs) {
        if (!highsByConfirm.has(pivot.confirmIndex)) highsByConfirm.set(pivot.confirmIndex, []);
        highsByConfirm.get(pivot.confirmIndex).push(pivot);
    }

    return {
        rows: normalizedRows,
        config: resolved,
        pivots,
        lowsByConfirm,
        highsByConfirm,
    };
}

export function createHigherLowLowerHighState(config = {}) {
    const resolved = createHigherLowLowerHighConfig(config);
    return {
        requiredSequence: resolved.setupMode === "confirmed" ? 2 : 1,
        longArm: null,
        shortArm: null,
        stats: {
            longStructuresArmed: 0,
            shortStructuresArmed: 0,
            signalWaitExpired: 0,
            signalCandidatesSeen: 0,
            signalCandidatesAccepted: 0,
        },
    };
}

function buildSignalCandidate(side, row, index, arm, config) {
    const structureRefs =
        side === "LONG"
            ? {
                  l1: arm.pivot.previousPivot
                      ? {
                            pivotIndex: arm.pivot.previousPivot.pivotIndex,
                            confirmIndex: arm.pivot.previousPivot.confirmIndex,
                            timestamp: arm.pivot.previousPivot.timestamp,
                            price: arm.pivot.previousPivot.price,
                        }
                      : null,
                  l2: {
                      pivotIndex: arm.pivot.pivotIndex,
                      confirmIndex: arm.pivot.confirmIndex,
                      timestamp: arm.pivot.timestamp,
                      price: arm.pivot.price,
                  },
              }
            : {
                  h1: arm.pivot.previousPivot
                      ? {
                            pivotIndex: arm.pivot.previousPivot.pivotIndex,
                            confirmIndex: arm.pivot.previousPivot.confirmIndex,
                            timestamp: arm.pivot.previousPivot.timestamp,
                            price: arm.pivot.previousPivot.price,
                        }
                      : null,
                  h2: {
                      pivotIndex: arm.pivot.pivotIndex,
                      confirmIndex: arm.pivot.confirmIndex,
                      timestamp: arm.pivot.timestamp,
                      price: arm.pivot.price,
                  },
              };
    return {
        key: `${side}|${row.timestamp}|${index}|${config.setupMode}|${config.signalMode}|${config.entryMode}|${config.exitVariant}|pivot${config.pivotWindow}`,
        side,
        signalRow: row,
        signalIndex: index,
        signalTimestamp: row.timestamp,
        structurePivotIndex: arm.pivot.pivotIndex,
        structureConfirmIndex: arm.activatedIndex,
        sequence: arm.pivot.sequence,
        entryBreakMaxBars: Number(config.entryBreakMaxBars || 3),
        maxSignalWaitBars: Number(config.maxSignalWaitBars || 8),
        currentPivot: arm.pivot,
        previousPivot: arm.pivot.previousPivot || null,
        structureRefs,
        confirmationType: config.setupMode === "confirmed" ? "second_structure_confirmed" : "first_structure_confirmed",
    };
}

export function advanceHigherLowLowerHighDetector({ context, state, index }) {
    const row = context.rows[index];
    const config = context.config;
    const events = [];
    if (!row) return { state, events };

    if (state.longArm && index > state.longArm.expiresAt) {
        state.longArm = null;
        state.stats.signalWaitExpired += 1;
        events.push({ type: "signal_wait_expired", side: "LONG", index });
    }
    if (state.shortArm && index > state.shortArm.expiresAt) {
        state.shortArm = null;
        state.stats.signalWaitExpired += 1;
        events.push({ type: "signal_wait_expired", side: "SHORT", index });
    }

    for (const pivot of context.lowsByConfirm.get(index) || []) {
        if (pivot.sequence >= state.requiredSequence) {
            state.longArm = {
                side: "LONG",
                pivot,
                activatedIndex: index,
                expiresAt: index + Number(config.maxSignalWaitBars || 8),
            };
            state.stats.longStructuresArmed += 1;
            events.push({ type: "structure_armed", side: "LONG", pivotIndex: pivot.pivotIndex, index });
        }
    }

    for (const pivot of context.highsByConfirm.get(index) || []) {
        if (pivot.sequence >= state.requiredSequence) {
            state.shortArm = {
                side: "SHORT",
                pivot,
                activatedIndex: index,
                expiresAt: index + Number(config.maxSignalWaitBars || 8),
            };
            state.stats.shortStructuresArmed += 1;
            events.push({ type: "structure_armed", side: "SHORT", pivotIndex: pivot.pivotIndex, index });
        }
    }

    if (state.longArm && index >= state.longArm.activatedIndex && isBullish(row)) {
        state.stats.signalCandidatesSeen += 1;
        const accepted = signalPasses(row, "LONG", config.signalMode) && trendModePasses(row, "LONG", config.h1TrendMode);
        const candidate = buildSignalCandidate("LONG", row, index, state.longArm, config);
        state.longArm = null;
        if (accepted) {
            state.stats.signalCandidatesAccepted += 1;
            events.push({ type: "signal_candidate", candidate });
        } else {
            events.push({ type: "signal_rejected", reason: "weak_bullish_signal", candidate });
        }
    }

    if (state.shortArm && index >= state.shortArm.activatedIndex && isBearish(row)) {
        state.stats.signalCandidatesSeen += 1;
        const accepted = signalPasses(row, "SHORT", config.signalMode) && trendModePasses(row, "SHORT", config.h1TrendMode);
        const candidate = buildSignalCandidate("SHORT", row, index, state.shortArm, config);
        state.shortArm = null;
        if (accepted) {
            state.stats.signalCandidatesAccepted += 1;
            events.push({ type: "signal_candidate", candidate });
        } else {
            events.push({ type: "signal_rejected", reason: "weak_bearish_signal", candidate });
        }
    }

    return { state, events };
}
