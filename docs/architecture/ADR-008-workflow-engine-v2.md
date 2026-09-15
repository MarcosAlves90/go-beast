# ADR-008: Resumable workflow routes and external handoffs

- Status: Accepted
- Date: 2026-09-14
- Scope: local declarative workflow coordinator

## Context

The v1 workflow engine already validates dependencies, artifact gates,
transitions, modes, locks, and optimistic revisions. It intentionally does not
execute skills. Recovery was limited, however: `resume` only displayed state,
parallel work was implicit in a graph, and there was no durable checkpoint or
handoff record for an external runner.

## Decision

The engine keeps one state machine and adds a versioned route boundary:

- `plan` compiles a deterministic topological order, edges, roots, and declared
  parallel slices without mutating state;
- v2 phase metadata declares bounded retries, optional parallel groups, allowed
  handoff targets, and checkpoint eligibility;
- `continue` atomically starts every eligible phase in the current slice while
  preserving dependency, artifact, transition, mode, lock, and revision gates;
- `resume` marks running phases as `interrupted` after process recovery, and
  `retry` queues a recoverable phase for its next bounded attempt;
- `checkpoint` stores artifact SHA-256 digests and bounded actor/command
  metadata, never raw prompts or command output;
- `handoff` stores a bounded note, target, and latest checkpoint reference while
  keeping execution with the external agent or runner.

Persisted state is schema version 2. A v1 state is normalized on the first
mutating command or `resume`, retains its history, and receives an explicit
`migrate` event. Migration does not infer approval, completion, or
implementation authorization.

## Consequences

Positive consequences:

- independent work can be started as an atomic coordinator slice;
- interrupted work is visible and recoverable instead of remaining falsely
  `running`;
- checkpoints provide useful artifact provenance without retaining sensitive
  content;
- handoffs are explicit and auditable across supported agents;
- v1 manifests and states have a documented incremental migration path.

Known limits:

- the coordinator does not schedule or execute an agent and cannot prove that
  a declared external handoff occurred;
- parallel groups are coordination metadata, not a distributed lock or worker
  pool;
- checkpoint digests prove the observed file state at capture time, not the
  semantic quality of an artifact;
- retry backoff is declared for runners to honor; the CLI does not sleep or
  invoke a scheduler.
