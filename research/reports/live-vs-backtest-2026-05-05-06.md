# Live vs Backtest Diagnostic: 2026-05-05 / 2026-05-06

Generated: 2026-05-06 UTC

## Scope

Investigated server logs from `waldemar-pi:/home/pi/dev/capital-api-bot` for 2026-05-05 and 2026-05-06.

Copied into local temp only:

- `/private/tmp/capital-api-bot-server-logs/`
- `/private/tmp/capital-api-bot-server-prices/`

No live config was changed. No orders were placed.

## Runtime Mode Found On Server

Server `config.js` exported:

- `TRADING_STRATEGY_MODE`: `hllh`
- `EXECUTION.MODE`: `live`
- `EXECUTION.ALLOW_INTRADAY_LIVE_ORDERS`: `false`
- `DEFAULT_INTRADAY_PROFILE_ID`: `intraday_09473_be83a91c4f2b`

Important: the real trades from 2026-05-05 and 2026-05-06 were not executed by `intraday_09473_be83a91c4f2b` / `session_momentum`. They were executed by `paHigherLowLowerHigh`:

- `strategyName`: `paHigherLowLowerHigh`
- `strategyType`: `PA_HIGHER_LOW_LOWER_HIGH`
- `openReason`: `pa_hllh_entry_on_close`
- `entryMode`: `entry_on_close`
- `exitVariant`: `adaptive_trail_1r_0_5`
- `managementProfile.mode`: `adaptive_trail_r`

## Actual Live Trades

Server logs contain 22 closed/opened-then-closed trades across 2026-05-05 and 2026-05-06.

Approximate R result from logged entry/SL/close:

| Date | Trades | Wins | Losses | Sum R |
| --- | ---: | ---: | ---: | ---: |
| 2026-05-05 | 9 | 4 | 5 | +1.533R |
| 2026-05-06 | 13 | 2 | 10 | -3.555R |
| Total | 22 | 6 | 15 | -2.022R |

By symbol:

| Symbol | Trades | Wins | Losses | Sum R |
| --- | ---: | ---: | ---: | ---: |
| EURAUD | 9 | 0 | 9 | -5.738R |
| GBPUSD | 6 | 3 | 2 | +2.671R |
| EURJPY | 6 | 3 | 3 | +1.863R |
| GBPAUD | 1 | 0 | 1 | -0.818R |

The dominant problem was `EURAUD`: 9 trades, 9 losses.

## Entry / Monitoring / Exit Diagnosis

Most losing trades had no meaningful favorable excursion before loss.

Examples from 2026-05-06:

| Time UTC | Symbol | Side | PnL R | MFE R | Diagnosis |
| --- | --- | --- | ---: | ---: | --- |
| 04:00 | GBPUSD | SELL | -0.88 | +0.04 | entry/timing failed |
| 04:45 | EURAUD | SELL | -0.71 | +0.08 | entry/timing failed |
| 05:45 | EURAUD | BUY | -0.37 | -1.02 | entry immediately wrong |
| 06:00 | EURAUD | SELL | -0.81 | -0.58 | entry immediately wrong |
| 06:45 | EURJPY | SELL | -0.80 | -0.68 | entry immediately wrong |
| 10:00 | EURAUD | SELL | -0.92 | -0.12 | entry/timing failed |
| 13:15 | EURAUD | BUY | -0.77 | +0.40 | some follow-through, not enough for 1R trail |
| 15:45 | GBPAUD | BUY | -0.82 | -0.20 | entry/timing failed |
| 16:15 | EURAUD | SELL | -0.45 | -0.83 | entry immediately wrong |

Conclusion: today's losses are primarily an entry/timing problem, not a final exit problem. The monitoring layer rarely had profit to protect. The one partial exception is EURAUD 13:15 UTC, which reached only about `0.40R`, below the current `adaptive_trail_r.activationR = 1`.

There is still an exit/management weakness on some winners: several trades reached around `1R` to `1.75R` MFE and closed lower, e.g. EURJPY 2026-05-05 16:30 UTC reached about `1.75R` and closed around `0.70R`. This is profit-capture inefficiency, but it does not explain today's losing streak.

## Backtest Expected Result

Current `backtest/capital-dataset/*_M15.jsonl` ends at `2026-05-05T17:30:00.000Z`, so it cannot produce a complete clean historical backtest for 2026-05-06 without updating data.

For 2026-05-05 only, replaying current HLLH profile on `backtest/capital-dataset` produced:

- all symbol signals: 23
- portfolio `maxPositions = 1`: 14 accepted trades
- wins/losses: 9 / 5
- approximate sum: `+5.163R`

Actual 2026-05-05 live logs:

- 9 trades
- wins/losses: 4 / 5
- approximate sum: `+1.533R`

This is a material live/backtest mismatch.

## Live Data Replay Approximation

Using server `backtest/prices/*.jsonl` snapshots and extracting M15 candles gave an approximate HLLH replay for 2026-05-05/06:

- all signals: 39
- portfolio `maxPositions = 1`: 23 accepted trades
- wins/losses: 11 / 12
- approximate sum: `+2.854R`

Actual live over the same window:

- 22 trades
- wins/losses: 6 / 15
- approximate sum: `-2.022R`

This approximation is not fully trustworthy because the server price logs expose a timestamp problem described below.

## Critical Timestamp / Candle Issue

`api.js` currently maps broker candles like this:

```js
timestamp: new Date(p.snapshotTime).toLocaleString()
```

This loses timezone information and ignores `snapshotTimeUTC` if Capital.com provides it.

Observed in server price logs:

- Snapshot timestamp: `2026-05-06T16:31:08.142Z`
- Logged `candles.m15.t`: `2026-05-06T17:15:00.000Z`

For active symbols on 2026-05-06, nearly every price snapshot had `candles.m15.t > snapshot.timestamp`:

- `EURAUD`: 2703 / 2703 snapshots
- `EURJPY`: 2658 / 2658 snapshots
- `GBPAUD`: 2706 / 2725 snapshots
- `GBPUSD`: 2509 / 2509 snapshots

That means the stored candle timestamp can appear to be in the future relative to the actual live snapshot. The likely cause is timezone stripping via `toLocaleString()`.

Impact:

- UTC filters can be wrong.
- `normalizedCandidateId` can encode shifted signal times.
- backtest/replay cannot be trusted for exact live parity.
- daily flat / avoid hour / weekend filters can drift.
- comparing actual live entry time against historical candle time becomes unreliable.

## Entry Timing Mismatch

The research/backtest `entry_on_close` assumes the strategy enters at the signal candle close.

Live cannot actually enter on that historical close. Live flow is:

1. wait for scheduled analysis tick after M15 boundary,
2. fetch candles,
3. evaluate signal,
4. place market order,
5. receive broker fill.

Additionally, `liveCandleRows()` slices off the last returned candle:

```js
return rows.length > 1 ? rows.slice(0, -1) : rows;
```

If Capital.com already returns closed candles for the requested resolution, live is evaluating one candle late. This can turn a backtested momentum continuation into a late entry after the move has already happened.

Observed entry slippage against `expectedEntryPrice` was often several pips:

- EURAUD 2026-05-06 13:15 BUY: +4.6 pips worse
- EURJPY 2026-05-05 23:45 BUY: +5.1 pips worse
- EURJPY 2026-05-05 16:30 BUY: +3.5 pips worse
- EURAUD 2026-05-06 06:00 SELL: +3.6 pips worse
- GBPUSD 2026-05-06 08:00 BUY: +2.6 pips worse

With 4-12 pip stops, a 2-5 pip timing/fill difference is large enough to destroy expectancy.

## Current Root Cause Hypothesis

Main cause of today's bad result:

1. The bot did not run the `intraday_09473` AutoSearch candidate. It ran HLLH mode.
2. The HLLH live implementation is not live-parity clean:
   - timestamp normalization is unsafe,
   - `entry_on_close` is modeled too optimistically in backtest,
   - live evaluation may be one candle late,
   - broker bid/ask/spread and market fill are not equivalent to backtest candle close fills.
3. The losing trades were mostly bad/late entries, especially on `EURAUD`.
4. Monitoring/exit did not have enough favorable movement to rescue most trades.

## Can AutoSearch Be Trusted Right Now?

Not for exact live performance.

AutoSearch can still generate research ideas, but candidates should not be treated as live-ready until the replay engine and runtime use the same:

- candle timestamp source,
- entry timing,
- bid/ask pricing,
- spread/slippage model,
- one-position portfolio guard,
- live order fill model,
- trailing stop update rules,
- close reason classification.

## What To Fix Before The Next Research Cycle

Priority fixes:

1. Stop using `toLocaleString()` for candle timestamps. Use `snapshotTimeUTC` when available, otherwise preserve an explicit ISO timestamp.
2. Add a live-parity replay mode that simulates `entry_on_next_open` or `entry_on_next_tick`, not idealized `entry_on_close`.
3. Add a guard/report that detects `candle.t > snapshot.timestamp`.
4. Add a spread/slippage penalty proportional to stop distance.
5. Compare live signals by `normalizedCandidateId` against replay signals after timestamp normalization is fixed.
6. Separate symbol diagnostics. `EURAUD` should be reviewed or disabled until parity is fixed.
7. Require forward/demo replay for any AutoSearch candidate before live execution.

## Commands Used

```bash
ssh pi@waldemar-pi 'cd dev/capital-api-bot && git status --short --branch && pwd && ls -lah backtest/logs && ls -lah backtest/prices && ls -lah backtest/logs/strategy-decisions.jsonl 2>/dev/null || true'
rsync -avz pi@waldemar-pi:dev/capital-api-bot/backtest/logs/ /private/tmp/capital-api-bot-server-logs/
rsync -avz pi@waldemar-pi:dev/capital-api-bot/backtest/prices/ /private/tmp/capital-api-bot-server-prices/
node --input-type=module -e '<trade summary parser>'
node --input-type=module -e '<server price log replay parser>'
```
