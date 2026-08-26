# Trading autoresearch protocol

This is the agent program for autonomous, offline strategy research. The goal
is to improve a reproducible candidate on fixed development data. Passing this
loop never means that a strategy is safe or approved for live trading.

## The three-file contract

- `prepare.js` is fixed for an experiment series. It owns data parsing,
  causal features, execution assumptions, train/validation splits, gates, and
  the objective. Do not modify it after the baseline is recorded.
- `train.js` is the only file modified by the research agent. Keep changes
  inside `AUTORESEARCH MUTABLE REGION`, one coherent hypothesis at a time.
- `program.md` is maintained by the human. Do not change it during a run.

The live bot, broker sessions, `lab/`, historical reports, and data
outside the declared development snapshot are out of scope during the loop.

## Setup

Work with the human once before starting:

1. Agree on a run tag, experiment budget, dataset directory, and symbols.
2. Read `../../AGENTS.md`, `../AGENTS.md`, `../README.md`, this file,
   `README.md`, `prepare.js`, and `train.js` in full.
3. Record the SHA-256 of `prepare.js` and the dataset fingerprint. They must
   remain unchanged for the entire series.
4. Create new report after research session and add it to other ones in folder `report`
