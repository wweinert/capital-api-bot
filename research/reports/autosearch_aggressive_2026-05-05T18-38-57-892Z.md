# Aggressive HLLH AutoSearch Summary

Generated: `2026-05-05T18:38:57.924Z`
Mode: `aggressive`
Selected score column: `aggressive`
Results file: `research/results.tsv`
Rows analyzed: `17364`
Search summary: `research/reports/search_2026-05-05T17-42-12-773Z.json`
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
| 1 | search_13264_758625d6921c | 52 | 59.62 | 1.208 | 0.1133 | 9.88 | 540.05 | 40.05 | 10.9674 | weak_sample |  |

## New Aggressive Best

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |

## New Max-Profit Best

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | maxProfit | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 301.5680 |  |  |

## Candidate JSON Paths

- Selected best: `search_1954_0b3d96b45aed`, JSON: `not saved for this historical row`
- Aggressive best: `search_1954_0b3d96b45aed`, JSON: `not saved for this historical row`
- Max-profit best: `search_1954_0b3d96b45aed`, JSON: `not saved for this historical row`
- Best maxDD < 60%: `search_1954_0b3d96b45aed`, JSON: `not saved for this historical row`
- Best maxDD < 80%: `search_1954_0b3d96b45aed`, JSON: `not saved for this historical row`

## Config Diff Against Current config.js

Candidate JSON is not available for the selected historical row, so exact overrides cannot be shown from artifacts.


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
| 1 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 2 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 3 | search_15343_479b85af26df | 167 | 32.93 | 1.175 | 0.1308 | 28.58 | 800.13 | 300.13 | 190.8588 |  |  |
| 4 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 5 | search_1379_5d32e0c25ed5 | 169 | 32.54 | 1.149 | 0.1105 | 25.50 | 771.16 | 271.16 | 177.8493 |  |  |
| 6 | search_3488_cafdb197d4e1 | 169 | 31.36 | 1.102 | 0.0771 | 27.26 | 733.34 | 233.34 | 159.3484 |  |  |
| 7 | search_8460_edde377f7203 | 207 | 43.00 | 1.095 | 0.0614 | 14.73 | 723.09 | 223.09 | 162.3367 | reliability_bonus |  |
| 8 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 9 | search_4057_ff3880ed275f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 10 | search_5664_95d13a65a68f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 11 | search_10405_ec512bb7f644 | 219 | 32.88 | 0.978 | -0.0169 | 26.57 | 713.62 | 213.62 | 148.7348 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 12 | search_8180_ed83e3ab673a | 189 | 36.51 | 1.103 | 0.0740 | 25.00 | 713.60 | 213.60 | 152.0313 |  |  |
| 13 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 14 | search_10756_b2f21e81f99b | 204 | 27.94 | 0.929 | -0.0608 | 25.16 | 698.52 | 198.52 | 137.4717 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 15 | search_8800_8635faba0dcf | 190 | 35.79 | 1.078 | 0.0565 | 26.77 | 692.12 | 192.12 | 141.0434 |  |  |
| 16 | search_0685_2cd5625edff0 | 216 | 32.41 | 0.977 | -0.0178 | 28.36 | 686.65 | 186.65 | 137.0040 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 17 | search_2669_d74db8f75823 | 213 | 27.70 | 0.921 | -0.0671 | 25.38 | 683.75 | 183.75 | 130.4343 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 18 | search_8462_c1024951d62b | 189 | 35.45 | 1.066 | 0.0483 | 26.77 | 679.21 | 179.21 | 134.5347 |  |  |
| 19 | search_6538_0229f08d8da2 | 216 | 28.24 | 0.914 | -0.0727 | 26.44 | 678.88 | 178.88 | 127.8869 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 20 | search_2325_2b6af0e4f7c4 | 344 | 33.14 | 0.981 | -0.0155 | 24.44 | 675.31 | 175.31 | 138.3921 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |

## Top 20 By rawPnl

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 2 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 3 | search_15343_479b85af26df | 167 | 32.93 | 1.175 | 0.1308 | 28.58 | 800.13 | 300.13 | 190.8588 |  |  |
| 4 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 5 | search_1379_5d32e0c25ed5 | 169 | 32.54 | 1.149 | 0.1105 | 25.50 | 771.16 | 271.16 | 177.8493 |  |  |
| 6 | search_3488_cafdb197d4e1 | 169 | 31.36 | 1.102 | 0.0771 | 27.26 | 733.34 | 233.34 | 159.3484 |  |  |
| 7 | search_8460_edde377f7203 | 207 | 43.00 | 1.095 | 0.0614 | 14.73 | 723.09 | 223.09 | 162.3367 | reliability_bonus |  |
| 8 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 9 | search_4057_ff3880ed275f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 10 | search_5664_95d13a65a68f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 11 | search_10405_ec512bb7f644 | 219 | 32.88 | 0.978 | -0.0169 | 26.57 | 713.62 | 213.62 | 148.7348 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 12 | search_8180_ed83e3ab673a | 189 | 36.51 | 1.103 | 0.0740 | 25.00 | 713.60 | 213.60 | 152.0313 |  |  |
| 13 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 14 | search_10756_b2f21e81f99b | 204 | 27.94 | 0.929 | -0.0608 | 25.16 | 698.52 | 198.52 | 137.4717 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 15 | search_8800_8635faba0dcf | 190 | 35.79 | 1.078 | 0.0565 | 26.77 | 692.12 | 192.12 | 141.0434 |  |  |
| 16 | search_0685_2cd5625edff0 | 216 | 32.41 | 0.977 | -0.0178 | 28.36 | 686.65 | 186.65 | 137.0040 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 17 | search_2669_d74db8f75823 | 213 | 27.70 | 0.921 | -0.0671 | 25.38 | 683.75 | 183.75 | 130.4343 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 18 | search_8462_c1024951d62b | 189 | 35.45 | 1.066 | 0.0483 | 26.77 | 679.21 | 179.21 | 134.5347 |  |  |
| 19 | search_6538_0229f08d8da2 | 216 | 28.24 | 0.914 | -0.0727 | 26.44 | 678.88 | 178.88 | 127.8869 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 20 | search_2325_2b6af0e4f7c4 | 344 | 33.14 | 0.981 | -0.0155 | 24.44 | 675.31 | 175.31 | 138.3921 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |

## Top 20 By aggressiveScore

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 2 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 3 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 4 | search_15343_479b85af26df | 167 | 32.93 | 1.175 | 0.1308 | 28.58 | 800.13 | 300.13 | 190.8588 |  |  |
| 5 | search_1379_5d32e0c25ed5 | 169 | 32.54 | 1.149 | 0.1105 | 25.50 | 771.16 | 271.16 | 177.8493 |  |  |
| 6 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 7 | search_8460_edde377f7203 | 207 | 43.00 | 1.095 | 0.0614 | 14.73 | 723.09 | 223.09 | 162.3367 | reliability_bonus |  |
| 8 | search_3488_cafdb197d4e1 | 169 | 31.36 | 1.102 | 0.0771 | 27.26 | 733.34 | 233.34 | 159.3484 |  |  |
| 9 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 10 | search_4057_ff3880ed275f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 11 | search_5664_95d13a65a68f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 12 | search_8180_ed83e3ab673a | 189 | 36.51 | 1.103 | 0.0740 | 25.00 | 713.60 | 213.60 | 152.0313 |  |  |
| 13 | search_10405_ec512bb7f644 | 219 | 32.88 | 0.978 | -0.0169 | 26.57 | 713.62 | 213.62 | 148.7348 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 14 | search_1705_5e9850e50dbd | 234 | 32.05 | 1.160 | 0.1328 | 29.06 | 668.70 | 168.70 | 142.5962 | reliability_bonus |  |
| 15 | search_8800_8635faba0dcf | 190 | 35.79 | 1.078 | 0.0565 | 26.77 | 692.12 | 192.12 | 141.0434 |  |  |
| 16 | search_2325_2b6af0e4f7c4 | 344 | 33.14 | 0.981 | -0.0155 | 24.44 | 675.31 | 175.31 | 138.3921 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 17 | search_10756_b2f21e81f99b | 204 | 27.94 | 0.929 | -0.0608 | 25.16 | 698.52 | 198.52 | 137.4717 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 18 | search_0685_2cd5625edff0 | 216 | 32.41 | 0.977 | -0.0178 | 28.36 | 686.65 | 186.65 | 137.0040 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 19 | search_8462_c1024951d62b | 189 | 35.45 | 1.066 | 0.0483 | 26.77 | 679.21 | 179.21 | 134.5347 |  |  |
| 20 | search_13067_7b17fd8fe6df | 348 | 33.62 | 0.973 | -0.0219 | 36.65 | 660.78 | 160.78 | 131.3789 | reliability_bonus,profit_factor_below_1 | high_drawdown,non_positive_expectancy |

## Top 20 By profitFactor

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_14206_9bc5b194ad3e | 89 | 61.80 | 1.269 | 0.1303 | 12.97 | 558.27 | 58.27 | 84.9734 | weak_sample |  |
| 2 | search_9605_bd40eea9b6d4 | 88 | 61.36 | 1.256 | 0.1206 | 13.57 | 547.94 | 47.94 | 78.3753 | weak_sample |  |
| 3 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 4 | search_1156_b658db7af639 | 83 | 59.04 | 1.229 | 0.1149 | 11.58 | 545.76 | 45.76 | 75.6984 | weak_sample |  |
| 5 | search_0995_3d4adc9a6a55 | 90 | 58.89 | 1.216 | 0.1044 | 10.81 | 546.25 | 46.25 | 74.9826 | weak_sample |  |
| 6 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 7 | search_10867_e562c0635fb7 | 90 | 58.89 | 1.216 | 0.1044 | 10.81 | 546.25 | 46.25 | 74.9826 | weak_sample |  |
| 8 | search_4492_e227e8f8c2fd | 87 | 58.62 | 1.211 | 0.1028 | 12.74 | 534.46 | 34.46 | 68.1616 | weak_sample |  |
| 9 | search_11484_eca6f7136c62 | 93 | 60.22 | 1.210 | 0.1017 | 14.11 | 537.16 | 37.16 | 69.9024 | weak_sample |  |
| 10 | search_13264_758625d6921c | 52 | 59.62 | 1.208 | 0.1133 | 9.88 | 540.05 | 40.05 | 72.0381 | weak_sample |  |
| 11 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 12 | search_3679_f3862aae3a2e | 85 | 61.18 | 1.185 | 0.0888 | 13.12 | 535.10 | 35.10 | 67.5427 | weak_sample |  |
| 13 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 14 | search_2968_6c0df11262a8 | 240 | 32.50 | 1.179 | 0.1471 | 21.39 | 635.07 | 135.07 | 128.5391 | reliability_bonus |  |
| 15 | search_15343_479b85af26df | 167 | 32.93 | 1.175 | 0.1308 | 28.58 | 800.13 | 300.13 | 190.8588 |  |  |
| 16 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 17 | search_11920_83e257dac8cc | 94 | 59.57 | 1.164 | 0.0811 | 13.90 | 530.93 | 30.93 | 63.8866 | weak_sample |  |
| 18 | search_1705_5e9850e50dbd | 234 | 32.05 | 1.160 | 0.1328 | 29.06 | 668.70 | 168.70 | 142.5962 | reliability_bonus |  |
| 19 | search_6126_8dc2b91439c9 | 57 | 33.33 | 1.160 | 0.1334 | 11.78 | 527.88 | 27.88 | 59.9483 | weak_sample |  |
| 20 | search_11287_8ffe26a172a0 | 57 | 33.33 | 1.160 | 0.1334 | 11.78 | 527.88 | 27.88 | 59.9483 | weak_sample |  |

## Top 20 By expectancyR

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 2 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 3 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 4 | search_2968_6c0df11262a8 | 240 | 32.50 | 1.179 | 0.1471 | 21.39 | 635.07 | 135.07 | 128.5391 | reliability_bonus |  |
| 5 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 6 | search_6126_8dc2b91439c9 | 57 | 33.33 | 1.160 | 0.1334 | 11.78 | 527.88 | 27.88 | 59.9483 | weak_sample |  |
| 7 | search_11287_8ffe26a172a0 | 57 | 33.33 | 1.160 | 0.1334 | 11.78 | 527.88 | 27.88 | 59.9483 | weak_sample |  |
| 8 | search_1705_5e9850e50dbd | 234 | 32.05 | 1.160 | 0.1328 | 29.06 | 668.70 | 168.70 | 142.5962 | reliability_bonus |  |
| 9 | search_15343_479b85af26df | 167 | 32.93 | 1.175 | 0.1308 | 28.58 | 800.13 | 300.13 | 190.8588 |  |  |
| 10 | search_14206_9bc5b194ad3e | 89 | 61.80 | 1.269 | 0.1303 | 12.97 | 558.27 | 58.27 | 84.9734 | weak_sample |  |
| 11 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 12 | search_9605_bd40eea9b6d4 | 88 | 61.36 | 1.256 | 0.1206 | 13.57 | 547.94 | 47.94 | 78.3753 | weak_sample |  |
| 13 | search_1156_b658db7af639 | 83 | 59.04 | 1.229 | 0.1149 | 11.58 | 545.76 | 45.76 | 75.6984 | weak_sample |  |
| 14 | search_13264_758625d6921c | 52 | 59.62 | 1.208 | 0.1133 | 9.88 | 540.05 | 40.05 | 72.0381 | weak_sample |  |
| 15 | search_1379_5d32e0c25ed5 | 169 | 32.54 | 1.149 | 0.1105 | 25.50 | 771.16 | 271.16 | 177.8493 |  |  |
| 16 | search_2454_e1c7c3ab753c | 239 | 32.22 | 1.127 | 0.1080 | 22.35 | 635.65 | 135.65 | 125.1110 | reliability_bonus |  |
| 17 | search_0995_3d4adc9a6a55 | 90 | 58.89 | 1.216 | 0.1044 | 10.81 | 546.25 | 46.25 | 74.9826 | weak_sample |  |
| 18 | search_10867_e562c0635fb7 | 90 | 58.89 | 1.216 | 0.1044 | 10.81 | 546.25 | 46.25 | 74.9826 | weak_sample |  |
| 19 | search_4492_e227e8f8c2fd | 87 | 58.62 | 1.211 | 0.1028 | 12.74 | 534.46 | 34.46 | 68.1616 | weak_sample |  |
| 20 | search_11484_eca6f7136c62 | 93 | 60.22 | 1.210 | 0.1017 | 14.11 | 537.16 | 37.16 | 69.9024 | weak_sample |  |

## Top Candidates With maxDrawdown < 40%

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 2 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 3 | search_15343_479b85af26df | 167 | 32.93 | 1.175 | 0.1308 | 28.58 | 800.13 | 300.13 | 190.8588 |  |  |
| 4 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 5 | search_1379_5d32e0c25ed5 | 169 | 32.54 | 1.149 | 0.1105 | 25.50 | 771.16 | 271.16 | 177.8493 |  |  |
| 6 | search_3488_cafdb197d4e1 | 169 | 31.36 | 1.102 | 0.0771 | 27.26 | 733.34 | 233.34 | 159.3484 |  |  |
| 7 | search_8460_edde377f7203 | 207 | 43.00 | 1.095 | 0.0614 | 14.73 | 723.09 | 223.09 | 162.3367 | reliability_bonus |  |
| 8 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 9 | search_4057_ff3880ed275f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 10 | search_5664_95d13a65a68f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 11 | search_10405_ec512bb7f644 | 219 | 32.88 | 0.978 | -0.0169 | 26.57 | 713.62 | 213.62 | 148.7348 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 12 | search_8180_ed83e3ab673a | 189 | 36.51 | 1.103 | 0.0740 | 25.00 | 713.60 | 213.60 | 152.0313 |  |  |
| 13 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 14 | search_10756_b2f21e81f99b | 204 | 27.94 | 0.929 | -0.0608 | 25.16 | 698.52 | 198.52 | 137.4717 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 15 | search_8800_8635faba0dcf | 190 | 35.79 | 1.078 | 0.0565 | 26.77 | 692.12 | 192.12 | 141.0434 |  |  |
| 16 | search_0685_2cd5625edff0 | 216 | 32.41 | 0.977 | -0.0178 | 28.36 | 686.65 | 186.65 | 137.0040 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 17 | search_2669_d74db8f75823 | 213 | 27.70 | 0.921 | -0.0671 | 25.38 | 683.75 | 183.75 | 130.4343 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 18 | search_8462_c1024951d62b | 189 | 35.45 | 1.066 | 0.0483 | 26.77 | 679.21 | 179.21 | 134.5347 |  |  |
| 19 | search_6538_0229f08d8da2 | 216 | 28.24 | 0.914 | -0.0727 | 26.44 | 678.88 | 178.88 | 127.8869 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 20 | search_2325_2b6af0e4f7c4 | 344 | 33.14 | 0.981 | -0.0155 | 24.44 | 675.31 | 175.31 | 138.3921 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |

## Top Candidates With maxDrawdown < 60%

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 2 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 3 | search_15343_479b85af26df | 167 | 32.93 | 1.175 | 0.1308 | 28.58 | 800.13 | 300.13 | 190.8588 |  |  |
| 4 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 5 | search_1379_5d32e0c25ed5 | 169 | 32.54 | 1.149 | 0.1105 | 25.50 | 771.16 | 271.16 | 177.8493 |  |  |
| 6 | search_3488_cafdb197d4e1 | 169 | 31.36 | 1.102 | 0.0771 | 27.26 | 733.34 | 233.34 | 159.3484 |  |  |
| 7 | search_8460_edde377f7203 | 207 | 43.00 | 1.095 | 0.0614 | 14.73 | 723.09 | 223.09 | 162.3367 | reliability_bonus |  |
| 8 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 9 | search_4057_ff3880ed275f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 10 | search_5664_95d13a65a68f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 11 | search_10405_ec512bb7f644 | 219 | 32.88 | 0.978 | -0.0169 | 26.57 | 713.62 | 213.62 | 148.7348 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 12 | search_8180_ed83e3ab673a | 189 | 36.51 | 1.103 | 0.0740 | 25.00 | 713.60 | 213.60 | 152.0313 |  |  |
| 13 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 14 | search_10756_b2f21e81f99b | 204 | 27.94 | 0.929 | -0.0608 | 25.16 | 698.52 | 198.52 | 137.4717 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 15 | search_8800_8635faba0dcf | 190 | 35.79 | 1.078 | 0.0565 | 26.77 | 692.12 | 192.12 | 141.0434 |  |  |
| 16 | search_0685_2cd5625edff0 | 216 | 32.41 | 0.977 | -0.0178 | 28.36 | 686.65 | 186.65 | 137.0040 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 17 | search_2669_d74db8f75823 | 213 | 27.70 | 0.921 | -0.0671 | 25.38 | 683.75 | 183.75 | 130.4343 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 18 | search_8462_c1024951d62b | 189 | 35.45 | 1.066 | 0.0483 | 26.77 | 679.21 | 179.21 | 134.5347 |  |  |
| 19 | search_6538_0229f08d8da2 | 216 | 28.24 | 0.914 | -0.0727 | 26.44 | 678.88 | 178.88 | 127.8869 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 20 | search_2325_2b6af0e4f7c4 | 344 | 33.14 | 0.981 | -0.0155 | 24.44 | 675.31 | 175.31 | 138.3921 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |

## Top Candidates With maxDrawdown < 80%

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 2 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 3 | search_15343_479b85af26df | 167 | 32.93 | 1.175 | 0.1308 | 28.58 | 800.13 | 300.13 | 190.8588 |  |  |
| 4 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 5 | search_1379_5d32e0c25ed5 | 169 | 32.54 | 1.149 | 0.1105 | 25.50 | 771.16 | 271.16 | 177.8493 |  |  |
| 6 | search_3488_cafdb197d4e1 | 169 | 31.36 | 1.102 | 0.0771 | 27.26 | 733.34 | 233.34 | 159.3484 |  |  |
| 7 | search_8460_edde377f7203 | 207 | 43.00 | 1.095 | 0.0614 | 14.73 | 723.09 | 223.09 | 162.3367 | reliability_bonus |  |
| 8 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 9 | search_4057_ff3880ed275f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 10 | search_5664_95d13a65a68f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 11 | search_10405_ec512bb7f644 | 219 | 32.88 | 0.978 | -0.0169 | 26.57 | 713.62 | 213.62 | 148.7348 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 12 | search_8180_ed83e3ab673a | 189 | 36.51 | 1.103 | 0.0740 | 25.00 | 713.60 | 213.60 | 152.0313 |  |  |
| 13 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 14 | search_10756_b2f21e81f99b | 204 | 27.94 | 0.929 | -0.0608 | 25.16 | 698.52 | 198.52 | 137.4717 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 15 | search_8800_8635faba0dcf | 190 | 35.79 | 1.078 | 0.0565 | 26.77 | 692.12 | 192.12 | 141.0434 |  |  |
| 16 | search_0685_2cd5625edff0 | 216 | 32.41 | 0.977 | -0.0178 | 28.36 | 686.65 | 186.65 | 137.0040 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 17 | search_2669_d74db8f75823 | 213 | 27.70 | 0.921 | -0.0671 | 25.38 | 683.75 | 183.75 | 130.4343 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 18 | search_8462_c1024951d62b | 189 | 35.45 | 1.066 | 0.0483 | 26.77 | 679.21 | 179.21 | 134.5347 |  |  |
| 19 | search_6538_0229f08d8da2 | 216 | 28.24 | 0.914 | -0.0727 | 26.44 | 678.88 | 178.88 | 127.8869 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 20 | search_2325_2b6af0e4f7c4 | 344 | 33.14 | 0.981 | -0.0155 | 24.44 | 675.31 | 175.31 | 138.3921 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |

## Top Candidates With trades >= 100

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_1954_0b3d96b45aed | 190 | 38.42 | 1.180 | 0.1268 | 19.10 | 860.96 | 360.96 | 213.8240 |  |  |
| 2 | search_10766_11ca6f31d4fc | 167 | 34.13 | 1.216 | 0.1597 | 26.86 | 834.87 | 334.87 | 206.6084 |  |  |
| 3 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 4 | search_15343_479b85af26df | 167 | 32.93 | 1.175 | 0.1308 | 28.58 | 800.13 | 300.13 | 190.8588 |  |  |
| 5 | search_1379_5d32e0c25ed5 | 169 | 32.54 | 1.149 | 0.1105 | 25.50 | 771.16 | 271.16 | 177.8493 |  |  |
| 6 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 7 | search_8460_edde377f7203 | 207 | 43.00 | 1.095 | 0.0614 | 14.73 | 723.09 | 223.09 | 162.3367 | reliability_bonus |  |
| 8 | search_3488_cafdb197d4e1 | 169 | 31.36 | 1.102 | 0.0771 | 27.26 | 733.34 | 233.34 | 159.3484 |  |  |
| 9 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 10 | search_4057_ff3880ed275f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 11 | search_5664_95d13a65a68f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 12 | search_8180_ed83e3ab673a | 189 | 36.51 | 1.103 | 0.0740 | 25.00 | 713.60 | 213.60 | 152.0313 |  |  |
| 13 | search_10405_ec512bb7f644 | 219 | 32.88 | 0.978 | -0.0169 | 26.57 | 713.62 | 213.62 | 148.7348 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 14 | search_1705_5e9850e50dbd | 234 | 32.05 | 1.160 | 0.1328 | 29.06 | 668.70 | 168.70 | 142.5962 | reliability_bonus |  |
| 15 | search_8800_8635faba0dcf | 190 | 35.79 | 1.078 | 0.0565 | 26.77 | 692.12 | 192.12 | 141.0434 |  |  |
| 16 | search_2325_2b6af0e4f7c4 | 344 | 33.14 | 0.981 | -0.0155 | 24.44 | 675.31 | 175.31 | 138.3921 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 17 | search_10756_b2f21e81f99b | 204 | 27.94 | 0.929 | -0.0608 | 25.16 | 698.52 | 198.52 | 137.4717 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 18 | search_0685_2cd5625edff0 | 216 | 32.41 | 0.977 | -0.0178 | 28.36 | 686.65 | 186.65 | 137.0040 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 19 | search_8462_c1024951d62b | 189 | 35.45 | 1.066 | 0.0483 | 26.77 | 679.21 | 179.21 | 134.5347 |  |  |
| 20 | search_13067_7b17fd8fe6df | 348 | 33.62 | 0.973 | -0.0219 | 36.65 | 660.78 | 160.78 | 131.3789 | reliability_bonus,profit_factor_below_1 | high_drawdown,non_positive_expectancy |

## Top Candidates With trades >= 200

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_13006_99f52fb845a9 | 239 | 33.47 | 1.233 | 0.1910 | 18.01 | 798.76 | 298.76 | 201.5147 | reliability_bonus |  |
| 2 | search_0935_e91efdf91717 | 238 | 32.77 | 1.204 | 0.1688 | 24.25 | 721.08 | 221.08 | 168.6246 | reliability_bonus |  |
| 3 | search_8460_edde377f7203 | 207 | 43.00 | 1.095 | 0.0614 | 14.73 | 723.09 | 223.09 | 162.3367 | reliability_bonus |  |
| 4 | search_7683_c1e1f6c8246a | 246 | 32.93 | 1.168 | 0.1392 | 23.38 | 700.18 | 200.18 | 157.1568 | reliability_bonus |  |
| 5 | search_4057_ff3880ed275f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 6 | search_5664_95d13a65a68f | 209 | 35.89 | 1.044 | 0.0331 | 28.39 | 717.54 | 217.54 | 155.6302 | reliability_bonus |  |
| 7 | search_10405_ec512bb7f644 | 219 | 32.88 | 0.978 | -0.0169 | 26.57 | 713.62 | 213.62 | 148.7348 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 8 | search_1705_5e9850e50dbd | 234 | 32.05 | 1.160 | 0.1328 | 29.06 | 668.70 | 168.70 | 142.5962 | reliability_bonus |  |
| 9 | search_2325_2b6af0e4f7c4 | 344 | 33.14 | 0.981 | -0.0155 | 24.44 | 675.31 | 175.31 | 138.3921 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 10 | search_10756_b2f21e81f99b | 204 | 27.94 | 0.929 | -0.0608 | 25.16 | 698.52 | 198.52 | 137.4717 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 11 | search_0685_2cd5625edff0 | 216 | 32.41 | 0.977 | -0.0178 | 28.36 | 686.65 | 186.65 | 137.0040 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 12 | search_13067_7b17fd8fe6df | 348 | 33.62 | 0.973 | -0.0219 | 36.65 | 660.78 | 160.78 | 131.3789 | reliability_bonus,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 13 | search_3571_b3effe215ad1 | 212 | 41.51 | 1.035 | 0.0232 | 19.34 | 660.81 | 160.81 | 131.2265 | reliability_bonus |  |
| 14 | search_2669_d74db8f75823 | 213 | 27.70 | 0.921 | -0.0671 | 25.38 | 683.75 | 183.75 | 130.4343 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 15 | search_2968_6c0df11262a8 | 240 | 32.50 | 1.179 | 0.1471 | 21.39 | 635.07 | 135.07 | 128.5391 | reliability_bonus |  |
| 16 | search_11423_ee3c8eeecdb2 | 200 | 41.50 | 1.023 | 0.0157 | 17.08 | 655.98 | 155.98 | 128.2737 | reliability_bonus |  |
| 17 | search_6538_0229f08d8da2 | 216 | 28.24 | 0.914 | -0.0727 | 26.44 | 678.88 | 178.88 | 127.8869 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |
| 18 | search_2454_e1c7c3ab753c | 239 | 32.22 | 1.127 | 0.1080 | 22.35 | 635.65 | 135.65 | 125.1110 | reliability_bonus |  |
| 19 | search_4088_a3d3b219876b | 214 | 31.31 | 1.034 | 0.0263 | 31.97 | 636.86 | 136.86 | 118.2725 | reliability_bonus |  |
| 20 | search_0418_e80ad4ec456c | 220 | 31.82 | 0.938 | -0.0501 | 30.45 | 649.08 | 149.08 | 117.0924 | reliability_bonus,profit_factor_below_1 | non_positive_expectancy |

## High profit / high risk candidates

| rank | experimentId | trades | winRate | PF | expectancyR | maxDD | endCapital | rawPnl | aggressive | riskFlags | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_10861_bea20b7597fd | 207 | 32.85 | 1.047 | 0.0345 | 41.63 | 610.56 | 110.56 | 106.7455 | reliability_bonus,elevated_drawdown | high_drawdown |
| 2 | search_9689_5bd4cc0f5fb0 | 352 | 31.82 | 0.919 | -0.0670 | 42.31 | 562.99 | 62.99 | 78.9151 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 3 | search_8501_25bc9b3d7697 | 194 | 31.44 | 1.015 | 0.0118 | 43.21 | 560.14 | 60.14 | 72.4446 | elevated_drawdown | high_drawdown |
| 4 | search_15251_559763d514fb | 345 | 32.46 | 0.921 | -0.0650 | 41.80 | 549.15 | 49.15 | 71.7461 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 5 | search_2693_3d8b79962231 | 326 | 32.21 | 0.920 | -0.0637 | 41.30 | 532.17 | 32.17 | 62.3265 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 6 | search_10060_a97eb0300968 | 305 | 32.13 | 0.923 | -0.0631 | 42.83 | 526.82 | 26.82 | 59.3903 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 7 | search_0410_b19f75de3b2e | 296 | 28.04 | 0.879 | -0.1042 | 54.06 | 513.34 | 13.34 | 41.2301 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 8 | search_0339_78d26c5443f2 | 226 | 34.51 | 0.982 | -0.0130 | 40.52 | 512.77 | 12.77 | 50.2378 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 9 | search_1908_c87845dead14 | 235 | 30.64 | 0.993 | -0.0056 | 40.36 | 506.56 | 6.56 | 46.5274 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 10 | search_2652_2ab0321afda0 | 311 | 28.94 | 0.937 | -0.0543 | 45.54 | 506.22 | 6.22 | 47.6640 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |
| 11 | search_12224_41f8e4f7d0b3 | 207 | 30.92 | 0.961 | -0.0303 | 44.06 | 504.84 | 4.84 | 43.2810 | reliability_bonus,elevated_drawdown,profit_factor_below_1 | high_drawdown,non_positive_expectancy |

## Top candidates with high profit but dangerous drawdown

_No rows._

## Today Backtest vs Actual Logs

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

## Warnings

- This is a backtest/research ranking, not evidence of live profitability.
- Do not automatically apply any candidate to live config.
- Candidates with `low_sample`, `weak_sample`, `high_drawdown`, `very_high_drawdown`, or `extremely_dangerous` need manual review.
- Before LLM-layer work, fix live/replay parity and add skipped-signal diagnostics.
