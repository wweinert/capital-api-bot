# M30 adaptive-risk finalist

The primary strategy is now the stage-2 **finalist #1** from the November 4 activity study: the existing strict H1 core plus a daytime M30 wave setup with adaptive risk. This is not finalist #5 (the additional previous-session midpoint filter) and does not enable an RSI exhaustion gate.

## Execution policy

- Before 08:00 UTC: existing H1 color reversal, strict M5/M15 agreement, EMA alignment, body limit and frozen H1 rating remain in effect. Core risk is at most 3%, target 2.5R.
- From 08:00 until 20:00 UTC: M30 decisions use M15 wave direction, trailing ATR percentiles, relative tick activity, body/ATR and spread/ATR filters. No H1 color-flip requirement is added to this setup.
- M30 candles are formed from two consecutive, aligned, closed M15 bars. The broker is still queried for H1/M15/M5; M15 history is doubled to provide a comparable M30 warmup.
- Pair selection ranks **all active markets**, including those with no signal, and admits signals only from the top three. Missing market context prevents a partial-universe M30 decision.
- M30 pending entry buffer: max(one pip, signal-close spread, 0.04 ATR). Stop: two-candle extreme plus 0.05 ATR, at least 0.8 ATR risk distance, at most 3 ATR. Target adapts within 1–2R.
- M30 risk starts at 0.75% and is reduced by efficiency, relative spread and ATR regime. It never overrides the configured 3% absolute risk ceiling or 90% margin budget. One position/pending slot remains shared by both setups.
- STOP orders expire 45 minutes after the candle decision time, not 45 minutes after a delayed observation. Orders whose lifetime has already elapsed are rejected.
- All pending orders and positions are flattened at 21:00 UTC daily. Friday admission stops at 18:00 UTC and Friday closing remains 20:00 UTC. Weekend admission is blocked.

`config.js` was deliberately preserved as requested. The active finalist's daily policy is owned by `TradingService.dailyCloseMinute` (21:00) and its entry cutoff (20:00); the legacy `DAILY_FORCED_CLOSE_UTC: false` does not disable this finalist's intraday closing. Existing stricter Friday and portfolio limits still apply.

## Position protection and restarts

Accepted order confirmations cache the original risk distance and M5/M15 step mode. When an order fills, the monitor passes the broker's working-order ID so the plan can be associated with the position ID.

After a restart, the service retrieves the original working-order creation from broker account activity around the fill time. It restores the initial entry/stop and decision context, even if the current stop has already moved. It does not infer risk by dividing every target by 2.5R: M30 targets vary. If the original order cannot be verified, no guessed stop update is sent; the existing broker protection remains. Unsupported old H1 1.5R orders are ignored.

## Validation

41 unit/integration tests pass. Tests cover H1 behavior, M30 timeframe switching, candle aggregation/gaps, closed-candle admission, indicator windows excluding the current candle, top-three ranking including no-signal markets, signed order formulas, risk/target clamps, margin reservation, expiry, closing boundaries, accepted-order caching and restart recovery from an already tightened stop.

An offline canonical-data snapshot through November 4 07:45 UTC exercised 1,980 contexts over the preceding 14 calendar days: 540 H1 comparisons against commit `c399fbd`, 1,440 M30 contexts, 396 admitted M30 signals, 392 valid order plans, and 232 pair-ranking decisions. Production calculations matched the frozen formula reference under the same rolling indicator inputs. The four remaining admitted signals were rejected by the maximum stop-distance rule. Missing-volume snapshots are rejected rather than yielding a vacuous successful verification.

Run `npm test`. Optional offline parity replay: `node lab/verify-m30-integration.mjs SNAPSHOT_JSON_GZ`. The snapshot must contain bid OHLC, spread and tick volume for the eight configured symbols and H1/M15/M5 history.

The parity replay is not a new full portfolio backtest and does not assert live reproduction of +117.71%. Rolling broker windows, broker precision, slippage, network recovery and protection-update acceptance can differ from the original research simulator.

No bot startup, real broker order, commit, push, branch switch, environment change or server deployment was performed for this integration. The remote server was only read to export the historical snapshot via a temporary research script; its running project was not modified.
