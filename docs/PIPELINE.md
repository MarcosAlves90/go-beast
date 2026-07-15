# Pipeline and catalog

The standard lifecycle is:

```mermaid
flowchart LR
  hawk[go-hawk] --> lark[[go-lark]] --> fox[go-fox] --> otter[go-otter]
  otter --> beaver[go-beaver] --> snipe[[go-snipe]]
  snipe --> wolf[go-wolf] --> eagle[go-eagle]
  snipe --> lynx[go-lynx] --> eagle
  eagle --> bear[go-bear] --> raven[go-raven] --> crane[[go-crane]] --> owl[go-owl]
```

Brackets mark optional skills. `go-bear` can interrupt any phase, and
`go-owl` can run at any phase.

## Pipeline skills

| Skill | Phase | Produces |
|---|---|---|
| [go-hawk](../skills/go-hawk/SKILL.md) | Discovery | `REQUIREMENTS.md` |
| [go-lark](../skills/go-lark/SKILL.md) | Solution exploration | `APPROACH.md` |
| [go-fox](../skills/go-fox/SKILL.md) | Architecture | ADR, stack, diagram, contracts |
| [go-otter](../skills/go-otter/SKILL.md) | Database | ER diagram, migrations, indexes |
| [go-beaver](../skills/go-beaver/SKILL.md) | Scaffolding | Working repo skeleton and setup |
| [go-snipe](../skills/go-snipe/SKILL.md) | Behavioral specification | `SPEC.md` and acceptance scenarios |
| [go-wolf](../skills/go-wolf/SKILL.md) | Backend | API, auth, middleware, validation |
| [go-lynx](../skills/go-lynx/SKILL.md) | Frontend | Components, state, API integration, accessibility |
| [go-eagle](../skills/go-eagle/SKILL.md) | Testing | Test strategy and CI gates |
| [go-bear](../skills/go-bear/SKILL.md) | Security | Threat model and security review |
| [go-raven](../skills/go-raven/SKILL.md) | CI/CD | Pipeline and environment strategy |
| [go-crane](../skills/go-crane/SKILL.md) | Observability | Metrics, logs, traces, health endpoints |
| [go-owl](../skills/go-owl/SKILL.md) | Documentation | README, references, runbooks, changelog |

## Meta-skills

Meta-skills are invoked when their concern applies rather than as fixed phases:

| Skill | Use when |
|---|---|
| [go-mole](../skills/go-mole/SKILL.md) | Starting work in an unfamiliar project |
| [go-mule](../skills/go-mule/SKILL.md) | Explicitly initializing go-beast |
| [go-chat](../skills/go-chat/SKILL.md) | Technical conversation or decision support is needed |
| [go-jay](../skills/go-jay/SKILL.md) | AI context files need authoring or synchronization |
| [go-swift](../skills/go-swift/SKILL.md) | Lifecycle hooks need creating |
| [go-wren](../skills/go-wren/SKILL.md) | Existing lifecycle hooks need changing |
| [go-tern](../skills/go-tern/SKILL.md) | A diff needs review before handoff or merge |
| [go-score](../skills/go-score/SKILL.md) | A scored review and merge verdict are required |
| [go-marten](../skills/go-marten/SKILL.md) | Isolated worktrees are needed |
| [go-smith](../skills/go-smith/SKILL.md) | A missing go-* capability needs authoring |
| [go-finch](../skills/go-finch/SKILL.md) | An existing skill needs improvement |
| [go-vole](../skills/go-vole/SKILL.md) | An Obsidian vault needs design or restructuring |
| [go-bee](../skills/go-bee/SKILL.md) | A Workflow orchestration script needs authoring |

## Workflows

| Workflow | Purpose |
|---|---|
| [go-skill-eval](../workflows/go-skill-eval.js) | Evaluates go-* skills |
| [go-hook-eval](../workflows/go-hook-eval.js) | Evaluates lifecycle hooks |
| [go-workflow-eval](../workflows/go-workflow-eval.js) | Evaluates Workflow scripts |
| [go-deep-analysis](../workflows/go-deep-analysis.js) | Runs multi-dimensional repository analysis |
