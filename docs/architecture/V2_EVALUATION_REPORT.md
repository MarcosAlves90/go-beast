# Go Beast v2 evaluation report

Captured: 2026-09-15T01:33:15.481Z
Repository: release/v2 at 51e7cefdcc9e3baf7c0f2c5136f10a89c18e23b7
Version: 1.56.0

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
