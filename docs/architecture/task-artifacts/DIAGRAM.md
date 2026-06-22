# eval-output Component Diagram

```mermaid
flowchart TD
    WF1[go-skill-eval.js] -->|writes| ENV1[JSON Envelope\ntype: skill-eval]
    WF2[go-hook-eval.js]  -->|writes| ENV2[JSON Envelope\ntype: hook-eval]
    WF3[go-workflow-eval.js] -->|writes| ENV3[JSON Envelope\ntype: workflow-eval]

    ENV1 --> FILES1[(~/.claude/workflows/go-skill-eval/results/\nJSON files)]
    ENV2 --> FILES2[(~/.claude/workflows/go-hook-eval/results/\nJSON files)]
    ENV3 --> FILES3[(~/.claude/workflows/go-workflow-eval/results/\nJSON files)]

    FILES1 -->|read/validated by| AGENT[Agent / go-finch / go-tern\nin future sessions]
    FILES2 -->|read/validated by| AGENT
    FILES3 -->|read/validated by| AGENT

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
- Retention is enforced at write time and can be configured with
  `EVAL_KEEP_RUNS`.
- The workflows validate the written JSON immediately after save and log a
  warning if the envelope is malformed.
- Agents reading results navigate: `result.summary` for aggregate decisions,
  `result.detail.runs` for per-item findings.
