# Optional workflow engine

The workflow engine is an optional state-machine coordinator for declarative
pipelines. It does not execute skills. An external agent or runner performs the
skill work and reports phase completion through the CLI.

## Manifest contract

Workflow manifests live in `workflows/` and use JSON or the supported YAML
subset. Each phase declares:

- `skill`: the skill an external runner should execute;
- `depends_on`: completed phases required before the phase can start;
- `preconditions`: paths or environment variables that must exist;
- `requires`: input artifact contracts;
- `produces`: output artifact contracts;
- `transitions`: the only valid next phases.

The schema is versioned in `go-beast.workflow.schema.json`. The example
`workflows/minimal-pipeline.json` is intentionally small and does not replace
the existing evaluation workflows.

## CLI

After package installation, use:

```bash
go-beast workflow validate --file workflows/minimal-pipeline.json
go-beast workflow start --file workflows/minimal-pipeline.json
go-beast workflow status --file workflows/minimal-pipeline.json
go-beast workflow begin --file workflows/minimal-pipeline.json --phase discover
go-beast workflow complete --file workflows/minimal-pipeline.json --phase discover
```

The CLI resolves package resources, such as `go-beast.workflow.schema.json`,
from the installed package location. Workflow manifests, state, locks, and
artifacts are resolved from the project root: pass `--root <path>` for an
explicit root, or omit it to discover the nearest ancestor containing a
`workflows/` directory and then fall back to the current directory.

`npm run workflow -- <command>` is available in a checkout. `resume` reads the
persisted state and reports the current phase statuses; running `begin` again
for a completed phase reopens it and invalidates its dependent phases.

## Modes and state

The mode precedence is CLI `--mode`, `GO_BEAST_WORKFLOW_MODE`, manifest
`mode`, then `warn`. In `off`, coordination is disabled. In `warn`, invalid
runtime conditions are reported and the operation continues. In `strict`, the
operation is blocked.

State is JSON under `.go-beast/workflows/` and is local disposable output. The
directory is added to the repository's local Git exclude by setup; workflow
manifests and schemas remain commit-worthy. `verify` validates manifests and
schemas but does not execute workflows.

## Concurrent updates

Persisted state includes a monotonically increasing `revision`. Mutating
commands acquire `.go-beast/workflows/locks/<workflow-id>.lock`, reload the
state, and save only when the expected revision is still current. A mismatch
returns `WORKFLOW_CONFLICT` instead of overwriting another writer.

Each lock has a unique `lock_id`; release validates that the file still belongs
to the acquiring process before removing it. Lock metadata also records PID,
hostname, agent, session ID, and creation time. On the same host, a live PID is
never expired solely because the timeout elapsed; a dead PID is stale. For a
different host, timeout is the fallback because process liveness cannot be
verified.
Live locks return `WORKFLOW_LOCK_CONFLICT`; stale locks are never stolen
implicitly. Recover one explicitly with:

```bash
go-beast workflow unlock --file workflows/minimal-pipeline.json
```

The default stale timeout is five minutes and can be adjusted with
`GO_BEAST_WORKFLOW_LOCK_TIMEOUT_MS`. State replacement is atomic, and the
concurrency regression test runs two processes against the same workflow.

Only the CLI is supported as a state writer. The revision check is an
application-level optimistic concurrency guard, not a filesystem CAS primitive
against arbitrary external writers. Distributed coordination across machines
is outside the scope of this engine.
