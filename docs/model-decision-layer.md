# Model Decision Layer

The model decision layer is a safe adapter between the existing strategy runtime and a future Trading LLM / model endpoint. It is not a broker client, not a risk engine, and not a replacement for the strategy.

## Responsibilities

The model layer can:

- produce a strict `FORECAST_30M` JSON forecast for the next 30 minutes;
- evaluate an existing strategy signal with strict `SIGNAL_QUALITY` JSON;
- write dataset-ready JSONL logs;
- optionally filter strategy signals in staged rollout modes.

The model layer must not:

- place orders;
- call Capital.com APIs directly;
- change `.env`;
- bypass `RISK`;
- create trades without a normal strategy signal.

## Runtime Flow

Default behavior is unchanged because `MODEL_DECISION_ENABLED=false`.

When enabled, the intended flow is:

1. `bot.js` fetches candles and bid/ask.
2. `strategies/Router.js` evaluates the active strategy.
3. `services/trading.js` receives the strategy signal.
4. `services/modelDecisionService.js` builds `marketContext`.
5. The model service gets or creates a cached `FORECAST_30M`.
6. If there is a strategy signal, the model service requests `SIGNAL_QUALITY`.
7. Depending on `MODEL_DECISION_MODE`, the model layer either only logs or blocks a weak/contradicted signal.
8. Existing risk sizing and broker order execution remain final authority.

## Config Flags

Set these in the runtime environment when needed:

```bash
MODEL_DECISION_ENABLED=false
MODEL_DECISION_MODE=disabled
MODEL_ENDPOINT_URL=
MODEL_API_KEY=
MODEL_FORECAST_TTL_MINUTES=30
MODEL_MIN_FORECAST_CONFIDENCE=0.60
MODEL_MIN_SIGNAL_CONFIDENCE=0.65
MODEL_MIN_EXPECTED_R=0.5
MODEL_REQUEST_TIMEOUT_MS=8000
MODEL_ALLOW_MOCK=false
```

Supported modes:

- `disabled`: no model calls and no behavior change.
- `shadow`: call/log model output when a provider is available; never change trading behavior.
- `forecast_filter`: block only when a confident forecast contradicts the strategy signal or says `NO_TRADE`.
- `signal_quality_filter`: require `ALLOW_TRADE` with confidence and expected-R thresholds.
- `full_filter`: require both forecast agreement and signal quality approval.

In filter modes, if no endpoint is configured and mock is disabled, the model layer fails closed and blocks the signal with a logged reason. Use filter modes only after shadow-mode parity review.

## Shadow Mode

Example local command:

```bash
MODEL_DECISION_ENABLED=true MODEL_DECISION_MODE=shadow MODEL_ALLOW_MOCK=true npm start
```

Shadow mode writes logs but does not change order decisions.

## Disable Everything

Either omit the flags or set:

```bash
MODEL_DECISION_ENABLED=false MODEL_DECISION_MODE=disabled
```

## Logs

The layer writes:

- `logs/model_forecasts.jsonl`
- `logs/model_signal_quality.jsonl`
- `logs/model_decisions.jsonl`

Rows include timestamp, mode, symbol, timeframe, candidate id, strategy signal, compact market context, forecast, quality decision, final bot decision, blocked reason, model version, and error fields where applicable.

## Future RunPod Endpoint

A future endpoint should accept:

```json
{
  "type": "FORECAST_30M_REQUEST",
  "symbol": "GBPUSD",
  "marketContext": {}
}
```

or:

```json
{
  "type": "SIGNAL_QUALITY_REQUEST",
  "signalQualityContext": {}
}
```

It should return the strict JSON object directly or under `forecast` / `qualityDecision`.

## Training Plan

Future training should join model logs with trade outcomes and backtest/replay labels:

- `forecast30mActualDirection`
- `realizedR`
- `maxAdverseR`
- `maxFavorableR`
- `hitProfitBeforeStop`
- `blockedTradeWouldHaveWon`
- `blockedTradeWouldHaveLost`

Before any filter mode is used live, compare shadow decisions against real/demo outcomes over enough trades and market regimes.
