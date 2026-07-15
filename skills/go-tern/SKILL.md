---
name: go-tern
version: 1.0.0
description: Reviews a diff, branch, task, or named artifact against requirements, behavioral risk, security, and regression potential; produces severity-ranked findings, open questions, and a merge recommendation.
when_to_use: Use when implementation work is complete enough to inspect, before merging, before handing off to the next beast, or when a developer asks for review. Invoke after go-wolf, go-lynx, go-swift, go-wren, or any change-producing beast. Invoke before go-owl for release-facing docs and before any commit or PR submission.
---

# go-tern — Code Review

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-tern`
- **Alias:** `review` (documentation only)
- **Phase:** review
- **When to use:** A completed change needs a pass/fail review
- **Prerequisites:** Implementation diff
- **Input artifacts:** Diff and requirements
- **Output artifacts:** Review findings and merge recommendation
- **Gates:** Evidence-ranked findings
- **Dependencies:** None
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-tern circles above the diff and dives only on what matters. It reviews for
real bugs, regressions, and policy violations — not style trivia.

## Quick start

```
User: "Review these changes before I merge."
→ invoke go-tern
→ identify review scope → inspect requirements and diff → rank findings → recommend next action
```

## Workflow

### 1. Define the review scope

- [ ] What is being reviewed: commit range, branch diff, task output, or named artifact?
- [ ] What requirements, plan, or issue define expected behavior?
- [ ] Is there enough evidence to review, or is the request still too vague?

Record the exact scope before making any finding.

### 2. Inspect the intended behavior

- [ ] Read the originating requirement, plan, or artifact contract first
- [ ] Identify what must remain true after the change
- [ ] Note any security-sensitive or migration-sensitive areas

If no requirement exists, state that review confidence is lower and treat missing
specification as a review risk.

### 3. Inspect the change itself

- [ ] Identify correctness bugs and behavioral regressions
- [ ] Check for missing validation, broken invariants, and edge-case failures
- [ ] Check tests: missing coverage, weak assertions, or misleading mocks
- [ ] Check docs and release impact when behavior changed

Review the actual change, not the author's intent.

### 4. Rank findings by severity

Use only these levels:

- `Critical` — merge-blocking bug, security issue, data loss risk, broken invariant
- `Important` — should be fixed before merge, but not catastrophic
- `Minor` — non-blocking improvement or follow-up

Every finding must include:

- affected area
- concrete risk
- evidence
- why the severity is justified

### 5. Recommend the next action

- [ ] `Not ready to merge`
- [ ] `Ready with fixes`
- [ ] `Ready to merge`

If there are `Critical` findings, the review verdict cannot be positive.

## Rules

- Do not invent findings. Every finding must point to concrete evidence in the reviewed material.
- Prioritize correctness, security, and regression risk over style or preference.
- Do not approve changes with unresolved `Critical` findings.
- If requirements are missing, state that explicitly as a review limitation.

## Output

- `REVIEW FINDINGS` block — severity-ranked findings with evidence and rationale
- `OPEN QUESTIONS` block — assumptions or missing context that reduce review confidence
- `MERGE RECOMMENDATION` block — one of `Not ready to merge`, `Ready with fixes`, or `Ready to merge`

## Position in the pack

```
go-wolf + go-lynx + go-swift + go-wren → go-tern → go-owl
```

- implementation beasts produce the change
- go-tern reviews the result before it becomes a release or submission artifact
- go-owl updates or validates user-facing documentation after review-confirmed behavior
