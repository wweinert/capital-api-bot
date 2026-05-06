# Intraday Strategy Lab

Research-only AutoSearch lab for testing intraday strategy families, exits, monitoring, management, and risk profiles together.

This does not change `config.js`, `api.js`, `.env`, or live execution.

## Commands

```bash
npm run research:intraday:baseline
npm run research:intraday:search -- --minutes=30 --mode=aggressiveIntraday --seed=20260505
npm run research:intraday:search -- --minutes=60 --mode=maxProfit
npm run research:intraday:report -- --mode=aggressiveIntraday
```

Useful smoke command:

```bash
npm run research:intraday:search -- --minutes=2 --mode=aggressiveIntraday --seed=20260505 --logEvery=10
```

## Scope

The lab searches:

- `strategyFamily`: HLLH continuation, opening range breakout, Donchian breakout, EMA pullback, momentum continuation, mean reversion, liquidity sweep reversal, volatility squeeze breakout, session momentum, simple baselines.
- `entryProfile`: M5/M15 next-open entry after a closed signal candle.
- `exitProfile`: fixed R, partial take-profit, breakeven, adaptive R trail, ATR trail, candle trail, EMA exit, momentum decay, time exit, profit protection.
- `managementProfile`: passive, fast cut, protect profit, momentum watch, session/daily flat.
- `riskProfile`: 1%, 2%, 3%, 4% variants with portfolio limits and daily guards.

## Realism

- Entry is on next monitoring candle open.
- Monitoring is M5 when available, otherwise entry timeframe.
- Same-candle TP/SL ambiguity is conservative: stop wins before take-profit.
- Spread is approximated from `backtest/prices/*.jsonl` when available.
- Slippage is fixed at `0.2` pips in the first implementation.
- Portfolio leverage/margin is simplified to risk-cash sizing.

Treat all candidates as backtest research, not live proof.
