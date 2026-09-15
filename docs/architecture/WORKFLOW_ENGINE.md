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

Schema version 2 adds optional route metadata: `parallel_group` groups
independent phases into one coordinator slice, `retry.max_attempts` bounds
attempts, `handoff.targets` declares allowed external agents, and `checkpoint`
marks phases that benefit from durable provenance. Version 1 manifests remain
valid and compile through the same route boundary.

### Artifact validators

Artifact descriptors retain the legacy `non_empty` and `sections` fields. New
manifests may also declare multiple typed validators in `validators`; all
declared validators must pass when the workflow runs in `strict` mode:

```json
{
  "path": ".go-beast/report.md",
  "type": "file",
  "non_empty": true,
  "validators": [
    { "type": "markdown-heading", "text": "Report", "level": 1 },
    { "type": "contains-pattern", "pattern": "Status: (PASS|WARN)" }
  ]
}
```

The built-in validator types are:

- `non-empty` — rejects empty files and directories;
- `markdown-heading` — matches an exact ATX heading, optionally at a specific
  level, while ignoring fenced code blocks;
- `json-schema` — parses the artifact as JSON and validates it against a
  repository-relative schema file using the documented in-process subset;
- `yaml-valid` — parses the artifact with go-beast's supported YAML subset;
- `contains-pattern` — applies a bounded regular expression with only `i`,
  `m`, and `s` flags to content up to 2 MiB.

Validator paths cannot escape the repository, command execution is not
available through this contract, and failures identify both the artifact and
the validator. Backreferences, lookarounds, nested quantifiers, and patterns
over 256 characters are rejected. The `json-schema` validator intentionally
rejects unsupported keywords instead of silently claiming full Draft 2020-12
compatibility.

## CLI

After package installation, use:

```bash
go-beast workflow validate --file workflows/minimal-pipeline.json
go-beast workflow plan --file workflows/minimal-pipeline.json --format json
go-beast workflow start --file workflows/minimal-pipeline.json
go-beast workflow status --file workflows/minimal-pipeline.json
go-beast workflow begin --file workflows/minimal-pipeline.json --phase discover
go-beast workflow continue --file workflows/minimal-pipeline.json
go-beast workflow checkpoint --file workflows/minimal-pipeline.json --phase discover --name discovery --artifact .go-beast/REQUIREMENTS.md
go-beast workflow handoff --file workflows/minimal-pipeline.json --phase discover --to codex --note "Continue external execution"
go-beast workflow retry --file workflows/minimal-pipeline.json --phase discover
go-beast workflow resume --file workflows/minimal-pipeline.json
go-beast workflow complete --file workflows/minimal-pipeline.json --phase discover
```

`plan` compiles a deterministic topological route with dependency edges and
parallel slices without writing state. `continue` atomically starts every
eligible phase whose dependencies and gates are satisfied; it never invokes the
declared skill. `resume` converts running phases left by an interrupted process
to `interrupted`, while `retry` queues an interrupted, failed, or handed-off
phase for its next bounded attempt. `checkpoint` stores only hashes, metadata,
and command context. `handoff` records a bounded note and target agent while
leaving execution to that external agent or runner.

The CLI resolves package resources, such as `go-beast.workflow.schema.json`,
from the installed package location. Workflow manifests, state, locks, and
artifacts are resolved from the project root: pass `--root <path>` for an
explicit root, or omit it to discover the nearest ancestor containing a
`workflows/` directory and then fall back to the current directory.

`npm run workflow -- <command>` is available in a checkout. A v1 persisted state
is migrated to the v2 state shape on the first mutating command or `resume`; its
history is retained and a migration event is recorded. Migration does not
authorize a phase or infer a completion claim. Running `begin` again for a
completed phase reopens it and invalidates its dependent phases.

## Modes and state

The mode precedence is CLI `--mode`, `GO_BEAST_WORKFLOW_MODE`, manifest
`mode`, then `warn`. In `off`, coordination is disabled. In `warn`, invalid
runtime conditions are reported and the operation continues. In `strict`, the
operation is blocked.

State is JSON under `.go-beast/workflows/` and is local disposable output. The
directory is added to the repository's local Git exclude by setup; workflow
manifests and schemas remain commit-worthy. `verify` validates manifests and
schemas but does not execute workflows.

Checkpoint records contain SHA-256 artifact digests, actor/session metadata,
and the command working directory; they never persist prompts or command
output. Handoff notes are bounded and targets are checked against the phase's
declared `handoff.targets` list when one exists.

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
