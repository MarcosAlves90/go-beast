# eval-output Component Diagram

```mermaid
flowchart TD
    WF1[go-skill-eval.js] -->|produces| ENV1[JSON Envelope\ntype: skill-eval]
    WF2[go-hook-eval.js]  -->|produces| ENV2[JSON Envelope\ntype: hook-eval]
    WF3[go-workflow-eval.js] -->|produces| ENV3[JSON Envelope\ntype: workflow-eval]

    ENV1 --> SAVE1[save-output agent\n~/.claude/workflows/go-skill-eval/results/]
    ENV2 --> SAVE2[save-output agent\n~/.claude/workflows/go-hook-eval/results/]
    ENV3 --> SAVE3[save-output agent\n~/.claude/workflows/go-workflow-eval/results/]

    SAVE1 --> FILES[(JSON files on disk\none per run\nlast 10 retained)]
    SAVE2 --> FILES
    SAVE3 --> FILES

    FILES -->|read by| AGENT[Agent / go-finch / go-tern\nin future sessions]

    subgraph envelope [Shared Envelope Schema]
        direction LR
        E1[schema_version]
        E2[workflow]
        E3[run_id]
        E4[timestamp]
        E5[duration_ms]
        E6[summary]
        E7[inputs]
        E8[meta]
        E9[detail.type + detail.runs]
    end
```

## Notes

- All three workflows emit the same envelope shape; only `detail.type` and
  `detail.runs` differ.
- The `save-output` agent call mirrors the existing `save-report` pattern.
- Retention is enforced at write time: files beyond the last 10 are deleted
  before writing the new one.
- Agents reading results navigate: `result.summary` for aggregate decisions,
  `result.detail.runs` for per-item findings.
