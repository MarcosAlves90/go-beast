# go-beast — Package Manifest

```
name:    go-beast
version: 1.29.0
date:    2026-06-17
author:  @cherry-c
type:    skill-pack
scope:   full-stack software development lifecycle
```

---

Agent-specific adapters, plugin manifests, hook integrations, and live harness
tests are optional layers around the core root `go-*` skill directories.

---

## Contents

```
go-beast/
├── AGENTS.md              ← Agent context: conventions, eval usage, adding new beasts
├── AGENTS.global.md       ← Global agent instructions — synced to each agent's config on install
├── AGENTS.bootstrap.md    ← Optional stricter bootstrap instructions for discovery-first sessions
├── README.md              ← Pack index and pipeline map
├── PACKAGE.md             ← This file — manifest and metadata
├── CHANGELOG.md           ← Version history
├── package.json           ← Package metadata and maintenance scripts
├── .github/
│   └── pull_request_template.md ← PR body pattern for repo changes
├── docs/
│   └── architecture/
│       └── ADR-001-plugin-adapter-bundle.md ← Plugin adapter architecture decision
├── plugins/
│   └── go-beast/
│       ├── .codex-plugin/
│       │   └── plugin.json ← Codex plugin manifest for the adapter bundle
│       ├── .claude-plugin/
│       │   └── plugin.json ← Claude plugin manifest for the adapter bundle
│       ├── README.md       ← Adapter scope and maintenance notes
│       └── skills/         ← Symlinks to canonical root go-* skills
├── go-hawk/
│   └── SKILL.md           ← Discovery & Requirements
├── go-lark/
│   └── SKILL.md           ← Solution Space Exploration
├── go-fox/
│   └── SKILL.md           ← Architecture & Design
├── go-beaver/
│   └── SKILL.md           ← Scaffolding & Project Init
├── go-wolf/
│   └── SKILL.md           ← Backend API Development
├── go-lynx/
│   └── SKILL.md           ← Frontend UI Development
├── go-otter/
│   └── SKILL.md           ← Database Design & Migrations
├── go-eagle/
│   ├── SKILL.md           ← Testing Strategy & QA
│   └── references/        ← Test level guidelines
├── go-bear/
│   ├── SKILL.md           ← Security Review & Hardening
│   ├── references/        ← Security review supporting checklists
│   └── output/            ← Security review output templates
├── go-raven/
│   ├── SKILL.md           ← CI/CD & Deployment
│   └── references/        ← Pipeline templates and rollout guidance
├── go-owl/
│   ├── SKILL.md           ← Documentation
│   └── references/        ← Runbook template
├── go-jay/
│   ├── SKILL.md           ← AI Context File Editor
│   └── references/
│       └── REFERENCE.md   ← CLAUDE.md conventions, memory schema, sync protocol
├── go-marten/
│   └── SKILL.md           ← Git Worktrees (meta-skill)
├── go-mole/
│   └── SKILL.md           ← Documentation Briefing
├── go-smith/
│   └── SKILL.md           ← Skill Authoring (meta-skill)
├── go-tern/
│   └── SKILL.md           ← Code Review (meta-skill)
├── go-swift/
│   └── SKILL.md           ← Lifecycle Hook Authoring
├── go-kite/
│   └── SKILL.md           ← Architecture Health Audit (meta-skill)
├── go-crane/
│   └── SKILL.md           ← Observability & Monitoring
├── go-ant/
│   └── SKILL.md           ← Performance Profiling & Optimization
├── go-wren/
│   └── SKILL.md           ← Lifecycle Hook Maintenance (meta-skill)
├── go-finch/
│   └── SKILL.md           ← go-* Skill Maintenance (meta-skill)
├── go-vole/
│   └── SKILL.md           ← Obsidian Vault Design & PKM (meta-skill)
├── go-bee/
│   └── SKILL.md           ← Workflow Script Authoring (meta-skill)
├── workflows/
│   ├── go-skill-eval.js       ← Skill eval pipeline: all go-* skills, structural checklist + LLM-as-judge (A/B/C/D)
│   ├── go-hook-eval.js        ← Hook eval pipeline across all go-beast hooks
│   ├── go-workflow-eval.js    ← Workflow eval pipeline for Workflow scripts
│   └── go-deep-analysis.js    ← Deep multi-dimensional codebase analysis workflow
├── scripts/
│   ├── hook-wire.mjs          ← Shared hook manifest wiring helper for config and symlinks
│   ├── install.mjs            ← Cross-platform installer (Node.js 18+, no deps)
│   └── sync-plugin-skills.mjs ← Refreshes the plugin adapter skill symlinks
├── tests/
│   ├── helpers.sh             ← Shared shell assertions for integration tests
│   ├── claude-code/           ← Claude Code real-session integration tests
│   ├── codex/                 ← Codex real-session integration tests
│   └── plugin/                ← Plugin bundle checks
└── hooks/
    ├── manifest.json             ← Shared hook manifest for Claude Code and Codex
    ├── sync-go-beast-skills.sh    ← SessionStart: syncs skills/workflows/hooks/global instructions
    ├── git-commit-guard.sh        ← PreToolUse(Bash): blocks commits of sensitive files/build artifacts
    ├── code-dedup-check.sh        ← PreToolUse(Edit/Write): warns on duplicate function/class names
    ├── code-verify-flag.sh        ← PostToolUse(Edit/Write): flags project for post-session verification
    ├── code-verify-run.sh         ← Stop: runs tsc/mypy/go vet/cargo check + tests on flagged projects
    ├── docs-update-flag.sh        ← PostToolUse(Edit/Write): flags project when source files are modified
    ├── docs-update-remind.sh       ← Stop: reminds to update README/docstrings/CHANGELOG after code changes
    ├── git-strip-coauthored.sh     ← PreToolUse(Bash): blocks commits with Co-Authored-By tag
    ├── git-commit-remind-flag.sh   ← PostToolUse(Edit/Write/MultiEdit): flags git repo when files change
    ├── git-commit-remind.sh        ← Stop: reminds about commit/push and Conventional Commits if uncommitted changes exist
    └── version-bump-remind.sh      ← Stop: reminds the agent to bump version when CHANGELOG.md has [Unreleased] content
```

---

## Dependency graph

Each skill lists its prerequisites. The canonical execution order is:

```
go-hawk
  └─► go-lark (optional — invoke when problem space is ambiguous)
        └─► go-fox
        └─► go-otter (parallel with go-fox is fine)
        └─► go-beaver
              ├─► go-wolf
              └─► go-lynx
                    └─► go-eagle
                          └─► go-bear  ← also invocable earlier on any security-sensitive feature
                                └─► go-raven
                                      └─► go-crane (optional — invoke when production visibility is needed)
                                            └─► go-owl  ← also invocable at any phase
```

**Meta-skills** — invoked on demand, not bound to a phase:

```
go-mole    ← session briefing; invoke before any other beast on an unfamiliar project
go-kite    ← architecture health audit; invoke before go-fox revisions on existing systems
go-ant     ← performance; invoke only when a numeric baseline proves a bottleneck exists
go-jay     ← AI context files; invoke when instructions cannot express the needed behavior
  └─► go-swift   ← hook automation; invoke after go-jay when shell-level automation is needed
        └─► go-raven  ← includes hooks in CI/CD and onboarding scripts
go-smith   ← skill authoring; invoke when a pack gap is identified
go-tern    ← code review; invoke after implementation and before merge or handoff
go-marten  ← isolated git worktrees; invoke before risky or parallel work in a clean repo
go-finch   ← skill maintenance; invoke when an existing skill needs improvement (not replacement)
go-wren    ← hook maintenance; invoke when an existing hook needs to be changed (not created)
go-vole    ← Obsidian vault design and PKM; invoke on demand for vault setup, restructuring, or plugin config
go-bee     ← Workflow script authoring; invoke when a multi-agent orchestration script needs to be built
```

---

## Versioning policy

- **Patch** (`x.y.z`, bump `z`): corrections to wording, checklist fixes, typos, metadata fixes, and other backward-compatible corrections.
- **Minor** (`x.y.z`, bump `y`, reset `z` to `0`): new sections, new rules, new outputs, new skills, new hooks, or new workflows that are backward-compatible.
- **Major** (`x.y.z`, bump `x`, reset `y` and `z` to `0`): skill renamed, skill removed, pipeline order changed, breaking change to output format, or any change that invalidates existing downstream expectations.

Always update `CHANGELOG.md` before bumping the version in this file.
Release `[Unreleased]` changes at the smallest valid SemVer level: patch-only changes become `x.y.z`, not a new minor release.

---

## Adding a new beast

1. Run go-smith to validate that the gap is real and name the beast.
2. Create `go-<animal>/SKILL.md` following the existing structure.
3. The skill must have a unique responsibility not covered by any existing beast.
4. State prerequisites clearly.
5. Add the beast to the table in `README.md` and the dependency graph above.
6. Add checklist entry in `workflows/go-skill-eval.js` under `SKILLS`.
7. If the skill requires real files to function, add it to `FILESYSTEM_SKILLS` in `workflows/go-skill-eval.js`.
8. Add a `skillOverrides` entry in `workflows/go-skill-eval.js` with a concrete scenario for eval.
9. Add or update an integration test under `tests/` when the skill changes real agent behavior.
10. Run `node scripts/sync-plugin-skills.mjs` to refresh the plugin adapter bundle.
11. Add a changelog entry under `[Unreleased]`.
12. Bump version in this file and in `README.md`.
13. Run `go-skill-eval` filtered to the new skill before a full eval.

## Adding a workflow

1. Create `workflows/<name>.js` following the Workflow tool script conventions.
2. The `export const meta` block must have `name`, `description`, and `phases`.
3. Add the workflow to the Workflows table in `README.md` and the tree in `PACKAGE.md`.
4. Add a changelog entry under `[Unreleased]`.

## Adding a hook

1. Create `hooks/<name>.sh` as a bash script.
2. Make it idempotent — safe to run on every session start.
3. Add a manifest entry in `hooks/manifest.json`.
4. Add the hook to the Hooks table in `README.md` and the tree in `PACKAGE.md`.
5. Add a changelog entry under `[Unreleased]`.
