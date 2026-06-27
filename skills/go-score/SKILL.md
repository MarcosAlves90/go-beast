---
name: go-score
version: 1.1.0
description: Conducts a multi-pass code review with structured scoring across seven dimensions (correctness, security, maintainability, testability, performance, design, observability), applies a calibrated 0–4 rubric per dimension, produces OIR-structured findings with BLOCKER/WARNING/SUGGESTION/NIT severity classification, and emits a SCORE_REPORT.md with a dimensional scorecard and a merge verdict.
when_to_use: Use when a change, diff, branch, or PR needs an evidence-based quality assessment with explicit scores and a merge verdict — not just a list of findings. Invoke after go-wolf, go-lynx, go-swift, or any change-producing beast when the caller needs dimensional accountability. Invoke go-tern instead when only a pass/fail merge recommendation is required without scoring.
---

# go-score — Scored Code Review

go-score reads every changed line before scoring any of them. It assigns no score without a code quote, upgrades no score without evidence, and blocks merges when any Correctness or Security dimension reaches 0.

## Quick start

```
User: "Score this PR before I merge it."
→ invoke go-score
→ comprehension pass → per-dimension scoring → calibration → positives → synthesis → SCORE_REPORT.md
```

## Rubric — 0–4 per dimension

Each score must be paired with a quoted evidence line from the reviewed code. A score without evidence is rejected; re-examine and provide a quote before recording the score.

| Score | Label | Criterion |
|---|---|---|
| 0 | Critical defect | The dimension has a failure that will produce wrong output, crash, expose data, or create a security vulnerability under inputs callers will realistically send. |
| 1 | Significant defect | Happy path works; a realistic caller scenario reveals a defect, risk, or gap that a reviewer cannot ignore. |
| 2 | Minor defect | An edge case or improvement opportunity exists but is unlikely to affect typical callers in practice. |
| 3 | Adequate | Meets the dimension's contract under its documented assumptions; no obvious gaps. Requires explicit evidence — 3 is not the default. |
| 4 | Strong | Handles edge cases explicitly, is defensively coded, and exceeds the minimum contract. Evidence of proactive design required. |

**Default assumption:** treat each dimension as score 2 (Minor defect) until evidence for 3 or 4 is identified. This prevents grade inflation. A score of 3 or 4 requires a specific code excerpt proving adequacy; a score of 0 or 1 requires a specific code excerpt proving the defect.

## Honesty requirement

State problems plainly. Do not soften findings that represent genuine risk. A finding that is correct but unwelcome is more valuable than a comfortable assessment that obscures a problem.

Do not upgrade a score because the code "looks reasonable." Evidence is required. Do not downgrade a score because a finding might seem harsh. If the evidence supports it, record it.

## Workflow

### 1. Define review scope

Before reading any code:

- [ ] What is being reviewed: commit range, branch diff, named files, or PR?
- [ ] What is the stated intent of the change (PR description, commit message, linked issue)?
- [ ] Is there a requirements artifact (REQUIREMENTS.md, issue, ticket) that defines expected behavior?

If the stated intent is absent, note it as a **scope gap** and proceed with what is observable from the code. A scope gap reduces review confidence and must be disclosed in SCORE_REPORT.md.

If the diff is larger than 400 lines, **segment it**: group by file or functional area and run Steps 2–5 once per segment. Aggregate scores in Step 6 by taking the minimum score per dimension across segments.

### 2. Comprehension pass (no scoring)

Read all files in the diff without assigning scores:

- [ ] Identify entry points, data flows, and side effects
- [ ] Identify external inputs (user-controlled values, API responses, env vars, file contents)
- [ ] Identify the caller contract: what does the caller assume this code will do?
- [ ] Note discrepancies between stated intent and actual behavior

Record a one-paragraph **Comprehension Summary** that will anchor all scoring passes. Do not score until this summary is written.

### 3. Risk stratification

Classify the change into one tier. This determines which dimensions receive full passes versus abbreviated passes.

| Tier | Conditions | Dimensions reviewed |
|---|---|---|
| High | Touches auth, crypto, session management, external input parsing, schema migrations, file system access, payment flows, or PII | All seven dimensions: full pass each |
| Medium | Business logic, algorithm implementations, new API endpoints, data transformation | Correctness, Security, Maintainability, Design — abbreviated Testability, Performance, Observability |
| Low | Refactors with existing test coverage, config changes, documentation, dependency bumps | Maintainability, Design, Testability only |

Record the tier explicitly before opening the first dimension pass.

### 4. Per-dimension scoring passes

Run one pass per dimension in the dimension list for the assigned tier. Each pass:

1. Reprint the dimension's rubric anchor (the 0–4 table row for this dimension)
2. Search the diff for evidence relevant to this dimension
3. Quote the specific code excerpt that justifies the score
4. Assign the score and label
5. For every score ≤ 1, write an OIR finding (see Step 5)

**Dimension definitions:**

**Correctness** — Logic soundness, edge case coverage, concurrency safety, return value contract, null/undefined handling.
Evidence for 0: a reachable code path that produces wrong output or an unhandled exception under inputs the caller will send.
Evidence for 4: explicit handling of documented edge cases, guard clauses with clear preconditions, defensive return types.

**Security** — All external input handling, injection risks (SQL, command, path traversal), authentication and authorization checks, secrets exposure, data leakage in logs or error messages, insecure deserialization.
Evidence for 0: user-controlled input reaching a sink (DB query, shell exec, file path, log line with credentials) without sanitization.
Evidence for 4: input is validated against an allowlist, parameterized queries used, no credential in logs, least-privilege access pattern verified.
Note: Security score 1 is treated as BLOCKER (same as 0) because significant security defects are not acceptable at merge.

**Maintainability** — Cognitive load, naming clarity, function/method length, single responsibility, cohesion, avoidance of magic values, consistency with surrounding codebase patterns.
Evidence for 0: a function so long or tangled that its behavior cannot be determined without tracing every branch.
Evidence for 4: clear naming, single-responsibility functions, no magic values, consistent idioms throughout.

**Testability** — Whether the code can be tested in isolation: dependency injection, absence of hidden global state, observable outputs, pure functions where feasible.
Evidence for 0: business logic tightly coupled to I/O or global state with no seam for substitution.
Evidence for 4: explicit dependency injection, pure function structure where applicable, outputs are observable without side effects.

**Performance** — Flag only algorithmic problems visible from the code: O(n²) loops over large collections, synchronous calls in hot paths, N+1 query patterns, unbounded memory growth. Do not speculate on performance without visible evidence.
Evidence for 0: nested loop over an unbounded collection in a hot path, or N+1 DB call inside a loop.
Evidence for 4: explicit algorithmic choice documented, bulk operations used, no unnecessary allocations in hot path.
If no performance issue is visible, assign 3 (Adequate) without comment. Do not fabricate performance concerns.

**Design** — API surface fit, abstraction level appropriateness, coupling, cohesion at module boundaries, alignment with existing architecture patterns.
Evidence for 0: a new abstraction that violates an established architecture boundary or creates a bidirectional dependency cycle.
Evidence for 4: the API surface is minimal, coupling is explicit and bounded, the change fits the existing architectural patterns.

**Observability** — Logging adequacy, error propagation (errors include context, not just a message), error messages that distinguish failure modes, absence of credential logging, absence of swallowed exceptions.
Evidence for 0: exceptions silently swallowed, or a log line containing credentials or PII.
Evidence for 4: structured logging with correlation IDs, errors include context, distinguishable failure messages.

### 5. Write OIR findings

For every dimension score ≤ 1, and for every score 2 finding that deserves a comment, write one OIR finding:

```
[DIMENSION] [SCORE/LABEL] — [Severity]
Observation: <exact code quote or file:line reference>
Impact: <what breaks, fails, or degrades and under which conditions>
Request: <specific code change or pattern to apply>
```

Severity mapping:

| Condition | Severity |
|---|---|
| Correctness = 0 | BLOCKER |
| Security = 0 or 1 | BLOCKER |
| Any dimension = 0 not already BLOCKER | BLOCKER |
| Any dimension = 1 (not Security) | WARNING |
| Any dimension = 2 with meaningful impact | SUGGESTION |
| Style, naming, minor readability | NIT |

A BLOCKER must be resolved before merge. A WARNING should be resolved; the author must acknowledge it if not. A SUGGESTION is optional with no merge gate. A NIT is purely informational.

### 6. Dimension completeness gate

Before proceeding to calibration, enumerate every dimension that was scored in this tier:

```
Dimensions scored: [list each dimension with its score]
Missing: [any dimension in the tier that has not been scored]
```

If any dimension in the assigned tier is missing a score, return to Step 4 and complete it. Do not advance to Step 7 with an incomplete scorecard — a missing dimension score is equivalent to a scope gap and must be declared.

### 7. Calibration pass

After all dimensions are scored:

- [ ] For every score ≥ 3: re-read the rubric anchor for score 2. State the strongest argument that this deserves a 2. Accept the downgrade if the argument is more compelling than the original justification.
- [ ] For every BLOCKER finding: confirm that the specific evidence quote is present and the failure mode is described precisely.
- [ ] For segmented diffs: take the minimum score per dimension across all segments.

Record the calibration outcome explicitly in a `## Calibration` section. For each score ≥ 3, state: "Challenged [dimension] (score [N]): strongest argument for 2 is [argument]. Retained / downgraded because [reason]." If no score ≥ 3 exists, write "No scores ≥ 3 — no calibration challenges required."

### 8. Positives pass

Name at least one specific thing done well in the reviewed code. This is mandatory, not optional — an absent Positives section makes the report incomplete regardless of finding quality.

Positives must reference specific code, not vague praise. "The parameterized query in line 42 correctly prevents SQL injection" is a positive. "Good code" is not.

Record positives in a `## Positives` section before writing the verdict.

### 9. Self-check gate

Before writing SCORE_REPORT.md, confirm:

- [ ] Comprehension Summary written (one paragraph)?
- [ ] Tier declared explicitly?
- [ ] All dimensions in the tier have a score with a quoted evidence line?
- [ ] OIR findings written for every score ≤ 1?
- [ ] Dimension completeness gate passed (Step 6)?
- [ ] Calibration section written (Step 7)?
- [ ] Positives section written with at least one specific, evidence-backed positive (Step 8)?

If any item is unchecked, complete it before writing the report. A SCORE_REPORT.md produced without satisfying these conditions is invalid.

### 10. Synthesis

Produce the final verdict:

- If any score = 0, or if Security = 1: verdict is **BLOCK — must not merge**.
- If all scores ≥ 2 and no BLOCKER findings remain: verdict is **MERGE WITH WARNINGS** if any WARNING findings exist, or **READY TO MERGE** if none.

Compute the **composite score**: the mean of all dimension scores, rounded to one decimal place. The composite score is informational only — the minimum-gate rule governs the verdict, not the composite.

### 11. Write SCORE_REPORT.md

Produce the report at the project root (or prefix the filename with the PR/branch name if multiple reviews coexist):

```markdown
# Score Report — <PR title or branch name>
> date: YYYY-MM-DD | scope: <commit range or files reviewed> | tier: <High | Medium | Low> | reviewed by: go-score v1.1.0

## Scorecard

| Dimension | Score | Label |
|---|---|---|
| Correctness | N | label |
| Security | N | label |
| Maintainability | N | label |
| Testability | N | label |
| Performance | N | label |
| Design | N | label |
| Observability | N | label |
| **Composite** | **N.N** | |

## Verdict

**<BLOCK — must not merge | MERGE WITH WARNINGS | READY TO MERGE>**

<one sentence explaining the verdict>

## Findings

### BLOCKER
<OIR findings at BLOCKER severity, if any>

### WARNING
<OIR findings at WARNING severity, if any>

### SUGGESTION
<OIR findings at SUGGESTION severity, if any>

### NIT
<OIR findings at NIT severity, if any>

## Positives

<specific things done well, with code references>

## Calibration

<For each score ≥ 3: the challenge and outcome. If none: "No scores ≥ 3 — no calibration challenges required.">

## Open Questions

<assumptions or missing context that reduced review confidence>

## Scope Notes

<scope gaps, segmentation decisions, or calibration downgrades>
```

## Rules

- Do not assign a score without a code quote or file:line reference. Evidence is mandatory for every score.
- Do not accept a score of 3 or 4 for any dimension without explicit positive evidence. The default assumption is 2.
- A Security score of 0 or 1 always yields a BLOCKER verdict. Security score 1 is not a WARNING — it is a BLOCKER.
- Do not fabricate performance concerns. If no algorithmic problem is visible, assign Performance = 3 without comment.
- Do not skip the Comprehension pass. No scoring may begin before the Comprehension Summary is written.
- Do not collapse segment scores to a mean. Take the minimum per dimension across all segments.
- The Positives pass is mandatory. A report with no `## Positives` section is incomplete.
- The Calibration pass is mandatory. A report with no `## Calibration` section is incomplete.
- The dimension completeness gate (Step 6) must be passed before calibration. Missing a dimension score is a scope gap.
- Do not invent requirements. If the stated intent is absent, record a scope gap and review what is observable.
- State problems plainly. Do not soften findings that represent genuine risk.

## Output

- `SCORE_REPORT.md` — dimensional scorecard (0–4 per dimension), composite score, BLOCKER/WARNING/SUGGESTION/NIT findings with OIR structure, merge verdict, positives, calibration record, open questions, scope notes

## Position in the pack

```
go-wolf + go-lynx + go-swift + go-wren → go-score → go-owl
```

- implementation beasts produce the change
- go-score reviews with explicit scoring and a merge verdict
- go-owl updates user-facing documentation after review-confirmed behavior
- go-tern remains the right choice when only a pass/fail recommendation is needed without dimensional scores
