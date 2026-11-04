# AUD/USD H1 wave detection from M5/M15 — 2026-10-31

One self-contained `detectWave(symbol, indicators, candles)` function was
selected from 972 M5 and 972 M15 causal parameter combinations. H1 labels are
radius-one extrema followed by at least 0.5 H1 ATR of reversal within six
hours, resolved to the exact M5 extreme. Search used January–May, validation
used June–August, and September through 23 October was opened after selection.

Frozen parameters:

- M5 forming: 24-bar prior extreme, extreme may occur within the last 12 bars,
  close breaks the preceding three-bar structure, body >=0.1 ATR(14), close in
  the directional 40% of the candle.
- M15 confirmed: four-bar prior extreme, extreme may occur within the last
  four bars, close breaks the preceding candle, body >=0.2 ATR(14), close in
  the directional 45% of the candle.
- RSI was not selected.

Frozen diagnostic results:

| Output | Recall | Precision | F1 | Median delay |
|---|---:|---:|---:|---:|
| Any wave state | 97.19% | 56.80% | 71.69% | 15 min |
| `forming` | 69.82% | 62.57% | 66.00% | 15 min |
| `confirmed` | 87.72% | 60.83% | 71.84% | 25 min |

These are H1-extremum classification metrics, not trade win rates. The source
snapshot ends on 2026-10-23. Exact implementation: `lab/detect-wave.js`.
