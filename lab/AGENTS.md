# Backtest Research Instructions

`lab/` is an isolated research environment for turning trading ideas into reproducible backtest evidence.

## Required Workflow

Before starting research:

1. Read `README.md` for project context, available market data, infrastructure, and references.
2. Read `../AGENTS.md` for repository-level boundaries and protected live paths.
3. Reuse the existing research infrastructure before introducing new logic.

## Hard Guardrails

- Do not modify any protected live path defined in `../AGENTS.md`.
- Do not start, stop, restart, or modify live server processes.
- Do not create, modify, cancel, or inspect live broker orders or positions.ƒ
- Do not establish broker trading sessions during research.
- Never expose, modify, or commit credentials, API keys, passwords, or `.env` files.

## Research Integrity

- Use fixed datasets and explicit date ranges for every evaluation.
- Never optimize against a locked test or holdout period.
- Never reuse an inspected test period as a new holdout.
- Do not change acceptance criteria after seeing the results.
- Avoid look-ahead bias, data leakage, and future information.
- Keep baseline and candidate configurations clearly separated so results remain comparable.

## Code Rules

Prefer the smallest possible change.

- Reuse existing functions, modules, utilities, and infrastructure.
- Do not create new helper functions, abstraction layers, modules, or files unless they are necessary.
- Do not duplicate logic that already exists elsewhere in the platform.
- Follow DRY and Clean Code principles.
- Keep control flow explicit and easy to trace.
- Prefer simple code over clever or overly generic abstractions.
- Use clear names that describe domain intent.
- Keep functions focused on one responsibility.
- Remove experimental code that is no longer used.
- Do not refactor unrelated code.
- Research code must remain understandable to another programmer without requiring additional explanation.

## Experiment Output

Every meaningful experiment should make it possible to determine:

- what strategy or hypothesis was tested;
- which symbols, timeframes, and date ranges were used;
- which configuration was used;
- what baseline it was compared against;
- what execution assumptions were applied;
- what the relevant performance metrics were;
- whether the result came from optimization, validation, or holdout data.

Store significant findings and conclusions in `autoresearch/reports/`.
