# Go Beast v2 evaluation report

Captured: 2026-09-15T02:03:59.444Z
Repository: release/v2 at 9ee04d1bf4ba2d4195aaa9b392a6e800a4a1b7e1
Version: 2.0.0

## Deterministic evidence

- Unit tests: **PASSED** (1 files).
- Full npm run verify: **PASSED**.

## Live-agent matrix

- Inventory: **PASSED** (3/3 suites present).
- Execution: **NOT_REQUESTED**; this status is not a pass unless the command completed successfully.

| Harness | Suite | CLI |
| --- | --- | --- |
| claude-code | present | available |
| codex | present | available |
| copilot | present | available |

## Workflow evaluations

| Workflow | Structural source | Agent-runtime execution |
| --- | --- | --- |
| go-skill-eval | PASSED | NOT_MEASURED |
| go-hook-eval | PASSED | NOT_MEASURED |

## Limitations

- Live-agent execution is not measured unless --live is explicitly supplied; inventory presence is not runtime proof.
- go-skill-eval and go-hook-eval structural checks do not replace their agent-runtime execution.
- No statement, branch, mutation, or LLM quality score is inferred from this report.
