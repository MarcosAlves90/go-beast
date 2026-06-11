---
name: go-mole
version: 1.0.0
description: Scans and reads all documentation in a project — README, CHANGELOG, CONTRIBUTING, CLAUDE.md, AGENTS.md, GEMINI.md, /docs, /wiki, and key config files — then produces a compact briefing that stays in session context for downstream tasks and other skills.
when_to_use: Use at the start of any session involving an unfamiliar or partially-known project, before invoking go-hawk or go-fox, or whenever a task requires understanding what the project says about itself. Invoke before asking questions that the docs might already answer.
---

# go-mole — Documentation Briefing

go-mole digs through the project's written knowledge and surfaces it as a compact briefing. Its output stays live in session context, feeding every other beast without repetition.

## Quick start

```
→ invoke go-mole
→ scan docs → extract signals → produce briefing → hold in context
```

## Workflow

### 1. Locate documentation

Search the working directory for (in priority order):

**Agent/AI instructions**
- [ ] `CLAUDE.md`, `.claude/CLAUDE.md`
- [ ] `AGENTS.md`
- [ ] `GEMINI.md`, `COPILOT.md`

**Project documentation**
- [ ] `README.md`, `README.rst`, `README.txt`
- [ ] `CONTRIBUTING.md`, `CONTRIBUTING.rst`
- [ ] `CHANGELOG.md`, `HISTORY.md`, `CHANGES.md`
- [ ] `ARCHITECTURE.md`, `DESIGN.md`
- [ ] `docs/` and `wiki/` directories (recursive, up to 2 levels)

**Config files with descriptive metadata**
- [ ] `package.json` → `name`, `description`, `scripts`, `dependencies`
- [ ] `pyproject.toml` / `setup.py` / `setup.cfg` → `description`, `dependencies`
- [ ] `Cargo.toml` → `description`, `dependencies`
- [ ] `go.mod` → module name
- [ ] `Makefile` → targets as feature map

### 2. Extract signals

For each file found, extract only what is non-obvious from the code:

| Signal | Where to look |
|---|---|
| Project purpose and audience | README intro, package description |
| Tech stack declared | README stack section, package.json, pyproject.toml |
| Setup and run commands | README quickstart, Makefile, scripts |
| Agent/AI behavioral constraints | CLAUDE.md, AGENTS.md, GEMINI.md |
| Contribution rules and conventions | CONTRIBUTING.md |
| Recent changes and current version | CHANGELOG.md last 2–3 entries |
| Architectural decisions | ARCHITECTURE.md, ADRs in docs/ |
| Known issues or TODOs called out in docs | README caveats, CONTRIBUTING known issues |

### 3. Produce the briefing

Output a single compact block under the heading `## Project Briefing`. Keep it under 40 lines. Use bullet points, not prose.

```md
## Project Briefing — <project name>

**Purpose:** <one sentence>
**Stack:** <languages, frameworks, key libs>
**Run:** <minimal commands to install and start>
**Test:** <minimal commands to run tests>
**Agent rules:** <any constraints from CLAUDE.md / AGENTS.md — quote directly if precise wording matters>
**Contribution conventions:** <branch naming, PR rules, code style mandates>
**Recent changes:** <last 2–3 changelog entries, one line each>
**Architecture notes:** <only if an ADR or architecture doc exists>
**Gaps:** <documentation that is absent, outdated, or contradictory>
```

**When documentation is absent or minimal:** produce all sections anyway, marking inferred values with `(inferred)`. Base inference on: project name, stack, domain, config file metadata. Do not omit sections — a skeleton with `(inferred)` labels is more useful than a blank briefing. List every inferred section under **Gaps** so the reader knows what needs to be written.

Only omit a section if neither documentation nor any inferrable signal exists for it.

### 4. Hold in context

After producing the briefing, state:

> "Briefing loaded. I'll use this as context for the rest of the session without re-reading the docs unless you ask."

Do not re-scan unless the user says documentation changed or explicitly asks for a refresh.

## Rules

- Never fabricate. If a doc is missing, list it under **Gaps**.
- Do not summarize code — this skill reads written documentation only.
- If `CLAUDE.md` or `AGENTS.md` contains behavioral rules, quote them verbatim in **Agent rules** rather than paraphrasing.
- If two documents contradict each other, flag the conflict explicitly.
- Keep the briefing compact. Detail lives in the original files — link to them, don't duplicate.

## Output

- `## Project Briefing` block in the session (no file written)
- Explicit list of files read
- Gaps section listing missing or stale documentation
