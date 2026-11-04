# Scaling the H1 wave strategy without diluting expectancy

Date: 2026-11-03

## Scope and protocol

- Offline research only. No protected live-trading file was changed or executed.
- Data: M1, M5, M15 and H1 bid/ask candles through 2026-11-03 09:25 UTC.
- Portfolio: EUR 1,000 initial capital, one open/pending position, 90% margin cap, 3% absolute risk cap.
- Core: frozen strict M5+M15 wave agreement plus H1 pattern and the current linear candidate rating.
- Search: 600 bounded policies. January-May was train, June-August validation.
- September-October was excluded from selection, but it has been inspected in earlier research and is therefore diagnostic rather than a pristine holdout.
- 1-3 November is forward-like evidence only; three market days are far too short for acceptance.

## Main result

The useful scaling mechanism is a second, independently risk-budgeted daytime setup, not a broad relaxation of the strict core:

- H1 decisions and pending-order execution remain unchanged.
- Daytime addon uses M15 wave direction between 08:00 and 16:59 UTC.
- Core risk remains capped at 3%; addon risk is approximately 0.75% and never exceeds 2% in the searched policy.
- One shared portfolio selector still chooses only one position.
- The addon uses a 2-pip entry buffer, the two-candle pattern extreme for the stop plus 0.1 ATR, 60-minute expiry and 1.25R base target.

| Variant | Return | PF | Trades | Trades/day | Active-day coverage | Max DD |
|---|---:|---:|---:|---:|---:|---:|
| Frozen strict baseline | +86.98% | 1.361 | 133 | 0.512 | 43.46% | 16.24% |
| Balanced dynamic addon | +78.31% | 1.243 | 327 | 1.258 | 70.77% | 17.35% |
| Balanced global-static addon | +74.55% | 1.231 | 338 | 1.300 | 71.54% | 16.67% |
| Profit-preserving dynamic addon | +79.66% | 1.290 | 272 | 1.046 | 62.69% | 15.46% |

The balanced dynamic candidate was positive in all three historical partitions:

| Period | Return | PF | Trades/day | Coverage | Max DD |
|---|---:|---:|---:|---:|---:|
| Jan-May train | +35.35% | 1.246 | 1.240 | 72.87% | 17.35% |
| Jun-Aug validation | +16.03% | 1.276 | 1.038 | 60.76% | 9.68% |
| Sep-Oct diagnostic | +17.84% | 1.269 | 1.654 | 82.69% | 9.52% |
| Nov 1-3 forward-like | +3.89% | 2.238 | 1.333 | 66.67% | 3.00% |

## Dynamic-value ablation

Dynamic values were tested for session, pair group, ATR regime, target, pending expiry and risk. They did not provide a large, stable advantage over the same second setup with common static parameters.

- Removing ATR-regime adaptation improved the balanced full result to +79.27%.
- A completely static addon produced +74.55%, 1.30 trades/day and 71.54% coverage.
- The full dynamic version produced +78.31%, 1.26 trades/day and 70.77% coverage.
- Pair/session/ATR adjustments therefore add only about 3.8 percentage points over ten months while adding implementation and overfitting risk.

Conclusion: retain the causal features in the lab, but prefer the global-static addon for an initial implementation unless a longer untouched forward period proves that the dynamic filter is useful.

## Execution stress for the balanced dynamic candidate

| Scenario | Return | PF | Trades/day | Max DD |
|---|---:|---:|---:|---:|
| Recorded bid/ask | +78.31% | 1.243 | 1.258 | 17.35% |
| Spread x1.25 | +75.87% | 1.233 | 1.273 | 17.37% |
| Spread x1.50 | +26.85% | 1.093 | 1.304 | 17.40% |
| Slippage 0.5 pip | +55.44% | 1.178 | 1.258 | 18.00% |
| Spread x1.25 + slippage 0.5 pip | +46.17% | 1.152 | 1.273 | 18.00% |

The edge remains positive under the tested costs but is sensitive to large spread inflation. Live spread capture and rejection logging are required.

## What did not work

- Relaxing the strict wave detector across all hours produced high activity but negative expectancy.
- Expanding the universe from 8 to 17 FX pairs did not solve activity by itself.
- Static London/New York addons reached about one trade per day but degraded to approximately flat performance on September-October.
- The first high-frequency dynamic winner reached 1.68 trades/day but only +21.71% overall and PF 1.062; it was rejected in favor of the Pareto candidates above.

## Institutional interpretation

The transferable lesson from institutional platforms is architecture, not a secret indicator: common data, several independent alpha sources, centralized selection, explicit risk budgets, execution-cost measurement and continuous monitoring. The present result follows that direction by keeping the proven core and adding a separately sized signal source instead of weakening the core.

References:

- BlackRock Aladdin: https://www.blackrock.com/aladdin
- BlackRock Aladdin FAQ: https://www.blackrock.com/aladdin/about-us/about/faqs
- XTX Markets: https://www.xtxmarkets.com/
- XTX Markets careers/research infrastructure: https://www.xtxmarkets.com/careers/

## Recommendation

Do not integrate the dynamic policy yet. The next live candidate should be the simpler global-static daytime addon, run on demo in shadow mode beside the frozen core for at least two weeks. Log both accepted and rejected candidates, actual spreads, requested/filled prices, slippage, session, rating and which layer produced the signal. Promote pair/session/ATR adaptation only if the forward logs demonstrate a stable incremental benefit.

Artifacts:

- `dynamic-adaptive-search-2026-11-03.json`
- `dynamic-candidate-factorial-2026-11-03.json`
- `dynamic-balanced-factorial-2026-11-03.json`
- `session-ensemble-search-2026-11-03.json`
