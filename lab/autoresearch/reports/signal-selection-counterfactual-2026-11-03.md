# Signal-selection counterfactual — 2026-11-03

## Scope

- Window: 00:00–09:25 UTC.
- Frozen live strategy and recorded M1 bid/ask execution model.
- One position/order slot, 3% maximum risk, 45-minute pending expiry, 1.5R target, trailing from 1R at 0.35R.
- No live code or broker state was changed.

## Outcome if each eligible signal had been accepted alone

| Signal UTC | Outcome | Result |
| --- | --- | ---: |
| 00:00 EURUSD BUY | Filled, stop loss | -1.001R (-2.998%) |
| 00:00 USDCHF SELL | Filled, stop loss | -1.000R (-2.988%) |
| 00:00 EURJPY BUY | Filled, stop loss | -1.001R (-2.940%) |
| 01:00 AUDJPY SELL | Pending not filled | 0R |
| 02:00 USDJPY BUY | Pending not filled | 0R |
| 03:00 USDCHF SELL | Filled, trailing stop | +0.709R (+2.123%) |
| 04:00 EURUSD BUY | Pending not filled | 0R |
| 05:00 USDJPY BUY | Pending not filled | 0R |

The current selection took 00:00 EURUSD and 03:00 USDCHF, producing -0.940% in the M1 model. All three choices available at 00:00 lost approximately 1R. Four later alternatives never reached their pending entry within 45 minutes. The only profitable signal was already selected.

The hindsight-only optimum was to reject every 00:00 candidate and accept only 03:00 USDCHF: +2.123%. This is an oracle diagnostic, not a deployable rule.

## What the live selector actually does

`TradingService.processCandidates()` does not calculate candidate quality. It removes already-traded symbols and calls `slice(0, freePositions)`. `Promise.all()` preserves the active-symbol input order, so with one slot this is an implicit session-symbol-order priority.

Alternative causal ranking methods made almost no difference on this morning because every 00:00 choice lost:

| Ranking | Selected at 00:00 | Day return |
| --- | --- | ---: |
| session order (current) | EURUSD | -0.940% |
| low spread | EURUSD | -0.940% |
| composite | EURUSD | -0.940% |
| far entry / tight stop | USDCHF | -0.930% |
| body size / near entry | EURJPY | -0.882% |

## Longer-history context

The earlier frozen replay does not show that swapping the current priority for a simple ranking is clearly superior. Across its full recorded period, session order returned 77.69% with PF 1.298; near-entry returned 62.12% with PF 1.232; tight-stop returned 61.52% with PF 1.242. On the previously inspected test segment, near-entry was stronger (27.60%, PF 1.398) than session order (17.95%, PF 1.292), so the ranking question remains unstable by period.

## Conclusion

This morning does not show a wrong choice among simultaneous candidates. It shows that the third layer is not a real estimator and cannot abstain when all candidates are weak. The useful next experiment is a causal quality score with a rejection threshold, evaluated walk-forward on many days. It must compare against frozen session-order priority and must be allowed to select no trade; fitting a threshold to this single morning would be hindsight overfitting.

Raw counterfactual artifact: `current-strategy-counterfactual-2026-11-03.json`.
