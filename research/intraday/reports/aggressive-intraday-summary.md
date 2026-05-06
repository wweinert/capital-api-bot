# Intraday Strategy Lab Report

Generated: `2026-05-06T18:33:29.587Z`
Mode: `aggressiveIntraday`
Selected score: `aggressiveIntraday`
Rows analyzed: `34529`
Results: `research/intraday/results.tsv`
Search summary: `research/intraday/reports/intraday_search_2026-05-06T18-02-23-766Z.json`

## Commands

```bash
npm run research:intraday:baseline
npm run research:intraday:search -- --minutes=30 --mode=aggressiveIntraday --seed=20260505
npm run research:intraday:search -- --minutes=60 --mode=maxProfit
npm run research:intraday:report -- --mode=aggressiveIntraday
```

## Previous Reference

Previous HLLH AutoSearch reference: `500 -> 1076.09` over 90 days.

## Search Run

Completed experiments in latest run: `16312`
Elapsed minutes: `15.00`
Symbols: `AUDCAD,AUDJPY,AUDUSD,EURAUD,EURCHF,EURGBP,EURJPY,EURUSD,GBPAUD,GBPCHF,GBPJPY,GBPUSD,NZDJPY,NZDUSD,USDCAD,USDCHF,USDJPY`

## Best By endCapital

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |

## Best By rawPnl

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |

## Best By aggressiveIntraday Score

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |

## Best By maxProfit Score

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | maxProfit | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 55840.2642 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |

## Best By profitFactor

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |

## Best By expectancyR

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_01425_cbcc0e04cb70 | momentum_continuation | adaptive_r_trail_5_0.5_0.4 | conservative_1pct_pos1_day4 | 14 | 42.86 | 8.928 | 3.5749 | 1.48 | 749.17 | 249.17 | 728.9969 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf,same_candle_ambiguity_conservative |  |

## Best With maxDD < 40%

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_4pct_3pct_pos1_day16 | 947 | 66.00 | 1.544 | 0.2256 | 28.69 | 160469.94 | 159969.94 | 18999.6089 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 3 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 4 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 5 | intraday_09607_510df5812160 | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 611 | 66.12 | 1.462 | 0.2080 | 37.59 | 14889.75 | 14389.75 | 3248.6131 | very_interesting,reliability_bonus,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 6 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 7 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_00064_d957b77dce5c | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_2pct_pos1_day16 | 406 | 66.75 | 1.637 | 0.2795 | 20.67 | 4098.70 | 3598.70 | 1526.4460 | interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 9 | intraday_14317_cbdd57a89e75 | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_2pct_pos1_day12 | 223 | 69.51 | 2.359 | 0.4812 | 11.38 | 3904.23 | 3404.23 | 1513.5144 | interesting,live_parity_risk,execution_timeframe_fallback_signal_tf |  |
| 10 | intraday_00096_d455e264ea7e | volatility_squeeze_breakout | adaptive_r_trail_8_0.5_1 | balanced_4pct_pos3_day8 | 192 | 69.79 | 1.802 | 0.3026 | 30.48 | 3429.60 | 2929.60 | 1367.5019 | interesting,live_parity_risk,execution_timeframe_fallback_signal_tf,same_candle_ambiguity_conservative |  |
| 11 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 12 | intraday_03372_93613de36c7c | liquidity_sweep_reversal | adaptive_r_trail_0.5_1.5 | aggressive_3pct_3pct_pos1_day12 | 231 | 71.43 | 1.753 | 0.2763 | 24.45 | 2985.21 | 2485.21 | 1250.1031 | promising,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf |  |
| 13 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 14 | intraday_09535_ede430f89eaa | momentum_continuation | adaptive_r_trail_0.8_0.4 | aggressive_3pct_2pct_pos1_day12 | 79 | 53.16 | 4.371 | 1.5476 | 22.37 | 2502.53 | 2002.53 | 1295.2447 | promising,weak_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf |  |
| 15 | intraday_02643_750f891aa7ff | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_1.5 | balanced_3pct_pos1_day8 | 131 | 75.57 | 2.394 | 0.4108 | 13.81 | 2351.89 | 1851.89 | 1101.3617 | promising,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 16 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 18 | intraday_16232_e3f2af4d23cf | momentum_continuation | adaptive_r_trail_8_2_1 | aggressive_4pct_2pct_pos2_day16 | 175 | 49.14 | 2.349 | 0.5717 | 17.40 | 1980.03 | 1480.03 | 985.4546 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 19 | intraday_03480_4a0a88cd4f2b | momentum_continuation | adaptive_r_trail_5_0.5_0.6 | aggressive_3pct_3pct_pos1_day12 | 180 | 73.33 | 1.704 | 0.2755 | 25.32 | 1931.36 | 1431.36 | 925.5013 | promising,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 20 | intraday_15842_046ba8fbb82a | simple_baseline | adaptive_r_trail_3_0.5_0.8 | aggressive_3pct_3pct_pos1_day12 | 178 | 65.73 | 1.667 | 0.2710 | 21.06 | 1917.03 | 1417.03 | 917.5496 | promising,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |

## Best With maxDD < 60%

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_4pct_3pct_pos1_day16 | 947 | 66.00 | 1.544 | 0.2256 | 28.69 | 160469.94 | 159969.94 | 18999.6089 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 3 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 4 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 6 | intraday_09607_510df5812160 | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 611 | 66.12 | 1.462 | 0.2080 | 37.59 | 14889.75 | 14389.75 | 3248.6131 | very_interesting,reliability_bonus,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 7 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 10 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | intraday_00064_d957b77dce5c | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_2pct_pos1_day16 | 406 | 66.75 | 1.637 | 0.2795 | 20.67 | 4098.70 | 3598.70 | 1526.4460 | interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 12 | intraday_14317_cbdd57a89e75 | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_2pct_pos1_day12 | 223 | 69.51 | 2.359 | 0.4812 | 11.38 | 3904.23 | 3404.23 | 1513.5144 | interesting,live_parity_risk,execution_timeframe_fallback_signal_tf |  |
| 13 | intraday_00096_d455e264ea7e | volatility_squeeze_breakout | adaptive_r_trail_8_0.5_1 | balanced_4pct_pos3_day8 | 192 | 69.79 | 1.802 | 0.3026 | 30.48 | 3429.60 | 2929.60 | 1367.5019 | interesting,live_parity_risk,execution_timeframe_fallback_signal_tf,same_candle_ambiguity_conservative |  |
| 14 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 15 | intraday_03372_93613de36c7c | liquidity_sweep_reversal | adaptive_r_trail_0.5_1.5 | aggressive_3pct_3pct_pos1_day12 | 231 | 71.43 | 1.753 | 0.2763 | 24.45 | 2985.21 | 2485.21 | 1250.1031 | promising,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf |  |
| 16 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 18 | intraday_09535_ede430f89eaa | momentum_continuation | adaptive_r_trail_0.8_0.4 | aggressive_3pct_2pct_pos1_day12 | 79 | 53.16 | 4.371 | 1.5476 | 22.37 | 2502.53 | 2002.53 | 1295.2447 | promising,weak_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf |  |
| 19 | intraday_02643_750f891aa7ff | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_1.5 | balanced_3pct_pos1_day8 | 131 | 75.57 | 2.394 | 0.4108 | 13.81 | 2351.89 | 1851.89 | 1101.3617 | promising,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 20 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |

## Best With maxDD < 80%

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_4pct_3pct_pos1_day16 | 947 | 66.00 | 1.544 | 0.2256 | 28.69 | 160469.94 | 159969.94 | 18999.6089 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 3 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 4 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 6 | intraday_09607_510df5812160 | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 611 | 66.12 | 1.462 | 0.2080 | 37.59 | 14889.75 | 14389.75 | 3248.6131 | very_interesting,reliability_bonus,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 7 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 10 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | intraday_00064_d957b77dce5c | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_2pct_pos1_day16 | 406 | 66.75 | 1.637 | 0.2795 | 20.67 | 4098.70 | 3598.70 | 1526.4460 | interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 12 | intraday_14317_cbdd57a89e75 | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_2pct_pos1_day12 | 223 | 69.51 | 2.359 | 0.4812 | 11.38 | 3904.23 | 3404.23 | 1513.5144 | interesting,live_parity_risk,execution_timeframe_fallback_signal_tf |  |
| 13 | intraday_00096_d455e264ea7e | volatility_squeeze_breakout | adaptive_r_trail_8_0.5_1 | balanced_4pct_pos3_day8 | 192 | 69.79 | 1.802 | 0.3026 | 30.48 | 3429.60 | 2929.60 | 1367.5019 | interesting,live_parity_risk,execution_timeframe_fallback_signal_tf,same_candle_ambiguity_conservative |  |
| 14 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 15 | intraday_03372_93613de36c7c | liquidity_sweep_reversal | adaptive_r_trail_0.5_1.5 | aggressive_3pct_3pct_pos1_day12 | 231 | 71.43 | 1.753 | 0.2763 | 24.45 | 2985.21 | 2485.21 | 1250.1031 | promising,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf |  |
| 16 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 18 | intraday_09535_ede430f89eaa | momentum_continuation | adaptive_r_trail_0.8_0.4 | aggressive_3pct_2pct_pos1_day12 | 79 | 53.16 | 4.371 | 1.5476 | 22.37 | 2502.53 | 2002.53 | 1295.2447 | promising,weak_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf |  |
| 19 | intraday_02643_750f891aa7ff | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_1.5 | balanced_3pct_pos1_day8 | 131 | 75.57 | 2.394 | 0.4108 | 13.81 | 2351.89 | 1851.89 | 1101.3617 | promising,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 20 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |

## Best High-Profit / High-Risk

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 3 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 4 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |
| 6 | intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 7 | intraday_01432_e492e9734183 | session_momentum | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_3pct_pos3_day16 | 326 | 65.64 | 1.354 | 0.1671 | 44.73 | 1675.00 | 1175.00 | 817.5842 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_09235_9d0a1a392059 | opening_range_breakout | adaptive_r_trail_0.8_0.4 | aggressive_4pct_4pct_pos1_day16 | 275 | 57.82 | 1.301 | 0.1443 | 42.31 | 1475.20 | 975.20 | 729.2424 | reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 9 | intraday_13757_e434fd8c7cac | donchian_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_4pct_pos2_day16 | 437 | 66.13 | 1.229 | 0.0795 | 46.26 | 1429.09 | 929.09 | 702.2960 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | intraday_10773_b53606941438 | volatility_squeeze_breakout | adaptive_r_trail_3_0.5_0.8 | aggressive_4pct_3pct_pos2_day16 | 503 | 65.21 | 1.190 | 0.0792 | 44.85 | 1216.88 | 716.88 | 609.1742 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | intraday_03642_69ad7f389ed5 | momentum_continuation | atr_trailing_5_2 | aggressive_4pct_4pct_pos2_day16 | 129 | 43.41 | 1.608 | 0.3255 | 53.03 | 1112.54 | 612.54 | 563.9819 | elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 12 | intraday_11136_b1ee0d94fad0 | session_momentum | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos2_day16 | 333 | 63.06 | 1.173 | 0.0783 | 54.20 | 1020.17 | 520.17 | 490.3532 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 13 | intraday_08044_b9eb5726485a | momentum_continuation | candle_low_high_trail_5 | aggressive_4pct_3pct_pos2_day16 | 178 | 46.63 | 1.281 | 0.1420 | 41.31 | 845.86 | 345.86 | 374.6484 | elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 14 | intraday_13596_cf82700dbe62 | momentum_continuation | time_based_exit_5_4 | aggressive_4pct_4pct_pos3_day16 | 131 | 38.93 | 1.260 | 0.1664 | 44.77 | 812.69 | 312.69 | 351.3913 | elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 15 | intraday_04700_c86d8c363d2c | liquidity_sweep_reversal | candle_low_high_trail | aggressive_4pct_4pct_pos2_day16 | 33 | 54.55 | 1.550 | 0.4788 | 40.74 | 728.23 | 228.23 | 290.5639 | weak_sample,elevated_drawdown,live_parity_risk |  |
| 16 | intraday_09540_7f4a9d51ed0c | momentum_continuation | atr_trailing_8_1 | aggressive_4pct_4pct_pos1_day16 | 78 | 47.44 | 1.296 | 0.1729 | 44.58 | 726.66 | 226.66 | 280.8993 | weak_sample,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | intraday_12060_53aecf6a84db | momentum_continuation | momentum_decay_exit_5 | aggressive_4pct_3pct_pos2_day16 | 181 | 46.96 | 1.182 | 0.1120 | 49.83 | 714.34 | 214.34 | 271.1835 | elevated_drawdown,live_parity_risk |  |
| 18 | intraday_11061_d0ea8bb6ab58 | ema_trend_pullback | adaptive_r_trail_3_0.5_1.5 | aggressive_3pct_4pct_pos3_day12 | 115 | 60.00 | 1.193 | 0.0848 | 43.96 | 670.66 | 170.66 | 235.4321 | elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 19 | intraday_11262_627dd17f7152 | donchian_breakout | adaptive_r_trail_5_1_0.6 | aggressive_3pct_4pct_pos3_day12 | 91 | 51.65 | 1.331 | 0.1255 | 40.03 | 667.61 | 167.61 | 230.6815 | weak_sample,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 20 | intraday_04950_822bb3921549 | momentum_continuation | adaptive_r_trail_3_0.5_1 | aggressive_3pct_2pct_pos1_day12 | 212 | 65.09 | 1.138 | 0.0727 | 44.65 | 617.64 | 117.64 | 186.8223 | elevated_drawdown,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |

## Dangerous High-Profit Candidates

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_16103_4f16f9e67fca | opening_range_breakout | adaptive_r_trail_0.5_0.8 | aggressive_4pct_4pct_pos2_day16 | 307 | 47.56 | 1.114 | 0.0556 | 63.49 | 548.89 | 48.89 | 120.1260 | reliability_bonus,dangerous,live_parity_risk |  |
| 2 | intraday_06790_66ed33b79d78 | momentum_continuation | atr_trailing_5_2 | aggressive_4pct_3pct_pos1_day16 | 104 | 38.46 | 1.264 | 0.1615 | 63.30 | 542.56 | 42.56 | 115.4303 | dangerous,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf,same_candle_ambiguity_conservative |  |
| 3 | intraday_09877_9bf04e109837 | mean_reversion_intraday | adaptive_r_trail_8_0.5_1 | aggressive_4pct_4pct_pos2_day16 | 379 | 61.74 | 1.025 | 0.0103 | 67.74 | 518.65 | 18.65 | 75.6556 | reliability_bonus,dangerous,live_parity_risk,same_candle_ambiguity_conservative |  |
| 4 | intraday_06239_ae350191a42e | momentum_continuation | atr_trailing_2 | aggressive_4pct_3pct_pos1_day16 | 120 | 37.50 | 1.162 | 0.0887 | 60.29 | 506.64 | 6.64 | 74.0713 | dangerous,live_parity_risk |  |

## Top Candidates With trades >= 100

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_4pct_3pct_pos1_day16 | 947 | 66.00 | 1.544 | 0.2256 | 28.69 | 160469.94 | 159969.94 | 18999.6089 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 3 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 4 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 6 | intraday_09607_510df5812160 | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 611 | 66.12 | 1.462 | 0.2080 | 37.59 | 14889.75 | 14389.75 | 3248.6131 | very_interesting,reliability_bonus,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 7 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 10 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | intraday_00064_d957b77dce5c | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_2pct_pos1_day16 | 406 | 66.75 | 1.637 | 0.2795 | 20.67 | 4098.70 | 3598.70 | 1526.4460 | interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 12 | intraday_14317_cbdd57a89e75 | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_2pct_pos1_day12 | 223 | 69.51 | 2.359 | 0.4812 | 11.38 | 3904.23 | 3404.23 | 1513.5144 | interesting,live_parity_risk,execution_timeframe_fallback_signal_tf |  |
| 13 | intraday_00096_d455e264ea7e | volatility_squeeze_breakout | adaptive_r_trail_8_0.5_1 | balanced_4pct_pos3_day8 | 192 | 69.79 | 1.802 | 0.3026 | 30.48 | 3429.60 | 2929.60 | 1367.5019 | interesting,live_parity_risk,execution_timeframe_fallback_signal_tf,same_candle_ambiguity_conservative |  |
| 14 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 15 | intraday_03372_93613de36c7c | liquidity_sweep_reversal | adaptive_r_trail_0.5_1.5 | aggressive_3pct_3pct_pos1_day12 | 231 | 71.43 | 1.753 | 0.2763 | 24.45 | 2985.21 | 2485.21 | 1250.1031 | promising,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf |  |
| 16 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 18 | intraday_02643_750f891aa7ff | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_1.5 | balanced_3pct_pos1_day8 | 131 | 75.57 | 2.394 | 0.4108 | 13.81 | 2351.89 | 1851.89 | 1101.3617 | promising,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 19 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 20 | intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |

## Top Candidates With trades >= 200

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_4pct_3pct_pos1_day16 | 947 | 66.00 | 1.544 | 0.2256 | 28.69 | 160469.94 | 159969.94 | 18999.6089 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 3 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 4 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 6 | intraday_09607_510df5812160 | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 611 | 66.12 | 1.462 | 0.2080 | 37.59 | 14889.75 | 14389.75 | 3248.6131 | very_interesting,reliability_bonus,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 7 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 10 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | intraday_00064_d957b77dce5c | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_2pct_pos1_day16 | 406 | 66.75 | 1.637 | 0.2795 | 20.67 | 4098.70 | 3598.70 | 1526.4460 | interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 12 | intraday_14317_cbdd57a89e75 | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_2pct_pos1_day12 | 223 | 69.51 | 2.359 | 0.4812 | 11.38 | 3904.23 | 3404.23 | 1513.5144 | interesting,live_parity_risk,execution_timeframe_fallback_signal_tf |  |
| 13 | intraday_03372_93613de36c7c | liquidity_sweep_reversal | adaptive_r_trail_0.5_1.5 | aggressive_3pct_3pct_pos1_day12 | 231 | 71.43 | 1.753 | 0.2763 | 24.45 | 2985.21 | 2485.21 | 1250.1031 | promising,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf |  |
| 14 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 15 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 16 | intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 17 | intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 18 | intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 19 | intraday_01432_e492e9734183 | session_momentum | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_3pct_pos3_day16 | 326 | 65.64 | 1.354 | 0.1671 | 44.73 | 1675.00 | 1175.00 | 817.5842 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 20 | intraday_13143_29aee854e2be | session_momentum | adaptive_r_trail_0.5_0.8 | aggressive_3pct_2pct_pos3_day12 | 264 | 68.94 | 1.565 | 0.2259 | 18.13 | 1501.91 | 1001.91 | 758.3214 | promising,reliability_bonus,live_parity_risk |  |

## Best Per strategyFamily

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | momentum_continuation: intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | session_momentum: intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 3 | volatility_squeeze_breakout: intraday_11106_f356eb9f7581 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_4pct_3pct_pos1_day16 | 1 | 100.00 | 99.000 | 2.3679 | 0.00 | 535.52 | 35.52 | 3565.2991 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 4 | liquidity_sweep_reversal: intraday_09607_510df5812160 | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 611 | 66.12 | 1.462 | 0.2080 | 37.59 | 14889.75 | 14389.75 | 3248.6131 | very_interesting,reliability_bonus,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 5 | opening_range_breakout: intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 6 | hllh_continuation: intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 7 | simple_baseline: intraday_15842_046ba8fbb82a | simple_baseline | adaptive_r_trail_3_0.5_0.8 | aggressive_3pct_3pct_pos1_day12 | 178 | 65.73 | 1.667 | 0.2710 | 21.06 | 1917.03 | 1417.03 | 917.5496 | promising,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 8 | ema_trend_pullback: intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 9 | donchian_breakout: intraday_13757_e434fd8c7cac | donchian_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_4pct_pos2_day16 | 437 | 66.13 | 1.229 | 0.0795 | 46.26 | 1429.09 | 929.09 | 702.2960 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | mean_reversion_intraday: intraday_09563_25a8b3167f90 | mean_reversion_intraday | adaptive_r_trail_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 36 | 44.44 | 2.038 | 0.8073 | 37.60 | 885.83 | 385.83 | 455.1215 | weak_sample,live_parity_risk |  |

## Best Per exitProfile

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | adaptive_r_trail_5_0.5_1.5: intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | adaptive_r_trail_0.5_1: intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 3 | momentum_decay_exit_5: intraday_11106_f356eb9f7581 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_4pct_3pct_pos1_day16 | 1 | 100.00 | 99.000 | 2.3679 | 0.00 | 535.52 | 35.52 | 3565.2991 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 4 | fixed_r_3: intraday_01319_de70033590bd | volatility_squeeze_breakout | fixed_r_3 | conservative_1pct_pos1_day4 | 1 | 100.00 | 99.000 | 2.4879 | 0.00 | 512.44 | 12.44 | 3550.5638 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 5 | fixed_r_2: intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r_2 | conservative_3pct_pos3_day4 | 2 | 100.00 | 99.000 | 1.7710 | 0.00 | 554.54 | 54.54 | 3539.8994 | low_sample,live_parity_risk | too_few_trades |
| 6 | atr_trailing_3_2: intraday_04945_3e615efb3da1 | volatility_squeeze_breakout | atr_trailing_3_2 | balanced_2pct_pos1_day8 | 1 | 100.00 | 99.000 | 2.1914 | 0.00 | 521.91 | 21.91 | 3536.9465 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 7 | adaptive_r_trail_8_0.5_0.6: intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | partial_take_profit_3_1.5: intraday_09708_c9b723264362 | volatility_squeeze_breakout | partial_take_profit_3_1.5 | aggressive_3pct_1pct_pos1_day12 | 1 | 100.00 | 99.000 | 1.9781 | 0.00 | 509.89 | 9.89 | 3507.0305 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 9 | time_based_exit_1.5_24: intraday_08507_cdc47988ca5a | volatility_squeeze_breakout | time_based_exit_1.5_24 | conservative_1pct_pos2_day4 | 2 | 100.00 | 99.000 | 1.2710 | 0.00 | 512.79 | 12.79 | 3456.5882 | low_sample,live_parity_risk | too_few_trades |
| 10 | partial_take_profit_5_1: intraday_16138_03634619cfd2 | volatility_squeeze_breakout | partial_take_profit_5_1 | aggressive_4pct_3pct_pos1_day16 | 1 | 100.00 | 99.000 | 1.0833 | 0.00 | 516.25 | 16.25 | 3442.2805 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 11 | momentum_decay_exit_3: intraday_09724_d78ed078130e | volatility_squeeze_breakout | momentum_decay_exit_3 | aggressive_4pct_2pct_pos1_day16 | 1 | 100.00 | 99.000 | 1.1285 | 0.00 | 511.28 | 11.28 | 3440.5626 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 12 | adaptive_r_trail_1_0.6: intraday_00144_9f7b6c9fe9aa | volatility_squeeze_breakout | adaptive_r_trail_1_0.6 | aggressive_3pct_4pct_pos2_day12 | 1 | 100.00 | 99.000 | 0.9833 | 0.00 | 519.67 | 19.67 | 3437.9239 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 13 | adaptive_r_trail_0.5_0.4: intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 14 | adaptive_r_trail_0.5_0.8: intraday_11981_3880a81d39c2 | volatility_squeeze_breakout | adaptive_r_trail_0.5_0.8 | balanced_2pct_pos1_day8 | 1 | 100.00 | 99.000 | 0.7205 | 0.00 | 507.20 | 7.20 | 3403.5087 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 15 | profit_protection_exit_5: intraday_02466_daca77f0340e | volatility_squeeze_breakout | profit_protection_exit_5 | aggressive_3pct_2pct_pos1_day12 | 2 | 100.00 | 99.000 | 0.5926 | 0.00 | 511.92 | 11.92 | 3401.3801 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 16 | fixed_r_1: intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |
| 17 | time_based_exit_1.5_48: intraday_13645_1cc9c1d5244a | volatility_squeeze_breakout | time_based_exit_1.5_48 | balanced_3pct_pos1_day8 | 1 | 100.00 | 99.000 | 0.4279 | 0.00 | 506.42 | 6.42 | 3379.2531 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 18 | partial_take_profit_8_0.5: intraday_07557_0671a321b04a | volatility_squeeze_breakout | partial_take_profit_8_0.5 | conservative_3pct_pos1_day4 | 2 | 100.00 | 99.000 | 0.1144 | 0.00 | 503.44 | 3.44 | 3353.9242 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 19 | adaptive_r_trail_3_0.5_0.4: intraday_09607_510df5812160 | liquidity_sweep_reversal | adaptive_r_trail_3_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 611 | 66.12 | 1.462 | 0.2080 | 37.59 | 14889.75 | 14389.75 | 3248.6131 | very_interesting,reliability_bonus,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 20 | adaptive_r_trail_8_0.5_0.4: intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |

## Best Per managementProfile

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | session_flat: intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | protect_profit_2_0.6: intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 3 | passive: intraday_11106_f356eb9f7581 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_4pct_3pct_pos1_day16 | 1 | 100.00 | 99.000 | 2.3679 | 0.00 | 535.52 | 35.52 | 3565.2991 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 4 | fast_cut_2_0.6: intraday_01319_de70033590bd | volatility_squeeze_breakout | fixed_r_3 | conservative_1pct_pos1_day4 | 1 | 100.00 | 99.000 | 2.4879 | 0.00 | 512.44 | 12.44 | 3550.5638 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 5 | daily_flat_1260: intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r_2 | conservative_3pct_pos3_day4 | 2 | 100.00 | 99.000 | 1.7710 | 0.00 | 554.54 | 54.54 | 3539.8994 | low_sample,live_parity_risk | too_few_trades |
| 6 | fast_cut_1_0.4: intraday_04945_3e615efb3da1 | volatility_squeeze_breakout | atr_trailing_3_2 | balanced_2pct_pos1_day8 | 1 | 100.00 | 99.000 | 2.1914 | 0.00 | 521.91 | 21.91 | 3536.9465 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 7 | fast_cut_3_0.4: intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | momentum_watch_1_1: intraday_08507_cdc47988ca5a | volatility_squeeze_breakout | time_based_exit_1.5_24 | conservative_1pct_pos2_day4 | 2 | 100.00 | 99.000 | 1.2710 | 0.00 | 512.79 | 12.79 | 3456.5882 | low_sample,live_parity_risk | too_few_trades |
| 9 | protect_profit_1.5_0.45: intraday_16138_03634619cfd2 | volatility_squeeze_breakout | partial_take_profit_5_1 | aggressive_4pct_3pct_pos1_day16 | 1 | 100.00 | 99.000 | 1.0833 | 0.00 | 516.25 | 16.25 | 3442.2805 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 10 | protect_profit_0.8_0.45: intraday_00144_9f7b6c9fe9aa | volatility_squeeze_breakout | adaptive_r_trail_1_0.6 | aggressive_3pct_4pct_pos2_day12 | 1 | 100.00 | 99.000 | 0.9833 | 0.00 | 519.67 | 19.67 | 3437.9239 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 11 | protect_profit_2_0.45: intraday_11981_3880a81d39c2 | volatility_squeeze_breakout | adaptive_r_trail_0.5_0.8 | balanced_2pct_pos1_day8 | 1 | 100.00 | 99.000 | 0.7205 | 0.00 | 507.20 | 7.20 | 3403.5087 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 12 | daily_flat_1290: intraday_02466_daca77f0340e | volatility_squeeze_breakout | profit_protection_exit_5 | aggressive_3pct_2pct_pos1_day12 | 2 | 100.00 | 99.000 | 0.5926 | 0.00 | 511.92 | 11.92 | 3401.3801 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 13 | daily_flat_1245: intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |
| 14 | fast_cut_1_0.6: intraday_13645_1cc9c1d5244a | volatility_squeeze_breakout | time_based_exit_1.5_48 | balanced_3pct_pos1_day8 | 1 | 100.00 | 99.000 | 0.4279 | 0.00 | 506.42 | 6.42 | 3379.2531 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 15 | protect_profit_1_0.35: intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 16 | protect_profit_0.8_0.6: intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | momentum_watch_0.5_3: intraday_09535_ede430f89eaa | momentum_continuation | adaptive_r_trail_0.8_0.4 | aggressive_3pct_2pct_pos1_day12 | 79 | 53.16 | 4.371 | 1.5476 | 22.37 | 2502.53 | 2002.53 | 1295.2447 | promising,weak_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf |  |
| 18 | fast_cut_2_0.4: intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |
| 19 | protect_profit_2_0.35: intraday_03480_4a0a88cd4f2b | momentum_continuation | adaptive_r_trail_5_0.5_0.6 | aggressive_3pct_3pct_pos1_day12 | 180 | 73.33 | 1.704 | 0.2755 | 25.32 | 1931.36 | 1431.36 | 925.5013 | promising,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 20 | protect_profit_1_0.45: intraday_15842_046ba8fbb82a | simple_baseline | adaptive_r_trail_3_0.5_0.8 | aggressive_3pct_3pct_pos1_day12 | 178 | 65.73 | 1.667 | 0.2710 | 21.06 | 1917.03 | 1417.03 | 917.5496 | promising,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |

## Best Per Symbol

_This ranks saved leader artifacts by selected score for each symbol exposure; it is not yet a standalone per-symbol rerun._

| rank | exposure | tradesInCandidate | experimentId | family | exit | risk | totalTrades | maxDD | endCapital | aggressiveIntraday | candidatePath |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | AUDJPY | 77 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 2 | EURJPY | 39 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 3 | USDJPY | 28 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 4 | EURCHF | 111 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 5 | GBPAUD | 43 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 6 | GBPJPY | 109 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 7 | AUDUSD | 37 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 8 | EURAUD | 90 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 9 | USDCHF | 18 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 10 | EURGBP | 61 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 11 | EURUSD | 48 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 12 | AUDCAD | 140 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 13 | NZDUSD | 14 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 14 | GBPCHF | 36 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 15 | GBPUSD | 7 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 16 | NZDJPY | 37 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 17 | USDCAD | 52 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |

## Best Per Session

_This ranks saved leader artifacts by selected score for each session exposure; it is not yet a standalone per-session rerun._

| rank | exposure | tradesInCandidate | experimentId | family | exit | risk | totalTrades | maxDD | endCapital | aggressiveIntraday | candidatePath |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | asian | 337 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 2 | london | 258 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 3 | ny | 199 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| 4 | off_session | 153 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail | aggressive_4pct | 947 | 28.69 | 160469.94 | 18999.6089 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |

## Best Entry + Exit Combination

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_4pct_3pct_pos1_day16 | 947 | 66.00 | 1.544 | 0.2256 | 28.69 | 160469.94 | 159969.94 | 18999.6089 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 3 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 4 | intraday_11106_f356eb9f7581 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_4pct_3pct_pos1_day16 | 1 | 100.00 | 99.000 | 2.3679 | 0.00 | 535.52 | 35.52 | 3565.2991 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 5 | intraday_01319_de70033590bd | volatility_squeeze_breakout | fixed_r_3 | conservative_1pct_pos1_day4 | 1 | 100.00 | 99.000 | 2.4879 | 0.00 | 512.44 | 12.44 | 3550.5638 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 6 | intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r_2 | conservative_3pct_pos3_day4 | 2 | 100.00 | 99.000 | 1.7710 | 0.00 | 554.54 | 54.54 | 3539.8994 | low_sample,live_parity_risk | too_few_trades |
| 7 | intraday_04945_3e615efb3da1 | volatility_squeeze_breakout | atr_trailing_3_2 | balanced_2pct_pos1_day8 | 1 | 100.00 | 99.000 | 2.1914 | 0.00 | 521.91 | 21.91 | 3536.9465 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 8 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | intraday_10243_207a17f258d7 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_3pct_3pct_pos3_day12 | 2 | 100.00 | 99.000 | 1.5352 | 0.00 | 546.23 | 46.23 | 3512.6550 | low_sample,live_parity_risk | too_few_trades |
| 10 | intraday_09708_c9b723264362 | volatility_squeeze_breakout | partial_take_profit_3_1.5 | aggressive_3pct_1pct_pos1_day12 | 1 | 100.00 | 99.000 | 1.9781 | 0.00 | 509.89 | 9.89 | 3507.0305 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 11 | intraday_08507_cdc47988ca5a | volatility_squeeze_breakout | time_based_exit_1.5_24 | conservative_1pct_pos2_day4 | 2 | 100.00 | 99.000 | 1.2710 | 0.00 | 512.79 | 12.79 | 3456.5882 | low_sample,live_parity_risk | too_few_trades |
| 12 | intraday_16138_03634619cfd2 | volatility_squeeze_breakout | partial_take_profit_5_1 | aggressive_4pct_3pct_pos1_day16 | 1 | 100.00 | 99.000 | 1.0833 | 0.00 | 516.25 | 16.25 | 3442.2805 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 13 | intraday_09724_d78ed078130e | volatility_squeeze_breakout | momentum_decay_exit_3 | aggressive_4pct_2pct_pos1_day16 | 1 | 100.00 | 99.000 | 1.1285 | 0.00 | 511.28 | 11.28 | 3440.5626 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 14 | intraday_00144_9f7b6c9fe9aa | volatility_squeeze_breakout | adaptive_r_trail_1_0.6 | aggressive_3pct_4pct_pos2_day12 | 1 | 100.00 | 99.000 | 0.9833 | 0.00 | 519.67 | 19.67 | 3437.9239 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 15 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 16 | intraday_11981_3880a81d39c2 | volatility_squeeze_breakout | adaptive_r_trail_0.5_0.8 | balanced_2pct_pos1_day8 | 1 | 100.00 | 99.000 | 0.7205 | 0.00 | 507.20 | 7.20 | 3403.5087 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 17 | intraday_02466_daca77f0340e | volatility_squeeze_breakout | profit_protection_exit_5 | aggressive_3pct_2pct_pos1_day12 | 2 | 100.00 | 99.000 | 0.5926 | 0.00 | 511.92 | 11.92 | 3401.3801 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 18 | intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |
| 19 | intraday_13645_1cc9c1d5244a | volatility_squeeze_breakout | time_based_exit_1.5_48 | balanced_3pct_pos1_day8 | 1 | 100.00 | 99.000 | 0.4279 | 0.00 | 506.42 | 6.42 | 3379.2531 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 20 | intraday_07557_0671a321b04a | volatility_squeeze_breakout | partial_take_profit_8_0.5 | conservative_3pct_pos1_day4 | 2 | 100.00 | 99.000 | 0.1144 | 0.00 | 503.44 | 3.44 | 3353.9242 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |

## Top 20 Candidates Overall

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_15012_b1bca85e562f | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_guarded_3pct_3pct_pos1_day16 | 893 | 69.76 | 1.749 | 0.2661 | 24.43 | 411944.14 | 411444.14 | 44629.3985 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | intraday_15012_5bcdee846128 | momentum_continuation | adaptive_r_trail_5_0.5_1.5 | aggressive_4pct_3pct_pos1_day16 | 947 | 66.00 | 1.544 | 0.2256 | 28.69 | 160469.94 | 159969.94 | 18999.6089 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |
| 3 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 4 | intraday_11106_f356eb9f7581 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_4pct_3pct_pos1_day16 | 1 | 100.00 | 99.000 | 2.3679 | 0.00 | 535.52 | 35.52 | 3565.2991 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 5 | intraday_01319_de70033590bd | volatility_squeeze_breakout | fixed_r_3 | conservative_1pct_pos1_day4 | 1 | 100.00 | 99.000 | 2.4879 | 0.00 | 512.44 | 12.44 | 3550.5638 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 6 | intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r_2 | conservative_3pct_pos3_day4 | 2 | 100.00 | 99.000 | 1.7710 | 0.00 | 554.54 | 54.54 | 3539.8994 | low_sample,live_parity_risk | too_few_trades |
| 7 | intraday_04945_3e615efb3da1 | volatility_squeeze_breakout | atr_trailing_3_2 | balanced_2pct_pos1_day8 | 1 | 100.00 | 99.000 | 2.1914 | 0.00 | 521.91 | 21.91 | 3536.9465 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 8 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | intraday_10243_207a17f258d7 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_3pct_3pct_pos3_day12 | 2 | 100.00 | 99.000 | 1.5352 | 0.00 | 546.23 | 46.23 | 3512.6550 | low_sample,live_parity_risk | too_few_trades |
| 10 | intraday_09708_c9b723264362 | volatility_squeeze_breakout | partial_take_profit_3_1.5 | aggressive_3pct_1pct_pos1_day12 | 1 | 100.00 | 99.000 | 1.9781 | 0.00 | 509.89 | 9.89 | 3507.0305 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 11 | intraday_08507_cdc47988ca5a | volatility_squeeze_breakout | time_based_exit_1.5_24 | conservative_1pct_pos2_day4 | 2 | 100.00 | 99.000 | 1.2710 | 0.00 | 512.79 | 12.79 | 3456.5882 | low_sample,live_parity_risk | too_few_trades |
| 12 | intraday_16138_03634619cfd2 | volatility_squeeze_breakout | partial_take_profit_5_1 | aggressive_4pct_3pct_pos1_day16 | 1 | 100.00 | 99.000 | 1.0833 | 0.00 | 516.25 | 16.25 | 3442.2805 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 13 | intraday_09724_d78ed078130e | volatility_squeeze_breakout | momentum_decay_exit_3 | aggressive_4pct_2pct_pos1_day16 | 1 | 100.00 | 99.000 | 1.1285 | 0.00 | 511.28 | 11.28 | 3440.5626 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 14 | intraday_00144_9f7b6c9fe9aa | volatility_squeeze_breakout | adaptive_r_trail_1_0.6 | aggressive_3pct_4pct_pos2_day12 | 1 | 100.00 | 99.000 | 0.9833 | 0.00 | 519.67 | 19.67 | 3437.9239 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 15 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 16 | intraday_11981_3880a81d39c2 | volatility_squeeze_breakout | adaptive_r_trail_0.5_0.8 | balanced_2pct_pos1_day8 | 1 | 100.00 | 99.000 | 0.7205 | 0.00 | 507.20 | 7.20 | 3403.5087 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 17 | intraday_02466_daca77f0340e | volatility_squeeze_breakout | profit_protection_exit_5 | aggressive_3pct_2pct_pos1_day12 | 2 | 100.00 | 99.000 | 0.5926 | 0.00 | 511.92 | 11.92 | 3401.3801 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |
| 18 | intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |
| 19 | intraday_13645_1cc9c1d5244a | volatility_squeeze_breakout | time_based_exit_1.5_48 | balanced_3pct_pos1_day8 | 1 | 100.00 | 99.000 | 0.4279 | 0.00 | 506.42 | 6.42 | 3379.2531 | low_sample,live_parity_risk,m1_missing_fallback_m5,execution_timeframe_fallback_signal_tf | too_few_trades |
| 20 | intraday_07557_0671a321b04a | volatility_squeeze_breakout | partial_take_profit_8_0.5 | conservative_3pct_pos1_day4 | 2 | 100.00 | 99.000 | 0.1144 | 0.00 | 503.44 | 3.44 | 3353.9242 | low_sample,live_parity_risk,execution_timeframe_fallback_signal_tf | too_few_trades |

## Top 20 High-Risk Candidates

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 3 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 4 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |
| 6 | intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 7 | intraday_01432_e492e9734183 | session_momentum | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_3pct_pos3_day16 | 326 | 65.64 | 1.354 | 0.1671 | 44.73 | 1675.00 | 1175.00 | 817.5842 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_09235_9d0a1a392059 | opening_range_breakout | adaptive_r_trail_0.8_0.4 | aggressive_4pct_4pct_pos1_day16 | 275 | 57.82 | 1.301 | 0.1443 | 42.31 | 1475.20 | 975.20 | 729.2424 | reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 9 | intraday_13757_e434fd8c7cac | donchian_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_4pct_pos2_day16 | 437 | 66.13 | 1.229 | 0.0795 | 46.26 | 1429.09 | 929.09 | 702.2960 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | intraday_10773_b53606941438 | volatility_squeeze_breakout | adaptive_r_trail_3_0.5_0.8 | aggressive_4pct_3pct_pos2_day16 | 503 | 65.21 | 1.190 | 0.0792 | 44.85 | 1216.88 | 716.88 | 609.1742 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | intraday_03642_69ad7f389ed5 | momentum_continuation | atr_trailing_5_2 | aggressive_4pct_4pct_pos2_day16 | 129 | 43.41 | 1.608 | 0.3255 | 53.03 | 1112.54 | 612.54 | 563.9819 | elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 12 | intraday_11136_b1ee0d94fad0 | session_momentum | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos2_day16 | 333 | 63.06 | 1.173 | 0.0783 | 54.20 | 1020.17 | 520.17 | 490.3532 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 13 | intraday_08044_b9eb5726485a | momentum_continuation | candle_low_high_trail_5 | aggressive_4pct_3pct_pos2_day16 | 178 | 46.63 | 1.281 | 0.1420 | 41.31 | 845.86 | 345.86 | 374.6484 | elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 14 | intraday_13596_cf82700dbe62 | momentum_continuation | time_based_exit_5_4 | aggressive_4pct_4pct_pos3_day16 | 131 | 38.93 | 1.260 | 0.1664 | 44.77 | 812.69 | 312.69 | 351.3913 | elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 15 | intraday_04700_c86d8c363d2c | liquidity_sweep_reversal | candle_low_high_trail | aggressive_4pct_4pct_pos2_day16 | 33 | 54.55 | 1.550 | 0.4788 | 40.74 | 728.23 | 228.23 | 290.5639 | weak_sample,elevated_drawdown,live_parity_risk |  |
| 16 | intraday_09540_7f4a9d51ed0c | momentum_continuation | atr_trailing_8_1 | aggressive_4pct_4pct_pos1_day16 | 78 | 47.44 | 1.296 | 0.1729 | 44.58 | 726.66 | 226.66 | 280.8993 | weak_sample,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | intraday_12060_53aecf6a84db | momentum_continuation | momentum_decay_exit_5 | aggressive_4pct_3pct_pos2_day16 | 181 | 46.96 | 1.182 | 0.1120 | 49.83 | 714.34 | 214.34 | 271.1835 | elevated_drawdown,live_parity_risk |  |
| 18 | intraday_11061_d0ea8bb6ab58 | ema_trend_pullback | adaptive_r_trail_3_0.5_1.5 | aggressive_3pct_4pct_pos3_day12 | 115 | 60.00 | 1.193 | 0.0848 | 43.96 | 670.66 | 170.66 | 235.4321 | elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 19 | intraday_11262_627dd17f7152 | donchian_breakout | adaptive_r_trail_5_1_0.6 | aggressive_3pct_4pct_pos3_day12 | 91 | 51.65 | 1.331 | 0.1255 | 40.03 | 667.61 | 167.61 | 230.6815 | weak_sample,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 20 | intraday_04950_822bb3921549 | momentum_continuation | adaptive_r_trail_3_0.5_1 | aggressive_3pct_2pct_pos1_day12 | 212 | 65.09 | 1.138 | 0.0727 | 44.65 | 617.64 | 117.64 | 186.8223 | elevated_drawdown,live_parity_risk,m1_missing_fallback_m5,same_candle_ambiguity_conservative,execution_timeframe_fallback_signal_tf |  |

## Candidate JSON

Best aggressive candidate JSON: `not found`


## Leader Candidate Paths

| leader | experimentId | candidatePath |
| --- | --- | --- |
| selectedScore | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-aggressiveIntraday__intraday_15012_5bcdee846128.json |
| endCapital | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-endCapital__intraday_15012_5bcdee846128.json |
| rawPnl | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-rawPnl__intraday_15012_5bcdee846128.json |
| aggressiveIntraday | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-aggressiveIntraday__intraday_15012_5bcdee846128.json |
| maxProfit | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_15012_5bcdee846128.json |
| dd40 | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_15012_5bcdee846128.json |
| dd60 | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-maxDD-lt60__intraday_15012_5bcdee846128.json |
| dd80 | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/high-risk/best-maxDD-lt80__intraday_15012_5bcdee846128.json |
| highRiskProfit | intraday_04950_822bb3921549 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/high-risk/best-high-risk-profit__intraday_04950_822bb3921549.json |
| byFamily.hllh_continuation | intraday_13447_7045c9f4a594 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-hllh_continuation__intraday_13447_7045c9f4a594.json |
| byFamily.volatility_squeeze_breakout | intraday_02436_ee460ba66900 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-volatility_squeeze_breakout__intraday_02436_ee460ba66900.json |
| byFamily.session_momentum | intraday_00064_d957b77dce5c | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-session_momentum__intraday_00064_d957b77dce5c.json |
| byFamily.donchian_breakout | intraday_00788_cfac42df6278 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-donchian_breakout__intraday_00788_cfac42df6278.json |
| byFamily.mean_reversion_intraday | intraday_05643_626d236835a1 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-mean_reversion_intraday__intraday_05643_626d236835a1.json |
| byFamily.liquidity_sweep_reversal | intraday_09607_510df5812160 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-liquidity_sweep_reversal__intraday_09607_510df5812160.json |
| byFamily.momentum_continuation | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-momentum_continuation__intraday_15012_5bcdee846128.json |
| byFamily.simple_baseline | intraday_15842_046ba8fbb82a | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-simple_baseline__intraday_15842_046ba8fbb82a.json |
| byFamily.opening_range_breakout | intraday_00614_968ff1f078cf | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-opening_range_breakout__intraday_00614_968ff1f078cf.json |
| byFamily.ema_trend_pullback | intraday_03995_32b390de2352 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-ema_trend_pullback__intraday_03995_32b390de2352.json |
| byExit.fixed_r | intraday_01728_6b3c622e20c8 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-fixed_r__intraday_01728_6b3c622e20c8.json |
| byExit.breakeven_after_r | intraday_12048_ebc20f5bcdf6 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-breakeven_after_r__intraday_12048_ebc20f5bcdf6.json |
| byExit.profit_protection_exit | intraday_10421_9002d1c5d604 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-profit_protection_exit__intraday_10421_9002d1c5d604.json |
| byExit.candle_low_high_trail | intraday_16141_cfe7ea4216f2 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-candle_low_high_trail__intraday_16141_cfe7ea4216f2.json |
| byExit.momentum_decay_exit | intraday_02233_f6027fa81def | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-momentum_decay_exit__intraday_02233_f6027fa81def.json |
| byExit.time_based_exit | intraday_03537_337187c3da26 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-time_based_exit__intraday_03537_337187c3da26.json |
| byExit.adaptive_r_trail | intraday_15012_5bcdee846128 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-adaptive_r_trail__intraday_15012_5bcdee846128.json |
| byExit.partial_take_profit | intraday_03759_f26b937cd341 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-partial_take_profit__intraday_03759_f26b937cd341.json |
| byExit.ema_exit | intraday_14491_0cbdad0c9a19 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-ema_exit__intraday_14491_0cbdad0c9a19.json |
| byExit.atr_trailing | intraday_01314_c3eb91d7d06d | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-atr_trailing__intraday_01314_c3eb91d7d06d.json |

## Config Diff Against `config.js`

No live `config.js` diff was applied. The best intraday candidate is a research-only object; mapping it into live config requires a manual adapter after replay parity is fixed.


## Realism Notes

- Entry is on the next monitoring candle open after a closed signal candle.
- Monitoring is M5 when available; otherwise it falls back to the entry timeframe.
- Same-candle TP/SL ambiguity is handled conservatively by checking stop before take-profit.
- Spread is approximated from `backtest/prices/*.jsonl` when available; static fallback is used otherwise.
- Slippage is fixed at `0.2` pips in this first lab version.
- Portfolio margin/leverage is simplified to risk-cash sizing. Treat extreme growth as research-only until broker replay parity is added.

## Recommendation

These are research candidates, not live-proven strategies. Do not merge into `config.js`; replay the best candidate with live decision logs and demo/paper test it first.
