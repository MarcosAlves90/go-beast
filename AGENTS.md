# go-beast — Agent Context

> **Scope:** This file is the context for the AI agent that **maintains this repository** (adds skills, edits docs, runs evals). It is not the context for agents that *use* the skills — users load individual `SKILL.md` files via their agent's skill system.

This is the go-beast skill pack repository. It contains skills, workflows, hooks, and a cross-platform installer for the go-* family. The pack is agent-agnostic — skills are plain Markdown and work with any agent. The Claude Code sync hook (`hooks/sync-go-beast-skills.sh`), `go-swift`, and `go-wren` are the only Claude Code-specific components.

## What this repo is

A versioned collection of agent-agnostic skills (`go-hawk`, `go-fox`, etc.), eval workflows (`go-skill-eval`, `go-hook-eval`, `go-workflow-eval`, `go-deep-analysis`), a set of Claude Code hooks, and a cross-platform Node.js installer (`scripts/install.mjs`). Each skill is a directory with a `SKILL.md` and optional `references/` subfolder.

## Conventions

### Skill structure

Every skill directory must have:
- `SKILL.md` with frontmatter: `name`, `version`, `description`, `when_to_use`
- Workflow steps as `### N. <Action>` headings
- A `## Rules` section (hard constraints, not guidelines)
- A `## Output` section listing every named artifact

Optional: `references/` subfolder for content referenced via `${CLAUDE_SKILL_DIR}/references/`.

### Versioning

- **Patch** (1.0.x): wording corrections, checklist fixes, typos
- **Minor** (1.x.0): new rules, new output sections, new skills added
- **Major** (x.0.0): skill renamed/removed, pipeline order changed, breaking output format change

Always update `CHANGELOG.md` before bumping version in `PACKAGE.md` and `README.md`.

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

## Adding a new beast

1. Run go-smith to validate the gap is real and name the beast
2. Create `go-<animal>/SKILL.md` following the structure above
3. Add to the skills tables in `README.md`
4. Add to directory tree in `PACKAGE.md`
5. Add checklist entry in `go-skill-eval.js` under `SKILLS`
6. If the skill requires real files to function, add it to `FILESYSTEM_SKILLS` in `go-skill-eval.js`
7. Add a `skillOverrides` entry in `go-skill-eval.js` with a concrete scenario for eval
8. Update `CHANGELOG.md` and bump version (minor)
9. Run `go-skill-eval` filtered to the new skill to validate before a full run:

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
├── README.md              ← Pack index, pipeline map, install instructions
├── PACKAGE.md             ← Manifest, directory tree, versioning policy
├── CHANGELOG.md           ← Version history
├── go-*/
│   ├── SKILL.md           ← One skill per beast
│   └── references/        ← Optional: supporting content for the skill
├── scripts/
│   └── install.mjs        ← Cross-platform installer (Node.js 18+, no deps)
├── workflows/
│   ├── go-skill-eval.js       ← Skill eval: structural checklist + LLM-as-judge (A/B/C/D)
│   ├── go-hook-eval.js        ← Hook eval: test cases across all hooks
│   ├── go-workflow-eval.js    ← Workflow eval: structural checklist + LLM judge
│   └── go-deep-analysis.js    ← Deep multi-dimensional codebase analysis
├── hooks/
│   ├── sync-go-beast-skills.sh       ← SessionStart: symlinks skills/workflows/hooks
│   ├── git-commit-guard.sh           ← PreToolUse(Bash): blocks sensitive file commits
│   ├── git-strip-coauthored.sh       ← PreToolUse(Bash): blocks Co-Authored-By commits
│   ├── code-dedup-check.sh           ← PreToolUse(Edit/Write): warns on duplicate declarations
│   ├── code-verify-flag.sh           ← PostToolUse(Edit/Write): flags project for verification
│   ├── code-verify-run.sh            ← Stop: runs type checks + tests on flagged projects
│   ├── docs-update-flag.sh           ← PostToolUse(Edit/Write): flags project when source modified
│   ├── docs-update-remind.sh         ← Stop: reminds to update docs/CHANGELOG after code changes
│   ├── git-commit-remind-flag.sh     ← PostToolUse(Edit/Write/MultiEdit): flags git repo when files change
│   ├── git-commit-remind.sh          ← Stop: reminds Claude to ask user about commit/push if uncommitted changes exist
│   └── version-bump-remind.sh        ← Stop: reminds Claude to bump version when CHANGELOG.md has [Unreleased] content
```
