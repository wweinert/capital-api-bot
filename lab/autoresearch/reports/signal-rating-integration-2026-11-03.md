# Signal-rating integration — 2026-11-03

## Change

The third layer now computes a causal rating for every candidate before choosing the single available slot. It uses only information available at the H1 decision time:

- H1 body and risk distance relative to ATR;
- spread and pending-entry gap relative to ATR;
- EMA20/EMA50 alignment, price distance from EMA20, and EMA20 slope;
- six-hour directional efficiency;
- rejection wick and previous-candle body.

Candidates below the frozen minimum score are rejected. Remaining candidates are sorted by score, highest first. Invalid or incomplete rating input fails closed.

## Evidence

The chosen conservative candidate rejects the bottom 20% of development-period scores. The aggressive development winner was not integrated because it failed on September–October.

| Period | Old session order | Rated selection |
| --- | ---: | ---: |
| Jan–May | +32.91%, PF 1.316, 73 trades | +39.83%, PF 1.402, 65 trades |
| Jun–Aug | +13.31%, PF 1.275, 37 trades | +20.09%, PF 1.522, 32 trades |
| Sep–Oct diagnostic | +17.95%, PF 1.292, 43 trades | +15.11%, PF 1.283, 37 trades |
| Combined approximation | +77.69% | +93.29% |

The rating improves the development periods and reduces trade count. It remains profitable on the previously inspected September–October diagnostic, although it trails the old selector there. This is historical evidence, not a guarantee of better future results.

## Current-day counterfactual

For 2026-11-03 through 09:25 UTC, the rating would select USDCHF at 00:00 instead of EURUSD; both reached stop loss. It would still select the profitable USDCHF signal at 03:00. Modeled result changes only from -0.940% to -0.930%. The rating was not selected to repair this already observed day.

## Verification

- Native tests: 6/6 pass.
- Syntax checks pass for all changed JavaScript files.
- No broker action or server deployment was performed.

Research artifacts:

- `signal-rating-search-2026-11-03.json`
- `signal-rating-rolling-search-2026-11-03.json`
- `current-strategy-counterfactual-2026-11-03.json`
