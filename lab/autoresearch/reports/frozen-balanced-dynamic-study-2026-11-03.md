# Dynamic adaptation on the frozen balanced strategy

Date: 2026-11-03

## Scope

- Offline research only. No protected live-trading file was changed or executed.
- The proven signal admission rules were frozen. The test changed only pair selection, order execution and position management.
- Data: recorded bid/ask M1, M5, M15 and H1 candles through 2026-11-03 09:25 UTC.
- Portfolio: EUR 1,000 start, one pending/open position, 90% margin cap and 3% absolute risk cap.
- Selection used January-August. September-October was excluded from selection but had already been inspected in earlier research, so it is diagnostic rather than a pristine holdout. November 1-3 is too short for acceptance.

The frozen baseline was reproduced exactly: +74.55%, PF 1.231, 338 trades, 1.30 trades per market day and 16.67% maximum drawdown.

## Layer isolation

| Variant | Full return | PF | Trades/day | Coverage | Max DD | Sep-Oct return |
|---|---:|---:|---:|---:|---:|---:|
| Frozen static baseline | +74.55% | 1.231 | 1.300 | 71.54% | 16.67% | +21.63% |
| Dynamic pair selection only | +35.11% | 1.133 | 1.185 | 70.38% | 14.09% | +6.92% |
| Dynamic entry/SL/TP only | -8.33% | 0.972 | 1.577 | 73.85% | 29.74% | -23.23% |
| Selected dynamic management | +82.65% | 1.269 | 1.358 | 72.31% | 15.66% | +7.88% |

Dynamic pair filtering and dynamic reconstruction of entry/SL/TP are rejected. They remove useful opportunities or change the geometry of the proven setup. The only promising component is conservative closed-candle management applied to the strict core signal source.

## Selected research candidate

The selected candidate leaves the signal generator, pending entry, initial stop and addon trades unchanged. Only strict core positions receive dynamic management:

- initial target is extended to 2.5R;
- stop moves to break-even after 1R;
- the next stop follows the latest closed candle with a 0.15 ATR buffer;
- M15 is used when H1 trend score is at least 1 ATR and six-bar efficiency is at least 0.2;
- otherwise M5 is used;
- the stop can only tighten and never widen;
- no early reversal close is used.

| Period | Return | PF | Trades/day | Coverage | Max DD |
|---|---:|---:|---:|---:|---:|
| Jan-May train | +38.71% | 1.284 | 1.326 | 73.64% | 15.66% |
| Jun-Aug validation | +23.28% | 1.493 | 1.127 | 63.29% | 5.65% |
| Sep-Oct diagnostic | +7.88% | 1.127 | 1.808 | 84.62% | 10.48% |
| Jan-Oct full | +82.65% | 1.269 | 1.358 | 72.31% | 15.66% |
| Nov 1-3 forward-like | -0.76% | 0.794 | 1.667 | 66.67% | 3.64% |

The full-period return is 8.10 percentage points above the static baseline and drawdown is 1.01 points lower. However, the static baseline is materially stronger in September-October and in the three-day forward-like sample. This candidate is therefore suitable for shadow/demo comparison, not promotion to live logic.

## Cost stress

For the selected management candidate over January-October:

| Scenario | Return | PF | Max DD |
|---|---:|---:|---:|
| Recorded bid/ask | +82.65% | 1.269 | 15.66% |
| Spread x1.25 | +68.84% | 1.227 | 15.78% |
| Spread x1.50 | +29.94% | 1.107 | 16.44% |
| Slippage 0.5 pip | +59.02% | 1.198 | 16.79% |
| Spread x1.25 + slippage 0.5 pip | +47.98% | 1.161 | 15.87% |

## Decision

Keep the frozen balanced strategy as the control. The next valid experiment is a parallel shadow/demo run of the core-only 2.5R candle-step manager. Dynamic pair selection and dynamic entry/SL reconstruction should not be integrated from this study. Promotion requires a new untouched forward sample long enough to cover different market regimes.

Machine-readable artifacts:

- `dynamic-frozen-balanced-2026-11-03.json` — first isolation run with the original fixed target.
- `dynamic-frozen-balanced-v2-2026-11-03.json` — extended-target closed-candle management study.
