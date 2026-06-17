# go-beast

![go-beast banner](go-beast-banner.png)

> A versioned skill pack for AI-assisted full-stack software development — from discovery to deployment.

Each skill is named `go-<animal>`. Each beast owns exactly one phase of the project lifecycle and produces concrete, named artifacts that feed the next beast in the chain. Skills are plain Markdown — agent-agnostic and usable with Claude Code, Cursor, Gemini, Copilot, and more. The canonical source lives in `skills/`. The repo also ships optional harness-specific adapters in `plugins/go-beast/` for surfaces that expect a manifest plus a dedicated `skills/` directory.

**Version 1.30.0** · [Changelog](CHANGELOG.md)


## Pipeline

```
go-hawk → [go-lark] → go-fox → go-otter → go-beaver
  → go-wolf + go-lynx → go-eagle → go-bear → go-raven → [go-crane] → go-owl
```

> `[brackets]` = optional. go-bear can interrupt any beast. go-owl can run at any phase.


## Skills

### Pipeline skills

| Skill | Phase | Produces |
|---|---|---|
| [go-hawk](skills/go-hawk/SKILL.md) | Discovery | `REQUIREMENTS.md`, scope, handoff plan |
| [go-lark](skills/go-lark/SKILL.md) | Solution Exploration | `APPROACH.md` — 3–5 options evaluated, one selected |
| [go-fox](skills/go-fox/SKILL.md) | Architecture | `ADR.md`, `STACK.md`, `DIAGRAM.md`, `CONTRACTS.md` |
| [go-otter](skills/go-otter/SKILL.md) | Database | ER diagram, migrations, index strategy |
| [go-beaver](skills/go-beaver/SKILL.md) | Scaffolding | Working repo skeleton, tooling, `.env.example`, `SETUP.md` |
| [go-wolf](skills/go-wolf/SKILL.md) | Backend | REST/GraphQL API, auth, middleware, validation |
| [go-lynx](skills/go-lynx/SKILL.md) | Frontend | Components, state, API integration, a11y |
| [go-eagle](skills/go-eagle/SKILL.md) | Testing | Test pyramid, unit/integration/E2E, CI gates, `TESTING.md` |
| [go-bear](skills/go-bear/SKILL.md) | Security | OWASP review, `THREAT_MODEL.md`, `SECURITY_REVIEW.md` |
| [go-raven](skills/go-raven/SKILL.md) | CI/CD | Pipeline, environments, release automation |
| [go-crane](skills/go-crane/SKILL.md) | Observability | Logging, metrics, tracing, health endpoints, `OBSERVABILITY.md` |
| [go-owl](skills/go-owl/SKILL.md) | Documentation | README, API reference, runbooks, changelog |

### Meta-skills

Invoked on demand — not bound to a phase.

| Skill | Invoke when |
|---|---|
| [go-mole](skills/go-mole/SKILL.md) | Starting work on an unfamiliar project — before other beasts |
| [go-kite](skills/go-kite/SKILL.md) | Strategic audit of an existing system before go-fox revisions |
| [go-ant](skills/go-ant/SKILL.md) | A performance problem has a numeric baseline and needs a fix |
| [go-jay](skills/go-jay/SKILL.md) | Authoring or syncing AI context files (CLAUDE.md, AGENTS.md, GEMINI.md…) |
| [go-swift](skills/go-swift/SKILL.md) `[Claude Code · Codex]` | Creating new lifecycle hook scripts |
| [go-wren](skills/go-wren/SKILL.md) `[Claude Code · Codex]` | Patching an existing lifecycle hook |
| [go-smith](skills/go-smith/SKILL.md) | A gap in the pack is identified and a new beast is needed |
| [go-tern](skills/go-tern/SKILL.md) | Reviewing a diff, task output, or branch before merge or handoff |
| [go-marten](skills/go-marten/SKILL.md) | Setting up and governing isolated git worktrees for risky or parallel work |
| [go-finch](skills/go-finch/SKILL.md) | An existing skill needs improvement after eval feedback |
| [go-vole](skills/go-vole/SKILL.md) | Designing or restructuring an Obsidian vault / PKM system |
| [go-bee](skills/go-bee/SKILL.md) | Designing and implementing multi-agent Workflow scripts (pipeline, parallel, loop patterns) |


## Hooks `[Claude Code · Codex]`

Automated guards that run on agent lifecycle events. The installer symlinks hook scripts and writes the agent hook config automatically from the shared manifest, while preserving any existing entries. Claude Code uses `~/.claude/settings.json`; Codex uses `~/.codex/hooks.json` or inline `[hooks]` tables in `~/.codex/config.toml`, then reviews them with `/hooks`.

| Hook | Event | What it does |
|---|---|---|
| `sync-go-beast-skills.sh` | `SessionStart` | Syncs skills, workflows, hooks, and global instructions for Claude Code and Codex |
| `git-commit-guard.sh` | `PreToolUse (Bash)` | Blocks commits of `.env`, credentials, build artifacts |
| `git-strip-coauthored.sh` | `PreToolUse (Bash)` | Blocks commits with `Co-Authored-By` tag |
| `code-dedup-check.sh` | `PreToolUse (Edit/Write)` | Warns when a new function/class already exists in the project |
| `code-verify-flag.sh` | `PostToolUse (Edit/Write)` | Flags the project for post-session type-check and test run |
| `code-verify-run.sh` | `Stop` | Runs tsc / mypy / go vet / cargo check + tests when source was modified |
| `docs-update-flag.sh` | `PostToolUse (Edit/Write)` | Flags the project when source code files are modified |
| `docs-update-remind.sh` | `Stop` | Blocks session close until README, docstrings, and CHANGELOG are reviewed |
| `git-commit-remind-flag.sh` | `PostToolUse (Edit/Write/MultiEdit)` | Flags the git repo when files are modified |
| `git-commit-remind.sh` | `Stop` | Reminds the agent to ask about committing/pushing uncommitted changes and to use Conventional Commits |
| `version-bump-remind.sh` | `Stop` | Reminds the agent to bump version when CHANGELOG.md has `[Unreleased]` content |


## Workflows `[Claude Code]`

| Workflow | Purpose |
|---|---|
| [go-skill-eval](workflows/go-skill-eval.js) | Evaluates all go-* skills: structural checklist + LLM-as-judge + A/B/C/D adversarial inputs |
| [go-hook-eval](workflows/go-hook-eval.js) | Tests all hooks: 27 cases covering blockers, observers, jq fallback, flag files |
| [go-workflow-eval](workflows/go-workflow-eval.js) | Evaluates Workflow scripts: structural checklist + LLM judge for correctness, coverage, and design patterns |
| [go-deep-analysis](workflows/go-deep-analysis.js) | Deep multi-dimensional codebase analysis: architecture, security, performance, testing, docs gaps, dependency health — one Markdown doc per dimension |


## Installation

Skills are plain Markdown files — any agent that can read files can use them.

**Rule:** anything in this repository that depends on a specific AI surface,
harness, hook schema, plugin system, or live agent runtime is optional. The core
pack remains the canonical `skills/` directory plus the plain Markdown docs
they depend on.

### Plugin adapter bundle

The repository now includes `plugins/go-beast/`, a plugin-oriented adapter that
packages the canonical `skills/go-*` skills behind optional Codex and Claude plugin
manifests.

This adapter is intentionally narrow:

- it exposes optional plugin metadata and a dedicated `skills/` directory
- it does **not** replace `skills/` as the source of truth
- it does **not** wire hooks through the plugin manifest; hook installation
  remains handled by `scripts/install.mjs` and `hooks/sync-go-beast-skills.sh`

### Optional bootstrap mode

`go-beast` now ships an optional stricter bootstrap in `AGENTS.bootstrap.md`.
When enabled, SessionStart sync installs that file instead of `AGENTS.global.md`
and pushes the agent toward `go-mole`, `go-hawk`, and `go-lark` before
implementation.

Enable it with:

```bash
node scripts/install.mjs --bootstrap
```

Or choose bootstrap mode in the interactive installer. The choice is persisted
at `~/.go-beast/bootstrap.enabled`.

### Interactive installer (macOS · Linux · Windows)

Requires Node.js 18+. No external dependencies.

```bash
git clone <repo-url> ~/Documents/@cherry-c/go-beast
node ~/Documents/@cherry-c/go-beast/scripts/install.mjs
```

The installer detects which agents are installed, lets you choose which skills,
optional hook integrations for hook-capable agents, and workflows (Claude Code
only) to install, creates symlinks, and writes hook config only for the agents
you actually have installed and selected. It also copies the chosen global
instructions file to the correct location for each selected agent. This remains
the supported installation path for optional hooks and global instructions even
when the plugin adapter bundle is used for skill packaging.

```bash
node scripts/install.mjs --all       # install everything, no prompts
node scripts/install.mjs --all --bootstrap # install everything with stricter bootstrap mode
node scripts/install.mjs --uninstall # remove all repo symlinks
```

### Validation

Structural and repo-local checks:

```bash
npm run sync:plugin-skills
npm run test:plugin
```

Live harness tests are opt-in because they require a working local harness
environment:

```bash
GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:claude:go-mole
GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:claude:bootstrap
GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:codex:go-tern
GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:codex:go-marten
```

These live tests are intentionally less brittle than exact-string snapshot
checks: they assert the expected skill artifacts and headings while tolerating
harmless wording differences between agent responses.

### Session-start auto-sync

The sync hook re-runs every session start and keeps the pack up to date
automatically for the optional hook-capable agents you use, currently Claude
Code and Codex.

```bash
# One-time setup
bash ~/Documents/@cherry-c/go-beast/hooks/sync-go-beast-skills.sh
```

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "command": "bash ~/.claude/hooks/sync-go-beast-skills.sh" }
    ]
  }
}
```

Use the same command in `~/.codex/hooks.json` if you wire Codex manually; this
is optional and only relevant if you use Codex.

After setup, skills are available as `/go-hawk`, `/go-fox`, etc. Workflows run via the Workflow tool or `/workflows`.

> **New skill created mid-session?** The sync only runs at session start. To activate a new beast immediately without waiting for the next session:
> ```bash
> bash ~/Documents/@cherry-c/go-beast/hooks/sync-go-beast-skills.sh
> ```

### Codex hooks (optional)

Codex discovers hook configuration from `~/.codex/hooks.json` or inline
`[hooks]` tables in `~/.codex/config.toml`. The installer writes
`~/.codex/hooks.json` only when Codex is installed and selected, and preserves
existing entries; review new or changed hooks with `/hooks`.

### Other agents (Gemini CLI, Copilot CLI, Cursor…)

Clone the repo and point your agent at `skills/`. Each skill is a self-contained `SKILL.md` — no dependencies, no platform-specific syntax.

> `go-swift` and `go-wren` support Claude Code and Codex hook schemas. Other agents may still need agent-specific guidance before hooks can be installed.


## Design principles

1. **One beast, one responsibility.** No skill duplicates another's work.
2. **Prerequisites are explicit.** Each skill states what it needs from previous beasts.
3. **Output is concrete.** Every skill produces named files. Nothing ends with "think about it."
4. **Security is not a phase.** go-bear can interrupt any beast at any time.
5. **Do not skip steps.** Each beast reduces the cost of every beast that follows.
6. **English only.** All content in this repo — skills, docs, commits, PRs — must be in English. See [AGENTS.md](AGENTS.md) for the full policy.

## Contribution patterns

- Issues: use `.github/ISSUE_TEMPLATE.md`, keep one concrete problem per issue, and list related items explicitly.
- PRs: use `.github/pull_request_template.md`, keep one concrete problem per PR, and include a GitHub closing keyword such as `Closes #123` when the PR resolves an issue.
