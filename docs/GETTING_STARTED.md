# Getting started

go-beast is a collection of plain Markdown skills. Install the skills you need
for your agent, then use the linked documentation to understand the optional
harness integrations.

The checkout installer requires Node.js 18 or newer and has no external
dependencies.

## Choose an installation path

### Checkout-based installation

Use this path when maintaining or editing go-beast:

```bash
git clone <repo-url> <repo-dir>
node <repo-dir>/scripts/install.mjs
```

The interactive installer detects supported agents and lets you select skills,
hooks, workflows, and global instructions. For a non-interactive installation:

```bash
node <repo-dir>/scripts/install.mjs --all
node <repo-dir>/scripts/install.mjs --all --bootstrap
node <repo-dir>/scripts/install.mjs --uninstall
```

`--bootstrap` installs the stricter discovery-first instructions. `--uninstall`
removes links that point back to the checkout.

The installer records the selected integration policy in
`~/.go-beast/config.json`. You can change individual skills and hooks later
without reinstalling the pack:

```bash
go-beast integration status --agent codex --format text
go-beast integration disable --agent codex --kind skill --name go-bear
go-beast integration enable --agent codex --kind skill --name go-bear
go-beast integration disable --agent claude-code --kind hook --name docs-update-remind.sh
go-beast integration sync --agent codex --dry-run --format json
go-beast integration export --agent codex --output ./codex-profile.json
go-beast integration import --agent codex --input ./codex-profile.json --dry-run
go-beast integration preset save minimal --agent codex
go-beast integration preset list --format text
go-beast integration preset apply minimal --agent codex
```

The `all` policy enables newly published assets by default and stores only
explicitly disabled names. A `selected` policy stores only explicitly enabled
names, which is what interactive installs use. The commands are idempotent;
`--cascade` can be used when disabling a hook should also disable its known
dependents. Without it, the command reports a warning and preserves the
dependent selection.

`status --format json` also reports dependency clauses, missing dependencies,
conflicts, ownership, and whether an enabled asset is blocked. Skill dependency
rules come from `go-beast.manifest.yaml`; hook dependencies are derived from
the shared hook wiring contract. Disabling a dependency warns about affected
dependents, while `--cascade` disables known dependent assets as well.

`export` writes a validated, agent-specific JSON profile containing the desired
skill and hook policies. `import` replaces that agent policy and supports
`--dry-run`; invalid schema versions, unknown assets, and cross-agent documents
fail before changing the installed state. Presets are named snapshots stored in
the shared profile and are also bound to the agent that created them.

The reconciler removes only symlinks and generated hook commands owned by the
current go-beast checkout. Real directories, external symlinks, and custom
hook entries are reported as unmanaged and are not overwritten or deleted.

Use [go-mule](../skills/go-mule/SKILL.md) when hooks are unavailable, untrusted,
or undesirable, or when you want an explicit planning-only bootstrap. Use the
session-start sync hook when the environment already trusts automation and you
want ongoing refresh and drift correction.

### Release archive installation

Use this path when you do not want a repository checkout:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MarcosAlves90/go-beast/main/scripts/install.sh)" -- --all
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MarcosAlves90/go-beast/main/scripts/install.sh)" -- --all --bootstrap
```

The wrapper lets you select the latest or a specific GitHub release, extracts a
versioned archive under `~/.go-beast/source/`, and runs the canonical installer.
Use `--archive-url <url>` or `--archive <path>` to provide the archive directly.
Re-running the command updates the active source pointer without manual cleanup.

## Agent setup

The installer writes only the selected agent integrations and preserves
existing configuration. Claude Code uses `~/.claude/settings.json`; Codex uses
`~/.codex/hooks.json` or inline `[hooks]` configuration; Copilot CLI uses JSON
files under `~/.copilot/hooks/`.

To wire the session-start sync manually:

```bash
bash <repo-dir>/hooks/sync-go-beast-skills.sh
```

Other agents can read the self-contained files under `skills/` directly. The
plugin adapter is optional and does not replace the canonical skills directory.

For the layer boundaries behind these choices, see [Harness and bootstrap
architecture](architecture/HARNESS_BOOTSTRAP_ARCHITECTURE.md).
