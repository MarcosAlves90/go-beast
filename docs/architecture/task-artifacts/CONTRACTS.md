# eval-output Interface Contracts

## 1. Shared envelope schema

All three eval workflows must emit a JSON object conforming to this envelope.

```json
{
  "schema_version": 1,
  "workflow": "go-skill-eval | go-hook-eval | go-workflow-eval",
  "run_id": "<uuid or timestamp-based opaque string>",
  "timestamp": "<ISO 8601 UTC>",
  "duration_ms": 12345,
  "summary": {
    "total": 4,
    "passed": 4,
    "failed": 0,
    "errors": 0,
    "avg_score": 4.35,
    "estimated_cost_usd": 0.0546
  },
  "inputs": {
    "filter": ["go-snipe"],
    "workflow_version": "1.40.0"
  },
  "meta": {
    "go_beast_version": "1.40.0",
    "environment": "claude-code | codex | unknown"
  },
  "detail": {
    "type": "skill-eval | hook-eval | workflow-eval",
    "runs": []
  }
}
```

### Rules

- `schema_version` must be present and must be an integer. Increment on
  breaking changes to the envelope shape.
- `summary.avg_score` is `null` when not applicable (e.g. hook-eval uses
  pass/fail, not scores).
- `inputs.filter` is `null` when no filter was applied (full run).
- `detail.runs` is an array of typed objects — see per-workflow contracts below.

---

## 2. detail.runs — go-skill-eval (type: "skill-eval")

Each element of `detail.runs` represents one skill × input combination.

```json
{
  "skill": "go-snipe",
  "input_key": "A | B | C | D",
  "input_label": "TaskFlow API",
  "struct": {
    "pass": true,
    "missing": [],
    "tokens_approx": 8266,
    "latency_ms": 520
  },
  "judge": {
    "score": 4.7,
    "dimensions": {
      "relevance": 5,
      "completeness": 5,
      "clarity": 4,
      "adherence": 5
    },
    "rationale": "<string — judge's reasoning>",
    "strengths": ["<string>"],
    "weaknesses": ["<string>"]
  },
  "skipped": false,
  "skip_reason": null
}
```

---

## 3. detail.runs — go-hook-eval (type: "hook-eval")

Each element represents one test case.

```json
{
  "hook": "git-strip-coauthored.sh",
  "case_name": "blocks Co-Authored-By in heredoc",
  "expected_exit": 1,
  "result": {
    "passed": true,
    "exit_code": 1,
    "stdout": "<truncated to 200 chars>",
    "stderr": "<truncated to 200 chars>",
    "detail": "<one sentence from judge>"
  },
  "adversarial": {
    "run": false,
    "confirmed_failure": null,
    "detail": null
  }
}
```

Suite-level results are captured in `summary`:

```json
"summary": {
  "total": 34,
  "passed": 34,
  "failed": 0,
  "errors": 0,
  "confirmed_failures": 0,
  "spurious_failures": 0,
  "suites_passed": 3,
  "suites_total": 3,
  "avg_score": null,
  "estimated_cost_usd": 0.12
}
```

---

## 4. detail.runs — go-workflow-eval (type: "workflow-eval")

Each element represents one workflow evaluated.

```json
{
  "workflow": "go-skill-eval",
  "type": "skill-eval",
  "total_lines": 1067,
  "struct": {
    "pass": true,
    "missing": [],
    "issues": []
  },
  "judge": {
    "score": 4.5,
    "dimensions": {
      "correctness": 5,
      "completeness": 4,
      "coverage": 5,
      "clarity": 4
    },
    "rationale": "<string>",
    "strengths": ["<string>"],
    "weaknesses": ["<string>"]
  }
}
```

---

## 5. File path and retention contract

**Write path:** `~/.claude/workflows/{workflow-name}/results/{workflow-name}-{YYYYMMDD-HHmmss}.json`

**Retention:** Before writing, list existing files in the directory sorted by
name (chronological). Delete all but the most recent `(EVAL_KEEP_RUNS - 1)`
files. Default `EVAL_KEEP_RUNS = 10`.

**Error model:**
- Directory does not exist: create it before writing.
- Write fails: log error via `log()`; do not abort the workflow.
- Retention cleanup fails: log warning; do not abort the workflow.

---

## 6. Agent consumption contract

An agent reading an eval output file must:

1. Verify `schema_version === 1` before trusting field shapes.
2. Read `summary` for aggregate decisions (pass/fail, score range, cost).
3. Navigate `detail.runs` for per-item findings.
4. Treat any field not present in this contract as optional and unknown.
5. Not treat absence of `weaknesses` as evidence of no weaknesses — distinguish
   `weaknesses: []` (judged, none found) from field absent (not evaluated).
