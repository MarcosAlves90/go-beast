# Anti-Drift Interface Contracts

## 1. Policy source to runtime subset

**Boundary:** instruction files → runtime enforcement logic  
**Protocol:** local file read  
**Auth model:** local filesystem access inside trusted harness execution  

### Contract

- Source files:
  - `AGENTS.global.md`
  - `AGENTS.bootstrap.md`
  - optional repository-local `AGENTS.md`
- Runtime subset must extract only enforcement-relevant facts, such as:
  - active mode (`bootstrap` vs baseline)
  - required beast gates
  - artifact prerequisites
  - severity-worthy stop conditions

### Error model

- Missing source file: fail safe to baseline behavior and emit explicit warning
- Contradictory source rules: report ambiguity and prefer stricter rule

## 2. Session/task state contract

**Boundary:** hooks/scripts ↔ `~/.go-beast` state  
**Protocol:** local file read/write  
**Auth model:** local trusted hook execution only  

### State shape (proposed)

```json
{
  "version": 1,
  "harness": "codex|claude-code",
  "mode": "baseline|bootstrap",
  "session_id": "<opaque>",
  "task_id": "<opaque or absent>",
  "task_state": "active|complete|idle",
  "active_beast": "go-mole|go-hawk|go-lark|...",
  "required_artifact": "REQUIREMENTS.md|APPROACH.md|HOOK CONTRACT|...",
  "implementation_unlocked": false,
  "severity_mode": "remind|reanchor|block",
  "last_reanchor_reason": "<short code or absent>"
}
```

### Rules

- Do not store full prompt text by default.
- Do not store repository secrets or arbitrary tool payloads.
- Treat `task_state: complete` as the end of the current task, not the end of
  the session.
- A new prompt that declares a `go-*` beast may reopen the same session with a
  new active task and reset the drift counter.
- State updates must be atomic enough to avoid partial writes becoming policy
  truth.

### Error model

- Missing state file: initialize empty session state
- Unknown version: refuse destructive enforcement and emit upgrade warning
- Corrupt state: reset to safe baseline and emit explicit warning

## 3. Drift detector contract

**Boundary:** hook event JSON → intervention decision  
**Protocol:** stdin JSON input, stdout human-readable output, exit code contract  
**Auth model:** existing Claude/Codex hook trust model  

### Inputs

- hook event payload (`PreToolUse`, `PostToolUse`, `Stop`,
  `UserPromptSubmit`, and related supported lifecycle events)
- current session/task state
- runtime policy subset

### Outputs

- `exit 0`: no intervention
- `exit 1`: blocker intervention for critical drift
- `exit 2` where supported by the harness flow: mandatory re-anchor/reminder
- stdout message naming:
  - violated rule or missing artifact
  - required next beast or re-anchor action

### Error model

- Unreadable stdin JSON: do not fabricate a block; emit safe fallback warning if
  possible
- Missing state or policy: degrade to reminder-only mode

## 4. Skill-state update contract

**Boundary:** skill invocation/result ↔ state store  
**Protocol:** local file update triggered by runtime or explicit helper  
**Auth model:** trusted local execution  

### Contract

- When a beast is invoked, the state should record:
  - active beast
  - next required artifact
  - whether implementation is currently allowed
- When the required artifact is produced, the state should advance accordingly

### Error model

- Unknown beast name: do not advance gating state
- Artifact missing after declared completion: keep gate closed

## 5. Test contracts

**Boundary:** implementation ↔ validation  
**Protocol:** shell tests, live harness tests, workflow eval  

### Required validation surfaces

- direct shell tests for deterministic detector branches
- live Claude/Codex tests for harness wiring and runtime behavior
- hook eval coverage when observable hook behavior changes

### Error model

- shell-only pass with no live harness coverage: confidence reduced, not
  sufficient for full harness claim
- live harness drift from local tests: treat as release blocker for the affected
  surface
