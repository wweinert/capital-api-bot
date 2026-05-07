# Trading Model Layer Dataset Foundation

This directory is the staging area for a future Trading LLM / model layer. The current implementation does not train a model and does not replace the strategy. It prepares stable logs and schemas so future training jobs can build datasets from live/demo/shadow observations.

## Runtime Logs

The Node.js bot writes model-layer JSONL rows to:

- `logs/model_forecasts.jsonl`
- `logs/model_signal_quality.jsonl`
- `logs/model_decisions.jsonl`

These files are intentionally ignored by git. They can contain broker-derived market context and should be treated as training data, not source code.

## Dataset Inputs

Future datasets should join:

- model forecasts from `logs/model_forecasts.jsonl`
- model signal quality decisions from `logs/model_signal_quality.jsonl`
- final bot decisions from `logs/model_decisions.jsonl`
- executed trade logs from `backtest/logs/*.jsonl`
- strategy decision logs from `backtest/logs/strategy-decisions.jsonl`
- research candidate metadata from `research/` and `research/intraday/`
- historical candles from `backtest/generated-dataset/` or broker downloads

## Future Labels

Expected labels for supervised training:

- `forecast30mActualDirection`
- `forecast30mActualMovePips`
- `realizedR`
- `maxAdverseR`
- `maxFavorableR`
- `hitProfitBeforeStop`
- `modelDecisionWasCorrect`
- `blockedTradeWouldHaveWon`
- `blockedTradeWouldHaveLost`
- `marketWasNoTradeZone`

## Planned Layout

- `schemas/`: strict JSON contracts for model outputs.
- `datasets/`: dataset manifests and split metadata.
- `raw/`: copied raw logs or downloaded broker data.
- `processed/`: feature rows and labelled examples.
- `llm/`: prompts, adapters, and endpoint request/response examples.
- `reports/`: training and evaluation reports.

## Current Builder

Generate the current signal-quality and forecast datasets with:

- `npm run ml:build-datasets`

Outputs:

- `ml/datasets/processed/signal_quality_dataset.jsonl`
- `ml/datasets/processed/signal_quality_dataset.csv`
- `ml/datasets/llm/trading_signal_quality_sft.jsonl`
- `ml/datasets/processed/forecast30m_dataset.jsonl`
- `ml/datasets/processed/model_decision_outcomes.jsonl`
- `ml/reports/signal-quality-dataset-report.md`

Do not put API credentials, `.env` files, or broker session tokens in this directory.
