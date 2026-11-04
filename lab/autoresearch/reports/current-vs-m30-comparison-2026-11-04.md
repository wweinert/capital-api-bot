# Current strategy vs M30 adaptive-risk finalist

Frozen comparison, no optimization. Data: January 1–November 4, 2026, 07:45 UTC; partial November; 220 eligible weekdays. Initial capital EUR 1,000, one pending/open slot, requested risk cap 3%, margin cap 90%. Same corrected M1 bid/ask simulator and broker-rule snapshot for all variants.

The current live config disables daily forced closing and permits holding up to 24 hours, with Friday protection. The prior activity study compared its intraday adaptation, not the literal deployed daily-close setting. Both are shown here to isolate that difference.

| Metric | Current configured rules | Same core, flat 21:00 UTC | Core + M30 adaptive risk |
| --- | ---: | ---: | ---: |
| Modeled return | +110.06% | +114.51% | +117.71% |
| Final balance | EUR 2,100.55 | EUR 2,145.11 | EUR 2,177.13 |
| Filled trades | 137 | 137 | 562 |
| Trades / eligible weekday | 0.62 | 0.62 | 2.55 |
| Eligible weekdays with a trade exit | 52.73% | 53.64% | 93.64% |
| Win rate | 57.66% | 57.66% | 48.93% |
| Profit factor | 1.435 | 1.455 | 1.267 |
| Maximum realized drawdown | 16.56% | 16.56% | 19.29% |
| Losing completed months | 3 | 3 | 1 |
| Worst completed month | −0.59% | −0.96% | −5.51% |
| Longest losing-trade streak | 6 | 6 | 9 |
| Mean holding minutes | 255.54 | 251.23 | 189.19 |
| Positions held across UTC midnight | 2 | 0 | 0 |

The M30 model retains the 137 core trades and adds 425 addon trades. The additional modeled end balance is EUR 76.58 versus current rules, but only EUR 32.02 versus the same core with matched daily closing. More activity does not translate into a proportionate increase in return.

## Equal execution-cost stress

Recorded spread ×1.25 plus 0.5 pip adverse entry slippage:

| Metric | Current rules | Core flat 21:00 | M30 adaptive |
| --- | ---: | ---: | ---: |
| Return | +76.82% | +79.81% | +46.31% |
| Profit factor | 1.305 | 1.319 | 1.116 |
| Max realized drawdown | 17.33% | 17.33% | 21.16% |
| Losing full months | 4 | 4 | 3 |

The added lower-timeframe turnover is substantially more sensitive to costs. This comparison does not establish that M30 is a stronger strategy than the current core.

## Mechanics

Current core: H1 candle-color reversal, strict M5+M15 agreement, H1 EMA direction, small H1 body, decisions through 07:59 UTC; frozen candidate rating; requested risk at most 3%; target 2.5R and candle-step protection after 1R.

Finalist: retains the core and adds M30 decisions during 08:00–19:59 UTC, Friday before 18:00, with M15 wave direction. The addon does not require the H1 candle-color pattern. It ranks the top three active configured pairs using trailing efficiency, ATR regime and spread/ATR. It filters trailing ATR percentiles, relative tick volume, body/ATR and spread/ATR; adapts entry buffer and target; starts addon risk at 0.75% and reduces it for unfavorable efficiency, spread and volatility. It shares the same single slot. Daily closing is enforced at 21:00, Friday 20:00. No RSI exhaustion or previous-session midpoint gate is enabled in this particular finalist.

## Monthly returns, percent of each month's starting balance

| Completed month | Current rules | M30 adaptive |
| --- | ---: | ---: |
| January | −0.59% | +8.42% |
| February | +6.23% | +4.16% |
| March | +25.26% | +21.31% |
| April | +2.68% | +1.96% |
| May | −0.02% | +4.70% |
| June | +18.30% | +18.14% |
| July | +5.45% | +7.83% |
| August | −0.26% | −5.51% |
| September | +16.72% | +15.33% |
| October | +1.92% | +3.81% |

Conclusion: the finalist solves average activity much better, but has a weaker per-trade profit factor, deeper drawdown and worst month, and worse cost-stressed return. It should not replace the current strategy solely to meet a trade-count target. A frozen shadow/paper comparison is a more defensible next step than immediate replacement.

These are previously inspected historical simulations, not actual account returns or a fresh holdout. The finalist was one of several development finalists, not the original top-scoring policy. Partial November is included in total returns, excluded from completed-month counts. M1 stop-first ordering, full-series ATR, simplified fills and unrealized-only final boundary marking differ from tick-level broker execution. Drawdown is measured from realized exits, not all floating equity. Overnight financing for the current rules' two overnight positions is not modeled. Raw artifact: `current-vs-m30-2026-11-04.json`.
