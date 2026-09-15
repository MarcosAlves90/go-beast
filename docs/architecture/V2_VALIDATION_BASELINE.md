# Go Beast v2 validation baseline

**Captured:** 2026-09-14

This report records what was measured for the v2 validation slice. It is a
baseline, not a quality target: no coverage threshold or LLM score is inferred
from these results.

## Taxonomy

| Layer | Scope | Gate |
|---|---|---|
| Deterministic unit | `tests/unit/*.test.mjs` covering the P0 registry, profile resolver, conformance checker, and evidence ledger | included in `npm run verify` |
| Offline integration and fixtures | `tests/plugin/`, `tests/install/`, and `tests/fixtures/adapters/` | included in `npm run verify` |
| Live-agent regression | `tests/live/` plus `tests/claude-code/`, `tests/codex/`, and `tests/copilot/` | separate `npm run test:live` command |

## Observed baseline

The following results were captured on the repository's `release/v2` branch:

- `npm run verify`: **PASS**; all offline lint, plugin, installation, and unit
  checks completed without changing the Git tree.
- P0 deterministic unit cases: **4 passed** through Node's built-in test
  runner.
- Workflow engine regression: **PASS**; route compilation, parallel continue,
  checkpoint digests, handoff state, interruption recovery, retry attempts, and
  v1 state migration passed in `tests/plugin/test-workflow-engine-v2.sh`.
- Context compiler regression: **PASS**; bounded phase selection, local graph
  provenance, stale-record rejection, completion finalization, and workflow
  completion integration passed in `tests/plugin/test-context-compiler-v2.sh`.
- Adapter SDK regression: **PASS**; manifest validation, capability matrix,
  unsupported diagnostics, all three adapter fixtures, native configuration
  preservation, and registry provenance passed in
  `tests/plugin/test-adapter-sdk-v2.sh`.
- Task CLI regression: **PASS**; root-bounded initialization, delivery-plan
  delegation, workflow start/status/resume, capability explanation, structural
  audit, and v1 namespace compatibility passed in
  `tests/plugin/test-task-cli-v2.sh`.
- Adapter fixtures: **3/3 passed** for Claude Code, Codex, and Copilot,
  including v1 normalization and v2 exact adapter-source claims.
- Live matrix inventory: **3/3 suites present**. Live-agent execution was not
  enabled for this offline baseline (`GO_BEAST_RUN_LIVE_AGENT_TESTS` was not
  set to `1`), so no harness result is represented as a pass.
- `go-skill-eval` and `go-hook-eval`: **not measured** in this baseline; both
  require an agent workflow runtime and remain outside the offline gate.

## Limitations

- Node's built-in tests provide deterministic behavior coverage but no
  instrumented statement, branch, or mutation-coverage percentage.
- Fixture tests validate adapter contracts and degradation boundaries; they do
  not prove that a live harness emits every event faithfully.
- Live tests require explicit local opt-in, installed harnesses, and whatever
  credentials those harnesses require. A skip is evidence of non-execution,
  not evidence of correctness.
- LLM evaluation scores are intentionally absent until a repeatable model,
  prompt, sample, and scoring baseline is pinned.
