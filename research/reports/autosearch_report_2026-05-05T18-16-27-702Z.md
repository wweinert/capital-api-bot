# HLLH AutoSearch Report

Generated: `2026-05-05T18:16:27.702Z`
Results file: `research/results.tsv`
Search summary: `research/reports/search_2026-05-05T17-42-12-773Z.json`

## Exact commands

```bash
npm run research:update-data
npm run research:baseline
npm run research:search -- --minutes=30
npm run research:report
```

## Baseline vs Best

| rank | experimentId | trades | winRate | profitFactor | expectancyR | maxDrawdownPct | endCapital | score | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | baseline: baseline_live_config_60fb97fcf225 | 948 | 46.73 | 0.54 | -0.3236 | 89.83 | 53.90 | -214.5981 | high_drawdown,non_positive_expectancy |
| 2 | best: search_13264_758625d6921c | 52 | 59.62 | 1.21 | 0.1133 | 9.88 | 540.05 | 10.9674 |  |

## Top 10 Accepted Variants

| rank | experimentId | trades | winRate | profitFactor | expectancyR | maxDrawdownPct | endCapital | score | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_13264_758625d6921c | 52 | 59.62 | 1.21 | 0.1133 | 9.88 | 540.05 | 10.9674 |  |
| 2 | search_0995_3d4adc9a6a55 | 90 | 58.89 | 1.22 | 0.1044 | 10.81 | 546.25 | 8.3129 |  |
| 3 | search_10867_e562c0635fb7 | 90 | 58.89 | 1.22 | 0.1044 | 10.81 | 546.25 | 8.3129 |  |
| 4 | search_1156_b658db7af639 | 83 | 59.04 | 1.23 | 0.1149 | 11.58 | 545.76 | 7.1715 |  |
| 5 | search_14206_9bc5b194ad3e | 89 | 61.80 | 1.27 | 0.1303 | 12.97 | 558.27 | 5.8684 |  |
| 6 | search_9605_bd40eea9b6d4 | 88 | 61.36 | 1.26 | 0.1206 | 13.57 | 547.94 | 3.5867 |  |
| 7 | search_4492_e227e8f8c2fd | 87 | 58.62 | 1.21 | 0.1028 | 12.74 | 534.46 | 3.2788 |  |
| 8 | search_3679_f3862aae3a2e | 85 | 61.18 | 1.19 | 0.0888 | 13.12 | 535.10 | 1.6140 |  |
| 9 | search_6126_8dc2b91439c9 | 57 | 33.33 | 1.16 | 0.1334 | 11.78 | 527.88 | 0.5346 |  |
| 10 | search_11287_8ffe26a172a0 | 57 | 33.33 | 1.16 | 0.1334 | 11.78 | 527.88 | 0.5346 |  |

## Top 10 Overall Variants

| rank | experimentId | trades | winRate | profitFactor | expectancyR | maxDrawdownPct | endCapital | score | rejectionReason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | search_13264_758625d6921c | 52 | 59.62 | 1.21 | 0.1133 | 9.88 | 540.05 | 10.9674 |  |
| 2 | search_0995_3d4adc9a6a55 | 90 | 58.89 | 1.22 | 0.1044 | 10.81 | 546.25 | 8.3129 |  |
| 3 | search_10867_e562c0635fb7 | 90 | 58.89 | 1.22 | 0.1044 | 10.81 | 546.25 | 8.3129 |  |
| 4 | search_1156_b658db7af639 | 83 | 59.04 | 1.23 | 0.1149 | 11.58 | 545.76 | 7.1715 |  |
| 5 | search_14206_9bc5b194ad3e | 89 | 61.80 | 1.27 | 0.1303 | 12.97 | 558.27 | 5.8684 |  |
| 6 | search_9605_bd40eea9b6d4 | 88 | 61.36 | 1.26 | 0.1206 | 13.57 | 547.94 | 3.5867 |  |
| 7 | search_4492_e227e8f8c2fd | 87 | 58.62 | 1.21 | 0.1028 | 12.74 | 534.46 | 3.2788 |  |
| 8 | search_3679_f3862aae3a2e | 85 | 61.18 | 1.19 | 0.0888 | 13.12 | 535.10 | 1.6140 |  |
| 9 | search_6126_8dc2b91439c9 | 57 | 33.33 | 1.16 | 0.1334 | 11.78 | 527.88 | 0.5346 |  |
| 10 | search_11287_8ffe26a172a0 | 57 | 33.33 | 1.16 | 0.1334 | 11.78 | 527.88 | 0.5346 |  |

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

- Do not merge the best candidate blindly into `config.js`.
- The score is a research metric, not a live trading approval.
- Today's sample is too small for optimization; use it only as live parity diagnostics.
- Missing metrics: true broker fill slippage, full swap/financing, rejected order causes, and live replay mismatch penalty are not fully modeled yet.
- Review symbol concentration and low-trade-count candidates manually even when the score is high.
