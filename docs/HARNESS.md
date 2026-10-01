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

## Hermes Agent (profile-scoped skills and instructions)

The installer and integration CLI install canonical skills as copies under
`$HERMES_HOME/skills/go-beast/<skill>`. Without `HERMES_HOME`, the default is
`~/.hermes` on macOS and Linux, and `%LOCALAPPDATA%\hermes` on native Windows.
The path override also selects the active Hermes profile. The same resolved
home scopes the optional go-beast instruction asset at `SOUL.md`.

Copies are deliberate: Hermes can modify or delete installed skills, so a
symlink could expose the canonical checkout to agent writes. Skill sync refreshes
only copies that still match their recorded go-beast digest. User-edited or
unmanaged skills are preserved and reported as unmanaged. Skill selections and
copy ownership are tracked independently for each resolved Hermes home, so
switching `HERMES_HOME` does not change another profile's state. Legacy
unscoped skill records migrate to the active home on first use; copies in other
homes remain untouched and are treated as unmanaged until explicitly installed.

Hermes skill-copy filesystem changes use bundled no-follow helpers for Windows,
macOS, and Linux on x64 and arm64. Node.js 18+ is the only runtime prerequisite. Go 1.25+
is needed for maintainer validation (`npm run verify`) and rebuilding
(`npm run safe-fs:build`). Each skill-copy operation is rooted at the opened
Hermes home. The Hermes-home path itself may be a symlink, but symlinked
skill-copy descendants are rejected. A missing or unsupported helper fails
closed without a path-based fallback.
Displaced previous skill copies and partial copies are retained under
`$HERMES_HOME/.go-beast-recovery/`; install and integration results report all
recovery locations. Moves use opened source and recovery directory handles with
native no-replace semantics, so a symlink swap cannot redirect a move or
overwrite an existing recovery entry. On Windows, the destination is opened
relative to the retained recovery-container handle with file and subdirectory
creation rights, then checked against the reserved directory identity before
rename. Post-move or post-restore fingerprint failures return `failed` with the
retained recovery paths; a partial restore is also moved to recovery when
possible. A failed snapshot restore is recorded as `rollback_failed`, not
`rolled_back`. Review retained copies before removing them manually.
Persisted pending or legacy transactions with a missing or malformed
installed-state fingerprint also fail closed: the target is left untouched,
the transaction is marked `rollback_failed`, and the missing ownership proof
is reported.

Hermes supports canonical skills plus one optional profile-level instruction asset:

- The integration copies `AGENTS.global.md` (standard source) or, when selected,
  `AGENTS.bootstrap.md` into the selected profile's `SOUL.md`.
- `SOUL.md` is Hermes's profile-level instruction file, analogous to that
  profile's `AGENTS.md` for other agents. Each Hermes profile has its own
  `SOUL.md`; selecting one leaves the others unchanged. The go-beast contract
  applies to Hermes runs using the selected profile.
- Without `--hermes-profile`, commands use `HERMES_HOME` when set, otherwise
  Hermes's platform default. Use `--hermes-profile default` or a name such as
  `coder` to target the default home or `profiles/<name>` under the Hermes base.
  Named profiles must already be initialized.
- Instruction source selection, desired state, and ownership are stored per
  resolved Hermes home. The integration profile can be exported/imported and
  saved as a preset without exporting local filesystem ownership records.
- Installer selection and `integration enable` are explicit replacement
  operations; the prior SOUL file is included in an install transaction.
  Ordinary `sync` refreshes only unchanged go-beast-managed files. Unmanaged or
  user-edited SOUL files are preserved and reported. `disable` removes only an
  unchanged managed SOUL.

Examples:

```bash
# Inspect the default Hermes home or a named profile
go-beast integration status --agent hermes --hermes-profile default --format json
go-beast integration status --agent hermes --hermes-profile coder --format json

# Install the standard or stricter bootstrap contract into that profile
go-beast integration enable --agent hermes --kind instructions --name global --hermes-profile coder
go-beast integration enable --agent hermes --kind instructions --name global --hermes-profile researcher --bootstrap

go-beast integration sync --agent hermes --hermes-profile researcher
```

The installer also accepts `--hermes-profile <name|default>` and `--bootstrap`;
without an explicit profile selector, its existing `HERMES_HOME` behavior is
unchanged. Hermes receives no lifecycle hooks, plugins, workflows, or
`config.yaml` mutations. The integration registry is designed to admit other
agent instruction targets later, but this release enables the surface only for
Hermes.

## Per-agent integration profiles

The installer and SessionStart reconciler use the shared profile at
`~/.go-beast/config.json`. Each supported agent has independent `skills` and,
where available, `hooks` policies. Hermes additionally stores an `instructions`
policy and source selection under the resolved Hermes home. A policy can be
`all` with a `disabled` list or `selected` with an `enabled` list.

Manage the profile through the CLI rather than editing generated hook files:

```bash
go-beast integration status --agent codex --format json
go-beast integration disable --agent codex --kind hook --name git-commit-guard.sh
go-beast integration enable --agent codex --kind hook --name git-commit-guard.sh
go-beast integration export --agent codex --output ./codex-profile.json
go-beast integration import --agent codex --input ./codex-profile.json --dry-run
go-beast integration preset list --format json
```

The reconciler is fail-closed around ownership. For link and hook surfaces it
removes only links that point to the current checkout and exact go-beast
commands from managed hook configuration. Hermes instruction sync refreshes or
removes only unchanged managed SOUL files. Existing custom entries, conflicting
files, and user-edited SOUL files remain in place and appear as `unmanaged` in
status output. JSON status also distinguishes `desired`, `installed`,
`ownership`, `classification`, and `blocked`; dependency diagnostics include
satisfied clauses, missing assets, and conflicts. Skill dependencies are read
from the canonical manifest, while hook dependencies follow the shared hook
wiring contract.

Profiles are portable per-agent policy documents. Named presets are stored in
the shared profile but cannot be applied to a different agent, which prevents
accidentally copying a Codex hook policy into an agent with another hook
surface. The plugin adapter remains a symlink view of canonical skills and is
not filtered internally by this profile layer.

The v2 profile resolver adds optional project and session layers without
rewriting the global v1 file. Run `go-beast doctor --agent codex --project .
--session <id> --format json` to inspect the effective policy. The report names
the source and precedence of each decision, identifies missing or unsupported
capabilities and conflicts, classifies managed versus unmanaged targets, and
shows the exact dry-run link and hook-configuration mutations. Doctor is
read-only; use the existing `integration` commands for explicit mutations.

Use [Getting started](GETTING_STARTED.md) for installation commands and
[Harness and bootstrap architecture](architecture/HARNESS_BOOTSTRAP_ARCHITECTURE.md)
for source-of-truth boundaries.
