---
name: go-snipe
version: 1.0.0
description: Translates interface contracts and functional requirements into BDD scenario files (Given/When/Then), an acceptance test skeleton, and a SPEC.md that go-wolf and go-lynx must satisfy before implementation begins.
when_to_use: Use when interface contracts and functional requirements are approved and implementation is about to begin. Invoke after go-fox (or go-beaver) has produced CONTRACTS.md and before go-wolf or go-lynx write any implementation code.
---

# go-snipe — Behavioral Specification (ATDD/BDD)

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-snipe`
- **Alias:** `bdd` (documentation only)
- **Phase:** specification
- **When to use:** Approved contracts need executable acceptance scenarios
- **Prerequisites:** Interface contracts
- **Input artifacts:** CONTRACTS.md and requirements
- **Output artifacts:** SPEC.md; BDD scenarios; test skeleton
- **Gates:** Happy and unhappy paths
- **Dependencies:** go-fox or go-beaver
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-snipe defines the target before the first shot is fired. It turns approved contracts and
requirements into precise behavioral scenarios that every implementation beast must satisfy —
making test-first a structural gate, not a guideline.

## Quick start

```
Prerequisites: CONTRACTS.md from go-fox, functional requirements from go-hawk
→ invoke go-snipe
→ map acceptance criteria → write BDD scenarios → produce acceptance test skeleton → SPEC.md
```

## Workflow

### 1. Extract acceptance criteria from contracts and requirements

Read `docs/architecture/task-artifacts/CONTRACTS.md` and `.go-beast/REQUIREMENTS.md`. For every functional requirement and
every interface boundary, extract one or more testable acceptance criteria:

- [ ] Each criterion must be falsifiable: there must be a concrete condition that would make it fail.
- [ ] Each criterion must be owned by a single feature or endpoint — no cross-cutting criteria.
- [ ] Criteria derived from non-functional requirements (performance, security, availability) are
  noted separately in `SPEC.md` and handed to go-eagle and go-bear respectively.

Do not write scenarios until criteria are listed and reviewed.

### 2. Write BDD scenarios

For each acceptance criterion, write one or more scenarios in Given/When/Then format:

```gherkin
Feature: <feature name from .go-beast/REQUIREMENTS.md>

  Scenario: <concrete behavior being specified>
    Given <precondition — system state or user context>
    When  <action taken by the user or system>
    Then  <observable outcome that proves the criterion is met>

  Scenario: <failure or edge case>
    Given <precondition>
    When  <action>
    Then  <expected failure behavior>
```

Rules for scenario quality:
- [ ] Every scenario has at least one unhappy path (invalid input, auth failure, not found, conflict).
- [ ] Scenarios reference concrete values, not vague placeholders ("a valid email", not "some input").
- [ ] Scenarios are independent — no scenario depends on the state left by another.
- [ ] UI behavior (go-lynx targets) and API behavior (go-wolf targets) are written in separate
  Feature blocks.

### 3. Produce the acceptance test skeleton

For each scenario, write a failing test stub in the target language and framework. The stub must:

- Have the correct test function signature and describe/it block.
- Reference the scenario title verbatim as the test description.
- Contain a single assertion that fails until the implementation satisfies the criterion:
  - For API tests: `expect(response.status).toBe(expectedStatus)` or equivalent.
  - For UI tests: `expect(screen.getByRole(...)).toBeInTheDocument()` or equivalent.
- Not contain any implementation or mock logic — stubs only.

The skeleton makes the red-green-refactor cycle of go-wolf and go-lynx explicit: the suite must
be red before implementation begins and green after it completes.

### 4. Write SPEC.md

Produce `SPEC.md` at the project root:

```md
# Behavioral Specification — <Project Name>
> version: 1 | date: YYYY-MM-DD | status: draft

## Acceptance criteria
<numbered list — one criterion per functional requirement>

## BDD scenarios
<all scenarios from step 2, organized by feature>

## Test skeleton location
<path to the test stub files produced in step 3>

## Out of scope
<criteria deferred to go-eagle (test pyramid) or go-bear (security)>

## Open questions
<any ambiguity that requires a decision before implementation>
```

`SPEC.md` is the handoff artifact. go-wolf and go-lynx must not begin implementation until
`SPEC.md` exists and all open questions are resolved.

### 5. Verify coverage before handing off

- [ ] Every P0 functional requirement from `.go-beast/REQUIREMENTS.md` has at least one scenario.
- [ ] Every endpoint in `CONTRACTS.md` has at least one happy-path and one failure scenario.
- [ ] Every scenario has a corresponding stub in the test skeleton.
- [ ] No open questions remain unresolved in `SPEC.md`.

If any check fails, resolve it before handing off. An incomplete spec is not a spec — it is
deferred design debt.

## Rules

- Do not write implementation code. go-snipe specifies behavior; go-wolf and go-lynx implement it.
- Do not write full test implementations — stubs only. go-eagle owns the full test strategy.
- Do not invent requirements. Every scenario must trace to a criterion in `.go-beast/REQUIREMENTS.md` or
  `CONTRACTS.md`.
- go-wolf and go-lynx must not begin implementation until `SPEC.md` exists with no open questions.
- An acceptance criterion with no falsifiable failure scenario is not a criterion — rewrite it.

## Output

- `SPEC.md` — acceptance criteria, BDD scenarios, test skeleton location, open questions
- Test stub files alongside the implementation directories (e.g. `src/features/<name>/<name>.spec.ts`)
- Gap list — any P0 requirement with no scenario (must be empty before handoff)
