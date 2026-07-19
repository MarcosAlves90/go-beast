# go-beast — Agent Context

> **Scope:** This file is the context for the AI agent that **maintains this repository** (adds skills, edits docs, runs evals). It is not the context for agents that *use* the skills — users load individual `SKILL.md` files via their agent's skill system.

<!-- BEGIN GENERATED: transversal-rules -->
## Generated transversal rules — repository contract

Source: `go-beast.manifest.yaml` (schema 1, manifest 1).

These rules are generated. Edit the manifest and run the generator; do not edit this block manually.

### Principles
- Security and correctness take priority over convenience.
- Investigate before implementation and validate before completion.
- Keep canonical sources federated by domain and derive shared surfaces deterministically.

### Precedence
1. System and harness rules
2. Repository-local AGENTS.md
3. AGENTS.bootstrap.md when bootstrap mode is active
4. AGENTS.global.md

### Required phases
- **discovery:** `go-hawk discovery output`
- **solution exploration:** `go-lark approach decision`
- **validation:** `npm run verify`

### Execution constraints
- Do not fabricate requirements, validation results, or compatibility claims.
- Do not implement while a required discovery artifact is missing.
- Use the strongest relevant validation available before declaring completion.

### Federated sources
- **canonical skills:** `skills/`
- **shared hook contract:** `hooks/manifest.json`
- **release version:** `package.json`

Hook contract: `hooks/manifest.json`; wiring: `scripts/hook-wire.mjs`; session sync: `hooks/sync-go-beast-skills.sh`.

### Declarative orchestration
- **verify:** `npm run verify` (required)
- **ci:** `npm run verify` (required)
- **discovery-output:** go-hawk discovery output
- **approach-decision:** go-lark approach decision
- **validation-output:** npm run verify output
<!-- END GENERATED: transversal-rules -->

## Disposable go-beast outputs

When a go-beast workflow creates an output only for its own discovery,
planning, evaluation, review, orchestration, or session state, treat that
output as disposable unless the user explicitly makes it part of the delivery.
This rule is agent-managed and does not depend on a manifest in the target
repository.

The canonical repository-local boundary for these outputs is `.go-beast/`.
Discovery and solution artifacts belong at `.go-beast/REQUIREMENTS.md` and
`.go-beast/APPROACH.md`; workflow state belongs under `.go-beast/workflows/`.

Before staging a task output, identify its exact repository-relative path and
run this procedure from the target repository:

```bash
repo_root="$(git rev-parse --show-toplevel)"
relative_path="<exact path created by this task>"
case "$relative_path" in
  /*|../*|*/../*) echo "Refusing path outside repository: $relative_path" >&2; exit 1 ;;
esac
tracked_path="$(git -C "$repo_root" ls-files -- "$relative_path")"
if [ -n "$tracked_path" ]; then
  echo "Refusing to exclude tracked path: $relative_path" >&2
  exit 1
fi
exclude_file="$(cd "$repo_root" && git rev-parse --git-path info/exclude)"
mkdir -p "$(dirname "$exclude_file")"
pattern="/${relative_path#/}"
grep -Fqx -- "$pattern" "$exclude_file" 2>/dev/null || printf '\n# go-beast disposable output\n%s\n' "$pattern" >> "$exclude_file"
```

Use one exact path per output; use a trailing `/` only for a task-owned
directory. Never add these entries to `.gitignore`, never delete files
automatically, and never exclude a tracked path. If the output is an approved
repository deliverable, do not exclude it and stage it normally.

This is the go-beast skill pack repository. It contains skills, workflows,
optional hook integrations, an optional plugin adapter bundle, and a
cross-platform installer for the go-* family. The pack is agent-agnostic —
skills are plain Markdown and work with any agent. The sync hook
(`hooks/sync-go-beast-skills.sh`) supports optional Claude Code, Codex, and
Copilot CLI integration from the same manifest when those harnesses are
installed. `go-swift` and `go-wren` support lifecycle hooks for Claude Code,
Codex, and Copilot CLI. Codex uses `~/.codex/hooks.json` or inline `[hooks]`
tables in `~/.codex/config.toml`. Copilot CLI loads `~/.copilot/hooks/*.json`
and uses camelCase event names (`sessionStart`, `userPromptSubmitted`,
`agentStop`, `preToolUse`, `postToolUse`) with a flat entry format; the
hook-wire script writes `~/.copilot/hooks/go-beast.json` automatically.

## What this repo is

A versioned collection of agent-agnostic skills (`go-hawk`, `go-fox`, etc.),
eval workflows (`go-skill-eval`, `go-hook-eval`, `go-workflow-eval`,
`go-deep-analysis`), optional lifecycle hook scripts for hook-capable agents,
an optional plugin adapter bundle under `plugins/go-beast/`, and a
cross-platform Node.js installer (`scripts/install.mjs`). Each skill is a
directory with a `SKILL.md` and optional `references/` subfolder.

## Compatibility rule

Anything in this repository that depends on a specific AI surface, harness,
plugin schema, hook config, or live agent runtime is optional. The canonical
core is the `skills/` directory and the documentation it requires.

## Instruction files and precedence

This repository uses three instruction layers for maintainer-facing agent
behavior:

1. Repository-local `AGENTS.md` for repo-specific rules
2. `AGENTS.bootstrap.md` as an optional stricter overlay
3. `AGENTS.global.md` as the reusable baseline

The detailed contract-writing pattern and precedence model live in
`docs/architecture/AGENT_INSTRUCTION_CONTRACTS.md`.

The procedural layer for recurring maintainer workflows lives in
`docs/architecture/MAINTAINER_PROTOCOLS.md`.

Context-retention and anti-drift policy belong in the instruction layers and
the harness adapter layer. Do not scatter that policy ad hoc across unrelated
skills when the behavior is meant to apply session-wide.

## Conventions

### Skill structure

Every skill directory must have:
- `SKILL.md` with frontmatter: `name`, `version`, `description`, `when_to_use`
- Workflow steps as `### N. <Action>` headings
- A `## Rules` section (hard constraints, not guidelines)
- A `## Output` section listing every named artifact

Optional: `references/` subfolder for content referenced via `${CLAUDE_SKILL_DIR}/references/`.

### Versioning

- **Patch** (`x.y.z`, bump `z`): wording corrections, checklist fixes, typos, metadata fixes, and other backward-compatible corrections.
- **Minor** (`x.y.z`, bump `y`, reset `z` to `0`): new rules, new output sections, new skills, new hooks, or new workflows that are backward-compatible.
- **Major** (`x.y.z`, bump `x`, reset `y` and `z` to `0`): skill renamed/removed, pipeline order changed, breaking output format change, or any change that invalidates existing downstream expectations.

Always update `CHANGELOG.md` before bumping version in `PACKAGE.md` and `README.md`.
Release `[Unreleased]` changes at the smallest valid SemVer level: patch-only changes become `x.y.z`, not a new minor release.

### Language

All content in this repository must be written in **English** — no exceptions:

- Skill files (`SKILL.md`, `references/`)
- Documentation (`README.md`, `AGENTS.md`, `AGENTS.global.md`, `CHANGELOG.md`, `PACKAGE.md`)
- Commit messages and pull request titles/descriptions
- Code comments inside hooks, workflows, and scripts
- Checklist terms in `go-skill-eval.js`

If content arrives in another language, translate it to English before committing.

### Checklist quality (for go-skill-eval)

Checklist terms in `go-skill-eval.js` must be:
- **English** — no accented characters
- **Specific** — prefer artifact names (`SECURITY_REVIEW`, `erDiagram`) over vague concepts
- **Plural/singular tolerant** — the eval uses case-insensitive matching
- **Sourced from skill output sections** — match what the skill actually produces

### Reference files

If a skill step references `${CLAUDE_SKILL_DIR}/references/<file>.md`, that file must exist and contain actionable content. Do not use `${CLAUDE_SKILL_DIR}` references for content the LLM needs at execution time — inline it in the step instead.

### Pull Request Pattern

- One problem per PR.
- Commit messages must follow Conventional Commits: `type(scope): summary`. Scope is optional; use lowercase types such as `fix`, `feat`, `docs`, `chore`, `test`, `refactor`, `ci`, `build`, or `perf`.
- Use a short imperative title in the form `[area] summary`.
- Write the body from the template in `.github/pull_request_template.md`.
- Add a GitHub closing keyword such as `Closes #123` when the PR resolves an existing issue.
- Include the problem, root cause, change, validation, and risks or follow-ups.
- Do not open a PR until the full diff has been reviewed end to end.

See `CONTRIBUTING.md` for the canonical contributor workflow that ties issues,
PRs, validation, and versioning together.

### Issue Pattern

- One problem per issue.
- Use a short imperative title in the form `[area] summary`.
- Write the body from the template in `.github/ISSUE_TEMPLATE.md`.
- State the problem, why it matters, desired outcome, constraints, acceptance criteria, and related items.
- Do not file speculative issues with no concrete problem statement or no plausible owner path.

## Adding a new beast

1. Run go-smith to validate the gap is real and name the beast
2. Create `skills/go-<animal>/SKILL.md` following the structure above
3. Add to the skills tables in `README.md`
4. Add to directory tree in `PACKAGE.md`
5. Add checklist entry in `go-skill-eval.js` under `SKILLS`
6. If the skill requires real files to function, add it to `FILESYSTEM_SKILLS` in `go-skill-eval.js`
7. Add a `skillOverrides` entry in `go-skill-eval.js` with a concrete scenario for eval
8. Add or update an integration test under `tests/` when the skill changes real agent behavior
9. Run `node scripts/sync-plugin-skills.mjs` to refresh the plugin adapter bundle
10. Update `CHANGELOG.md` and bump version (minor)
11. Run `go-skill-eval` filtered to the new skill to validate before a full run:

```js
Workflow({ name: "go-skill-eval", args: { skills: ["go-<animal>"] } })
```

**To activate in Claude Code immediately after creation** (instead of waiting for next SessionStart):

```bash
bash <repo-root>/hooks/sync-go-beast-skills.sh
```

## Running the evals

```js
// Full skill eval (all skills)
Workflow({ name: "go-skill-eval" })

// Filtered skill eval
Workflow({ name: "go-skill-eval", args: { skills: ["go-swift", "go-smith"] } })

// Full hook eval
Workflow({ name: "go-hook-eval" })
```

Note: slash commands do not support args — use the Workflow tool directly for filtered runs.

## Repo layout

```
go-beast/
├── AGENTS.md              ← This file (context for the repo maintainer agent)
├── AGENTS.global.md       ← Global agent instructions — synced to each agent's config on install
├── AGENTS.bootstrap.md    ← Optional stricter bootstrap instructions synced when bootstrap mode is enabled
├── CONTRIBUTING.md        ← Canonical contributor workflow for issues, PRs, validation, and releases
├── README.md              ← Pack index, pipeline map, install instructions
├── PACKAGE.md             ← Manifest, directory tree, versioning policy
├── CHANGELOG.md           ← Version history
├── skills/
│   └── go-*/              ← Canonical skill directories
├── package.json           ← Package metadata and repo-maintenance scripts
├── .github/
│   ├── ISSUE_TEMPLATE.md        ← Issue body pattern for repo changes
│   └── pull_request_template.md ← PR body pattern for repo changes
├── plugins/
│   └── go-beast/
│       ├── .codex-plugin/plugin.json   ← Codex plugin manifest for the adapter bundle
│       ├── .claude-plugin/plugin.json  ← Claude plugin manifest for the adapter bundle
│       ├── README.md                   ← Adapter scope and maintenance notes
│       └── skills/                     ← Symlinks to canonical `skills/go-*` directories
├── scripts/
│   ├── hook-wire.mjs      ← Shared hook manifest wiring helper for config and symlinks
│   ├── install.mjs        ← Cross-platform installer (Node.js 18+, no deps)
│   └── sync-plugin-skills.mjs ← Refreshes the plugin adapter skill symlinks
├── tests/
│   ├── helpers.sh                  ← Shared shell assertions for repo integration tests
│   ├── claude-code/                ← Claude Code real-session integration tests
│   ├── codex/                      ← Codex real-session integration tests
│   └── plugin/                     ← Plugin bundle structural/integration checks
├── docs/
│   └── architecture/
│       ├── ADR-001-plugin-adapter-bundle.md ← Records the original plugin adapter architecture decision
│       ├── ADR-002-canonical-skills-directory.md ← Records the canonical `skills/` migration decision
│       ├── ADR-003-harness-bootstrap-architecture.md ← Records the harness versus bootstrap layer split
│       ├── AGENT_INSTRUCTION_CONTRACTS.md ← Explains how global, bootstrap, and repo-local agent contracts relate
│       ├── MAINTAINER_PROTOCOLS.md ← Defines discovery, implementation, validation, PR/release, and blocker protocols
│       ├── HARNESS_BOOTSTRAP_ARCHITECTURE.md ← Explains source-of-truth boundaries for maintainers
├── workflows/
│   ├── go-skill-eval.js       ← Skill eval: structural checklist + LLM-as-judge (A/B/C/D)
│   ├── go-hook-eval.js        ← Hook eval: test cases across all hooks
│   ├── go-workflow-eval.js    ← Workflow eval: structural checklist + LLM judge
│   └── go-deep-analysis.js    ← Deep multi-dimensional codebase analysis
├── hooks/
│   ├── manifest.json                  ← Shared hook manifest for Claude Code, Codex, and Copilot CLI
│   ├── sync-go-beast-skills.sh       ← SessionStart: syncs skills/workflows/hooks/global instructions
│   ├── git-commit-guard.sh           ← PreToolUse(Bash): blocks sensitive file commits
│   ├── git-strip-coauthored.sh       ← PreToolUse(Bash): blocks Co-Authored-By commits
│   ├── code-dedup-check.sh           ← PreToolUse(Edit/Write): warns on duplicate declarations
│   ├── code-verify-flag.sh           ← PostToolUse(Edit/Write): flags project for verification
│   ├── code-verify-run.sh            ← Stop: runs type checks + tests on flagged projects
│   ├── docs-update-flag.sh           ← PostToolUse(Edit/Write): flags project when source modified
│   ├── docs-update-remind.sh         ← Stop: reminds to update docs/CHANGELOG after code changes
│   ├── git-commit-remind-flag.sh     ← PostToolUse(Edit/Write/MultiEdit): flags git repo when files change
│   ├── git-commit-remind.sh          ← Stop: reminds the agent to ask user about commit/push and Conventional Commits if uncommitted changes exist
│   └── version-bump-remind.sh        ← Stop: reminds the agent to bump version when CHANGELOG.md has [Unreleased] content
```
