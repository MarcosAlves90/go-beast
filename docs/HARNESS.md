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

Use [Getting started](GETTING_STARTED.md) for installation commands and
[Harness and bootstrap architecture](architecture/HARNESS_BOOTSTRAP_ARCHITECTURE.md)
for source-of-truth boundaries.
