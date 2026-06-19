# Requirements — Go-beast Anti-Drift Enforcement
> version: 1 | date: 2026-06-19 | status: draft

## Problem statement

Users report that Claude Code and Codex agents often drift away from the
go-beast contract during longer sessions. The failure modes include:

- losing the initial go-beast persona and communication style
- skipping required beasts or artifact gates
- implementing before required discovery under bootstrap mode
- continuing the session without re-anchoring after visible context drift

The project needs a runtime mechanism that keeps agents aligned with go-beast
throughout the session, not only at session start.

## Users and roles

- **Primary users:** all go-beast users running Claude Code or Codex
- **Maintainers:** go-beast maintainers who define the policy, hooks, and tests
- **Reviewers:** humans who need confidence that the pack keeps the agent inside
  the intended workflow and personality envelope

## Functional requirements

1. **P0 — Detect workflow drift.**
   The system must detect when an agent bypasses a required beast, required
   upstream artifact, or bootstrap gate before implementation.

2. **P0 — Detect behavior drift.**
   The system must detect when an agent visibly departs from the defined
   go-beast persona, response contract, or enforcement posture.

3. **P0 — Re-anchor during the session.**
   The system must reintroduce the relevant go-beast contract during the same
   session after drift is detected, rather than relying only on SessionStart.

4. **P0 — Escalate severe drift.**
   The system must support blocking behavior for severe drift, not only passive
   reminders, when the agent is about to violate a critical bootstrap or safety
   gate.

5. **P0 — Support Claude Code and Codex.**
   The mechanism must work on both supported hook-capable agents, even if the
   exact hook event wiring differs by harness.

6. **P1 — Persist minimal operational state.**
   The system should keep a short per-session or per-task state record with the
   current beast, required artifact, and enforcement mode so runtime hooks can
   re-anchor the agent consistently.

7. **P1 — Distinguish reminder from blocker behavior.**
   The mechanism should classify drift by severity and choose between reminder,
   re-anchoring, and blocking behavior accordingly.

8. **P2 — Explain why an intervention happened.**
   When the mechanism reminds or blocks, it should tell the agent which rule,
   artifact, or bootstrap gate triggered the intervention.

## Non-functional requirements

- **Low false positive rate:** the mechanism must not block or nag on normal
  compliant work.
- **Fast runtime overhead:** hook execution must stay lightweight enough for
  normal interactive use.
- **Security-conscious state:** no unnecessary persistence of full prompt
  content or sensitive repository data.
- **Incremental adoption:** the first version should be deployable without
  redesigning the whole pack.
- **Auditability:** maintainers must be able to inspect the rules that decide
  reminder versus blocker behavior.

## Out of scope

- support for agents other than Claude Code and Codex
- permanent cross-project memory or long-term conversation history
- changing the underlying model or provider behavior
- external telemetry or hosted enforcement services
- full redesign of go-beast bootstrap or installer architecture

## Open questions

- Which hook event mix gives the best signal-to-noise ratio for drift
  detection: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, or a
  combination?
- Should persona drift be enforced with explicit rule matching, or only through
  inferred workflow drift and re-anchoring?
- What is the minimum state shape needed to preserve context without storing
  sensitive prompt content?
- Which severe-drift conditions are blocker-grade in v1 versus reminder-grade?

## Risks

- A vague drift detector will create noise and be ignored.
- An overly rigid detector will block legitimate work and reduce trust in the
  pack.
- If the state model is too thin, re-anchoring will be inconsistent.
- If the state model is too rich, the mechanism will become fragile or retain
  more context than necessary.

## Assumptions

- Existing go-beast assets to reuse include `AGENTS.bootstrap.md`,
  `AGENTS.global.md`, `go-jay`, `go-swift`, `go-wren`, the shared hook
  manifest/wiring, and `~/.go-beast` as a plausible state location.
- Delivery priority favors a first useful incremental mechanism over a perfect
  long-horizon architecture.
- Runtime interventions may remind, re-anchor, or block if that materially
  improves adherence to the go-beast contract.
