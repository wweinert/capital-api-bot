import { BollingerBands, EMA, MACD, RSI } from "technicalindicators";

export const ENTRY_RESEARCH_PROFILE = {
    id: "LEGACY_HYBRID_SCORING",
    name: "legacy_hybrid_scoring",
    timeframe: "M15",
    allowedHoursUtc: [],
    params: {
        riskPct: 0.02,
        takeProfitR: 2,
        atrStopMultiplier: 1.5,
        minStopPips: 0,
        maxStopPips: 999,
        maxSpreadPctOfStop: 999,
        maxSpreadAbsPips: 999,
        threshold: 3,
        h1RsiOversold: 35,
        h1RsiOverbought: 65,
        m15RsiOversold: 30,
        m15RsiOverbought: 70,
    },
};

export const SCORING_RUNTIME_POLICY = {
    profileName: "top3_each_session",
    maxPositions: 5,
    riskPct: 0.02,
    sessionPriority: ["NY", "LONDON", "TOKYO", "SYDNEY"],
    sessionThresholds: {
        NY: 3,
        LONDON: 3,
        TOKYO: 3,
        SYDNEY: 3,
    },
    topSymbolsBySession: {
        NY: ["EURUSD", "USDJPY"],
        LONDON: ["EURUSD", "AUDJPY"],
        TOKYO: ["EURUSD", "AUDJPY", "USDJPY"],
        SYDNEY: ["EURUSD", "USDJPY"],
    },
};

const COMMON_SCORING_PARAMS = {
    ...ENTRY_RESEARCH_PROFILE.params,
    riskPct: SCORING_RUNTIME_POLICY.riskPct,
};

export const ENTRY_SESSION_PROFILES = [
    {
        id: "ENTRY_SESSION_NY_TOP3_00400",
        name: "session_ny_top3_00400",
        session: "NY",
        timeframe: "M15",
        symbols: [...SCORING_RUNTIME_POLICY.topSymbolsBySession.NY],
        allowedHoursUtc: [13, 14, 15, 16, 17, 18, 19, 20],
        params: { ...COMMON_SCORING_PARAMS, threshold: 3 },
    },
    {
        id: "ENTRY_SESSION_LONDON_TOP3_00400",
        name: "session_london_top3_00400",
        session: "LONDON",
        timeframe: "M15",
        symbols: [...SCORING_RUNTIME_POLICY.topSymbolsBySession.LONDON],
        allowedHoursUtc: [8, 9, 10, 11, 12, 13, 14, 15, 16],
        params: { ...COMMON_SCORING_PARAMS, threshold: 3 },
    },
    {
        id: "ENTRY_SESSION_TOKYO_TOP3_00400",
        name: "session_tokyo_top3_00400",
        session: "TOKYO",
        timeframe: "M15",
        symbols: [...SCORING_RUNTIME_POLICY.topSymbolsBySession.TOKYO],
        allowedHoursUtc: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        params: { ...COMMON_SCORING_PARAMS, threshold: 3 },
    },
    {
        id: "ENTRY_SESSION_SYDNEY_TOP3_00400",
        name: "session_sydney_top3_00400",
        session: "SYDNEY",
        timeframe: "M15",
        symbols: [...SCORING_RUNTIME_POLICY.topSymbolsBySession.SYDNEY],
        allowedHoursUtc: [22, 23, 0, 1, 2, 3, 4, 5, 6],
        params: { ...COMMON_SCORING_PARAMS, threshold: 3 },
    },
];

const TIMEFRAME_MINUTES = {
    M1: 1,
    M5: 5,
    M15: 15,
    H1: 60,
};

function toNum(value) {
    if (value === undefined || value === null || value === "") return null;
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

function barTimeMs(bar) {
    const direct = toNum(bar?.tsMs);
    if (direct !== null) return direct;
    const raw = bar?.timestamp ?? bar?.t;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
}

function barOpen(bar) {
    return toNum(bar?.open ?? bar?.o);
}

function barHigh(bar) {
    return toNum(bar?.high ?? bar?.h);
}

function barLow(bar) {
    return toNum(bar?.low ?? bar?.l);
}

function barClose(bar) {
    return toNum(bar?.close ?? bar?.c);
}

function normalizeBars(rows = []) {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => ({
            timestamp: row?.timestamp ?? row?.t ?? null,
            tsMs: barTimeMs(row),
            open: barOpen(row),
            high: barHigh(row),
            low: barLow(row),
            close: barClose(row),
        }))
        .filter((row) => row.timestamp && [row.tsMs, row.open, row.high, row.low, row.close].every(Number.isFinite))
        .sort((left, right) => left.tsMs - right.tsMs);
}

function aggregateBars(rows = [], timeframeMs = 4 * 60 * 60_000) {
    const bars = normalizeBars(rows);
    if (!bars.length) return [];

    const groups = new Map();
    for (const bar of bars) {
        const bucket = Math.floor(bar.tsMs / timeframeMs) * timeframeMs;
        const current = groups.get(bucket);
        if (!current) {
            groups.set(bucket, {
                timestamp: new Date(bucket).toISOString(),
                tsMs: bucket,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
            });
            continue;
        }

        current.high = Math.max(current.high, bar.high);
        current.low = Math.min(current.low, bar.low);
        current.close = bar.close;
    }

    return [...groups.values()].sort((left, right) => left.tsMs - right.tsMs);
}

function contextBarsFor(context, timeframe) {
    if (!context || typeof context !== "object") return [];
    const key = String(timeframe || "").toLowerCase();
    const rows = context[key] || context[String(timeframe || "").toUpperCase()];
    return normalizeBars(rows);
}

function pipSize(symbol) {
    return String(symbol || "").trim().toUpperCase().endsWith("JPY") ? 0.01 : 0.0001;
}

function indicatorSnapshot(rows = [], { trendFast = 50, trendSlow = 200, entryFast = 9, entrySlow = 21 } = {}) {
    const bars = normalizeBars(rows);
    if (bars.length < Math.max(trendSlow, 40)) return null;

    const closes = bars.map((bar) => bar.close);

    const emaFastSeries = EMA.calculate({ period: trendFast, values: closes });
    const emaSlowSeries = EMA.calculate({ period: trendSlow, values: closes });
    const ema9Series = EMA.calculate({ period: entryFast, values: closes });
    const ema21Series = EMA.calculate({ period: entrySlow, values: closes });
    const rsiSeries = RSI.calculate({ period: 14, values: closes });
    const bbSeries = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
    const macdSeries = MACD.calculate({
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        values: closes,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
    });

    const lastClose = closes.at(-1);
    const emaFastNow = emaFastSeries.at(-1) ?? null;
    const emaSlowNow = emaSlowSeries.at(-1) ?? null;
    const ema9Now = ema9Series.at(-1) ?? null;
    const ema21Now = ema21Series.at(-1) ?? null;
    const ema9Prev = ema9Series.at(-2) ?? null;
    const ema21Prev = ema21Series.at(-2) ?? null;
    const rsiNow = rsiSeries.at(-1) ?? null;
    const bbNow = bbSeries.at(-1) ?? null;
    const macdNow = macdSeries.at(-1) ?? null;
    const macdHist = Number.isFinite(macdNow?.histogram) ? macdNow.histogram : null;

    const tr = [];
    for (let index = 1; index < bars.length; index += 1) {
        const high = bars[index].high;
        const low = bars[index].low;
        const prevClose = bars[index - 1].close;
        tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    const atrSeries = tr.length >= 14 ? tr.slice(-14) : [];
    const atr = atrSeries.length ? atrSeries.reduce((sum, value) => sum + value, 0) / atrSeries.length : null;

    return {
        lastClose,
        emaFast: emaFastNow,
        emaSlow: emaSlowNow,
        ema9: ema9Now,
        ema21: ema21Now,
        ema9Prev,
        ema21Prev,
        rsi: rsiNow,
        bb: bbNow ?? null,
        macd: macdNow ?? null,
        macdHist,
        atr,
        isBullishTrend:
            [emaFastNow, emaSlowNow, lastClose].every(Number.isFinite)
                ? emaFastNow > emaSlowNow && lastClose > emaFastNow
                : false,
        isBearishTrend:
            [emaFastNow, emaSlowNow, lastClose].every(Number.isFinite)
                ? emaFastNow < emaSlowNow && lastClose < emaFastNow
                : false,
        isBullishCross:
            [ema9Now, ema21Now, ema9Prev, ema21Prev].every(Number.isFinite)
                ? ema9Now > ema21Now && ema9Prev <= ema21Prev
                : false,
        isBearishCross:
            [ema9Now, ema21Now, ema9Prev, ema21Prev].every(Number.isFinite)
                ? ema9Now < ema21Now && ema9Prev >= ema21Prev
                : false,
    };
}

function scoreConditions(side, { higher, middle, setup, bid, ask, params }) {
    const buy = side === "BUY";
    const h1RsiOversold = Number(params.h1RsiOversold ?? 35);
    const h1RsiOverbought = Number(params.h1RsiOverbought ?? 65);
    const m15RsiOversold = Number(params.m15RsiOversold ?? 30);
    const m15RsiOverbought = Number(params.m15RsiOverbought ?? 70);

    if (buy) {
        return [
            { key: "higher_trend_bull", passed: Boolean(higher?.isBullishTrend) || ([higher?.emaFast, higher?.emaSlow].every(Number.isFinite) && higher.emaFast > higher.emaSlow) },
            { key: "higher_macd_bull", passed: Number.isFinite(higher?.macdHist) && higher.macdHist > 0 },
            { key: "h1_ema9_above_ema21", passed: [middle?.ema9, middle?.ema21].every(Number.isFinite) && middle.ema9 > middle.ema21 },
            { key: "h1_rsi_oversold", passed: Number.isFinite(middle?.rsi) && middle.rsi < h1RsiOversold },
            { key: "m15_bullish_cross", passed: Boolean(setup?.isBullishCross) },
            { key: "m15_rsi_oversold", passed: Number.isFinite(setup?.rsi) && setup.rsi < m15RsiOversold },
            { key: "m15_at_lower_band", passed: Number.isFinite(bid) && Number.isFinite(setup?.bb?.lower) && bid <= setup.bb.lower },
        ];
    }

    return [
        { key: "higher_trend_bear", passed: Boolean(higher?.isBearishTrend) || ([higher?.emaFast, higher?.emaSlow].every(Number.isFinite) && higher.emaFast < higher.emaSlow) },
        { key: "higher_macd_bear", passed: Number.isFinite(higher?.macdHist) && higher.macdHist < 0 },
        { key: "h1_ema9_below_ema21", passed: [middle?.ema9, middle?.ema21].every(Number.isFinite) && middle.ema9 < middle.ema21 },
        { key: "h1_rsi_overbought", passed: Number.isFinite(middle?.rsi) && middle.rsi > h1RsiOverbought },
        { key: "m15_bearish_cross", passed: Boolean(setup?.isBearishCross) },
        { key: "m15_rsi_overbought", passed: Number.isFinite(setup?.rsi) && setup.rsi > m15RsiOverbought },
        { key: "m15_at_upper_band", passed: Number.isFinite(ask) && Number.isFinite(setup?.bb?.upper) && ask >= setup.bb.upper },
    ];
}

function resolveThreshold(profile) {
    if (Number.isFinite(Number(profile?.threshold))) return Number(profile.threshold);
    if (Number.isFinite(Number(profile?.params?.threshold))) return Number(profile.params.threshold);
    if (Number.isFinite(Number(profile?.params?.scoreThreshold))) return Number(profile.params.scoreThreshold);
    return getScoringThresholdForSession(profile?.session);
}

function buildScoringDecision({ context, bid, ask, profile }) {
    const h4Bars = contextBarsFor(context, "H4");
    const h1Bars = contextBarsFor(context, "H1");
    const m15Bars = contextBarsFor(context, "M15");
    if (h4Bars.length < 200 || h1Bars.length < 200 || m15Bars.length < 200) {
        return {
            signal: null,
            buyScore: 0,
            sellScore: 0,
            reason: "indicator_history_short",
            threshold: resolveThreshold(profile),
        };
    }

    const higher = indicatorSnapshot(h4Bars, { trendFast: 50, trendSlow: 200, entryFast: 9, entrySlow: 21 });
    const middle = indicatorSnapshot(h1Bars, { trendFast: 50, trendSlow: 200, entryFast: 9, entrySlow: 21 });
    const setup = indicatorSnapshot(m15Bars, { trendFast: 50, trendSlow: 200, entryFast: 9, entrySlow: 21 });
    if (!higher || !middle || !setup) {
        return {
            signal: null,
            buyScore: 0,
            sellScore: 0,
            reason: "indicator_snapshot_missing",
            threshold: resolveThreshold(profile),
        };
    }

    const params = profile?.params || {};
    const buyConditions = scoreConditions("BUY", { higher, middle, setup, bid, ask, params });
    const sellConditions = scoreConditions("SELL", { higher, middle, setup, bid, ask, params });
    const buyScore = buyConditions.reduce((sum, condition) => sum + (condition.passed ? 1 : 0), 0);
    const sellScore = sellConditions.reduce((sum, condition) => sum + (condition.passed ? 1 : 0), 0);
    const threshold = resolveThreshold(profile);

    if (buyScore < threshold && sellScore < threshold) {
        return {
            signal: null,
            buyScore,
            sellScore,
            threshold,
            reason: "score_below_threshold",
            buyConditions,
            sellConditions,
            higher,
            middle,
            setup,
        };
    }

    if (buyScore === sellScore) {
        return {
            signal: null,
            buyScore,
            sellScore,
            threshold,
            reason: "score_tie",
            buyConditions,
            sellConditions,
            higher,
            middle,
            setup,
        };
    }

    const signal = buyScore > sellScore ? "BUY" : "SELL";
    const score = Math.max(buyScore, sellScore);
    const opposingScore = Math.min(buyScore, sellScore);
    const rankingScore = score + Math.max(0, score - opposingScore) * 0.35;

    return {
        signal,
        buyScore,
        sellScore,
        threshold,
        score,
        opposingScore,
        rankingScore,
        buyConditions,
        sellConditions,
        higher,
        middle,
        setup,
        reason: "score_signal",
    };
}

export function entryTimeframeMinutes(timeframe) {
    return TIMEFRAME_MINUTES[String(timeframe || "").toUpperCase()] || 15;
}

export function getEntryProfileForSymbol({ symbol, nowMs = Date.now(), sessions = [] } = {}) {
    const upperSymbol = String(symbol || "").trim().toUpperCase();
    const hour = new Date(nowMs).getUTCHours();
    const activeSessions = new Set(
        (Array.isArray(sessions) ? sessions : [])
            .map((value) => String(value || "").trim().toUpperCase())
            .filter(Boolean),
    );

    const matches = ENTRY_SESSION_PROFILES.filter((profile) => {
        const symbols = Array.isArray(profile.symbols) ? profile.symbols.map((value) => String(value).toUpperCase()) : [];
        const hours = Array.isArray(profile.allowedHoursUtc) ? profile.allowedHoursUtc.map(Number) : [];
        return symbols.includes(upperSymbol) && hours.includes(hour);
    });

    if (!matches.length) return null;
    if (!activeSessions.size) return matches[0];
    return matches.find((profile) => activeSessions.has(String(profile.session || "").toUpperCase())) || matches[0];
}

export function getScoringThresholdForSession(session) {
    const key = String(session || "").trim().toUpperCase();
    return Number(SCORING_RUNTIME_POLICY.sessionThresholds[key] ?? 3);
}

export function getScoringSessionPriority(session) {
    const key = String(session || "").trim().toUpperCase();
    const index = SCORING_RUNTIME_POLICY.sessionPriority.indexOf(key);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function shouldEnter({ bars, context, m5AtrPct, spread, symbol, equity, params, nowMs, bid, ask }) {
    const profile = {
        ...ENTRY_RESEARCH_PROFILE,
        params: {
            ...ENTRY_RESEARCH_PROFILE.params,
            ...(params || {}),
        },
    };

    const allowedHoursUtc = Array.isArray(profile.params.allowedHoursUtc)
        ? profile.params.allowedHoursUtc
        : Array.isArray(profile.allowedHoursUtc)
            ? profile.allowedHoursUtc
            : [];

    if (allowedHoursUtc.length) {
        const hour = new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).getUTCHours();
        if (!allowedHoursUtc.map(Number).includes(hour)) {
            return { signal: null, reason: "outside_research_hours" };
        }
    }

    const entryBars = normalizeBars(bars);
    if (entryBars.length < 20) {
        return { signal: null, reason: "not_enough_bars" };
    }

    const decision = buildScoringDecision({
        context,
        bid: toNum(bid) ?? barClose(entryBars.at(-1)),
        ask: toNum(ask) ?? barClose(entryBars.at(-1)),
        profile: {
            session: profile.params.session,
            threshold: profile.params.threshold,
            params: profile.params,
        },
    });

    if (!decision.signal) {
        return {
            signal: null,
            reason: decision.reason || "no_signal",
            quality: {
                score: Math.max(decision.buyScore || 0, decision.sellScore || 0),
                threshold: decision.threshold ?? resolveThreshold({ session: profile.params.session, params: profile.params }),
                rankingScore: null,
                metrics: {
                    buyScore: decision.buyScore || 0,
                    sellScore: decision.sellScore || 0,
                },
            },
        };
    }

    const entry = decision.signal === "BUY"
        ? toNum(ask) ?? barClose(entryBars.at(-1))
        : toNum(bid) ?? barClose(entryBars.at(-1));
    const pip = pipSize(symbol);
    const atr = toNum(decision.setup?.atr);
    const atrStopMultiplier = Math.max(0.1, Number(profile.params.atrStopMultiplier ?? 1.5));
    const minStopPips = Math.max(0.1, Number(profile.params.minStopPips ?? 2));
    const maxStopPips = Math.max(minStopPips, Number(profile.params.maxStopPips ?? 14));
    const stopDistance = Math.max(
        Number.isFinite(atr) ? atr * atrStopMultiplier : 0,
        minStopPips * pip,
    );

    if (!(Number.isFinite(entry) && entry > 0 && stopDistance > 0)) {
        return { signal: null, reason: "invalid_entry_or_stop" };
    }

    const stopPips = stopDistance / pip;

    const takeProfitR = Number(profile.params.takeProfitR ?? 2);
    const sl = decision.signal === "BUY" ? entry - stopDistance : entry + stopDistance;
    const tp = decision.signal === "BUY" ? entry + stopDistance * takeProfitR : entry - stopDistance * takeProfitR;
    const riskPct = Number(profile.params.riskPct ?? SCORING_RUNTIME_POLICY.riskPct);
    const riskAmount = Number.isFinite(equity) && equity > 0 ? equity * riskPct : null;
    const size = Number.isFinite(riskAmount) ? riskAmount / stopDistance : null;

    return {
        signal: decision.signal,
        entry,
        sl,
        tp,
        stopDistance,
        stopPips,
        size,
        riskPct,
        riskAmount,
        takeProfitR,
        buyScore: decision.buyScore,
        sellScore: decision.sellScore,
        quality: {
            score: decision.score,
            threshold: decision.threshold,
            rankingScore: decision.rankingScore,
            metrics: {
                buyScore: decision.buyScore,
                sellScore: decision.sellScore,
            },
        },
        reason: decision.reason,
    };
}

export function evaluateScoringEntry({ service, prepared, guard = null } = {}) {
    const {
        upperSymbol,
        signalTimestamp,
        entryProfile,
        entryTimeframe,
        entryBars,
        m5AtrPct,
        spread,
        snapshot,
        snapshotValidation,
        bidNum,
        askNum,
    } = prepared;

    const primary = shouldEnter({
        bars: entryBars,
        context: snapshot.history,
        m5AtrPct,
        spread,
        symbol: upperSymbol,
        equity: service.accountBalance,
        bid: bidNum,
        ask: askNum,
        params: {
            ...entryProfile.params,
            session: entryProfile.session,
            allowedHoursUtc: entryProfile.allowedHoursUtc,
            timeframe: entryTimeframe,
        },
        nowMs: Date.parse(signalTimestamp),
    });

    const decisionSnippet = service.buildEntryDecisionSnippet({
        symbol: upperSymbol,
        signalTimestamp,
        entryProfile,
        entryBars,
        m5AtrPct,
        spread,
        primary,
        snapshotValidation,
        guard,
    });

    const signal = primary?.signal || null;
    const side = signal === "BUY" ? "LONG" : signal === "SELL" ? "SHORT" : null;
    const orderPlan = signal
        ? {
              symbol: upperSymbol,
              side,
              entryType: "MARKET",
              size: service.toNumber(primary.size),
              entryPrice: service.toNumber(primary.entry),
              requestedPrice: service.toNumber(primary.entry),
              sl: service.toNumber(primary.sl),
              tp: service.toNumber(primary.tp),
              stopDistance: service.toNumber(primary.stopDistance),
              stopPips: service.toNumber(primary.stopPips),
              riskAmount: service.toNumber(primary.riskAmount),
              riskPct: service.toNumber(primary.riskPct),
              rr: service.toNumber(primary.takeProfitR),
              qualityScore: Number.isFinite(primary?.quality?.score) ? primary.quality.score : null,
              qualityThreshold: Number.isFinite(primary?.quality?.threshold) ? primary.quality.threshold : null,
              rankingScore: Number.isFinite(primary?.quality?.rankingScore) ? primary.quality.rankingScore : null,
              tpDistance: Number.isFinite(primary?.entry) && Number.isFinite(primary?.tp) ? Math.abs(primary.tp - primary.entry) : null,
              buyScore: Number.isFinite(primary?.buyScore) ? primary.buyScore : null,
              sellScore: Number.isFinite(primary?.sellScore) ? primary.sellScore : null,
              planReasons: [entryProfile.id, primary.reason || "signal"],
          }
        : null;

    const decision = {
        strategyId: entryProfile.id,
        symbol: upperSymbol,
        timestamp: signalTimestamp,
        rawEntryDecision: primary,
        finalSignal: side,
        orderPlan,
        reasons: [primary?.reason || "no_signal"],
        step1: {
            activeSession: entryProfile.name,
            activeSessions: [entryProfile.name],
            symbolAllowed: true,
            forceFlatNow: false,
            hourBucketUtc: new Date(signalTimestamp).getUTCHours(),
            step1Reasons: [`entry_hours=${entryProfile.allowedHoursUtc.join(",")}`, `entry_tf=${entryTimeframe}`],
            logFields: { preferredSymbolSessions: [] },
        },
        step2: {
            regimeType: "LEGACY_SCORING",
            trendBias: side || null,
            contextReasons: [`buyScore=${primary?.buyScore ?? 0}`, `sellScore=${primary?.sellScore ?? 0}`],
            logFields: { h1Adx: null },
            volatilityRegime: null,
        },
        step3: {
            setupType: signal ? "LEGACY_SCORING_TRIGGER" : "NONE",
            side,
            logFields: {},
            reasons: [primary?.reason || "no_signal"],
        },
        step4: {
            triggerOk: Boolean(signal),
            side,
            triggerReasons: [primary?.reason || "no_signal"],
        },
        guardrails: { allowed: true, blockReasons: [], checks: {} },
        step5: {
            valid: Boolean(orderPlan),
            planReasons: orderPlan?.planReasons || [primary?.reason || "no_signal"],
            logFields: {
                riskPct: orderPlan?.riskPct || null,
                riskAmount: orderPlan?.riskAmount || null,
                stopDistance: orderPlan?.stopDistance || null,
                rr: orderPlan?.rr || null,
                qualityScore: orderPlan?.qualityScore || null,
                qualityThreshold: orderPlan?.qualityThreshold || null,
                rankingScore: orderPlan?.rankingScore || null,
            },
        },
    };

    return {
        primary,
        signal,
        side,
        orderPlan,
        decision,
        decisionSnippet,
        reason: (Array.isArray(decision.reasons) && decision.reasons.length ? decision.reasons : ["intraday_no_reason"]).join("|"),
    };
}

export function compareScoringCandidates(left, right) {
    const leftRank = Number(left?.orderPlan?.rankingScore ?? Number.NEGATIVE_INFINITY);
    const rightRank = Number(right?.orderPlan?.rankingScore ?? Number.NEGATIVE_INFINITY);
    if (leftRank !== rightRank) return rightRank - leftRank;

    const leftScore = Number(left?.orderPlan?.qualityScore ?? Number.NEGATIVE_INFINITY);
    const rightScore = Number(right?.orderPlan?.qualityScore ?? Number.NEGATIVE_INFINITY);
    if (leftScore !== rightScore) return rightScore - leftScore;

    const leftPriority = getScoringSessionPriority(left?.entryProfile?.session);
    const rightPriority = getScoringSessionPriority(right?.entryProfile?.session);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;

    const leftSpread = Number(left?.decisionSnippet?.spreadPips ?? Number.POSITIVE_INFINITY);
    const rightSpread = Number(right?.decisionSnippet?.spreadPips ?? Number.POSITIVE_INFINITY);
    if (leftSpread !== rightSpread) return leftSpread - rightSpread;

    return String(left?.symbol || "").localeCompare(String(right?.symbol || ""));
}

export function selectBestScoringCandidate(candidates = []) {
    return [...candidates]
        .filter((candidate) => candidate?.signal && candidate?.orderPlan && candidate?.entryProfile)
        .sort(compareScoringCandidates)[0] || null;
}

export default shouldEnter;
