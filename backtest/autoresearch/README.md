# Trading autoresearch

Adaptation of the experiment protocol from
[`karpathy/autoresearch`](https://github.com/karpathy/autoresearch) for the
Capital trading archive. It does not train a language model. Codex acts as the
researcher, while `prepare.js` is the fixed evaluator and `train.js` searches
the strategy space for a fixed wall-clock budget.

`train-mtf.js` is the multi-timeframe search. It scores M5, M15, H1 and H4
independently and compares majority, weighted, strict-alignment and
hierarchical consensus rules. M1 is retained as the entry trigger.

The live bot and source JSONL files are never imported or modified. Evaluation
uses a single OHLC price, next-bar entries, estimated round-trip spread costs,
and weekly walk-forward metrics.

Run on `waldemar-pi`:

```sh
SEARCH_SECONDS=600 CAPITAL_DATASET_DIR=/mnt/usb-ssd/trading/capital-dataset \
  node backtest/autoresearch/train.js
```

Multi-timeframe run:

```sh
SEARCH_SECONDS=600 CAPITAL_DATASET_DIR=/mnt/usb-ssd/trading/capital-dataset \
  node backtest/autoresearch/train-mtf.js
```
