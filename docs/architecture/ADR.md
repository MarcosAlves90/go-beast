# ADR — Anti-Drift Enforcement Architecture

## ADR-004: Stateful anti-drift guard for Claude Code and Codex

**Status:** Proposed  
**Date:** 2026-06-19

### Context

go-beast currently relies heavily on initial context loading through
`AGENTS.global.md`, `AGENTS.bootstrap.md`, `SessionStart` sync, and explicit
skill invocation. In longer sessions, users report three classes of drift:

- the agent stops following the go-beast sequence and artifact gates
- the agent loses the intended persona and enforcement posture
- the agent continues work without re-anchoring after visible context loss

Pure instruction-file hardening is insufficient because the failure happens
during the session, after the initial context has already been loaded.

### Decision

Introduce a **stateful anti-drift guard** in the harness adapter layer for
Claude Code and Codex.

The design has three cooperating parts:

1. **Policy source**
   - bootstrap and global instruction files remain the canonical policy source
   - a concise runtime policy subset is derived from them for hook use

2. **Short-lived session/task state**
   - store minimal operational state under `~/.go-beast`
   - include active beast, required upstream artifact, enforcement mode, and
     current task/session identifier
   - do not store full prompt history or repository-sensitive content by default

3. **Runtime hook enforcement**
   - use supported hook events to detect drift, re-anchor, and block when needed
   - classify interventions by severity: reminder, re-anchor, blocker
   - prefer narrow, auditable rules over heuristic “AI judge” behavior inside
     the hook itself

### Consequences

#### Positive

- Mid-session recovery becomes possible instead of depending on SessionStart.
- The design stays inside existing go-beast architecture boundaries.
- Claude Code and Codex can share most of the logic while keeping harness
  wiring differences local to the adapter layer.
- The system can explain why it intervened because state and rule evaluation are
  explicit.

#### Negative

- State management introduces a new contract that must be versioned and tested.
- Poorly chosen severity thresholds may create noisy false positives.
- Persona drift is harder to detect deterministically than workflow drift.

### Alternatives considered

#### 1. Tighten instruction files only

Rejected because it improves the starting state but does not recover after
mid-session context weakening.

#### 2. Stateless reminder hooks only

Rejected because hooks without state cannot reliably tell whether a missing
beast or artifact is actually a violation in the current session stage.

#### 3. Workflow-centric enforcement

Rejected for v1 because it would require pushing too much ordinary interactive
work into explicit workflows, raising adoption cost beyond the stated
requirements.

## ADR-005: Separate workflow drift from persona drift

**Status:** Proposed  
**Date:** 2026-06-19

### Context

The reported failures mix two different problems:

- **workflow drift** — missing beasts, missing artifacts, premature
  implementation
- **persona drift** — wrong tone, wrong enforcement posture, wrong response
  contract

Treating both with one undifferentiated detector would either be too noisy or
too weak.

### Decision

Use a two-track enforcement model:

- **workflow drift:** deterministic, blocker-capable, based on explicit state and
  rule checks
- **persona drift:** reminder or re-anchor first, blocker only when tied to a
  policy-critical contract breach

### Consequences

#### Positive

- The high-confidence blocker path stays narrow and auditable.
- Persona enforcement can improve incrementally without breaking valid work.

#### Negative

- The system must maintain two severity models instead of one.

### Alternatives considered

#### 1. Block on all visible persona drift

Rejected because the false-positive risk is too high.

#### 2. Ignore persona drift entirely

Rejected because the user explicitly reported it as part of the problem.
