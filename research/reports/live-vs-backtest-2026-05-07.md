# Live vs Backtest 2026-05-07

- generatedAt: 2026-05-07T18:10:23.847Z
- liveSignals: 6
- liveBlockedMaxPositions: 1027
- liveNoSignal: 154
- liveTradeRows: 6

## Findings

- Today is dominated by max_positions_reached: 1027 blocked rows out of 1187 total strategy decision rows.
- This means the bot spent most of the day unable to evaluate new opportunities in a way that is recoverable from old logs. Forward logging is now fixed to still record blocked signals after strategy evaluation.
- Several recent intraday signals had extreme spread at signal time. The widest examples are listed below; this strongly suggests a missing spread filter in the live strategy surface.
- Formal candle backtest parity for 2026-05-07 is limited because backtest/capital-dataset/*_M15.jsonl currently stops at 2026-05-04, while live backtest/prices/*.jsonl continue through 2026-05-07.

## Today Trades

| Symbol | Dir | Entry | realizedR | maxFav30 | maxFav60 | maxAdv30 | hitProfitBeforeStop60m | Root Cause |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EURJPY | SELL | 2026-05-07T00:15:30.801Z | -0.7071 | -0.7677 | 0.9192 | -2.3131 | false | timing_or_protection_failure |
| AUDJPY | SELL | 2026-05-07T00:30:11.595Z | 0.3725 | 1.3529 | 1.7059 | 0.0294 | true | worked_or_neutral |
| AUDJPY | BUY | 2026-05-07T02:00:11.870Z | 2.41 | -0.13 | 0.43 | -0.61 |  | worked_or_neutral |
| AUDJPY | SELL | 2026-05-07T12:45:11.867Z | -0.102 | 1.051 | 1.051 | -0.0918 | true | exit_or_management_failure |
| GBPUSD | BUY | 2026-05-07T15:00:51.584Z | -0.8218 | -0.2178 | -0.2178 | -2.1782 | false | entry_failure |
| EURUSD | SELL | 2026-05-07T15:30:34.562Z |  | 0.26 | 0.83 | -0.53 |  | open_trade |

## Spread Warnings

- 2026-05-06T21:30:07.524Z AUDCAD spreadPips=20.90000000000036 reason=bear_impulse
- 2026-05-06T21:30:19.153Z EURAUD spreadPips=14.600000000000168 reason=bull_impulse
- 2026-05-06T21:30:23.162Z EURCHF spreadPips=12.600000000000389 reason=bear_impulse
- 2026-05-06T21:30:42.623Z GBPCHF spreadPips=29.09999999999968 reason=bear_impulse
- 2026-05-06T21:30:54.064Z NZDJPY spreadPips=23.400000000000887 reason=bear_impulse
- 2026-05-06T21:30:58.069Z NZDUSD spreadPips=10.799999999999699 reason=bear_impulse
- 2026-05-06T21:31:05.828Z USDCHF spreadPips=15.699999999999603 reason=bear_impulse
- 2026-05-06T21:45:41.525Z GBPCHF spreadPips=15.300000000000313 reason=bull_impulse
- 2026-05-06T21:45:53.058Z NZDJPY spreadPips=24.2999999999995 reason=bull_impulse
- 2026-05-06T21:45:57.076Z NZDUSD spreadPips=9.499999999998954 reason=bull_impulse

## Interpretation

- entry_failure means price never gave enough favorable excursion; the setup quality was poor at entry.
- exit_or_management_failure means the trade had enough positive excursion but still finished poorly; this points to management, trailing, breakeven, or forced-flat logic.
- timing_or_protection_failure means the setup had some edge, but the live path was noisy enough that the current entry/management combination did not hold it.
