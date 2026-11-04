# Stage 2 protocol — frozen before the refinement run

The first experiment tested 144 policies. This second experiment takes the highest-development-score **adaptive** policy using only January–August scores, not the diagnostic/full returns. Test 48 predetermined combinations: optional H1-direction agreement (none / >=0 / >=0.5 ATR), RSI exhaustion guard (on/off), previous completed session midpoint alignment (on/off), relative tick-volume floor (0.5/1), and causal downward risk scaling (on/off).

The prior-session midpoint uses only H1 candles from the last completed UTC block (00–08 / 08–13 / 13–21 / 21–24). It is a price-context proxy, not evidence of order-book liquidity. Risk scaling can only reduce the seed addon risk using current efficiency, spread and ATR regime. The existing core rules remain frozen.

Reuse the predeclared training, validation, diagnostic and monthly walk-forward rules and the same cost stress. Do not select parameters with September–October or November results. All history remains previously inspected development evidence; stage 2 is not a new holdout. Preserve the stage-1 report.

The reported `tradesPerDay` denominator in the original harness counts every recorded EURUSD quote date, including short Sunday sessions, although weekend entries are disabled. Preserve that conservative admission gate in both experiments and additionally publish weekday-normalized activity for clarity; do not quietly change candidate selection gates after results.
