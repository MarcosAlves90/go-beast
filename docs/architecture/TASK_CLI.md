# Task-oriented CLI

The v2 task CLI is a thin control-plane facade over the existing Go Beast
planner, workflow engine, adapter SDK, and capability registry. It gives users
one task ID and one JSON-capable command vocabulary without changing the v1
namespaces.

## Commands

```bash
go-beast init --id task-login --agent codex --profile default
go-beast plan --task task-login --kind feature --surface backend --format json
go-beast run --task task-login --adapter codex --format json
go-beast status --task task-login --format json
go-beast resume --task task-login --format json
go-beast explain capability go-hawk --format json
go-beast audit --task task-login --format json
go-beast doctor --agent codex --project . --format json
```

The existing `doctor` command is already a v2 diagnostic surface and remains
available beside the task facade. Existing `delivery`, `workflow`,
`integration`, `conformance`, `capabilities`, `evidence`, and `context`
namespaces are compatibility entry points and are not rewritten by this layer.

## Delegation model

- `init` creates a project-local `.go-beast/tasks/<id>.json` record with the
  selected agent/profile and compatibility metadata.
- `plan` invokes the existing delivery planner and stores its route under
  `.go-beast/tasks/<id>/plan.json`.
- `run` converts that plan into a v2 workflow manifest and invokes the existing
  workflow engine. Selecting an adapter records its declared ID; it does not
  grant permission to modify application code or claim live execution.
- `status` and `resume` delegate to the workflow engine, preserving its locks,
  revision checks, recovery, and phase gates.
- `explain capability` reads the canonical capability registry. It reports
  source, phase, inputs, outputs, permissions, risk, and support metadata.
- `audit` checks the presence of task, plan, manifest, and workflow-state files
  and explicitly labels execution evidence as `not_verified`.

## State and safety

Task records are versioned by `go-beast.task.schema.json`. All control-plane
artifacts stay below the selected `--root`; task IDs are constrained to a
portable lowercase form and generated paths reject root traversal. Task state
is disposable and belongs under `.go-beast/`, consistent with the repository
workflow contract.

JSON output has a stable `schema_version`, `command`, and `task_id` envelope so
scripts can consume it without parsing human text. Text output remains concise
for interactive use. Delegated command failures propagate as non-zero exits and
are never converted into successful task records.
