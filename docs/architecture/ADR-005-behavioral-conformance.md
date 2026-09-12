# ADR-005: Evidence-based behavioral conformance

**Status:** Accepted  
**Date:** 2026-09-11

## Context

Static skill contracts describe intended behavior, but they do not prove that
an agent invoked the right phase, obtained approval, ran a RED/GREEN loop, or
completed the required reviews. Harness-specific integration tests are useful
but cannot be the only conformance surface for an agent-agnostic pack.

## Decision

Add `scripts/conformance.mjs`, exposed through a harness adapter and a
canonical verifier:

```bash
go-beast conformance normalize --trace .go-beast/codex-events.json --format json \
  > .go-beast/trace.json
go-beast conformance verify --trace .go-beast/trace.json --format json
```

The adapter accepts versioned raw traces from Claude Code, Codex, or Copilot.
It maps supported raw event names and phase aliases into the canonical event
vocabulary, records the source harness, and drops harness-specific tool
metadata. `check` remains available as a compatibility spelling for `verify`.

The checker accepts a versioned, ordered JSON event trace and reports:

- `passed`: whether the declared evidence conforms;
- `missing`: required evidence that was not declared;
- `violations`: ordering or prerequisite failures; and
- `checked`: the evidence checks performed.

The protocol checks discovery, requirements approval, solution exploration,
approach approval, architecture, behavioral specification, RED,
implementation, GREEN, specification review, quality review, and finish. It
also rejects implementation evidence that precedes both approvals or RED.

The canonical trace vocabulary is harness-neutral. The adapter boundary is
explicit so the core checker has no dependency on Claude Code, Codex, or
Copilot APIs. Unsupported harnesses, malformed traces, and unsupported raw
event types fail closed.

## Consequences

### Benefits

- Protocol adherence becomes machine-readable and testable.
- Missing evidence and ordering failures are actionable rather than hidden in
  prose.
- The same checker can be used by local scripts, workflow adapters, and CI.
- The checker is substitutable: it reads a trace and does not mutate the
  repository or own workflow state.

### Limits

- A passing verdict proves only that the declared trace contains the required
  evidence in order. It cannot prove hidden intent, truthful event reporting,
  code correctness, security posture, or the quality of a review.
- The checker does not replace substantive tests, `go-bear`, human approval,
  or the workflow engine's artifact and lock checks.
- Trace adapters remain responsible for faithfully observing their harness.
