# Trading autoresearch

Minimal adaptation of [`karpathy/autoresearch`](https://github.com/karpathy/autoresearch)
for offline Capital FX strategy research. The same three-file contract is used:

- `prepare.js` — fixed causal data preparation, evaluator, split, objective,
  and acceptance gates;
- `train.js` — the only agent-editable candidate strategy;
- `program.md` — the human-editable autonomous research protocol.

