# Go Beast v2 interface contracts

These contracts describe the first stable seams. JSON is the interchange
shape; implementations may use native Node objects internally.

## Capability registry

`CapabilityRegistry` reads a versioned registry and returns structural facts.

```json
{
  "schema_version": 2,
  "capabilities": [
    {
      "id": "go-hawk",
      "kind": "skill",
      "version": "1.1.0",
      "phase": "discovery",
      "depends_on": [],
      "conflicts_with": [],
      "inputs": ["user-problem"],
      "outputs": ["go-hawk discovery output"],
      "permissions": ["read-project"],
      "risk": "low",
      "supports": {"claude-code": true, "codex": true, "copilot": true},
      "deprecated": false
    }
  ]
}
```

The registry must reject duplicate IDs, unknown dependencies, invalid schema
versions, unsafe paths, and unsupported capability kinds. It must not contain
the operational prose of a `SKILL.md`.

## Effective profile resolver

Input:

```json
{
  "agent": "codex",
  "project_root": "/workspace/project",
  "session_id": "session-123",
  "sources": [
    {"scope": "global", "path": "~/.go-beast/config.json"},
    {"scope": "project", "path": ".go-beast/profile.json"},
    {"scope": "session", "path": ".go-beast/sessions/session-123.json"}
  ]
}
```

Output:

```json
{
  "schema_version": 2,
  "agent": "codex",
  "effective": {"skills": ["go-hawk"], "hooks": ["go-beast-session-state.sh"]},
  "decisions": [
    {"asset": "go-hawk", "value": "enabled", "source": "project", "precedence": 2}
  ],
  "unsupported": [],
  "conflicts": [],
  "warnings": []
}
```

The resolver is pure for inspection. Mutations are separate, require explicit
scope, and preserve unmanaged files and custom hook entries.

## Control-plane CLI

The v2 CLI should support these stable JSON-capable operations:

```text
go-beast init [--agent NAME] [--profile NAME]
go-beast doctor [--agent NAME] [--project PATH] [--format text|json]
go-beast plan --kind KIND --surface SURFACE [--format text|json]
go-beast run --plan PATH [--adapter NAME]
go-beast status [--task ID] [--format text|json]
go-beast explain <capability|decision|evidence>
go-beast resume --task ID
go-beast audit --task ID [--format text|json]
```

`run` coordinates an adapter or external runner; it does not imply permission
to modify application code. v1 commands under `integration`, `workflow`,
`delivery`, and `conformance` remain compatibility entry points during
migration.

## Workflow and evidence

Workflow events use a versioned envelope:

```json
{
  "schema_version": 2,
  "event_id": "event-123",
  "sequence": 12,
  "type": "artifact|command|approval|phase|review|finish",
  "status": "declared|observed|verified|failed",
  "task_id": "delivery-login",
  "phase": "green",
  "source": {"harness": "codex", "adapter": "go-beast-codex"},
  "actor": {"kind": "agent|human|tool", "id": "session-123"},
  "payload": {},
  "recorded_at": "2026-09-14T00:00:00Z"
}
```

Events are ordered and append-only. A verifier may promote an event to
`verified` only after naming the command, artifact digest, or human approval
that supplied the verification. An event cannot alter runtime policy state.

## Context compiler

Input: task ID, phase, context budget, project root, and requested record types.

Output: a bounded `CONTEXT_PACKET` containing selected record IDs and paths,
selection reasons, confidence, provenance, conflicts, unresolved questions,
budget, and next reads. The compiler must not inject the entire knowledge base
and must preserve the local `go-squirrel` graph and validation contract.

## Harness adapter

Every adapter declares:

```json
{
  "id": "go-beast-codex",
  "harness": "codex",
  "contract_version": 2,
  "capabilities": ["skills", "hooks", "prompt-context", "tool-events"],
  "events": {"agentStop": "stop", "preToolUse": "pre-tool"},
  "config_paths": ["~/.codex/hooks.json"],
  "degradation": ["no-hook-events -> Markdown-only"]
}
```

Adapters must preserve unrelated configuration, identify their ownership, and
fail closed on unsupported event or configuration shapes.

## Distribution transaction

The installer receives a selected release and profile, produces a dry-run plan,
verifies available release/asset integrity, then applies an atomic transaction
with a rollback record. The transaction reports exactly which files and config
entries it owns; it never overwrites an unmanaged file.
