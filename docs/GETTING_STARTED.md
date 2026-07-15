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
