# Live refactoring regression — 2026-11-04

Baseline: commit `935a365`. Candidate: the local class-based refactoring of strategy, bot, trading service and monitor.

The monitor now owns its interval state and deal tracking. The bot owns scheduling and symbol analysis; the trading service owns account refresh, selection, sizing and execution. Config, API, indicators, logger, news and WebSocket service were not changed. The unused WebSocket entry remains available as a monitor method but is not activated.

## Validation

- 27 unit tests pass, including direction agreement, input boundaries, M15 scheduling, account retries, candidate ranking, BUY/SELL order payloads, margin reservation, monitor locking, timestamp normalization, timeout and daily/weekend boundaries.
- The empty-account-response loop is deliberately corrected: three attempts, then the previous account state is retained, matching the previous exception fallback.
- Historical decision comparison: 572 contexts, 16 candidates, 9 independently simulated order decisions; baseline and candidate outputs match. This comparison isolates decision handling and uses a fixed currency conversion/leverage.
- Full recorded portfolio replay: 5,090 pattern contexts checked, 563 admitted signals, one portfolio slot, EUR 1,000 initial balance, up to 3% risk and 90% margin. Baseline and candidate produce identical complete trade logs, including stop movements and P/L.

| Metric | Baseline | Refactored |
| --- | ---: | ---: |
| Return | +108.488924% | +108.488924% |
| Trades, including final boundary mark | 137 | 137 |
| Win rate | 57.664234% | 57.664234% |
| Profit factor | 1.430542 | 1.430542 |
| Maximum drawdown | 16.569787% | 16.569787% |

See `refactor-management-parity-2026-11-04.json` for the exact date range and both complete trade logs.

## Simulator defect and separate corrected experiment

The older `current-live-strategy-full-2026-11-04.json` report is retained as a legacy experiment. Its +87.92% result is not an accurate estimate of the current candle-step-only management: `signal.execution?.trailActivationR ?? experiment.trailActivationR` replaced an explicit null with the legacy trailing default. That inadvertently enabled continuous trailing as well as candle-step management.

This regression is a separate corrected experiment. Explicit null disables legacy trailing. At each M1 close, the simulator invokes the actual `calculateDynamicStop` method from each version and uses the latest closed M5/M15 candle, including between step boundaries. No production trailing logic was changed to obtain the result.

## Limits

The replay uses recorded bid/ask M1 OHLC and conservative stop-before-target ordering for an ambiguous minute. Pending fills are modeled at the requested entry without tick slippage. Entry regime is based on signal-time H1; step ATR uses the recorded full series rather than each live rolling fetch. The last open position is marked at the period boundary. Actual broker update acceptance, tick timing, network faults and restart recovery are not fully represented. This validates refactoring parity under the same assumptions, not live profitability or perfect broker execution.

All history is previously inspected development evidence. No parameter search or optimization was performed. The running server bot was not deployed, restarted or changed.
