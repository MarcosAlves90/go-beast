---
name: go-eagle
version: 1.1.1
description: Designs the test pyramid, writes unit, integration, and end-to-end tests, establishes CI gates, and sets coverage policy for a software project.
when_to_use: Use when establishing a testing strategy for a new project, adding missing test coverage, auditing test quality, or planning a QA phase before release. Invoke after go-wolf and/or go-lynx have produced a working implementation.
---

# go-eagle — Testing Strategy & QA

go-eagle sees everything from above. It identifies what matters to test, at what level, and makes sure the safety net is real — not just numbers on a coverage report.

## Quick start

```
Prerequisites: Working implementation from go-wolf and/or go-lynx
→ invoke go-eagle
→ test pyramid design → unit tests → integration tests → E2E tests → CI gate
```

## Workflow

### 1. Design the test pyramid

Decide the distribution and justify each choice:

```
         /\
        /E2E\         ← few, slow, catch integration failures
       /------\
      /Integr. \      ← moderate, catch contract and DB issues
     /----------\
    /   Unit     \    ← many, fast, catch logic bugs
   /--------------\
```

Anti-pattern to avoid: the ice cream cone (too many E2E, no unit tests).

For the full breakdown of what belongs at each level, read:
`${CLAUDE_SKILL_DIR}/references/test-levels.md`

### 2. CI gate

Every PR must pass before merge:
- [ ] Unit tests (< 30s)
- [ ] Integration tests (< 3 min)
- [ ] Type check
- [ ] Lint

E2E tests: merge to main or nightly — not every PR unless cycle time allows it.

### 3. Coverage policy

Set a floor (e.g., 80%) but:
- Require coverage of all business-critical paths regardless of overall %
- Exclude generated, framework, and trivial code from the report
- Never merge tests that test nothing meaningful just to hit the number

### 4. Flaky test policy

Flaky tests must be fixed or deleted — never skipped indefinitely. A test that cannot fail is not a test.

## Rules

- Tests passing against mocks when the real thing would fail are worse than no tests.
- Test files live next to the code they test (`.test.ts` co-located), not in a separate `tests/` tree.
- Use a real test database for integration tests — not mocks.

## Output

- `docs/TESTING.md` — test strategy (pyramid decisions, tooling, CI policy)
- Test files alongside implementation
- CI pipeline file (e.g., .github/workflows/ci.yml for GitHub Actions, .gitlab-ci.yml for GitLab CI, Jenkinsfile for Jenkins) — test gates configured
