---
name: go-fox
version: 1.1.0
description: Translates approved requirements into an architecture decision record (ADR), technology stack selection, Mermaid component diagram, and interface contracts.
when_to_use: Use after go-hawk has produced an approved REQUIREMENTS.md — or when the architecture of an existing system needs to be revised or formally documented.
---

# go-fox — Architecture & Design

go-fox is the strategist of the go-beast pack. It converts approved requirements into a concrete, defensible technical design before a single line of code is written.

## Quick start

```
Prerequisites: REQUIREMENTS.md from go-hawk
→ invoke go-fox
→ stack selection → ADR → component diagram → interface contracts
```

## Workflow

### 1. Read requirements

Load `REQUIREMENTS.md`. Identify:
- Scale and availability targets → drives infra choices
- Compliance scope → drives security posture
- Integration points → drives API design
- Team size and skill set → drives stack simplicity vs power

### 2. Propose and justify the stack

Produce this as `docs/architecture/task-artifacts/STACK.md`. Fill every row — do not leave choices blank:

| Layer | Choice | Why | Risk |
|---|---|---|---|
| Frontend | | | |
| Backend | | | |
| Database | | | |
| Auth | | | |
| Infra / hosting | | | |
| CI/CD | | | |
| Observability | | | |

Default bias: prefer boring technology with a large ecosystem unless requirements prove otherwise.

### 3. Write ADRs

For every significant decision:

```md
## ADR-<N>: <title>
**Status:** Proposed / Accepted / Superseded  **Date:** YYYY-MM-DD
### Context
### Decision
### Consequences
### Alternatives considered
```

### 4. Produce component diagram

Write a Mermaid `C4Context` or `flowchart` showing: external actors, frontend/BFF/backend services, databases and caches, third-party integrations, data flow direction.

### 5. Define interface contracts

Produce this as `docs/architecture/task-artifacts/CONTRACTS.md`. For each service boundary: protocol, auth model, core endpoints/topics with request/response shape, error model.

### 6. Flag design risks

List any decision that increases operational complexity, requires specialized knowledge, has a scaling ceiling, or creates vendor lock-in.

## Rules

- Do not design what was not required. Scope creep starts here.
- Every technology choice must have a stated reason and an alternative considered.
- If a simpler design satisfies all requirements, choose it.
- If go-bear has not been called and the design involves auth or PII, flag it before proceeding.

## Output

All four documents are mandatory regardless of project size or complexity:

- `docs/architecture/task-artifacts/ADR.md` — one ADR per significant decision
- `docs/architecture/task-artifacts/STACK.md` — filled technology table with choices, reasons, and risks
- `docs/architecture/task-artifacts/DIAGRAM.md` — Mermaid component diagram
- `docs/architecture/task-artifacts/CONTRACTS.md` — interface contracts for every service boundary
