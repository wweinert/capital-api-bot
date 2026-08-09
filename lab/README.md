# Trading research harness

`lab/` is the control plane for offline strategy research. It is deliberately
separate from the live bot: this platform may inspect explicit snapshots, but it
must never mutate live code, broker state, or server processes.

## Map

```text
lab/
  AGENTS.md              permanent agent rules
  autoresearch/          legacy research, retained at original paths
  harness/               policy, validation, manifests, CLI
  experiments/           one isolated directory per hypothesis
  knowledge/             durable decisions and known invalid assumptions
```

## The experiment loop

```text
idea -> specification -> implementation -> software checks -> 
fixed evaluation -> evidence -> human review -> rejected | probation
```

An experiment changes one declared variable (or one tightly coupled change), has
a run budget, declares all mutable files, and identifies its dataset manifest and
fixed evaluator in advance. The locked test is human-controlled. Agents work with
development and validation data and do not inspect the locked result while
generating candidates.

