# Dynamic intraday activity research — 2026-11-04

The live cleanup was committed and pushed as `c399fbd`. No trading-strategy or config changes were deployed or implemented during this study.

## Experiment

Canonical server data through 2026-11-04 07:45 UTC, eight currency pairs currently present in configured session lists, M1/M5/M15/H1 bid/ask history. M30 bars are formed only from two consecutive, complete M15 bars. Stage 1 tested 144 seeded policies; stage 2 tested 48 predetermined refinements of the highest-development-score adaptive policy. Protocols were saved before each run.

One pending/open position, EUR 1,000, maximum requested risk 3%, margin ceiling 90%. Addon risk is separately limited; 90% is a ceiling, not forced leverage. Daily flattening at 21:00 UTC, Friday at 20:00 UTC, no Friday entries after 18:00 UTC, no weekend admission. All six finalist trade logs have zero overnight positions and zero weekend entries.

Selection: January–May training and June–August validation. September–October is a previously inspected diagnostic. November is partial descriptive evidence. All periods were inspected in prior research; no result is a new untouched holdout. Both stages also replay monthly policy selection using only completed preceding three-month outcomes, with deterministic tie handling independent of later development scores.

## Results in the same execution model

Full-period results below include the partial November interval. Losing-month counts refer to the ten completed January–October months; November was positive but is not a completed monthly observation.

| Variant | Trades | Trades / eligible weekday | Return | PF | Max realized DD | Losing full months |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Frozen strict H1 core, intraday model | 137 | 0.62 | +114.51% | 1.455 | 16.56% | 3 |
| Stage-1 development winner: M15 strict wave addon | 811 | 3.69 | +105.15% | 1.180 | 21.72% | 2 |
| Stage-1 adaptive M30 finalist, fixed addon risk | 562 | 2.55 | +109.49% | 1.235 | 20.10% | 1 |
| Stage-2 development winner #5: M30, risk + prior-session gate | 461 | 2.10 | +112.24% | 1.274 | 18.07% | 2 |
| Stage-2 finalist #1: M30, adaptive risk | 562 | 2.55 | +117.71% | 1.267 | 19.29% | 1 |

The stage-2 winner by the predeclared January–August score is **#5**, not #1. #1 is a separately reported development finalist; its better full-period return is not grounds to relabel it the preselected winner after looking at the diagnostic. Neither meets the complete objective of sustained 2–3 trades per day and zero losing months.

There are 264 recorded quote dates but only 220 eligible weekdays. The older harness's `tradesPerDay` includes short Sunday quote sessions although weekend entries are forbidden. Original quote-date selection gates were preserved; the weekday-normalized rates above are descriptive. For #1, frequency was 2.60 per weekday in training and 1.95 in validation. Its mean 2.55 over the whole period does not mean 2–3 on every day. It traded on 93.64% of eligible weekdays.

## Concrete adaptive mechanism worth further testing

Keep the frozen strict H1 core for decisions through 07:59 UTC. Add a separate M30 wave setup from 08:00 through 19:59 UTC (Friday only through 17:59). It uses M15 wave direction and does not require the H1 candle-color pattern for the addon. All candidates share one portfolio slot.

- Choose the top three currently active configured symbols using closed-candle efficiency, ATR regime and spread/ATR, not future returns.
- Accept ATR inside its trailing 20th–90th percentile range; require tick activity at least half of its prior 20-bar mean; cap body at 0.75 ATR and spread at 0.25 ATR.
- Pending entry buffer is the maximum of one pip, current spread and 0.04 ATR. Stop uses the last two signal-frame candle extremes plus 0.05 ATR, with at least 0.8 ATR entry-to-stop distance. Expiry: 45 minutes.
- Target adapts from 1.5R using current H1 alignment and M30 efficiency, clamped to 1–2R. At 1R, protect break-even and step behind closed M5/M15 candles with a 0.15 ATR buffer.
- Addon risk starts at 0.75% and scales downward for poor efficiency, larger relative spread and high ATR regime. Frozen core risk remains at most 3%.
- Winner #5 additionally requires price to agree with the midpoint of the previous completed UTC session block. #1 omits that extra gate. The extra gate helped development but lost 6.19% in October, so it is not demonstrated to be a stable improvement.

For #1, August lost 5.51% despite all other completed months being positive. The RSI exhaustion guard (#9) made little difference and did not eliminate August's loss. Simply adding indicators did not solve stability.

## Costs and monthly adaptation

Under recorded spread ×1.25 plus 0.5 pip adverse entry slippage:

| Variant | Return | PF | Max realized DD | Losing full months |
| --- | ---: | ---: | ---: | ---: |
| M15 frequent addon | +21.12% | 1.043 | 27.05% | 4 |
| M30 adaptive risk + session gate #5 | +55.85% | 1.146 | 18.44% | 3 |
| M30 adaptive risk #1 | +46.31% | 1.116 | 21.16% | 3 |

The higher-activity edge is materially sensitive to execution costs. Baseline core stress was not run in this experiment, so this table does not establish cost superiority over the core.

Monthly strategy switching also failed the zero-loss-month target. Stage 1 had one losing month (August −17.70%); stage 2 had three (May −2.89%, August −5.38%, October −6.21%). Do not infer that more frequent retuning automatically improves stability.

Some adaptive RSI range policies had no losing development month, but their frequency was only approximately 0.6–1.0 trades per recorded quote date. They were not selected by the activity-oriented development score and were not promoted after reading later periods.

## Interpretation and limits

Activity can be raised substantially with a separately risk-budgeted lower-timeframe addon. Zero losing months has **not** been achieved. The candidate with the best later full return is not a proven live improvement. A useful next research question is whether several independently defined setups with bounded risk can improve stability without repeated retrospective switching; implementation should wait for a frozen policy and prospective validation.

Signals use only closed candles and trailing windows. The previous-session midpoint uses only a completed block. Tick volume is broker quote activity, not consolidated FX volume; spread is a cost/liquidity proxy, not order-book depth. No external news, exchange volume or depth data were available to this experiment.

M1 stop-first execution, requested pending fills, full-series ATR, realized-only drawdown and fixed UTC session boundaries are modeling assumptions. Tick order, outages, rejected stop updates and rolling-fetch indicator differences are not fully modeled. The explicit-null legacy-trailing defect is corrected in this experiment. Results are not directly comparable to older reports that used another management model or allowed overnight holding.

Artifacts: `dynamic-activity-study-2026-11-04.json`, `dynamic-activity-refinement-2026-11-04.json`, `dynamic-activity-summary-2026-11-04.json`, both frozen protocol documents, and `lab/dynamic-activity-study.mjs`. The runner reuses the existing `lab/h1-wave-top5-portfolio.js` loading/execution functions through a separately corrected in-memory adapter; it does not overwrite that legacy experiment.
