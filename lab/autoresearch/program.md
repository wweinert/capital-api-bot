# Trading autoresearch protocol

- `prepare.js` is the fixed data/evaluation harness. Do not modify it during an
  experiment series.
- `train.js` owns the candidate space and search policy.
- Every run uses a fixed 600-second search budget, excluding data preparation.
- Selection may use data through 2026-05-31. June 2026 is held out and is only
  revealed for the final leaderboard.
- Primary objective: positive-week rate after estimated spread costs.
- Tie breakers: validation profit factor, median weekly R, drawdown, simplicity.
- Zero-trade weeks are not profitable weeks.
- Never select on total P/L alone and never change the evaluator after seeing
  holdout results.

