# Signal Quality Dataset Report

- generatedAt: 2026-05-07T18:10:23.847Z
- signalDataset: /Users/waldemarweinert/DEV/trading/capital-api-bot/ml/datasets/processed/signal_quality_dataset.jsonl
- signalCsv: /Users/waldemarweinert/DEV/trading/capital-api-bot/ml/datasets/processed/signal_quality_dataset.csv
- signalSft: /Users/waldemarweinert/DEV/trading/capital-api-bot/ml/datasets/llm/trading_signal_quality_sft.jsonl
- forecastDataset: /Users/waldemarweinert/DEV/trading/capital-api-bot/ml/datasets/processed/forecast30m_dataset.jsonl
- modelDecisionOutcomes: /Users/waldemarweinert/DEV/trading/capital-api-bot/ml/datasets/processed/model_decision_outcomes.jsonl
- rowCount: 902
- forecastRowCount: 2
- dateRange: 2026-02-04T05:15:00.000Z .. 2026-05-07T15:15:00.000Z
- symbols: AUDCAD, AUDJPY, AUDUSD, EURAUD, EURCHF, EURGBP, EURJPY, EURUSD, GBPAUD, GBPCHF, GBPUSD, NZDJPY, NZDUSD, USDCAD, USDCHF, USDJPY
- executedLiveRows: 46
- liveRows: 46
- researchRows: 856
- averageRealizedR: 0.2819

## Class Balance

- ALLOW_TRADE: 603
- BLOCK_TRADE: 243
- NO_OPINION: 52
- REDUCE_RISK: 4

## Sessions

- asian: 276
- london: 227
- ny: 226
- off_session: 165
- momentum: 8

## Strategy Families

- momentum_continuation: 864
- PA_HIGHER_LOW_LOWER_HIGH: 38

## Today Live Snapshot

- strategy decision rows on 2026-05-07: 1187
- blocked:max_positions_reached on 2026-05-07: 1027
- signal rows on 2026-05-07: 6
- today live trade rows used in dataset: 6

- 2026-05-07T00:15:30.801Z EURJPY SELL: realizedR=-0.7071, maxFav60=0.9192, maxAdv30=-2.3131, rootCause=timing_or_protection_failure
- 2026-05-07T00:30:11.595Z AUDJPY SELL: realizedR=0.3725, maxFav60=1.7059, maxAdv30=0.0294, rootCause=worked_or_neutral
- 2026-05-07T02:00:11.870Z AUDJPY BUY: realizedR=2.41, maxFav60=0.43, maxAdv30=-0.61, rootCause=worked_or_neutral
- 2026-05-07T12:45:11.867Z AUDJPY SELL: realizedR=-0.102, maxFav60=1.051, maxAdv30=-0.0918, rootCause=exit_or_management_failure
- 2026-05-07T15:00:51.584Z GBPUSD BUY: realizedR=-0.8218, maxFav60=-0.2178, maxAdv30=-2.1782, rootCause=entry_failure
- 2026-05-07T15:30:34.562Z EURUSD SELL: realizedR=null, maxFav60=0.83, maxAdv30=-0.53, rootCause=open_trade

## Missing Fields

- spreadPips missing in 38 rows
- realizedR missing in 1 rows
- forecast log sample is too small (2 rows)
- model decision sample is too small (2 rows)
- capital-dataset M15 rows stop at 2026-05-04 while live price logs continue into 2026-05-07
- M1 archive is only partial for 4 symbols

## Data Leakage Risks

- trading_signal_quality_sft.jsonl uses only pre-trade fields in the prompt, but labels are still heuristic and derived from realized future outcomes.
- Research rows come from backtest simulation, not broker fills; they are useful for pretraining but not sufficient for live deployment validation.
- Live logging historically skipped strategy evaluation when MAX_POSITIONS was already filled; this was fixed forward in services/trading.js, but past missed-opportunity labels remain unavailable.
- Wide-spread live signals are present and were not filtered out by strategy runtime, which can poison labels if not modelled explicitly.

## Training Readiness

- Signal-quality dataset readiness: no
- Forecast dataset readiness: no
- RTX 4090 training suitability: signal-quality pretraining can start, but a production-grade Trading LLM still needs more real forecast/model logs, fresher full candle archives, and human-reviewed labels before deployment.
