# AutoSearch Research

Autonomous research harness for the current HLLH / price-action strategy.

This folder follows the AutoSearch pattern:

- fixed experiment target: existing historical candles and HLLH simulator
- safe editable surface: generated candidate config JSON files under `research/candidates/`
- repeatable metrics: `robust`, `balanced`, `aggressive`, and `max-profit` from `scoreExperiment.js`
- append-only results: `research/results.tsv`
- reports: `research/reports/`

It does not apply any candidate to `config.js` or live execution.

## Commands

```bash
npm run research:update-data
npm run research:baseline
npm run research:search -- --minutes=30
npm run research:report
npm run research:search -- --minutes=30 --mode=aggressive
npm run research:report -- --mode=aggressive
```

Useful options:

```bash
npm run research:baseline -- --days=90
npm run research:search -- --minutes=30 --days=90 --seed=20260505
npm run research:search -- --minutes=30 --days=90 --mode=aggressive --seed=20260505
npm run research:search -- --minutes=15 --days=90 --mode=max-profit --seed=202605051
npm run research:report -- --top=10
npm run research:report -- --mode=max-profit
```

## Scoring Modes

- `robust`: conservative score. Drawdown, low sample, concentration, and overfit penalties are intentionally strong.
- `balanced`: mixed score for profit, PF, expectancy, drawdown, and sample quality.
- `aggressive`: profit-first score that prioritizes `endCapital` and `rawPnl`, while flagging destructive drawdown instead of hiding it.
- `max-profit`: maximum growth discovery score. Dangerous candidates remain visible and are labeled for manual review.

## Output

- `research/results.tsv` contains one row per experiment.
- `research/candidates/*.json` and mode folders such as `research/candidates/aggressive/`, `research/candidates/max-profit/`, and `research/candidates/high-risk/` contain candidate artifacts.
- `research/reports/*.md` contains markdown reports with baseline vs best comparison.
- `research/reports/aggressive-search-summary.md` contains the current profit-first summary.
- `research/reports/live-parity-diagnostics.md` explains live/replay mismatches.

Review any candidate manually before moving it into `config.js`.
