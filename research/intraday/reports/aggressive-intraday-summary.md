# Intraday Strategy Lab Report

Generated: `2026-05-06T05:40:14.747Z`
Mode: `aggressiveIntraday`
Selected score: `aggressiveIntraday`
Rows analyzed: `17909`
Results: `research/intraday/results.tsv`
Search summary: `research/intraday/reports/intraday_search_2026-05-06T04-23-05-731Z.json`

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

Completed experiments in latest run: `16798`
Elapsed minutes: `30.00`
Symbols: `AUDCAD,AUDJPY,AUDUSD,EURAUD,EURCHF,EURGBP,EURJPY,EURUSD,GBPAUD,GBPCHF,GBPJPY,GBPUSD,NZDJPY,NZDUSD,USDCAD,USDCHF,USDJPY`

## Best By endCapital

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |

## Best By rawPnl

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |

## Best By aggressiveIntraday Score

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |

## Best By maxProfit Score

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | maxProfit | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 6830.5056 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |

## Best By profitFactor

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |

## Best By expectancyR

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_06357_5e9f9415db44 | volatility_squeeze_breakout | adaptive_r_trail_3_2_0.4 | aggressive_4pct_4pct_pos1_day16 | 13 | 30.77 | 3.969 | 2.0290 | 21.88 | 1004.35 | 504.35 | 599.0294 | low_sample,live_parity_risk,same_candle_ambiguity_conservative |  |

## Best With maxDD < 40%

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 2 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 3 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 4 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 6 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 7 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 9 | intraday_16232_e3f2af4d23cf | momentum_continuation | adaptive_r_trail_8_2_1 | aggressive_4pct_2pct_pos2_day16 | 175 | 49.14 | 2.349 | 0.5717 | 17.40 | 1980.03 | 1480.03 | 985.4546 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | intraday_04550_986e51748211 | opening_range_breakout | adaptive_r_trail_5_0.5_0.8 | balanced_4pct_pos3_day8 | 122 | 74.59 | 1.865 | 0.2920 | 21.79 | 1857.02 | 1357.02 | 905.5856 | promising,live_parity_risk |  |
| 11 | intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 12 | intraday_09328_1507b0c184d5 | momentum_continuation | profit_protection_exit_8 | aggressive_4pct_4pct_pos2_day16 | 51 | 50.98 | 2.261 | 0.7806 | 31.35 | 1669.75 | 1169.75 | 874.1155 | promising,weak_sample,live_parity_risk |  |
| 13 | intraday_13143_29aee854e2be | session_momentum | adaptive_r_trail_0.5_0.8 | aggressive_3pct_2pct_pos3_day12 | 264 | 68.94 | 1.565 | 0.2259 | 18.13 | 1501.91 | 1001.91 | 758.3214 | promising,reliability_bonus,live_parity_risk |  |
| 14 | intraday_11921_110c579cff73 | liquidity_sweep_reversal | adaptive_r_trail_0.8_1 | aggressive_3pct_2pct_pos3_day12 | 200 | 64.00 | 1.885 | 0.2777 | 17.85 | 1427.68 | 927.68 | 729.1580 | live_parity_risk |  |
| 15 | intraday_14556_e94c21b30692 | hllh_continuation | fixed_r_5 | balanced_4pct_pos1_day8 | 31 | 45.16 | 2.500 | 0.9758 | 16.87 | 1409.76 | 909.76 | 754.5973 | weak_sample,live_parity_risk,same_candle_ambiguity_conservative |  |
| 16 | intraday_08424_eeda837ec0e8 | volatility_squeeze_breakout | adaptive_r_trail_3_0.5_0.4 | conservative_4pct_pos3_day4 | 39 | 66.67 | 2.629 | 0.8589 | 23.67 | 1354.65 | 854.65 | 751.5376 | weak_sample,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | intraday_12506_ac5288a59a72 | momentum_continuation | fixed_r_2 | aggressive_3pct_4pct_pos2_day12 | 74 | 59.46 | 1.709 | 0.3946 | 25.47 | 1312.77 | 812.77 | 669.2223 | weak_sample,live_parity_risk,same_candle_ambiguity_conservative |  |
| 18 | intraday_10076_cdaf4655a935 | hllh_continuation | adaptive_r_trail_0.5_1 | aggressive_4pct_4pct_pos1_day16 | 172 | 60.47 | 1.373 | 0.1612 | 29.94 | 1296.58 | 796.58 | 640.1181 | live_parity_risk |  |
| 19 | intraday_12598_d5e2ec976bd1 | session_momentum | adaptive_r_trail_3_0.5_0.8 | balanced_2pct_pos3_day8 | 252 | 69.84 | 1.536 | 0.2029 | 21.70 | 1289.71 | 789.71 | 658.2213 | reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 20 | intraday_04194_32742575f9d4 | simple_baseline | adaptive_r_trail_0.8_0.8 | aggressive_4pct_4pct_pos1_day16 | 222 | 53.15 | 1.335 | 0.1265 | 25.30 | 1281.47 | 781.47 | 627.5420 | live_parity_risk |  |

## Best With maxDD < 60%

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 3 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 4 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 6 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 7 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 9 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 12 | intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |
| 13 | intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 14 | intraday_16232_e3f2af4d23cf | momentum_continuation | adaptive_r_trail_8_2_1 | aggressive_4pct_2pct_pos2_day16 | 175 | 49.14 | 2.349 | 0.5717 | 17.40 | 1980.03 | 1480.03 | 985.4546 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 15 | intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 16 | intraday_04550_986e51748211 | opening_range_breakout | adaptive_r_trail_5_0.5_0.8 | balanced_4pct_pos3_day8 | 122 | 74.59 | 1.865 | 0.2920 | 21.79 | 1857.02 | 1357.02 | 905.5856 | promising,live_parity_risk |  |
| 17 | intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 18 | intraday_01432_e492e9734183 | session_momentum | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_3pct_pos3_day16 | 326 | 65.64 | 1.354 | 0.1671 | 44.73 | 1675.00 | 1175.00 | 817.5842 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 19 | intraday_09328_1507b0c184d5 | momentum_continuation | profit_protection_exit_8 | aggressive_4pct_4pct_pos2_day16 | 51 | 50.98 | 2.261 | 0.7806 | 31.35 | 1669.75 | 1169.75 | 874.1155 | promising,weak_sample,live_parity_risk |  |
| 20 | intraday_13143_29aee854e2be | session_momentum | adaptive_r_trail_0.5_0.8 | aggressive_3pct_2pct_pos3_day12 | 264 | 68.94 | 1.565 | 0.2259 | 18.13 | 1501.91 | 1001.91 | 758.3214 | promising,reliability_bonus,live_parity_risk |  |

## Best With maxDD < 80%

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 3 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 4 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 6 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 7 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 9 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 12 | intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |
| 13 | intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 14 | intraday_16232_e3f2af4d23cf | momentum_continuation | adaptive_r_trail_8_2_1 | aggressive_4pct_2pct_pos2_day16 | 175 | 49.14 | 2.349 | 0.5717 | 17.40 | 1980.03 | 1480.03 | 985.4546 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 15 | intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 16 | intraday_04550_986e51748211 | opening_range_breakout | adaptive_r_trail_5_0.5_0.8 | balanced_4pct_pos3_day8 | 122 | 74.59 | 1.865 | 0.2920 | 21.79 | 1857.02 | 1357.02 | 905.5856 | promising,live_parity_risk |  |
| 17 | intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 18 | intraday_01432_e492e9734183 | session_momentum | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_3pct_pos3_day16 | 326 | 65.64 | 1.354 | 0.1671 | 44.73 | 1675.00 | 1175.00 | 817.5842 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 19 | intraday_09328_1507b0c184d5 | momentum_continuation | profit_protection_exit_8 | aggressive_4pct_4pct_pos2_day16 | 51 | 50.98 | 2.261 | 0.7806 | 31.35 | 1669.75 | 1169.75 | 874.1155 | promising,weak_sample,live_parity_risk |  |
| 20 | intraday_13143_29aee854e2be | session_momentum | adaptive_r_trail_0.5_0.8 | aggressive_3pct_2pct_pos3_day12 | 264 | 68.94 | 1.565 | 0.2259 | 18.13 | 1501.91 | 1001.91 | 758.3214 | promising,reliability_bonus,live_parity_risk |  |

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
| 20 | intraday_10249_616a4ac7cba3 | liquidity_sweep_reversal | adaptive_r_trail_5_0.8_1.5 | aggressive_4pct_3pct_pos3_day16 | 528 | 62.12 | 1.097 | 0.0506 | 57.15 | 612.97 | 112.97 | 199.9119 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |

## Dangerous High-Profit Candidates

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_16103_4f16f9e67fca | opening_range_breakout | adaptive_r_trail_0.5_0.8 | aggressive_4pct_4pct_pos2_day16 | 307 | 47.56 | 1.114 | 0.0556 | 63.49 | 548.89 | 48.89 | 120.1260 | reliability_bonus,dangerous,live_parity_risk |  |
| 2 | intraday_09877_9bf04e109837 | mean_reversion_intraday | adaptive_r_trail_8_0.5_1 | aggressive_4pct_4pct_pos2_day16 | 379 | 61.74 | 1.025 | 0.0103 | 67.74 | 518.65 | 18.65 | 75.6556 | reliability_bonus,dangerous,live_parity_risk,same_candle_ambiguity_conservative |  |
| 3 | intraday_06239_ae350191a42e | momentum_continuation | atr_trailing_2 | aggressive_4pct_3pct_pos1_day16 | 120 | 37.50 | 1.162 | 0.0887 | 60.29 | 506.64 | 6.64 | 74.0713 | dangerous,live_parity_risk |  |

## Top Candidates With trades >= 100

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 3 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 4 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 6 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 7 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 9 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 12 | intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |
| 13 | intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 14 | intraday_16232_e3f2af4d23cf | momentum_continuation | adaptive_r_trail_8_2_1 | aggressive_4pct_2pct_pos2_day16 | 175 | 49.14 | 2.349 | 0.5717 | 17.40 | 1980.03 | 1480.03 | 985.4546 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 15 | intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 16 | intraday_04550_986e51748211 | opening_range_breakout | adaptive_r_trail_5_0.5_0.8 | balanced_4pct_pos3_day8 | 122 | 74.59 | 1.865 | 0.2920 | 21.79 | 1857.02 | 1357.02 | 905.5856 | promising,live_parity_risk |  |
| 17 | intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 18 | intraday_01432_e492e9734183 | session_momentum | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_3pct_pos3_day16 | 326 | 65.64 | 1.354 | 0.1671 | 44.73 | 1675.00 | 1175.00 | 817.5842 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 19 | intraday_13143_29aee854e2be | session_momentum | adaptive_r_trail_0.5_0.8 | aggressive_3pct_2pct_pos3_day12 | 264 | 68.94 | 1.565 | 0.2259 | 18.13 | 1501.91 | 1001.91 | 758.3214 | promising,reliability_bonus,live_parity_risk |  |
| 20 | intraday_09235_9d0a1a392059 | opening_range_breakout | adaptive_r_trail_0.8_0.4 | aggressive_4pct_4pct_pos1_day16 | 275 | 57.82 | 1.301 | 0.1443 | 42.31 | 1475.20 | 975.20 | 729.2424 | reliability_bonus,elevated_drawdown,live_parity_risk |  |

## Top Candidates With trades >= 200

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 3 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 4 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 5 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 6 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 7 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 11 | intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 12 | intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 13 | intraday_01432_e492e9734183 | session_momentum | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_3pct_pos3_day16 | 326 | 65.64 | 1.354 | 0.1671 | 44.73 | 1675.00 | 1175.00 | 817.5842 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 14 | intraday_13143_29aee854e2be | session_momentum | adaptive_r_trail_0.5_0.8 | aggressive_3pct_2pct_pos3_day12 | 264 | 68.94 | 1.565 | 0.2259 | 18.13 | 1501.91 | 1001.91 | 758.3214 | promising,reliability_bonus,live_parity_risk |  |
| 15 | intraday_09235_9d0a1a392059 | opening_range_breakout | adaptive_r_trail_0.8_0.4 | aggressive_4pct_4pct_pos1_day16 | 275 | 57.82 | 1.301 | 0.1443 | 42.31 | 1475.20 | 975.20 | 729.2424 | reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 16 | intraday_13757_e434fd8c7cac | donchian_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_4pct_pos2_day16 | 437 | 66.13 | 1.229 | 0.0795 | 46.26 | 1429.09 | 929.09 | 702.2960 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | intraday_11921_110c579cff73 | liquidity_sweep_reversal | adaptive_r_trail_0.8_1 | aggressive_3pct_2pct_pos3_day12 | 200 | 64.00 | 1.885 | 0.2777 | 17.85 | 1427.68 | 927.68 | 729.1580 | live_parity_risk |  |
| 18 | intraday_12598_d5e2ec976bd1 | session_momentum | adaptive_r_trail_3_0.5_0.8 | balanced_2pct_pos3_day8 | 252 | 69.84 | 1.536 | 0.2029 | 21.70 | 1289.71 | 789.71 | 658.2213 | reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 19 | intraday_04194_32742575f9d4 | simple_baseline | adaptive_r_trail_0.8_0.8 | aggressive_4pct_4pct_pos1_day16 | 222 | 53.15 | 1.335 | 0.1265 | 25.30 | 1281.47 | 781.47 | 627.5420 | live_parity_risk |  |
| 20 | intraday_10773_b53606941438 | volatility_squeeze_breakout | adaptive_r_trail_3_0.5_0.8 | aggressive_4pct_3pct_pos2_day16 | 503 | 65.21 | 1.190 | 0.0792 | 44.85 | 1216.88 | 716.88 | 609.1742 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |

## Best Per strategyFamily

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | session_momentum: intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | volatility_squeeze_breakout: intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r_2 | conservative_3pct_pos3_day4 | 2 | 100.00 | 99.000 | 1.7710 | 0.00 | 554.54 | 54.54 | 3539.8994 | low_sample,live_parity_risk | too_few_trades |
| 3 | momentum_continuation: intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 4 | opening_range_breakout: intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 5 | hllh_continuation: intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 6 | ema_trend_pullback: intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 7 | liquidity_sweep_reversal: intraday_11921_110c579cff73 | liquidity_sweep_reversal | adaptive_r_trail_0.8_1 | aggressive_3pct_2pct_pos3_day12 | 200 | 64.00 | 1.885 | 0.2777 | 17.85 | 1427.68 | 927.68 | 729.1580 | live_parity_risk |  |
| 8 | donchian_breakout: intraday_13757_e434fd8c7cac | donchian_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_4pct_pos2_day16 | 437 | 66.13 | 1.229 | 0.0795 | 46.26 | 1429.09 | 929.09 | 702.2960 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | simple_baseline: intraday_04194_32742575f9d4 | simple_baseline | adaptive_r_trail_0.8_0.8 | aggressive_4pct_4pct_pos1_day16 | 222 | 53.15 | 1.335 | 0.1265 | 25.30 | 1281.47 | 781.47 | 627.5420 | live_parity_risk |  |
| 10 | mean_reversion_intraday: intraday_09563_25a8b3167f90 | mean_reversion_intraday | adaptive_r_trail_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 36 | 44.44 | 2.038 | 0.8073 | 37.60 | 885.83 | 385.83 | 455.1215 | weak_sample,live_parity_risk |  |

## Best Per exitProfile

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | adaptive_r_trail_0.5_1: intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | fixed_r_2: intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r_2 | conservative_3pct_pos3_day4 | 2 | 100.00 | 99.000 | 1.7710 | 0.00 | 554.54 | 54.54 | 3539.8994 | low_sample,live_parity_risk | too_few_trades |
| 3 | adaptive_r_trail_8_0.5_0.6: intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 4 | momentum_decay_exit_5: intraday_10243_207a17f258d7 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_3pct_3pct_pos3_day12 | 2 | 100.00 | 99.000 | 1.5352 | 0.00 | 546.23 | 46.23 | 3512.6550 | low_sample,live_parity_risk | too_few_trades |
| 5 | time_based_exit_1.5_24: intraday_08507_cdc47988ca5a | volatility_squeeze_breakout | time_based_exit_1.5_24 | conservative_1pct_pos2_day4 | 2 | 100.00 | 99.000 | 1.2710 | 0.00 | 512.79 | 12.79 | 3456.5882 | low_sample,live_parity_risk | too_few_trades |
| 6 | adaptive_r_trail_0.5_0.4: intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 7 | fixed_r_1: intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |
| 8 | adaptive_r_trail_8_0.5_0.4: intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | adaptive_r_trail_5_0.8_0.4: intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | candle_low_high_trail: intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 11 | adaptive_r_trail_5_0.5_0.8: intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 12 | adaptive_r_trail_5_0.5_0.4: intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 13 | adaptive_r_trail_8_2_0.4: intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 14 | adaptive_r_trail_8_2_1: intraday_16232_e3f2af4d23cf | momentum_continuation | adaptive_r_trail_8_2_1 | aggressive_4pct_2pct_pos2_day16 | 175 | 49.14 | 2.349 | 0.5717 | 17.40 | 1980.03 | 1480.03 | 985.4546 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 15 | adaptive_r_trail_0.5_0.6: intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 16 | adaptive_r_trail_8_0.5_0.8: intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 17 | profit_protection_exit_8: intraday_09328_1507b0c184d5 | momentum_continuation | profit_protection_exit_8 | aggressive_4pct_4pct_pos2_day16 | 51 | 50.98 | 2.261 | 0.7806 | 31.35 | 1669.75 | 1169.75 | 874.1155 | promising,weak_sample,live_parity_risk |  |
| 18 | adaptive_r_trail_0.8_1.5: intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 19 | atr_trailing_2: intraday_10640_33dc5061f7bc | momentum_continuation | atr_trailing_2 | balanced_2pct_pos2_day8 | 59 | 45.76 | 4.165 | 1.0114 | 10.66 | 1240.64 | 740.64 | 767.0023 | weak_sample,live_parity_risk |  |
| 20 | adaptive_r_trail_0.5_0.8: intraday_13143_29aee854e2be | session_momentum | adaptive_r_trail_0.5_0.8 | aggressive_3pct_2pct_pos3_day12 | 264 | 68.94 | 1.565 | 0.2259 | 18.13 | 1501.91 | 1001.91 | 758.3214 | promising,reliability_bonus,live_parity_risk |  |

## Best Per managementProfile

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | protect_profit_2_0.6: intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | daily_flat_1260: intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r_2 | conservative_3pct_pos3_day4 | 2 | 100.00 | 99.000 | 1.7710 | 0.00 | 554.54 | 54.54 | 3539.8994 | low_sample,live_parity_risk | too_few_trades |
| 3 | fast_cut_3_0.4: intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 4 | passive: intraday_10243_207a17f258d7 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_3pct_3pct_pos3_day12 | 2 | 100.00 | 99.000 | 1.5352 | 0.00 | 546.23 | 46.23 | 3512.6550 | low_sample,live_parity_risk | too_few_trades |
| 5 | momentum_watch_1_1: intraday_08507_cdc47988ca5a | volatility_squeeze_breakout | time_based_exit_1.5_24 | conservative_1pct_pos2_day4 | 2 | 100.00 | 99.000 | 1.2710 | 0.00 | 512.79 | 12.79 | 3456.5882 | low_sample,live_parity_risk | too_few_trades |
| 6 | daily_flat_1245: intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |
| 7 | protect_profit_1_0.35: intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 8 | daily_flat_1290: intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | fast_cut_2_0.6: intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 10 | protect_profit_0.8_0.6: intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 11 | protect_profit_2_0.45: intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 12 | session_flat: intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 13 | fast_cut_2_0.4: intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |
| 14 | fast_cut_1_0.6: intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 15 | fast_cut_1_0.8: intraday_09328_1507b0c184d5 | momentum_continuation | profit_protection_exit_8 | aggressive_4pct_4pct_pos2_day16 | 51 | 50.98 | 2.261 | 0.7806 | 31.35 | 1669.75 | 1169.75 | 874.1155 | promising,weak_sample,live_parity_risk |  |
| 16 | protect_profit_0.8_0.35: intraday_07611_76e04e3d4273 | ema_trend_pullback | adaptive_r_trail_0.8_1.5 | aggressive_4pct_3pct_pos2_day16 | 435 | 54.25 | 1.253 | 0.1087 | 27.59 | 1714.38 | 1214.38 | 823.2258 | promising,reliability_bonus,live_parity_risk |  |
| 17 | momentum_watch_1.5_1: intraday_13143_29aee854e2be | session_momentum | adaptive_r_trail_0.5_0.8 | aggressive_3pct_2pct_pos3_day12 | 264 | 68.94 | 1.565 | 0.2259 | 18.13 | 1501.91 | 1001.91 | 758.3214 | promising,reliability_bonus,live_parity_risk |  |
| 18 | momentum_watch_0.5_2: intraday_11921_110c579cff73 | liquidity_sweep_reversal | adaptive_r_trail_0.8_1 | aggressive_3pct_2pct_pos3_day12 | 200 | 64.00 | 1.885 | 0.2777 | 17.85 | 1427.68 | 927.68 | 729.1580 | live_parity_risk |  |
| 19 | momentum_watch_1.5_2: intraday_12598_d5e2ec976bd1 | session_momentum | adaptive_r_trail_3_0.5_0.8 | balanced_2pct_pos3_day8 | 252 | 69.84 | 1.536 | 0.2029 | 21.70 | 1289.71 | 789.71 | 658.2213 | reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 20 | momentum_watch_1_3: intraday_01628_8444a71f867d | volatility_squeeze_breakout | candle_low_high_trail | balanced_4pct_pos1_day8 | 35 | 54.29 | 3.009 | 0.7143 | 15.24 | 1159.22 | 659.22 | 641.9718 | weak_sample,live_parity_risk |  |

## Best Per Symbol

_This ranks saved leader artifacts by selected score for each symbol exposure; it is not yet a standalone per-symbol rerun._

| rank | exposure | tradesInCandidate | experimentId | family | exit | risk | totalTrades | maxDD | endCapital | aggressiveIntraday | candidatePath |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | AUDCAD | 86 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 2 | AUDJPY | 48 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 3 | EURJPY | 7 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 4 | EURAUD | 147 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 5 | USDJPY | 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 6 | USDCAD | 2 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 7 | GBPJPY | 89 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 8 | GBPUSD | 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 9 | GBPAUD | 106 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 10 | EURGBP | 10 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 11 | AUDUSD | 10 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 12 | NZDUSD | 2 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 13 | EURCHF | 20 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 14 | NZDJPY | 3 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 15 | GBPCHF | 6 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 16 | EURUSD | 2 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 17 | USDCHF | 2 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |

## Best Per Session

_This ranks saved leader artifacts by selected score for each session exposure; it is not yet a standalone per-session rerun._

| rank | exposure | tradesInCandidate | experimentId | family | exit | risk | totalTrades | maxDD | endCapital | aggressiveIntraday | candidatePath |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ny | 542 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail | aggressive_3pct | 542 | 41.65 | 33008.39 | 5469.8025 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| 2 | london | 1 | intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r | conservative | 2 | 0.00 | 554.54 | 3539.8994 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-aggressiveIntraday__intraday_06991_3ae5754d869d.json |
| 3 | asian | 1 | intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r | conservative | 2 | 0.00 | 554.54 | 3539.8994 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-aggressiveIntraday__intraday_06991_3ae5754d869d.json |
| 4 | off_session | 42 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail | aggressive_3pct | 208 | 28.22 | 15911.76 | 3412.4373 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_01766_fc7eab44be9b.json |

## Best Entry + Exit Combination

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r_2 | conservative_3pct_pos3_day4 | 2 | 100.00 | 99.000 | 1.7710 | 0.00 | 554.54 | 54.54 | 3539.8994 | low_sample,live_parity_risk | too_few_trades |
| 3 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 4 | intraday_10243_207a17f258d7 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_3pct_3pct_pos3_day12 | 2 | 100.00 | 99.000 | 1.5352 | 0.00 | 546.23 | 46.23 | 3512.6550 | low_sample,live_parity_risk | too_few_trades |
| 5 | intraday_08507_cdc47988ca5a | volatility_squeeze_breakout | time_based_exit_1.5_24 | conservative_1pct_pos2_day4 | 2 | 100.00 | 99.000 | 1.2710 | 0.00 | 512.79 | 12.79 | 3456.5882 | low_sample,live_parity_risk | too_few_trades |
| 6 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 7 | intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |
| 8 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 11 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 12 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 13 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 14 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 15 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 16 | intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |
| 17 | intraday_16232_e3f2af4d23cf | momentum_continuation | adaptive_r_trail_8_2_1 | aggressive_4pct_2pct_pos2_day16 | 175 | 49.14 | 2.349 | 0.5717 | 17.40 | 1980.03 | 1480.03 | 985.4546 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 18 | intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 19 | intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 20 | intraday_04550_986e51748211 | opening_range_breakout | adaptive_r_trail_5_0.5_0.8 | balanced_4pct_pos3_day8 | 122 | 74.59 | 1.865 | 0.2920 | 21.79 | 1857.02 | 1357.02 | 905.5856 | promising,live_parity_risk |  |

## Top 20 Candidates Overall

| rank | experimentId | family | exit | risk | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressiveIntraday | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | intraday_09473_be83a91c4f2b | session_momentum | adaptive_r_trail_0.5_1 | aggressive_3pct_3pct_pos1_day12 | 542 | 65.68 | 1.575 | 0.3004 | 41.65 | 33008.39 | 32508.39 | 5469.8025 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk |  |
| 2 | intraday_06991_3ae5754d869d | volatility_squeeze_breakout | fixed_r_2 | conservative_3pct_pos3_day4 | 2 | 100.00 | 99.000 | 1.7710 | 0.00 | 554.54 | 54.54 | 3539.8994 | low_sample,live_parity_risk | too_few_trades |
| 3 | intraday_03419_c77deda59623 | session_momentum | adaptive_r_trail_8_0.5_0.6 | aggressive_4pct_3pct_pos1_day16 | 504 | 65.67 | 1.657 | 0.2489 | 26.61 | 16865.90 | 16365.90 | 3518.5680 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 4 | intraday_10243_207a17f258d7 | volatility_squeeze_breakout | momentum_decay_exit_5 | aggressive_3pct_3pct_pos3_day12 | 2 | 100.00 | 99.000 | 1.5352 | 0.00 | 546.23 | 46.23 | 3512.6550 | low_sample,live_parity_risk | too_few_trades |
| 5 | intraday_08507_cdc47988ca5a | volatility_squeeze_breakout | time_based_exit_1.5_24 | conservative_1pct_pos2_day4 | 2 | 100.00 | 99.000 | 1.2710 | 0.00 | 512.79 | 12.79 | 3456.5882 | low_sample,live_parity_risk | too_few_trades |
| 6 | intraday_01766_fc7eab44be9b | momentum_continuation | adaptive_r_trail_0.5_0.4 | aggressive_3pct_4pct_pos2_day12 | 208 | 67.79 | 2.242 | 0.4815 | 28.22 | 15911.76 | 15411.76 | 3412.4373 | very_interesting,live_parity_risk |  |
| 7 | intraday_01255_20e1d058f573 | volatility_squeeze_breakout | fixed_r_1 | aggressive_4pct_2pct_pos1_day16 | 2 | 100.00 | 99.000 | 0.5420 | 0.00 | 510.90 | 10.90 | 3396.2329 | low_sample,live_parity_risk | too_few_trades |
| 8 | intraday_06217_102ce6d3b366 | session_momentum | adaptive_r_trail_8_0.5_0.4 | aggressive_4pct_3pct_pos1_day16 | 360 | 66.67 | 1.656 | 0.2847 | 38.52 | 8191.15 | 7691.15 | 2282.9522 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 9 | intraday_06129_60e82f2a9f2c | momentum_continuation | adaptive_r_trail_5_0.8_0.4 | aggressive_4pct_4pct_pos3_day16 | 362 | 58.29 | 1.569 | 0.2584 | 48.64 | 6670.11 | 6170.11 | 2021.7333 | very_interesting,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 10 | intraday_13079_f7cc053a5c75 | momentum_continuation | candle_low_high_trail | aggressive_4pct_4pct_pos3_day16 | 224 | 47.77 | 1.836 | 0.4519 | 42.01 | 5766.79 | 5266.79 | 1870.8879 | very_interesting,elevated_drawdown,live_parity_risk |  |
| 11 | intraday_02119_16a3145c3757 | volatility_squeeze_breakout | adaptive_r_trail_5_0.5_0.8 | aggressive_3pct_4pct_pos1_day12 | 266 | 66.17 | 1.608 | 0.2504 | 28.40 | 5258.12 | 4758.12 | 1763.5099 | very_interesting,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 12 | intraday_08422_8987dd8793c8 | opening_range_breakout | adaptive_r_trail_8_0.5_0.6 | aggressive_3pct_4pct_pos3_day12 | 163 | 69.33 | 1.873 | 0.3230 | 24.14 | 3388.59 | 2888.59 | 1361.4340 | interesting,live_parity_risk |  |
| 13 | intraday_06158_71cc8add700d | session_momentum | adaptive_r_trail_5_0.5_0.8 | aggressive_4pct_2pct_pos2_day16 | 957 | 63.11 | 1.250 | 0.0997 | 27.31 | 2791.94 | 2291.94 | 1185.3284 | promising,reliability_bonus,live_parity_risk,same_candle_ambiguity_conservative |  |
| 14 | intraday_09947_d63076b6b261 | opening_range_breakout | adaptive_r_trail_5_0.5_0.4 | aggressive_4pct_2pct_pos3_day16 | 656 | 67.53 | 1.324 | 0.1464 | 40.11 | 2666.92 | 2166.92 | 1156.9092 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 15 | intraday_04229_19f9cf805f14 | momentum_continuation | adaptive_r_trail_8_2_0.4 | aggressive_4pct_4pct_pos2_day16 | 101 | 47.52 | 1.998 | 0.4707 | 27.24 | 2180.76 | 1680.76 | 1033.2003 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 16 | intraday_10963_f6bbbe75435c | momentum_continuation | adaptive_r_trail_0.5_1 | aggressive_3pct_4pct_pos3_day12 | 160 | 59.38 | 2.030 | 0.3787 | 42.41 | 2117.44 | 1617.44 | 1007.6745 | promising,elevated_drawdown,live_parity_risk |  |
| 17 | intraday_16232_e3f2af4d23cf | momentum_continuation | adaptive_r_trail_8_2_1 | aggressive_4pct_2pct_pos2_day16 | 175 | 49.14 | 2.349 | 0.5717 | 17.40 | 1980.03 | 1480.03 | 985.4546 | promising,live_parity_risk,same_candle_ambiguity_conservative |  |
| 18 | intraday_01909_445e0013c879 | hllh_continuation | adaptive_r_trail_0.5_0.6 | aggressive_4pct_1pct_pos2_day16 | 1058 | 58.98 | 1.347 | 0.1410 | 16.59 | 2084.67 | 1584.67 | 974.6179 | promising,reliability_bonus,live_parity_risk |  |
| 19 | intraday_04122_5fea881a467f | opening_range_breakout | adaptive_r_trail_8_0.5_0.8 | aggressive_4pct_2pct_pos1_day16 | 324 | 70.06 | 1.552 | 0.2465 | 42.73 | 1979.56 | 1479.56 | 945.5159 | promising,reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |
| 20 | intraday_04550_986e51748211 | opening_range_breakout | adaptive_r_trail_5_0.5_0.8 | balanced_4pct_pos3_day8 | 122 | 74.59 | 1.865 | 0.2920 | 21.79 | 1857.02 | 1357.02 | 905.5856 | promising,live_parity_risk |  |

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
| 20 | intraday_10249_616a4ac7cba3 | liquidity_sweep_reversal | adaptive_r_trail_5_0.8_1.5 | aggressive_4pct_3pct_pos3_day16 | 528 | 62.12 | 1.097 | 0.0506 | 57.15 | 612.97 | 112.97 | 199.9119 | reliability_bonus,elevated_drawdown,live_parity_risk,same_candle_ambiguity_conservative |  |

## Candidate JSON

Best aggressive candidate JSON: `/Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json`

```json
{
  "label": "intraday_09473",
  "strategyFamily": {
    "family": "session_momentum",
    "session": "ny",
    "minAtrPct": 0,
    "trendFilter": "ema8_20"
  },
  "entryProfile": {
    "timeframe": "M15",
    "entryMode": "next_open"
  },
  "exitProfile": {
    "kind": "adaptive_r_trail",
    "stopModel": "fixed_pips",
    "stopAtrMultiplier": 1.5,
    "stopPips": 6,
    "minStopPips": 2,
    "maxStopPips": 35,
    "noOvernight": true,
    "tpR": null,
    "activationR": 0.5,
    "trailR": 1,
    "breakevenR": 1.2
  },
  "managementProfile": {
    "kind": "protect_profit",
    "minProfitR": 2,
    "givebackPct": 0.6
  },
  "riskProfile": {
    "kind": "aggressive_3pct",
    "riskPerTrade": 0.03,
    "maxPositions": 1,
    "maxTradesPerDay": 12,
    "maxTradesPerSymbolPerDay": 3,
    "dailyStopLossPct": 0.09,
    "dailyTakeProfitLockPct": 0.16,
    "stopAfterLosses": 5,
    "reduceRiskAfterDrawdownPct": 25,
    "reducedRiskMultiplier": 0.7
  },
  "notes": "Intraday lab candidate: strategy family + entry + exit + management + risk."
}
```

## Leader Candidate Paths

| leader | experimentId | candidatePath |
| --- | --- | --- |
| selectedScore | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-aggressiveIntraday__intraday_09473_be83a91c4f2b.json |
| endCapital | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-endCapital__intraday_09473_be83a91c4f2b.json |
| rawPnl | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-rawPnl__intraday_09473_be83a91c4f2b.json |
| aggressiveIntraday | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-aggressiveIntraday__intraday_09473_be83a91c4f2b.json |
| maxProfit | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/maxProfit/best-maxProfit__intraday_09473_be83a91c4f2b.json |
| dd40 | intraday_03419_c77deda59623 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/profitWithControl/best-maxDD-lt40__intraday_03419_c77deda59623.json |
| dd60 | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/aggressiveIntraday/best-maxDD-lt60__intraday_09473_be83a91c4f2b.json |
| dd80 | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/high-risk/best-maxDD-lt80__intraday_09473_be83a91c4f2b.json |
| highRiskProfit | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/high-risk/best-high-risk-profit__intraday_09473_be83a91c4f2b.json |
| byFamily.hllh_continuation | intraday_01909_445e0013c879 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-hllh_continuation__intraday_01909_445e0013c879.json |
| byFamily.session_momentum | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-session_momentum__intraday_09473_be83a91c4f2b.json |
| byFamily.liquidity_sweep_reversal | intraday_11921_110c579cff73 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-liquidity_sweep_reversal__intraday_11921_110c579cff73.json |
| byFamily.simple_baseline | intraday_04194_32742575f9d4 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-simple_baseline__intraday_04194_32742575f9d4.json |
| byFamily.donchian_breakout | intraday_13757_e434fd8c7cac | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-donchian_breakout__intraday_13757_e434fd8c7cac.json |
| byFamily.ema_trend_pullback | intraday_07611_76e04e3d4273 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-ema_trend_pullback__intraday_07611_76e04e3d4273.json |
| byFamily.momentum_continuation | intraday_01766_fc7eab44be9b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-momentum_continuation__intraday_01766_fc7eab44be9b.json |
| byFamily.volatility_squeeze_breakout | intraday_02119_16a3145c3757 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-volatility_squeeze_breakout__intraday_02119_16a3145c3757.json |
| byFamily.opening_range_breakout | intraday_08422_8987dd8793c8 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-opening_range_breakout__intraday_08422_8987dd8793c8.json |
| byFamily.mean_reversion_intraday | intraday_09563_25a8b3167f90 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/family/best-family-mean_reversion_intraday__intraday_09563_25a8b3167f90.json |
| byExit.fixed_r | intraday_14556_e94c21b30692 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-fixed_r__intraday_14556_e94c21b30692.json |
| byExit.profit_protection_exit | intraday_09328_1507b0c184d5 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-profit_protection_exit__intraday_09328_1507b0c184d5.json |
| byExit.partial_take_profit | intraday_04368_79db8ae51e8c | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-partial_take_profit__intraday_04368_79db8ae51e8c.json |
| byExit.candle_low_high_trail | intraday_13079_f7cc053a5c75 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-candle_low_high_trail__intraday_13079_f7cc053a5c75.json |
| byExit.momentum_decay_exit | intraday_00257_0aaa19999d7a | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-momentum_decay_exit__intraday_00257_0aaa19999d7a.json |
| byExit.adaptive_r_trail | intraday_09473_be83a91c4f2b | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-adaptive_r_trail__intraday_09473_be83a91c4f2b.json |
| byExit.breakeven_after_r | intraday_05061_42f6b60af3ac | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-breakeven_after_r__intraday_05061_42f6b60af3ac.json |
| byExit.atr_trailing | intraday_10640_33dc5061f7bc | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-atr_trailing__intraday_10640_33dc5061f7bc.json |
| byExit.ema_exit | intraday_14249_257e87c1d721 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-ema_exit__intraday_14249_257e87c1d721.json |
| byExit.time_based_exit | intraday_07982_41c9462859b7 | /Users/waldemarweinert/DEV/trading/capital-api-bot/research/intraday/candidates/exit/best-exit-time_based_exit__intraday_07982_41c9462859b7.json |

## Config Diff Against `config.js`

No live `config.js` diff was applied. The best intraday candidate is a research-only object; mapping it into live config requires a manual adapter after replay parity is fixed.

Research candidate override:

```json
{
  "label": "intraday_09473",
  "strategyFamily": {
    "family": "session_momentum",
    "session": "ny",
    "minAtrPct": 0,
    "trendFilter": "ema8_20"
  },
  "entryProfile": {
    "timeframe": "M15",
    "entryMode": "next_open"
  },
  "exitProfile": {
    "kind": "adaptive_r_trail",
    "stopModel": "fixed_pips",
    "stopAtrMultiplier": 1.5,
    "stopPips": 6,
    "minStopPips": 2,
    "maxStopPips": 35,
    "noOvernight": true,
    "tpR": null,
    "activationR": 0.5,
    "trailR": 1,
    "breakevenR": 1.2
  },
  "managementProfile": {
    "kind": "protect_profit",
    "minProfitR": 2,
    "givebackPct": 0.6
  },
  "riskProfile": {
    "kind": "aggressive_3pct",
    "riskPerTrade": 0.03,
    "maxPositions": 1,
    "maxTradesPerDay": 12,
    "maxTradesPerSymbolPerDay": 3,
    "dailyStopLossPct": 0.09,
    "dailyTakeProfitLockPct": 0.16,
    "stopAfterLosses": 5,
    "reduceRiskAfterDrawdownPct": 25,
    "reducedRiskMultiplier": 0.7
  },
  "notes": "Intraday lab candidate: strategy family + entry + exit + management + risk."
}
```

## Realism Notes

- Entry is on the next monitoring candle open after a closed signal candle.
- Monitoring is M5 when available; otherwise it falls back to the entry timeframe.
- Same-candle TP/SL ambiguity is handled conservatively by checking stop before take-profit.
- Spread is approximated from `backtest/prices/*.jsonl` when available; static fallback is used otherwise.
- Slippage is fixed at `0.2` pips in this first lab version.
- Portfolio margin/leverage is simplified to risk-cash sizing. Treat extreme growth as research-only until broker replay parity is added.

## Recommendation

These are research candidates, not live-proven strategies. Do not merge into `config.js`; replay the best candidate with live decision logs and demo/paper test it first.
