# Stack — eval-output: agent-optimized JSON persistence

> scope: go-skill-eval, go-hook-eval, go-workflow-eval output format
> date: 2026-06-21

| Layer | Choice | Why | Risk |
|---|---|---|---|
| Output format | JSON (one file per run) | Machine-parseable without ambiguity; schema-validatable; no dual-format parsing overhead; aligns with existing STRUCT_SCHEMA/JUDGE_SCHEMA patterns already in workflows | Verbosity for long text fields (judge rationale); mitigated by semantic field naming and no redundant prose |
| Schema strategy | Shared envelope + typed `detail` block per workflow | Guarantees common fields across all three evals while preserving per-workflow specificity; avoids lowest-common-denominator genericism | Schema version drift if workflows evolve independently; mitigated by `schema_version` field in envelope |
| Schema location | Inline constant in each workflow (`EVAL_OUTPUT_SCHEMA`) | Consistent with existing pattern (STRUCT_SCHEMA, JUDGE_SCHEMA already inline); no build step or import system needed in Workflow JS scripts | Duplication across 3 files; acceptable — schema is small and changes require deliberate coordination |
| File naming | `{workflow-name}-{YYYYMMDD-HHmmss}.json` | Chronologically sortable; matches the documented envelope contract; no collision on concurrent runs in normal use | Directory grows unbounded without retention; mitigated by retention policy |
| Persistence directory | `~/.claude/workflows/{workflow-name}/results/` | Mirrors existing `reports/` convention; per-workflow isolation; session-persistent across restarts | Path is user-home-relative; `$HOME` expansion required for portability |
| Retention policy | Keep last 10 runs; delete oldest at write time | Bounded disk usage; 10 runs sufficient for trend analysis; configurable via `EVAL_KEEP_RUNS` | Fixed cap may frustrate users wanting longer history if the override is not set |
| Write mechanism | Deterministic filesystem write with post-write validation | Avoids reliance on a second agent to materialize the JSON and catches malformed envelopes immediately | Slightly more code per workflow; acceptable for robustness |
