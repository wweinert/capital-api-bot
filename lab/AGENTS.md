# Backtest research instructions

This directory is an offline research platform. Its purpose is to turn a
strategy idea into reproducible evidence.

## Required workflow

- Read `README.md` and `harness/knowledge/DECISIONS.md`.

## Hard guardrails

- Do not edit the protected live paths listed in `../AGENTS.md`.
- Do not import broker sessions or place/cancel/update orders.
- Do not use network access during evaluation.
- Do not optimize on a locked test, rename an inspected period as a new holdout,
  or change acceptance gates after seeing results.
- Do not silently repair a legacy experiment while reproducing it. Record the
  defect, then create a new experiment if a corrected study is warranted.