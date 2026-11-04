# AUD/USD M15 causal extremum-direction study — 2026-10-31

## Decision

Use M15 local structure plus a micro change of character (CHOCH) to mark the
H1 “comb” extrema. Do not use the signal by itself as permission to enter at
market on the next M15 candle: the extremum classifier transferred, but the
post-spread direction did not.

## Data and protocol

- Source snapshot: `/mnt/usb-ssd/trading/capital-dataset` on `waldemar-pi`.
- AUDUSD H1 SHA-256:
  `5756436aa211381e82227385e04ed99b167d0f45547cf2eaac3c75914e4f781e`.
- AUDUSD M15 SHA-256:
  `1c740cb44218df583e0f3764957747879b729c6e89a8fc1b131a42185cd3b772`.
- Available range ends at 2026-10-23; the 26–30 October screenshot cannot be
  replayed from this snapshot.
- H1 labels are radius-one extrema followed by at least 0.5 closed-H1 ATR of
  reversal within six H1 candles. The exact extremum time is resolved on M15.
- A signal matches a labelled extremum only from the extremum candle close
  through the following 75 minutes.
- Search: 2026-01-01 through 2026-05-31. Validation: June through August.
  The configuration was then frozen before the 2026-09-01 through 2026-10-23
  diagnostic was opened.
- 280 causal combinations were compared: colour flips, wick rejection,
  Bollinger+RSI, sweep/reclaim, sweep+CHOCH, pivot+CHOCH and divergence+CHOCH.
- Data defect: 453 H1 and 1,098 M15 source rows between June and July have no
  complete bid/ask fields. They were rejected, recorded, and signals spanning
  discontinuities were excluded; they were not silently repaired.

## Selected balanced “comb” detector

For BUY, one of the current or preceding four M15 candles must make a low no
higher than the preceding four-candle low. The confirming M15 candle must be
bullish, close above the preceding candle high, have body at least 0.1 M15
ATR(14), and close in the top 40% of its range. SELL is symmetric. RSI,
Bollinger Bands and volume did not improve this balanced classifier.

| Period | Recall of H1 extrema | Signal precision | F1 | Median delay |
|---|---:|---:|---:|---:|
| Train | 72.52% | 67.72% | 70.04% | 30 min |
| Validation | 68.91% | 55.32% | 61.37% | 30 min |
| Frozen diagnostic | 72.70% | 65.29% | 68.80% | 30 min |

## Selected high-precision detector

The selective version changes the prior-extreme lookback from four to twenty
M15 candles, requires RSI(14) <=35 at a prospective low or >=65 at a
prospective high, and requires the confirmation close to break the preceding
two-candle micro structure. Body and close-location gates remain unchanged.

| Period | Recall of H1 extrema | Signal precision | F1 | Median delay |
|---|---:|---:|---:|---:|
| Train | 20.19% | 77.32% | 32.02% | 30 min |
| Validation | 18.70% | 62.77% | 28.81% | 30 min |
| Frozen diagnostic | 20.54% | 72.38% | 32.00% | 15 min |

The 72.38% figure is classification precision, not trade win probability.

## Direction and executable-entry check

The proxy entered at the following M15 bid/ask open, used a 0.5 closed-H1 ATR
target, 0.35 ATR stop, three-hour horizon and conservative stop-first ordering.
The balanced detector's frozen diagnostic produced 130 target wins and 273
stop losses (32.26% of resolved cases). Its executable post-spread direction
accuracy was 40.78% after one hour, 45.39% after two hours and 48.54% after
three hours.

The selective detector was also not sufficient for a market entry: 32.69%
target-win rate and 40.95% / 40.00% / 50.48% direction accuracy over one, two
and three hours. A Bollinger-rejection plus RSI candidate looked stronger in
development, but decayed to 43.90% / 48.78% / 51.22% in the diagnostic and
caught only 4.05% of labelled extrema.

Conclusion: M15 pivot+CHOCH is a useful causal feature for identifying that an
H1 extremum has probably occurred. It is not a standalone direction/trade
signal. Any live candidate needs a separately tested entry trigger (for
example a stop beyond the confirmation candle), spread gate, invalidation and
exit rules. No live or protected strategy file was changed in this study.

## Reproduction

```sh
node lab/extremum-direction-study.js \
  /tmp/codex-audusd-extrema-20261023 \
  /tmp/audusd-extremum-report.json
```
