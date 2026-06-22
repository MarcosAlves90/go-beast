# ADR — eval-output: agent-optimized JSON persistence

## ADR-005: One JSON file per eval run with shared envelope schema

**Status:** Proposed
**Date:** 2026-06-21

### Context

go-skill-eval, go-hook-eval, and go-workflow-eval currently save results as
Markdown reports. Markdown is human-readable but requires speculative parsing
when consumed by an agent. Each workflow uses a different report format and
saves to a different directory. Results are not revisitable across sessions
without re-running the eval.

### Decision

All three eval workflows will emit a structured JSON file per run in addition
to (or replacing) the existing Markdown report. The file will use a shared
envelope schema with a typed `detail` block specific to each workflow type.

### Consequences

#### Positive

- Any agent can parse results reliably without format negotiation.
- go-finch, go-tern, and future maintenance beasts can read eval history
  directly without re-running evaluations.
- Schema-validation is possible; missing or malformed runs are detectable.
- Standardization across three workflows reduces cognitive load for maintainers.

#### Negative

- Each workflow requires an update to add the JSON output step.
- The inline schema (EVAL_OUTPUT_SCHEMA) will be duplicated across three files.
- Token overhead compared to a flat Markdown summary; acceptable for the
  agent-consumption use case.

### Alternatives considered

#### 1. Markdown with YAML frontmatter

Rejected — agent must parse two formats (YAML + Markdown); section boundaries
are ambiguous; unreliable for structured extraction.

#### 2. JSONL append log per workflow

Rejected — per-run completeness is compromised; multi-line fields are awkward;
retrieving a specific run requires full file scan.

#### 3. JSON envelope with Markdown body

Rejected — no benefit for an agent-only consumer; two-format parsing overhead
with no corresponding gain.

## ADR-006: Shared envelope with typed detail block

**Status:** Proposed
**Date:** 2026-06-21

### Context

The three eval workflows produce meaningfully different data:
- go-skill-eval: per-skill runs with judge scores and structural checklist results
- go-hook-eval: per-case test results with exit codes and adversarial verification
- go-workflow-eval: per-workflow structural and quality judge findings

A single flat schema would either be too generic (losing specificity) or too
specific (duplicating the three schemas into one unmanageable shape).

### Decision

Use a two-level schema:

1. **Envelope** — fields present in every eval output regardless of workflow type:
   `schema_version`, `workflow`, `run_id`, `timestamp`, `duration_ms`,
   `summary` (aggregate counts/scores), `inputs` (what was evaluated),
   `meta` (workflow version, filter args).

2. **Detail block** — typed per workflow under `detail.type`:
   - `skill-eval`: array of per-skill-run objects with struct/judge results
   - `hook-eval`: array of per-case objects with exit codes and adversarial results
   - `workflow-eval`: array of per-workflow objects with extracted structure and judge findings

### Consequences

#### Positive

- An agent reading the envelope can make routing decisions without parsing the
  detail block.
- Each workflow team can evolve its detail block independently without breaking
  the shared contract.
- `schema_version` enables forward compatibility.

#### Negative

- Two-level access pattern requires agents to navigate `result.detail.runs[n]`
  rather than a flat array.

### Alternatives considered

#### 1. Single flat schema for all workflows

Rejected — lowest-common-denominator genericism loses per-workflow specificity;
fields would be absent or null for most workflows.

#### 2. Fully independent schemas per workflow

Rejected — agents cannot parse envelope-level data (timestamp, summary, inputs)
consistently; standardization goal is unmet.
