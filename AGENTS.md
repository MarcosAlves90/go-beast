# go-beast — Agent Context

> **Scope:** This file is the context for the AI agent that **maintains this repository** (adds skills, edits docs, runs evals). It is not the context for agents that *use* the skills — users load individual `SKILL.md` files via their agent's skill system.

This is the go-beast skill pack repository. It contains skills, workflows, and hooks for the go-* family. The pack is agent-agnostic — skills are plain Markdown and work with any agent. The Claude Code sync hook (`hooks/sync-go-beast-skills.sh`) and `go-swift` are the only Claude Code-specific components.

---

## What this repo is

A versioned collection of Claude Code skills (`go-hawk`, `go-fox`, etc.), one workflow (`go-star-eval`), and one hook (`sync-go-beast-skills.sh`). Each skill is a directory with a `SKILL.md` and optional `references/` subfolder.

---

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

### Checklist quality (for go-star-eval)

Checklist terms in `go-star-eval.js` must be:
- **English** — avoid accented characters or Portuguese terms
- **Specific** — prefer artifact names (`SECURITY_REVIEW`, `erDiagram`) over concepts (`recomendações`)
- **Plural/singular tolerant** — the eval uses case-insensitive matching with variant acceptance
- **Sourced from skill output sections** — match what the skill actually produces, not what it describes

### Reference files

If a skill step references `${CLAUDE_SKILL_DIR}/references/<file>.md`, that file must exist and contain actionable content. Do not use `${CLAUDE_SKILL_DIR}` references for content the LLM needs at execution time — inline it in the step instead (see go-bear step 6, go-raven step 3, go-owl step 4 as examples of correctly inlined content).

---

## Adding a new beast

1. Run go-smith to validate the gap is real and name the beast
2. Create `go-<animal>/SKILL.md` following the structure above
3. Add to skills table and dependency graph in `README.md`
4. Add to directory tree in `PACKAGE.md`
5. Add checklist entry in `go-star-eval.js` under `SKILLS`
6. Update `CHANGELOG.md` and bump version (minor)
7. Run `go-star-eval` with `args: { skills: ["go-<animal>"] }` to validate the new skill before a full run

**Symlink note:** the skill becomes available in Claude Code when `sync-go-beast-skills.sh` runs (next SessionStart). To use it immediately after creation, run the hook manually:

```bash
bash ~/Documents/@cherry-c/go-beast/hooks/sync-go-beast-skills.sh
```

---

## Running the eval

```js
// Full run (all skills)
Workflow({ name: "go-star-eval" })

// Filtered run (one or more skills)
Workflow({ name: "go-star-eval", args: { skills: ["go-swift", "go-smith"] } })
```

Note: `/go-star-eval` slash command does not support args — use the Workflow tool directly for filtered runs.

---

## Repo layout

```
go-beast/
├── AGENTS.md              ← This file (project-level agent context)
├── AGENTS.global.md       ← Global agent instructions — source of truth for ~/.claude/AGENTS.md
├── README.md              ← Pack index, pipeline map, install instructions
├── PACKAGE.md             ← Manifest, directory tree, dependency graph, versioning policy
├── CHANGELOG.md           ← Version history
├── go-*/
│   └── SKILL.md           ← One skill per beast
├── workflows/
│   └── go-star-eval.js    ← Eval pipeline (A/B/C benchmark, args.skills filter)
└── hooks/
    ├── sync-go-beast-skills.sh  ← SessionStart: symlinks skills/workflows/hooks + syncs AGENTS.global.md
    ├── git-commit-guard.sh      ← PreToolUse(Bash): blocks commits of sensitive files
    ├── code-dedup-check.sh      ← PreToolUse(Edit/Write): warns on duplicate declarations
    ├── code-verify-flag.sh      ← PostToolUse(Edit/Write): flags project for verification
    ├── code-verify-run.sh       ← Stop: runs tsc/mypy/go vet/cargo check + tests
    ├── docs-update-flag.sh      ← PostToolUse(Edit/Write): flags project when source files are modified
    ├── docs-update-remind.sh    ← Stop: reminds to update README/docstrings/CHANGELOG after code changes
    └── git-strip-coauthored.sh  ← PreToolUse(Bash): blocks commits with Co-Authored-By tag
```
