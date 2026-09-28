# Live strategy, position management, and Kronos audit — 2026-09-28

## Decision

The initial audit supported two profile-specific rules as a shadow candidate:

- `EURJPY / asia`: after at least `0.50R` MFE, close when the position has made
  no new best price for 30 minutes and has given back at least `0.20R`.
- `USDJPY / overlap`: after reaching `0.50R`, lock the stop at `+0.10R`.

Kronos must remain disabled in live decision-making. On the exact current
strategy and complete fixed dataset, every non-zero tested Kronos weight was
less robust than the no-model control.

After reviewing the limitations, the user explicitly selected the older
`dynamic-combo-9` maximum-profit result for local implementation. The working
tree now matches commit `069916e` for `config.js`, `monitors.js`,
`services/trading.js`, and `strategies/strategies.js`, except that the user's
removal of unused `RISK.REQUIRED_SCORE` is preserved. Nothing was deployed.

That variant started at EUR 878.86 and finished at EUR 59,209.47, with PF
1.459 and 24.04% drawdown. Spread x1.25 finished at EUR 34,982, with PF 1.373
and 26.49% drawdown. This was inspected optimization evidence with no locked
holdout. On 2026-09-21..25 it lost EUR 14.59 at normal spread and had only two
profitable days out of five.

No rule can guarantee a profitable day, week, or month. The objective is to
improve expectancy and constrain losses without removing the profitable tail.

## Scope and integrity

- Broker state, orders, server files, and PM2 were not modified.
- Local protected code was changed only after the user's explicit request to
  implement `dynamic-combo-9`; it has not been committed or deployed.
- Canonical fixed dataset fingerprint:
  `aedbd2669225af8b7707677edb00ddebfb9ad447c55bd2741aeedaa7f11dd88a`.
- Full range: `2025-12-21T22:00:00Z` through
  `2026-09-25T17:01:00Z`, 200 market days, historical broker bid/ask M1.
- Start balance EUR 500, target risk 3%, one slot, 90% margin cap, conservative
  stop-first handling, normal spread and 1.25x spread stress.
- All results are inspected development evidence, not a fresh holdout.

## Version-parity finding

The actual week was not traded by one fixed strategy. Server restart and commit
times show five runtime states:

| Runtime interval | Commit | Material change |
|---|---|---|
| through 2026-09-22 21:17 UTC | `df33ab5` | session loss protection and pending replacement |
| from 2026-09-22 21:17 UTC | `d22615d` | three partial-exit profiles changed |
| from 2026-09-23 11:33 UTC | `0561d92` | dynamic position time |
| from 2026-09-23 12:30 UTC | `069916e` | margin refresh after pending replacement |
| from 2026-09-24 20:01 UTC | `e3a0653` | dynamic signal/management experiment |
| from 2026-09-25 19:54 UTC | `c79bc75` | returned protected live files to `df33ab5`; research harness changed |

Therefore broker P&L for the week cannot be used as a one-to-one verification
of a backtest of only `df33ab5`. Exact sub-minute pending-order timing is an
additional known source of divergence.

## Actual broker evidence available in the fixed snapshot

| UTC day | Closed P&L |
|---|---:|
| 2026-09-21 | +EUR 25.42 |
| 2026-09-22 | +EUR 13.61 |
| 2026-09-23 through 09:52 | -EUR 19.10 |
| Total through snapshot | +EUR 19.93 |

On 2026-09-23 the live path selected an EURUSD BUY pending order at 01:45,
invalidated it at 02:07, then selected and filled USDCHF BUY at 02:15. The
replay saw a different opportunity path. This confirms execution-path
sensitivity rather than a simple arithmetic mismatch.

## Exact current-strategy baseline

The exact `df33ab5` causal replay produced:

| Mode | Final balance | P&L | PF | Max DD | Trades |
|---|---:|---:|---:|---:|---:|
| Normal spread | EUR 12,771.29 | EUR 12,271.29 | 1.383 | 20.61% | 855 |
| Spread x1.25 | EUR 10,665.68 | EUR 10,165.68 | 1.313 | 24.12% | 841 |

It had 31 positive full weeks out of 38. August was negative at -3.14%
(-5.79% under spread stress), so the evidence does not support a claim that
every month will be profitable.

For 2026-09-21 through 2026-09-25, the exact current replay returned +EUR 20.27
at normal spread and +EUR 21.66 under stress. The last replay fold was negative
(-EUR 46.10, PF 0.158), exposing the late-week regime weakness.

## 2026-09-28 position diagnosis

The available broker snapshot showed approximately -EUR 37.85 closed P&L by
09:20 UTC from an account starting near EUR 837.54:

- EURJPY BUY lost about EUR 25.14 after being held approximately 383.5 minutes.
  It first reached about `+0.93R`, then surrendered the move and eventually
  closed at the full loss.
- EURUSD BUY lost about EUR 12.71 after approximately 9.8 minutes and never
  developed favorable excursion.
- The EURJPY profile allows 480 minutes, has no break-even trigger, and has no
  valid trailing distance. Consequently the live monitor has no configured
  action between entry and the distant fixed exit/max-hold condition.
- Later EURJPY candidate scores (2.88, 3.53, and 1.88) did not exceed the
  original position score of 4.04. A replacement rule based only on score would
  not have fixed this case. Profit giveback/staleness is the relevant state.

The global `DYNAMIC_TRAIL_*` values in `config.js` are currently unused by the
live trading service. The service acts only on profile `breakEvenAtR`,
`trailActivationR`, and `trailDistanceR`; the EURJPY Asia profile has no
complete executable protection rule.

## Profile-specific management A/B test

The combined candidate applied only the two rules in the Decision section.
Control and candidate were run in the same management engine. Pending
invalidation enabled is the relevant live-like comparison.

### Full history

| Mode | Control final | Candidate final | Control PF | Candidate PF | Control DD | Candidate DD | Profitable days |
|---|---:|---:|---:|---:|---:|---:|---:|
| Normal spread | EUR 11,177.61 | **EUR 16,109.59** | 1.303 | **1.341** | **21.99%** | 22.68% | 116 -> 115 of 197 |
| Spread x1.25 | EUR 7,465.21 | **EUR 10,546.96** | 1.280 | **1.312** | 30.30% | **24.49%** | 111 -> 110 of 197 |

The candidate improved the train, validation, and recent segments in both
spread modes. It did not improve profitable-day count, and ordinary-spread DD
rose by 0.69 percentage points. The larger absolute worst-day euro amount is
also affected by the candidate's substantially larger compounded balance.

### Week of 2026-09-21

| Mode | Control P&L | Candidate P&L | Control PF | Candidate PF | Candidate days |
|---|---:|---:|---:|---:|---:|
| Normal spread | -EUR 15.13 | **-EUR 0.14** | 0.880 | **0.999** | 3 positive / 2 negative |
| Spread x1.25 | +EUR 6.38 | **+EUR 22.40** | 1.057 | **1.224** | 3 positive / 2 negative |

This is a material improvement, but it does not make the normal-spread week
reliably profitable and does not repair Friday. It should therefore be shadowed
on new data before promotion.

## Open-position replacement

A universal replacement after 60 or 90 minutes improved the inspected recent
week but materially reduced full-history profit. Score-only replacement was
also harmful. The only narrow replacement candidate with a positive
full-history result was GBPCHF/London after 90 minutes, with MFE no greater
than `0.50R`, current result no greater than `0.10R`, no improvement for 45
minutes, and a new valid signal present. Its advantage was modest and stress
week performance was weaker, so it is not included in the first candidate.

## Kronos result on the exact current strategy

The first reported 301-signal run was invalid for full-history comparison: it
accidentally used the short 2026-09-04..25 dataset. The cache itself contains
all 4,191 forecasts. The corrected run used the complete dataset and preserved
4,191 normal-spread signals (4,185 under stress).

Kronos was used only as a small quality-ranking term; it did not look into the
future relative to each signal.

| Horizon / weight | Normal final | Stress final | Max DD normal / stress |
|---|---:|---:|---:|
| no model / 0 | **EUR 12,771.29** | **EUR 10,665.68** | **20.61% / 24.12%** |
| H1 / 0.1 | EUR 12,793.19 | EUR 10,463.87 | 20.60% / 24.12% |
| H1 / 0.2 | EUR 11,958.50 | EUR 10,294.87 | 20.60% / 24.12% |
| H1 / 0.3 | EUR 11,092.07 | EUR 10,218.92 | 20.61% / 24.12% |
| H2 / 0.1 | EUR 12,234.70 | EUR 10,513.83 | 20.60% / 24.12% |
| H2 / 0.2 | EUR 12,173.11 | EUR 9,468.51 | 26.45% / 27.49% |
| H2 / 0.3 | EUR 10,935.37 | EUR 9,931.85 | 26.49% / 27.49% |

H1/0.1 added only EUR 21.90 in the nominal run while losing EUR 201.81 under
spread stress. Every other non-zero weight reduced nominal and/or stress
performance more materially. The robust winner is weight zero.

## Recommended sequence

1. Freeze `df33ab5` as the parity baseline and log strategy version, profile,
   signal time, placement time, quoted spread, broker fill, initial R, MFE,
   MAE, exit reason, and every protection update. Without this, actual/backtest
   mismatches cannot be attributed reliably.
2. Shadow the two-rule candidate for at least 20 new market days. Do not use the
   already inspected week as its acceptance holdout.
3. Accept only if new-data PF and net P&L improve in both normal and stressed
   replay, DD does not materially worsen, and no execution/replay mismatch is
   unexplained.
4. Test GBPCHF/London stale replacement separately after the protection rules;
   do not enable universal or score-only replacement.
5. Keep Kronos telemetry for research, but use weight zero in trading until it
   wins a predeclared forward test under normal and stressed costs.
6. Only after management parity is stable, test causal dynamic profiles. A
   previous weekly base/fast/wide selector chose the static base every time, so
   dynamic adaptation needs a predeclared learner and untouched forward period,
   not another full-history maximization.
