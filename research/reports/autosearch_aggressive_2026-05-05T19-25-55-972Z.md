# Aggressive HLLH AutoSearch Summary

Generated: `2026-05-05T19:25:55.973Z`
Mode: `aggressive`
Selected score column: `aggressive`
Results file: `research/results.tsv`
Rows analyzed: `49344`
Search summary: `research/reports/search_2026-05-05T19-10-31-717Z.json`
Live parity diagnostics: `research/reports/live-parity-diagnostics.md`

## Exact Commands

```bash
npm run research:baseline -- --days=90 --mode=robust
npm run research:search -- --minutes=30 --days=90 --mode=aggressive --seed=20260505
npm run research:search -- --minutes=15 --days=90 --mode=max-profit --seed=202605051
npm run research:report -- --mode=aggressive
npm run research:report -- --mode=max-profit
```

## Baseline

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | baseline_live_config_60fb97fcf225 | 948 | 46.73 | 0.543 | -0.3236 | 89.83 | 53.90 | -446.10 | -953.8533 | reliability_bonus,very_high_drawdown,negative_profit,profit_factor_below_1 | high_drawdown,non_positive_expectancy |

## Previous Robust Best

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | robust | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_8603_d1980391cd73 | 302 | 30.46 | 1.157 | 0.1348 | 18.63 | 888.60 | 388.60 | 318.5238 | reliability_bonus |  |

## New Aggressive Best

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |

## New Max-Profit Best

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | maxProfit | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 426.0151 |  |  |

## Candidate JSON Paths

- Selected best: `search_17764_6887c14e7e41`, JSON: `/Users/waldemarweinert/DEV/trading/capital-api-bot/research/candidates/aggressive/best-aggressiveScore__search_17764_6887c14e7e41.json`
- Aggressive best: `search_17764_6887c14e7e41`, JSON: `/Users/waldemarweinert/DEV/trading/capital-api-bot/research/candidates/aggressive/best-aggressiveScore__search_17764_6887c14e7e41.json`
- Max-profit best: `search_17764_6887c14e7e41`, JSON: `/Users/waldemarweinert/DEV/trading/capital-api-bot/research/candidates/max-profit/best-maxProfitScore__search_17764_6887c14e7e41.json`
- Best maxDD < 60%: `search_17764_6887c14e7e41`, JSON: `/Users/waldemarweinert/DEV/trading/capital-api-bot/research/candidates/aggressive/best-aggressiveScore__search_17764_6887c14e7e41.json`
- Best maxDD < 80%: `search_17764_6887c14e7e41`, JSON: `/Users/waldemarweinert/DEV/trading/capital-api-bot/research/candidates/high-risk/best-maxDD-lt80__search_17764_6887c14e7e41.json`

## Config Diff Against Current config.js

The candidate is represented as these overrides on top of current `HLLH_SYMBOL_PROFILES`:
```json
{
  "setupMode": "confirmed",
  "pivotWindow": 2,
  "signalMode": "strict",
  "entryMode": "entry_on_break",
  "stopVariant": "structure_pivot_with_buffer_2pip",
  "exitVariant": "fixed_r_5",
  "takeProfitR": 10,
  "safetyTakeProfitR": 25,
  "maxSignalWaitBars": 4,
  "entryBreakMaxBars": 1,
  "minStopDistancePips": 2,
  "maxStopPips": 25,
  "dailyForcedCloseUTC": true,
  "entryCutoffMinuteUTC": 1380,
  "avoidHoursUTC": [
    0,
    21
  ],
  "managementProfile": {
    "mode": "adaptive_trail_r",
    "activationR": 0.8,
    "trailR": 0.5,
    "breakevenR": 1.2,
    "maxHoldBars": 96,
    "timeframe": "M15"
  }
}
```

## Why The Candidate Is Interesting

- Ranking is now profit-first for `aggressive` and `max-profit`: high `endCapital` and `rawPnl` are shown even when drawdown is ugly.
- The report keeps dangerous candidates visible for manual research instead of filtering them out through robust-only rejection.
- The backtest still includes the practical guards used in this research harness: start capital `500`, risk `3%`, one open portfolio position, one position per symbol through sequencing, max stop checks, session filters, and forced close.

## Why The Candidate Is Dangerous

- High `maxDrawdownPct` can mean the account nearly dies before the profit materializes.
- `rejectionReason` is still shown as risk metadata; it no longer means the candidate is useless.
- Live/replay mismatch is unresolved, so these are research candidates, not live-proven strategies.

## Recommendation

Not live-ready. Use for manual review, then replay against live decision logs, then paper-test/demo-test. Do not merge into `config.js` blindly.

## Top 20 By endCapital

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |
| 2 | search_3593_d59f563da7a6 | 386 | 26.42 | 1.077 | 0.0746 | 35.18 | 1073.75 | 573.75 | 283.9763 | reliability_bonus | high_drawdown |
| 3 | search_20155_b8e9245361ca | 158 | 35.44 | 1.405 | 0.2955 | 17.94 | 1045.54 | 545.54 | 287.2472 |  |  |
| 4 | search_7221_258e2983d7ce | 398 | 26.38 | 1.062 | 0.0595 | 35.38 | 1037.34 | 537.34 | 272.3381 | reliability_bonus | high_drawdown |
| 5 | search_3478_4c20773d0111 | 151 | 33.77 | 1.305 | 0.2313 | 20.20 | 991.94 | 491.94 | 264.7734 |  |  |
| 6 | search_7125_e921a7dae3df | 184 | 39.67 | 1.255 | 0.1759 | 17.43 | 953.06 | 453.06 | 249.3839 |  |  |
| 7 | search_7933_e5ae7608ce75 | 380 | 25.53 | 1.047 | 0.0457 | 38.56 | 891.90 | 391.90 | 225.6468 | reliability_bonus | high_drawdown |
| 8 | search_8603_d1980391cd73 | 302 | 30.46 | 1.157 | 0.1348 | 18.63 | 888.60 | 388.60 | 233.6167 | reliability_bonus |  |
| 9 | search_18714_b7e49e25a244 | 395 | 25.57 | 1.032 | 0.0307 | 33.25 | 886.69 | 386.69 | 222.6222 | reliability_bonus |  |
| 10 | search_12057_dde7cb4be8d7 | 168 | 34.52 | 1.238 | 0.1744 | 22.97 | 878.99 | 378.99 | 223.5676 |  |  |
| 11 | search_16323_f685f65f1789 | 194 | 39.18 | 1.204 | 0.1405 | 23.06 | 877.12 | 377.12 | 220.9767 |  |  |
| 12 | search_7927_9705aea1873f | 294 | 30.27 | 1.106 | 0.0881 | 23.74 | 874.91 | 374.91 | 218.8439 | reliability_bonus |  |
| 13 | search_4669_d9d04ba28a3a | 165 | 33.94 | 1.257 | 0.1890 | 24.83 | 871.69 | 371.69 | 222.3007 |  |  |
| 14 | search_11174_fb44b767cc87 | 173 | 35.26 | 1.228 | 0.1621 | 30.04 | 865.77 | 365.77 | 218.1814 |  |  |
| 15 | search_8826_0070ec601fd4 | 385 | 25.45 | 1.033 | 0.0324 | 38.47 | 862.01 | 362.01 | 214.2566 | reliability_bonus | high_drawdown |
| 16 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 17 | search_9810_fffd4057997e | 156 | 32.69 | 1.208 | 0.1570 | 32.12 | 841.40 | 341.40 | 208.2957 |  |  |
| 18 | search_6775_d422db22a4f9 | 262 | 28.24 | 1.158 | 0.1394 | 36.60 | 839.41 | 339.41 | 210.3893 | reliability_bonus | high_drawdown |
| 19 | search_8860_9152dd2fc1f7 | 224 | 29.46 | 1.199 | 0.1759 | 21.34 | 835.34 | 335.34 | 212.3902 | reliability_bonus |  |
| 20 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |

## Top 20 By rawPnl

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |
| 2 | search_3593_d59f563da7a6 | 386 | 26.42 | 1.077 | 0.0746 | 35.18 | 1073.75 | 573.75 | 283.9763 | reliability_bonus | high_drawdown |
| 3 | search_20155_b8e9245361ca | 158 | 35.44 | 1.405 | 0.2955 | 17.94 | 1045.54 | 545.54 | 287.2472 |  |  |
| 4 | search_7221_258e2983d7ce | 398 | 26.38 | 1.062 | 0.0595 | 35.38 | 1037.34 | 537.34 | 272.3381 | reliability_bonus | high_drawdown |
| 5 | search_3478_4c20773d0111 | 151 | 33.77 | 1.305 | 0.2313 | 20.20 | 991.94 | 491.94 | 264.7734 |  |  |
| 6 | search_7125_e921a7dae3df | 184 | 39.67 | 1.255 | 0.1759 | 17.43 | 953.06 | 453.06 | 249.3839 |  |  |
| 7 | search_7933_e5ae7608ce75 | 380 | 25.53 | 1.047 | 0.0457 | 38.56 | 891.90 | 391.90 | 225.6468 | reliability_bonus | high_drawdown |
| 8 | search_8603_d1980391cd73 | 302 | 30.46 | 1.157 | 0.1348 | 18.63 | 888.60 | 388.60 | 233.6167 | reliability_bonus |  |
| 9 | search_18714_b7e49e25a244 | 395 | 25.57 | 1.032 | 0.0307 | 33.25 | 886.69 | 386.69 | 222.6222 | reliability_bonus |  |
| 10 | search_12057_dde7cb4be8d7 | 168 | 34.52 | 1.238 | 0.1744 | 22.97 | 878.99 | 378.99 | 223.5676 |  |  |
| 11 | search_16323_f685f65f1789 | 194 | 39.18 | 1.204 | 0.1405 | 23.06 | 877.12 | 377.12 | 220.9767 |  |  |
| 12 | search_7927_9705aea1873f | 294 | 30.27 | 1.106 | 0.0881 | 23.74 | 874.91 | 374.91 | 218.8439 | reliability_bonus |  |
| 13 | search_4669_d9d04ba28a3a | 165 | 33.94 | 1.257 | 0.1890 | 24.83 | 871.69 | 371.69 | 222.3007 |  |  |
| 14 | search_11174_fb44b767cc87 | 173 | 35.26 | 1.228 | 0.1621 | 30.04 | 865.77 | 365.77 | 218.1814 |  |  |
| 15 | search_8826_0070ec601fd4 | 385 | 25.45 | 1.033 | 0.0324 | 38.47 | 862.01 | 362.01 | 214.2566 | reliability_bonus | high_drawdown |
| 16 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 17 | search_9810_fffd4057997e | 156 | 32.69 | 1.208 | 0.1570 | 32.12 | 841.40 | 341.40 | 208.2957 |  |  |
| 18 | search_6775_d422db22a4f9 | 262 | 28.24 | 1.158 | 0.1394 | 36.60 | 839.41 | 339.41 | 210.3893 | reliability_bonus | high_drawdown |
| 19 | search_8860_9152dd2fc1f7 | 224 | 29.46 | 1.199 | 0.1759 | 21.34 | 835.34 | 335.34 | 212.3902 | reliability_bonus |  |
| 20 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |

## Top 20 By aggressiveScore

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |
| 2 | search_20155_b8e9245361ca | 158 | 35.44 | 1.405 | 0.2955 | 17.94 | 1045.54 | 545.54 | 287.2472 |  |  |
| 3 | search_3593_d59f563da7a6 | 386 | 26.42 | 1.077 | 0.0746 | 35.18 | 1073.75 | 573.75 | 283.9763 | reliability_bonus | high_drawdown |
| 4 | search_7221_258e2983d7ce | 398 | 26.38 | 1.062 | 0.0595 | 35.38 | 1037.34 | 537.34 | 272.3381 | reliability_bonus | high_drawdown |
| 5 | search_3478_4c20773d0111 | 151 | 33.77 | 1.305 | 0.2313 | 20.20 | 991.94 | 491.94 | 264.7734 |  |  |
| 6 | search_7125_e921a7dae3df | 184 | 39.67 | 1.255 | 0.1759 | 17.43 | 953.06 | 453.06 | 249.3839 |  |  |
| 7 | search_8603_d1980391cd73 | 302 | 30.46 | 1.157 | 0.1348 | 18.63 | 888.60 | 388.60 | 233.6167 | reliability_bonus |  |
| 8 | search_7933_e5ae7608ce75 | 380 | 25.53 | 1.047 | 0.0457 | 38.56 | 891.90 | 391.90 | 225.6468 | reliability_bonus | high_drawdown |
| 9 | search_12057_dde7cb4be8d7 | 168 | 34.52 | 1.238 | 0.1744 | 22.97 | 878.99 | 378.99 | 223.5676 |  |  |
| 10 | search_18714_b7e49e25a244 | 395 | 25.57 | 1.032 | 0.0307 | 33.25 | 886.69 | 386.69 | 222.6222 | reliability_bonus |  |
| 11 | search_4669_d9d04ba28a3a | 165 | 33.94 | 1.257 | 0.1890 | 24.83 | 871.69 | 371.69 | 222.3007 |  |  |
| 12 | search_16323_f685f65f1789 | 194 | 39.18 | 1.204 | 0.1405 | 23.06 | 877.12 | 377.12 | 220.9767 |  |  |
| 13 | search_7927_9705aea1873f | 294 | 30.27 | 1.106 | 0.0881 | 23.74 | 874.91 | 374.91 | 218.8439 | reliability_bonus |  |
| 14 | search_11174_fb44b767cc87 | 173 | 35.26 | 1.228 | 0.1621 | 30.04 | 865.77 | 365.77 | 218.1814 |  |  |
| 15 | search_8826_0070ec601fd4 | 385 | 25.45 | 1.033 | 0.0324 | 38.47 | 862.01 | 362.01 | 214.2566 | reliability_bonus | high_drawdown |
| 16 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 17 | search_8860_9152dd2fc1f7 | 224 | 29.46 | 1.199 | 0.1759 | 21.34 | 835.34 | 335.34 | 212.3902 | reliability_bonus |  |
| 18 | search_6775_d422db22a4f9 | 262 | 28.24 | 1.158 | 0.1394 | 36.60 | 839.41 | 339.41 | 210.3893 | reliability_bonus | high_drawdown |
| 19 | search_9810_fffd4057997e | 156 | 32.69 | 1.208 | 0.1570 | 32.12 | 841.40 | 341.40 | 208.2957 |  |  |
| 20 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |

## Top 20 By profitFactor

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_20155_b8e9245361ca | 158 | 35.44 | 1.405 | 0.2955 | 17.94 | 1045.54 | 545.54 | 287.2472 |  |  |
| 2 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |
| 3 | search_3478_4c20773d0111 | 151 | 33.77 | 1.305 | 0.2313 | 20.20 | 991.94 | 491.94 | 264.7734 |  |  |
| 4 | search_14206_9bc5b194ad3e | 89 | 61.80 | 1.269 | 0.1303 | 12.97 | 558.27 | 58.27 | 84.9734 | weak_sample |  |
| 5 | search_4669_d9d04ba28a3a | 165 | 33.94 | 1.257 | 0.1890 | 24.83 | 871.69 | 371.69 | 222.3007 |  |  |
| 6 | search_9605_bd40eea9b6d4 | 88 | 61.36 | 1.256 | 0.1206 | 13.57 | 547.94 | 47.94 | 78.3753 | weak_sample |  |
| 7 | search_7125_e921a7dae3df | 184 | 39.67 | 1.255 | 0.1759 | 17.43 | 953.06 | 453.06 | 249.3839 |  |  |
| 8 | search_12057_dde7cb4be8d7 | 168 | 34.52 | 1.238 | 0.1744 | 22.97 | 878.99 | 378.99 | 223.5676 |  |  |
| 9 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 10 | search_1156_b658db7af639 | 83 | 59.04 | 1.229 | 0.1149 | 11.58 | 545.76 | 45.76 | 75.6984 | weak_sample |  |
| 11 | search_11174_fb44b767cc87 | 173 | 35.26 | 1.228 | 0.1621 | 30.04 | 865.77 | 365.77 | 218.1814 |  |  |
| 12 | search_6528_cea3fe37262f | 244 | 33.20 | 1.225 | 0.1827 | 24.15 | 738.61 | 238.61 | 177.2756 | reliability_bonus |  |
| 13 | search_0995_3d4adc9a6a55 | 90 | 58.89 | 1.216 | 0.1044 | 10.81 | 546.25 | 46.25 | 74.9826 | weak_sample |  |
| 14 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 15 | search_10867_e562c0635fb7 | 90 | 58.89 | 1.216 | 0.1044 | 10.81 | 546.25 | 46.25 | 74.9826 | weak_sample |  |
| 16 | search_4492_e227e8f8c2fd | 87 | 58.62 | 1.211 | 0.1028 | 12.74 | 534.46 | 34.46 | 68.1616 | weak_sample |  |
| 17 | search_11484_eca6f7136c62 | 93 | 60.22 | 1.210 | 0.1017 | 14.11 | 537.16 | 37.16 | 69.9024 | weak_sample |  |
| 18 | search_13264_758625d6921c | 52 | 59.62 | 1.208 | 0.1133 | 9.88 | 540.05 | 40.05 | 72.0381 | weak_sample |  |
| 19 | search_9810_fffd4057997e | 156 | 32.69 | 1.208 | 0.1570 | 32.12 | 841.40 | 341.40 | 208.2957 |  |  |
| 20 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |

## Top 20 By expectancyR

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_20155_b8e9245361ca | 158 | 35.44 | 1.405 | 0.2955 | 17.94 | 1045.54 | 545.54 | 287.2472 |  |  |
| 2 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |
| 3 | search_3478_4c20773d0111 | 151 | 33.77 | 1.305 | 0.2313 | 20.20 | 991.94 | 491.94 | 264.7734 |  |  |
| 4 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 5 | search_4669_d9d04ba28a3a | 165 | 33.94 | 1.257 | 0.1890 | 24.83 | 871.69 | 371.69 | 222.3007 |  |  |
| 6 | search_6528_cea3fe37262f | 244 | 33.20 | 1.225 | 0.1827 | 24.15 | 738.61 | 238.61 | 177.2756 | reliability_bonus |  |
| 7 | search_7125_e921a7dae3df | 184 | 39.67 | 1.255 | 0.1759 | 17.43 | 953.06 | 453.06 | 249.3839 |  |  |
| 8 | search_8860_9152dd2fc1f7 | 224 | 29.46 | 1.199 | 0.1759 | 21.34 | 835.34 | 335.34 | 212.3902 | reliability_bonus |  |
| 9 | search_12057_dde7cb4be8d7 | 168 | 34.52 | 1.238 | 0.1744 | 22.97 | 878.99 | 378.99 | 223.5676 |  |  |
| 10 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 11 | search_10073_c5a4ebdb1c8f | 133 | 27.07 | 1.197 | 0.1685 | 20.25 | 711.54 | 211.54 | 157.2961 |  |  |
| 12 | search_9661_8b313eb1546a | 241 | 33.20 | 1.197 | 0.1642 | 18.01 | 752.39 | 252.39 | 181.0110 | reliability_bonus |  |
| 13 | search_11174_fb44b767cc87 | 173 | 35.26 | 1.228 | 0.1621 | 30.04 | 865.77 | 365.77 | 218.1814 |  |  |
| 14 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 15 | search_9810_fffd4057997e | 156 | 32.69 | 1.208 | 0.1570 | 32.12 | 841.40 | 341.40 | 208.2957 |  |  |
| 16 | search_13724_ed91daad9a76 | 225 | 28.89 | 1.170 | 0.1516 | 20.68 | 705.63 | 205.63 | 159.4689 | reliability_bonus |  |
| 17 | search_2968_6c0df11262a8 | 240 | 32.50 | 1.179 | 0.1471 | 21.39 | 635.07 | 135.07 | 128.5391 | reliability_bonus |  |
| 18 | search_4429_e49552a90222 | 149 | 29.53 | 1.180 | 0.1421 | 27.15 | 755.54 | 255.54 | 173.7794 |  |  |
| 19 | search_16303_213825e95f2f | 167 | 32.93 | 1.189 | 0.1406 | 24.20 | 814.58 | 314.58 | 197.1664 |  |  |
| 20 | search_16323_f685f65f1789 | 194 | 39.18 | 1.204 | 0.1405 | 23.06 | 877.12 | 377.12 | 220.9767 |  |  |

## Top Candidates With maxDrawdown < 40%

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |
| 2 | search_3593_d59f563da7a6 | 386 | 26.42 | 1.077 | 0.0746 | 35.18 | 1073.75 | 573.75 | 283.9763 | reliability_bonus | high_drawdown |
| 3 | search_20155_b8e9245361ca | 158 | 35.44 | 1.405 | 0.2955 | 17.94 | 1045.54 | 545.54 | 287.2472 |  |  |
| 4 | search_7221_258e2983d7ce | 398 | 26.38 | 1.062 | 0.0595 | 35.38 | 1037.34 | 537.34 | 272.3381 | reliability_bonus | high_drawdown |
| 5 | search_3478_4c20773d0111 | 151 | 33.77 | 1.305 | 0.2313 | 20.20 | 991.94 | 491.94 | 264.7734 |  |  |
| 6 | search_7125_e921a7dae3df | 184 | 39.67 | 1.255 | 0.1759 | 17.43 | 953.06 | 453.06 | 249.3839 |  |  |
| 7 | search_7933_e5ae7608ce75 | 380 | 25.53 | 1.047 | 0.0457 | 38.56 | 891.90 | 391.90 | 225.6468 | reliability_bonus | high_drawdown |
| 8 | search_8603_d1980391cd73 | 302 | 30.46 | 1.157 | 0.1348 | 18.63 | 888.60 | 388.60 | 233.6167 | reliability_bonus |  |
| 9 | search_18714_b7e49e25a244 | 395 | 25.57 | 1.032 | 0.0307 | 33.25 | 886.69 | 386.69 | 222.6222 | reliability_bonus |  |
| 10 | search_12057_dde7cb4be8d7 | 168 | 34.52 | 1.238 | 0.1744 | 22.97 | 878.99 | 378.99 | 223.5676 |  |  |
| 11 | search_16323_f685f65f1789 | 194 | 39.18 | 1.204 | 0.1405 | 23.06 | 877.12 | 377.12 | 220.9767 |  |  |
| 12 | search_7927_9705aea1873f | 294 | 30.27 | 1.106 | 0.0881 | 23.74 | 874.91 | 374.91 | 218.8439 | reliability_bonus |  |
| 13 | search_4669_d9d04ba28a3a | 165 | 33.94 | 1.257 | 0.1890 | 24.83 | 871.69 | 371.69 | 222.3007 |  |  |
| 14 | search_11174_fb44b767cc87 | 173 | 35.26 | 1.228 | 0.1621 | 30.04 | 865.77 | 365.77 | 218.1814 |  |  |
| 15 | search_8826_0070ec601fd4 | 385 | 25.45 | 1.033 | 0.0324 | 38.47 | 862.01 | 362.01 | 214.2566 | reliability_bonus | high_drawdown |
| 16 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 17 | search_9810_fffd4057997e | 156 | 32.69 | 1.208 | 0.1570 | 32.12 | 841.40 | 341.40 | 208.2957 |  |  |
| 18 | search_6775_d422db22a4f9 | 262 | 28.24 | 1.158 | 0.1394 | 36.60 | 839.41 | 339.41 | 210.3893 | reliability_bonus | high_drawdown |
| 19 | search_8860_9152dd2fc1f7 | 224 | 29.46 | 1.199 | 0.1759 | 21.34 | 835.34 | 335.34 | 212.3902 | reliability_bonus |  |
| 20 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |

## Top Candidates With maxDrawdown < 60%

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |
| 2 | search_3593_d59f563da7a6 | 386 | 26.42 | 1.077 | 0.0746 | 35.18 | 1073.75 | 573.75 | 283.9763 | reliability_bonus | high_drawdown |
| 3 | search_20155_b8e9245361ca | 158 | 35.44 | 1.405 | 0.2955 | 17.94 | 1045.54 | 545.54 | 287.2472 |  |  |
| 4 | search_7221_258e2983d7ce | 398 | 26.38 | 1.062 | 0.0595 | 35.38 | 1037.34 | 537.34 | 272.3381 | reliability_bonus | high_drawdown |
| 5 | search_3478_4c20773d0111 | 151 | 33.77 | 1.305 | 0.2313 | 20.20 | 991.94 | 491.94 | 264.7734 |  |  |
| 6 | search_7125_e921a7dae3df | 184 | 39.67 | 1.255 | 0.1759 | 17.43 | 953.06 | 453.06 | 249.3839 |  |  |
| 7 | search_7933_e5ae7608ce75 | 380 | 25.53 | 1.047 | 0.0457 | 38.56 | 891.90 | 391.90 | 225.6468 | reliability_bonus | high_drawdown |
| 8 | search_8603_d1980391cd73 | 302 | 30.46 | 1.157 | 0.1348 | 18.63 | 888.60 | 388.60 | 233.6167 | reliability_bonus |  |
| 9 | search_18714_b7e49e25a244 | 395 | 25.57 | 1.032 | 0.0307 | 33.25 | 886.69 | 386.69 | 222.6222 | reliability_bonus |  |
| 10 | search_12057_dde7cb4be8d7 | 168 | 34.52 | 1.238 | 0.1744 | 22.97 | 878.99 | 378.99 | 223.5676 |  |  |
| 11 | search_16323_f685f65f1789 | 194 | 39.18 | 1.204 | 0.1405 | 23.06 | 877.12 | 377.12 | 220.9767 |  |  |
| 12 | search_7927_9705aea1873f | 294 | 30.27 | 1.106 | 0.0881 | 23.74 | 874.91 | 374.91 | 218.8439 | reliability_bonus |  |
| 13 | search_4669_d9d04ba28a3a | 165 | 33.94 | 1.257 | 0.1890 | 24.83 | 871.69 | 371.69 | 222.3007 |  |  |
| 14 | search_11174_fb44b767cc87 | 173 | 35.26 | 1.228 | 0.1621 | 30.04 | 865.77 | 365.77 | 218.1814 |  |  |
| 15 | search_8826_0070ec601fd4 | 385 | 25.45 | 1.033 | 0.0324 | 38.47 | 862.01 | 362.01 | 214.2566 | reliability_bonus | high_drawdown |
| 16 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 17 | search_9810_fffd4057997e | 156 | 32.69 | 1.208 | 0.1570 | 32.12 | 841.40 | 341.40 | 208.2957 |  |  |
| 18 | search_6775_d422db22a4f9 | 262 | 28.24 | 1.158 | 0.1394 | 36.60 | 839.41 | 339.41 | 210.3893 | reliability_bonus | high_drawdown |
| 19 | search_8860_9152dd2fc1f7 | 224 | 29.46 | 1.199 | 0.1759 | 21.34 | 835.34 | 335.34 | 212.3902 | reliability_bonus |  |
| 20 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |

## Top Candidates With maxDrawdown < 80%

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |
| 2 | search_3593_d59f563da7a6 | 386 | 26.42 | 1.077 | 0.0746 | 35.18 | 1073.75 | 573.75 | 283.9763 | reliability_bonus | high_drawdown |
| 3 | search_20155_b8e9245361ca | 158 | 35.44 | 1.405 | 0.2955 | 17.94 | 1045.54 | 545.54 | 287.2472 |  |  |
| 4 | search_7221_258e2983d7ce | 398 | 26.38 | 1.062 | 0.0595 | 35.38 | 1037.34 | 537.34 | 272.3381 | reliability_bonus | high_drawdown |
| 5 | search_3478_4c20773d0111 | 151 | 33.77 | 1.305 | 0.2313 | 20.20 | 991.94 | 491.94 | 264.7734 |  |  |
| 6 | search_7125_e921a7dae3df | 184 | 39.67 | 1.255 | 0.1759 | 17.43 | 953.06 | 453.06 | 249.3839 |  |  |
| 7 | search_7933_e5ae7608ce75 | 380 | 25.53 | 1.047 | 0.0457 | 38.56 | 891.90 | 391.90 | 225.6468 | reliability_bonus | high_drawdown |
| 8 | search_8603_d1980391cd73 | 302 | 30.46 | 1.157 | 0.1348 | 18.63 | 888.60 | 388.60 | 233.6167 | reliability_bonus |  |
| 9 | search_18714_b7e49e25a244 | 395 | 25.57 | 1.032 | 0.0307 | 33.25 | 886.69 | 386.69 | 222.6222 | reliability_bonus |  |
| 10 | search_12057_dde7cb4be8d7 | 168 | 34.52 | 1.238 | 0.1744 | 22.97 | 878.99 | 378.99 | 223.5676 |  |  |
| 11 | search_16323_f685f65f1789 | 194 | 39.18 | 1.204 | 0.1405 | 23.06 | 877.12 | 377.12 | 220.9767 |  |  |
| 12 | search_7927_9705aea1873f | 294 | 30.27 | 1.106 | 0.0881 | 23.74 | 874.91 | 374.91 | 218.8439 | reliability_bonus |  |
| 13 | search_4669_d9d04ba28a3a | 165 | 33.94 | 1.257 | 0.1890 | 24.83 | 871.69 | 371.69 | 222.3007 |  |  |
| 14 | search_11174_fb44b767cc87 | 173 | 35.26 | 1.228 | 0.1621 | 30.04 | 865.77 | 365.77 | 218.1814 |  |  |
| 15 | search_8826_0070ec601fd4 | 385 | 25.45 | 1.033 | 0.0324 | 38.47 | 862.01 | 362.01 | 214.2566 | reliability_bonus | high_drawdown |
| 16 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 17 | search_9810_fffd4057997e | 156 | 32.69 | 1.208 | 0.1570 | 32.12 | 841.40 | 341.40 | 208.2957 |  |  |
| 18 | search_6775_d422db22a4f9 | 262 | 28.24 | 1.158 | 0.1394 | 36.60 | 839.41 | 339.41 | 210.3893 | reliability_bonus | high_drawdown |
| 19 | search_8860_9152dd2fc1f7 | 224 | 29.46 | 1.199 | 0.1759 | 21.34 | 835.34 | 335.34 | 212.3902 | reliability_bonus |  |
| 20 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |

## Top Candidates With trades >= 100

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_17764_6887c14e7e41 | 157 | 35.67 | 1.397 | 0.2834 | 29.44 | 1076.09 | 576.09 | 295.0074 |  |  |
| 2 | search_20155_b8e9245361ca | 158 | 35.44 | 1.405 | 0.2955 | 17.94 | 1045.54 | 545.54 | 287.2472 |  |  |
| 3 | search_3593_d59f563da7a6 | 386 | 26.42 | 1.077 | 0.0746 | 35.18 | 1073.75 | 573.75 | 283.9763 | reliability_bonus | high_drawdown |
| 4 | search_7221_258e2983d7ce | 398 | 26.38 | 1.062 | 0.0595 | 35.38 | 1037.34 | 537.34 | 272.3381 | reliability_bonus | high_drawdown |
| 5 | search_3478_4c20773d0111 | 151 | 33.77 | 1.305 | 0.2313 | 20.20 | 991.94 | 491.94 | 264.7734 |  |  |
| 6 | search_7125_e921a7dae3df | 184 | 39.67 | 1.255 | 0.1759 | 17.43 | 953.06 | 453.06 | 249.3839 |  |  |
| 7 | search_8603_d1980391cd73 | 302 | 30.46 | 1.157 | 0.1348 | 18.63 | 888.60 | 388.60 | 233.6167 | reliability_bonus |  |
| 8 | search_7933_e5ae7608ce75 | 380 | 25.53 | 1.047 | 0.0457 | 38.56 | 891.90 | 391.90 | 225.6468 | reliability_bonus | high_drawdown |
| 9 | search_12057_dde7cb4be8d7 | 168 | 34.52 | 1.238 | 0.1744 | 22.97 | 878.99 | 378.99 | 223.5676 |  |  |
| 10 | search_18714_b7e49e25a244 | 395 | 25.57 | 1.032 | 0.0307 | 33.25 | 886.69 | 386.69 | 222.6222 | reliability_bonus |  |
| 11 | search_4669_d9d04ba28a3a | 165 | 33.94 | 1.257 | 0.1890 | 24.83 | 871.69 | 371.69 | 222.3007 |  |  |
| 12 | search_16323_f685f65f1789 | 194 | 39.18 | 1.204 | 0.1405 | 23.06 | 877.12 | 377.12 | 220.9767 |  |  |
| 13 | search_7927_9705aea1873f | 294 | 30.27 | 1.106 | 0.0881 | 23.74 | 874.91 | 374.91 | 218.8439 | reliability_bonus |  |
| 14 | search_11174_fb44b767cc87 | 173 | 35.26 | 1.228 | 0.1621 | 30.04 | 865.77 | 365.77 | 218.1814 |  |  |
| 15 | search_8826_0070ec601fd4 | 385 | 25.45 | 1.033 | 0.0324 | 38.47 | 862.01 | 362.01 | 214.2566 | reliability_bonus | high_drawdown |
| 16 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 17 | search_8860_9152dd2fc1f7 | 224 | 29.46 | 1.199 | 0.1759 | 21.34 | 835.34 | 335.34 | 212.3902 | reliability_bonus |  |
| 18 | search_6775_d422db22a4f9 | 262 | 28.24 | 1.158 | 0.1394 | 36.60 | 839.41 | 339.41 | 210.3893 | reliability_bonus | high_drawdown |
| 19 | search_9810_fffd4057997e | 156 | 32.69 | 1.208 | 0.1570 | 32.12 | 841.40 | 341.40 | 208.2957 |  |  |
| 20 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |

## Top Candidates With trades >= 200

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_3593_d59f563da7a6 | 386 | 26.42 | 1.077 | 0.0746 | 35.18 | 1073.75 | 573.75 | 283.9763 | reliability_bonus | high_drawdown |
| 2 | search_7221_258e2983d7ce | 398 | 26.38 | 1.062 | 0.0595 | 35.38 | 1037.34 | 537.34 | 272.3381 | reliability_bonus | high_drawdown |
| 3 | search_8603_d1980391cd73 | 302 | 30.46 | 1.157 | 0.1348 | 18.63 | 888.60 | 388.60 | 233.6167 | reliability_bonus |  |
| 4 | search_7933_e5ae7608ce75 | 380 | 25.53 | 1.047 | 0.0457 | 38.56 | 891.90 | 391.90 | 225.6468 | reliability_bonus | high_drawdown |
| 5 | search_18714_b7e49e25a244 | 395 | 25.57 | 1.032 | 0.0307 | 33.25 | 886.69 | 386.69 | 222.6222 | reliability_bonus |  |
| 6 | search_7927_9705aea1873f | 294 | 30.27 | 1.106 | 0.0881 | 23.74 | 874.91 | 374.91 | 218.8439 | reliability_bonus |  |
| 7 | search_8826_0070ec601fd4 | 385 | 25.45 | 1.033 | 0.0324 | 38.47 | 862.01 | 362.01 | 214.2566 | reliability_bonus | high_drawdown |
| 8 | search_8860_9152dd2fc1f7 | 224 | 29.46 | 1.199 | 0.1759 | 21.34 | 835.34 | 335.34 | 212.3902 | reliability_bonus |  |
| 9 | search_6775_d422db22a4f9 | 262 | 28.24 | 1.158 | 0.1394 | 36.60 | 839.41 | 339.41 | 210.3893 | reliability_bonus | high_drawdown |
| 10 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 11 | search_18706_dcee45e82c24 | 347 | 34.87 | 1.036 | 0.0276 | 28.58 | 807.10 | 307.10 | 196.1818 | reliability_bonus |  |
| 12 | search_3007_40f5144d9958 | 284 | 27.82 | 1.058 | 0.0510 | 29.25 | 815.49 | 315.49 | 193.8283 | reliability_bonus |  |
| 13 | search_18926_ccfea0566873 | 320 | 31.56 | 1.067 | 0.0563 | 24.04 | 785.98 | 285.98 | 190.0620 | reliability_bonus |  |
| 14 | search_7877_fd66d967ee9c | 278 | 29.14 | 1.092 | 0.0793 | 32.75 | 783.60 | 283.60 | 184.6732 | reliability_bonus |  |
| 15 | search_5153_231072707577 | 297 | 29.63 | 1.078 | 0.0656 | 27.97 | 781.62 | 281.62 | 182.8402 | reliability_bonus |  |
| 16 | search_9661_8b313eb1546a | 241 | 33.20 | 1.197 | 0.1642 | 18.01 | 752.39 | 252.39 | 181.0110 | reliability_bonus |  |
| 17 | search_1647_9739ec9fc1e1 | 229 | 28.38 | 1.149 | 0.1324 | 24.36 | 753.58 | 253.58 | 177.4131 | reliability_bonus |  |
| 18 | search_6528_cea3fe37262f | 244 | 33.20 | 1.225 | 0.1827 | 24.15 | 738.61 | 238.61 | 177.2756 | reliability_bonus |  |
| 19 | search_9917_6fc46b51e381 | 330 | 34.24 | 0.971 | -0.0234 | 24.70 | 751.12 | 251.12 | 169.8062 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 20 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |

## High profit / high risk candidates

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_2690_92d078c31d64 | 383 | 26.11 | 0.927 | -0.0684 | 44.98 | 675.77 | 175.77 | 132.6664 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 2 | search_13292_35ba40fe94ef | 409 | 24.21 | 0.936 | -0.0632 | 45.36 | 657.46 | 157.46 | 124.5827 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 3 | search_6627_59133396ad3c | 428 | 25.70 | 0.935 | -0.0624 | 45.80 | 623.35 | 123.35 | 108.9210 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 4 | search_1505_91e63220058a | 291 | 27.15 | 0.961 | -0.0333 | 44.05 | 618.55 | 118.55 | 103.2880 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 5 | search_10861_bea20b7597fd | 207 | 32.85 | 1.047 | 0.0345 | 41.63 | 610.56 | 110.56 | 106.7455 | reliability_bonus,elevated_drawdown | high_drawdown |
| 6 | search_1451_ea4910b218eb | 377 | 25.73 | 0.918 | -0.0761 | 48.96 | 609.47 | 109.47 | 100.9245 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 7 | search_4070_78f5d089236f | 388 | 25.77 | 0.909 | -0.0851 | 45.71 | 603.61 | 103.61 | 97.2691 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 8 | search_3195_a60848de5e96 | 197 | 31.98 | 1.035 | 0.0273 | 41.90 | 603.56 | 103.56 | 96.3802 | elevated_drawdown | high_drawdown |
| 9 | search_6785_a61c3cd199f6 | 254 | 29.92 | 1.032 | 0.0272 | 42.19 | 602.35 | 102.35 | 101.2852 | reliability_bonus,elevated_drawdown | high_drawdown |
| 10 | search_3470_f7fa951a7366 | 297 | 28.28 | 1.026 | 0.0231 | 41.64 | 594.62 | 94.62 | 96.6863 | reliability_bonus,elevated_drawdown | high_drawdown |
| 11 | search_17246_c2bf76f57e1d | 280 | 27.14 | 0.937 | -0.0551 | 45.14 | 585.88 | 85.88 | 85.0991 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 12 | search_5764_ce716038e912 | 444 | 24.55 | 0.874 | -0.1279 | 41.01 | 585.32 | 85.32 | 84.3512 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 13 | search_19543_9de3527cbd04 | 189 | 29.63 | 1.081 | 0.0644 | 42.16 | 570.83 | 70.83 | 82.5600 | elevated_drawdown | high_drawdown |
| 14 | search_9805_301303c82369 | 189 | 29.63 | 1.081 | 0.0644 | 42.16 | 570.83 | 70.83 | 82.5600 | elevated_drawdown | high_drawdown |
| 15 | search_0610_9f345bb87309 | 392 | 24.74 | 0.909 | -0.0893 | 53.96 | 565.22 | 65.22 | 77.0971 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 16 | search_9689_5bd4cc0f5fb0 | 352 | 31.82 | 0.919 | -0.0670 | 42.31 | 562.99 | 62.99 | 78.9151 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 17 | search_9062_677d8453ea12 | 397 | 25.44 | 0.869 | -0.1245 | 47.56 | 561.87 | 61.87 | 72.3417 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 18 | search_8501_25bc9b3d7697 | 194 | 31.44 | 1.015 | 0.0118 | 43.21 | 560.14 | 60.14 | 72.4446 | elevated_drawdown | high_drawdown |
| 19 | search_17309_41737af2f1e8 | 292 | 28.08 | 0.932 | -0.0587 | 44.45 | 557.39 | 57.39 | 69.9911 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 20 | search_6602_bda434a180ac | 264 | 28.41 | 0.962 | -0.0339 | 40.18 | 555.11 | 55.11 | 71.0655 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |

## Top candidates with high profit but dangerous drawdown

_No rows._

## Today Backtest vs Actual Logs

Date: `2026-05-05`
Simulated accepted trades today: `3`
Actual logged trades today: `6`

Actual trades:
- 2026-05-05T09:45:12.830Z EURAUD BUY status=closed dealId=00005552-0005-511e-0000-0000804e27b6
- 2026-05-05T10:15:19.298Z GBPUSD BUY status=closed dealId=00007090-0055-311e-0000-00008118f5a1
- 2026-05-05T11:45:15.453Z EURJPY SELL status=closed dealId=00005552-0029-065e-0000-000080a75c41
- 2026-05-05T12:45:15.415Z EURJPY BUY status=closed dealId=00005552-0029-065e-0000-000080a75c5e
- 2026-05-05T14:30:19.396Z GBPUSD BUY status=closed dealId=00007090-0055-311e-0000-00008118f6da
- 2026-05-05T16:30:15.330Z EURJPY BUY status=open dealId=00005552-0029-065e-0000-000080a75ca7

Simulated trades:
- 2026-05-05T00:15:00.000Z EURJPY SHORT exit=stop_loss pnlR=-1.425
- 2026-05-05T08:45:00.000Z EURJPY LONG exit=take_profit pnlR=5.569
- 2026-05-05T09:45:00.000Z EURAUD SHORT exit=end_of_data pnlR=3.015

## Warnings

- This is a backtest/research ranking, not evidence of live profitability.
- Do not automatically apply any candidate to live config.
- Candidates with `low_sample`, `weak_sample`, `high_drawdown`, `very_high_drawdown`, or `extremely_dangerous` need manual review.
- Before LLM-layer work, fix live/replay parity and add skipped-signal diagnostics.
