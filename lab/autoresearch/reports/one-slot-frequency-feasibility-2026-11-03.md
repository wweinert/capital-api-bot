# One-slot frequency feasibility — 2026-11-03

## Target

- One simultaneous working order or position.
- At least 1.5 portfolio trades per market day as the minimum step toward 2–3 trades/day.
- Positive return, profit factor above 1, and at least 50% positive active days separately in January–May and June–August.
- September–October excluded from selection and used only as an already-inspected diagnostic.

## Result

No tested variant passed both frequency and quality. The current strict rated setup remains the only robustly profitable member of this comparison, but its frequency is far below the target.

| Setup | Trades/day | Return | PF | Win rate |
| --- | ---: | ---: | ---: | ---: |
| Strict M5+M15, 00–07, rated | 0.52 | +93.33% | 1.385 | 58.21% |
| Strict M5+M15, all hours | 1.27 | -48.32% | 0.871 | 46.06% |
| M15, all hours | 1.45 | -60.91% | 0.859 | 44.83% |
| Fresh M15, all hours | 1.69 | -69.64% | 0.813 | 43.51% |

The earlier two-slot session-adaptive study reached 1.85 trades/day and 58.42% full-period win rate, but had PF 1.032, 41.88% drawdown, and lost 38.17% in September–October. It is not suitable for deployment.

## Conclusion

The evaluator cannot create trade frequency; it can only reject or rank candidates emitted by the first two layers. Reaching 2–3 trades/day by relaxing the current wave detector or trading it around the clock destroys expectancy in the available history.

The safe research direction is to keep the profitable strict reversal setup and add a separately defined, independently validated intraday setup for London/New York. Its candidates can use the same third-layer portfolio rating. The additional setup must pass rolling and late-period checks before any live integration.

Raw artifact: `one-slot-rated-frequency-2026-11-03.json`.
