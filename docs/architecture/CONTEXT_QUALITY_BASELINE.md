# Go Beast context-quality baseline

**Captured:** 2026-09-15

This baseline measures the deterministic `go-squirrel` lexical selector with a
small labelled fixture. It is evidence for bounded selection and evidence
completeness, not a semantic-retrieval or LLM-quality score.

## Result

The benchmark passed **3/3 cases** over **5 validated records**:

| Metric | Result |
|---|---:|
| Macro recall | 1.0 |
| Macro precision | 1.0 |
| Irrelevant exclusion | 1.0 |
| Uncertainty capture | 1.0 |
| Provenance coverage | 1.0 |

The cases cover cache policy and uncertainty, scoped authorization, and release
archive integrity. Each case uses an explicit `max-records` bound and compares
the selector output with fixture labels for expected and forbidden record IDs.

## Reproduction

The focused regression fixture creates the validated knowledge base, runs the
benchmark, and checks the JSON report:

```bash
bash tests/plugin/test-context-quality-benchmark.sh
```

For an existing validated knowledge base, produce either projection directly:

```bash
node scripts/context-quality-benchmark.mjs \
  --kb-root /path/to/knowledge \
  --format markdown \
  --output /tmp/context-quality-baseline.md
```

## Limitations

- Expected and forbidden IDs are deterministic fixture labels, not independent
  human relevance truth.
- Lexical term matching does not measure semantic retrieval, model usefulness,
  or LLM output quality.
- This benchmark complements packet-budget, stale-record, conflict, provenance,
  and workflow integration tests; it does not replace them.
