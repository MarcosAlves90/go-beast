---
name: go-jay
version: 1.1.0
description: Creates, audits, edits, and synchronizes AI agent context files — CLAUDE.md, AGENTS.md, GEMINI.md, COPILOT.md, CONTEXT.md, and agent memory files. Rewrites affected sections cleanly to improve agent behavior without causing regressions. Agent-agnostic: works with any context file format; Claude Code memory paths are one supported target among others.
when_to_use: Use when the user wants to improve how an AI agent understands a project, add or change agent rules, fix outdated context, or sync instructions across multiple agent config files — regardless of which agent (Claude, Gemini, Copilot, etc.) is in use.
---

# go-jay — AI Context File Editor

go-jay writes and maintains the files that shape AI agent behavior: instructions, rules, context, and memory. It is agent-agnostic — the workflow applies to CLAUDE.md, AGENTS.md, GEMINI.md, COPILOT.md, or any other context format.

## Quick start

```
User: "Add a rule that the agent must always write tests before implementation."
→ invoke go-jay
→ locate CLAUDE.md → identify target section → rewrite section → verify no regression
```

## Workflow

### 1. Locate relevant files

Check for all of these. Note which exist and which are absent.

**Global (user-level)**
- `~/.claude/CLAUDE.md`
- `~/.claude/projects/<project-slug>/memory/*.md`
- `~/.claude/projects/<project-slug>/memory/MEMORY.md`

**Project-level**
- `.claude/CLAUDE.md`
- `AGENTS.md`
- `GEMINI.md`, `COPILOT.md`
- `CONTEXT.md` or any `*context*.md` at root
- `.claude/settings.json` (for hooks and permissions — read only, don't edit unless asked)

### 2. Read before writing

Always read the full file before any edit. Extract:
- Existing sections and their headings
- Rules already present (avoid duplicating)
- Tone and formatting conventions in use
- Anything that would conflict with the requested change

### 3. Classify the change

| Type | Action |
|---|---|
| New rule or section | Append to the most relevant existing section, or create a new `## Heading` |
| Update to an existing rule | Rewrite the entire section containing that rule |
| Remove a rule | Delete the rule and patch surrounding context for coherence |
| Audit / quality pass | See [REFERENCE.md](references/REFERENCE.md) |
| Sync across files | See [REFERENCE.md](references/REFERENCE.md) |

### 4. Rewrite, don't patch

When a section needs to change: rewrite it in full. Do not append a correction after stale content. The rewritten section must:
- Be internally consistent
- Not contradict anything elsewhere in the file
- Follow the file's existing heading level and tone
- Be tighter than the original — remove redundancy

### 5. Regression check

Before confirming the edit is done, scan the full file for:
- [ ] Contradictions introduced by the new content
- [ ] Duplicate rules (same intent stated twice)
- [ ] Broken references (links to sections that no longer exist)
- [ ] Formatting inconsistencies (mixed heading levels, stray markdown)

If any are found, fix them in the same pass.

### 6. Report what changed

After writing, output:
```
**Changed:** <file path>
**Section:** <heading of the modified section>
**What changed:** <one sentence>
**Regression check:** clean / <issue found and fixed>
```

## Rules

- Never fabricate instructions the user did not request.
- Never delete existing rules without explicit user confirmation.
- If a requested rule conflicts with an existing one, surface the conflict and ask which wins before writing.
- If editing the global `~/.claude/CLAUDE.md`, state that the change affects **all projects** before proceeding.
- Memory files (`memory/*.md`) have frontmatter — preserve the `name`, `description`, `metadata.type` fields exactly. Only edit the body.

## File-specific guidance

See [REFERENCE.md](references/REFERENCE.md) for:
- CLAUDE.md section conventions and required headings
- Memory file frontmatter schema
- Audit checklist (what makes a context file good vs. bad)
- Sync protocol (keeping CLAUDE.md, AGENTS.md, GEMINI.md consistent)
