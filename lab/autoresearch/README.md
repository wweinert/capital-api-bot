# Trading autoresearch

Adaptation of the experiment protocol from
[`karpathy/autoresearch`](https://github.com/karpathy/autoresearch) for the
Capital trading archive. It does not train a language model. Codex acts as the
researcher, while `prepare.js` is the fixed evaluator and `train.js` searches
the strategy space for a fixed wall-clock budget.

