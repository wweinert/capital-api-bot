# Trading autoresearch

Minimal adaptation of [`karpathy/autoresearch`](https://github.com/karpathy/autoresearch)
for offline Capital FX strategy research. The same three-file contract is used:

- `prepare.js` — fixed causal data preparation, evaluator, split, objective,
  and acceptance gates;
- `train.js` — the only agent-editable candidate strategy;
- `program.md` — the human-editable autonomous research protocol.

Run a preflight and one candidate with:

```sh
node lab/autoresearch/train.js --dataset /path/to/snapshot --symbols EURUSD,GBPUSD --check
node lab/autoresearch/train.js --dataset /path/to/snapshot --symbols EURUSD,GBPUSD
```

Run a bounded autoresearch session without reloading the dataset between
candidates with:

```sh
node --max-old-space-size=8192 lab/autoresearch/train.js \
  --dataset /path/to/snapshot \
  --daily \
  --symbols AUDCAD,AUDJPY,AUDUSD,EURAUD,EURCHF,EURGBP,EURJPY,EURUSD,GBPAUD,GBPCHF,GBPJPY,GBPUSD,NZDJPY,NZDUSD,USDCAD,USDCHF,USDJPY \
  --search-seconds 1200 \
  --report lab/autoresearch/reports/search.json
```

The snapshot must contain `SYMBOL_{M1,M5,M15,H1,H4,D1}.jsonl` for every
requested symbol. Daily mode uses only the last completed D1/H4/H1/M15/M5/M1
candles plus the current UTC day's causally observed M1 range.
Both nested `bid`/`ask` candles and Capital `openPrice`/`closePrice` records are accepted.
Evaluation is offline. The daily W07-W32 protocol is development-only because
June-August has already been inspected; it must not be described as a fresh
locked test.

The daily selection objective prioritizes profitable active-day percentage and
daily activity while retaining weekly profitability, profit factor, sample
size, and drawdown as rejection gates. Positions are forcibly flat by 22:00
UTC. Cash P/L uses causal
quote-currency-to-EUR conversion and risk/margin-constrained sizing. Broker
dealing rules, gap/slippage stress, and financing costs still belong to the
next harness stage.

Cross-session experiments retain only completed session state. The supported
causal transitions are New York to Asia, Asia to London, London to overlap,
and overlap to New York. Candidate families can combine the previous session's
direction with the historical score>=3 logic, M5/M1 Green-Red, Bollinger or
RSI triggers. Per-symbol day/session loss breakers stop new entries after a
configured number of losing positions.

Same-day-simple experiments reset directional state at every UTC date. They
can use the move from today's open, the current session's move, or a completed
session from the same date as the sole trend filter, followed by exactly one
entry trigger (M1/M5 Green-Red, Bollinger, or RSI). D1/H4 and legacy scoring are
not consulted by the `intraday-simple` signal family. ATR remains an execution
and scale unit for stops/sizing; it does not choose direction.

M15/H1 Green-Red runner experiments use only the last closed H1 candle for
trend filtering and a freshly closed M15 continuation candle for the signal.
The control position keeps its 2R target. Runner variants wait for +1R, move
the stop to breakeven, remove the fixed target, and then update a trailing stop
from completed M1 monitoring candles. `trailR` is expressed in multiples of
the position's original stop distance; `trailATR` remains available for ATR
distance. Momentum-gated runners may require either a maximum time to +1R or
a minimum M15 signal-body/ATR ratio. These are candle proxies, not tick or
historical order-flow measurements.

The structural price-action portfolio experiment extends the M15 trigger to a
causal impulse, one-to-six-candle pullback, and first resumption candle with a
lower-high/higher-low check. It also cancels a pending order when the setup is
invalidated before entry, rejects excessive spread relative to M15 ATR, and
divides 90% available margin into five equal position budgets:

```sh
node --max-old-space-size=8192 lab/autoresearch/train-price-action-portfolio.js \
  --dataset /path/to/snapshot \
  --search-seconds 1200 \
  --report lab/autoresearch/reports/m15-price-action.json
```

This series compares train-selected pair/session portfolios with a separately
labelled post-search stability diagnostic. A post-search portfolio selected
after inspecting validation is never independent walk-forward evidence.

The session-liquidity-sweep experiment formalizes the video's intraday setup:
build DST-aware Asia and Frankfurt ranges in Europe/London time, require a
boundary sweep and rejection, then require an M15 displacement, correction,
and resumption candle. It compares the opposite range boundary with the stated
1.6R scalp exit and keeps the sweep extreme as the structural stop:

```sh
node --max-old-space-size=8192 lab/autoresearch/train-session-liquidity-sweep.js \
  --dataset /path/to/snapshot \
  --report lab/autoresearch/reports/session-liquidity-sweep.json
```

The author's discretionary supply/demand, order-block, and volume-profile
zones are deliberately excluded unless a causal definition and suitable
historical inputs exist. Forex candle volume is tick volume rather than a
centralized exchange tape, so it is not equivalent to a futures volume profile.

A timed report preserves both `winner` (best fixed objective) and
`profitLeader` (highest return among candidates that passed every gate). This
keeps the robustness ranking separate from an explicitly profit-first choice.
Reproduce the stored winner without copying its parameters into `train.js`:

```sh
node --max-old-space-size=8192 lab/autoresearch/train.js \
  --dataset /path/to/snapshot --daily --candidate-report path/to/report.json
```

Use `--candidate-symbols AUDJPY,GBPJPY` for a declared portfolio replay. Keep
the conversion symbols in `--symbols` (for JPY pairs this includes EURJPY).

The JSON files in `reports/` are legacy evidence, not comparable leaderboard
runs. Their forward periods have already been inspected and must not be reused
as a new holdout. A passing autoresearch result is only a candidate for the
later harness and human review.
