# H1 green/red + M5/M15 wave: all-pairs profile study

Date: 2026-11-01  
Protocol: `h1-green-red-with-m5-m15-wave-all-pairs-v1`

## Decision

Only `USDJPY / asia` is provisionally admitted. Its compact profile is:

```js
{ targetR: 1.5, maxHoldMinutes: 720 }
```

The stop rule is universal and therefore is not stored per profile: the
opposite extreme of the two H1 pattern candles plus a `0.1 * H1 ATR(14)`
buffer. Entry is at market after the closed H1 pattern candle. The M5/M15 wave
detector is unchanged.

## Evidence

| Period | Trades | Win rate | Total R | Average R | Profit factor | Max DD (R) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Train: 2026-01-01–2026-05-31 | 44 | 50.00% | +6.42 | +0.146 | 1.29 | 7.00 |
| Validation: 2026-06-01–2026-08-31 | 41 | 48.78% | +6.83 | +0.167 | 1.37 | 6.06 |
| Frozen test: 2026-09-01–dataset end | 55 | 43.64% | +5.87 | +0.107 | 1.20 | 7.50 |

Total: 143 trades, +19.03R, average +0.133R, profit factor 1.27.

All other pair/session cells failed at least one predeclared gate. The broad
unfiltered strategy was negative in all three periods, so the result does not
support keeping generic profiles for every pair.

## Protocol

- Universe: 17 FX pairs. BTCUSD and ETHUSD were evaluated as out-of-domain
  diagnostics and were not admitted.
- Inputs: closed H1, M15 and M5 bid/ask candles from the server source of truth.
- Coverage: 2025-12-01 through 2026-10-23; 57 files; no invalid or duplicate
  USDJPY rows.
- Execution: next M5 open, real historical bid/ask spread, M5 stop/target
  resolution, stop-first ordering when both are touched in the same M5 candle,
  daily flat at 22:00 UTC and Friday flat at 20:00 UTC.
- Pair/session selection: target and maximum hold selected on train only from
  nine combinations. Validation and test were veto-only.
- Admission gates: train >=25 trades and PF >=1.05; validation >=12 and PF
  >=1.05; test >=8 and PF >=1.05; positive total R in every period; >=50 trades,
  PF >=1.15 and average R >=0.05 overall.

## USDJPY source audit

| Timeframe | Rows | First | Last | SHA-256 |
| --- | ---: | --- | --- | --- |
| H1 | 5,583 | 2025-12-01 00:00Z | 2026-10-23 13:00Z | `865338c6132bc190e1913257ebaed27e68b51804aacd747f914a0eb7bd309d27` |
| M15 | 22,331 | 2025-12-01 00:00Z | 2026-10-23 14:00Z | `df052ea84aab3ddd3f667a7d901779c6708d15f1a055c9f91a43d107fab260a2` |
| M5 | 61,801 | 2025-12-24 09:50Z | 2026-10-23 14:10Z | `8fe2fc980c211003d61b7b0b3c715e6cae3c9ba24c6f1dfdaffbd6a6f8c72f20` |

## Reproduction

```bash
node lab/h1-wave-strategy-all-pairs.js DATASET_DIR
```

This is historical evidence, not a guarantee of future profit. Because the
final profile is now known, the next genuinely unseen evidence must come from
forward/paper trading rather than another re-slice of these dates.
