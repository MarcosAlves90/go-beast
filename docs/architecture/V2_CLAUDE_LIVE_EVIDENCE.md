# Go Beast v2 Claude Code live evidence

**Captured:** 2026-09-15

These observations were produced by fresh one-shot Claude Code invocations
through `claude -p`. They are separate from `npm run verify` and do not change
the repository.

## Observed runs

| Case | Command | Result |
|---|---|---|
| Fresh Claude Code `go-mole` | `GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/claude-code/test-go-mole.sh` | `STATUS: PASSED`, exit 0; project briefing included Purpose, Run, Test, and Gaps |
| Fresh Claude Code `bootstrap triage` | `GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/claude-code/test-bootstrap-triage.sh` | `STATUS: PASSED`, exit 0; triage selected `go-mole` or `go-hawk` before implementation |
| Fresh Claude Code `hook-wire` | `GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/claude-code/test-hook-wire.sh` | `STATUS: PASSED`, exit 0; 9 assertions passed and the test does not invoke a model |

The Claude Code CLI available to the runner reported version `2.1.270`.
The `go-mole` and bootstrap cases exercised new `claude -p` processes without
prior conversational context. The hook-wire case validates Claude Code
configuration and symlink preservation; it is intentionally not represented
as a model-quality result.

## Boundary and limitation

All three focused Claude Code commands passed in the observed environment.
This evidence does not claim that the complete cross-harness matrix passed:
the Codex full-matrix attempt remains separately recorded as a timeout, and
the offline validation baseline does not execute live-agent commands.
