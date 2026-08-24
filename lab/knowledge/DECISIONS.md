# Trading Data Availability

## 2026-08-23 — Three-per-session Green-Red coverage is not supported

- A fixed 1,800-second follow-up used the frozen 13-profile session result and
  spent 1,200 seconds searching 8,138 additional New-York M15 Green-Red
  configurations across all 17 FX symbols. The remaining 600 seconds were
  reserved for causal portfolio combinations and could run only if every
  session first contained at least three different admitted symbols.
- The expanded matrix varied optional H1 direction, session age/range and
  previous-session room, daily continuation/reversal, flexible Green-Red and
  price-action structure, M15 Bollinger/RSI/volume filters, activity and
  volatility, pending entries, candle stops, fixed targets and partial ATR
  runners. Profile admission required more than 50% wins, positive train and
  validation R, PF>=1.10 and <=12R drawdown, followed by a separate spread
  x1.25 replay with PF>=1.05 and the same profitability/stability checks.
- Two New-York symbols passed the nominal search, but only AUDUSD survived the
  declared spread stress. Its admitted profile produced 37 entries: 62.2%
  wins, +3.138R, PF 1.233 and 3.029R drawdown nominal; stress retained 62.2%
  wins, +2.566R, PF 1.188 and 3.288R drawdown. Train and validation stayed
  positive in both runs, but activity was only 0.26 entries/day.
- Final distinct-symbol coverage was Asia 4, London 5, overlap 3 and New York
  1. The coverage gate therefore failed, the reserved portfolio search was
  not executed, and no best portfolio was selected. The generated manifest is
  explicitly `no-qualified-portfolio` with `winner: null`; no weak pair was
  inserted merely to satisfy the three-pair quota.
- Decision: reject the claim that the current search supports three active
  pairs in every session. Keep AUDUSD New York as a research candidate only;
  do not integrate this manifest into live trading. A later attempt must
  change a predeclared hypothesis or add independent data, then repeat the
  complete admission and portfolio gates. No live file or broker state was
  changed.
- Evidence:
  `lab/autoresearch/reports/session-balanced-greenred-portfolio-30min-2026-08-23.json`
  and `lab/pair-profiles/session-greenred-balanced-portfolio.json`. Evaluator
  SHA-256:
  `ce5a6d9d6147605e9d34e9573fdd56233f6e942f8d1ba52415313ec4a30751db`;
  dataset fingerprint:
  `cc9ffbc65c2beaa3a0abef541a6fe78aad7642f0266d51e32462551a8be04fa6`.

## 2026-08-23 — Session Green-Red search finds 13 profiles, but the naive capped portfolio loses cash

- A fixed 1,800-second offline search evaluated 11,647 unique M15 flexible
  Green-Red profiles across 17 FX symbols and four DST-aware sessions (68
  pair/session cells). The selection period was 2025-W52 through 2026-W30;
  W31-W34 was excluded for the later portfolio diagnostic, although it has
  already been inspected in earlier studies and is not a fresh holdout.
- Each cell searched optional closed-H1 price direction, the M15
  Bollinger/RSI/volume score, ATR rank, efficiency, activity, body and volume
  filters, signal-wick pending entries, candle stops, fixed exits and partial
  ATR runners. Admission required more than 50% entry win rate, positive train
  and validation R, PF>=1.10, stable weeks and <=12R drawdown; leaders were
  then frozen and replayed at spread x1.25 with a separate fixed stress gate.
- Thirteen profiles survived both nominal and spread stress: Asia AUDUSD,
  EURUSD, GBPAUD and AUDJPY; London EURUSD, EURJPY, GBPUSD, AUDJPY and AUDUSD;
  overlap AUDUSD, GBPUSD and USDCAD; New York AUDUSD. Every retained profile
  remained above 50% entry win rate and positive R in both replays. Five
  profiles is a per-session ceiling, not a quota; no failing symbol was added.
- A chronological diagnostic combined all retained profiles with at most five
  open positions, two entries per session and three entries per day. It
  achieved the requested activity (2.87 entries/day, 100% active days) and
  retained 54.5% nominal / 53.2% stressed win rates over 402 entries, but it
  was not profitable in cash: -0.59% nominal and -4.06% at spread x1.25.
  Nominal PF was 1.088 with 12.472R drawdown; stressed train was -0.053R and
  drawdown expanded to 17.542R.
- Decision: retain the 13 pair/session profiles as development candidates, but
  reject the naive all-profile portfolio. The next main backtest must evaluate
  causal portfolio ranking, signal competition, currency concentration and
  margin-weighted cash expectancy on the excluded W31-W34 diagnostic before
  any live integration. Do not claim that win rate above 50% alone guarantees
  portfolio profitability. No live file or broker state was changed.
- Evidence:
  `lab/autoresearch/reports/session-greenred-17fx-30min-2026-08-23.json` and
  `lab/pair-profiles/session-greenred-portfolio.json`. Evaluator SHA-256:
  `ce5a6d9d6147605e9d34e9573fdd56233f6e942f8d1ba52415313ec4a30751db`;
  dataset fingerprint:
  `cc9ffbc65c2beaa3a0abef541a6fe78aad7642f0266d51e32462551a8be04fa6`.

## 2026-08-17 — Five-pair portfolio improves nominal return, but EURAUD fails execution-cost admission

- Replayed EURUSD, GBPJPY, GBPUSD, the selected AUDJPY Asia hypothesis and
  the selected EURAUD Sydney hypothesis as one chronological portfolio from
  EUR 500. EURJPY was loaded only for causal JPY-to-EUR conversion. The main
  architecture kept the original 90% margin budget and three reusable 30%
  slots, with at most one open or pending position per symbol. The evaluator
  SHA-256 was
  `a1a89f5f34240202ff55bb9f70d1d2dafd60bf86feb0cfa6af962b2d46070bc1`;
  the six-symbol dataset fingerprint was
  `8efa3fe793acdbb7b64df18198d5a5325320e141b5b0c0a3491a420759d76f48`.
- The existing three-pair baseline reproduced EUR 850.67 final balance,
  +70.13%, PF 1.428, 429 entries and 7.9% cash drawdown. Adding AUDJPY at 1%
  requested risk while reusing the same three slots reproduced EUR 907.90,
  +81.58%, PF 1.373, 580 entries and 9.6% drawdown.
- Adding EURAUD at 1% requested risk and a 240-minute hold produced the best
  nominal five-pair result: EUR 921.62, +84.32%, PF 1.344, 670 entries, 51.0%
  wins, 100% active market days and 8.8% cash/7.144R drawdown. Train returned
  +60.035R/EUR 257.26 and validation +48.802R/EUR 164.31; 11/13 and 9/13
  weeks were positive. EURAUD contributed only EUR 13.41 from 90 trades while
  AUDJPY contributed EUR 68.47 from 153.
- The 240-minute EURAUD rule beat its 480-minute version (+84.32% versus
  +83.53%). Raising only EURAUD requested risk from 1% to 3% added just EUR
  2.44 (+84.81%) because margin constrained the cross, so the extra nominal
  risk is not justified. Giving all five symbols five fixed 18% slots diluted
  the system to +57.46%, despite lower 6.1% cash drawdown; allowed symbols and
  simultaneous margin slots must remain separate concepts.
- At spread x1.25 the five-pair/three-slot portfolio remained profitable at
  +74.64%, PF 1.281 and 11.684R drawdown, but EURAUD itself lost EUR 2.89.
  Combining spread x1.25 with 0.02R entry and stop slippage returned +63.86%,
  PF 1.220 and 15.237R/9.9% drawdown. The portfolio remained profitable in
  both folds, but failed the fixed 12R drawdown gate; EURAUD lost EUR 13.84.
- A same-stream control under the combined execution stress isolated the
  admission effect. The existing three pairs returned +56.33%, PF 1.300 and
  11.903R drawdown, passing every applicable gate. Four pairs with AUDJPY
  returned +66.57%, PF 1.268 and 15.702R drawdown. Five pairs with EURAUD
  returned +63.86%, PF 1.220 and 15.237R drawdown. EURAUD therefore reduced
  stressed portfolio return by 2.71 percentage points/EUR 13.56 relative to
  the otherwise identical four-pair portfolio; its nominal diversification
  benefit did not survive conservative execution costs.
- Every portfolio still failed four-session coverage because there is no
  New-York-only strategy. Decision: do not add EURAUD to protected demo/live
  code from this evidence. Retain the five-pair, three-reusable-slot result as
  a nominal research diagnostic, keep EURAUD in cost-aware research, and use
  the current three-pair portfolio as the only tested configuration that also
  stays inside the 12R gate under combined spread/slippage stress. AUDJPY
  remains a separate aggressive demo-forward hypothesis, not a fully admitted
  component. Evidence:
  `lab/autoresearch/reports/five-profile-three-reusable-slots-portfolio-2026-08-17.json`.

## 2026-08-17 — EURAUD is the Sydney research candidate, but the found edge is cost-fragile

- A fixed 1,200-second cross-pair Sydney search evaluated 8,228 unique
  candidates across AUDUSD, AUDCAD, NZDUSD, NZDJPY and EURAUD. The session
  windows were evaluated in `Australia/Sydney` local time so Australian DST
  shifts were causal rather than approximated by one fixed UTC range. EURUSD,
  USDCAD and EURJPY were loaded only where required for quote-to-EUR
  conversion. The evaluator SHA-256 was
  `a1a89f5f34240202ff55bb9f70d1d2dafd60bf86feb0cfa6af962b2d46070bc1`;
  the eight-symbol dataset fingerprint was
  `2da570e8a892b5c3b68060789f7f37e5f226329ca50169931c65b0dedf61ff22`.
- The declared matrix compared all six signal timeframes; Green-Red controls;
  independent and combined engulfing, pin-bar, inside-break, outside-bar,
  momentum, breakout, structural/discretionary price action, EMA, Bollinger,
  RSI and MACD signals; no-filter through six-timeframe context; eight Sydney
  local-time windows; 60-480 minute holds; fixed/ATR stops, runners and 1%/3%
  requested risk.
- The formal objective winner was NZDUSD H4 engulfing in the 08:00-11:00
  Sydney window. It returned +5.97% with four wins, but had only four entries
  in 26 weeks, 3.1% active days and no trades in the final inspected 14 days.
  It failed sample-size, weekly-stability and daily-activity gates and was
  rejected as sparse selection noise.
- EURAUD was the only one of 8,228 candidates to pass every applicable
  single-session gate. The rule combined an M15 20-bar breakout or momentum
  trigger from 11:00-17:00 Sydney local time with closed H1 MACD direction,
  a pending signal break, signal-candle stop plus 0.05 ATR, breakeven at +1R,
  a 0.5R runner and a 480-minute maximum hold. At 1% requested risk it made
  +5.83%/EUR 29.16, PF 1.145, 90 entries, 53.3% wins, 61.5% active market
  days and 5.871R/7.2% drawdown. Train made +3.521R from 46 entries and
  validation +2.450R from 44; their positive-week rates were 53.8% and 61.5%.
- Raising requested risk to 3% produced only +7.05% because cross-pair margin
  constrained sizing, while cash drawdown rose to 15.9%. A shorter 240-minute
  hold retained the applicable gates at +5.52%, PF 1.142 and 7.0% drawdown;
  60, 120 and 180 minutes each lost money in validation.
- Execution stress invalidated readiness. Spread x1.25 reduced the 1% result
  to +1.00%, PF 1.029 and made train -1.054R. Entry and stop slippage of 0.02R
  reduced it to +1.76%/PF 1.046. Combining both produced -3.16%, PF 0.930 and
  12.123R drawdown; at 3% requested risk the same stressed signals lost 8.36%
  with 22.7% cash drawdown.
- Decision: choose EURAUD over AUDUSD, AUDCAD, NZDUSD and NZDJPY as the next
  Sydney-session research/forward-observation pair, but do not implement this
  configuration in protected demo/live code. Its nominal edge is too small
  relative to execution costs, the full period has losing April and June,
  and all evidence is from an already-inspected development window. The next
  search should optimize under spread/slippage stress from the start and then
  require genuinely unseen weeks plus broker minimum-size, stop-distance,
  financing and gap checks. Evidence:
  `lab/autoresearch/reports/sydney-five-pair-multi-pattern-20min-2026-08-17.json`
  and
  `lab/autoresearch/reports/euraud-sydney-post-search-stress-2026-08-17.json`.

## 2026-08-17 — AUDJPY Asia improves a three-slot portfolio, but misses spread drawdown gate

- A fixed 1,200-second AUDJPY-only Asia/Tokyo search evaluated 39,289 unique
  candidates on the already-inspected W07-W32 development snapshot. EURJPY
  was loaded only for causal JPY-to-EUR conversion. The evaluator SHA-256 was
  `a1a89f5f34240202ff55bb9f70d1d2dafd60bf86feb0cfa6af962b2d46070bc1`;
  the two-symbol dataset fingerprint was
  `34a72a48884e0f00f6a6b49e8c34cd9caba0e2db1c97fc7822244e807d0d6817`.
- The declared matrix compared all six signal timeframes; Green-Red controls;
  independent engulfing, pin-bar, inside-break, outside-bar, momentum,
  breakout and structural/discretionary price action; EMA, Bollinger, RSI and
  MACD triggers; explicit multi-trigger combinations; no-filter through
  six-timeframe context; full Asia, Tokyo sub-windows and pre-open windows;
  60-480 minute holds; fixed and ATR stops; runners; and requested 1%/3% risk.
- The formal objective winner was an indicator-free M15 impulse/pullback/
  resumption pattern during 00:00-03:00 UTC, signal-candle stop, 1.25R target,
  120-minute maximum hold and 1% risk. It returned +21.59%, PF 1.252, 191
  entries and 8.9% cash drawdown, with positive train and validation. It is
  rejected as the selected hypothesis: the final inspected 14 days lost EUR
  22.95/PF 0.563, August lost EUR 20.18, and spread x1.25 reduced validation
  positive weeks to 46.2%.
- The strongest post-search profit/stability alternative was an M15 20-bar
  breakout during Asia in the direction of closed H1 RSI, a pending breakout,
  signal-candle stop plus 0.05 ATR, breakeven after +1R and a 0.5R runner. At
  requested 3% risk and 480 minutes it returned +45.23%, PF 1.268, 151 entries
  and 8.9% drawdown. Entry/stop slippage at 0.02R remained +39.76%/+39.40%;
  spread x1.25 remained +40.54%. A user-aligned 240-minute hold retained every
  applicable single-pair gate at +41.43%, PF 1.244 and 7.9% drawdown. This
  shorter hold was selected after inspecting development and is not
  independent evidence.
- Giving four symbols four fixed 22.5% margin slots did not beat the current
  three-profile system: AUDJPY at 1% returned +68.21% and at 3% returned
  +67.04%, versus +70.13% for the existing three 30% slots. The correct
  diversification diagnostic reused three 30% slots across four allowed
  symbols because AUDJPY trades earlier than the London profiles. It returned
  +81.58% at AUDJPY 1% risk and +80.95% at 3%, with 580 entries; AUDJPY added
  153 Asia trades and EUR 68.20 at 1%. Maximum margin remained 88.214% and
  maximum aggregate open risk 3.724%.
- The three-reusable-slot portfolio at spread x1.25 stayed profitable at
  +74.27%/PF 1.321, but its 12.082R drawdown narrowly exceeded the fixed 12R
  gate. Four-session coverage also remained false because the system still
  has no New York-only profile. Daily activity stayed 99.2%; AUDJPY adds Asia
  coverage rather than more active calendar days.
- Decision: do not weaken the drawdown gate or automatically change protected
  live/demo code. Retain the 240-minute AUDJPY breakout/H1-RSI runner as a
  development-selected forward-test hypothesis. If the human explicitly
  approves demo probation despite the failed spread gate, prefer 1% AUDJPY
  risk and four allowed symbols sharing three reusable slots; it made more
  development cash than 3% while preserving the existing 90%/three-slot risk
  architecture. Require new, genuinely unseen data and broker minimum-size,
  minimum-distance, gap and financing checks before any live-money decision.
  Evidence: `lab/autoresearch/reports/audjpy-asia-multi-pattern-20min-2026-08-17.json`
  and `lab/autoresearch/reports/four-profile-audjpy-asia-portfolio-diagnostic-2026-08-17.json`.

## 2026-08-14 — Three pair-specific profiles are jointly profitable in development

- Replayed EURUSD, GBPJPY and GBPUSD as one chronological portfolio from EUR
  500. The portfolio reserves 90% of available capital for margin, divides it
  into three equal 30% slots, permits at most three simultaneous positions and
  at most one position per traded symbol. EURJPY was loaded only for causal
  GBPJPY quote-currency conversion and produced no trades.
- The exact frozen pair rules were: EURUSD London close-confirmed range break
  at 1% requested risk; GBPJPY strong London M15 structural continuation with
  H1-or-H4 price direction at 3%; and GBPUSD London/overlap M15 EMA(9/21)
  cross at 3%. All use pending signal breakouts, same-day flat, no more than
  three entries per pair/day and a 30-minute cooldown.
- Fixed development protocol: W07-W19 train and W20-W32 validation, historical
  bid/ask, closed-candle decisions and conservative SL-first M1 replay. The
  four-symbol/six-timeframe dataset fingerprint was
  `50daba025ff58cb2a82c5926a1c3249b9dd2c1813f0a3e6bc5a181aa45e023f4`;
  evaluator SHA-256 was
  `a1a89f5f34240202ff55bb9f70d1d2dafd60bf86feb0cfa6af962b2d46070bc1`.
- Nominal result: EUR 850.67 final balance, +EUR 350.67/+70.13%, PF 1.428,
  7.9% cash drawdown and 429 trades. Train made EUR 195.69 and validation EUR
  154.99; 9/13 and 10/13 weeks were positive. The system traded on 129 of 130
  market days, averaging 3.30 trades/day, with 49.0% total win rate. Every
  calendar month in the evaluated window was profitable.
- Pair attribution remained positive for all three traded profiles: EURUSD
  +EUR 125.53 from 120 trades (52.5% wins), GBPJPY +EUR 65.50 from 176 trades
  (40.9%), and GBPUSD +EUR 159.64 from 133 trades (56.4%). London contributed
  EUR 297.13 and overlap EUR 53.54.
- Sizing constraints were respected: maximum requested/realized position risk
  was 2.966%, aggregate open risk 3.724%, one-position margin 30.000%, and
  aggregate margin 88.214%. Aggregate margin above 60% confirms that all three
  slots were exercised concurrently; the evaluator independently rejects a
  second open or pending position for an already occupied symbol.
- Without retuning, spread x1.25 stayed positive at EUR 806.79 final balance,
  +61.36%, PF 1.342, 8.0% cash drawdown and 424 trades. Both folds remained
  profitable and every applicable profitability, drawdown, risk, sample and
  activity gate passed.
- The generic platform status is still `rejected` solely because the inherited
  four-session coverage gate is false: these intentionally session-specific
  rules trade only London and the London/New York overlap. This gate mismatch
  does not erase the result, but it must not be silently reclassified as a
  fully qualified platform candidate.
- Decision: retain as a joint forward-test hypothesis, not evidence of a live
  edge. All three component profiles and this combination were selected on the
  already-inspected development period. Require genuinely unseen weeks plus
  broker minimum-size/stop-distance, slippage, gap, financing and correlated
  GBP exposure checks before a human live decision. Evidence:
  `lab/autoresearch/reports/three-profile-eurusd-gbpjpy-gbpusd-90margin-2026-08-14.json`
  and
  `lab/autoresearch/reports/three-profile-eurusd-gbpjpy-gbpusd-spread-x125-2026-08-14.json`.

### Fourth-slot diagnostic

- Merely reserving a fourth equal slot reduces every margin ceiling from 30%
  to 22.5%. With no fourth strategy, the same three profiles fell from
  +70.13% to +57.58%; cash drawdown improved from 7.9% to 6.6%. The fourth
  profile therefore needs to add more than EUR 62.77 over this development
  period merely to restore the original three-slot cash profit.
- The best already-documented diversification hypothesis was tested without
  enabling it live: AUDJPY overlap M15 Green-Red with closed H1 EMA+MACD
  direction, a signal-body runner and 1% requested risk. The four-profile
  diagnostic returned +64.84%, PF 1.387, 6.6% drawdown and 547 entries.
  AUDJPY contributed EUR 35.61, so it recovered part but not all of the slot
  dilution; the three-profile system still made more cash at +70.13%.
- Decision: keep the live allowlist at three symbols. AUDJPY is the preferred
  next research/forward-test candidate because it removes additional GBP
  concentration and has the strongest existing cross-session evidence, but
  do not enable it from this diagnostic: its isolated overlap hypothesis lost
  all seven trades in the last two inspected weeks. Evidence:
  `lab/autoresearch/reports/three-profile-reserved-fourth-slot-2026-08-14.json`
  and
  `lab/autoresearch/reports/four-profile-audjpy-diagnostic-2026-08-14.json`.
- A fixed three-slot one-for-one replacement matrix confirmed that the current
  EURUSD/GBPJPY/GBPUSD set remains the cash-return leader at +70.13%, PF 1.428
  and 7.9% drawdown. Replacing GBPJPY with AUDJPY was the only competitive
  alternative: +66.49%, PF 1.421, 6.8% drawdown, 52.0% win rate and positive
  cash in both folds. It also retained +58.72%, PF 1.342 and 7.5% drawdown at
  spread x1.25. Replacing GBPUSD fell to +46.91%/11.4% drawdown; replacing
  EURUSD fell to +54.52% and lost money in the final inspected 14 days.
- Recommendation remains unchanged for maximum development profit: keep the
  current three. For a deliberately smoother, less GBP-concentrated demo
  forward test, EURUSD/GBPUSD/AUDJPY is defensible, but it is a lower-return
  risk trade-off rather than a historically better system. Evidence:
  `lab/autoresearch/reports/three-slot-audjpy-replacement-matrix-2026-08-14.json`
  and
  `lab/autoresearch/reports/eurusd-gbpusd-audjpy-spread-x125-2026-08-14.json`.

## 2026-08-14 — GBPUSD M15 EMA cross is a short-hold forward-test hypothesis

- A fixed 1,200-second GBPUSD-only intraday search evaluated 13,183 of
  248,672 deterministically shuffled candidates on the already-inspected
  W07-W32 development snapshot. The final in-flight evaluation and runtime
  accounting brought recorded search time to 1,310.3 seconds. EURUSD was
  loaded only for causal USD-to-EUR conversion. The frozen evaluator SHA-256
  was `a1a89f5f34240202ff55bb9f70d1d2dafd60bf86feb0cfa6af962b2d46070bc1`;
  the two-symbol dataset fingerprint was
  `05306ab227f01ba063e3cd5001eccc0f1b6a5fbc2f905d7446d20273a90c5cf3`.
- The declared matrix covered all six signal timeframes; independent
  engulfing, pin-bar, inside-break, outside-bar, momentum, breakout,
  structural/discretionary continuation and London close-break price action;
  EMA, Bollinger, RSI and MACD triggers; 36,480 explicit PA+PA,
  PA+indicator and Green-Red+indicator intersections; no-filter through
  six-timeframe context; eight session modes; 60-480 minute holds, fixed and
  ATR stops, runners, and requested 1%/3% risk.
- No candidate passed every platform gate because a single-pair/session rule
  cannot satisfy the inherited four-session portfolio-coverage gate. Five
  candidates passed every applicable single-pair gate and were profitable in
  cash and R in both folds. No explicit multi-trigger intersection reached
  that strict set.
- The formal objective winner was an H1 MACD cross with H1 RSI direction,
  all-session entry, fixed 1.5R, 120-minute hold and requested 3% risk. It made
  +15.71%, PF 1.201, 98 entries and 4.702R drawdown, but only 50.0% of train
  active days were profitable versus the fixed 52% gate. It is rejected as
  the selected hypothesis.
- The user-aligned profit-per-time frontier is materially simpler: a freshly
  closed M15 EMA(9/21) cross during the DST-aware London or London/New York
  overlap session; no additional direction filter; 60-minute pending breakout
  at the signal-candle extreme; signal-candle stop plus 0.05 M15 ATR; fixed
  1.25R target; 180-minute maximum hold; daily flat and at most three entries.
  At requested 1% risk it returned +30.40%/EUR 151.98, PF 1.544, 56.4% win
  rate, 133 entries and 2.752R/5.7% cash drawdown. Train/validation cash P/L
  was EUR 73.42/EUR 78.54, positive weeks were 84.6%/76.9%, activity was
  70.8%/76.9%, and positive active days were 67.4%/62.0%.
- Declared post-search diagnostics remained positive at spread x1.25
  (+20.19%, PF 1.340), 0.02R entry slippage (+24.80%, PF 1.429), and 0.02R
  stop slippage (+29.29%, PF 1.514). A 120-minute hold still passed every
  applicable single-pair gate at +18.28% and PF 1.348; combining 1R with that
  shorter hold failed train positive-week and positive-day gates. London alone
  made +22.56%/PF 1.739 but had only 76 entries; overlap alone was weaker.
- Requested 3% risk on the selected 180-minute rule produced +68.07% with
  10.9% cash drawdown, but used 89.99% of available margin and made May
  negative. Treat this as an aggressive leverage diagnostic, not evidence
  that the signal edge tripled. The highest strict profit candidate made
  +36.41% at 3% risk but used an eight-hour Green-Red runner and had only
  53.8% positive weeks in each fold, so it does not meet the short-hold goal as
  well as the M15 EMA-cross rule.
- Decision: no live implementation. Freeze the 1% M15 EMA-cross rule and its
  separately labelled 3% diagnostic as development-selected forward-test
  hypotheses. Require genuinely unseen weeks plus broker minimum-distance and
  size checks, gap/financing stress, and nominal/spread-x1.25 parallel evidence
  before human probation review. Evidence:
  `lab/autoresearch/reports/gbpusd-intraday-multi-pattern-20min-2026-08-14.json`.

## 2026-08-14 — GBPJPY broad multi-pattern search selects a forward-test hypothesis

- A fixed 1,200-second GBPJPY-only intraday search evaluated 15,518 of
  67,040 deterministically shuffled candidates on the already-inspected
  W07-W32 development snapshot. EURJPY was loaded only for causal JPY-to-EUR
  conversion. The frozen evaluator SHA-256 was
  `a1a89f5f34240202ff55bb9f70d1d2dafd60bf86feb0cfa6af962b2d46070bc1`;
  the two-symbol dataset fingerprint was
  `666c44c4fcc0af5d5f680c450ca1c3eee01c74765fd030e4be7fd58161df5df8`.
- The declared matrix went materially beyond Green-Red. It covered all six
  candle timeframes; engulfing, pin bar, inside break, outside bar, momentum,
  20-bar breakout, structural impulse/pullback/resumption, discretionary
  impulse/swing, and London close-break price action; EMA cross/reclaim,
  Bollinger re-entry, RSI reversal, and MACD cross; zero/one/multiple
  timeframe filters; previous-session/day context; eight session modes;
  fixed and ATR stops, runners, 1.25R-2.5R targets, and 1%/3% risk. The
  baseline M15 Green-Red control lost 38.64%, with PF 0.702 and 57.472R
  drawdown.
- The formal objective winner was a strong M15 structural continuation in the
  DST-aware London session, H1 price direction at least 0.25 ATR, signal-candle
  stop plus 0.05 M15 ATR, 1.25R target, 180-minute hold, and 1% risk. It made
  +19.36%/EUR 96.79, PF 1.311, 146 entries and 4.432R/6.8% drawdown. Train and
  validation made EUR 61.40 and EUR 35.41; both had 61.5% positive weeks.
  Activity was 80.0%/83.1% and positive active days 63.5%/53.7%. It passed
  every fixed gate except the inherited four-session portfolio gate.
- The profit frontier retained the same strong M15 structural pattern and
  London session but accepted H1-or-H4 causal price direction, used a fixed 2R
  target and 480-minute hold. At requested 1% risk it made +31.58%/EUR 157.90,
  PF 1.330, 176 entries, 40.9% win rate and 8.487R/11.5% cash drawdown. Train
  and validation made EUR 101.30 and EUR 56.59; both had 53.8% positive weeks.
  Activity was 92.3%/96.9% and positive active days 55.0%/54.0%. Only seven
  searched candidates passed every single-pair gate, had positive cash P/L in
  both folds, and failed solely the inapplicable four-session gate.
- Declared post-search diagnostics stayed profitable at spread x1.25
  (+25.29%, PF 1.264), 0.02R entry slippage (+25.33%, PF 1.261), and 0.02R stop
  slippage (+29.50%, PF 1.304). Spread x1.25 missed the train positive-day
  gate. A 1.5R target made +18.18% and retained all single-pair gates; 2.5R
  failed drawdown and positive-day gates. A 600-minute hold failed validation
  positive weeks.
- The 3% risk diagnostic made +40.10% but reached 22.2% cash drawdown, used
  essentially 90% of margin, and lost EUR 1.64 in the final 14 days. Even at
  requested 1% the single-position sizing used about 90% margin because
  GBPJPY is a 20:1 cross and the evaluator gives one position the full margin
  budget. March and July were negative; much of the profit came from April
  and June. The final 14 days were only +EUR 1.63/PF 1.037.
- Decision: no live implementation. Freeze the 1% profit-frontier rule as a
  development-selected forward-test hypothesis. Require genuinely unseen
  weeks, lower-margin sizing, broker minimum-distance/size checks, gap and
  financing stress, and nominal/spread-x1.25 parallel evidence before human
  probation review. Evidence:
  `lab/autoresearch/reports/gbpjpy-intraday-multi-pattern-20min-2026-08-14.json`.

## 2026-08-14 — EURUSD London close-confirmed range breakout is forward-test only

- A fixed 1,200-second EURUSD-only intraday search evaluated 28,476 of
  54,144 declared candidates on the already-inspected W07-W32 snapshot. It
  compared M15 Green-Red, structural price action, previous-session context,
  DST-aware sessions, zero to two indicator families, 1-3 trades/day, fixed
  targets, ATR/candle stops, and 1%/3% requested risk. All positions were
  forced flat on the entry day. No fixed-platform candidate qualified because
  every single-session rule necessarily fails the inherited four-session
  portfolio gate.
- The formal objective winner is rejected even as a single-pair hypothesis:
  at 3% requested risk its train fold was -EUR 60.10 in cash despite positive
  summed R, PF was 1.054, drawdown was 14.879R, validation positive weeks were
  46.2%, and its last 14 days lost EUR 66.91. This exposes a mismatch between
  R-based profitability gates/objective and cash P/L under margin-constrained
  sizing; do not use the formal winner as a profit claim.
- The user-aligned frontier is a simple, indicator-free London rule: build the
  Europe/London 07:00-08:00 range; between 08:00 and 12:00 require a closed M15
  candle to cross the boundary after the previous M15 close was inside; place
  a 60-minute pending breakout at the signal candle extreme; stop beyond the
  opposite range boundary plus 0.05 M15 ATR; fixed 2R target; maximum 480-minute
  hold and same-day flat.
- At requested 1% risk it returned +25.37% (EUR 626.83), PF 1.494, 52.5% win
  rate, 120 entries, 3.566R/4.1% maximum drawdown, +EUR 44.75 train and
  +EUR 82.07 validation. Positive weeks were 61.5%/53.8%; activity was
  90.8%/83.1% of market days and positive active days were 54.2%/57.4%.
  Every fixed gate except four-session coverage passed.
- Declared post-search stress remained positive at spread x1.25 (+25.03%, PF
  1.504), 0.05R entry-slippage proxy (+24.07%, PF 1.471), 0.02R stop slippage
  (+24.40%, PF 1.466), and 1.5R target (+16.99%, PF 1.337). A 2.5R target
  failed validation positive weeks, a 360-minute hold failed train positive
  weeks, and a 720-minute hold failed train positive-day quality.
- The prior 17-FX opening-range study is not contradictory at pair level: its
  portfolio lost overall, but the EURUSD slice of the London close-break rule
  was already +11.682R/EUR 30.80 over 67 retained entries. The isolated study
  retains 120 EURUSD entries without other pairs competing for five slots.
- Requested 3% risk produced +75.27% with 12.0% cash drawdown but used 90% of
  available margin. It is a leverage diagnostic, not a recommendation. The
  selected forward hypothesis remains 1% risk.
- Decision: no live implementation. This rule was selected after 28,476 tests
  on fully inspected development data and has no fresh holdout. Freeze it for
  8-12 genuinely unseen weeks with nominal and spread-x1.25 parallel evidence,
  plus broker minimum-distance/size, gap, slippage, financing, and point-in-time
  news checks before a human probation decision. Evidence:
  `lab/autoresearch/reports/eurusd-intraday-single-pair-20min-2026-08-14.json`
  and
  `lab/autoresearch/reports/eurusd-london-close-break-selected-2026-08-14.json`.

## 2026-08-13 — Deep Research strategy comparison leaves only forward-test hypotheses

- Replayed the Deep Research candidates independently of live signal and trade
  management on the local read-only 17-FX W07-W32 snapshot, EUR 500 start,
  historical bid/ask, closed-candle/next-M1 execution, 1% risk and fixed
  train/validation folds. No server, broker, live file or PM2 process was
  changed or executed.
- The new frozen evaluator reproduced AUDJPY Asia M1 day-pullback as +20.46%,
  PF 1.110, 406 entries and 10.9% cash drawdown. The archive says +22.89% and
  408 entries under evaluator SHA `548f6227...`, whose exact uncommitted source
  is absent from Git. Keep the results separate; the archive is not an exact
  rerun.
- Candidate A is cost-fragile: spread x1.25 returned -5.98%, 0.05R entry
  slippage returned -11.82%, and 0.05R stop slippage made validation flat to
  negative. Across 48 parameter perturbations only 16 were positive in both
  folds; median PF was 1.039 and median validation was -6.108R.
- AUDJPY overlap M15/H1 EMA+MACD body-runner returned +19.06%, PF 1.303,
  118 entries and 6.0% cash drawdown; validation was +3.005R. It retained
  positive validation at spread x1.25 and 0.02R entry slippage, but not at
  0.05R entry slippage or spread x2. Its last two weeks were seven losses from
  seven trades. It is the best forward-test hypothesis, not a live candidate.
- A 0.25-M15-ATR round-number room filter modestly improved A's validation;
  a 1-ATR previous-session room filter led aggregate return but failed the
  validation positive-week gate. Both are inspected post-hoc hypotheses.
- Literal GMT and DST-aware London 07:00 opening ranges, close-confirmed
  breakout, ATR-stop variants, and all Tokyo/ECB/London post-fix retail
  reversal variants failed. The best opening-range aggregate had only PF
  1.026 with 25.8% cash drawdown. Every fix variant lost money.
- A point-in-time historical news calendar was unavailable, so no news filter
  was fabricated. Decision: no live implementation. Freeze B, A, and A plus
  0.25-ATR round room for 8-12 genuinely unseen weeks with broker-rule and
  nominal/x1.25 spread parallel evidence before any demo probation review.
- Evidence:
  `lab/autoresearch/reports/deep-research-strategy-comparison-2026-08-13.json`,
  `lab/autoresearch/reports/deep-research-overlap-stress-2026-08-13.json`, and
  `lab/autoresearch/reports/deep-research-strategy-comparison-2026-08-13.md`.

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
