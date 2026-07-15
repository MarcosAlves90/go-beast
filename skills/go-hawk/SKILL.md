---
name: go-hawk
version: 1.1.0
description: Conducts structured discovery interviews, produces a versioned REQUIREMENTS.md, identifies unknowns and risks, and generates a go-beast handoff plan for a software project.
when_to_use: Use when starting a new project, feature, or epic — or whenever the problem is underspecified and scope must be established before any implementation begins. Invoke before go-fox.
---

# go-hawk — Discovery & Requirements

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-hawk`
- **Alias:** `discover` (documentation only)
- **Phase:** discovery
- **When to use:** A project; feature; or epic is underspecified
- **Prerequisites:** None
- **Input artifacts:** User problem statement
- **Output artifacts:** Discovery output held in session context
- **Gates:** Open questions identified before implementation
- **Dependencies:** None
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-hawk is the entry point of the go-beast pack. Its job is to turn a vague idea into a scoped, documented requirement that every other beast can act on without second-guessing.

## Quick start

```
User: "I want to build a task manager app."
→ invoke go-hawk
→ structured interview → requirements doc → handoff plan
```

## Workflow

### 1. Structured interview

Ask the following in order. Do not skip. Do not answer on the user's behalf.

- [ ] **What problem does this solve?** (for whom, in what context)
- [ ] **Who are the users?** (roles, technical level, volume)
- [ ] **What does success look like?** (measurable outcomes)
- [ ] **What already exists?** (integrations, legacy systems, constraints)
- [ ] **What is explicitly out of scope?**
- [ ] **What is the timeline and deployment target?**
- [ ] **Are there regulatory or compliance requirements?** (LGPD, GDPR, HIPAA, SOC2…)

### 2. Produce the requirements document

Write a `REQUIREMENTS.md` in the project root:

```md
# Requirements — <Project Name>
> version: 1 | date: YYYY-MM-DD | status: draft

## Problem statement
## Users and roles
## Functional requirements (numbered, testable, P0/P1/P2)
## Non-functional requirements (performance, security, availability)
## Out of scope
## Open questions
## Risks
```

Each functional requirement must be specific, testable, and prioritized.

### 3. Identify blockers

List every open question that must be resolved before architecture begins. Flag them explicitly — do not let them slip into the backlog.

### 4. Produce handoff plan

Recommend the go-beast sequence for this specific project. Typical:

```
go-hawk → go-fox → go-otter → go-beaver → go-wolf + go-lynx → go-eagle → go-bear → go-raven → go-owl
```

Adjust based on actual requirements. Always call go-bear early if auth, PII, or payments are in scope.

**Pack meta-skills (load on demand, not in sequence):**
- `go-mole` — project briefing before any session
- `go-jay` — AI context file editing
- `go-smith` — create or audit skills for the go-* family
- `go-swift` — Claude Code hook authoring `[Claude Code only]`

## Rules

- Never assume a requirement. If ambiguous, ask.
- Never start architecture until requirements are signed off by the user.
- If the user rushes past scoping, state the risk explicitly and ask for confirmation.

## Output

- `REQUIREMENTS.md` — versioned, dated, signed off
- Handoff plan — ordered go-beast sequence
