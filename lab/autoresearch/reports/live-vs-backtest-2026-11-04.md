# Live demo vs exact current-strategy replay — 2026-11-04

## Scope

- Live commit: `935a365`
- Live process start: 2026-11-03 22:56:51 UTC
- Reconciliation window: 2026-11-03 22:56 UTC through 2026-11-04 07:45 UTC
- Account: Capital.com demo
- Strategy replayed: strict M5+M15 wave agreement, H1 color reversal and EMA direction, rating threshold `-0.833014`, one slot, 45-minute STOP order, 3% maximum risk, 90% margin budget, 2.5R target and closed-candle dynamic stop after 1R

## Data update

The source-of-truth dataset at `/mnt/usb-ssd/trading/capital-dataset` was appended in place through 07:45 UTC. No existing rows or directory structure were changed.

- Files checked and updated: 114
- New rows: 32,638
- M1 last closed candle: 07:44 UTC
- M5 last closed candle: 07:40 UTC
- M15 last closed candle: 07:30 UTC
- H1 last closed candle: 06:00 UTC

## Signal and execution reconciliation

The replay found the same four candidates as the live log.

| Decision UTC | Candidate | Rating | Live outcome |
| --- | --- | ---: | --- |
| 01:00 | USDJPY BUY | 0.106 | STOP order created; expired unfilled at 01:45 |
| 05:00 | USDJPY BUY | -0.273 | STOP order created; filled at 05:03 |
| 06:00 | EURUSD BUY | -0.164 | Slot occupied by USDJPY |
| 06:00 | GBPUSD BUY | -0.305 | Slot occupied by USDJPY |

The selected USDJPY order also matched at the price level:

| Field | Replay / requested | Broker |
| --- | ---: | ---: |
| Entry | 157.867 | 157.868 fill |
| Stop | 157.349 | 157.349 |
| Target | 159.162 | 159.162 |
| Effective risk | 2.980% model | 2.969% live sizing log |
| Dynamic-stop activation | 1R | Not reached; stop correctly unchanged |

At 07:45 UTC the replay marked the position at `+0.445R`. The broker snapshot at 07:47:57 UTC showed EUR `+6.80`, approximately `+0.393R` or `+1.17%` of the EUR 580.65 balance. This is not a realized result: the position was still open. The approximately `0.052R` difference is consistent with the different mark times: the recorded USDJPY bid was 158.098 at 07:44 and the broker snapshot bid was 158.073 at 07:47:57. Entry slippage was only 0.001 JPY, about 0.002R.

The final broker snapshot at 08:03:11 UTC still showed the same open position, unchanged protection and no working orders or realized transactions. Its bid was 158.022 and unrealized P/L was EUR `+5.11`, approximately `+0.296R` or `+0.88%` of the starting balance.

## Exact current-strategy historical expectation

The current live rules were replayed without parameter search from 2026-01-01 through the same 07:45 UTC cutoff:

- Return from EUR 1,000: +87.92%
- Trades: 141 over 264 market dates, or 0.53 trades per market date
- Active dates: 118, or 44.70% coverage
- Win rate: 65.25%
- Profit factor: 1.400
- Average result: +0.169R per filled trade
- Maximum drawdown: 12.94%
- Maximum modeled risk: 3.00%
- Maximum modeled margin usage: 90.00%

This confirms the earlier activity limitation: the current strict live strategy is historically profitable in this replay, but it does not produce one or two filled trades every day. The historical figures are development evidence, not a fresh holdout; much of this period was already inspected while building the strategy.

## Operational findings

1. Signal generation, rating, pending-order placement, expiry, fill timing, SL/TP geometry, position sizing and one-slot enforcement matched the replay.
2. The dynamic stop correctly did nothing because the open trade had not reached 1R.
3. There were no failed analyses or process restarts after the successful start. One historical-price request was rate-limited at 08:00 UTC and succeeded on retry.
4. Because the only filled position remains open, there is not yet a realized live win/loss to judge the exit mechanism. The useful comparison so far is execution fidelity, which is strong.

## Artifacts

- `capital-dataset-update-20261104T0745Z.json`
- `capital-live-reconciliation-20261104.json`
- `current-live-strategy-2026-11-04.json`
- `current-live-strategy-full-2026-11-04.json`
