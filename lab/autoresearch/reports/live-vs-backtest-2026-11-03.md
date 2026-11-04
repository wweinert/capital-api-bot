# Live demo vs offline replay — 2026-11-03

## Scope

- Live process: commit `7aec764753d1b4250301250f4e9435f31bb75b60`
- Process start: 2026-11-02 18:46 UTC (19:46 CET)
- Reconciliation cutoff: 2026-11-03 09:25 UTC (10:25 CET)
- Broker account: demo
- Starting balance reconstructed from broker transactions: EUR 586.83
- Portfolio limit: one working order or position

## Signal reconciliation

The offline replay produced eight eligible signals. Live produced the same eight signals and selected the same two positions.

| Signal UTC | Symbol | Side | Live result |
| --- | --- | --- | --- |
| 00:00 | EURUSD | BUY | Selected |
| 00:00 | USDCHF | SELL | Not selected; EURUSD ranked first |
| 00:00 | EURJPY | BUY | Not selected; EURUSD ranked first |
| 01:00 | AUDJPY | SELL | Observed at 01:15 after API outage; slot occupied |
| 02:00 | USDJPY | BUY | Slot occupied |
| 03:00 | USDCHF | SELL | Selected |
| 04:00 | EURUSD | BUY | Slot occupied |
| 05:00 | USDJPY | BUY | Slot occupied |

## Trade reconciliation

| Field | EURUSD BUY | USDCHF SELL |
| --- | ---: | ---: |
| Signal UTC | 00:00 | 03:00 |
| Requested entry, backtest/live | 1.11952 / 1.11952 | 0.81904 / 0.81904 |
| Live fill | 1.11952 at 00:08:06 | 0.81903 at 03:33:14 |
| Stop | 1.11803 | 0.82025 |
| Target | 1.12176 | 0.81723 |
| Backtest close | 02:18, stop loss | 06:41, trailing stop |
| Live close | 02:17:27, stop loss | 06:41:03, trailing stop |
| Live P/L | EUR -17.59 | EUR +11.41 |

Backtest normalized to the live account expected approximately EUR -5.52 (-0.94%). Actual P/L was EUR -6.18 (-1.05%). The difference was EUR -0.66 (-0.11 percentage points), almost entirely from the USDCHF trailing fill. The backtest expected about +0.709R; the broker realized about +0.67R.

## Operational findings

1. A host/broker connectivity outage affected both independent demo bots from 00:09:59 until 01:13:46 UTC. It was not isolated to this strategy. Server-side stop and target protection remained active.
2. AUDJPY was therefore detected 15 minutes late. The occupied slot prevented a behavioral difference on this occasion. A free slot could have received a stale order with a new 45-minute expiry.
3. There were 59 historical-price rate-limit retries after 05:30 UTC. Both bots run aligned scans from the same host, while this bot fetches H1/M15/M5 every 15 minutes even though signal decisions only change once per H1 candle.
4. PM2 logs are cumulative since May and have no effective rotation. The current process itself remained up continuously; the historical PM2 restart counter does not represent overnight restarts.
5. The 15-second DealID tick is logged at info level and creates unnecessary volume. Aggregate network errors are currently logged without their useful cause.

## Recommended direction

Do not change the wave/pattern rules based on this night: signal selection and execution timing matched the replay closely. Prioritize runtime fidelity:

1. Make pending expiry relative to the H1 decision time so a delayed catch-up cannot receive a fresh 45-minute lifetime.
2. Add an explicit catch-up scan after session recovery and record signal decision time versus observation time.
3. Reduce market-data polling: only perform the full H1/M15/M5 strategy scan when a new closed H1 candle exists, or coordinate a host-wide rate limiter between bots.
4. Record requested entry, broker fill, requested/realized risk, trailing activation, close level and realized R in a structured trade journal.
5. Calibrate the backtest with observed trailing slippage; the first live observation was about 0.04R below the M1 model.
6. Enable PM2 log rotation and demote repetitive monitor ticks to debug level.

## Artifacts

- `capital-dataset-update-20261103T0925Z.json`
- `capital-live-reconciliation-20261103.json`
- `current-strategy-2026-11-03.json`
