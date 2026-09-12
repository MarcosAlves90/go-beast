# ADR-006: Shared runtime policy gate with harness adapters

**Status:** Accepted  
**Date:** 2026-09-11

## Context

The lifecycle hooks already persisted active-beast and anti-drift state, but
each adapter interpreted parts of that state independently. That made it
possible for prompt context, stop re-anchoring, and implementation blocking to
disagree about applicability, the required artifact, approval, or completion
evidence.

## Decision

Centralize the runtime policy vocabulary in
`hooks/go-beast-drift-lib.sh`, exposed through `gb_runtime_policy_json`.
The normalized policy owns:

- active beast and applicability (`conversation`, `discovery`, `planning`,
  `implementation`, or `verification`);
- explicit or beast-derived required artifact;
- approval state;
- implementation unlock and task state;
- required-artifact presence; and
- recorded completion evidence.

Session initialization, user-prompt context, stop re-anchoring, and the
implementation gate consume this policy. Harness-specific behavior remains an
adapter concern: Claude Code and Codex use text plus exit code 2, while Copilot
receives a structured JSON decision.

A newly named beast starts a fresh task frame. It clears stale implementation
unlock, approval, and completion evidence, and derives the artifact required by
the new beast when no explicit artifact is present.

## Consequences

### Benefits

- A single seam defines what the active beast is allowed to do next.
- Prompt context, re-anchoring, and tool blocking expose the same facts.
- Stale approval or completion state cannot silently authorize a new task.
- Applicability and artifact selection are testable without a live harness.

### Limits

- The policy derives and reports evidence; it does not prove that a model's
  narrative is truthful.
- Explicit state remains a trust boundary. Malformed state is fail-closed for
  implementation mutation, while neutral lifecycle input remains harmless.
- The mapping is intentionally conservative and should be extended only when
  a new beast has a documented phase and artifact contract.
