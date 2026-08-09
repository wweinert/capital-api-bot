# Fixed evaluators

An evaluator belongs here only after its execution and trading semantics are
tested. During an experiment its code is immutable and its checksum is captured
in every run manifest.

There is deliberately no default evaluator yet. Reusing one of the legacy
search functions would give a false impression of comparability with live
execution. The first evaluator must define, at minimum: closed-candle timing,
next permissible entry, bid/ask and costs, gaps, simultaneous SL/TP handling,
pending expiry, sizing/margin, portfolio limits, timezone, and deterministic
ordering.

# Review queue

- There is an interesting report from the autoresearch run with unusually high profit: impulse-reversal-stop-only-oos-20min-2026-08-03. Check it. 