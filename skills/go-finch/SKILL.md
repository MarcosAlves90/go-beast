---
name: go-finch
version: 1.3.0
description: "Audits an existing go-* SKILL.md, identifies the specific weakness to fix (missing step, vague rule, incomplete output section, checklist gap, or eval-driven finding), applies the minimal edit, bumps the version, and verifies internal consistency. Never rewrites a working skill from scratch — every change targets exactly what is broken."
when_to_use: "Use when an existing go-* skill needs improvement — a step is vague, a rule is missing, an output artifact is unnamed, or go-skill-eval reveals a structural or adherence gap. Invoke instead of go-smith when the skill already exists. Invoke go-skill-eval after to confirm the score improved."
---

# go-finch — Skill Maintenance

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-finch`
- **Alias:** `skill-maintenance` (documentation only)
- **Phase:** maintenance
- **When to use:** An existing skill has a documented weakness
- **Prerequisites:** A concrete finding
- **Input artifacts:** SKILL.md and finding
- **Output artifacts:** Updated SKILL.md; CHECKLIST ASSESSMENT
- **Gates:** Minimal edit and consistency check
- **Dependencies:** go-skill-eval when applicable
- **Conflicts:** go-smith

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-finch sharpens what go-smith built. It does not create new skills — it refines existing ones with surgical precision. The discipline: fix the smallest thing that produces the largest improvement, then prove it.

## Quick start

```
User: "go-eagle's Rules section says 'try to' — fix it."
→ invoke go-finch
→ read skill → identify weakness → classify change → apply minimal edit → verify → bump version
```

## Workflow

### 1. Read and audit the existing skill

Read the full `SKILL.md` before touching anything:

- [ ] Read frontmatter: `name`, `version`, `description`, `when_to_use`
- [ ] Read every workflow step: are they actions or guidelines?
- [ ] Read the Rules section: are they hard constraints or soft suggestions?
- [ ] Read the Output section: is every artifact named, scoped, and actionable?
- [ ] Check the Quick start: does it reflect the actual workflow?

Produce the **SKILL AUDIT** block as the first artifact — always, before any edit:

```
## SKILL AUDIT

Skill:    go-<animal> v<current-version>
File:     go-<animal>/SKILL.md
Weakness: <one sentence — what is broken or missing>
Type:     <see classification table below>
Risk:     <Low | Medium | High>
Scope:    <which section(s) are affected>
```

Do not proceed if the file does not exist or cannot be read.

### 2. Classify the requested change

Determine the change type — this sets the risk level and review depth:

| Type | Description | Risk |
|------|-------------|------|
| **Wording** | Typo, grammar, clarity improvement with no semantic change | Low |
| **Sharpening** | Vague guideline → concrete action or hard constraint | Low |
| **Addition** | New step, new rule, new output artifact, new checklist item | Medium |
| **Structural** | Reorder steps, split a step, merge two steps | Medium |
| **Contract** | Change what the skill produces — rename/remove output artifact, change version policy | High |

Checklist for Medium/High risk changes:
- [ ] Does the change affect the skill's position in the pack chain?
- [ ] Does the change affect what the next beast expects as input?
- [ ] Does the change conflict with any rule in `AGENTS.md`?
- [ ] Does the skill appear in `go-skill-eval.js` checklist? If so, the checklist may need updating.

### 3. Write the minimal edit

Show the **PROPOSED EDIT** explicitly before applying:

```
## PROPOSED EDIT — go-<animal>/SKILL.md

Section: <### Step N | ## Rules | ## Output | frontmatter | other>

BEFORE:
<exact current text — copy verbatim, including all markdown formatting characters: backticks, bold markers, list bullets, indentation>

AFTER:
<replacement text>

Rationale: <one sentence — why this specific change fixes the identified weakness>
```

"Verbatim" means character-for-character identical to the source file, including backtick fences, `**bold**`, `- bullet` prefixes, and indentation. If the BEFORE section omits formatting present in the source, the diff cannot be applied cleanly.

Rules for the edit:
- Do not reformat unrelated sections
- Do not add new steps when a sharpening of the existing step suffices
- Do not remove content without stating what it is replaced with and why
- Apply the edit with the `Edit` tool (not `Write`) unless the full file must be replaced
- In eval context where the `Edit` tool cannot execute, describe the edit as if applied and mark the tool call as `(simulated — eval context)`. Never omit the application step.

### 4. Bump the version

Every edit requires a version bump in the SKILL.md frontmatter:

| Change type | Version bump |
|-------------|-------------|
| Wording, Sharpening | Patch (1.0.x) |
| Addition, Structural | Minor (1.x.0) |
| Contract | Major (x.0.0) |

Update `version:` in the frontmatter with the `Edit` tool.

### 5. Verify internal consistency

After editing, check:

- [ ] The Quick start example still matches the actual workflow steps
- [ ] Every step referenced in the Output section still exists in the Workflow
- [ ] Every rule in the Rules section is still enforced somewhere in the Workflow
- [ ] The `description` frontmatter still accurately describes what the skill does
- [ ] The `when_to_use` still names the correct preceding and following beasts

**Platform-agnostic edits:** when adding file paths or tool references that are platform-specific (e.g., `.github/workflows/ci.yml` vs `.gitlab-ci.yml`), use a placeholder unless the skill explicitly scopes to a single platform. Example: `<ci-platform>/ci.yml` or `CI pipeline file (e.g., .github/workflows/ci.yml)`. Skill edits must stay useful across projects, not just for the project used as the eval input.

Acknowledging a platform assumption and proceeding anyway is a harder violation than missing the assumption entirely — if you detect a platform assumption in a proposed edit, resolve it with a placeholder before applying.

If the edit introduced an inconsistency, fix it before continuing.

### 6. Assess go-skill-eval checklist impact

Produce a **CHECKLIST ASSESSMENT** as a named artifact — always, even when no update is needed:

```
## CHECKLIST ASSESSMENT

Skill:          go-<animal>
Current terms:  [<term1>, <term2>, ...]   ← quote the actual list from SKILLS['go-<animal>'].checklist
Term affected:  <the specific term being evaluated, or "none">
Change type:    <Wording | Sharpening | Addition | Structural | Contract>
Update needed:  <Yes | No>
Reason:         <one sentence — why the checklist does or does not need updating>
Action:         <"No change needed" | "Add term '<X>'" | "Replace '<old>' with '<new>'">
```

Always quote the actual current terms from `go-skill-eval.js` — do not list them from memory. If the file is not accessible, state "checklist not readable — update deferred".

If Update needed = Yes, apply the change:
- [ ] Locate the skill's entry in the `SKILLS` object in `workflows/go-skill-eval.js`
- [ ] Add or update the checklist term to match the new artifact name
- [ ] Use English terms only — no accented characters or translated terms
- [ ] Keep terms specific: prefer artifact names (`HOOK CONTRACT`) over concepts (`documentation`)

### 7. Update CHANGELOG.md

Add an entry under `[Unreleased]`:

```markdown
- **go-<animal>/SKILL.md** (v<old> → v<new>): <one sentence describing exactly what changed and why>.
```

The format is mandatory: `**go-<animal>/SKILL.md** (v<old> → v<new>):` — file reference and version range are always required. Writing only the version number or only the sentence is incorrect.

## Rules

- Do not rewrite a working skill from scratch. If a rewrite is needed, invoke go-smith to create a new version instead.
- Every edit must fix exactly one identified weakness. Do not bundle unrelated improvements.
- Show the PROPOSED EDIT block before applying — never apply a change that was not first shown explicitly.
- Every change requires a version bump. A skill edit without a version bump is incomplete.
- Do not update the `go-skill-eval.js` checklist without verifying the updated checklist term actually appears in the skill's Output section.

## Output

- **SKILL AUDIT** block — current state documented before any edit (always required)
- **PROPOSED EDIT** block — exact before/after for the specific section (always required)
- Modified `go-<animal>/SKILL.md` — minimal edit applied, version bumped
- **CHECKLIST ASSESSMENT** block — whether go-skill-eval.js needs updating and why (always required)
- Updated `workflows/go-skill-eval.js` — checklist updated if output artifacts changed (if applicable)
- Updated `CHANGELOG.md` entry

## Position in the pack

```
go-smith → (skill in production) → go-finch → go-skill-eval
```

- **go-smith** creates new skills and registers them in the pack.
- **go-finch** maintains skills after they are in production — wording fixes, new rules, output expansions, eval-driven improvements.
- **go-skill-eval** validates the full skill suite after any change.

go-finch is invoked on demand whenever an existing skill needs to improve. It does not create new skill files — that is go-smith's job.
