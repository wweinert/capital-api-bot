# Program: HLLH AutoSearch

Goal: find robust, realistic variations of the current HLLH / price-action strategy.

Constraints:

- Do not modify `api.js`.
- Do not modify `.env`.
- Do not apply the best candidate to live config automatically.
- Use the existing detector and simulator modules under `backtest/lib/`.
- Prefer robust metrics over raw profit.
- Reject low-trade-count, symbol-concentrated, high-drawdown, and over-complex candidates.

Safe candidate surface:

- `research/candidates/*.json`

Metrics:

- trades
- winRate
- profitFactor
- expectancyR
- maxDrawdownPct
- startCapital
- endCapital
- rawPnl
- averageHoldBars
- score

Searchable knobs:

- `setupMode`
- `pivotWindow`
- `signalMode`
- `entryMode`
- `stopVariant`
- `exitVariant`
- `takeProfitR`
- `safetyTakeProfitR`
- `maxSignalWaitBars`
- `entryBreakMaxBars`
- `minStopDistancePips`
- `maxStopPips`
- `avoidHoursUTC`
- `dailyForcedCloseUTC`
- `managementProfile.mode`
- `managementProfile.activationR`
- `managementProfile.trailR`
- `managementProfile.breakevenR`
- `managementProfile.maxHoldBars`

Scoring:

```text
score =
  expectancyR * 40
  + profitFactor * 25
  + winRate * 0.2
  - maxDrawdownPct * 2.5
  - overfitPenalty
  - lowTradeCountPenalty
  - symbolConcentrationPenalty
  - liveReplayMismatchPenalty
  - complexityPenalty
```

Warnings:

- A good backtest score is not a live trading decision.
- Today-only comparisons are diagnostic and too small to optimize against.
- Candidates must be reviewed manually for live broker constraints, margin behavior, spreads, and session behavior.
