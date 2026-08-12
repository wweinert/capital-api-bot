# M15 price-action / H1 portfolio research summary

Date: 2026-08-12  
Evidence status: development and inspected walk-forward evidence; not a fresh locked test.

## Fixed specification

- Data: all 17 FX symbols, six timeframes, 2026-W07 through partial W33
  (2026-02-09 through 2026-08-11).
- Signal: M15 directional impulse, one to six opposite-colour pullback
  candles, then the first directional resumption candle.
- Price structure: causal lower-high/higher-low comparison over prior M15
  context; H1 causal swing structure and optional EMA/MACD support.
- Entry: pending breakout at the executable M15 signal-candle extreme, valid
  for 60 minutes and cancelled if the stop side is breached first.
- Stop: beyond the signal candle on the executable bid/ask side plus 0.05 M15
  ATR. Fixed target: 2R.
- Runner controls: breakeven at +1R with a 3-ATR trail; fast-30-minute runner;
  or half at +2R with the remainder trailed by 3 ATR.
- Portfolio: EUR 500; five positions maximum; one per symbol; requested risk
  1%, 2%, and 3%; hard caps 3% per position and 15% total open risk; 90% of
  capital available as margin and divided into five 18% position budgets.
- Sessions: DST-aware Asia, London, London/New York overlap, New York, and
  off-hours.

The exhaustive fixed matrix evaluated all 6,192 declared candidates in 814.6
seconds after preparing 187,034 causal events.

## Walk-forward portfolio result

Profiles were selected only from W07-W19. W20-W33 was then replayed without
changing the selection.

| Portfolio | Final | Return | PF | Entries | Drawdown | Train P/L | Validation P/L | Last 14 days |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Train-selected fixed 2R, requested 1% | EUR 610.27 | +22.05% | 1.095 | 834 | 17.1% | +EUR 226.09 | -EUR 115.83 | -EUR 23.38 |
| Train-selected tuned exits, requested 1% | EUR 593.55 | +18.71% | 1.035 | 1,109 | 23.3% | +EUR 261.33 | -EUR 167.80 | -EUR 41.61 |
| Forced five profiles per session, requested 1% | EUR 381.97 | -23.61% | 0.892 | 1,762 | 48.4% | +EUR 210.91 | -EUR 328.96 | -EUR 99.27 |

The positive full-period balance is not robust: the train-selected fixed-2R
portfolio earned 114.593R in train and lost 63.664R in validation. Validation
had only 35.7% positive weeks. The tuned runner portfolio was worse, with
21.4% positive validation weeks.

At requested 3% risk the fixed-2R portfolio still reached only 1.779% maximum
actual position risk and 3.848% maximum total open risk. Its maximum margin use
was 88.316%, with 18% maximum per position. The EUR 500 account and equal
margin allocation therefore constrain position size before the 3% risk cap.

## Session and symbol conclusion

- London was the only consistently useful session in the train-selected
  fixed-2R portfolio: +46.309R across the full inspected period.
- Overlap added +14.385R, but most individually train-selected overlap cells
  failed validation.
- Asia was flat (-0.026R) and New York lost 9.742R. No off-hours profile met
  the predeclared train selection gate.
- EURGBP produced no profile profitable in both folds. Its best train-ranked
  overlap profile was already negative in train (-20.857R) and validation
  (-18.831R). The valid 10 August example therefore does not generalize to a
  continuously enabled EURGBP profile under this formalization.
- Only AUDJPY and USDJPY produced pair/session cells meeting the stricter
  post-search requirements of profit in both folds, PF at least 1.10, at least
  40 entries, and at least 50% positive weeks in each fold.

## Post-search diagnostic (not independent evidence)

After inspecting both folds, four stable-looking cells remained:

- USDJPY / London: loose M15 structure, H1 EMA+MACD, fixed 2R.
- AUDJPY / London: loose M15 structure, H1 EMA+MACD, half at 2R plus 3-ATR runner.
- AUDJPY / Asia: prominent M15 swing, half at 2R plus 3-ATR runner.
- AUDJPY / overlap: prominent M15 structure, H1 EMA+MACD, fast +1R then 3-ATR trail.

Their combined requested-1% diagnostic returned EUR 588.66 (+17.73%), PF
1.333, 328 entries, and 12.3% drawdown; train and validation gained 28.959R
and 37.377R. The final two weeks were only +EUR 0.30 with PF 1.015. This
portfolio was selected after seeing validation, lacks New York/off-hours
coverage, and exceeds the 12R drawdown gate, so it is a forward-test hypothesis
only.

## Decision

Reject all continuously enabled and forced-five portfolios for live trading.
Do not raise requested risk above 1%: the margin budget prevents meaningful
additional exposure, while higher requested risk did not improve the result.
Retain only the AUDJPY/USDJPY four-cell post-search profile for genuinely new
forward observation and broker-rule/slippage/financing stress before any human
probation decision.

Machine-readable evidence:

- `m15-price-action-h1-session-portfolio-17fx-20min-2026-08-12.json`
- `m15-price-action-h1-stable-portfolio-post-search-2026-08-12.json`
