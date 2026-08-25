# Trading Data Availability

- Historical market data for the last 6+ months is available on the server.
- Market data is available across multiple timeframes, including D1, H4, H1, M15, M5, and M1.
- Coverage includes 15+ currency pairs, such as EURUSD.
- Important: the server and attached SSD contain a large amount of historical data that is currently unstructured and inconsistent. We should identify the best/cleanest version of each dataset, remove duplicates, and establish a single clear and reliable source of truth for all market data. If some historical data is missing for any timeframe i want you 
to fetch that from the broker via API and add it to its JSONL file

## Server Access

- Server: waldemar-pi
- Password is stored in the system.

## References

- Broker strategy information: https://capital.com/en-eu/learn/trading-strategies
- Official broker API documentation: https://capital.com/en-eu/trading-platforms/api-development-guide 

## 2026-08-12 — Video-inspired session liquidity sweep is rejected

- Formalized the video's intraday sequence as DST-aware Europe/London ranges:
  Asia 00:00-07:00, Frankfurt 07:00-08:00, and entries 08:00-12:00 after a
  range-boundary sweep, close back inside, M15 displacement, one-to-six-bar
  correction, and first resumption candle. Entry is a 60-minute pending
  breakout; stop is beyond the sweep plus 0.05 M15 ATR; exits compare the
  opposite range boundary with the video's stated 1.6R scalp.
- Fixed development protocol: 17 FX pairs, EUR 500, 1% search risk, at most
  five positions, 3% position and 15% portfolio hard caps, W07-W19 train and
  W20-partial-W33 validation. All 36 declared global rules were exhausted.
  Dataset fingerprint: `491220dd44a65b0e6f4e7ff928f83bcb9eaf0a03778da11007bd6563f856a8c5`;
  evaluator SHA-256: `438db9253501ad848955cf03fc3760b556c82a0173d57cf41bfe348c97ad7301`.
- The train-selected rule was Frankfurt sweep, balanced M15 structure, H1
  swing confirmation, and fixed 1.6R. At 1% requested risk it returned +2.92%
  (EUR 514.61), PF 1.126, 93 entries, and 6.4% cash drawdown. Train made only
  EUR 3.42; validation made EUR 11.20 but only 4/14 validation weeks were
  positive. Positive active days were 47.6%/45.5%, and validation activity
  fell to 32.8% of market days.
- No individual pair passed the train-only portfolio admission rule. AUDJPY
  was positive in both folds but had only 4/13 and 4/14 positive weeks. EURUSD
  lost on train. Selection therefore produced no portfolio candidate.
- Raising requested risk to 3% did not improve the edge: return fell to +2.01%
  (EUR 510.05), cash drawdown rose to 8.0%, and train cash P/L became negative.
  Margin constraints made the relationship non-linear even though R outcomes
  were unchanged.
- TradingView publications confirm that the author manually declares a
  required liquidity sweep, a separate entry zone, and target pools. They do
  not supply a reproducible rule for choosing supply/demand, order-block, or
  volume-profile zones. FX tick volume is not centralized traded volume, so
  the video's visual volume-profile node was not silently approximated.
- Decision: reject for live trading and probation. Retain only as code and
  reproducible negative evidence. Do not loosen the validation-week/day gates,
  cherry-pick AUDJPY, or raise risk after inspecting this result. No protected
  live file or broker resource was changed or executed. Evidence:
  `lab/autoresearch/reports/session-liquidity-sweep-17fx-2026-08-12.json`.

## 2026-08-11 — EURUSD GreenRed2 profit-first candidate rejected

- Frozen candidate: `eurusd-greenred2-liquid-profit` from the 2026-08-11
  autoresearch session.
- Locked period opened once: ISO weeks 2026-W23 through 2026-W32
  (2026-06-01 through 2026-08-09), with capital reset to EUR 500.
- Locked result: EUR 456.71, -8.66%, profit factor 0.908, 55 entries,
  20.5% maximum cash drawdown, and only 4/10 positive weeks.
- Monthly locked P/L: June -EUR 69.34, July +EUR 14.90, partial August
  +EUR 11.14.
- The exact 26-week replay (2026-W07 through 2026-W32) ended at EUR 734.49
  (+46.90%), but its last 13-week fold lost EUR 37.03 and failed the
  profitability and positive-week gates. Most gains were concentrated in
  March and April.
- Decision: rejected for live trading and probation. The June-August period is
  now inspected and must never be presented as a fresh holdout for a revised
  strategy.
- Evidence: `lab/harness/reports/eurusd-greenred2-locked-and-six-month-2026-08-11.json`.

## 2026-08-11 — Daily-first 17-FX search produced no qualified candidate

- Scope: 79 deterministic candidates over all 17 complete FX symbols and all
  six timeframes, with EUR 500 starting capital, one position per symbol,
  3% maximum position risk, 15% maximum portfolio risk, and forced same-day
  closure at 22:00 UTC.
- Development protocol: W07-W19 train and W20-W32 walk-forward validation.
  Both folds are already inspected research data; no fresh holdout remains.
- Tested families: D1/H4 day-trend plus lower-timeframe entry, pure price
  action, level breakout/rejection, indicator/price-action scoring, four
  session baskets, one through six simultaneous symbols, and separate
  day-trend/scoring profiles for every pair.
- No candidate passed all gates. The best objective, `refine-76`, traded only
  EURUSD and returned +1.70% overall with PF 1.025. Train lost EUR 49.81 and
  had 45.7% positive active days; validation gained EUR 58.34 and had 53.6%
  positive active days. It failed train profitability, train week/day quality,
  PF, and validation activity gates.
- The apparent validation improvement is concentrated in June (+EUR 72.08);
  partial August lost EUR 24.16. Decision: rejected for live/probation.
- Current broker client sentiment is not historical. It must not be inserted
  into this backtest; candle-volume/direction pressure remains a labelled
  proxy only.
- Evidence: `lab/autoresearch/reports/daily-first-17fx-autoresearch-20min-2026-08-11.json`.

## 2026-08-11 — Cross-session scoring found an AUDJPY/GBPJPY overlap hypothesis

- Historical source recovered from git: commits `dd70eed` and `d818b5d` used
  score>=3 over H4/H1/M15 conditions, optionally followed by a Green-Red
  pattern. The unrestricted historical scoring control was strongly negative
  in the corrected six-month evaluator.
- New experiment: 169 candidates in 1,201.2 seconds. It tested completed-session
  continuation/reversal, score thresholds 3-5, M5/M1 Green-Red, Bollinger,
  RSI, loss circuit breakers, all 17 pairs in all four session segments, and
  one through six portfolio slots.
- Search winner `refine-164`: AUDJPY, London-to-overlap continuation, legacy
  score>=3, strong M5 Green-Red, 60-minute hold, 2.5 ATR stop, nominal 2.5R,
  3% risk, and stop after two losses for the pair/day/session.
- AUDJPY result: EUR 500 to EUR 584.98 (+17.00%), PF 1.489, 10.6% maximum cash
  drawdown, 82 entries. Train and validation were both profitable; positive
  active days were 60.0% and 64.3%. It failed validation positive weeks
  (46.2%) and daily activity (38.5%/43.1%).
- Declared post-search portfolio diagnostic added GBPJPY because it was the
  only other overlap pair positive in both folds. With identical winner rules,
  AUDJPY+GBPJPY returned +19.66%, PF 1.428, 9.3% drawdown, and 118 entries.
  Active-market-day coverage rose to 58.5%/47.7% and positive active days were
  55.3%/61.3%. It remained rejected because train positive weeks were 46.2%.
- This is development-selected evidence, not a fresh holdout. Do not implement
  in live trading before DST-aware session stress, spread/slippage/minimum-deal
  harness checks, and genuinely unseen forward data.
- Evidence: `lab/autoresearch/reports/cross-session-scoring-17fx-autoresearch-20min-2026-08-11.json`.

## 2026-08-11 — Same-day simple PA found one qualified AUDJPY/Asia candidate

- Strict hypothesis: reset direction each UTC day; do not use D1/H4 or a
  multi-indicator score. Direction is the sign of the move from today's open,
  after a 30-minute session warm-up. Entry uses one price-action trigger only.
- The fixed 20-minute run evaluated 133 candidates. It completed the identical
  M1 Green-Red matrix for all 17 symbols across Asia, London, overlap, and New
  York (68 pair/session cells), then continued through Asia/London and part of
  overlap for the single-RSI matrix. Earlier incomplete scheduling runs were
  interrupted and were not saved as evidence.
- Only `pair-AUDJPY-asia-day-GreenRedAny` passed every fixed gate. Rule: Asia
  00:00-08:00 UTC; current-day move >=0.05 ATR in trade direction; one/two-bar
  M1 counter-move followed by a directional candle; 1.5 ATR stop, 2R target,
  120-minute maximum hold; 1% risk; stop after two session losses.
- Result: EUR 500 to EUR 614.47 (+22.89%), PF 1.124, 9.5% maximum cash drawdown,
  and 408 entries. It traded on 100% of market days. Positive days were 58.5%
  in train and 52.3% in validation; both folds and 69.2%/53.8% of weeks were
  positive.
- Stability warning: train made EUR 93.51 but validation only EUR 20.99. June
  lost EUR 27.06, and the final two-week diagnostic lost EUR 6.21 with PF
  0.891. This is a development candidate, not live approval or fresh holdout.
- Full M1 Green-Red pair/session evidence explains why only one pair remains:
  every other pair/session cell failed the same gates. Do not add losing pairs
  merely to increase symbol count.
- Evidence: `lab/autoresearch/reports/same-day-simple-17fx-autoresearch-20min-2026-08-11.json`.

## 2026-08-11 — 15-minute six-timeframe Green-Red search rejected for live use

- New causal specification: evaluate only every 15 minutes; require a freshly
  closed Green-Red continuation candle on M1, M5, M15, H1, H4, or D1; place a
  pending breakout at the signal-candle extreme; put the stop beyond the
  signal candle; and keep the target fixed at 2R. Risk was 1% in the matrix,
  hard-capped at 3% per position and 15% for the portfolio, with at most five
  positions and one position per symbol.
- Fixed development search: 10,062 unique candidates (117 global rules plus
  9,945 equal pair/session diagnostics) under evaluator SHA-256
  `4b197fbf2417d3ccba2a4da0ef6f269d81e6e1187d0c07481d722010e8edd4c5`
  and dataset fingerprint
  `8c6e2db3731911af94f3f75af67657b4452676c7980aaa661edaa1381ce939f1`.
  The requested 1,200-second budget exhausted the declared search space after
  1,185.9 seconds. No global or pair/session candidate was qualified.
- Universal M1, M5, M15, H1, and H4 rules lost in both folds. The apparent D1
  winner returned +1.86% overall but lost in validation, had only 49 entries,
  and failed validation profitability, validation weeks, sample size,
  four-session coverage, and activity gates.
- A declared post-search diagnostic combined up to five development-selected
  symbols per session (Asia 5, London 5, overlap 3, New York 1, off-hours 0).
  It returned +85.69%, PF 1.343, and 10.8% maximum cash drawdown over 458
  entries, with both folds profitable, but remained rejected: New York had
  only 18 trades, so four-session coverage failed; there was no off-hours
  profile; and the last two weeks lost EUR 3.20 with PF 0.976.
- The daily activity diagnostic exceeded 100% because its fixed `weeks * 5`
  denominator does not match all UTC entry dates at the fold boundaries. This
  is a recorded evaluator defect; activity percentages from this study must
  not be used as evidence until the calendar denominator is corrected in a
  new experiment series.
- Decision: do not modify or enable the live strategy. The attractive
  session-profile portfolio is development-selected and has no fresh holdout.
  It is only a hypothesis for a corrected-calendar, DST-aware, broker-rule and
  forward-data study.
- Evidence:
  `lab/autoresearch/reports/greenred-15m-mtf-pending-17fx-autoresearch-20min-v2-2026-08-11.json`
  and
  `lab/autoresearch/reports/greenred-15m-mtf-pending-session-portfolio-diagnostic-v2-2026-08-11.json`.

## 2026-08-12 — Corrected-calendar and DST-aware Green-Red rerun remains rejected

- A new schema-10 experiment corrected the recorded active-day denominator:
  Sunday UTC FX activity is assigned to Monday's FX trading day, and fold
  activity is divided by the exact market-day keys present in each fold. It
  also replaced fixed UTC session windows with DST-aware Europe/London and
  America/New_York boundaries. The frozen evaluator SHA-256 is
  `06318b0bb7ce5c438c19c194c3940e2b063e5df18f0994cfcae7ee2c95ecdf18`;
  the dataset fingerprint remained
  `8c6e2db3731911af94f3f75af67657b4452676c7980aaa661edaa1381ce939f1`.
- The fixed 1,200-second run evaluated 7,906 unique candidates: all 117 global
  rules plus 7,789 pair/session rules. It covered every timeframe, but the
  time budget ended before the full 10,062-candidate matrix completed; the
  combined higher-and-lower confirmation mode was under-sampled. No evaluated
  global or pair/session candidate passed every fixed gate.
- The global winner was again the sparse D1 lower-timeframe price variant:
  +1.86%, PF 1.186, 49 entries. Validation lost 0.501R and only 38.5% of its
  weeks were positive. M1 and D1 produced no strict pair/session hypothesis;
  most stable cells were on M15 and H1. Price alone produced 17 strict cells,
  while EMA+RSI, EMA+MACD, and the composite produced 7, 7, and 5; indicator
  agreement helped selected pairs but was not universally superior.
- Strongest development cells included EURUSD/London M15 with higher-TF
  EMA+RSI (+24.95%, PF 1.234), AUDJPY/overlap M15 with higher-TF EMA+MACD
  (+25.36%, PF 1.461), AUDJPY/Asia M15 lower-TF price confirmation (+49.19%,
  PF 1.388), and EURUSD/overlap M5 lower-TF price confirmation (+21.32%,
  PF 1.281). These are post-search development hypotheses, not independent
  strategy approvals.
- The strict session portfolio diagnostic selected at most five pairs per
  session and used 1% risk, five maximum positions, one position per symbol,
  and a fixed 2R target. It returned +64.47%, PF 1.216, 11.717R maximum
  drawdown, and 551 entries, but had no New York candidate and only 46.2%
  positive validation weeks. A declared coverage-repair diagnostic added the
  only marginal New York cell with at least 40 entries (EURUSD H1 lower-TF
  price confirmation). It returned +81.25%, PF 1.267, and 7.212R maximum
  drawdown over 570 entries, but New York generated only 19 executed trades
  against the fixed minimum of 20; validation positive weeks remained 46.2%.
- Both diagnostics lost EUR 27.81 in the final two inspected weeks (PF 0.807),
  and partial August lost 5.55R. The corrected activity result is 100% in both
  folds, so the previous >100% result is resolved rather than hidden.
- Decision: reject for live trading and probation. Do not relax the New York
  coverage or validation-week gates after observing these results. Any next
  study should complete the combined-confirmation matrix, add broker minimum
  distance/size plus spread-slippage stress, and use genuinely unseen forward
  data. No protected live-system files were changed or executed.
- Evidence:
  `lab/autoresearch/reports/greenred-15m-mtf-pending-dst-calendar-17fx-autoresearch-20min-v3-2026-08-12.json`
  and
  `lab/autoresearch/reports/greenred-15m-mtf-pending-dst-calendar-session-portfolios-v3-2026-08-12.json`.

## 2026-08-12 — M15 Green-Red with H1 trend and +1R runner remains development-only

- Fixed specification: evaluate every 15 minutes; take a freshly closed M15
  one/two-candle Green-Red continuation only in the direction of the last
  closed H1 trend filter; place a pending breakout at the M15 signal-candle
  extreme; put the stop beyond that candle; start with a fixed 2R target; risk
  1% per position with at most five positions and one position per symbol.
- Exit controls compared fixed 2R with three M1-monitored runner policies.
  The runner activates at +1R, moves the stop to breakeven, removes the 2R
  target, and trails by 0.5 of the original risk distance. The tested gates
  were unconditional activation, reaching +1R within 30 minutes, and an M15
  signal body at least 0.5 ATR. Separate global controls also tested 15/30/60
  minute and 0.25/0.50/0.75 ATR definitions.
- H1 direction filters were price movement over two closed H1 candles at
  0/0.10/0.25/0.50 ATR, EMA alignment/slope, RSI, MACD histogram, EMA+RSI,
  EMA+MACD, and a composite score. Pair/session comparisons used price at
  0/0.25 ATR and EMA, RSI, MACD, EMA+RSI, and EMA+MACD.
- An initial schema-11 run exposed a session-boundary defect: the event was
  labelled from the closed signal candle but entry policy recomputed the
  session from the decision timestamp. That run and its diagnostic are invalid
  for session conclusions. Schema 12 now uses the event's causal session label;
  the corrected evaluator SHA-256 is
  `9ca561739827b71e29a57d753c569f4c2236454f6369b5b7d7661d048ed87234`.
- The corrected fixed search exhausted all 2,460 unique candidates in 374.4
  seconds: 80 global controls and 2,380 equal pair/session cells. The dataset
  fingerprint remained
  `8c6e2db3731911af94f3f75af67657b4452676c7980aaa661edaa1381ce939f1`.
  No global or pair/session candidate passed every platform gate; in particular
  a single-session cell necessarily fails four-session portfolio coverage.
- Only 12 pair/session cells were profitable in both train and validation.
  Under the additional diagnostic thresholds PF>=1.10, at least 40 entries,
  drawdown<=12R, and at least 50% positive weeks in both folds, only three
  remained, all AUDJPY during the London/New York overlap. The strongest was
  H1 EMA+MACD with the 0.5-ATR signal-body runner: +20.95%, PF 1.315, 123
  entries, 4.996R drawdown, train +17.045R/69.2% positive weeks, validation
  +3.238R/53.8% positive weeks. Unconditional trailing on the same filter made
  +14.86%, PF 1.247, with train +12.081R and validation +1.597R. H1 EMA with
  unconditional trailing made +12.51%, PF 1.134.
- Fixed 2R on AUDJPY/overlap EMA+MACD made +13.90% overall but validation lost
  2.880R. The runner therefore improved this exact historical entry family,
  but the gain is development-selected. The fast-1R rule produced no cell
  profitable in both folds. RSI produced no stable cell; EMA+MACD produced
  five of the 12 stable cells and two of the three stricter cells.
- AUDJPY/Asia with H1 price strength >=0.25 ATR and the body-gated runner made
  +11.83%, but PF 1.089 missed the fixed 1.10 diagnostic threshold. USDJPY in
  London made +23.25% with fixed 2R, but only 46.2% of validation weeks were
  positive. New York and off-hours produced no cell profitable in both folds.
- The strongest AUDJPY/overlap body-runner still lost EUR 21.69 in the last two
  inspected weeks (PF 0.315, 1/8 profitable trades), and partial August lost
  2R. Decision: do not enable in live trading or raise risk. Retain only as an
  AUDJPY/overlap forward-test hypothesis at 1% risk; require genuinely unseen
  data plus broker minimum-distance/size and spread-slippage stress before a
  human probation decision.
- Evidence:
  `lab/autoresearch/reports/m15-greenred-h1-trend-runner-17fx-autoresearch-20min-v5-2026-08-12.json`
  and
  `lab/autoresearch/reports/m15-greenred-h1-trend-runner-diagnostic-v5-2026-08-12.json`.

## 2026-08-12 — EURGBP 10 August screenshot audit exposes a specification mismatch

- The prior fixed research window ended at `2026-08-10T00:00:00Z`; it did not
  evaluate the user's 10 August daytime examples. The earlier last-two-week
  statement therefore described the period ending before those examples, not
  the examples themselves.
- If the stated 09:45, 11:45, and 14:30 timestamps are Europe/Berlin times,
  M1 bid/ask replay confirms all three pending-at-low trades reach fixed +2R
  when a short stop is placed at the signal candle's ask high. The existing
  one/two-pullback-candle trigger recognizes 09:45 and 11:45, but misses 14:30
  because it follows three bullish correction candles.
- The screenshot's displayed OHLC (`0.85588/0.85629/0.85576/0.85583`) instead
  exactly identifies `2026-08-09T21:45:00Z`, which is 10 August 09:45 in
  Pacific/Auckland and 9 August 23:45 in Europe/Berlin. Under that chart-clock
  interpretation, the three stated timestamps do not reproduce the claimed
  three winners: 09:45 is an abnormal 20-pip weekend-spread candle whose
  60-minute pending order does not fill, 11:45 is bullish and then stops, and
  14:30 stops. The chart timezone must therefore be made explicit before the
  production research specification is changed.
- A first permissive causal definition (one to six bullish M15 correction
  candles, bearish M15 signal, H1 EMA+MACD sell, and H1 high below the prior
  eight-hour high) also selects visually similar losing entries. It is not a
  faithful encoding of the discretionary notion of a meaningful lower high.
  Extending the runner cannot repair entries that never reach +1R.
- Tight M1 trailing at 0.5R or 1-2 signal ATR exits at the first consolidation.
  A 3-ATR trail captures materially more of the Berlin-clock examples, but
  remains historically unqualified. The next development version should test
  a causal swing-prominence/lower-high rule, a spread veto, and structural
  pending-order invalidation; retain fixed 2R as the baseline and test a
  partial fixed target plus a structurally trailed runner separately.
- Decision: the user's examples reveal real implementation mismatches, but do
  not validate EURGBP as a profitable profile. Do not change the protected
  live strategy or raise risk. Evidence:
  `lab/autoresearch/reports/eurgbp-structure-day-diagnostic-2026-08-10.json`.

## 2026-08-12 — Structural M15 price-action portfolio fails walk-forward validation

- New schema-13 development experiment formalized the user's discretionary
  sequence as a causal M15 impulse, one-to-six-candle pullback, and first
  resumption candle with lower-high/higher-low geometry. The last closed H1
  supplied causal swing structure with optional EMA/MACD support. Execution
  used a 60-minute pending breakout, executable bid/ask candle stop plus 0.05
  ATR, cancellation when the stop side was breached before entry, and
  conservative M1 SL-first replay.
- The fixed 2026-W07 through partial-W33 study used every complete six-frame
  symbol (17), EUR 500 start capital, at most five positions and one per
  symbol, 3% maximum position risk, 15% maximum portfolio risk, and 90% margin
  split into five equal 18% position budgets. DST-aware Asia, London, overlap,
  New York, and off-hours were evaluated. All 6,192 declared pair/session and
  global candidates were exhausted in 814.6 seconds after preparing 187,034
  causal events. Evaluator SHA-256:
  `41b54a7622a848f7e7a637352d2977e985307e1cbffefa406fb513ab0f9a87b7`;
  dataset fingerprint:
  `491220dd44a65b0e6f4e7ff928f83bcb9eaf0a03778da11007bd6563f856a8c5`.
- Profiles selected only on W07-W19 did not transfer. The fixed-2R portfolio
  ended at EUR 610.27 (+22.05%, PF 1.095, 834 entries, 17.1% drawdown), but
  train made EUR 226.09/114.593R while W20-W33 lost EUR 115.83/63.664R and
  only 35.7% of validation weeks were positive. Its final 14 days lost EUR
  23.38. Pair-tuned runners were worse: +18.71% overall, PF 1.035, 23.3%
  drawdown, and -103.353R validation.
- Forcing five symbols into every session returned -23.61%, PF 0.892, and
  48.4% drawdown. The evidence therefore rejects the assumption that each
  session should always contain five tradable profiles. New York and
  off-hours should remain disabled when no profile passes the fixed gate.
- At requested 3% risk, equal margin budgeting capped the fixed portfolio at
  1.779% actual position risk, 3.848% open portfolio risk, 18% position margin,
  and 88.316% total margin. Raising nominal risk did not improve its result.
- EURGBP had no cell profitable in both folds; its best train-ranked profile
  was negative in both (-20.857R train, -18.831R validation). The confirmed 10
  August examples are real winning setups but do not yet define a general
  EURGBP profile.
- Only AUDJPY and USDJPY produced cells satisfying the stricter post-search
  stability diagnostic (both folds profitable, PF>=1.10, >=40 entries, and
  >=50% positive weeks in both folds). Four cells—USDJPY/London plus AUDJPY in
  Asia, London, and overlap—returned +17.73%, PF 1.333, 328 entries, and 12.3%
  drawdown when combined at requested 1% risk. This diagnostic was selected
  after inspecting validation, lacked New York/off-hours coverage, exceeded
  the 12R drawdown gate, and had only EUR 0.30/PF 1.015 in the last 14 days.
- Decision: reject all continuously enabled, train-selected, and forced-five
  portfolios for live trading or probation. Keep only the four-cell
  AUDJPY/USDJPY portfolio as a forward-test hypothesis at requested 1% risk;
  require genuinely unseen data plus broker minimum-distance/size, slippage,
  gap, and financing stress. No protected live code or broker state was used.
- Evidence:
  `lab/autoresearch/reports/m15-price-action-h1-session-portfolio-17fx-20min-2026-08-12.json`,
  `lab/autoresearch/reports/m15-price-action-h1-stable-portfolio-post-search-2026-08-12.json`,
  and
  `lab/autoresearch/reports/m15-price-action-h1-session-portfolio-summary-2026-08-12.md`.
