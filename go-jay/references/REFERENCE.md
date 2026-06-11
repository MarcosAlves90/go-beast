# tune-context — Reference

## CLAUDE.md Section Conventions

A well-structured `CLAUDE.md` contains these sections (in order). Not all are required at project level — include only what applies.

| Section | Purpose | Required? |
|---|---|---|
| `## Priority Order` | Ranked decision criteria (security > correctness > …) | Global only |
| `## Before Acting` | Pre-implementation checklist | Global or project |
| `## Stop Conditions` | When NOT to implement | Global or project |
| `## Never Fabricate` | Anti-hallucination rules | Global only |
| `## Contributions` | PR/commit standards | Project |
| `## Communication` | Language, tone, format rules | Global or project |
| `## Skills and Workflows` | How to use skills/workflows | Global only |
| `## Global Hooks` | Active hooks table | Global only |
| `## MCP Tools` | Configured MCP servers table | Global only |
| `## Architecture` | Key decisions, constraints, patterns | Project |
| `## Testing` | Test strategy, commands, conventions | Project |
| `## Deployment` | Environments, deploy commands | Project |

**Rules for CLAUDE.md content:**
- Every rule must be actionable — "be careful" is not a rule.
- Include **Why:** for non-obvious rules so the agent can judge edge cases.
- Keep sections under 20 lines. Link to external docs rather than duplicating.
- Use `---` horizontal rules between top-level sections.

---

## Memory File Schema

Files under `.claude/projects/<slug>/memory/` must have this frontmatter:

```yaml
---
name: short-kebab-case-slug        # used in [[wikilinks]]
description: one-line summary      # surfaced in MEMORY.md index
metadata:
  type: user | feedback | project | reference
---
```

**Body structure by type:**

- `feedback`: lead with the rule, then `**Why:**` and `**How to apply:**` lines
- `project`: lead with the fact/decision, then `**Why:**` and `**How to apply:**`
- `user`: plain prose describing role, preferences, knowledge level
- `reference`: location + purpose of the external resource

**MEMORY.md index format:**
```
- [Title](file.md) — one-line hook under ~150 chars
```
Never write memory content directly into MEMORY.md — it is an index only.

---

## Audit Checklist

Use this when asked to audit a context file for quality:

### Completeness
- [ ] Project purpose is stated (what it is, who uses it)
- [ ] Tech stack is named
- [ ] Run and test commands are present
- [ ] Key architectural constraints are listed

### Correctness
- [ ] No rules that contradict each other
- [ ] No references to removed tools, commands, or patterns
- [ ] No fabricated constraints ("must use X" when X was never decided)
- [ ] Commands in the file actually work

### Clarity
- [ ] Every rule is actionable — no vague guidance
- [ ] Non-obvious rules have a **Why:** explanation
- [ ] Sections are under 20 lines each
- [ ] No duplicate rules across sections

### Freshness
- [ ] No references to deprecated dependencies
- [ ] Hook table matches what's actually in `settings.json`
- [ ] MCP table matches what's configured

Flag every failed check. Rewrite the section to fix it.

---

## Sync Protocol

When keeping CLAUDE.md, AGENTS.md, and GEMINI.md consistent:

1. **Read all files** before changing any.
2. Identify the **canonical source** for each rule (usually CLAUDE.md global).
3. Rules that differ across files: surface the conflict, ask the user which version wins.
4. After resolving: propagate the winning version to all files that need it.
5. Agent-specific files (AGENTS.md, GEMINI.md) may have platform-specific sections — do not overwrite those with CLAUDE.md content.

Common cross-file rules to sync:
- Language / communication rules
- Priority order
- Never-fabricate rules
- Contribution standards

---

## What NOT to Put in CLAUDE.md

- Code patterns or conventions derivable from reading the codebase
- Git history or recent changes (`git log` is authoritative)
- Debugging solutions or fix recipes (put in commit messages)
- Ephemeral task details or in-progress work
- Anything already enforced by a hook or linter
