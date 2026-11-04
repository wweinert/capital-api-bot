# Wave-only vs wave + H1 pattern

Date: 2026-11-02  
Protocol: `wave-only-vs-wave-pattern-profit-search-v1`

## Question

Can the lower-timeframe wave detector be traded directly after filtering weak
waves, or does the existing H1 red/green color-flip remain necessary?

The comparison used the same eight-symbol session universe, M1 bid/ask pending
execution, EUR 1,000 initial capital, 3% nominal risk, 90% margin cap, and one
portfolio slot. The 1,500 common parameter bases were selected on January-May
train plus June-August validation. September-October was excluded from
selection but had already been inspected in earlier studies, so it is a
diagnostic period rather than a fresh holdout.

## Search result

Four wave-only configurations and nine combined configurations passed the
development gates. The highest-ranked development winner in each family failed
the diagnostic period by about 39%, demonstrating substantial regime overfit.

One lower-ranked exploratory wave-only configuration was positive in all three
segments:

| Period | Return | Trades | PF | Max DD | Positive active days |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | +30.59% | 103 | 1.223 | 12.38% | 53.33% |
| Validation | +3.28% | 58 | 1.052 | 11.46% | 53.33% |
| Diagnostic | +1.52% | 42 | 1.030 | 13.01% | 54.84% |
| Full | +36.97% | 203 | 1.129 | 14.15% | 53.64% |

Its filters were: default M5/M15 wave resolution, H1 trend score at least 0.25
ATR in the trade direction, six-hour directional efficiency at least 0.30,
stop distance no more than 2.5 H1 ATR, Sydney/Tokyo hours, Monday-Thursday,
3-pip pending buffer, 45-minute expiry, 0.75R target, and trailing after 1R.

This wave-only result is not robust enough for live use. With spread increased
25%, validation became -4.57%; with 0.5-pip slippage it became -1.81%. At
1-pip slippage the full-period result became -3.04%. It was also identified
after inspecting diagnostic results, so it needs a new forward holdout.

## Paired pattern tests

Changing only the signal mode of the exploratory wave-only configuration from
`wave` to `combined` made it worse: full return changed from +36.97% to -12.56%.
The H1 pattern therefore does not improve every definition of a quality wave.

The reverse test on the previously frozen robust combined configuration was
decisive:

| Signal mode with identical remaining parameters | Train | Validation | Diagnostic | Full | Full PF | Full max DD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Wave only | +25.35% | -25.12% | -3.31% | -9.25% | 0.969 | 44.82% |
| Wave + H1 pattern | +32.91% | +13.31% | +17.95% | +77.69% | 1.298 | 16.25% |

The combined candidate also remained profitable under the existing cost stress
tests: +49.40% with spread increased 50% and +26.41% with 1-pip slippage.

## Conclusion

The first layer can be made historically profitable on its own, but the found
edge is weak, cost-sensitive, and not ready for live trading. The strongest
current research direction is the combined family: strict M5+M15 agreement as
wave context, followed by the H1 color flip as the entry trigger. The H1 pattern
is not a universal quality filter; it is specifically valuable together with
that strict consensus wave definition.

No protected live file was changed or executed for this study.
