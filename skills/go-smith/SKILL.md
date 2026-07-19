---
name: go-smith
version: 1.0.0
description: Designs, writes, and validates new skills for the go-* family — from gap analysis to SKILL.md authoring, naming, description quality, workflow structure, and integration into the pack's handoff chain.
when_to_use: Use when the user wants to create a new go-* skill, extend the go-beast pack with a new specialization, or audit and improve an existing go-* skill. Invoke after identifying a real gap in the pack's coverage.
---

# go-smith — Skill Creation for the go-* Family

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-smith`
- **Alias:** `skill-authoring` (documentation only)
- **Phase:** authoring
- **When to use:** A real capability gap requires a new skill
- **Prerequisites:** Validated gap
- **Input artifacts:** Gap analysis
- **Output artifacts:** SKILL.md; registration updates
- **Gates:** Unique responsibility and eval coverage
- **Dependencies:** None
- **Conflicts:** go-finch

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-smith forges the tools the pack uses. It does not build features — it builds the beasts that build features.

## Quick start

```
User: "I want a new go-* skill for X."
→ invoke go-smith
→ gap analysis → naming → draft SKILL.md → review → register in pack
```

## Workflow

### 1. Gap analysis

Before naming anything, map what the pack already covers:

| Beast | Domain |
|-------|--------|
| go-hawk | Discovery & requirements |
| go-fox | Architecture & design |
| go-otter | Database design & migrations |
| go-beaver | Scaffolding & project init |
| go-wolf | Backend API development |
| go-lynx | Frontend UI development |
| go-eagle | Testing strategy & QA |
| go-bear | Security review & hardening |
| go-raven | CI/CD & deployment |
| go-owl | Documentation |
| go-jay | AI context file editing |
| go-mole | Project documentation briefing |

Ask:
- [ ] Is this domain genuinely uncovered by any existing beast?
- [ ] Is this broad enough to apply across multiple projects?
- [ ] Does it produce a concrete, handoff-ready output?
- [ ] Where does it fit in the typical go-beast sequence?

If the gap is real, proceed. If it overlaps with an existing beast, stop and improve that beast instead.

### 2. Choose the animal name

The name signals the beast's character:

- **Short**: one syllable preferred, two maximum
- **Evocative**: the animal's traits should mirror the skill's traits
- **Unique**: does not collide with existing go-* names
- **No special characters**: letters only

Examples of good matches:
- go-bear (cautious, thorough) → security
- go-hawk (sharp-eyed, first in) → discovery
- go-otter (patient, methodical in water) → database
- go-raven (carries things reliably) → CI/CD

Test the name: can you describe the beast's character with 10 words that map to the skill's domain?

### 3. Write the SKILL.md

Follow this exact structure:

```markdown
---
name: go-<animal>
version: 1.0.0
description: <what it does in concrete terms — tools, artifacts, checks it runs>
when_to_use: Use when <specific trigger — phase, artifact, user signal>. Invoke <before|after> <other beast>.
---

# go-<animal> — <Domain Name>

<One sentence: what the beast is; one sentence: its core discipline.>

## Quick start

\`\`\`
<Minimal trigger scenario>
→ invoke go-<animal>
→ <step 1> → <step 2> → <step 3>
\`\`\`

## Workflow

### 1. <First concrete action>
### 2. <Second concrete action>
...

## Rules

- <Hard constraint, not a guideline>
- <Hard constraint>

## Output

- <Concrete artifact 1>
- <Concrete artifact 2>
```

**Description field rules:**
- Max 1024 chars total in frontmatter
- `description`: what it does — tools, artifacts, verifications (third person)
- `when_to_use`: starts with "Use when" — trigger condition only, never workflow summary
- Never summarize the workflow in `when_to_use` — the agent will follow the description instead of reading the skill

### 4. Write the workflow steps

Each step must:
- Have a numbered heading (`### 1. Name`)
- Produce a concrete intermediate result
- Include a checklist `- [ ]` for non-trivial decisions
- Reference the output artifact that unlocks the next beast

Never write steps as guidelines. Write them as actions:
- ❌ "Consider the performance implications"
- ✅ "Profile the three slowest endpoints. Record p95 in PERF.md."

### 5. Write the Rules section

Rules are hard stops — non-negotiable constraints, not suggestions:

- ❌ "Try to keep scope focused"
- ✅ "Do not implement. go-smith designs skills, not features."

Limit to 3–5 rules. If you have more, group them under a step instead.

### 6. Write the Output section

List every artifact the beast produces. Each must be:
- Named (file name or clear label)
- Scoped (where it lives, what format)
- Actionable by the next beast in the chain

### 7. Register in the pack sequence

Update `.go-beast/REQUIREMENTS.md` or the project handoff plan to include the new beast where it fits. A beast with no position in the chain is a beast nobody calls.

Canonical sequence (for reference):
```
go-hawk → go-fox → go-otter → go-beaver → go-wolf + go-lynx
→ go-eagle → go-bear → go-raven → go-owl
```

**go-smith's own position:** meta-skill, invoked on demand — not bound to a phase. Invoke whenever a gap in the pack is identified, regardless of project phase. Update go-hawk's handoff plan to include the new beast.

Announce where the new beast inserts and why.

## Rules

- Do not create a skill that overlaps an existing beast. Extend the existing beast instead.
- Every beast must produce at least one named output artifact.
- `when_to_use` must name the preceding beast (what triggers this one) and the following beast (what this one unlocks).
- Do not write guidelines. Write constraints and actions.
- A skill without a position in the pack chain is not complete.

## Output

- `go-<animal>/SKILL.md` in the pack repository — complete, versioned skill file (the agent's skill loader directory — e.g. `~/.claude/skills/` for Claude Code — is populated by the sync hook)
- Updated handoff sequence — where the new beast fits in the pack
- Gap analysis note — why this domain was not covered before
