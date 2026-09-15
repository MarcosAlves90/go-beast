# ADR-011: Task-oriented v2 control-plane CLI

- **Status:** Accepted
- **Date:** 2026-09-15
- **Owners:** go-beast maintainers

## Context

The v1 Go Beast surface grew as separate namespaces for delivery, workflow,
profiles, conformance, evidence, and integration. Those commands are useful to
maintainers but force users to understand implementation-level boundaries
before they can start or inspect a task. The v2 contracts call for a task
vocabulary: `init`, `doctor`, `plan`, `run`, `status`, `explain`, `resume`, and
`audit`.

The new vocabulary must not duplicate the workflow engine or make an audit
claim that a task ran merely because a state file exists.

## Decision

Add `scripts/task-cli.mjs` and route the v2 task commands from `bin/go-beast.mjs`.
The facade stores a schema-backed task record below the selected project root,
delegates planning to `scripts/delivery.mjs`, delegates state transitions and
recovery to `scripts/workflow.mjs`, resolves adapters through the v2 SDK, and
resolves explanations through the canonical capability registry.

The v1 namespaces remain unchanged and are listed as compatibility aliases in
the task record and help output. JSON responses use a stable v2 envelope; text
responses remain intended for interactive use.

`audit` is deliberately structural. It checks task artifacts and workflow state
but returns `claims.execution: not_verified` until an evidence ledger or live
adapter trace supplies stronger evidence.

## Alternatives considered

1. **Replace the v1 commands with a single breaking CLI.** Rejected because
   existing scripts and installers depend on the namespace entry points.
2. **Reimplement delivery and workflow state in the task facade.** Rejected
   because it would split locks, phase gates, migration, and recovery logic.
3. **Make `run` execute an agent or application code.** Rejected because the
   control plane coordinates declared routes; execution authority belongs to the
   selected harness and the existing policy gates.
4. **Treat file presence as completion evidence.** Rejected because presence is
   an observation, not verification of a command, agent action, or human review.

## Consequences

Positive:

- Users can operate Go Beast by task ID and compose the existing v2 services.
- JSON envelopes make local automation and migration tooling straightforward.
- Legacy commands remain available while clients move to the task vocabulary.
- Root-bounded disposable state avoids global side effects.

Trade-offs and limits:

- `run` starts workflow coordination but does not execute substantive skill work.
- `audit` is only as strong as the evidence files supplied by the workflow or
  adapter; it intentionally reports unverified execution when none exists.
- The first facade delegates through subprocess boundaries, so its output wraps
  rather than redesigns the lower-level engine contracts.

## Validation

`tests/plugin/test-task-cli-v2.sh` covers the local end-to-end JSON flow from
initialization through audit, capability explanation, root-bounded artifacts,
and v1 capability namespace compatibility. `npm run verify` remains the full
offline gate.
