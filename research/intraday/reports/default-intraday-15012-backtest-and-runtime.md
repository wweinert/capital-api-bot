# Default Intraday Candidate 15012 Backtest And Runtime Check

- generatedAt: 2026-05-06T18:31:30Z
- defaultProfileId: intraday_15012_5bcdee846128
- candidatePath: research/intraday/candidates/aggressiveIntraday/best-endCapital__intraday_15012_5bcdee846128.json
- backtestReport: research/intraday/reports/candidate-backtest-intraday_15012_b1bca85e562f-2026-05-06T18-26-05-041Z.md
- weeklyCsv: research/intraday/reports/candidate-backtest-intraday_15012_b1bca85e562f-2026-05-06T18-26-05-041Z.weekly.csv

## Candidate

- strategyFamily: momentum_continuation
- entryProfile: M15 signal, M5 execution, next_open
- exitProfile: adaptive_r_trail
- managementProfile: session_flat
- riskProfile: aggressive_guarded_3pct
- riskPerTrade: 0.03
- maxPositions: 1
- marginCapPct: 0.75

## Latest Data Backtest

- dateRange: 2026-02-05T18:15:00.000Z .. 2026-05-06T18:15:00.000Z
- symbols: AUDCAD, AUDJPY, AUDUSD, EURAUD, EURCHF, EURGBP, EURJPY, EURUSD, GBPAUD, GBPCHF, GBPJPY, GBPUSD, NZDJPY, NZDUSD, USDCAD, USDCHF, USDJPY
- startCapital: 500
- endCapital: 411944.14
- rawPnl: 411444.14
- trades: 893
- winRate: 69.76
- profitFactor: 1.749
- expectancyR: 0.2661
- maxDrawdownPct: 24.43
- averageHoldBars: 8.61

## Guards Checked

- maxPositions is enforced in research as 1.
- riskPerTrade is enforced in research as <= 0.03.
- live sizing now uses RISK.MARGIN_CAP_PCT, defaulting to 0.75 for this intraday profile.
- daily guards, per-symbol/day guards, stop-after-losses, and drawdown risk reduction remain active in research simulation.
- live execution still requires ALLOW_INTRADAY_LIVE_ORDERS=true for real broker orders in intraday_lab mode.

## Data Notes

- M15 data was updated for all 17 symbols to 2026-05-06T18:15:00.000Z.
- M5 data was updated for all 17 symbols to 2026-05-06T18:25:00.000Z where Capital API allowed it.
- Capital API rejected max=5000 for M5 with error.invalid.max; the accepted M5 update used max=1000.
- Some symbols that previously had no M5 history now only have the latest 1000 M5 bars, so older 90-day portions can still be less complete than M15.

## Runtime Smoke

- Local default config imports as TRADING_STRATEGY_MODE=intraday_lab.
- DEFAULT_INTRADAY_PROFILE_ID resolves to intraday_15012_5bcdee846128.
- Router registers the intraday strategy with family momentum_continuation.
- demo:intraday started successfully with broker session when run outside sandbox.
- First analysis tick fetched H1, M15, M5, and M1 candles for symbols.
- Runtime guard maxPositions=1 was active; account state showed Open trades: 1/1, so new entries were blocked.

## Server Check

- waldemar-pi branch: autosearch
- waldemar-pi commit: 83d5a90
- waldemar-pi has a running node bot.js process.
- The server process did not expose TRADING_STRATEGY_MODE/TRADING_EXECUTION_MODE/ALLOW_INTRADAY_LIVE_ORDERS in /proc environment.
- These local changes are not automatically deployed to waldemar-pi by this report.

## Not Live-Proven

- This is still a backtest/research candidate, not a live-proven strategy.
- Research simulator still uses R-based cash sizing and does not fully model broker margin conversion/fill rejection.
- Same-candle ambiguity remains handled conservatively, but bid/ask intrabar parity is still incomplete.
- Live parity needs forward/demo validation after deployment.
