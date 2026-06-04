// Autoresearch-selected PA HLLH entry decision.
//
// Called by services/trading.js once per evaluation tick. Decides if we
// should open a new position right now. Returns either:
//   { signal: null, reason: "..." }                       — don't enter
//   { signal: "BUY"|"SELL", entry, sl, tp, size, ... }    — enter at "entry"
//
// Inputs for shouldEnter (caller must provide):
//   bars       — array of last ~30+ closed M15 bars, oldest→newest.
//                Each bar: { timestamp, open, high, low, close } or { t, o, h, l, c }
//   m5AtrPct   — M5 ATR%/close at the moment of evaluation (regime filter)
//   spread     — current bid-ask spread in price units (live), or 0/null for BT
//   symbol     — e.g. "EURUSD" / "GBPJPY"   (sets pip size)
//   equity     — account balance in account currency (for position sizing)

export const ENTRY_RESEARCH_PROFILE = {
    id: "ENTRY_RR2_1831",
    name: "entry_rr2_1831",
    timeframe: "M15",
    allowedHoursUtc: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    params: {
        pivotWindow: 1,
        maxWaitBars: 6,
        stopBufferPips: 3,
        minStopPips: 2.5,
        maxStopPips: 22,
        minM5AtrPct: 0.00012,
        maxSpreadPctOfStop: 1,
        maxSpreadAbsPips: 99,
        requiredSequence: 1,
        takeProfitR: 2,
    },
};

function toNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
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

//
// Default profile is the 2026-06-04 10-minute entry search winner:
//   entry_rr2_1831, M15, 150d local Capital dataset, 17 FX symbols.
//   2508 trades, TP-before-SL 53.39%, PF 2.00, expectancy 0.606R at TP=2R.
//
// Strategy (all 5 steps inline below):
//   1. Find pivot-low (LONG) or pivot-high (SHORT) on M15 — a swing
//      confirmed by 2 bars before and 2 after.
//   2. Pivot must form HIGHER-LOW (LONG) or LOWER-HIGH (SHORT) vs the
//      previous pivot of the same kind. If yes, structure is "armed".
//   3. Within 8 bars after arming, wait for a candle of matching colour:
//      bullish (LONG) or bearish (SHORT) — that's the signal bar.
//   4. Build entry/SL/TP from the signal bar: entry = close, SL = bar
//      extreme ± buffer, TP = entry ± 2R.
//   5. Apply filters: UTC hour window, M5 ATR regime, signal age, stop distance, spread.

export function shouldEnter({ bars, m5AtrPct, spread, symbol, equity, params, nowMs }) {
    // ── PARAMETERS (defaults; backtest/research passes overrides via `params`) ──
    const P = { ...ENTRY_RESEARCH_PROFILE.params, ...(params || {}) };
    const PIVOT_WINDOW = P.pivotWindow ?? 1; // bars before/after a swing
    const MAX_WAIT_BARS = P.maxWaitBars ?? 6; // expire armed structure after N bars
    const STOP_BUFFER_PIPS = P.stopBufferPips ?? 3; // SL = bar extreme ± buffer
    const MIN_STOP_PIPS = P.minStopPips ?? 2.5;
    const MAX_STOP_PIPS = P.maxStopPips ?? 22;
    const TAKE_PROFIT_R = P.takeProfitR ?? P.safetyTpR ?? 2; // research target is strict 1:2 RR
    const RISK_PCT = P.riskPct ?? 0.03; // 3% of equity per trade
    const MIN_M5_ATR_PCT = P.minM5AtrPct ?? 0.00012; // dead-market threshold
    const MAX_SPREAD_PCT_OF_STOP = P.maxSpreadPctOfStop ?? 1; // research default: permissive
    const MAX_SPREAD_ABS_PIPS = P.maxSpreadAbsPips ?? 99; // research default: permissive
    const STALE_SIGNAL_MS = P.staleSignalMs ?? 90 * 1000; // drop if signal bar closed > N ago
    const REQUIRED_SEQUENCE = P.requiredSequence ?? 1; // 1 = aggressive (first HL/LH), 2 = confirmed
    const ALLOWED_HOURS_UTC = Array.isArray(P.allowedHoursUtc) ? P.allowedHoursUtc : ENTRY_RESEARCH_PROFILE.allowedHoursUtc;

    // "now" — live uses wall clock; backtest passes the bar-close ms so the
    // staleness filter behaves identically to live without time-travel issues.
    const NOW = Number.isFinite(nowMs) ? nowMs : Date.now();

    const PIP = String(symbol || "")
        .toUpperCase()
        .endsWith("JPY")
        ? 0.01
        : 0.0001;

    if (ALLOWED_HOURS_UTC.length) {
        const hour = new Date(NOW).getUTCHours();
        if (!ALLOWED_HOURS_UTC.map(Number).includes(hour)) {
            return { signal: null, reason: "outside_research_hours" };
        }
    }

    // ── INPUT CHECK ──
    if (!Array.isArray(bars) || bars.length < PIVOT_WINDOW * 2 + 2) {
        return { signal: null, reason: "not_enough_bars" };
    }

    // ── FILTER 1: M5 ATR regime ──
    if (Number.isFinite(m5AtrPct) && m5AtrPct < MIN_M5_ATR_PCT) {
        return { signal: null, reason: "low_m5_atr" };
    }

    // ── STEPS 1-3: walk bars, track pivots, arm structure, find signal on LAST bar ──
    let prevPivotLow = null; // { price, seq } — last confirmed pivot-low + run length of higher-lows
    let prevPivotHigh = null; // { price, seq } — last confirmed pivot-high + run length of lower-highs
    let longArm = null; // { pivotPrice, expiresAt } — Higher-Low ready, waiting for bullish break
    let shortArm = null; // { pivotPrice, expiresAt } — Lower-High ready, waiting for bearish break
    let signal = null; // { side, row } once a break fires on the LATEST bar
    const lastIdx = bars.length - 1;

    for (let i = 0; i < bars.length; i++) {
        // console.log(`Bar ${i}: ${bars[i].timestamp} O:${bars[i].open} H:${bars[i].high} L:${bars[i].low} C:${bars[i].close}`);
        // Expire stale arms.
        if (longArm && i > longArm.expiresAt) longArm = null;
        if (shortArm && i > shortArm.expiresAt) shortArm = null;

        // STEP 1: at this bar, confirm a potential pivot at index (i - PIVOT_WINDOW).
        // That pivot needs PIVOT_WINDOW bars BEFORE it AND PIVOT_WINDOW after — at
        // bar i we have exactly PIVOT_WINDOW bars after the candidate.
        const pivotIdx = i - PIVOT_WINDOW;

        if (pivotIdx >= PIVOT_WINDOW) {
            const p = bars[pivotIdx];
            const pivotLow = barLow(p);
            const pivotHigh = barHigh(p);

            // Pivot-low check: p.low strictly lower than N bars before AND N bars after.
            let isLow = Number.isFinite(pivotLow);
            for (let k = 1; k <= PIVOT_WINDOW; k++) {
                const leftLow = barLow(bars[pivotIdx - k]);
                const rightLow = barLow(bars[pivotIdx + k]);
                if (![leftLow, rightLow].every(Number.isFinite) || !(pivotLow < leftLow && pivotLow < rightLow)) {
                    isLow = false;
                    break;
                }
            }
            if (isLow) {
                // STEP 2 (LONG): count the run of consecutive HIGHER lows.
                const seq = prevPivotLow && pivotLow > prevPivotLow.price ? prevPivotLow.seq + 1 : 0;
                if (seq >= REQUIRED_SEQUENCE) {
                    longArm = { pivotPrice: pivotLow, expiresAt: i + MAX_WAIT_BARS };
                }
                prevPivotLow = { price: pivotLow, seq };
            }


            // Pivot-high check.
            let isHigh = Number.isFinite(pivotHigh);
            for (let k = 1; k <= PIVOT_WINDOW; k++) {
                const leftHigh = barHigh(bars[pivotIdx - k]);
                const rightHigh = barHigh(bars[pivotIdx + k]);
                if (![leftHigh, rightHigh].every(Number.isFinite) || !(pivotHigh > leftHigh && pivotHigh > rightHigh)) {
                    isHigh = false;
                    break;
                }
            }
            if (isHigh) {
                // STEP 2 (SHORT): count the run of consecutive LOWER highs.
                const seq = prevPivotHigh && pivotHigh < prevPivotHigh.price ? prevPivotHigh.seq + 1 : 0;
                if (seq >= REQUIRED_SEQUENCE) {
                    shortArm = { pivotPrice: pivotHigh, expiresAt: i + MAX_WAIT_BARS };
                }
                prevPivotHigh = { price: pivotHigh, seq };
            }
        }

        // STEP 3: signal bar = current bar (i) of matching colour while structure is armed.
        // Only emit a signal if i is the LAST bar (we trade fresh signals on the just-closed M15).
        const row = bars[i];
        const open = barOpen(row);
        const close = barClose(row);
        const bullish = close > open;
        const bearish = close < open;

        if (longArm && bullish) {
            if (i === lastIdx) {
                signal = { side: "LONG", row };
                break;
            }
            longArm = null; // signal consumed by an earlier (historical) bullish bar — wait for next pivot
        }
        if (shortArm && bearish) {
            if (i === lastIdx) {
                signal = { side: "SHORT", row };
                break;
            }
            shortArm = null;
        }
    }

    if (!signal) return { signal: null, reason: "no_signal" };

    // ── FILTER 2: signal staleness (M15 bar closes 15 min after its open timestamp) ──
    const sigCloseMs = barTimeMs(signal.row) + 15 * 60 * 1000;
    if (STALE_SIGNAL_MS > 0 && Number.isFinite(sigCloseMs) && NOW - sigCloseMs > STALE_SIGNAL_MS) {
        return { signal: null, reason: "signal_stale" };
    }

    // ── STEP 4: entry / stop / take-profit ──
    const entry = barClose(signal.row);
    const stopBuffer = STOP_BUFFER_PIPS * PIP;
    const sl = signal.side === "LONG" ? barLow(signal.row) - stopBuffer : barHigh(signal.row) + stopBuffer;
    const stopDistance = Math.abs(entry - sl);
    const stopPips = stopDistance / PIP;

    // ── FILTER 3: stop distance sanity ──
    if (stopPips < MIN_STOP_PIPS) return { signal: null, reason: "stop_too_tight" };
    if (stopPips > MAX_STOP_PIPS) return { signal: null, reason: "stop_too_wide" };

    // ── FILTER 4: spread (live only; spread=0 or null in BT just passes) ──
    if (Number.isFinite(spread) && spread > 0) {
        const spreadPips = spread / PIP;
        if (spreadPips > MAX_SPREAD_ABS_PIPS) return { signal: null, reason: "spread_too_wide" };
        if (spreadPips / stopPips > MAX_SPREAD_PCT_OF_STOP) return { signal: null, reason: "spread_pct_too_high" };
    }

    // ── STEP 5: take-profit + size from risk amount ──
    const tp = signal.side === "LONG" ? entry + stopDistance * TAKE_PROFIT_R : entry - stopDistance * TAKE_PROFIT_R;
    const riskAmount = Number.isFinite(equity) && equity > 0 ? equity * RISK_PCT : null;
    const size = riskAmount ? riskAmount / stopDistance : null;

    return {
        signal: signal.side === "LONG" ? "BUY" : "SELL",
        entry,
        sl,
        tp,
        stopDistance,
        stopPips,
        size,
        riskPct: RISK_PCT,
        riskAmount,
        takeProfitR: TAKE_PROFIT_R,
        reason: "signal",
    };
}

export default shouldEnter;
