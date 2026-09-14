# Go Beast v2 roadmap

This roadmap turns the approved v2 direction into independently verifiable
slices. A slice is complete only when its behavior, migration impact,
documentation, and `npm run verify` evidence are recorded.

## P0 — Foundation required for v2

### 1. Capability registry v2

Define and validate a versioned registry for skills, hooks, workflows, profiles,
and adapters. Keep operational skill prose in `skills/`; generate structural
views and reject drift.

**Exit evidence:** schema, parser/validator, deterministic JSON output, invalid
fixture tests, and a compatibility report against all current skills/hooks.

### 2. Effective profiles and `doctor`

Extend the current per-agent profile implementation to global, project, session,
and agent scopes. Show precedence, capability gaps, ownership, conflicts,
blocked assets, and exact dry-run mutations.

**Exit evidence:** v1 profile migration fixtures, all supported-agent fixtures,
project/session precedence tests, unmanaged-file preservation tests, and JSON
diagnostics.

### 3. Evidence ledger and conformance v2

Add an append-only event envelope with command/artifact provenance, hashes,
source harness, and declared/observed/verified status. Extend conformance to
validate the envelope and reject false ordering or unsupported adapter claims.

**Exit evidence:** canonical schema, adapter fixtures, tampered-event tests,
ordering tests, and an audit report that clearly separates observation from
declaration.

### 4. Deterministic validation and evaluation

Add unit tests for runtime modules, fixture-based adapter tests, and a separate
live-agent regression suite. Keep `npm run verify` as the mandatory offline
gate and publish baseline metrics before setting numeric targets.

**Exit evidence:** test taxonomy, deterministic coverage of P0 modules, live
matrix results, eval report, and documented limitations.

### 5. Transactional installation and integrity

Add permission preview, per-asset integrity metadata, atomic install/upgrade,
rollback, and an audit report without touching unmanaged configuration.

**Exit evidence:** clean-home install/upgrade/rollback tests on supported
platforms, tampered-asset failure, permission-scope report, and release checks.

## P1 — Operational leverage

### 6. Workflow engine v2

Add route compilation, `continue`, `retry`, `resume`, checkpoint provenance,
parallel slices, and handoffs on top of the existing lock/revision engine.

**Depends on:** capability registry, profiles, evidence ledger.

**Exit evidence:** interruption/recovery fixtures, concurrent-writer tests,
parallel fan-in tests, and a migration path for v1 workflow state.

### 7. `go-squirrel` context compiler

Compile bounded phase-entry packets and persist decisions, open questions,
provenance, and validation evidence at phase completion. Keep local lexical and
graph retrieval authoritative; semantic search remains optional.

**Depends on:** workflow state and evidence envelope.

**Exit evidence:** packet budget tests, stale/conflict fixtures, provenance
round-trip tests, and a context-quality benchmark.

### 8. Adapter SDK and capability matrix

Standardize install, configuration, lifecycle events, tool events, degradation,
and compatibility declarations for Claude Code, Codex, Copilot CLI, and future
surfaces.

**Depends on:** capability registry and conformance v2.

**Exit evidence:** one conformance fixture per adapter, unsupported-capability
  diagnostics, and preservation tests for native configuration.

### 9. Task-oriented CLI

Expose `init`, `doctor`, `plan`, `run`, `status`, `explain`, `resume`, and `audit`
while keeping the v1 command namespaces as compatibility aliases.

**Depends on:** profiles, workflow engine, evidence ledger.

**Exit evidence:** command contract, text/JSON snapshots, migration help, and
  end-to-end local workflow fixture.

## P2 — Optional ecosystem

### 10. Signed extension registry

Distribute third-party skills and adapters with compatibility metadata,
signatures, deprecation, and review policy.

### 11. Hosted semantic-memory adapter

Add remote retrieval only as an opt-in projection that cannot replace local
records, provenance, graph validation, or bounded packets.

### 12. Observability dashboard and adaptive prompt profiles

Provide opt-in aggregate metrics and model/harness-specific context policies
only after privacy boundaries and benchmark baselines exist.

## POLIS evidence

This architecture slice is governed by a locked POLIS Change Contract. Its
acceptance proof is the structural artifact check plus the repository's
mandatory `npm run verify` gate. Runtime behavior is intentionally deferred to
the implementation slices below; each such slice must add a focused RED test,
capture its regression patch, and verify the resulting delivery package.

## Release gates

- **v2-alpha:** slices 1–3 have stable schemas and migration fixtures.
- **v2-beta:** slices 4–8 pass deterministic and adapter conformance tests.
- **v2-rc:** slice 5 passes clean-home, tamper, rollback, and release checks;
  v1 compatibility is documented.
- **v2.0:** all P0/P1 exit evidence is present, residual limitations are
  explicit, and the major-version migration is verified.

## Explicit non-goals

- Hooks are not mandatory for using the core skills.
- The controller does not silently become an agent executor.
- Hosted memory, vector search, GUI, and fleet management are not v2 core
  dependencies.
- New beasts are not a substitute for composability, evidence, or adapter
  quality.
