# Live Parity Diagnostics

Generated: `2026-05-05T19:34:46.458Z`

## Observed Mismatch

Date: `2026-05-05`
Backtest/replay expected accepted trades: `12`
Live JSON logs showed actual trades: `6`

## Why Backtest Expected More Trades

- The research backtest has complete refreshed `M15` candles through the dataset end and can evaluate every HLLH candidate deterministically.
- It applies the configured research guards: start capital `500`, risk `3%`, one portfolio position at a time, one active trade per symbol through the portfolio sequencer, max stop, session hours, forced close, and pending-entry expiry.
- It simulates fills from OHLC candles and portfolio ordering, not from actual broker acceptance, live polling cadence, or real bid/ask execution state.

## Why Live Could Have Fewer Trades

- Live execution depends on the bot being active at the exact polling windows and on broker candles being available at that moment.
- `services/trading.js` can skip signals when global max positions, symbol-level open positions, broker state sync, margin, or order placement constraints block an entry.
- Live candles and backtest candles may differ by final candle timing, partial candles, broker updates, bid/ask spread, and timestamp normalization.
- Signal identity memory can suppress duplicates in live if `normalizedCandidateId` was already processed, while the backtest only sees the clean offline sequence.
- Live exits and broker fills change `openUntil` timing. With one active position, one delayed or rejected live close can remove later opportunities that the replay accepts.
- Order-level details such as spread spikes, minimum stop rules, rejected order causes, and available margin are not fully represented in the current research score.

## Can AutoSearch Be Trusted Before This Is Fixed?

Use AutoSearch as a research generator only. The ranking can find interesting parameter ideas, but it is not live proof while live/replay parity is unresolved. A candidate with high backtest growth must be replayed against live decision logs before it is considered for demo or paper trading.

## Fix Before LLM Layer

- Add decision logs for every HLLH candidate: accepted, rejected, and skipped, with exact guard reason.
- Replay live day from the same broker candles, same timestamp normalization, same pending-entry state, same position lifecycle, and same one-position guard.
- Store broker rejection causes, fill price, spread, stop distance, margin snapshot, and `normalizedCandidateId` for each attempted entry.
- Add a parity test that compares live decisions vs replay decisions per symbol and per candle before using logs for an LLM dataset.

## Today Details

Date: `2026-05-05`
Simulated accepted trades today: `12`
Actual logged trades today: `6`

Actual trades:
- 2026-05-05T09:45:12.830Z EURAUD BUY status=closed dealId=00005552-0005-511e-0000-0000804e27b6
- 2026-05-05T10:15:19.298Z GBPUSD BUY status=closed dealId=00007090-0055-311e-0000-00008118f5a1
- 2026-05-05T11:45:15.453Z EURJPY SELL status=closed dealId=00005552-0029-065e-0000-000080a75c41
- 2026-05-05T12:45:15.415Z EURJPY BUY status=closed dealId=00005552-0029-065e-0000-000080a75c5e
- 2026-05-05T14:30:19.396Z GBPUSD BUY status=closed dealId=00007090-0055-311e-0000-00008118f6da
- 2026-05-05T16:30:15.330Z EURJPY BUY status=open dealId=00005552-0029-065e-0000-000080a75ca7

Simulated trades:
- 2026-05-05T00:30:00.000Z EURAUD LONG exit=stop_loss pnlR=-1.692
- 2026-05-05T02:45:00.000Z EURJPY SHORT exit=adaptive_trailing_stop pnlR=0.442
- 2026-05-05T05:15:00.000Z EURJPY SHORT exit=stop_loss pnlR=-1.489
- 2026-05-05T07:00:00.000Z GBPUSD LONG exit=adaptive_trailing_stop pnlR=0.736
- 2026-05-05T07:45:00.000Z EURJPY LONG exit=adaptive_trailing_stop pnlR=0.993
- 2026-05-05T09:15:00.000Z EURAUD LONG exit=stop_loss pnlR=-1.434
- 2026-05-05T10:00:00.000Z EURAUD SHORT exit=adaptive_trailing_stop pnlR=0.592
- 2026-05-05T11:30:00.000Z EURAUD SHORT exit=adaptive_trailing_stop pnlR=1.471
- 2026-05-05T12:30:00.000Z EURJPY LONG exit=adaptive_trailing_stop pnlR=1.226
- 2026-05-05T13:15:00.000Z GBPUSD SHORT exit=stop_loss pnlR=-1.171
- 2026-05-05T14:15:00.000Z GBPUSD LONG exit=adaptive_trailing_stop pnlR=0.777
- 2026-05-05T16:15:00.000Z EURJPY LONG exit=adaptive_trailing_stop pnlR=0.437

