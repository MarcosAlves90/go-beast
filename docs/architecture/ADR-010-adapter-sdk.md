# ADR-010: Versioned harness adapter SDK

- **Status:** Accepted
- **Date:** 2026-09-15
- **Owners:** go-beast maintainers

## Context

Go Beast already supported Claude Code, Codex, and Copilot through shared hook
scripts, conformance normalization, and a capability registry. The native
event names, configuration formats, installation paths, and limitations were
distributed across those implementations. That made adding a new harness
risky and made unsupported behavior easy to mistake for support.

The v2 architecture requires one adapter contract covering installation,
configuration, lifecycle events, tool events, degradation, compatibility, and
ownership while preserving existing native configuration and v1 traces.

## Decision

Introduce `adapters/manifest.json` as the declarative adapter source and
`scripts/adapters.mjs` as its validation and inspection SDK. The manifest is
schema-backed, sorted, and explicit about every supported capability and
canonical-to-native event mapping.

Hook wiring derives native paths, event names, and formats from the manifest.
Conformance adds adapter identity and contract metadata to normalized traces
while retaining the legacy `go-beast-conformance` source field. The capability
registry derives adapter entries from the SDK and no longer treats a separate
hard-coded adapter list as authoritative.

The SDK exposes validation, listing, contract inspection, matrix rendering,
and unsupported-capability diagnostics. Diagnostics include a documented
degradation behavior and exit non-zero when a requested feature is absent.

## Alternatives considered

1. **Keep adapter details in each implementation.** Rejected because native
   differences and compatibility claims would continue to drift.
2. **Use a single universal event/configuration format.** Rejected because it
   hides real harness differences and encourages unsafe writes.
3. **Require a remote adapter service.** Rejected because the pack must remain
   offline-capable and portable across agent surfaces.
4. **Replace v1 trace metadata immediately.** Rejected because existing
   normalized traces are a migration boundary; v2 metadata is additive.

## Consequences

Positive:

- Installation and lifecycle capabilities are inspectable before mutation.
- Unsupported features produce explicit, machine-readable degradation advice.
- Native config preservation and managed-entry ownership are part of the
  contract, not undocumented implementation behavior.
- Future harnesses have one schema, one SDK surface, and one fixture pattern.

Trade-offs and limits:

- The manifest describes support; it cannot prove that a live harness emits an
  event in every runtime condition.
- Adapter capability declarations must be updated when native harness APIs
  change.
- The current offline SDK validates the three shipped adapters; future adapter
  installation remains an explicit implementation slice.

## Validation

`tests/plugin/test-adapter-sdk-v2.sh` covers manifest validation, matrix and
show output, unsupported diagnostics, all three conformance fixtures, native
Codex configuration preservation, and registry provenance. Existing hook-wire,
conformance, fixture, and capability-registry tests remain in `npm run verify`.
