// PA HLLH entry decision — one function, no helpers.
//
// Called by services/trading.js once per evaluation tick. Decides if we
// should open a new position right now. Returns either:
//   { signal: null, reason: "..." }                       — don't enter
//   { signal: "BUY"|"SELL", entry, sl, tp, size, ... }    — enter at "entry"
//
// Inputs (caller must provide):
//   bars       — array of last ~30+ closed M15 bars, oldest→newest.
//                Each bar: { timestamp, open, high, low, close }
//   m5AtrPct   — M5 ATR%/close at the moment of evaluation (regime filter)
//   spread     — current bid-ask spread in price units (live), or 0/null for BT
//   symbol     — e.g. "EURUSD" / "GBPJPY"   (sets pip size)
//   equity     — account balance in account currency (for position sizing)
//
// Strategy (all 5 steps inline below):
//   1. Find pivot-low (LONG) or pivot-high (SHORT) on M15 — a swing
//      confirmed by 2 bars before and 2 after.
//   2. Pivot must form HIGHER-LOW (LONG) or LOWER-HIGH (SHORT) vs the
//      previous pivot of the same kind. If yes, structure is "armed".
//   3. Within 8 bars after arming, wait for a candle of matching colour:
//      bullish (LONG) or bearish (SHORT) — that's the signal bar.
//   4. Build entry/SL/TP from the signal bar: entry = close, SL = bar
//      extreme ± 2 pips, TP = entry ± 20R (safety net; usually exit by trail).
//   5. Apply filters: M5 ATR regime, signal age, stop distance, spread.

export function shouldEnter({ bars, m5AtrPct, spread, symbol, equity, params, nowMs }) {
    // ── PARAMETERS (defaults; backtest/autoresearch passes overrides via `params`) ──
    // Defaults = autoresearch winner 2026-05-28 (1390-combo, 1yr, 5 pairs):
    //   WR 55.7%, PF 4.24, expR 1.43 (vs prior 50.5% / 2.59 / 0.78).
    //   Key edge: minM5AtrPct 0.0004 + maxStopPips 8 (trade only in real
    //   volatility, reject wide stops).
    const P = params || {};
    const PIVOT_WINDOW = P.pivotWindow ?? 1; // bars before/after a swing
    const MAX_WAIT_BARS = P.maxWaitBars ?? 4; // expire armed structure after N bars
    const STOP_BUFFER_PIPS = P.stopBufferPips ?? 2; // SL = bar extreme ± 2 pips
    const MIN_STOP_PIPS = P.minStopPips ?? 2;
    const MAX_STOP_PIPS = P.maxStopPips ?? 8;
    const SAFETY_TP_R = P.safetyTpR ?? 20; // far TP (exit normally via trail)
    const RISK_PCT = P.riskPct ?? 0.03; // 3% of equity per trade
    const MIN_M5_ATR_PCT = P.minM5AtrPct ?? 0.00035; // dead-market threshold (0.035%)
    // 2026-05-29: lowered 0.0004→0.00035 after finding the BT's atrPct was ~20%
    // inflated vs live calcIndicators. On the live-aligned scale, 0.0004 blocked
    // ~all signals (live had 0 trades on quiet days). 0.00035 = best realistic
    // (stress) netR + low maxDD, +42% trade activity. See handoff.md.
    const MAX_SPREAD_PCT_OF_STOP = P.maxSpreadPctOfStop ?? 0.3; // drop if spread > 30% of stop
    const MAX_SPREAD_ABS_PIPS = P.maxSpreadAbsPips ?? 3; // hard spread cap
    const STALE_SIGNAL_MS = P.staleSignalMs ?? 90 * 1000; // drop if signal bar closed > N ago
    const REQUIRED_SEQUENCE = P.requiredSequence ?? 1; // 1 = aggressive (first HL/LH), 2 = confirmed

    // "now" — live uses wall clock; backtest passes the bar-close ms so the
    // staleness filter behaves identically to live without time-travel issues.
    const NOW = Number.isFinite(nowMs) ? nowMs : Date.now();

    const PIP = String(symbol || "")
        .toUpperCase()
        .endsWith("JPY")
        ? 0.01
        : 0.0001;

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

            // Pivot-low check: p.low strictly lower than N bars before AND N bars after.
            let isLow = true;
            for (let k = 1; k <= PIVOT_WINDOW; k++) {
                if (!(p.low < bars[pivotIdx - k].low && p.low < bars[pivotIdx + k].low)) {
                    isLow = false;
                    break;
                }
            }
            if (isLow) {
                // STEP 2 (LONG): count the run of consecutive HIGHER lows.
                const seq = prevPivotLow && p.low > prevPivotLow.price ? prevPivotLow.seq + 1 : 0;
                if (seq >= REQUIRED_SEQUENCE) {
                    longArm = { pivotPrice: p.low, expiresAt: i + MAX_WAIT_BARS };
                }
                prevPivotLow = { price: p.low, seq };
            }


            // Pivot-high check.
            let isHigh = true;
            for (let k = 1; k <= PIVOT_WINDOW; k++) {
                if (!(p.high > bars[pivotIdx - k].high && p.high > bars[pivotIdx + k].high)) {
                    isHigh = false;
                    break;
                }
            }
            if (isHigh) {
                // STEP 2 (SHORT): count the run of consecutive LOWER highs.
                const seq = prevPivotHigh && p.high < prevPivotHigh.price ? prevPivotHigh.seq + 1 : 0;
                if (seq >= REQUIRED_SEQUENCE) {
                    shortArm = { pivotPrice: p.high, expiresAt: i + MAX_WAIT_BARS };
                }
                prevPivotHigh = { price: p.high, seq };
            }
        }

        // STEP 3: signal bar = current bar (i) of matching colour while structure is armed.
        // Only emit a signal if i is the LAST bar (we trade fresh signals on the just-closed M15).
        const row = bars[i];
        const bullish = row.close > row.open;
        const bearish = row.close < row.open;

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
    const sigCloseMs = Date.parse(signal.row.timestamp) + 15 * 60 * 1000;
    if (STALE_SIGNAL_MS > 0 && Number.isFinite(sigCloseMs) && NOW - sigCloseMs > STALE_SIGNAL_MS) {
        return { signal: null, reason: "signal_stale" };
    }

    // ── STEP 4: entry / stop / take-profit ──
    const entry = signal.row.close;
    const stopBuffer = STOP_BUFFER_PIPS * PIP;
    const sl = signal.side === "LONG" ? signal.row.low - stopBuffer : signal.row.high + stopBuffer;
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
    const tp = signal.side === "LONG" ? entry + stopDistance * SAFETY_TP_R : entry - stopDistance * SAFETY_TP_R;
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
        reason: "signal",
    };
}

export default shouldEnter;
