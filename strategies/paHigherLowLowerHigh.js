import {
    advanceHigherLowLowerHighDetector,
    createHigherLowLowerHighConfig,
    createHigherLowLowerHighState,
    normalizeRows,
    pipSizeForSymbol,
    prepareHigherLowLowerHighContext,
} from "../backtest/lib/strategies/higherLowLowerHigh.js";
import { buildTradeDiagnostics, monthlyBreakdown, scoreScenario, summarizeTrades } from "../backtest/lib/reporting/higherLowLowerHighMetrics.js";
import {
    buildPendingEntry,
    buildTradeFromSignal,
    buildStopPrice,
    closeTrade,
    maybeActivatePendingEntry,
    maybeCloseTrade,
    maybeRejectSmallStop,
    scenarioId,
    shouldDailyForceClose,
} from "../backtest/lib/simulators/priceActionTradeCore.js";
import { HLLH_SYMBOL_PROFILES, RISK } from "../config.js";
import { buildHllhStableCandidateIdentity } from "../utils/hllhSignalIdentity.js";

export const PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID = "PA_HIGHER_LOW_LOWER_HIGH";
export const PA_HIGHER_LOW_LOWER_HIGH_RUNTIME_PROFILE = {
    executionPath: "platform_broker",
    liveReadyArchitecture: true,
    activationControlledByConfig: true,
};

export const PA_HLLH_CONFIG = {
    strategyType: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID,
    setupMode: "aggressive",
    pivotWindow: 2,
    signalMode: "simple",
    entryMode: "entry_on_close",
    stopVariant: "signal_candle_extreme_with_buffer_2pip",
    exitVariant: "adaptive_trail_1r_0_5",
    timeframe: "M15",
    maxSignalWaitBars: 8,
    entryBreakMaxBars: 3,
    takeProfitR: 20,
    safetyTakeProfitR: 20,
    minStopDistancePips: 2,
    dailyForcedCloseUTC: true,
    avoidHoursUTC: [],
    maxStopPips: 12,
    managementProfile: {
        mode: "adaptive_trail_r",
        activationR: 1,
        trailR: 0.5,
        breakevenR: 1,
        maxHoldBars: 96,
        timeframe: "M15",
    },
};

export function buildPaHigherLowLowerHighRuntimeConfig(overrides = {}) {
    const strategy = createHigherLowLowerHighConfig(overrides?.strategy || overrides?.scenario || overrides);
    return {
        strategyId: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID,
        runtimeProfile: { ...PA_HIGHER_LOW_LOWER_HIGH_RUNTIME_PROFILE },
        strategy,
        guards: {
            enabled: true,
            ...overrides?.guards,
        },
        execution: {
            parityMode: "streaming_replay",
            ...overrides?.execution,
        },
    };
}

function candleSnapshot(row, index) {
    if (!row) return null;
    return {
        index,
        timestamp: row.timestamp,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        atr: row.atr,
    };
}

function pivotSnapshot(pivot, rows) {
    if (!pivot) return null;
    const row = rows[pivot.pivotIndex] || null;
    return {
        pivotIndex: pivot.pivotIndex,
        confirmIndex: pivot.confirmIndex,
        timestamp: pivot.timestamp,
        price: pivot.price,
        row: candleSnapshot(row, pivot.pivotIndex),
    };
}

function structureRefsFromCandidate(candidate, rows) {
    if (candidate?.structureRefs) return candidate.structureRefs;
    const previous = pivotSnapshot(candidate?.previousPivot || null, rows);
    const current = pivotSnapshot(candidate?.currentPivot || null, rows);
    if (candidate?.side === "LONG") return { l1: previous, l2: current };
    return { h1: previous, h2: current };
}

function buildLogContext(config, meta) {
    return {
        strategyId: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID,
        symbol: meta.symbol || null,
        timeframe: meta.timeframe || null,
        setupMode: config.setupMode,
        pivotWindow: config.pivotWindow,
        signalMode: config.signalMode,
        entryMode: config.entryMode,
        stopVariant: config.stopVariant,
        exitVariant: config.exitVariant,
        scenarioId: scenarioId(config),
    };
}

function stopMetrics({ stopPrice, entryPrice, pipSize, signalRow }) {
    const stopDistance = Number.isFinite(stopPrice) && Number.isFinite(entryPrice) ? Math.abs(entryPrice - stopPrice) : null;
    return {
        stopDistancePips: Number.isFinite(stopDistance) && pipSize > 0 ? stopDistance / pipSize : null,
        stopDistanceAtr: Number.isFinite(stopDistance) && Number.isFinite(signalRow?.atr) && signalRow.atr > 0 ? stopDistance / signalRow.atr : null,
    };
}

function buildStructuredEvent(kind, payload, context) {
    const normalizedCandidateId =
        payload.normalizedCandidateId ||
        buildHllhStableCandidateIdentity({
            symbol: context.symbol,
            side: payload.side,
            signalTimestamp: payload.signalTimestamp ?? payload.signalCandle?.timestamp ?? payload.entryTimestamp,
            setupMode: context.setupMode,
            pivotWindow: context.pivotWindow,
            signalMode: context.signalMode,
            entryMode: context.entryMode,
            exitVariant: context.exitVariant,
        });
    const normalizedTradeId = payload.normalizedTradeId || normalizedCandidateId || null;
    return {
        eventType: kind,
        ...context,
        timestamp: payload.timestamp || payload.signalTimestamp || payload.entryTimestamp || payload.exitTimestamp || null,
        signalTimestamp: payload.signalTimestamp ?? null,
        entryTimestamp: payload.entryTimestamp ?? null,
        exitTimestamp: payload.exitTimestamp ?? null,
        barIndex: Number.isFinite(payload.barIndex) ? payload.barIndex : null,
        side: payload.side || null,
        entryPrice: payload.entryPrice ?? null,
        stopPrice: payload.stopPrice ?? null,
        takeProfitPrice: payload.takeProfit ?? payload.takeProfitPrice ?? null,
        stopDistancePips: payload.stopDistancePips ?? null,
        stopDistanceAtr: payload.stopDistanceAtr ?? null,
        structureRefs: payload.structureRefs ?? null,
        signalCandle: payload.signalCandle ?? null,
        confirmationType: payload.confirmationType ?? null,
        exitReason: payload.exitReason ?? null,
        realizedR: payload.realizedR ?? null,
        blockedByGuard: payload.blockedByGuard ?? null,
        invalidationReason: payload.invalidationReason ?? null,
        normalizedCandidateId,
        normalizedTradeId,
        metadata:
            payload.metadata || normalizedCandidateId
                ? {
                      ...(payload.metadata || {}),
                      normalizedCandidateId,
                      normalizedTradeId,
                  }
                : null,
    };
}

function tradeToLogPayload(trade, rows, pipSize, context, extra = {}) {
    const metrics = stopMetrics({
        stopPrice: trade.stopPrice,
        entryPrice: trade.entryPrice,
        pipSize,
        signalRow: trade.signalRow,
    });
    const normalizedCandidateId =
        trade.normalizedCandidateId ||
        buildHllhStableCandidateIdentity({
            symbol: context.symbol,
            side: trade.side,
            signalTimestamp: trade.signalTimestamp || trade.signalRow?.timestamp,
            setupMode: context.setupMode,
            pivotWindow: context.pivotWindow,
            signalMode: context.signalMode,
            entryMode: context.entryMode,
            exitVariant: context.exitVariant,
        });
    return {
        timestamp: extra.timestamp || trade.entryTimestamp,
        signalTimestamp: trade.signalTimestamp || null,
        entryTimestamp: trade.entryTimestamp || null,
        exitTimestamp: trade.exitTimestamp || null,
        barIndex: extra.barIndex ?? trade.entryIndex ?? null,
        side: trade.side,
        entryPrice: trade.entryPrice,
        stopPrice: trade.stopPrice,
        takeProfitPrice: trade.takeProfit,
        stopDistancePips: metrics.stopDistancePips,
        stopDistanceAtr: metrics.stopDistanceAtr,
        structureRefs: trade.structureRefs || structureRefsFromCandidate(trade, rows),
        signalCandle: candleSnapshot(trade.signalRow, trade.signalIndex),
        confirmationType: trade.confirmationType || null,
        exitReason: trade.exitReason || null,
        realizedR: trade.pnlR ?? null,
        invalidationReason: extra.invalidationReason || null,
        normalizedCandidateId,
        normalizedTradeId: trade.normalizedTradeId || normalizedCandidateId || null,
        metadata:
            extra.metadata || normalizedCandidateId
                ? {
                      ...(extra.metadata || {}),
                      normalizedCandidateId,
                      normalizedTradeId: trade.normalizedTradeId || normalizedCandidateId || null,
                  }
                : null,
    };
}

function assignNormalizedIdentity(candidate, context) {
    if (!candidate || typeof candidate !== "object") return candidate;
    const normalizedCandidateId =
        candidate.normalizedCandidateId ||
        buildHllhStableCandidateIdentity({
            symbol: context.symbol,
            side: candidate.side,
            signalTimestamp: candidate.signalTimestamp || candidate.signalRow?.timestamp,
            setupMode: context.setupMode,
            pivotWindow: context.pivotWindow,
            signalMode: context.signalMode,
            entryMode: context.entryMode,
            exitVariant: context.exitVariant,
        });
    if (!normalizedCandidateId) return candidate;
    candidate.normalizedCandidateId = normalizedCandidateId;
    candidate.normalizedTradeId = candidate.normalizedTradeId || normalizedCandidateId;
    return candidate;
}

export function createPaHigherLowLowerHighStrategy({ config = {}, meta = {} } = {}) {
    const runtimeConfig = buildPaHigherLowLowerHighRuntimeConfig(config);
    const resolvedConfig = runtimeConfig.strategy;
    const pipSize = pipSizeForSymbol(meta.symbol);
    const rows = [];
    const detectorState = createHigherLowLowerHighState(resolvedConfig);
    const trades = [];
    const structuredLogs = [];
    let openTrade = null;
    let pendingEntry = null;
    const simulationStats = {
        breakEntryExpiredCount: 0,
        breakEntryInvalidatedCount: 0,
        stopBelowMinDistanceCount: 0,
    };

    const contextBase = buildLogContext(resolvedConfig, meta);

    function log(kind, payload) {
        structuredLogs.push(buildStructuredEvent(kind, payload, contextBase));
    }

    function contextForCurrentRows() {
        return prepareHigherLowLowerHighContext(rows, resolvedConfig);
    }

    function onBar(rawRow) {
        const normalized = normalizeRows([rawRow]);
        if (!normalized.length) return { events: [] };
        const row = normalized[0];
        rows.push(row);
        const index = rows.length - 1;
        const context = contextForCurrentRows();
        const emitted = [];

        if (openTrade) {
            const previousRow = rows[index - 1] || null;
            if (shouldDailyForceClose(openTrade, previousRow, row, resolvedConfig)) {
                const forcedTrade = closeTrade(openTrade, index - 1, previousRow, previousRow.close, "daily_forced_close_utc", pipSize);
                trades.push(forcedTrade);
                openTrade = null;
                const payload = tradeToLogPayload(forcedTrade, rows, pipSize, contextBase, {
                    timestamp: forcedTrade.exitTimestamp,
                    barIndex: forcedTrade.exitIndex,
                    metadata: { tradeKey: forcedTrade.key },
                });
                log("trade_closed", payload);
                emitted.push({ type: "trade_closed", trade: forcedTrade });
            }
        }

        if (openTrade) {
            const closedTrade = maybeCloseTrade(openTrade, row, index, pipSize);
            if (closedTrade) {
                trades.push(closedTrade);
                openTrade = null;
                const payload = tradeToLogPayload(closedTrade, rows, pipSize, contextBase, {
                    timestamp: closedTrade.exitTimestamp,
                    barIndex: closedTrade.exitIndex,
                    metadata: { tradeKey: closedTrade.key },
                });
                log("trade_closed", payload);
                emitted.push({ type: "trade_closed", trade: closedTrade });
                return { events: emitted };
            }
            return { events: emitted };
        }

        if (pendingEntry) {
            const activation = maybeActivatePendingEntry(pendingEntry, row, index, pipSize, simulationStats);
            if (activation.status === "entered" && activation.trade) {
                if (!maybeRejectSmallStop(activation.trade, resolvedConfig, pipSize, simulationStats)) {
                    openTrade = activation.trade;
                    const payload = tradeToLogPayload(activation.trade, rows, pipSize, contextBase, {
                        metadata: {
                            entryTrigger: activation.reason || null,
                            tradeKey: activation.trade.key,
                            candidateKey: pendingEntry.key,
                        },
                    });
                    log("trade_opened", payload);
                    emitted.push({ type: "trade_opened", trade: activation.trade });
                } else {
                    log("trade_rejected", {
                        ...tradeToLogPayload(activation.trade, rows, pipSize, contextBase),
                        invalidationReason: "stop_below_min_distance",
                        metadata: { tradeKey: activation.trade.key, candidateKey: pendingEntry.key },
                    });
                    emitted.push({ type: "trade_rejected", reason: "stop_below_min_distance" });
                }
                pendingEntry = null;
                return { events: emitted };
            }
            if (activation.status === "expired" || activation.status === "invalidated") {
                log("entry_invalidated", {
                    timestamp: row.timestamp,
                    barIndex: index,
                    side: pendingEntry.side,
                    entryPrice: pendingEntry.side === "LONG" ? pendingEntry.signalRow.high : pendingEntry.signalRow.low,
                    stopPrice: pendingEntry.stopPrice,
                    structureRefs: pendingEntry.structureRefs || null,
                    signalCandle: candleSnapshot(pendingEntry.signalRow, pendingEntry.signalIndex),
                    confirmationType: pendingEntry.confirmationType || null,
                    invalidationReason: activation.reason,
                    metadata: { candidateKey: pendingEntry.key },
                });
                emitted.push({ type: activation.status, reason: activation.reason });
                pendingEntry = null;
            } else {
                return { events: emitted };
            }
        }

        const detectorStep = advanceHigherLowLowerHighDetector({ context, state: detectorState, index });
        for (const event of detectorStep.events) {
            if (event.type === "structure_armed") {
                const pivotCollection = event.side === "LONG" ? context.pivots.lows : context.pivots.highs;
                const pivot = pivotCollection.find((item) => item.pivotIndex === event.pivotIndex) || null;
                log("structure_armed", {
                    timestamp: row.timestamp,
                    barIndex: index,
                    side: event.side,
                    structureRefs:
                        event.side === "LONG"
                            ? { l1: pivotSnapshot(pivot?.previousPivot || null, rows), l2: pivotSnapshot(pivot, rows) }
                            : { h1: pivotSnapshot(pivot?.previousPivot || null, rows), h2: pivotSnapshot(pivot, rows) },
                    confirmationType: resolvedConfig.setupMode === "confirmed" ? "second_structure_confirmed" : "first_structure_confirmed",
                });
                emitted.push(event);
                continue;
            }

            if (event.type === "signal_wait_expired") {
                log("structure_invalidated", {
                    timestamp: row.timestamp,
                    barIndex: index,
                    side: event.side,
                    invalidationReason: "signal_wait_expired",
                });
                emitted.push(event);
                continue;
            }

            if (event.type === "signal_rejected") {
                const candidate = assignNormalizedIdentity(event.candidate, contextBase);
                log("signal_rejected", {
                    timestamp: candidate.signalTimestamp,
                    barIndex: candidate.signalIndex,
                    side: candidate.side,
                    structureRefs: candidate.structureRefs || null,
                    signalCandle: candleSnapshot(candidate.signalRow, candidate.signalIndex),
                    confirmationType: candidate.confirmationType || null,
                    invalidationReason: event.reason,
                    normalizedCandidateId: candidate.normalizedCandidateId || null,
                    normalizedTradeId: candidate.normalizedTradeId || candidate.normalizedCandidateId || null,
                    metadata: { candidateKey: candidate.key },
                });
                emitted.push(event);
                continue;
            }

            if (event.type !== "signal_candidate") continue;
            const candidate = assignNormalizedIdentity(event.candidate, contextBase);
            const previewEntryPrice =
                resolvedConfig.entryMode === "entry_on_close" ? row.close : candidate.side === "LONG" ? candidate.signalRow.high : candidate.signalRow.low;
            const previewStopPrice = buildStopPrice(candidate.side, candidate.signalRow, resolvedConfig.stopVariant, pipSize);
            const metrics = stopMetrics({
                stopPrice: previewStopPrice,
                entryPrice: previewEntryPrice,
                pipSize,
                signalRow: candidate.signalRow,
            });
            log("signal_candidate", {
                timestamp: candidate.signalTimestamp,
                barIndex: candidate.signalIndex,
                side: candidate.side,
                entryPrice: previewEntryPrice,
                stopPrice: previewStopPrice,
                stopDistancePips: metrics.stopDistancePips,
                stopDistanceAtr: metrics.stopDistanceAtr,
                structureRefs: candidate.structureRefs || null,
                signalCandle: candleSnapshot(candidate.signalRow, candidate.signalIndex),
                confirmationType: candidate.confirmationType || null,
                normalizedCandidateId: candidate.normalizedCandidateId || null,
                normalizedTradeId: candidate.normalizedTradeId || candidate.normalizedCandidateId || null,
                metadata: { candidateKey: candidate.key },
            });
            emitted.push(event);

            const qualityBlock = candidateQualityBlock(
                {
                    ...candidate,
                    entryLevel: previewEntryPrice,
                    stopPrice: previewStopPrice,
                    pipSize,
                },
                contextBase.symbol,
                resolvedConfig,
            );
            if (qualityBlock) {
                log("signal_rejected", {
                    timestamp: candidate.signalTimestamp,
                    barIndex: candidate.signalIndex,
                    side: candidate.side,
                    structureRefs: candidate.structureRefs || null,
                    signalCandle: candleSnapshot(candidate.signalRow, candidate.signalIndex),
                    confirmationType: candidate.confirmationType || null,
                    invalidationReason: qualityBlock.reason,
                    normalizedCandidateId: candidate.normalizedCandidateId || null,
                    normalizedTradeId: candidate.normalizedTradeId || candidate.normalizedCandidateId || null,
                    metadata: { candidateKey: candidate.key, ...(qualityBlock.context || {}) },
                });
                emitted.push({ type: "trade_rejected", reason: qualityBlock.reason });
                continue;
            }

            if (resolvedConfig.entryMode === "entry_on_close") {
                const trade = buildTradeFromSignal({
                    candidate,
                    entryIndex: index,
                    entryPrice: row.close,
                    config: resolvedConfig,
                    pipSize,
                });
                if (trade && !maybeRejectSmallStop(trade, resolvedConfig, pipSize, simulationStats)) {
                    openTrade = trade;
                    log(
                        "trade_opened",
                        tradeToLogPayload(trade, rows, pipSize, contextBase, {
                            metadata: { entryTrigger: "signal_close", tradeKey: trade.key, candidateKey: candidate.key },
                        }),
                    );
                    emitted.push({ type: "trade_opened", trade });
                    break;
                }
                if (trade) {
                    log("trade_rejected", {
                        ...tradeToLogPayload(trade, rows, pipSize, contextBase),
                        invalidationReason: "stop_below_min_distance",
                        metadata: { tradeKey: trade.key, candidateKey: candidate.key },
                    });
                    emitted.push({ type: "trade_rejected", reason: "stop_below_min_distance" });
                    break;
                }
            } else {
                pendingEntry = buildPendingEntry(candidate, resolvedConfig, pipSize);
                log("entry_pending", {
                    timestamp: candidate.signalTimestamp,
                    barIndex: candidate.signalIndex,
                    side: candidate.side,
                    entryPrice: candidate.side === "LONG" ? candidate.signalRow.high : candidate.signalRow.low,
                    stopPrice: pendingEntry.stopPrice,
                    stopDistancePips: metrics.stopDistancePips,
                    stopDistanceAtr: metrics.stopDistanceAtr,
                    structureRefs: candidate.structureRefs || null,
                    signalCandle: candleSnapshot(candidate.signalRow, candidate.signalIndex),
                    confirmationType: candidate.confirmationType || null,
                    normalizedCandidateId: candidate.normalizedCandidateId || null,
                    normalizedTradeId: candidate.normalizedTradeId || candidate.normalizedCandidateId || null,
                    metadata: { expiresAtBarIndex: pendingEntry.expiresAt, candidateKey: candidate.key },
                });
                emitted.push({ type: "entry_pending", pendingEntry });
                break;
            }
        }

        return { events: emitted };
    }

    function flush() {
        if (openTrade && rows.length) {
            const lastIndex = rows.length - 1;
            const forced = closeTrade(openTrade, lastIndex, rows[lastIndex], rows[lastIndex].close, "end_of_data", pipSize);
            trades.push(forced);
            openTrade = null;
            log(
                "trade_closed",
                tradeToLogPayload(forced, rows, pipSize, contextBase, {
                    timestamp: forced.exitTimestamp,
                    barIndex: forced.exitIndex,
                    metadata: { tradeKey: forced.key },
                }),
            );
            return forced;
        }
        return null;
    }

    function buildResult() {
        flush();
        const summary = summarizeTrades(trades);
        return {
            strategyId: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID,
            runtimeProfile: { ...PA_HIGHER_LOW_LOWER_HIGH_RUNTIME_PROFILE },
            scenarioId: scenarioId(resolvedConfig),
            config: resolvedConfig,
            summary,
            diagnostics: buildTradeDiagnostics(trades, {
                symbol: meta.symbol,
                realismStopThresholdPips: resolvedConfig.realismStopThresholdPips,
                simulationStats,
                detectorStats: detectorState.stats,
            }),
            trades,
            monthly: monthlyBreakdown(trades),
            pivots: contextForCurrentRows().pivots
                ? {
                      lowCount: contextForCurrentRows().pivots.lows.length,
                      highCount: contextForCurrentRows().pivots.highs.length,
                  }
                : { lowCount: 0, highCount: 0 },
            detectorStats: detectorState.stats,
            simulationStats,
            structuredLogs,
            score: scoreScenario(summary),
            rowsProcessed: rows.length,
        };
    }

    return {
        strategyId: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID,
        runtimeProfile: { ...PA_HIGHER_LOW_LOWER_HIGH_RUNTIME_PROFILE },
        config: resolvedConfig,
        onBar,
        flush,
        buildResult,
        getRows: () => [...rows],
        getStructuredLogs: () => [...structuredLogs],
        getTrades: () => [...trades],
    };
}

export function replayPaHigherLowLowerHighScenario(rows, config, meta = {}) {
    const engine = createPaHigherLowLowerHighStrategy({ config, meta });
    for (const row of rows || []) {
        engine.onBar(row);
    }
    return engine.buildResult();
}

function liveCandleRows(candles = {}, timeframe = "H1") {
    const keyByTimeframe = {
        D1: "d1Candles",
        H4: "h4Candles",
        H1: "h1Candles",
        M15: "m15Candles",
        M5: "m5Candles",
        M1: "m1Candles",
    };
    const key = keyByTimeframe[String(timeframe || "H1").toUpperCase()] || "h1Candles";
    const rows = normalizeRows(candles?.[key]);
    return rows.length > 1 ? rows.slice(0, -1) : rows;
}

function collectLiveCandidates(rows, config) {
    const state = createHigherLowLowerHighState(config);
    const candidates = [];

    for (let index = 0; index < rows.length; index += 1) {
        const context = prepareHigherLowLowerHighContext(rows.slice(0, index + 1), config);
        const step = advanceHigherLowLowerHighDetector({ context, state, index });
        for (const event of step.events) {
            if (event.type === "signal_candidate") {
                candidates.push(event.candidate);
            }
        }
    }

    return candidates;
}

function breakWasAlreadyTouched({ candidate, rows, entryLevel, stopPrice }) {
    for (let index = candidate.signalIndex + 1; index < rows.length; index += 1) {
        const row = rows[index];
        if (candidate.side === "LONG") {
            if (row.low <= stopPrice) return true;
            if (row.high >= entryLevel) return true;
        } else {
            if (row.high >= stopPrice) return true;
            if (row.low <= entryLevel) return true;
        }
    }
    return false;
}

function triggeredByCurrentPrice(candidate, bid, ask, entryLevel) {
    const currentBid = Number(bid);
    const currentAsk = Number(ask);
    if (candidate.side === "LONG") return Number.isFinite(currentAsk) && currentAsk >= entryLevel;
    return Number.isFinite(currentBid) && currentBid <= entryLevel;
}

function findTriggeredLiveCandidate({ candidates, rows, symbol, bid, ask, config }) {
    const pipSize = pipSizeForSymbol(symbol);
    const currentIndex = rows.length - 1;

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];
        const barsSinceSignal = currentIndex - candidate.signalIndex;
        if (barsSinceSignal < 0 || barsSinceSignal > Number(config.entryBreakMaxBars || 3)) continue;

        const stopPrice = buildStopPrice(candidate.side, candidate.signalRow, config.stopVariant, pipSize, candidate);
        const entryLevel = candidate.side === "LONG" ? candidate.signalRow.high : candidate.signalRow.low;
        if (!Number.isFinite(stopPrice) || !Number.isFinite(entryLevel)) continue;
        if (breakWasAlreadyTouched({ candidate, rows, entryLevel, stopPrice })) continue;
        if (!triggeredByCurrentPrice(candidate, bid, ask, entryLevel)) continue;

        return { ...candidate, entryLevel, stopPrice, pipSize };
    }

    return null;
}

function findLatestCloseEntryCandidate({ candidates, rows, symbol, config }) {
    const currentIndex = rows.length - 1;
    const pipSize = pipSizeForSymbol(symbol);

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];
        if (candidate.signalIndex !== currentIndex) continue;

        const entryLevel = candidate.signalRow.close;
        const stopPrice = buildStopPrice(candidate.side, candidate.signalRow, config.stopVariant, pipSize, candidate);
        if (!Number.isFinite(entryLevel) || !Number.isFinite(stopPrice)) continue;

        return { ...candidate, entryLevel, stopPrice, pipSize };
    }

    return null;
}

function pickStrategyProfileFields(profile = {}) {
    const allowed = [
        "setupMode",
        "pivotWindow",
        "signalMode",
        "entryMode",
        "stopVariant",
        "exitVariant",
        "timeframe",
        "maxSignalWaitBars",
        "entryBreakMaxBars",
        "takeProfitR",
        "safetyTakeProfitR",
        "minStopDistancePips",
        "dailyForcedCloseUTC",
        "avoidHoursUTC",
        "maxStopPips",
        "managementProfile",
    ];
    return Object.fromEntries(allowed.filter((key) => Object.hasOwn(profile, key)).map((key) => [key, profile[key]]));
}

function resolveSymbolConfig(baseConfig, symbol) {
    const profile = HLLH_SYMBOL_PROFILES?.[String(symbol || "").toUpperCase()];
    if (!profile?.enabled) return baseConfig;
    return {
        ...baseConfig,
        ...pickStrategyProfileFields(profile),
    };
}

function signalHourUTC(candidate) {
    const ts = candidate?.signalTimestamp || candidate?.signalRow?.timestamp;
    if (!ts) return null;
    const hour = new Date(ts).getUTCHours();
    return Number.isInteger(hour) ? hour : null;
}

function weekendEntryBlock(candidate) {
    if (!RISK.WEEKEND_FLAT) return null;

    const ts = candidate?.signalTimestamp || candidate?.signalRow?.timestamp;
    if (!ts) return null;

    const date = new Date(ts);
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    if (!Number.isInteger(day) || !Number.isInteger(hour)) return null;

    const lastEntryHour = Number.isFinite(Number(RISK.FRIDAY_LAST_ENTRY_HOUR_UTC)) ? Number(RISK.FRIDAY_LAST_ENTRY_HOUR_UTC) : 18;
    if (day === 5 && hour >= lastEntryHour) {
        return {
            reason: "hllh_weekend_entry_block",
            context: { signalDayUTC: day, signalHourUTC: hour, fridayLastEntryHourUTC: lastEntryHour },
        };
    }

    if (day === 6 || (day === 0 && hour < 22)) {
        return {
            reason: "hllh_weekend_market_closed_block",
            context: { signalDayUTC: day, signalHourUTC: hour },
        };
    }

    return null;
}

function dailyEntryBlock(candidate) {
    if (!RISK.DAILY_FORCED_CLOSE_UTC) return null;

    const ts = candidate?.signalTimestamp || candidate?.signalRow?.timestamp;
    if (!ts) return null;

    const date = new Date(ts);
    const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
    const lastEntryMinute = Number.isFinite(Number(RISK.DAILY_LAST_ENTRY_MINUTE_UTC)) ? Number(RISK.DAILY_LAST_ENTRY_MINUTE_UTC) : 23 * 60 + 30;
    if (minuteOfDay >= lastEntryMinute) {
        return {
            reason: "hllh_daily_flat_entry_block",
            context: { signalMinuteUTC: minuteOfDay, dailyLastEntryMinuteUTC: lastEntryMinute },
        };
    }

    return null;
}

function candidateStopDistancePips(candidate, symbol, config) {
    const pipSize = candidate?.pipSize || pipSizeForSymbol(symbol);
    const entry = Number(candidate?.entryLevel);
    const stop = Number(candidate?.stopPrice);
    if (![entry, stop, pipSize].every(Number.isFinite) || pipSize <= 0) return null;
    return Math.abs(entry - stop) / pipSize;
}

function candidateQualityBlock(candidate, symbol, config) {
    const weekendBlock = weekendEntryBlock(candidate);
    if (weekendBlock) return weekendBlock;

    const dailyBlock = dailyEntryBlock(candidate);
    if (dailyBlock) return dailyBlock;

    const avoidHours = Array.isArray(config.avoidHoursUTC) ? config.avoidHoursUTC.map((hour) => Number(hour)).filter(Number.isInteger) : [];
    const hour = signalHourUTC(candidate);
    if (hour !== null && avoidHours.includes(hour)) {
        return {
            reason: "hllh_avoid_hour_utc",
            context: { signalHourUTC: hour, avoidHoursUTC: avoidHours },
        };
    }

    const maxStopPips = Number(config.maxStopPips);
    const stopDistancePips = candidateStopDistancePips(candidate, symbol, config);
    if (Number.isFinite(maxStopPips) && maxStopPips > 0 && Number.isFinite(stopDistancePips) && stopDistancePips > maxStopPips) {
        return {
            reason: "hllh_stop_distance_above_max",
            context: { stopDistancePips, maxStopPips },
        };
    }

    return null;
}

function buildLiveSignalContext({ candidate, symbol, direction, config }) {
    const normalizedCandidateId = buildHllhStableCandidateIdentity({
        symbol,
        side: candidate.side,
        signalTimestamp: candidate.signalTimestamp,
        setupMode: config.setupMode,
        pivotWindow: config.pivotWindow,
        signalMode: config.signalMode,
        entryMode: config.entryMode,
        exitVariant: config.exitVariant,
    });

    return {
        strategyType: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID,
        symbol,
        side: candidate.side,
        direction,
        setupMode: config.setupMode,
        pivotWindow: config.pivotWindow,
        signalMode: config.signalMode,
        entryMode: config.entryMode,
        stopVariant: config.stopVariant,
        exitVariant: config.exitVariant,
        timeframe: config.timeframe,
        signalTimestamp: candidate.signalTimestamp,
        normalizedCandidateId,
        expectedEntryPrice: candidate.entryLevel,
        expectedStopPrice: candidate.stopPrice,
        takeProfitR: config.takeProfitR,
        safetyTakeProfitR: config.safetyTakeProfitR,
        dailyForcedCloseUTC: config.dailyForcedCloseUTC,
        managementProfile: config.managementProfile ? { ...config.managementProfile } : null,
        signalCandle: {
            timestamp: candidate.signalRow.timestamp,
            open: candidate.signalRow.open,
            high: candidate.signalRow.high,
            low: candidate.signalRow.low,
            close: candidate.signalRow.close,
        },
        structure: {
            sequence: candidate.sequence,
            pivotIndex: candidate.structurePivotIndex,
            confirmIndex: candidate.structureConfirmIndex,
            previousPivotTimestamp: candidate.previousPivot?.timestamp ?? null,
            currentPivotTimestamp: candidate.currentPivot?.timestamp ?? null,
        },
    };
}

export function createPaHigherLowLowerHighLiveStrategy(overrides = {}) {
    const config = { ...PA_HLLH_CONFIG, ...overrides };

    return {
        id: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID,
        name: "paHigherLowLowerHigh",
        config,

        evaluate({ symbol, candles, bid, ask } = {}) {
            const activeConfig = resolveSymbolConfig(config, symbol);
            const rows = liveCandleRows(candles, activeConfig.timeframe);
            if (rows.length < activeConfig.pivotWindow * 2 + 20) {
                return {
                    signal: null,
                    reason: "hllh_insufficient_timeframe_history",
                    context: { strategyType: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID },
                };
            }

            const candidates = collectLiveCandidates(rows, activeConfig);
            const candidate =
                activeConfig.entryMode === "entry_on_close"
                    ? findLatestCloseEntryCandidate({ candidates, rows, symbol, config: activeConfig })
                    : findTriggeredLiveCandidate({ candidates, rows, symbol, bid, ask, config: activeConfig });
            if (!candidate) {
                return {
                    signal: null,
                    reason: activeConfig.entryMode === "entry_on_close" ? "hllh_no_close_entry" : "hllh_no_break_entry",
                    context: {
                        strategyType: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID,
                        candidatesSeen: candidates.length,
                        latestClosedTimeframe: rows[rows.length - 1]?.timestamp ?? null,
                    },
                };
            }

            const qualityBlock = candidateQualityBlock(candidate, symbol, activeConfig);
            if (qualityBlock) {
                return {
                    signal: null,
                    reason: qualityBlock.reason,
                    context: {
                        strategyType: PA_HIGHER_LOW_LOWER_HIGH_STRATEGY_ID,
                        ...qualityBlock.context,
                        candidatesSeen: candidates.length,
                        latestClosedTimeframe: rows[rows.length - 1]?.timestamp ?? null,
                    },
                };
            }

            const direction = candidate.side === "LONG" ? "BUY" : "SELL";
            return {
                signal: direction,
                reason: activeConfig.entryMode === "entry_on_close" ? "pa_hllh_entry_on_close" : "pa_hllh_entry_on_break",
                context: buildLiveSignalContext({ candidate, symbol, direction, config: activeConfig }),
            };
        },
    };
}
