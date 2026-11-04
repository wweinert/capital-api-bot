# Dynamic activity study protocol — frozen before running

Objective: increase filled intraday portfolio trades toward 2–3 per market date while retaining positive net expectancy and reducing losing months. Zero losing months is a measured objective, not a promised property.

One shared pending/open slot; EUR 1,000; maximum requested risk 3%; 90% margin ceiling; recorded bid/ask execution. All positions and pending orders must be flat at 21:00 UTC daily and 20:00 UTC Friday; Friday admission stops at 18:00 UTC. Use configured session symbol membership. Do not change live code.

Frozen evaluation partitions: Jan–May training, Jun–Aug validation, Sep–Oct previously inspected diagnostic, November descriptive only. All history was inspected during earlier research; none is a new untouched holdout. Select fixed candidates on January–August only. Separately replay monthly walk-forward selection using only completed preceding months, with no use of the traded month's outcomes. The proposed family itself is research informed by previously inspected history.

Candidate dimensions: decision timeframe H1/M30/M15; closed-candle wave confirmation, reversal pattern, trend continuation and range reversal; ATR-normalized strength/entry/stop; RSI, trailing efficiency, relative tick volume and spread; causal session pair ranking. Compare static and adaptive variants. Indicators, rolling thresholds and pair ranking must use only candles closed at decision time. No centered extrema or future labels in live decisions.

Rank training/validation candidates by profit factor, monthly stability, drawdown and proximity to the requested activity; publish whether any candidate satisfies both quality and >=2 filled trades/date. A frequent losing variant must not be promoted merely for its activity. Measure results with the same conservative M1 execution engine and explicit-null trailing correction; then stress finalists with wider spread and adverse entry slippage. No tuning after reading September–October/November results.

Volume means broker tick activity, not consolidated FX traded volume. Spread and quote availability are liquidity/cost proxies. Do not claim order-book liquidity or central-bank/news information that the dataset does not contain.
