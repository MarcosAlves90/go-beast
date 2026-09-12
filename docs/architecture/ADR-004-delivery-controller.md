# ADR-004: Strict delivery controller over the existing workflow engine

**Status:** Accepted  
**Date:** 2026-09-11

## Context

The skill catalog describes a strong sequence, but a normal agent session can
still jump from a request to implementation. The existing workflow engine
already owns manifest validation, dependency checks, artifact preconditions,
locks, and revision-safe state updates; it does not choose a route for a task
or require approval, test-first evidence, and review checkpoints as one
delivery policy.

Superpowers-style behavior is useful here when it is expressed as explicit,
observable gates rather than as a prompt slogan. The policy must remain
agent-agnostic and must not claim that a controller executed a specialist's
substantive work.

## Decision

Add `scripts/delivery.mjs` and expose it through `go-beast delivery`.

The controller has two responsibilities:

1. Plan a deterministic route for a task kind and implementation surface.
2. Materialize the route as a disposable workflow manifest under
   `.go-beast/workflows/manifests/` and start the existing workflow engine.

The default route is strict and includes:

```text
discover → approve-requirements → explore → approve-approach → architecture
→ specify → red → implement → green → spec-review → quality-review → finish
```

Approval, test-first, review, and finish behavior is represented by required
artifacts and phase dependencies. Implementation remains selectable:

- `agnostic`: `go-bee` coordinates the implementation surface.
- `backend`: `go-wolf` implements server-side behavior.
- `frontend`: `go-lynx` implements client-side behavior.
- `full`: `go-wolf` runs before `go-lynx`.

The controller delegates all state transitions to `scripts/workflow.mjs`.
It does not execute skills, edit application code, infer approval, or turn a
successful `start` command into a completion claim.

## Consequences

### Benefits

- A delivery route is inspectable before work begins.
- Implementation cannot be the first phase in a generated route.
- Approval, RED, GREEN, specification review, quality review, and finish
  evidence become externally checkable artifacts.
- Existing workflow locking, optimistic revision checks, and artifact
  validation remain the single state-machine implementation.
- The route is selectable without coupling the canonical skill files to one
  agent harness.

### Costs and limits

- Agents must create checkpoint artifacts, which adds ceremony and disposable
  state.
- The controller coordinates work; it cannot prove that a skill's prose was
  followed beyond the artifacts and commands the harness records.
- `go-bee` is a coordination default for agent-agnostic work. Callers should
  select `backend`, `frontend`, or `full` when the implementation surface is
  known.
- Route selection is deterministic, but it is not a substitute for discovery
  judgment or security review. `go-bear` remains an on-demand gate when the
  requirements involve auth, PII, payments, uploads, or administration.

## Alternatives considered

### Prompt-only sequencing

Rejected. It is easy to skip and provides no durable dependency or evidence
boundary.

### A second delivery state machine

Rejected. It would duplicate locking, revision, dependency, and artifact
semantics and create competing sources of truth.

### Automatic skill execution inside the controller

Rejected. Skill execution is harness-specific and can require user input,
credentials, or external tools. The controller should coordinate and verify
evidence, not hide those boundaries.
