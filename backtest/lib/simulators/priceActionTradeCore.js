import { candleRange } from "../strategies/higherLowLowerHigh.js";

export function scenarioId(config) {
    return [
        config.setupMode,
        `pivot${config.pivotWindow}`,
        config.signalMode,
        config.entryMode,
        config.stopVariant,
        config.exitVariant,
    ].join("__");
}

export function stopBuffer(row, stopVariant, pipSize) {
    if (stopVariant === "signal_candle_extreme_with_buffer_1pip") return pipSize;
    if (stopVariant === "signal_candle_extreme_with_buffer_2pip") return pipSize * 2;
    if (stopVariant === "signal_candle_extreme_with_buffer_3pip") return pipSize * 3;
    if (stopVariant === "signal_candle_extreme_with_buffer_5pip") return pipSize * 5;
    if (stopVariant === "signal_candle_extreme_with_range_buffer_25") return candleRange(row) * 0.25;
    if (stopVariant === "signal_candle_extreme_with_range_buffer_40") return candleRange(row) * 0.4;
    if (stopVariant === "signal_candle_extreme_with_small_atr") return Number.isFinite(row?.atr) ? row.atr * 0.1 : 0;
    return 0;
}

export function buildStopPrice(side, signalRow, stopVariant, pipSize, candidate = null) {
    if (stopVariant === "structure_pivot_with_buffer_1pip" && Number.isFinite(candidate?.currentPivot?.price)) {
        return side === "LONG" ? candidate.currentPivot.price - pipSize : candidate.currentPivot.price + pipSize;
    }
    if (stopVariant === "structure_pivot_with_buffer_2pip" && Number.isFinite(candidate?.currentPivot?.price)) {
        return side === "LONG" ? candidate.currentPivot.price - pipSize * 2 : candidate.currentPivot.price + pipSize * 2;
    }
    const buffer = stopBuffer(signalRow, stopVariant, pipSize);
    if (side === "LONG") return signalRow.low - buffer;
    return signalRow.high + buffer;
}

export function buildTakeProfit(exitVariant, side, entryPrice, riskDistance, signalRange) {
    if (exitVariant === "two_signal_candles_size") {
        if (!(Number.isFinite(signalRange) && signalRange > 0)) return null;
        return side === "LONG" ? entryPrice + signalRange * 2 : entryPrice - signalRange * 2;
    }
    if (exitVariant === "fixed_r_0_8") return side === "LONG" ? entryPrice + riskDistance * 0.8 : entryPrice - riskDistance * 0.8;
    if (exitVariant === "fixed_r_1") return side === "LONG" ? entryPrice + riskDistance : entryPrice - riskDistance;
    if (exitVariant === "fixed_r_1_25") return side === "LONG" ? entryPrice + riskDistance * 1.25 : entryPrice - riskDistance * 1.25;
    if (exitVariant === "fixed_r_1_5") return side === "LONG" ? entryPrice + riskDistance * 1.5 : entryPrice - riskDistance * 1.5;
    if (exitVariant === "fixed_r_2") return side === "LONG" ? entryPrice + riskDistance * 2 : entryPrice - riskDistance * 2;
    if (exitVariant === "fixed_r_3") return side === "LONG" ? entryPrice + riskDistance * 3 : entryPrice - riskDistance * 3;
    if (exitVariant === "fixed_r_4") return side === "LONG" ? entryPrice + riskDistance * 4 : entryPrice - riskDistance * 4;
    if (exitVariant === "fixed_r_5") return side === "LONG" ? entryPrice + riskDistance * 5 : entryPrice - riskDistance * 5;
    if (exitVariant === "fixed_r_6") return side === "LONG" ? entryPrice + riskDistance * 6 : entryPrice - riskDistance * 6;
    if (String(exitVariant || "").startsWith("adaptive_")) return null;
    return null;
}

export function timeExitBars(exitVariant) {
    if (exitVariant === "time_exit_2") return 2;
    if (exitVariant === "time_exit_3") return 3;
    if (exitVariant === "time_exit_4") return 4;
    if (exitVariant === "time_exit_8") return 8;
    if (exitVariant === "time_exit_16") return 16;
    if (exitVariant === "time_exit_32") return 32;
    return null;
}

function adaptiveManagementParams(exitVariant) {
    if (exitVariant === "adaptive_trail_1r_0_5") return { activateR: 1, trailR: 0.5, breakevenR: 1, maxHoldBars: 96 };
    if (exitVariant === "adaptive_trail_1r_1") return { activateR: 1, trailR: 1, breakevenR: 1, maxHoldBars: 96 };
    if (exitVariant === "adaptive_trail_2r_1") return { activateR: 2, trailR: 1, breakevenR: 1, maxHoldBars: 96 };
    if (exitVariant === "adaptive_breakeven_trail_1r_1") return { activateR: 1, trailR: 1, breakevenR: 0.8, maxHoldBars: 96 };
    if (exitVariant === "adaptive_intraday_trail_1r_0_5") return { activateR: 1, trailR: 0.5, breakevenR: 1, maxHoldBars: 16 };
    return null;
}

export function buildPendingEntry(candidate, config, pipSize) {
    return {
        ...candidate,
        stopPrice: buildStopPrice(candidate.side, candidate.signalRow, config.stopVariant, pipSize, candidate),
        expiresAt: candidate.signalIndex + Number(config.entryBreakMaxBars || 3),
        config,
    };
}

export function buildTradeFromSignal({ candidate, entryIndex, entryPrice, config, pipSize }) {
    const stopPrice = buildStopPrice(candidate.side, candidate.signalRow, config.stopVariant, pipSize, candidate);
    const riskDistance = candidate.side === "LONG" ? entryPrice - stopPrice : stopPrice - entryPrice;
    if (!(Number.isFinite(riskDistance) && riskDistance > 0)) return null;
    const signalRange = candleRange(candidate.signalRow);
    const takeProfit = buildTakeProfit(config.exitVariant, candidate.side, entryPrice, riskDistance, signalRange);
    return {
        key: candidate.key,
        normalizedCandidateId: candidate.normalizedCandidateId || null,
        normalizedTradeId: candidate.normalizedTradeId || candidate.normalizedCandidateId || null,
        side: candidate.side,
        signalTimestamp: candidate.signalTimestamp,
        signalIndex: candidate.signalIndex,
        structurePivotIndex: candidate.structurePivotIndex,
        structureConfirmIndex: candidate.structureConfirmIndex,
        structureRefs: candidate.structureRefs || null,
        confirmationType: candidate.confirmationType || null,
        sequence: candidate.sequence,
        entryTimestamp: candidate.signalRow.timestamp,
        entryIndex,
        entryPrice,
        stopPrice,
        takeProfit,
        timeExitBars: timeExitBars(config.exitVariant),
        adaptiveManagement: adaptiveManagementParams(config.exitVariant),
        riskDistance,
        signalRange,
        manageFromIndex: entryIndex + 1,
        signalRow: candidate.signalRow,
    };
}

export function closeTrade(trade, exitIndex, exitRow, exitPrice, exitReason, pipSize) {
    const directionalMove = trade.side === "LONG" ? exitPrice - trade.entryPrice : trade.entryPrice - exitPrice;
    return {
        ...trade,
        exitTimestamp: exitRow.timestamp,
        exitIndex,
        exitPrice,
        exitReason,
        holdBars: exitIndex - trade.entryIndex,
        pnlR: trade.riskDistance > 0 ? directionalMove / trade.riskDistance : null,
        pnlPips: pipSize > 0 ? directionalMove / pipSize : null,
    };
}

function utcDayKey(timestamp) {
    return typeof timestamp === "string" ? timestamp.slice(0, 10) : null;
}

export function shouldDailyForceClose(trade, previousRow, currentRow, config = {}) {
    if (!config.dailyForcedCloseUTC) return false;
    if (!trade || !previousRow || !currentRow) return false;
    const previousDay = utcDayKey(previousRow.timestamp);
    const currentDay = utcDayKey(currentRow.timestamp);
    const entryDay = utcDayKey(trade.entryTimestamp);
    return Boolean(previousDay && currentDay && entryDay && previousDay !== currentDay && entryDay <= previousDay);
}

export function maybeActivatePendingEntry(pending, row, index, pipSize, simulationStats) {
    if (!pending) return { status: "none", trade: null, reason: null };
    if (index <= pending.signalIndex) return { status: "waiting", trade: null, reason: null };
    if (index > pending.expiresAt) {
        simulationStats.breakEntryExpiredCount += 1;
        return { status: "expired", trade: null, reason: "break_entry_expired" };
    }

    if (pending.side === "LONG") {
        if (row.open >= pending.signalRow.high) {
            return {
                status: "entered",
                trade: buildTradeFromSignal({
                    candidate: pending,
                    entryIndex: index,
                    entryPrice: row.open,
                    config: pending.config,
                    pipSize,
                }),
                reason: "open_gap_break",
            };
        }
        if (row.low <= pending.stopPrice && row.high >= pending.signalRow.high) {
            simulationStats.breakEntryInvalidatedCount += 1;
            return { status: "invalidated", trade: null, reason: "stop_touched_before_or_with_break" };
        }
        if (row.low <= pending.stopPrice) {
            simulationStats.breakEntryInvalidatedCount += 1;
            return { status: "invalidated", trade: null, reason: "stop_touched_before_break" };
        }
        if (row.high >= pending.signalRow.high) {
            return {
                status: "entered",
                trade: buildTradeFromSignal({
                    candidate: pending,
                    entryIndex: index,
                    entryPrice: pending.signalRow.high,
                    config: pending.config,
                    pipSize,
                }),
                reason: "intrabar_break",
            };
        }
        return { status: "waiting", trade: null, reason: null };
    }

    if (row.open <= pending.signalRow.low) {
        return {
            status: "entered",
            trade: buildTradeFromSignal({
                candidate: pending,
                entryIndex: index,
                entryPrice: row.open,
                config: pending.config,
                pipSize,
            }),
            reason: "open_gap_break",
        };
    }
    if (row.high >= pending.stopPrice && row.low <= pending.signalRow.low) {
        simulationStats.breakEntryInvalidatedCount += 1;
        return { status: "invalidated", trade: null, reason: "stop_touched_before_or_with_break" };
    }
    if (row.high >= pending.stopPrice) {
        simulationStats.breakEntryInvalidatedCount += 1;
        return { status: "invalidated", trade: null, reason: "stop_touched_before_break" };
    }
    if (row.low <= pending.signalRow.low) {
        return {
            status: "entered",
            trade: buildTradeFromSignal({
                candidate: pending,
                entryIndex: index,
                entryPrice: pending.signalRow.low,
                config: pending.config,
                pipSize,
            }),
            reason: "intrabar_break",
        };
    }
    return { status: "waiting", trade: null, reason: null };
}

export function maybeCloseTrade(trade, row, index, pipSize) {
    if (!trade || index < trade.manageFromIndex) return null;

    if (trade.side === "LONG") {
        const stopLevel = Number.isFinite(trade.adaptiveStopPrice) ? Math.max(trade.stopPrice, trade.adaptiveStopPrice) : trade.stopPrice;
        const stopHit = row.low <= stopLevel;
        const tpHit = Number.isFinite(trade.takeProfit) && row.high >= trade.takeProfit;
        if (stopHit && tpHit) return closeTrade(trade, index, row, stopLevel, "stop_loss_same_bar", pipSize);
        if (stopHit) return closeTrade(trade, index, row, stopLevel, stopLevel > trade.stopPrice ? "adaptive_trailing_stop" : "stop_loss", pipSize);
        if (tpHit) return closeTrade(trade, index, row, trade.takeProfit, "take_profit", pipSize);
    } else {
        const stopLevel = Number.isFinite(trade.adaptiveStopPrice) ? Math.min(trade.stopPrice, trade.adaptiveStopPrice) : trade.stopPrice;
        const stopHit = row.high >= stopLevel;
        const tpHit = Number.isFinite(trade.takeProfit) && row.low <= trade.takeProfit;
        if (stopHit && tpHit) return closeTrade(trade, index, row, stopLevel, "stop_loss_same_bar", pipSize);
        if (stopHit) return closeTrade(trade, index, row, stopLevel, stopLevel < trade.stopPrice ? "adaptive_trailing_stop" : "stop_loss", pipSize);
        if (tpHit) return closeTrade(trade, index, row, trade.takeProfit, "take_profit", pipSize);
    }

    if (trade.adaptiveManagement) {
        const params = trade.adaptiveManagement;
        const favorableMove = trade.side === "LONG" ? row.high - trade.entryPrice : trade.entryPrice - row.low;
        const favorableR = trade.riskDistance > 0 ? favorableMove / trade.riskDistance : 0;
        if (favorableR >= Number(params.breakevenR || Number.POSITIVE_INFINITY)) {
            trade.adaptiveStopPrice = trade.side === "LONG" ? Math.max(trade.adaptiveStopPrice ?? trade.stopPrice, trade.entryPrice) : Math.min(trade.adaptiveStopPrice ?? trade.stopPrice, trade.entryPrice);
        }
        if (favorableR >= Number(params.activateR || Number.POSITIVE_INFINITY)) {
            const trailDistance = trade.riskDistance * Number(params.trailR || 1);
            const nextStop = trade.side === "LONG" ? row.high - trailDistance : row.low + trailDistance;
            trade.adaptiveStopPrice = trade.side === "LONG" ? Math.max(trade.adaptiveStopPrice ?? trade.stopPrice, nextStop) : Math.min(trade.adaptiveStopPrice ?? trade.stopPrice, nextStop);
        }

        if (Number.isFinite(trade.adaptiveStopPrice)) {
            if (trade.side === "LONG" && row.low <= trade.adaptiveStopPrice) {
                return closeTrade(trade, index, row, trade.adaptiveStopPrice, "adaptive_trailing_stop", pipSize);
            }
            if (trade.side === "SHORT" && row.high >= trade.adaptiveStopPrice) {
                return closeTrade(trade, index, row, trade.adaptiveStopPrice, "adaptive_trailing_stop", pipSize);
            }
        }

        if (Number.isFinite(params.maxHoldBars) && index - trade.entryIndex >= params.maxHoldBars) {
            return closeTrade(trade, index, row, row.close, `adaptive_time_exit_${params.maxHoldBars}`, pipSize);
        }
    }

    if (Number.isFinite(trade.timeExitBars) && index - trade.entryIndex >= trade.timeExitBars) {
        return closeTrade(trade, index, row, row.close, `time_exit_${trade.timeExitBars}`, pipSize);
    }

    return null;
}

export function maybeRejectSmallStop(trade, config, pipSize, simulationStats) {
    const minStopDistancePips = Number(config.minStopDistancePips);
    if (!(Number.isFinite(minStopDistancePips) && minStopDistancePips > 0)) return false;
    const distancePips = trade.riskDistance / pipSize;
    if (distancePips + 1e-12 < minStopDistancePips) {
        simulationStats.stopBelowMinDistanceCount += 1;
        return true;
    }
    return false;
}
