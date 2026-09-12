# Harness integrations

The canonical pack is the `skills/` directory and its plain Markdown. Hooks,
workflows, and plugin manifests are optional adapters for supported agent
surfaces.

## Hooks

The shared manifest describes the lifecycle hooks. The installer wires selected
hooks while preserving existing entries. The main responsibilities are:

- sync skills, workflows, hooks, and instructions at session start;
- maintain anti-drift state and re-anchor bootstrap sessions;
- guard sensitive commits and `Co-Authored-By` trailers;
- flag verification, documentation, version, and commit reminders.

The complete hook-to-event mapping is in [PACKAGE.md](../PACKAGE.md) and the
shared source of truth is [hooks/manifest.json](../hooks/manifest.json).

## Plugin adapter

`plugins/go-beast/` provides optional Codex and Claude plugin manifests and
symlinks to the canonical skills. It does not install hooks and does not become
the source of truth.

## Configuration surfaces

- Claude Code: `~/.claude/settings.json`
- Codex: `~/.codex/hooks.json` or inline `[hooks]` tables in
  `~/.codex/config.toml`
- Copilot CLI: `~/.copilot/hooks/*.json`, with camelCase event names

## Per-agent integration profiles

The installer and SessionStart reconciler use the shared profile at
`~/.go-beast/config.json`. Each supported agent has independent `skills` and,
where available, `hooks` policies. A policy can be `all` with a `disabled`
list or `selected` with an `enabled` list.

Manage the profile through the CLI rather than editing generated hook files:

```bash
go-beast integration status --agent codex --format json
go-beast integration disable --agent codex --kind hook --name git-commit-guard.sh
go-beast integration enable --agent codex --kind hook --name git-commit-guard.sh
go-beast integration export --agent codex --output ./codex-profile.json
go-beast integration import --agent codex --input ./codex-profile.json --dry-run
go-beast integration preset list --format json
```

The reconciler is fail-closed around ownership: it only removes links that
point to the current checkout and removes only exact go-beast commands from
the managed hook configuration. Existing custom entries and conflicting files
remain in place and appear as `unmanaged` in status output. JSON status also
distinguishes `desired`, `installed`, `ownership`, `classification`, and
`blocked`; dependency diagnostics include satisfied clauses, missing assets,
and conflicts. Skill dependencies are read from the canonical manifest, while
hook dependencies follow the shared hook wiring contract.

Profiles are portable per-agent policy documents. Named presets are stored in
the shared profile but cannot be applied to a different agent, which prevents
accidentally copying a Codex hook policy into an agent with another hook
surface. The plugin adapter remains a symlink view of canonical skills and is
not filtered internally by this profile layer.

Use [Getting started](GETTING_STARTED.md) for installation commands and
[Harness and bootstrap architecture](architecture/HARNESS_BOOTSTRAP_ARCHITECTURE.md)
for source-of-truth boundaries.
