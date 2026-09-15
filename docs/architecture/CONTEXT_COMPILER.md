# Context compiler

The v2 context compiler turns a validated `go-squirrel` knowledge base into a
bounded, phase-specific `context_packet`. It is the handoff contract between
durable project memory and the v2 workflow coordinator.

## Why it exists

Workflow phases need enough prior context to make a grounded decision, but a
whole knowledge base is too large, too stale-prone, and too difficult to audit.
The compiler therefore selects explicit records or a bounded lexical seed,
resolves local graph references, and emits a packet with record digests,
provenance, validation evidence, decisions, open questions, conflicts, and next
reads.

The compiler is deterministic for a fixed knowledge base, workflow manifest,
selection, and `--generated-at` value. It does not call a model, perform
semantic search, or replace the canonical `go-squirrel` representation.

## CLI

The package CLI exposes three commands:

```bash
go-beast context compile \
  --kb-root knowledge \
  --workflow-file workflows/feature.json \
  --phase plan \
  --task "Decide the implementation approach" \
  --records architecture-decision,current-status \
  --max-records 8 \
  --max-tokens 2500 \
  --output .go-beast/context-entry.json

go-beast context verify \
  --kb-root knowledge \
  --packet .go-beast/context-entry.json

go-beast context finalize \
  --kb-root knowledge \
  --packet .go-beast/context-entry.json \
  --completion .go-beast/context-completion.json \
  --output .go-beast/context-final.json
```

`--records` accepts stable record IDs. `--query` provides a bounded lexical
seed when IDs are not known. The compiler follows resolvable local references
until the record and token budgets are exhausted; selection never bypasses KB
validation.

## Packet contract

`go-beast.context.schema.json` defines the versioned envelope. The important
fields are:

- `phase`: workflow identity, skill, dependencies, required inputs, and outputs.
- `budget`: requested and used record/token limits plus truncation state.
- `records`: bounded record summaries, paths, reasons, confidence, and SHA-256
  digests.
- `decisions`, `open_questions`, `conflicts`, and `next_reads`: compact
  planning surfaces derived from the selected records.
- `validation_evidence`: the KB validation status and digest.
- `provenance`: workflow-manifest and KB-spec digests, record hashes, and
  selection mode.
- `completion`: null for a phase-entry packet and populated only by
  `finalize`.

The compiler requires `KB_VALIDATION.md` and records a `PASS`/`FAIL`/`UNKNOWN`
status. `verify` fails closed when a selected record, workflow manifest, or
validation report is missing or has changed since compilation.

## Workflow completion

After the phase has produced its decision and validation evidence, `finalize`
adds bounded completion notes and hashes each referenced evidence file. A
workflow phase can then be completed with:

```bash
go-beast workflow complete \
  --file workflows/feature.json \
  --phase plan \
  --context .go-beast/context-final.json
```

The workflow engine accepts only a finalized packet whose workflow ID and phase
match the active manifest and whose completion evidence is entirely `PASS`. It
stores the packet digest and compact counts in phase state and the completion
history; raw prompts and raw command output are not copied into workflow state.

## Safety and limits

- Paths are resolved below the supplied KB root or project root and reject
  traversal and absolute completion-evidence paths.
- Record and completion notes are bounded to prevent accidental prompt-sized
  payloads.
- The compiler reads the local Markdown helper and its validation report; it
  does not silently fall back to a host-specific search service.
- Knowledge-base records remain the source of truth. The packet is a derived,
  reviewable snapshot and must be recompiled after material changes.
- The compiler does not assert that a model followed the packet. Tests,
  adapter traces, and human review remain separate evidence layers.
