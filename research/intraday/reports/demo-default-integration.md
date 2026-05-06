# Demo Default Intraday Integration

Generated: `2026-05-06`

## Candidate

Default intraday profile: `intraday_09473_be83a91c4f2b`

Source JSON:

`research/intraday/candidates/aggressiveIntraday/best-maxDD-lt60__intraday_09473_be83a91c4f2b.json`

Research metrics:

- startCapital: `500`
- endCapital: `33008.39`
- rawPnl: `32508.39`
- maxDrawdownPct: `41.65`
- trades: `542`
- winRate: `65.68`
- profitFactor: `1.575`
- expectancyR: `0.3004`

## Files Changed

- `config.js`
- `strategies/Router.js`
- `strategies/sessionMomentumIntraday.js`
- `services/trading.js`
- `bot.js`
- `utils/strategyDecisionLogger.js`
- `package.json`
- `research/intraday/reports/demo-default-integration.md`

## Runtime Profile

The profile was copied from the candidate JSON, not manually re-tuned.

- `strategyFamily`: `session_momentum`
- `session`: `ny`
- `trendFilter`: `ema8_20`
- `entryProfile`: `M15`, `next_open`
- `exitProfile`: `adaptive_r_trail`
- `stopModel`: `fixed_pips`
- `stopPips`: `6`
- `activationR`: `0.5`
- `trailR`: `1`
- `breakevenR`: `1.2`
- `managementProfile`: `protect_profit`
- `minProfitR`: `2`
- `givebackPct`: `0.6`
- `riskProfile`: `aggressive_3pct`
- `riskPerTrade`: `0.03`
- `maxPositions`: `1`

## How To Start Demo Mode

```bash
npm run demo:intraday
```

Equivalent explicit command:

```bash
TRADING_STRATEGY_MODE=intraday_lab TRADING_EXECUTION_MODE=demo node bot.js
```

## How To Tail Decision Logs

```bash
tail -f backtest/logs/strategy-decisions.jsonl
```

Trade logs, if live order execution is explicitly enabled later:

```bash
tail -f backtest/logs/*.jsonl
```

## Env Flags

- `TRADING_STRATEGY_MODE=hllh`: old default HLLH mode.
- `TRADING_STRATEGY_MODE=intraday_lab`: routes decisions to the intraday candidate adapter.
- `TRADING_EXECUTION_MODE=demo`: never sends broker orders and disables broker position monitors.
- `ALLOW_INTRADAY_LIVE_ORDERS=true`: required before `intraday_lab` is allowed to send real broker orders. This is intentionally not enabled by default.

## Runtime Assumptions

- Entry signal is evaluated only on closed `M15` candles.
- Live entry timing is `next_open_live_approximation`: the bot evaluates shortly after candle close and uses current bid/ask as the closest available next-open proxy.
- Stop distance follows candidate `fixed_pips` logic with `6` pips clamped by `minStopPips` and `maxStopPips`.
- `adaptive_r_trail` is mapped to existing runtime `adaptive_trail_r` stop management.
- `protect_profit` is implemented in memory per open deal by tracking `maxFavorableR`; if the trade reached `2R` and gives back `60%`, the runtime requests a close.
- Decision logs are written for `no_signal`, `signal`, `blocked`, and `demo_order_blocked`.

## Remaining Differences From Research Simulator

- Research simulator monitored every historical `M5` candle. Runtime monitoring depends on scheduled monitor ticks and broker snapshots.
- Research entry was next monitoring candle open. Runtime approximates this with current bid/ask after the closed `M15` signal.
- Research used deterministic spread/slippage assumptions. Runtime depends on live bid/ask and broker fills.
- Research allowed `tpR: null`. Runtime demo does not place orders; live TP/limit mapping for a no-fixed-TP runner still needs a broker-safe implementation before real use.
- Research portfolio accounting is simulated. Runtime account balance, margin, minimum size and broker constraints can change actual sizing.
- Live/replay mismatch is still unresolved from the earlier `12 expected vs 6 actual` diagnostic.

## What To Check Today In Demo

- Does `strategy-decisions.jsonl` show `strategyMode=intraday_lab` and `profileId=intraday_09473_be83a91c4f2b`?
- Do NY session signals appear only during the intended UTC window?
- Are `bid`, `ask`, `spreadPips`, `entrySignalReason`, `exitProfile`, `managementProfile`, and `riskProfile` present for every decision?
- Are duplicate signals blocked by `normalizedCandidateId`?
- Does demo mode avoid all broker order placement?
- Compare demo decisions against a replay for the same symbols and candles.

## Commands

```bash
git status
npm run research:intraday:report -- --mode=aggressiveIntraday
npm run demo:intraday
tail -f backtest/logs/strategy-decisions.jsonl
```

## Safety

This is not live-parity proven and not a live-ready strategy. It is a demo default for intraday research mode. Do not run with real order execution until replay parity, fill assumptions, no-fixed-TP handling and broker monitor behavior are verified.
