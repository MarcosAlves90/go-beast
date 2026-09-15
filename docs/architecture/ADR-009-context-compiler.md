# ADR-009: Bounded phase context compiler

- **Status:** Accepted
- **Date:** 2026-09-14
- **Owners:** go-beast maintainers

## Context

Go Beast has a portable, validated knowledge-base contract in `go-squirrel`
and a resumable workflow coordinator. The two surfaces need a small,
harness-neutral handoff. Passing the whole KB to an agent makes context size,
staleness, and provenance difficult to control; letting each harness invent its
own retrieval format breaks portability.

## Decision

Add `scripts/context-compiler.mjs` and the `go-beast context` namespace. The
compiler consumes the native `go-squirrel` Markdown parser and selector,
requires the KB validation report, resolves local graph references, enforces
record/token budgets, and emits the versioned `context_packet` defined by
`go-beast.context.schema.json`.

The packet carries workflow and phase identity, bounded record summaries,
record hashes, validation evidence, selection provenance, derived decisions,
open questions, conflicts, and next reads. A separate `finalize` operation
records bounded phase completion notes and hashes the referenced evidence. The
workflow engine accepts a packet at phase completion only when it matches the
manifest and all completion validation evidence is `PASS`.

## Alternatives considered

1. **Inject the complete knowledge base.** Rejected because it violates the
   bounded-context requirement and makes stale or irrelevant material hard to
   detect.
2. **Add a mandatory external semantic-search service.** Rejected because the
   core pack must remain portable and offline-capable. Semantic search can be
   layered on later without changing the packet contract.
3. **Let each workflow phase define an ad-hoc context format.** Rejected
   because it duplicates validation, provenance, and completion behavior across
   harnesses.
4. **Make the workflow engine execute retrieval implicitly.** Rejected because
   phase-entry context is an inspectable artifact and should be reviewable and
   reproducible before phase execution.

## Consequences

Positive:

- Phase context is bounded, inspectable, and hash-verifiable.
- `go-squirrel` remains the canonical source of durable knowledge.
- Workflow state records evidence about the context used without copying raw
  prompts or command output.
- The contract works across Claude Code, Codex, Copilot CLI, and plain Markdown
  workflows.

Trade-offs and limits:

- The initial selector is explicit-ID or lexical, not model-ranked semantic
  retrieval.
- A packet becomes stale when selected records, the workflow manifest, or KB
  validation evidence changes.
- Completion evidence still depends on the caller providing accurate paths and
  statuses; the compiler verifies files and hashes but cannot prove the truth of
  an external claim.

## Validation

The implementation is covered by
`tests/plugin/test-context-compiler-v2.sh`, which exercises compilation,
bounded selection, graph provenance, stale-record rejection, finalization, and
workflow completion integration. The native `go-squirrel` CLI tests remain in
the validation gate to protect the shared parser and selector boundary.
