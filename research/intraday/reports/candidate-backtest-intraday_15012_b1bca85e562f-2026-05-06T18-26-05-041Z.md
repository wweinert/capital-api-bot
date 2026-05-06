# Intraday Candidate Backtest

- generatedAt: 2026-05-06T18:26:05.041Z
- candidatePath: /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-endCapital__intraday_15012_5bcdee846128.json
- experimentId: intraday_15012_b1bca85e562f
- symbols: AUDCAD, AUDJPY, AUDUSD, EURAUD, EURCHF, EURGBP, EURJPY, EURUSD, GBPAUD, GBPCHF, GBPJPY, GBPUSD, NZDJPY, NZDUSD, USDCAD, USDCHF, USDJPY
- dateRange: 2026-02-05T18:15:00.000Z .. 2026-05-06T18:15:00.000Z
- startCapital: 500
- endCapital: 411944.14
- rawPnl: 411444.14
- maxDrawdownPct: 24.43
- trades: 893
- winRate: 69.76
- profitFactor: 1.749
- expectancyR: 0.2661
- riskPerTrade: 0.03
- maxPositions: 1
- marginCapPct: 0.75

## Weekly Report

| weekStart | weekEnd | startBalance | endBalance | pnl | returnPct | trades | wins | losses | winRate | profitFactor | expectancyR | maxDrawdownPct | bestTradeR | worstTradeR | avgHoldBars | bySymbol | exitReasons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-02-02 | 2026-02-08 | 500 | 623.12 | 123.12 | 24.62 | 22 | 16 | 6 | 72.73 | 2.15 | 0.348 | 10.71 | 1.04 | -1.408 | 7.77 | AUDJPY:6, AUDCAD:6, EURCHF:2, USDCHF:1, USDCAD:1, EURGBP:1, EURUSD:1, USDJPY:1, GBPUSD:1, EURJPY:1, NZDUSD:1 | stop_loss_or_trailing_stop:20, time_based_exit:1, no_overnight_flat:1 |
| 2026-02-09 | 2026-02-15 | 623.12 | 1748.03 | 1124.91 | 180.53 | 78 | 61 | 17 | 78.21 | 2.344 | 0.4567 | 18.89 | 1.751 | -1.408 | 6.05 | AUDCAD:14, EURGBP:11, EURCHF:10, EURUSD:9, AUDJPY:7, USDCAD:7, AUDUSD:5, EURJPY:5, USDCHF:3, NZDJPY:2, NZDUSD:2, USDJPY:2, GBPUSD:1 | stop_loss_or_trailing_stop:77, no_overnight_flat:1 |
| 2026-02-16 | 2026-02-22 | 1748.03 | 2765.58 | 1017.55 | 58.21 | 69 | 45 | 24 | 65.22 | 1.576 | 0.2364 | 14.85 | 1.04 | -1.408 | 12.81 | EURCHF:12, AUDCAD:10, EURGBP:10, AUDUSD:8, AUDJPY:7, EURJPY:5, EURUSD:5, USDCAD:4, USDJPY:2, NZDUSD:2, USDCHF:2, GBPUSD:1, GBPCHF:1 | stop_loss_or_trailing_stop:59, time_based_exit:6, no_overnight_flat:4 |
| 2026-02-23 | 2026-03-01 | 2765.58 | 5682.1 | 2916.52 | 105.46 | 80 | 57 | 23 | 71.25 | 1.885 | 0.3154 | 11.87 | 1.04 | -1.408 | 8.34 | AUDCAD:13, EURUSD:11, AUDJPY:10, EURGBP:10, EURCHF:9, EURJPY:6, AUDUSD:6, USDJPY:4, NZDJPY:3, GBPUSD:2, NZDUSD:2, GBPCHF:2, USDCAD:2 | stop_loss_or_trailing_stop:76, time_based_exit:3, no_overnight_flat:1 |
| 2026-03-02 | 2026-03-08 | 5682.1 | 12801.74 | 7119.64 | 125.3 | 76 | 58 | 18 | 76.32 | 2.231 | 0.3721 | 13.43 | 1.04 | -1.451 | 4 | AUDCAD:13, EURCHF:12, AUDJPY:10, EURGBP:8, EURJPY:6, EURUSD:5, GBPCHF:5, USDJPY:5, USDCAD:4, USDCHF:3, AUDUSD:3, NZDJPY:1, GBPUSD:1 | stop_loss_or_trailing_stop:76 |
| 2026-03-09 | 2026-03-15 | 12801.74 | 25635 | 12833.26 | 100.25 | 78 | 57 | 21 | 73.08 | 1.775 | 0.3123 | 14.56 | 1.04 | -1.585 | 6.24 | EURCHF:14, AUDCAD:13, AUDJPY:10, EURGBP:7, EURJPY:5, EURUSD:5, USDJPY:5, NZDJPY:4, USDCAD:3, GBPCHF:3, AUDUSD:3, USDCHF:3, GBPUSD:2, NZDUSD:1 | stop_loss_or_trailing_stop:76, time_based_exit:1, no_overnight_flat:1 |
| 2026-03-16 | 2026-03-22 | 25635 | 32199.22 | 6564.22 | 25.61 | 59 | 38 | 21 | 64.41 | 1.278 | 0.1459 | 24.43 | 1.537 | -1.585 | 8.71 | AUDCAD:11, EURCHF:9, EURGBP:8, AUDJPY:7, EURUSD:4, USDCAD:4, EURJPY:4, NZDJPY:3, USDJPY:3, AUDUSD:2, USDCHF:2, GBPUSD:1, NZDUSD:1 | stop_loss_or_trailing_stop:57, time_based_exit:1, no_overnight_flat:1 |
| 2026-03-23 | 2026-03-29 | 32199.22 | 62864.1 | 30664.88 | 95.23 | 74 | 55 | 19 | 74.32 | 1.788 | 0.3162 | 10.41 | 1.04 | -1.585 | 6.62 | AUDCAD:17, EURCHF:14, EURGBP:11, EURJPY:8, USDCAD:6, NZDJPY:6, AUDJPY:6, EURUSD:2, GBPCHF:2, AUDUSD:2 | stop_loss_or_trailing_stop:71, time_based_exit:2, no_overnight_flat:1 |
| 2026-03-30 | 2026-04-05 | 62864.1 | 83649.52 | 20785.42 | 33.06 | 70 | 45 | 25 | 64.29 | 1.306 | 0.1514 | 9.62 | 1.04 | -1.585 | 10.1 | AUDCAD:16, EURCHF:11, AUDJPY:7, EURUSD:7, NZDJPY:6, EURGBP:6, USDCAD:4, AUDUSD:4, GBPCHF:3, USDCHF:2, USDJPY:2, EURJPY:1, NZDUSD:1 | stop_loss_or_trailing_stop:62, no_overnight_flat:4, time_based_exit:4 |
| 2026-04-06 | 2026-04-12 | 83649.52 | 98811.15 | 15161.63 | 18.13 | 72 | 45 | 27 | 62.5 | 1.169 | 0.0929 | 18.28 | 1.04 | -1.585 | 9.17 | AUDCAD:13, EURCHF:13, AUDJPY:8, AUDUSD:7, USDCAD:7, EURUSD:6, NZDJPY:5, GBPCHF:5, USDJPY:4, NZDUSD:2, GBPUSD:1, USDCHF:1 | stop_loss_or_trailing_stop:67, time_based_exit:4, no_overnight_flat:1 |
| 2026-04-13 | 2026-04-19 | 98811.15 | 112942.94 | 14131.79 | 14.3 | 56 | 34 | 22 | 60.71 | 1.193 | 0.0948 | 20.16 | 1.04 | -1.585 | 13.05 | AUDCAD:11, EURCHF:9, AUDJPY:8, USDCAD:8, NZDJPY:6, EURUSD:3, GBPCHF:3, AUDUSD:3, USDJPY:2, NZDUSD:2, USDCHF:1 | stop_loss_or_trailing_stop:49, no_overnight_flat:4, time_based_exit:3 |
| 2026-04-20 | 2026-04-26 | 112942.94 | 127060.5 | 14117.56 | 12.5 | 59 | 36 | 23 | 61.02 | 1.162 | 0.0805 | 9.29 | 0.932 | -1.585 | 12.31 | EURCHF:13, AUDCAD:11, GBPCHF:10, NZDJPY:7, USDCAD:6, AUDJPY:4, USDCHF:3, NZDUSD:2, USDJPY:2, AUDUSD:1 | stop_loss_or_trailing_stop:51, no_overnight_flat:5, time_based_exit:3 |
| 2026-04-27 | 2026-05-03 | 127060.5 | 195923.71 | 68863.21 | 54.2 | 58 | 40 | 18 | 68.97 | 1.84 | 0.2651 | 18.35 | 2.932 | -1.451 | 11.83 | EURCHF:11, USDJPY:6, AUDJPY:6, GBPCHF:6, AUDCAD:6, USDCAD:5, AUDUSD:4, USDCHF:4, EURGBP:4, GBPAUD:3, NZDUSD:1, NZDJPY:1, EURAUD:1 | stop_loss_or_trailing_stop:52, time_based_exit:4, no_overnight_flat:2 |
| 2026-05-04 | 2026-05-10 | 195923.71 | 411944.14 | 216020.42 | 110.26 | 42 | 36 | 6 | 85.71 | 4.238 | 0.6052 | 4.22 | 2.562 | -1.408 | 4.43 | AUDCAD:8, EURCHF:7, AUDUSD:4, GBPCHF:4, AUDJPY:4, EURGBP:3, GBPAUD:3, EURAUD:3, USDCAD:2, EURJPY:2, GBPJPY:1, NZDJPY:1 | stop_loss_or_trailing_stop:42 |

## Runtime Guard Notes

- This research backtest enforces startCapital=500, maxPositions=1, riskPerTrade<=3%, daily trade guards, symbol/day guards, stop-after-losses, and risk reduction after drawdown.
- Margin cap is carried as marginCapPct=0.75. Live sizing enforces broker margin in services/trading.js; research simulator still uses R-based cash sizing and does not fully model broker margin conversion/fill rejection.
- Risk flags: very_interesting, reliability_bonus, live_parity_risk, same_candle_ambiguity_conservative
- Rejection reason: none
