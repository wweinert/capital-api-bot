# Trading Research Harness

`lab/` is the control plane for strategy research, backtesting, and experimentation.

It is intentionally isolated from the live trading system. Research may inspect repository code and approved market-data snapshots, but must not modify live trading code, broker state, credentials, PM2 processes, or other production state unless explicitly instructed.

Permanent agent rules and safety boundaries are defined in `lab/AGENTS.md` and the repository-level `AGENTS.md`. Do not duplicate those rules here.

## Structure

lab/
  AGENTS.md              Agent rules and research guardrails
  README.md              Research environment and infrastructure knowledge
  replay.js              Backtest/replay engine
  autoresearch/
    reports/             Research results and experiment reports

## Market Data

Historical market data is stored on `waldemar-pi` and its attached SSD.

Available data currently includes:

- 7+ months of history
- 15+ currency pairs, including EURUSD
- D1, H4, H1, M15, M5, and M1 timeframes
- JSONL-based historical datasets

### Data Source of Truth

Historical data on the server and SSD may contain legacy, duplicated, incomplete, or inconsistent datasets.

Maintain one canonical source of truth for market data:

1. Inspect existing datasets before creating or downloading anything.
2. Identify and reuse the cleanest and most complete dataset for each symbol and timeframe.
3. Do not create duplicate datasets when equivalent data already exists.
4. Preserve chronological ordering and the existing canonical JSONL format.
5. If the canonical dataset contains missing historical periods, fetch only the missing data from the broker API and append or merge it into that dataset.
6. Validate timestamps and remove overlaps or duplicates after an update.

Broker API access for missing-data recovery is a **data-maintenance operation**, not part of strategy evaluation. Backtests and research evaluations should run against fixed local datasets so results remain reproducible.

## Server

Host:        waldemar-pi
Project:     ~/dev/capital-api-bot
PM2 process: capital-api-bot
Repository:  https://github.com/wweinert/capital-api-bot.git


Authentication credentials are already available in the environment. Do not expose, copy, or commit them.

Research work must not restart, stop, modify, or otherwise interfere with the `capital-api-bot` PM2 process unless explicitly requested.

## Research Principles

Research should produce reproducible evidence rather than isolated profitable backtests.

For every meaningful experiment:

- use explicit datasets and date ranges;
- distinguish training, optimization, validation, and holdout periods;
- include realistic spread, fees, slippage, and execution assumptions where applicable;
- compare candidates against a clearly defined baseline;
- record configuration, metrics, and relevant assumptions;
- avoid look-ahead bias and data leakage;
- do not optimize against a locked holdout period;
- prefer robust results across instruments and periods over a single exceptional backtest.

Reports and significant findings belong in `lab/autoresearch/reports/`.

## External References

- [Capital.com Trading Strategies](https://capital.com/en-eu/learn/trading-strategies)
- [Capital.com API Documentation](https://capital.com/en-eu/trading-platforms/api-development-guide)
- [Kronos Financial Foundation Model](https://github.com/shiyu-coder/Kronos)