---
name: go-lark
version: 1.0.0
description: Explores the solution space for approved requirements — generates 3–5 distinct approaches, evaluates each against the project's constraints, selects one with explicit rationale, and produces `.go-beast/APPROACH.md` as a decision record. Prevents go-fox from committing to an architecture before alternatives have been considered.
when_to_use: Use when `.go-beast/REQUIREMENTS.md` exists and the problem space is ambiguous enough that multiple valid solutions exist. Invoke after go-hawk (requirements approved) and before go-fox (architecture). Skip when requirements already constrain the solution to a single approach.
---

# go-lark — Solution Space Exploration

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-lark`
- **Alias:** `explore` (documentation only)
- **Phase:** solution-exploration
- **When to use:** Approved requirements allow multiple valid approaches
- **Prerequisites:** Approved discovery output
- **Input artifacts:** Discovery output
- **Output artifacts:** Approach decision held in session context
- **Gates:** At least three approaches and scored evaluation
- **Dependencies:** go-hawk
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-lark sings before the sun rises. It explores freely before any commitment is made — generating multiple approaches, stress-testing each against real constraints, and selecting one with a defensible rationale.

## Quick start

```
Prerequisites: `.go-beast/REQUIREMENTS.md` approved by go-hawk

User: "We need to build a notification system."
→ invoke go-lark
→ generate approaches → evaluate trade-offs → select → `.go-beast/APPROACH.md` → hand off to go-fox
```

## Workflow

### 1. Read the requirements

Read `.go-beast/REQUIREMENTS.md` in full. Extract:

- [ ] Core functional requirements — what must the system do?
- [ ] Hard constraints — what is ruled out? (budget, stack, timeline, compliance)
- [ ] Quality attributes — what matters most? (latency, consistency, simplicity, scalability)
- [ ] Unknowns — what is still unresolved that an approach choice could resolve or defer?

Do not generate approaches until the constraints are explicit. An approach generated without constraints cannot be evaluated.

### 2. Generate 3–5 distinct approaches

Generate approaches that are **meaningfully different** — not variations of the same pattern:

- [ ] Each approach must differ in at least one architectural dimension: data model, communication pattern, deployment unit, consistency model, or processing paradigm
- [ ] Each approach must be plausible given the hard constraints from Step 1
- [ ] At least one approach must be the simplest possible solution (YAGNI baseline)
- [ ] At least one approach must be the most scalable or flexible solution (ceiling baseline)

For each approach, write:
- **Name** — a short label (e.g., "Polling + DB", "Event-driven + Queue", "Third-party SaaS")
- **Description** — two sentences: what it is, how it works
- **Key trade-offs** — what it optimizes for, what it sacrifices

Do not evaluate yet. Generate first, evaluate second.

### 3. Evaluate against constraints

For each approach, score against the quality attributes identified in Step 1:

| Approach | Simplicity | Scalability | Dev speed | Operational cost | Fit to constraints |
|----------|-----------|-------------|-----------|-----------------|-------------------|
| A | ✓✓ | ✗ | ✓✓ | ✓✓ | ✓ |
| B | ✓ | ✓✓ | ✓ | ✓ | ✓✓ |
| ... | | | | | |

- [ ] Identify which approach best satisfies the highest-priority quality attributes
- [ ] Identify which approaches are eliminated by hard constraints
- [ ] Identify risks that are unique to each approach

### 4. Select one approach

Choose one approach. State the selection explicitly with a rationale:

- **Selected:** [approach name]
- **Rationale:** [why this approach wins against the constraints and quality attributes — one paragraph]
- **Key risk:** [the single most likely failure mode — one sentence]
- **Deferred:** [decisions this choice explicitly defers to go-fox]

If two approaches are too close to call without more information, state the specific unknown that would resolve the tie, and ask the user before proceeding.

### 5. Produce `.go-beast/APPROACH.md`

Create `.go-beast/` if needed, then write:

Write `.go-beast/APPROACH.md` with:

```
## Requirements summary
<3–5 bullet points from .go-beast/REQUIREMENTS.md>

## Approaches considered
<one subsection per approach: name, description, trade-offs>

## Evaluation
<the scoring table from Step 3>

## Selected approach
<the rationale from Step 4>

## Deferred decisions
<what go-fox will decide>
```

`.go-beast/APPROACH.md` is the handoff artifact to go-fox. go-fox reads it to understand which direction was selected and why before designing the architecture.

## Rules

- Do not generate fewer than 3 approaches. One option is not a choice; two is a false dilemma.
- Do not select an approach without a scoring evaluation. Gut-feel selection defeats the purpose.
- Do not design the architecture. go-lark explores directions — go-fox commits to one.
- If all approaches violate a hard constraint from `.go-beast/REQUIREMENTS.md`, stop. Surface the conflict to the user before proceeding.
- Do not skip this skill because the answer "seems obvious." Obvious choices become technical debt when the constraint that made them obvious changes.

## Output

- `.go-beast/APPROACH.md` — approaches considered, evaluation table, selected approach with rationale, deferred decisions

## Position in the pack

```
go-hawk → [go-lark] → go-fox
```

go-lark is optional when requirements already constrain the solution to a single approach. Invoke it whenever the problem space is genuinely ambiguous — which is most of the time.
