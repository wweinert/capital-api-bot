# Trading autoresearch

Offline Capital FX strategy research. No broker sessions or live-code changes.

## Fixed-2R M15 swing continuation — 2026-09-11

The corrected `--swing-continuation` protocol keeps the user's structural
rules fixed: five session-ranked pairs, STOP entry one or two instrument price
steps beyond the fully closed M15 signal candle, candle-tail stop and an
unchangeable 2R target. Break-even and trailing exits are excluded. The search
may vary confirmed-pivot width, RSI, Bollinger room/breakout, volume, closed H1
context, order expiry, maximum hold, slots and session-handoff flattening.

The 600.002-second local run used a read-only snapshot of the server's 17 FX
datasets and evaluated 25,084 unique configurations. Search used
2026-01-01..2026-06-01, validation used June and July plus 1.25x spread, and
August through 4 September was opened only after the candidate was frozen.
That last range was inspected by older studies, so it remains a chronological
diagnostic rather than a virgin holdout.

The selected rule uses pivot width 4 and directional structure (higher highs
for BUY, lower lows for SELL), one price-step entry buffer, two price steps
beyond the tail, minimum stop 0.25 ATR, 15-minute pending expiry and 120-minute
maximum hold. It requires spread <=0.25 ATR, body >=0.2 of the candle and
>=0.15 ATR, activity >=1, ATR percentile 0.3-0.9, RSI 30-45 for BUY or 55-65
for SELL, and either 1 ATR of Bollinger room or a directional breakout. H1,
volume and session-handoff flattening were not selected. One slot at 0.5%
nominal risk won development selection.

| Period | Return | Trades | Win | PF | DD |
|---|---:|---:|---:|---:|---:|
| Train | +35.43% | 208 | 54.81% | 1.7351 | 3.49% |
| Validation | +1.23% | 79 | 48.10% | 1.0638 | 4.46% |
| Validation spread x1.25 | +0.26% | 75 | 49.33% | 1.0146 | 5.74% |
| Frozen diagnostic | **-4.13%** | 34 | 32.35% | 0.5733 | 5.65% |
| Diagnostic spread x1.25 | **-7.63%** | 30 | 20.00% | 0.2687 | 7.70% |
| Continuous, contaminated | +31.43% | 321 | 50.78% | 1.3586 | 9.31% |

The exact frozen replay reproduced every split and the dataset/source
fingerprints remained unchanged. A Kronos plan found 1,589 unique closed H1
contexts for 1,717 qualifying core signals. Inference was intentionally not
run: the deterministic core already failed the diagnostic, so renting compute
or selecting a larger model would add another overfitting layer. The lab CLI
now accepts `--kronos-model mini|small|base` for a future comparison after new
forward data exists. Decision: reject for live use and retain only as a frozen
shadow hypothesis. Full concise record:
`reports/m15-swing-continuation-fixed-2r-10min-2026-09-11.json`.

## M15 swing-continuation + Kronos — 2026-09-10

`--swing-continuation` implements one universal, profile-free rule for all 17
FX pairs: a fully closed M15 Green/Red continuation candle after at least one
opposite/non-directional candle, confirmed higher highs for BUY and lower lows
for SELL, a stop entry 1-2 price steps beyond the signal candle, and a candle
tail stop. The search also covers confirmed H1 direction, RSI, Bollinger room
or breakout, volume, session-ranked pools, 1-5 slots, fixed/trailing exits and
session handoff. M5 is used only during search execution; frozen results are
replayed on M1 bid/ask data with stop-first ambiguity, 90% margin and causal
cash settlement.

The EUR 500 run used 2026-01-01..2026-06-01 for search, 2026-06-01..2026-08-01
for validation and 2026-08-01..2026-09-04 for the post-freeze diagnostic. It
evaluated 7,140 unique configurations in 600.025 search seconds. Dataset and
source fingerprints were unchanged after the run.

The frozen core used pivot width 4, asymmetric `side` direction, required the
same confirmed H1 swing, selected the top 10 pairs per session, used no RSI,
Bollinger or volume filter, entered two price steps beyond a signal, expired
after 15 minutes, targeted 2.5R and enabled conditional trailing at 1.5R with
a 0.75R distance. It allowed two concurrent positions at 0.5% risk each.

| Period | Return | Trades | Win | PF | DD | Decision |
|---|---:|---:|---:|---:|---:|---|
| Train | +43.07% | 419 | 43.91% | 1.3351 | 7.62% | fit only |
| Validation | -13.51% | 148 | 33.11% | 0.6655 | 15.94% | fail |
| Validation spread x1.25 | -5.87% | 127 | 37.01% | 0.8271 | 9.47% | fail |
| Diagnostic test | -7.93% | 95 | 34.74% | 0.7007 | 9.18% | fail |
| Full, contaminated aggregate | +13.88% | 662 | 40.18% | 1.0632 | 21.99% | not selectable |

No slot/risk variant from 0.5% through 3% repaired the negative validation and
test expectancy. The 90% margin cap also prevents nominal risk from scaling
linearly at the larger slot/risk settings.

Kronos-mini then made 5,398 deterministic forecasts from fully closed H1
contexts in 208.06 model seconds at 334.13 MiB peak process RSS. Across 201
fixed filter, veto, movement-detector and quality-ranker scenarios, the
development-selected role was a two-H1-bar opposite-move veto at 0.1 ATR.

| Kronos veto period | Return | Trades | Win | PF | DD |
|---|---:|---:|---:|---:|---:|
| Train | +24.38% | 207 | 45.89% | 1.4195 | 5.80% |
| Validation | +1.23% | 74 | 41.89% | 1.0650 | 4.51% |
| Validation spread x1.25 | +5.31% | 58 | 46.55% | 1.3773 | 3.00% |
| Diagnostic test | -5.00% | 42 | 30.95% | 0.6105 | 5.05% |
| Full, contaminated aggregate | +19.58% | 323 | 43.03% | 1.2001 | 5.80% |

No Kronos scenario passed the frozen gate: the chosen veto lost in June and
again in August/early September, averaged only 1.83 trades per calendar day,
and a daily bootstrap estimated a 31.92% losing 20-day period probability.
Decision: retain this as a reproducible rejected experiment; do not promote
the core or Kronos layer to live trading.

## Profit-first M1-D1 tournament — 2026-09-10

The original `karpathy/autoresearch` contract uses a fixed evaluator, one
agent-editable experiment file, a fixed wall-clock budget, one validation
metric, and a keep/discard loop. This adaptation froze the offline evaluator
and dataset before the run, then divided one 1,200-second budget equally among
M1, M5, M15, H1, H4 and D1. Startup, feature preparation and final evaluation
were excluded from the budget. The search ranked by compounded profit at 0.5%
nominal risk; validation, spread x1.25 and chronological folds prevented a
profitable training-only fit from being accepted. The August test was opened
only after each timeframe configuration was frozen. That calendar range had
already been inspected in older experiments, so it is a diagnostic holdout,
not untouched forward evidence.

The tournament compared 22 causal, automatable rule families: Green/Red,
momentum, Donchian breakout, EMA crossover/pullback, RSI and Bollinger
reversion, MACD and ADX momentum, VWAP momentum/reversion, engulfing, pin bar,
inside-bar breakout, session/opening momentum and reversal, trend pullback and
regime switching. It also searched market/stop/limit entry, candle/ATR/swing
stops, R/ATR/VWAP/structure targets, time exits, breakeven, trailing, volume,
volatility, spread, EMA, RSI, Bollinger and higher-timeframe filters. One
universal configuration was used across EURUSD, GBPUSD and USDJPY; no pair P&L
profiles were used. M1 was screened on EURUSD alone to fit Raspberry Pi memory.

The run evaluated 11,773 unique configurations in 1,202.44 seconds:

| Signal TF | Configs | Frozen family | Train | Validation | Stress | August test | Full | Decision |
|---|---:|---|---:|---:|---:|---:|---:|---|
| M1 | 126 | Inside-bar breakout | -2.97% | -1.66% | -1.20% | +0.16% | -4.43% | reject |
| M5 | 150 | Opening momentum | -2.42% | -1.04% | -1.48% | -0.50% | -3.92% | reject |
| M15 | 546 | VWAP reversion | +23.78% | +5.98% | +4.12% | **-3.32%** | +26.96% | reject |
| H1 | 1,446 | VWAP momentum | +14.58% | +0.69% | +0.60% | **+2.43%** | +18.18% | shadow winner |
| H4 | 3,420 | Engulfing | +14.38% | -0.01% | -0.04% | 0.00% | +14.29% | reject |
| D1 | 6,085 | VWAP momentum | +7.18% | -4.65% | -4.37% | 0.00% | +2.15% | reject |

The frozen H1 rule is:

- on a fully closed H1 candle, detect the first crossing beyond 0.5 ATR from
  the current session VWAP and trade in the direction of the displacement;
- require volume at least 1.25 times its causal average, activity at least
  0.75, body at least 0.1 ATR, ATR percentile at least 0.15, spread no more
  than 0.5 ATR, and aligned EMA distance/slope of 0.25/0.05 ATR;
- enter at the next available M1 market open;
- stop at 0.75 ATR and target 1.5 ATR (2:1 initial reward/risk), with 12-hour
  maximum hold, breakeven at 1.5R and conditional trailing after 2R;
- allow at most one order per session and one open position in the final
  profit-maximizing variant; use no pair-specific profile.

The post-freeze risk/slot sweep found that one slot performed best because the
90% margin cap reduced position size as more slots were reserved. For one slot:

| Risk/trade | Validation | August | August stress | Full | Full DD |
|---:|---:|---:|---:|---:|---:|
| 0.5% | +0.63% | +2.77% | +2.75% | +18.41% | 5.37% |
| 1% | +1.21% | +5.59% | +5.55% | +39.62% | 10.61% |
| 2% | +2.44% | +9.79% | +9.71% | +89.78% | 18.97% |
| 3% | +4.84% | +10.06% | +9.98% | **+115.83%** | **21.18%** |

At 3% risk the EUR 500 replay finished at EUR 1,079.12: 111 trades, 44.14%
wins, PF 1.5284 and 130-minute average hold. Pair P&L was EURUSD +EUR 340.12,
GBPUSD +EUR 94.35 and USDJPY +EUR 144.65. June still lost EUR 144.39 before
July recovered EUR 190.20. Therefore this is the best shadow candidate found,
not an always-profitable strategy and not yet evidence for live deployment.
The M15 result demonstrates why full-period profit cannot replace holdout: its
large in-sample gain failed immediately in August.

Reproduce one timeframe shard with:

```sh
node --max-old-space-size=4608 lab/autoresearch/train.js \
  --dataset /mnt/usb-ssd/trading/capital-dataset --profit-tournament \
  --profit-timeframe 60 --seconds 200 --skip-risk-sweep \
  --from 2026-01-01T00:00:00Z --train-end 2026-06-01T00:00:00Z \
  --validation-end 2026-08-01T00:00:00Z --to 2026-09-01T00:00:00Z
```

## Universal M5 scalping search — 2026-09-10

The archive's largest numbers are not reusable universal strategies. The
17-FX report showing more than 2,300% compounded return uses 27–28 optimized
pair/session profiles, 3% target risk and an entirely inspected development
period; its own limitations say that it has no fresh holdout. The older tick
scalping search lost EUR 4.40 before stress and EUR 10.33 under combined
stress. The timed M5/M15 micro portfolio made 440.73% in its full, fitted
history but lost 21.88% on its untouched holdout. These reports are useful as
idea sources, not evidence that their headline returns will transfer.

`--m5-scalping` performs a causal, profile-free search over four universal
families: Bollinger rejection plus adaptive RSI and Green/Red; Bollinger
rejection plus Green/Red; Bollinger breakout plus normalized momentum; and a
small combined score. Pair scale is normalized from the preceding 200 closed
candles. Pair P&L and fitted pair/session constants are forbidden. Signals use
a fully closed M5 candle and fill at the following M1 bid/ask open. M1 replay
uses conservative stop-first ordering, broker minimum distances, one position
per pair, 90% margin and at most five portfolio slots.

The 600-second search evaluated 593 unique configurations. April–June was the
three-month training set, July validation, and August through 4 September the
configuration-specific holdout. The development-selected rule was:

- rank the five most liquid pairs for the current session by spread/ATR;
- require an M5 Bollinger-band rejection and matching Green/Red reversal;
- require normal activity and ATR above the rolling lower decile;
- enter at market on the next M1 candle;
- use a 1.5 ATR stop, fixed 1R target and 15-minute maximum hold;
- allow one position per pair and five total slots; use 0.5% nominal risk.

| Frozen universal M5 rule | Return | Trades | Win | PF | DD |
|---|---:|---:|---:|---:|---:|
| Apr–Jun train | +0.00% | 205 | 50.73% | 1.0001 | 4.77% |
| July validation | +0.69% | 38 | 50.00% | 1.1753 | 0.97% |
| Validation, 1.25x spread | +1.52% | 17 | 58.82% | 1.9080 | 0.53% |
| Frozen Aug–Sep holdout | **-2.38%** | 36 | 44.44% | 0.5745 | 2.91% |
| Holdout, 1.25x spread | **-1.23%** | 15 | 46.67% | 0.5371 | 1.89% |
| Continuous Apr–Sep | -1.71% | 279 | 49.82% | 0.9406 | 4.77% |

The EUR 500 account ended the holdout at EUR 488.08 and the continuous replay
at EUR 491.44. Average activity was 1.44 trades per holdout market day, with
only 24% of calendar market days profitable. Increasing risk cannot repair the
negative expectancy: it only scales the loss. This M5 hypothesis is rejected
and must not be transferred to live code. The useful directional result is
that selective Bollinger/Green-Red rejection dominated RSI, momentum and the
combined score, but it still did not survive holdout.

```sh
node --max-old-space-size=4608 lab/autoresearch/train.js \
  --dataset /mnt/usb-ssd/trading/capital-dataset --m5-scalping \
  --seconds 600 --seed 20260910 --from 2026-04-01T00:00:00Z \
  --train-end 2026-07-01T00:00:00Z \
  --validation-end 2026-08-01T00:00:00Z \
  --to 2026-09-04T10:50:00Z
```

Dataset fingerprint:
`76f2d00fb673235545de6a561cc685e2a69ab3d07957e7e79c48b0bb7c8e00c6`.

## Rolling 200-bar pair/timeframe profiles — 2026-09-09

`--adaptive-pair-study` tests one universal decision rule while allowing each
pair and timeframe to express its current scale through a causal rolling
profile. For every M15, H1 and H4 candle, the profile contains the mean and
standard deviation of Bollinger width/ATR, RSI, candle body/ATR and 2/4/8-bar
momentum from exactly the previous 200 closed candles. The current candle is
excluded. No pair P&L, fitted pair constants or future values are used.

The fixed 360-case grid compared only three small signal families:

- Bollinger position plus normalized momentum;
- Bollinger rejection plus adaptive RSI extreme;
- Bollinger rejection plus the Green/Red price-action turn.

Each was tested on M15, H1 and H4, with and without the next higher timeframe
as a direction check, 1.5/2.5 ATR stops, intraday 1R or 24-hour 2R exits, and
one/five slots. Search risk was 0.5% per trade. Fourteen configurations passed
the January–May development gate. The development-selected H1 candidate did
not transfer: train +2.37%, validation +1.22%, but frozen diagnostic -4.95%.

The predeclared M15 family champion did transfer and is the best shadow
hypothesis from this study:

- evaluate a fully closed M15 candle;
- require a Bollinger lower/upper rejection in the matching Green/Red reversal
  direction;
- require candle body/ATR to exceed its pair-specific rolling-200 mean by one
  standard deviation;
- require closed four-bar H1 momentum to have the same direction;
- enter at MARKET; use 1.5 ATR SL, fixed 2R TP and 24-hour maximum hold;
- one position per pair, one portfolio slot, 0.5% nominal risk.

| M15 Bollinger + price action + H1 direction | Return | Trades | Win | PF | DD |
|---|---:|---:|---:|---:|---:|
| Jan–Mar train | +3.46% | 35 | 40.00% | 1.3262 | 3.83% |
| Apr–May validation | +4.50% | 24 | 45.83% | 1.6813 | 1.47% |
| Validation, 1.25x spread | +2.88% | 24 | 41.67% | 1.4061 | 1.49% |
| Frozen Jun–Aug diagnostic | +2.62% | 45 | 37.78% | 1.1929 | 3.89% |
| Frozen diagnostic, 1.25x spread | +1.94% | 47 | 36.17% | 1.1329 | 3.88% |
| Continuous Jan–Aug | +10.81% | 104 | 40.38% | 1.3362 | 4.42% |

Continuous balance grew from EUR 500 to EUR 554.04. Five of seven traded pairs
were nominally positive, but EURUSD supplied EUR 41.94; AUDJPY and GBPAUD lost
EUR 5.67 and EUR 10.63. February and June were losing months. Activity was only
0.61 trades per calendar trading day and 23.26% of calendar days were
profitable, so this does not satisfy the requested daily-activity objective.
All periods have now been inspected; the rule is frozen for shadow-forward
testing and is not a claim of a live-proven edge.

Two activity/portfolio alternatives were explicitly rejected. Removing H1
confirmation raised activity to 2.36 trades/day and left the continuous result
at +7.33%, but the frozen period lost 8.01% (9.54% under spread stress); at 3%
risk its frozen loss reached 35.44% with 52.11% drawdown. Giving the transferred
candidate five slots produced train -0.40% and stressed validation -0.26%; its
later positive test cannot rescue a configuration that failed development.

```sh
node lab/replay.js --dataset /mnt/usb-ssd/trading/capital-dataset \
  --adaptive-pair-study --from 2026-01-01T00:00:00Z \
  --train-end 2026-04-01T00:00:00Z \
  --validation-end 2026-06-01T00:00:00Z \
  --to 2026-08-28T21:00:00Z
```

Dataset fingerprint remained
`fc649f6b27d6675b20f4e001e828aef57cce5f7c914dcadce0876448839ee319`.

## Institutional reality and causal session state — 2026-09-09

The likely firm in the comparison is XTX Markets. Its public description is
not a candle-strategy blueprint: XTX reports ML price forecasts across more
than 53,000 instruments, USD 250bn daily volume, over 25,000 research GPUs and
exabyte-scale storage. Its client business supplies bilateral liquidity,
estimates fair value, manages client-flow and inventory risk, and targets low
market impact. Its engineering description covers complete tick-to-trade
systems, many venues/protocols, tens of gigabits per second of market data and
millions of monitoring events per second. Sources: [XTX home], [XTX clients],
[XTX careers], [XTX TernFS]. BIS research likewise describes non-bank principal
trading firms as both aggressive traders and passive liquidity providers in a
fragmented OTC market, where inventory risk, asymmetric information, venue
access and execution are central: [BIS FX market], [BIS execution landscape].

[XTX home]: https://www.xtxmarkets.com/
[XTX clients]: https://www.xtxmarkets.com/clients/
[XTX careers]: https://www.xtxmarkets.com/careers/
[XTX TernFS]: https://www.xtxmarkets.com/tech/2025-ternfs/
[BIS FX market]: https://www.bis.org/publications/working-paper-1094-foreign-exchange-market
[BIS execution landscape]: https://www.bis.org/publications/fx-trade-execution-complex-and-highly-fragmented

A retail CFD M1 OHLC feed cannot reproduce that business: it has no consolidated
tick/order-book history, queue position, passive-fill model, client flow,
multiple venues, rebates or inventory internalisation. `--institutional-study`
therefore tests only feasible directional hypotheses and does not label them
an XTX simulation.

The new causal session state contains only the previous completed session's
ATR-normalized move, range and travelled path, path efficiency, close location,
average spread/ATR, average relative volume, high and low. It never uses trade
P&L to alter a signal. In research it is derived in RAM from immutable history;
no duplicate JSON state files are written. A live implementation may persist
the same compact object per instrument as a recoverable cache, while market
history remains the source of truth.

The extended experiment adds the gap from the prior session close, the first
fully closed H1 move, ATR percentile and closed H4 move/trend. A single online
linear model is pooled across every instrument: pair identity and previous
trade results are not features. A forecast is made first; its two- or four-hour
label becomes available for learning only after that horizon has closed. The
model therefore adapts between sessions without lookahead or pair profiles.

If this derived state is later persisted, use one append-only JSONL cache per
instrument and one small object per completed session. The minimum record is:
`schema`, `symbol`, `session`, `start`, `end`, `sourceLastTimestamp`,
`moveAtr`, `rangeAtr`, `travelAtr`, `efficiency`, `closeLocation`,
`spreadAtr`, `volumeRatio`, `gapAtr`, `openingH1MoveAtr`, `h4MoveAtr`, and
`h4EmaAtr`. Do not store candles or trade P&L in it. The cache is disposable
and reproducible from immutable market history, so it never becomes a second
market-data source of truth. The lab currently keeps these records in RAM and
writes no cache files.

The fixed grid grew to 416 scenarios, including four universal online models
and causal 50/200-session calibration that either pauses an unskilled model or
reverses a persistently anti-correlated forecast. It processed 10,773
session-start records. The main model passed the January–May development gate:
fast two-hour adaptation, score threshold 0.3, MARKET entry, 1.5 ATR stop, 2R
target, 24-hour maximum hold and one 0.5%-risk slot.

| Universal online session model | Return | Trades | Win | PF | DD |
|---|---:|---:|---:|---:|---:|
| Jan–Mar train | +2.74% | 95 | 36.84% | 1.0937 | 5.97% |
| Apr–May validation | +2.13% | 81 | 39.51% | 1.0936 | 4.96% |
| Validation, 1.25x spread | +1.98% | 81 | 39.51% | 1.0868 | 5.03% |
| Frozen Jun–Aug diagnostic | -12.97% | 136 | 30.88% | 0.6889 | 14.44% |
| Continuous Jan–Aug | -9.16% | 312 | 34.94% | 0.9052 | 16.89% |

The model traded on 143 of 172 calendar trading days, averaging 1.81 trades
per day, but only 34.30% of calendar days were profitable. It lost in March
and every frozen-test month. The result demonstrates regime drift, not a
working adaptive edge, and is rejected. Increasing risk toward the allowed 3%
would magnify this negative expectancy rather than repair it.

The best calibrated variant used the last 50 matured forecasts and flipped the
direction only when absolute directional edge exceeded 0.05. It reduced the
full loss but did not solve transfer: train +0.49%, validation +0.70%, stressed
validation +0.55%, frozen diagnostic -5.84%, and continuous full-period
-4.59% across 258 trades (PF 0.9387). It is also rejected.

Kronos-mini was also fixed as a second layer around that development-selected
online signal. It made 1,712 deterministic H1 forecasts in 76.15 seconds on the
Pi, with 316.0 MiB peak model RSS, and compared 66 filter/veto/quality/room
variants. The development winner was a two-hour adverse veto at 0.5 ATR:

| Online model + development-selected Kronos veto | Return | Trades | PF |
|---|---:|---:|---:|
| Train | +3.04% | 93 | 1.1064 |
| Validation | +2.00% | 78 | 1.0929 |
| Validation, 1.25x spread | +1.75% | 78 | 1.0811 |
| Frozen diagnostic | -13.60% | 136 | 0.6748 |
| Continuous full period | -9.87% | 307 | 0.8958 |

It is rejected. A stricter Kronos alignment filter happened to make +3.11% in
the frozen period, but had already lost 2.70% in validation and produced only
60 trades over the full period. Selecting it after seeing the test would be
backtest overfitting. Forecast hash:
`93677a6381a2ce9c740f71c25bac0beba052772bbbe9a8440f3801d5f4dd3e83`.

The fixed 192-case benchmark compared session continuation, reversal and
efficiency-adaptive direction; H1+H4 voting; and H1/H4 momentum and breakout.
It also compared intraday 1R versus 24-hour 2R, 1.5/2.5 ATR stops and one/five
slots. January–March was training, April–May validation plus 1.25x spread
stress, and June–August a frozen M1 diagnostic. Each isolated split starts at
EUR 500.

| Best family representative | Train | Validation | Frozen test | Full | Full PF |
|---|---:|---:|---:|---:|---:|
| Session continuation | +1.30% | -0.12% | -2.95% | -1.76% | 0.9286 |
| Session adaptive | +0.45% | -0.22% | -7.20% | -6.92% | 0.8549 |
| Session reversal | -3.39% | -2.47% | -2.45% | -7.94% | 0.6994 |
| H1 momentum | -2.01% | +4.22% | -7.75% | -5.72% | 0.9208 |
| H1 breakout | +4.32% | +0.69% | -6.41% | -1.34% | 0.9633 |
| H1+H4 vote | +0.43% | -1.90% | -4.32% | -5.83% | 0.9166 |
| H4 momentum | only 4 trades | +0.27% | -2.31% | -1.03% | 0.9078 |
| H4 breakout | only 7 trades | -0.04% | -0.44% | -0.29% | 0.9639 |

Zero deterministic configurations passed the predeclared gate. H4 has too few
training observations in this short dataset to support model selection. The
least-bad adequately sampled candidate was session continuation after a strong,
liquid prior session, but its edge disappeared in validation and test.

Kronos-mini was then applied to that frozen session candidate in 199 fixed
no-model/filter/veto/detector/quality/room variants. It generated 558 unique
H1 forecasts in 20.17 seconds at 334.2 MiB peak model RSS. The selected
two-hour alignment filter requires at least 0.5 signal ATR in the trade
direction:

| Kronos session candidate | Return | Trades | Win | PF | DD |
|---|---:|---:|---:|---:|---:|
| Training | +0.81% | 9 | 77.78% | 5.1408 | 0.19% |
| Validation | +0.65% | 10 | 80.00% | 5.9027 | 0.08% |
| Validation, 1.25x spread | +0.62% | 10 | 80.00% | 5.5041 | 0.08% |
| Frozen June–August diagnostic | +1.81% | 19 | 73.68% | 2.4802 | 0.46% |
| Continuous January–August | +3.32% | 38 | 76.32% | 3.1438 | 0.46% |

All reported months were nominally positive, but 38 trades after 199 model
comparisons is insufficient evidence and averages far below one trade per day.
The configuration fails the activity/sample gate and is not promoted. It is a
bounded shadow-forward candidate, not a claim of a discovered profitable bot.
Forecast hash:
`84987ab10f36b56ad764434b4783734b904d91ff4d6e8c3b0d7ca9fc7c3caa94`.

This outcome matches the wider evidence: repeated backtest selection creates
false discoveries ([Bailey et al.]), while a recent currency-rule replication
finds that apparent technical-rule performance largely reduces to momentum and
does not survive modest out-of-sample transaction costs ([Hutchinson et al.]).

[Bailey et al.]: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2308659
[Hutchinson et al.]: https://doi.org/10.1016/j.ribaf.2022.101779

```sh
node lab/replay.js --dataset /mnt/usb-ssd/trading/capital-dataset \
  --institutional-study --from 2026-01-01T00:00:00Z \
  --train-end 2026-04-01T00:00:00Z \
  --validation-end 2026-06-01T00:00:00Z \
  --to 2026-08-28T21:00:00Z
```

## `Production` commit reproduction — 2026-09-09

`--production-study` causally reproduces commit
`a8f33bb4f5a40bcd5c33dd61042667fbed61dd11` (`Production`, 2025-06-23):
M15 evaluation, H4/H1/M15 seven-vote score, MARKET entry, 1.5 ATR stop, 2R
target, one position per pair and five portfolio slots. The commit's broken
stop-distance sizing is replaced by the current broker-rule sizing; signal and
position-management logic are otherwise preserved. Financing is not modelled.

The study used the whole common analyzable window across all 17 FX files, from
2026-01-01 through 2026-08-28 21:00 UTC. The short December fragment cannot
supply the required 200 closed H4 bars; January is therefore indicator warm-up
and the first trades occur in February. Some symbols continue after August 28,
but not all 17, so they were excluded rather than changing the universe near
the end. Search used January–March training and April–May validation. The
candidate was then frozen for a June–August M1 diagnostic. Each isolated split
starts at EUR 500; the full result is continuous. Dates have been inspected in
earlier research, so the final period is diagnostic rather than a virgin
holdout.

| Variant | End EUR | Return | Trades | Win | PF | DD |
|---|---:|---:|---:|---:|---:|---:|
| Exact `Production` signal, full M1 | 15.84 | -96.83% | 4,109 | 24.53% | 0.7152 | 96.83% |
| Selected lab candidate, train M15 | 580.75 | +16.15% | 212 | 38.68% | 1.2127 | 12.70% |
| Selected lab candidate, validation M15 | 442.12 | -11.58% | 342 | 29.24% | 0.8827 | 17.16% |
| Selected lab candidate, frozen test M1 | 410.30 | -17.94% | 465 | 28.82% | 0.8414 | 19.17% |
| Selected lab candidate, full M1 | 410.57 | -17.89% | 1,023 | 30.89% | 0.9416 | 31.01% |

Zero of 96 fixed scenarios were profitable with PF above 1 in both training
and validation. The least-bad candidate uses the five H1/M15 setup and entry
votes, requires score 3 plus a one-vote directional edge, makes SELL symmetric
with BUY, selects the five lowest spread/ATR instruments dynamically, rejects
spread/ATR above 0.5, enters at market, uses 1.5 ATR SL and 2R TP, permits a
24-hour hold, and has five equal-margin slots at 1% nominal risk each. This is
implemented only as a reproducible lab candidate; it is rejected for live use.

The selected candidate earned EUR 31.90 in February, EUR 48.81 in March and
EUR 7.46 in July, but lost in every other tested month. Its only positive broad
slices were BUY (EUR +31.47, PF 1.0392), London (EUR +9.31, PF 1.0231), mixed
rather than H4-aligned regime (EUR +34.40, PF 1.0415), and high volatility
(EUR +6.61, PF 1.0076). SELL lost EUR 120.88. These are post-run diagnostics,
not filters that may be promoted without a new untouched walk-forward test.
They show why the profitable months occurred, but do not establish a stable
cause. Raising nominal risk through 3% cannot repair the negative expectancy.

Reusable parts of `Production` are therefore its simple market-entry pipeline,
five equal portfolio slots, one position per pair, causal multi-timeframe vote,
relative liquidity selection, and spread-normalized admission. Its original
`3 of 7` decision, BUY-priority tie, asymmetric SELL trend test and unrestricted
frequency are explicitly not carried forward.

Run the same read-only server study:

```sh
node lab/replay.js --dataset /mnt/usb-ssd/trading/capital-dataset \
  --production-study --from 2026-01-01T00:00:00Z \
  --train-end 2026-04-01T00:00:00Z \
  --validation-end 2026-06-01T00:00:00Z \
  --to 2026-08-28T21:00:00Z
```

Dataset fingerprint:
`fc649f6b27d6675b20f4e001e828aef57cce5f7c914dcadce0876448839ee319`.
The unchanged-source check passed. No dataset, live file, broker process or
server repository file was modified.

### Kronos roles on the selected `Production` core

Kronos-mini was applied after the fixed 96-scenario core selection. It read the
last 64 fully closed H1 bid candles and predicted one or two H1 bars. The same
forecast was reused for M15 signals sharing a context. The fixed 147-case grid
compared alignment filter, adverse veto, one extra score vote, direction
replacement, simultaneous-signal quality ranking, predicted TP room, and a
no-model comparator across 1/3/5 slots. Test data did not participate in
selection.

| Development-selected role | Full return | End EUR | Trades | PF | DD |
|---|---:|---:|---:|---:|---:|
| No Kronos | -17.89% | 410.57 | 1,023 | 0.9416 | 31.01% |
| Alignment filter | -15.42% | 422.92 | 817 | 0.9385 | 32.08% |
| Adverse veto | -19.84% | 400.83 | 923 | 0.9275 | 32.70% |
| Extra score vote | -18.59% | 407.07 | 988 | 0.9370 | 32.98% |
| Direction detector | -19.98% | 400.10 | 842 | 0.9210 | 32.61% |
| Quality ranker | -17.09% | 414.55 | 989 | 0.9427 | 31.77% |
| Predicted room | -6.26% | 468.69 | 544 | 0.9651 | 24.80% |

The selected model option is H1 one-bar predicted room with five slots: allow
the core signal only when the forecast path contains at least 1.5R favorable
room and no more than 1R adverse excursion. It made +18.60% in training with
PF 1.3990, then lost 7.57% in validation (PF 0.8625), 10.52% under validation
spread stress, and 14.42% in the frozen M1 test (PF 0.7638). Full monthly P&L
was `+34.19, +58.83, -53.70, +9.24, -90.91, -1.16, +12.20` EUR from February
through August. Zero Kronos configurations passed the profitability gate, so
none is promoted to live code.

The Pi produced 912 deterministic forecasts for 1,639 qualifying signals in
42.02 seconds at 335.1 MiB peak model RSS. Forecast hash:
`70a99822e46ce5f49516e312b504fd887f4e1be9ebdb652b84c4e1fb23218a93`.

```sh
NODE_OPTIONS=--max-old-space-size=4608 node lab/replay.js \
  --dataset /mnt/usb-ssd/trading/capital-dataset --production-study \
  --kronos-runtime /mnt/usb-ssd/trading/kronos-runtime \
  --from 2026-01-01T00:00:00Z --train-end 2026-04-01T00:00:00Z \
  --validation-end 2026-06-01T00:00:00Z --to 2026-08-28T21:00:00Z
```

The dataset unchanged check passed. Forecasts and results remained in memory
or temporary files; no persistent cache was added.

## Dynamic Green/Red profiles + Kronos — 2026-09-08

`--dynamic-profiles` is a causal, reciprocal six-month experiment around the
accepted Green/Red baseline. It does not use pair-profit profiles. The same
rules apply to every instrument; the per-signal state is built only from data
known when the closed M15 candle is evaluated: confirmed M15 swings, closed
H1/H4 trend and movement, ATR regime, spread/ATR and session liquidity rank,
volume ratio, session range/path/efficiency/VWAP, prior-session range and move,
and causal support/resistance distances and touches.

The old `Production` commit inspected for this design is
`a8f33bb4f5a40bcd5c33dd61042667fbed61dd11` (2025-06-23). Its reusable idea is
the simple multi-timeframe vote: H4 trend, H1 setup and M15 entry, with MARKET
execution. Its approximate sizing and performance-feedback adaptation were not
copied. Dynamic thresholds here depend on market state, never recent wins or
losses.

The fixed grid contains 3,888 combinations: balanced/trend/pullback state,
score and edge thresholds, loose/strict liquidity, MARKET/STOP/adaptive entry,
signal-candle/1 ATR/1.5 ATR SL, fixed 1R/1.5R/2R or conditional trailing, and
1/3/5 equal-margin slots. Search risk is 1%; the frozen variants are replayed at
0.5–3%. One position per pair, 90% margin cap and 15% portfolio-risk cap remain
enforced. Each half starts at EUR 500.

| Selection | Training half | Opposite half | Verdict |
|---|---:|---:|---|
| Current Green/Red control, Mar–May selected | +117.83%, PF 1.7204 | +10.40%, PF 1.0788 | Best forward choice, but 1.25x spread test is -2.06% |
| Dynamic balanced profile, Mar–May selected | +32.83%, PF 1.3440 | -16.58%, PF 0.7808 | Rejected |
| Dynamic pullback profile, Jun–Aug selected | +5.82%, PF 1.2981 | -2.19%, PF 0.9260 | Rejected |

Kronos-mini then predicted one and two closed H1 bars for 767 unique contexts
(811 signals). The Pi completed deterministic CPU inference in 37.85s at
315.7 MiB peak RSS. Seventy-eight no-model/filter/veto/detector/quality/room
variants were compared. The training-only winner for March–May remained the
control without Kronos; the reverse training-only winner remained the dynamic
pullback without Kronos. Kronos therefore did not win either valid one-way
selection.

The best **already-inspected reciprocal diagnostic** was Kronos as a permissive
veto on the current control: H1 input, two-hour horizon, reject when forecast
movement against the Green/Red side exceeds 0.25 signal ATR. It is a research
hypothesis, not a new holdout result:

| Period | Return | End EUR | Trades | Win | PF | DD | Positive calendar days |
|---|---:|---:|---:|---:|---:|---:|---:|
| Mar–May | +82.24% | 911.20 | 89 | 55.06% | 1.8203 | 12.51% | 50.77% |
| Jun–Aug | +21.11% | 605.53 | 80 | 48.75% | 1.3182 | 11.38% | 41.54% |

Its monthly P&L is `+260.40, +129.33, +21.46, +9.83, +103.31, -7.61` EUR
from March through August. It averages only 1.37 and 1.23 trades/day in the two
halves and has very weak New York coverage (8 and 3 trades). Consequently it
does not satisfy the earlier goal of three trades every day or profit every
session, and August remains negative. Forty-three of 78 model variants were
nominally profitable on both inspected halves, but that observation cannot be
used as an independent validation.

Run the reproducible study on the Pi's source-of-truth dataset:

```sh
node lab/replay.js --dataset /mnt/usb-ssd/trading/capital-dataset \
  --dynamic-profiles --kronos-runtime /mnt/usb-ssd/trading/kronos-runtime \
  --from 2026-03-01T00:00:00Z --split 2026-06-01T00:00:00Z \
  --train-end 2026-07-01T00:00:00Z --validation-end 2026-08-01T00:00:00Z \
  --to 2026-08-28T21:00:00Z
```

Dataset fingerprint:
`74d5a76a637b5a66162a1b8cca690e0ea00739451932f306ffd905ced6b8c327`.
Forecast fingerprint:
`82c060f9e1b6d3e6070aae1a5d5346978503b2640ab8eb1497ea5442fbe8d246`.
The unchanged-source check passed. No dataset, broker process, protected live
file, or paper-strategy file was modified.

## Research-report candidate benchmark — 2026-09-08

`--report-candidates` implements the report's immediately testable phase: pure
volatility-normalized momentum, EMA trend, causal Donchian breakout, their
equal-weight ensemble, and ADX-filtered mean reversion. It uses MARKET entry at
the next M1 bid/ask, no pair profiles, one portfolio slot, EUR 500 start capital,
0.5% nominal risk, and recorded broker spreads. The fixed 3,024-case grid spans
M15/H1 signals, three horizon bundles (two for Donchian), thresholds
0.35/0.55/0.75, optional H1/H4 context, 1.5/2/2.5 ATR stops, fixed 2R, time,
opposite-signal, and 2/3/4 ATR trailing exits.

```sh
node lab/replay.js --dataset /mnt/usb-ssd/trading/capital-dataset \
  --from 2026-03-01T00:00:00Z --train-end 2026-07-01T00:00:00Z \
  --validation-end 2026-08-01T00:00:00Z --to 2026-08-29T00:00:00Z \
  --report-candidates
```

Selection uses March–June training, monthly development folds, July validation,
and July at 1.25x spread. August and its 1.5x/2x spread variants are diagnostic
after selection, not a virgin holdout. Every split starts at EUR 500; the full
column is one continuous March–August simulation.

| Development-selected family representative | Train | July | August | Full | August PF |
|---|---:|---:|---:|---:|---:|
| Momentum | -10.54% | +3.54% | -5.01% | -11.72% | 0.5728 |
| EMA trend | -14.06% | -10.13% | -1.41% | -23.80% | 0.9166 |
| Donchian breakout | -9.64% | -1.35% | -4.69% | -14.80% | 0.5197 |
| Equal-weight ensemble | -8.41% | -4.48% | -1.79% | -14.06% | 0.8096 |
| Regime mean reversion | -8.08% | -4.66% | -4.71% | -16.52% | 0.4073 |

Zero configurations passed the frozen acceptance gate. The least-bad robust
rank was H1 momentum, medium horizon bundle, threshold 0.35, no H4 alignment,
2.5 ATR initial stop, and 2 ATR trailing exit. It made +3.54% in July but lost
10.54% in training and 5.01% in August; August worsened to -6.17% at 1.5x spread
and -9.19% at 2x. It is therefore rejected, not promoted as a strategy.

Frozen portfolio ablations then replayed every family representative with
1/3/5 equal-margin slots and 0.5%/1% risk per trade. None of the 30 variants was
profitable both in July and August, and none was profitable continuously. The
least-negative full run remained one-slot momentum at 0.5% risk (-11.72%). The
five-slot result closest to flat in August was EMA trend at 1% risk (-0.02%),
but it lost 29.73% in July and 66.34% continuously, so it is not a valid choice.

Pairs/stat-arbitrage was not forced into this single-position evaluator because
the report requires synchronized two-leg execution, aggregate exposure, and an
atomic portfolio stop. The ML meta-filter is intentionally downstream of a
profitable deterministic OOS signal; this run found no such base signal.
Market-making lacks the required L2/order-book access, and RL lacks the required
independent history and execution simulator. Calling these omissions simulated
backtests would overstate what the available data and architecture can test.

The run covered 17 FX pairs and 3,024/3,024 configurations in 419.197 seconds.
Dataset fingerprint: `74d5a76a637b5a66162a1b8cca690e0ea00739451932f306ffd905ced6b8c327`.
The unchanged-source check passed. No dataset, live file, broker process, or
server repository file was modified.

## Global Green/Red experiment

The user accepted the 2026-09-07 selected configuration as the new research
baseline. `RESEARCH_BASE` in `../replay.js` now contains that exact shared
configuration. Earlier baseline numbers below are historical comparisons,
not the new default. Acceptance does not erase its negative August result.

`train.js` defaults to the shared strategy in `../replay.js`. The new experiment
does not read pair profiles. Explicit profile/session modes remain legacy modes;
their evaluator was not repaired or used for the new results.

Rules implemented for this experiment:

- Closed M15 colour reversal, in the direction of two confirmed swing highs,
  lows, or both. A pivot becomes available only after 2–4 right-hand candles
  close. Optional H1/H4 direction confirmation also uses closed candles.
- BB(20,2), RSI(14), relative volume and candle/ATR quality filters. ATR(21).
- One pending order or position per pair; no split legs or partial exits.
  Search 1–5 portfolio slots and 3 or 5 pairs per session. Rank the universe at
  session start by spread/ATR, not by pair-specific historical profit.
- Stop entry beyond the signal extreme, or a limit pullback near its close.
  SL beyond the opposite extreme with spread/ATR padding; pending expiry 30m.
- Initial TP 2R in the baseline; search 1–3R. Compare fixed exits, unconditional
  trailing and trailing activated by strong movement. Trailing uses closed
  execution bars, replaces TP and never loosens SL; weak movement only pauses
  further conditional ratcheting. Optional break-even; no partial close.
- Start EUR 500. Nominal entry-to-stop risk at most 3%; reserve pending margin
  and slots. Total margin at most 90%, divided equally across configured slots.
  P&L changes available cash only when a position closes.
- Instrument-specific margin, precision, minimum size and minimum SL distance
  come from `reference/capital-market-rules-2026-08-29.json`. This frozen broker
  snapshot is not a pair strategy profile; historical rule changes are unknown.
- Intraday flattening at 22:00 UTC, Friday 20:00; no weekend positions.

The paper rules and live code are not identical. Live code has colour reversal
and optional continuation/H1 filters, but no mandatory confirmed-swing direction;
it still supports profile-controlled expiry and two-leg partial exits. Those
live differences are intentionally unchanged. `strategies/STRATEGY.md` remains
the user's paper specification, not an automatically overwritten result sheet.

Run on the server, against its existing dataset only:

```sh
node lab/replay.js --dataset /mnt/usb-ssd/trading/capital-dataset --seconds 1200 \
  --from 2026-03-01T00:00:00Z --train-end 2026-07-01T00:00:00Z \
  --validation-end 2026-08-01T00:00:00Z --to 2026-08-28T21:00:00Z
```

`--evaluations N` replaces the time budget with a reproducible candidate count.
`--candidate '{...}'` replays a frozen configuration without searching.
`--fixed-2r` restricts the initial TP to 2R; trailing can still replace it.
`--trades` includes the trade ledger in stdout. No report/data file is created.

Search uses M5 execution; 60 finalists are re-evaluated on M1. Selection uses
March–June training and July validation, including 25% wider spread. August is
reported only after freezing the candidate. These dates were inspected in
earlier experiments: this is a chronological diagnostic, not a fresh holdout.
Slot/trailing comparisons after selection are diagnostics, not August tuning.

Execution uses recorded bid/ask OHLC, stop-first ambiguous bars, adverse gap
fills, no TP credit on the entry bar, and conservative native-M15 bounds across
missing M1 intervals. Missing periods never earn synthetic TP fills. Drawdown
is measured on settled balance, not mark-to-market equity. Commission, financing
and extra slippage beyond recorded quotes are not modelled. Risk is nominal:
an adverse fill gap may exceed the original entry-to-stop estimate. The margin
cap uses settled balance; floating-equity margin calls are not simulated.

The initial 20-minute v1 search used a generic major/cross leverage assumption.
That was inconsistent with the stored broker snapshot and its profit numbers
were withdrawn. A separate v2 broker-rules experiment provides the final
statistics; v1 must not be presented as a broker-faithful result.

## Kronos on Raspberry Pi

[Official Kronos](https://github.com/shiyu-coder/Kronos), commit
`67b630e67f6a18c9e9be918d9b4337c960db1e9a`, is installed separately at
`/mnt/usb-ssd/trading/kronos-runtime`. Source, Python environment and one copy of
each model are on the SSD; historical JSONL files are unchanged.

Kronos-mini uses `NeoQuasar/Kronos-Tokenizer-2k`. CPU PyTorch 2.8.0+cpu,
Python 3.11, two threads. Real Pi benchmark: 160 M15 bid-OHLC candles,
8 predicted candles, one sample; missing volume supplied as zero.
One pair: 0.75–0.80s; five-pair batch: 2.09s; peak process RSS: 345 MiB.
This initial benchmark confirmed inference feasibility, not trading value.
The subsequent strategy comparison is recorded below. No fine-tuning,
persistent service or live integration has been performed.

## Final result — 2026-09-07

The completed v1 exploration ran for 20 minutes but is withdrawn for its margin
assumption. Final v2 selection ran for 120.029 seconds, evaluated
2555 unique configurations, then replayed 60 finalists on M1.
This is **not** a claim that all scenarios or 20 minutes of corrected search
were completed. Seed: 20260906; 17 FX pairs; no model forecasts in this test.

| Period | Return | Ending EUR | Trades | Win rate | Profit factor | Balance drawdown |
|---|---:|---:|---:|---:|---:|---:|
| March–June (training) | 141.49% | 1207.43 | 176 | 53.41% | 1.5452 | 15.62% |
| July (validation) | 9.77% | 548.84 | 56 | 44.64% | 1.2206 | 7.97% |
| August 1–28 (diagnostic test) | -9.18% | 454.09 | 38 | 42.11% | 0.713 | 13.42% |
| March–August (continuous) | 140.61% | 1203.03 | 270 | 50.00% | 1.3112 | 15.62% |

Each separate split starts at EUR 500; the continuous run compounds across all
months. Baseline continuous return: -94.58%; baseline August:
-28.87%. Selected July with 25% wider spread: +5.06%;
August stress: -13.08%. The selected candidate passed the
train/validation gates but **failed the August profitability check**.
Aggregate six-month profit is not evidence of stable forward profitability.

Selected: one portfolio position; five eligible pairs per session; M15 reversal
with rising/falling confirmed lows (pivot width 4); H1/H4 filters off. STOP entry
0.1 ATR beyond the signal extreme; SL buffer 0.2 ATR, minimum 0.5 ATR and broker
minimum; initial TP 2R; maximum hold 120m. Conditional trailing activates at 1.5R,
distance 0.75R, when the last 15m move is at least 0.5 signal ATR with efficiency
at least 0.6. Average hold: 87.8m. Session trades:
Asia 88, London 77, overlap 96, New York 9; all-session activity is uneven.

Frozen global configuration for `--candidate` (not per-pair profiles):

```json
{"tf":15,"pivotWidth":4,"direction":"lows","higherSwing":0,"pool":5,"spread":0.5,"body":0.4,"bodyAtr":0.15,"eff":0.1,"activity":1,"atrMin":0.3,"atrMax":0.9,"volume":0,"filter":"score","room":1,"score":2,"htf":0,"hbars":1,"hmove":0.25,"entry":"stop","offset":0.1,"sl":"candle","buffer":0.2,"minStop":0.5,"tp":"r","target":2,"expiry":30,"hold":120,"be":null,"trail":"conditional","activation":1.5,"trailDistance":0.75,"burst":0.5,"slots":1,"risk":0.03,"portfolioRisk":0.15,"dailyStop":0,"lossCap":0}
```

Slot/exit ablations with all other parameters frozen; not reselected on August:

| Slots | Trailing | July | August |
|---:|---|---:|---:|
| 1 | off | 8.83% | -10.25% |
| 1 | always | 9.95% | -8.32% |
| 1 | conditional | 9.77% | -9.18% |
| 2 | off | -3.44% | -6.47% |
| 2 | always | -2.97% | -5.48% |
| 2 | conditional | -3.04% | -5.93% |
| 3 | off | -3.10% | -2.54% |
| 3 | always | -2.79% | -1.84% |
| 3 | conditional | -2.83% | -2.15% |
| 4 | off | -2.29% | -1.89% |
| 4 | always | -2.06% | -1.36% |
| 4 | conditional | -2.07% | -1.59% |
| 5 | off | -1.78% | -1.46% |
| 5 | always | -1.57% | -1.03% |
| 5 | conditional | -1.60% | -1.22% |

Verification: synthetic BUY/SELL fills, ambiguous-bar SL priority, pending expiry
and invalidation, one-position-per-pair, nominal risk/margin, causal pivots,
monotone/conditional trailing and missing-M1 bounds passed. Syntax and scoped
diff checks passed. Dataset/remote helper unchanged check: true.
No protected live file or paper-strategy file was changed.

Reproducibility fingerprints:

- Engine: `9f842bf775dc2fcd96a1088e4f0e089aefa4d5403723ae353465bc9509280164`
- Remote helper: `0f10108f0f4da891208d9d070fa80d4123e7b22811392ab4cda989f015a73dfe`
- Broker rules: `4c2e3dc8c4fbfe2f0232a9ed060dc08c18e7f1a244e46d1d5f84be1a4b2b31da`
- M1 + native-M15 metadata/content fingerprint: `74d5a76a637b5a66162a1b8cca690e0ea00739451932f306ffd905ced6b8c327`

## Kronos universal experiment — historical batch-seeded study

This section records the earlier aggregate-profit experiment. Its sampled
forecast depended on the ordered inference batch seed, so it is not suitable as
the fixed day-independent pattern requested in the later study. It remains here
for auditability and must not be promoted to live trading.

Run the existing lab code on the server, with the installed runtime:

```sh
node lab/replay.js --dataset /mnt/usb-ssd/trading/capital-dataset \
  --kronos-runtime /mnt/usb-ssd/trading/kronos-runtime
```

`--kronos-plan` counts requests without inference. No data, forecast cache or
helper file is written. The Python predictor receives closed candle windows
over stdin, runs with Hugging Face offline mode, and returns forecasts to RAM.

The accepted base is frozen: exits, indicator thresholds, risk and 30m pending
expiry do not change. Search 960 shared configurations: four model roles,
M15/H1 model inputs, forecast horizons, ATR-normalized thresholds, forecast-path
efficiency, 1–5 slots and session pools of 5 or all 17 eligible pairs. Roles:

- Filter: retain confirmed swings and require an aligned forecast.
- Detector: replace swing direction with forecast direction; retain Green/Red
  reversal and all other quality rules.
- Veto: retain swings but reject a sufficiently strong opposite forecast.
- Room: retain swings and require predicted favorable excursion in R without
  excessive predicted adverse excursion. It does not set TP from future prices.

M15 uses 128 closed candles and predicts 8; H1 uses 64 and predicts 2. H1
horizons refer to upcoming H1 closes, not exactly 60/120 minutes after an M15
signal. Input is bid OHLC with zero model volume. Mini, CPU, two threads,
batch size 8, one sampled path, deterministic SHA-256 seed per ordered batch.
Forecast-path efficiency is a heuristic, **not a calibrated probability**.
Missing/future-context forecasts reject the model-dependent entry.

March–June training, July validation and July spread stress select the global
candidate using the existing gates/objective. August is examined only after
selection, but was already inspected in earlier work and remains diagnostic.
No per-pair threshold is selected. Family winners also receive separate
single-pair August audits with identical rules and the session pool restriction
removed, including pairs that had no trades in the selected portfolio.

No model fine-tuning is performed. This experiment tests pretrained inference
as a strategy component. The backtest does not model inference/order latency
inside the M1 bar; a positive result would still need latency and seed robustness
checks before any live-code integration.

### Completed comparison — 2026-09-07

Evaluated 960 global scenarios using 7163 real forecasts.
Inference took 15.50 minutes (elapsed predictor time, not model
training), with 360.53 MiB peak Python RSS. Source data/helper
unchanged check: true. The no-model accepted base reproduced its prior results.

Family representatives were selected on training/July, **before** August was
scored. These are not the best August configurations chosen after the fact.

| Variant | March–June | July | August | Continuous six months | Trades | Profit factor |
|---|---:|---:|---:|---:|---:|---:|
| Accepted base | 141.49% | 9.77% | -9.18% | 140.61% | 270 | 1.3112 |
| Kronos alignment filter | 74.29% | 14.43% | -7.66% | 84.16% | 107 | 1.7329 |
| Kronos movement detector | 53.87% | 9.99% | -21.11% | 33.49% | 210 | 1.1267 |
| Kronos opposite-move veto | 28.21% | 14.21% | -2.74% | 42.50% | 154 | 1.2516 |
| Kronos predicted room | 13.55% | 1.86% | -11.69% | 2.13% | 139 | 1.0264 |

The development-selected configuration was `filter-60-1-0.5-0-5-1`: keep the
base's M15 reversal and confirmed-swing direction; use the last 64 closed H1
candles to predict the next H1 close; allow entry only when that forecast is
at least 0.5 **M15 signal ATR** in the proposed direction from the current
signal close. Keep one portfolio slot, pool of five, and every base SL/TP/risk
parameter unchanged.

Selected filter: July stress +10.36%; August stress
-8.14%. Continuous EUR 500 → EUR 920.81,
balance drawdown 13.96%, win rate 51.40%,
mean hold 89.70m. It increased overall profit factor
but reduced six-month return and trading activity; August stayed negative.
Replacing swings with model direction performed worse in August.

Decision: **retain RESEARCH_BASE unchanged**. Kronos remains an experimental
lab option, not a promoted default. This study did not find a variant that
demonstrated universal or faster profitability. Neither a different model seed
nor execution latency nor fine-tuning was tested; no live code was changed.

Single-pair August audit of the selected filter, identical parameters for all
pairs, independently starting at EUR 500, session pool restriction removed:

| Pair | Trades | Return |
|---|---:|---:|
| AUDCAD | 0 | 0.00% |
| AUDJPY | 2 | -0.83% |
| AUDUSD | 3 | -2.42% |
| EURAUD | 3 | 0.39% |
| EURCHF | 3 | -3.72% |
| EURGBP | 0 | 0.00% |
| EURJPY | 2 | 0.97% |
| EURUSD | 3 | -2.02% |
| GBPAUD | 2 | -1.79% |
| GBPCHF | 0 | 0.00% |
| GBPJPY | 1 | 2.60% |
| GBPUSD | 2 | 1.53% |
| NZDJPY | 0 | 0.00% |
| NZDUSD | 7 | -7.11% |
| USDCAD | 3 | -3.65% |
| USDCHF | 5 | -7.36% |
| USDJPY | 3 | -3.90% |

Only 4 of 13 active pairs were positive, and only 2 pairs had at least 5 trades.
Four pairs had no qualifying trades. This is insufficient evidence of universal
profitability; portfolio profit must not be confused with profit on every pair.

Forecast hash: `46e193f021f493d846ea793fcf529b50ade739d92ee0b86ef2acd1b1621202af`.
Dataset fingerprint: `74d5a76a637b5a66162a1b8cca690e0ea00739451932f306ffd905ced6b8c327`.
Executed engine snapshot: `44d9807420ffb8604f1368bce60e5248942b82d8aa9f66c60abc0cce563aafbd`;
subsequent changes only clarify CLI help and reject incompatible mode options.
Tests passed: accepted-base identity, all 960 scenarios preserving base
exits/risk, filter versus detector behavior, missing/future-context rejection,
and the existing causal execution/risk/trailing tests.

## Fixed daily-pattern study — 2026-09-07

**Superseded after the later reproducibility audit.** Although this run used
greedy decoding, the loaded PyTorch model had not been switched to evaluation
mode. Active dropout made repeated forecasts differ. The figures below remain
an audit record and must not be used for selection or live implementation.

Run with `--kronos-runtime ... --daily-objective`. This is a separate study,
created because aggregate six-month profit can hide losing months and because
the historical batch-seeded forecasts above were not independent of request
ordering.

The candidate pattern is shared by all 17 pairs. It keeps the M15 Green/Red
reversal, confirmed swing direction, stop entry, candle/ATR stop and existing
2R/conditional-trail exit. It removes BB, RSI, volume, candle-quality,
volatility-regime and pair-ranking filters. No pair profiles are read. The
search varies only fixed schedules, 1/2/3/5 portfolio slots, fixed daily order
caps, and three H1 Kronos roles/thresholds (filter, veto and predicted room). A
daily cap counts placed orders and does not inspect profit or previous outcomes.

Kronos reads the last 64 fully closed H1 bid candles and predicts one or two H1
candles. This run incorrectly assumed that greedy `top_k=1` alone guaranteed
repeatability; the later audit disproved that assumption. Repeated signals
sharing the same H1 close reused the forecast in RAM. The run required
28,357 unique contexts for 35,262 eligible signals from 36,039 raw pattern
signals. It took 1,111.94 model seconds and 335.41 MiB peak Python RSS. Nothing
was written to the historical dataset or a forecast cache.

Evaluated 1,473 configurations: the accepted base comparator plus 1,472 pure
universal variants. Selection used March, April, May, June and July as separate
folds plus July at 1.25x spread. Every fold had to have more than 50% profitable
active days and positive mean R per calendar weekday. August was evaluated only
after ranking; it was already inspected in prior work and is diagnostic, not a
fresh holdout.

**Result: zero universal variants passed the development gate.** The highest
ranked failed diagnostic was Kronos predicted-room on H1: predict two H1 bars,
require aligned terminal movement, at least 1.5R predicted favorable excursion
and at most 1R adverse excursion; trade Asia/London/overlap, at most two orders
per day and two simultaneous portfolio positions.

| Period | Return | Trades | PF | Profitable active days | Mean R / weekday |
|---|---:|---:|---:|---:|---:|
| March | +3.67% | 30 | 1.2401 | 45.00% | +0.016 |
| April | -0.95% | 34 | 0.9296 | 45.00% | -0.146 |
| May | -3.36% | 24 | 0.7066 | 38.89% | -0.158 |
| June | +3.35% | 32 | 1.3692 | 61.11% | +0.212 |
| July | -0.56% | 29 | 0.9467 | 36.84% | +0.017 |
| August diagnostic | -11.16% | 27 | 0.2214 | 11.11% | -0.795 |
| March–August continuous | -9.38% | 176 | 0.8757 | 39.82% | -0.131 |

Continuous EUR 500 → EUR 453.12; balance drawdown 18.28%; 45 positive and
68 negative active days, 17 no-trade weekdays, longest losing-day streak eight.
Maximum observed nominal trade risk was 2.09%, open risk 3.38% and margin
89.83%, all inside the configured ceilings. The chosen room filter generated
almost no New York activity and was not universal pair-by-pair.

A reproducible 10,000-trial, 20-day bootstrap over realized daily R, normalized
to the full 3% risk ceiling, estimated 70.20% losing months; median return
-9.51%, 5th/95th percentiles -32.32%/+24.83%, median maximum drawdown 19.33%.
This is a conservative risk-normalized approximation, not the exact varying-size
equity path. Future runs bootstrap the recorded daily percentage returns.

The accepted aggregate-profit base also failed the daily gate: June and July
had only 47.62% and 47.83% profitable active days, and August had 35.29%.
Therefore neither the pure pattern nor a Kronos role is promoted. `RESEARCH_BASE`
and protected live code remain unchanged. A deterministic rule can be evaluated
consistently each day, but no backtest can establish profit on every individual
day; promotion requires positive daily expectancy across unseen rolling windows.

Forecast hash: `dc9822e53bb04478ce9cb83237452104687a1d742b8ce59e68df5f8f05b03609`.
Dataset fingerprint: `74d5a76a637b5a66162a1b8cca690e0ea00739451932f306ffd905ced6b8c327`.
Source data/helper unchanged check: true.

## Corrected universal daily search — 2026-09-07

**Superseded after the money-day audit.** Fills and forecasts in this section
are reproducible, but selection counted a day by summed R instead of its actual
cash P&L. The final audited experiment below fixes that objective. These figures
remain only as an audit trail and must not be promoted.

This experiment replaces the superseded daily study above. It keeps live code,
`RESEARCH_BASE`, pair profiles and historical JSONL files unchanged.

### Protocol

- Exactly 1,200 seconds of autoresearch after data preparation: 50,032 mutation
  attempts and 34,947 unique configurations. Fast selection used M5 execution;
  60 diverse finalists were replayed on recorded M1 bid/ask data.
- Three-month training: March–May. Monthly gates used March, April, May, June
  and July separately plus June–July at 1.25x spread. August was evaluated only
  after freezing the candidate and is a previously inspected diagnostic.
- Shared rules for all 17 FX pairs; no pair-profit profiles. At each session
  start, 3/5/7/all pairs were compared only by spread divided by current ATR.
- M15 and H1 Green/Red signals; confirmed swing variants; optional H1/H4 trend;
  simple BB/RSI/volume/quality filters; stop/limit entry; candle/swing/ATR SL;
  R/ATR/structure TP; fixed and trailing exits; 1–5 slots.
- All four sessions are enabled and there is no daily order cap. `sessionFlat`
  prevents a trade crossing into the next session. One active trade per pair.
  Per-trade nominal risk is at most 3%, portfolio risk at most 15%, and margin
  at most 90%, divided across configured slots.
- The server is synchronized UTC. Session classification uses IANA London and
  New York zones, including daylight-saving changes. Germany was UTC+2 at the
  audit time; broker JSON timestamps and snapshot times were consistent.

The first multi-timeframe run was discarded because its event-filter cache key
omitted signal timeframe and could reuse M15 events for an H1 candidate. The
corrected run added timeframe to the key and was executed from scratch. This is
recorded rather than silently replacing the defective experiment.

### Corrected core result

Zero finalists passed every monthly daily gate. The highest-ranked failed core
uses M15 Green/Red reversal, confirmed lows with pivot width 4, the seven best
session pairs by spread/ATR, BB room, body at least 0.4 of range and 0.3 ATR,
activity at least 1, ATR percentile 0.3–0.9, H4 two-bar move at least 0.1 ATR,
stop entry 0.1 ATR beyond the signal, swing-3 SL with 0.2 ATR buffer and minimum
0.75 ATR, and 1.5R TP. Pending expiry is 60 minutes. It uses one slot, no daily
cap and session flattening. Target and trailing activation are both 1.5R, so TP
executes first and the observed strategy is effectively fixed-target.

| Period | Return | Trades | PF | Profitable active days | Sessions A/L/O/NY |
|---|---:|---:|---:|---:|---:|
| March | +33.95% | 46 | 1.8147 | 70.00% | 12/11/19/4 |
| April | +14.31% | 52 | 1.3329 | 66.67% | 12/16/18/6 |
| May | +7.47% | 28 | 1.3269 | 68.75% | 6/13/7/2 |
| June | +11.35% | 42 | 1.3690 | 52.38% | 12/15/9/6 |
| July | -1.25% | 50 | 0.9706 | 40.91% | 14/19/15/2 |
| August diagnostic | -8.81% | 31 | 0.6037 | 42.86% | 7/10/10/4 |
| March–August continuous | +64.97% | 249 | 1.2141 | 57.02% | 63/84/78/24 |

Continuous EUR 500 → EUR 824.83 with 17.08% balance drawdown. Increasing slots
reduced returns because the 90% margin allocation was divided while qualifying
signals rarely overlapped: August was -8.81/-5.33/-3.44/-2.81/-2.64% for
1/2/3/4/5 slots. More capacity reduced position size; it did not create edge.

### Deterministic Kronos audit

Kronos was applied only after the core signal and therefore needed 475 unique
H1 contexts for 503 signals. Model inference now calls `model.eval()` and
enables deterministic PyTorch algorithms. Two independent model loads produced
the same complete forecast hash and identical statistics:
`a1b5606b6b8a2474587e82a4fc04244b15968d11f64e6e0d524d62e46f382a81`.
One inference pass took 20.61 model seconds and 332.52 MiB peak Python RSS.

The development-selected result uses Kronos as a veto: predict two H1 candles
and reject the trade only when terminal movement is at least 0.25 signal ATR
against it. It retains one slot and every frozen core rule.

| Period | Return | Trades | PF | Profitable active days |
|---|---:|---:|---:|---:|
| March | -3.53% | 33 | 0.8922 | 50.00% |
| April | +14.55% | 35 | 1.5382 | 72.22% |
| May | -0.12% | 17 | 0.9926 | 58.33% |
| June | +9.20% | 31 | 1.4220 | 50.00% |
| July | +3.94% | 31 | 1.1673 | 52.94% |
| August diagnostic | -0.70% | 17 | 0.9422 | 55.56% |
| March–August continuous | +24.51% | 164 | 1.1702 | 56.52% |

Continuous EUR 500 → EUR 622.55; balance drawdown 14.48%. Maximum nominal/open
risk was 3.00% and margin 90.00%. The 10,000-trial, 20-day bootstrap gave 37.83%
losing months, median +3.27%, 5th/95th percentiles -12.39%/+22.28%, and median
maximum drawdown 7.40%.

Decision: Kronos veto substantially reduced the August loss but did not remove
it, and March/May/June also failed the strict daily gate. No tested candidate is
universal or reliably profitable each day. Keep `RESEARCH_BASE` unchanged and
do not migrate this candidate to protected live code. H1 is useful as context;
M15 remains the stronger signal timeframe. The next valid evidence must come
from new, uniformly covered rolling windows rather than more tuning on August.

## Actual-P&L universal daily search — 2026-09-07

This is the final audited run. The objective, positive-day count and losing-day
streak all use realized daily percentage P&L. March–May are the requested three
training months; June–July are development validation and spread stress; August
1–28 is scored only after freezing and is a previously inspected diagnostic.
Every split starts at EUR 500; the continuous result compounds from EUR 500.

The search ran for 1,200.029 seconds after preparation: 66,369 mutations,
48,870 unique configurations, and 60 diverse finalists replayed on M1. It tested
M15/H1 signals, confirmed swings, H1/H4 context, session pools of 3/5/7/all,
BB/RSI/volume/quality filters, stop/limit entry, candle/swing/ATR stops,
R/ATR/structure targets, fixed/always/conditional trailing, and 1–5 slots.
All rules are shared across pairs. All four sessions are enabled, there is no
daily order cap, and positions are flattened before the next session.

**No candidate passed every monthly and spread-stress gate.** All reported top
finalists used H1 signals; no M15 finalist reached the published top group. The
highest-ranked failed core uses: H1 Green/Red reversal; matching confirmed H1
highs and lows with pivot width 4; matching H4 swing direction; five pairs per
session chosen only by current spread/ATR; a one-point BB/RSI/volume score;
limit pullback 0.05 ATR; swing-3 stop with minimum 0.25 ATR; 1 ATR target;
break-even at 1R; always-on 0.75R/0.35R trailing; 45-minute pending expiry;
240-minute maximum hold; one portfolio slot. Risk remains at most 3% per trade,
15% portfolio and 90% margin. One trade per pair; no split exits or profiles.

| Period | Core return | Trades | PF | Profitable active days |
|---|---:|---:|---:|---:|
| March | +11.87% | 22 | 1.6716 | 69.23% |
| April | +18.29% | 24 | 3.6603 | 92.31% |
| May | +9.59% | 17 | 1.9900 | 83.33% |
| June | -1.49% | 25 | 0.9364 | 46.67% |
| July | +2.78% | 24 | 1.2175 | 56.25% |
| August diagnostic | -7.83% | 17 | 0.4079 | 33.33% |
| March–August continuous | +35.53% | 129 | 1.3234 | 64.10% |

Continuous core: EUR 500 → EUR 677.65, balance drawdown 16.89%. March–May
training was +45.16%; June–July validation +1.24%; 1.25x-spread validation
was -3.71%. The core therefore fails both regime and cost robustness.

With all other settings frozen, one slot plus always-on trailing was best on
development (+1.24%) but still lost -7.83% in August. Always-on trailing with
2/3/4/5 slots returned -6.02/-4.50/-3.34/-2.65% on development and
-6.39/-5.90/-4.41/-3.59% in August. Extra capacity reduced position size and
loss magnitude; it did not create positive expectancy. One slot remains the
research choice, not a live recommendation.

### Kronos on the frozen core

Kronos-mini evaluated 111 shared scenarios from 195 fully closed H1 contexts:
alignment filter, opposite-move veto and predicted-room filter, one/two-candle
horizons, common ATR thresholds and 1–5 slots. Movement-detector evidence is in
the earlier global experiment above; it performed worse than keeping confirmed
price-action direction, so this stage applies Kronos only after the frozen core
signal. Inference is deterministic (`model.eval()`, deterministic PyTorch,
greedy top-k-1): 7.48 model seconds, 331.95 MiB peak Python RSS. Preparing the
full dataset on the Pi requires `NODE_OPTIONS=--max-old-space-size=4096`; the
default 2 GiB V8 heap is insufficient, while model inference itself is light.

| Kronos role | Development | Stress | August | Six-month | Trades | Active days |
|---|---:|---:|---:|---:|---:|---:|
| None | +1.24% | -3.71% | -7.83% | +35.53% | 129 | 78 |
| Alignment filter | +0.28% | +0.19% | -2.07% | +7.72% | 68 | 47 |
| Opposite-move veto | +5.04% | -0.05% | -9.23% | +29.38% | 120 | 73 |
| Predicted room | +6.04% | +5.81% | +0.35% | +24.03% | 23 | 21 |

The development-selected Kronos option is an H1 one-candle veto: reject only a
forecast at least 0.5 signal ATR against the trade. It improved June–July but
failed the daily gate in June (46.67% positive active days), missed spread
robustness by 0.05%, and made August worse. Its continuous path was EUR 500 →
EUR 646.89, PF 1.2894 and 15.39% drawdown. A 10,000-trial, 20-day bootstrap of
its realized daily percentage returns estimates 31.33% losing months; median
+3.85%, 5th/95th percentiles -8.32%/+19.13%, median max drawdown 4.69%.

Predicted room is the only tested role positive in every monthly return, but it
is not a fast daily system: just 23 trades and 21 active days in 130 weekdays,
with 109 no-trade days. August contains only two trades. This is too sparse to
claim robustness or universality and it is not selected after seeing August.

Decision: keep `RESEARCH_BASE` and protected live code unchanged. Neither the
core nor Kronos met the promotion gate; profitability on every day cannot be
guaranteed by a fixed causal pattern. The next meaningful test is a fresh,
uniformly covered rolling period, followed by walk-forward and Monte Carlo—not
more fitting to the already inspected August window.

Forecast hash: `799f57e8762492c3354279537ff893cb69ad0730069da1c7ff137ba2159bc6c9`.
Dataset fingerprint: `74d5a76a637b5a66162a1b8cca690e0ea00739451932f306ffd905ced6b8c327`.
Source data/helper unchanged check: true. No historical JSONL, pair profile,
paper strategy or protected live file was changed.

## Ten-minute daily-activity search — 2026-09-07

This follow-up freezes `RESEARCH_BASE` and searches a separate universal,
stateless configuration. Its literal promotion gate is: every weekday has at
least three entries, at least two thirds of that day's trades win, daily cash
P&L is positive, aggregate win rate exceeds 50%, and every session remains
represented in every monthly and spread-stress fold. There is one position per
pair, no pair profile, no daily cap, at most five simultaneous positions, 3%
maximum nominal risk per trade, 15% portfolio risk and 90% margin. Each slot
receives the same maximum margin budget; instrument units can still differ
because stop distance and contract specifications differ.

After preparation, the core search ran for 600.136 seconds: 9,443 mutations and
7,848 unique configurations. It compared M15/H1 signal timeframes, confirmed
high/low swings, all sessions, session spread/ATR selection, BB, RSI, volume,
candle body, efficiency, activity, ATR regimes, EMA20/EMA50 alignment and
slope, stop/limit entries, candle/swing/ATR stops, 0.5–3R and ATR targets,
fixed/break-even/conditional trailing, 15–120 minute expiry, 30–720 minute
holding time, and 1–5 slots. March–May are training, June–July validation,
August 1–28 is a previously inspected diagnostic, and every split starts at
EUR 500.

The best development-ranked core is M15; confirmed lows with pivot width 4;
three pairs per session ranked only by spread/ATR; activity at least 0.75;
ATR percentile 0.15–0.90; volume at least its rolling mean; BB rejection/room;
stop entry; candle stop plus 0.2 ATR, minimum 0.5 ATR; 0.5R target; 15-minute
expiry; session flattening; and three slots. EMA, RSI, body and efficiency
filters were rejected by the search. Its conditional trail activates at 0.75R,
after the 0.5R target, so exits are effectively fixed-target.

| Period | Return | Trades | Win rate | PF | Days with 3+ trades | 2-of-3 positive days |
|---|---:|---:|---:|---:|---:|---:|
| March | +3.32% | 177 | 67.80% | 1.0608 | 90.91% | 63.64% |
| April | -2.43% | 125 | 62.40% | 0.9102 | 95.46% | 54.55% |
| May | -3.46% | 126 | 61.11% | 0.8658 | 90.48% | 47.62% |
| June | -3.89% | 123 | 64.23% | 0.8595 | 95.46% | 40.91% |
| July | -6.37% | 147 | 57.82% | 0.7858 | 100.00% | 47.83% |
| August diagnostic | +0.59% | 124 | 65.32% | 1.0281 | 80.00% | 40.00% |
| March–August continuous | -11.89% | 822 | 63.26% | 0.9345 | 92.31% | 49.23% |

Continuous equity was EUR 500 → EUR 440.56 with 19.41% drawdown. Mean activity
was 6.32 trades per weekday. The high win rate is misleading: 0.5R winners did
not pay for full stop losses and costs. Maximum observed nominal trade risk was
2.986%, margin 89.900%, and concurrent exposure 5.548 nominal risks. New York
also remained sparse (28 of 822 trades, and none in August), so the requested
session-independent activity gate was not met.

### Corrected Kronos role comparison

Kronos-mini produced deterministic forecasts for 2,199 unique fully closed H1
contexts (2,834 signal aliases), using one/two-H1-candle horizons. Inference
took 90.664 seconds and peaked at 333.89 MiB model-process RSS. The frozen core
was compared with Kronos as alignment filter, opposite-move veto, replacement
movement detector, contemporaneous-signal quality ranker and predicted-room
filter, with common thresholds and slot counts.

The first quality-ranking run was discarded: when `slots >= pool`, reordering
could not change selected trades. The grid now excludes that no-op case and the
entire deterministic Kronos stage was rerun. This is a research defect found
during the requested LLM supervision, not a favorable result retained after
inspection.

| Role | Train | Validation | Stress | August | Six-month | Trades | 3+ trade days | 2-of-3 days |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| None | -2.69% | -9.98% | -7.86% | +0.59% | -11.89% | 822 | 92.31% | 49.23% |
| Alignment filter | -1.03% | -4.45% | -3.40% | +1.82% | -3.79% | 440 | 62.31% | 36.15% |
| Movement detector | -16.52% | -12.25% | -12.21% | +1.22% | -25.84% | 883 | 92.31% | 37.69% |
| Opposite veto | +1.21% | -11.54% | -9.12% | +7.26% | -4.02% | 624 | 88.46% | 50.00% |
| Quality ranker | +3.27% | -15.09% | -11.50% | +0.32% | -12.02% | 773 | 92.31% | 50.00% |
| Predicted room | -1.45% | -3.48% | -4.08% | +0.19% | -4.75% | 289 | 36.92% | 17.69% |

The development-selected model scenario is the H1 two-candle quality ranker
with pool 3 and two slots. Its continuous PF is 0.9546, drawdown 25.83%, and
EUR 500 becomes EUR 439.90. A 10,000-trial 20-day bootstrap estimates 57.89%
losing months, median -1.60%, 5th/95th percentiles -16.63%/+12.62%, and median
maximum drawdown 7.72%.

**Decision: no promotion.** No core or Kronos role passed the frozen gate. The
alignment filter is the least bad six-month result and drawdown reducer, but it
removes too much daily activity. Kronos as the movement detector is clearly
worse; the veto and quality roles overfit development and fail validation.
Neither a greater than 50% win rate nor three daily entries establishes positive
expectancy. `RESEARCH_BASE`, historical source files, pair profiles and all
protected live files remain unchanged.

Reproduction uses `NODE_OPTIONS=--max-old-space-size=4096 node
lab/autoresearch/train.js --dataset <remote-dataset> --seconds 600
--daily-activity-search`; pass the frozen core back through `--kronos-core` with
`--daily-activity-objective` for the model comparison.

Forecast hash: `ee796f08fba4fadb818ae7dc3b301d6a042f1194de635f2af55fce30f15b8d8b`.
Dataset fingerprint: `74d5a76a637b5a66162a1b8cca690e0ea00739451932f306ffd905ced6b8c327`.
Broker-rules hash: `4c2e3dc8c4fbfe2f0232a9ed060dc08c18e7f1a244e46d1d5f84be1a4b2b31da`.
Source data/helper unchanged check: true.

## Universal direct-entry alternatives and Kronos — 2026-09-07

This follow-up tested a replacement for Green/Red rather than another pair
profile. The hypotheses came from research on
[intraday time-series momentum](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3460965),
[intraday FX momentum](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2694985),
and the BIS survey of FX algorithms using momentum, mean reversion, correlation
and macro-release responses
([BIS paper](https://www.bis.org/publ/mktc05.pdf)). These papers motivate tests;
they do not establish an edge for this broker, period or execution model.
News scraping was not included because no timestamp-correct historical news
snapshot exists in the dataset; adding present-day search results to old candles
would introduce look-ahead.

`--alternative-search` now compares the same causal rule across all pairs:
M15/H1 momentum, channel breakout, EMA trend, Bollinger mean reversion,
session VWAP trend/reversion, higher-timeframe pullback, efficiency-adaptive
trend/reversion, prior-session momentum/reversion and opening-session
momentum/reversion. Entries are immediate at the next M1 open. Search covers
fixed-R, ATR and VWAP targets, candle/swing/ATR stops, break-even/trailing,
1–5 slots, 0.5–3% nominal risk, filters, session caps and higher-timeframe
confirmation. One position per pair, 15% portfolio risk and 90% equally divided
slot margin remain enforced. There are no pair-specific thresholds.

March–May are search/training, June–July are validation, and August 1–28 is an
already inspected diagnostic. Every split starts at EUR 500. Search and final
execution use recorded M1 bid/ask; a preliminary M15 approximation was rejected
after it produced a false +15.84% result that became negative under M1 fills.
The objective penalizes the worst training month and final acceptance requires
positive return, PF above 1, win rate above 50%, at least 2.5 trades per weekday,
more than 50% positive weekdays and all sessions represented in every monthly
fold and the +25% spread-stress fold.

Two 10-minute exact searches completed:

- seed 20260909: 600.47 seconds, 578 unique configurations. The least-bad
  robust candidate was M15 eight-bar momentum, next-M1 market entry, candle
  stop, 1R target, four slots and 0.5% risk. Train was +1.32% (195 trades,
  51.28% wins, PF 1.0424); validation was -2.19% (139 trades, 45.32%,
  PF 0.8765); stress was -3.55%. Monthly returns were -0.25%, +1.70%,
  -0.17%, -0.18% and -2.01%. It failed.
- seed 20260910: 605.54 seconds, 504 unique configurations, with stronger
  worst-month scoring and family diversity. The formal minimax leader was
  M15 opening-session reversion after two bars, but train was -10.95%,
  validation -3.38% and stress -3.95%. M15 mean-reversion and VWAP candidates
  briefly reached about +4.1% on aggregate training but did not survive the
  monthly/validation gate. H1 signal variants did not rank above M15. No
  configuration was eligible.

The frozen near-breakeven momentum core was then evaluated with Kronos-mini as
an H1 alignment filter, adverse-forecast veto, direction detector, quality
ranker and predicted-room filter. Kronos processed 1,067 unique contexts for
1,115 qualifying signals in 47.52 model seconds, peaking at 332.73 MiB RSS on
the Pi 5. The grid contained 199 scenarios. A room-filter defect for market
entries was found before statistics were accepted: its causal estimate now uses
the known signal close, while actual fills still use the next M1 open; the full
deterministic run was repeated.

No Kronos scenario passed. The development-selected H1 one-bar quality ranker
returned -0.16% on train, -3.00% on validation and -4.32% under spread stress.
August diagnostic was +0.42%, but the continuous six-month result was -2.69%
(EUR 486.53), 391 trades, 49.10% wins, PF 0.9521 and 5.94% drawdown. Activity
averaged 3.01 trades per weekday, yet only 49.23% of weekdays were profitable.
A deterministic 10,000-trial bootstrap of 20 trading days estimated 56.86%
losing months, median -0.46%, 5th/95th percentiles -4.79%/+3.99%, and median
maximum drawdown 2.55%.

Decision: no promotion to live. For this dataset, M15 is the least-bad signal
timeframe, but neither it nor H1 has a validated positive edge at the requested
daily frequency. Kronos is operationally viable on the Pi, but filter/detector/
ranker use did not manufacture positive expectancy. The official Kronos paper
reports K-line forecasting and a long-only Chinese A-share simulation
([AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/39730)); that is not
evidence for intraday retail FX. The historical data and protected live system
remain unchanged.

Dataset fingerprint: `74d5a76a637b5a66162a1b8cca690e0ea00739451932f306ffd905ced6b8c327`.
Broker-rules hash: `4c2e3dc8c4fbfe2f0232a9ed060dc08c18e7f1a244e46d1d5f84be1a4b2b31da`.
Kronos forecast hash: `2eedba728f1528482e98ad934b1950dab02838ada9a6d2749192add534934f82`.
Source data/helper unchanged check: true.

## Legacy three-file contract

Original adaptation of [`karpathy/autoresearch`](https://github.com/karpathy/autoresearch):

- `prepare.js` — fixed causal data preparation, evaluator, split, objective,
  and acceptance gates;
- `train.js` — the only agent-editable candidate strategy;
- `program.md` — the human-editable autonomous research protocol.
