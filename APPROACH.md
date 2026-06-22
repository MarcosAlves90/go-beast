## Requirements summary

- All three eval workflows (go-skill-eval, go-hook-eval, go-workflow-eval) must persist results to
  disk after each run.
- The output format must be optimized for LLM agent consumption — not human readability.
- The file must contain full detail: operations, evaluations, scores, notes, observations.
- The format must be consistent and standardized across all three workflows.
- The file must be revisitable in future sessions without re-running the eval.
- go-deep-analysis is explicitly out of scope.

## Approaches considered

### A — Pure JSON per run

One `.json` file per execution with a strict, well-defined schema. All fields named semantically,
arrays for runs/findings, no free-form narrative. The agent can deserialize directly without
speculative parsing.

Trade-offs:
- Optimizes: maximum parseability, no ambiguity, schema-validatable.
- Sacrifices: long narrative content (e.g. judge reasoning) becomes verbose inside JSON strings;
  minor token overhead from escaping and quotes.

### B — Markdown with YAML frontmatter

A `.md` file with a YAML block at the top for structured metadata/scores, followed by Markdown
sections for narrative content. Two formats in one file.

Trade-offs:
- Optimizes: narrative readability; easy to write in current workflows.
- Sacrifices: agent must parse two distinct formats (YAML + Markdown); boundaries between sections
  are ambiguous; unreliable for structured extraction.

### C — JSONL append log (one growing file per workflow)

Each run appends a JSON line to the same log file. Enables run-over-run comparison without
managing multiple files. One file per workflow, not per run.

Trade-offs:
- Optimizes: automatic history; single file per workflow simplifies location.
- Sacrifices: multi-line content (scenario text, judge reasoning) is difficult in JSONL;
  retrieving a specific run requires full file scan; per-run completeness is compromised by
  the compression pressure inherent in the format.

### D — JSON envelope with Markdown body

JSON at the outer level for metadata and scores, with a `body` field containing Markdown
narrative. Attempts to combine structure and readability.

Trade-offs:
- Optimizes: structured metadata + preserved narrative.
- Sacrifices: worst of both worlds for agents — Markdown inside JSON requires parsing two
  formats; Markdown narrative adds no value when the consumer is exclusively an agent.

## Evaluation

| Approach | Agent parseability | Completeness | Token efficiency | Implementation simplicity |
|---|---|---|---|---|
| A — Pure JSON | ✓✓ | ✓✓ | ✓ | ✓ |
| B — Markdown + YAML frontmatter | ✓ | ✓ | ✓✓ | ✓✓ |
| C — JSONL append log | ✓✓ | ✗ | ✓✓ | ✓ |
| D — JSON + Markdown body | ✓ | ✓✓ | ✗ | ✓ |

Approaches C and D are eliminated: C compromises per-run completeness; D adds two-format
parsing overhead with no benefit for an agent-only consumer.

## Selected approach

**Selected:** A — Pure JSON per run

**Rationale:** This is the only approach that maximizes the two highest-priority attributes
simultaneously — full parseability and completeness without trade-offs. The consumer being
exclusively an agent eliminates any justification for narrative or hybrid formats. JSON with a
well-defined schema allows all three workflows to produce the same format without negotiation:
required fields guarantee completeness, optional fields cover variation between evals. The token
overhead of JSON (escaping, quotes) is real but marginal compared to the reliability gain in
structured extraction.

**Key risk:** If the schema is too generic to accommodate all three workflows, it loses
specificity; too specific per workflow, it loses the promised standardization. The balance between
common fields and workflow-specific fields is the most critical design decision.

## Deferred decisions

- Exact schema: which fields are mandatory across all workflows vs. optional per type.
- File naming convention and persistence directory.
- Retention policy: overwrite last run or keep history (last N runs).
- Whether workflows consume a shared schema module or each implements independently.
