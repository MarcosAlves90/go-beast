## Requirements summary

- Detect workflow drift and behavior drift during active Claude/Codex sessions.
- Re-anchor the agent mid-session instead of relying only on SessionStart.
- Support severity-based escalation up to blocking for critical bootstrap or
  safety violations.
- Keep only minimal operational state and avoid unnecessary sensitive
  persistence.
- Favor an incremental solution that can ship without redesigning the whole
  pack.

## Approaches considered

### 1. Context-Only Reinforcement

Keep the solution in instruction files and context artifacts only. Tighten
`AGENTS.bootstrap.md`, add a dedicated anti-drift section via `go-jay`, and
avoid any new runtime enforcement.

Trade-offs:
- Optimizes for simplicity and low implementation risk
- Sacrifices mid-session recovery because the model can still drift after the
  initial context window weakens

### 2. Stateless Runtime Reminders

Add lightweight hooks that detect a few obvious drift patterns and emit
re-anchoring reminders, but do not keep session state and do not block. The
hooks act as runtime nudges only.

Trade-offs:
- Optimizes for low overhead and easy rollout
- Sacrifices precision because stateless checks cannot tell where the session is
  in the beast pipeline

### 3. Stateful Drift Guard

Maintain a short session/task state record with the active beast, required
artifact, bootstrap mode, and enforcement severity. Use hooks to update this
state and to decide whether to remind, re-anchor, or block based on actual
session position.

Trade-offs:
- Optimizes for correctness, mid-session recovery, and enforceable gates
- Sacrifices some simplicity because it introduces a state contract that hooks
  must maintain carefully

### 4. Workflow-Centric Enforcement

Push most non-trivial work into explicit go-beast workflows and use the
workflow/runtime boundary as the main anti-drift mechanism. The agent is kept on
rails by moving more work into structured pipelines rather than open-ended chat.

Trade-offs:
- Optimizes for determinism and strong process control
- Sacrifices flexibility and has a much larger adoption cost for ordinary
  interactive sessions

## Evaluation

| Approach | Simplicity | Scalability | Dev speed | Operational cost | Fit to constraints |
|----------|-----------|-------------|-----------|------------------|-------------------|
| Context-Only Reinforcement | ✓✓ | ✗ | ✓✓ | ✓✓ | ✗ |
| Stateless Runtime Reminders | ✓ | ✓ | ✓✓ | ✓✓ | ✓ |
| Stateful Drift Guard | ✓ | ✓✓ | ✓ | ✓ | ✓✓ |
| Workflow-Centric Enforcement | ✗ | ✓✓ | ✗ | ✗ | ✓ |

## Selected approach

**Selected:** Stateful Drift Guard

**Rationale:** This is the smallest responsible approach that can actually solve
the reported failure modes. Pure context hardening does not recover once the
agent drifts, and stateless reminders do not know enough about session state to
enforce beast sequencing or bootstrap gates reliably. A short state model plus
runtime hooks gives go-beast enough memory to re-anchor the agent during the
session, escalate severe drift to blocking behavior, and still remain
incremental within the current harness adapter architecture.

**Key risk:** the first version may become noisy if severity thresholds and
state transitions are too loosely defined.

## Deferred decisions

- exact state file schema and lifecycle
- which hook events own state updates versus enforcement
- drift severity taxonomy and blocker thresholds
- whether persona drift is enforced directly or inferred from workflow drift
- test strategy split between direct shell tests, live harness tests, and
  workflow-level evals
