# ADR-007: Go Beast v2 local declarative control plane

**Status:** Accepted  
**Date:** 2026-09-14

## Context

Go Beast v1.56.0 already contains a plain Markdown skill pack, federated
manifest and hook contracts, per-agent integration profiles, an optional
workflow state machine, a strict delivery controller, behavioral conformance,
and the portable `go-squirrel` knowledge-base standard. The pieces are useful
independently, but the effective capability set, profile, route, context, and
evidence are not resolved by one runtime contract. Agents and harness adapters
must still interpret much of the policy, and the current conformance boundary
can validate only declared evidence.

Version 2 needs a stronger composition and observability model without making
the pack dependent on a provider, a daemon, a hosted memory service, or a
single harness. The architecture must also preserve v1 installations and
avoid allowing declared model output to grant implementation authorization.

## Decision

Build v2 as a local declarative control plane around the existing portable
core. The control plane has these components:

1. **Capability registry:** a versioned structural registry for skills, hooks,
   workflows, profiles, and adapters. It owns identity, dependencies,
   conflicts, inputs, outputs, permissions, risk, supported surfaces, schema
   versions, and deprecation metadata. Operational reasoning remains in the
   canonical `skills/*/SKILL.md` files.
2. **Profile resolver:** computes effective policy from global, project,
   session, and agent scopes. It returns the source and precedence of every
   decision and never removes unmanaged files.
3. **Route compiler:** turns task kind, implementation surface, profile, and
   available adapter capabilities into a versioned workflow manifest. It
   extends `scripts/workflow.mjs` and does not create a competing state
   machine.
4. **Runtime policy gate:** remains the authorization boundary for phase,
   required artifact, approval, implementation unlock, and completion state.
   Evidence can inform the gate but cannot mutate authorization by itself.
5. **Evidence ledger:** records ordered events, commands, artifacts, digests,
   approvals, session identity, source harness, and evidence trust level. It
   preserves raw source data and distinguishes `declared`, `observed`, and
   `verified` evidence.
6. **Context compiler:** requests bounded task context from `go-squirrel` and
   persists decisions, open questions, provenance, and validation results as
   durable records when configured.
7. **Adapter contract:** maps native installation, hook events, prompt context,
   and tool results to the harness-neutral capability and evidence contracts.
   Missing capabilities degrade to the Markdown core.
8. **Distribution transaction:** previews target scope and permissions,
   verifies available integrity metadata, applies changes atomically, retains
   a rollback point, and preserves unrelated user configuration.

The default execution boundary remains external: an agent or trusted runner
performs substantive skill and application work. A future execution adapter
may be opt-in and consented, but it is not part of the core v2 contract.

## Source-of-truth boundaries

| Concern | Canonical source | v2 responsibility |
|---|---|---|
| Skill reasoning and procedures | `skills/*/SKILL.md` | Read and expose metadata; do not duplicate prose |
| Structural capability facts | v2 capability registry | Validate, resolve, and generate structural views |
| Hook behavior | `hooks/manifest.json` and scripts | Declare adapter capabilities and preserve native semantics |
| Profile intent | User/project/session profile documents | Resolve effective policy and explain precedence |
| Workflow state | Existing workflow engine state | Add events and route metadata without a second engine |
| Durable context | `go-squirrel` records and packets | Compile bounded input and persist provenance |
| Release version | `package.json` and release certificate | Include capability/schema compatibility metadata |

## Migration

- Read v1 profile schema version 1 and preserve its `all` and `selected`
  semantics. Write an explicit migration receipt before writing a v2 profile.
- Read v1 runtime state and receipts through versioned adapters. Never infer a
  new approval or implementation unlock from a migrated artifact.
- Keep v1 CLI namespaces as compatibility aliases while the task-oriented v2
  CLI is introduced.
- Keep existing artifact paths and checkpoint names valid until a documented
  major migration maps them to v2 identifiers.
- Keep generated surfaces derived from their existing domain owners during the
  transition and fail when registry and federated sources disagree.

## Security and failure behavior

- Invalid registry, profile, event, or evidence data fails closed for mutation
  and authorization while remaining inspectable for diagnosis.
- Hook and installer actions are treated as privileged local operations; the
  control plane does not claim sandboxing.
- Prompt contents, secrets, and personal data are excluded from the ledger and
  context by default. Redaction and explicit retention policy are required for
  opt-in collection.
- Hashes and signatures establish integrity, not truth of model intent. A
  `verified` event must identify the verifier and the check performed.

## Consequences

### Benefits

- One explainable effective view connects capability, profile, route, context,
  and evidence without removing the portable core.
- Existing v1 adapters can migrate incrementally behind versioned contracts.
- Workflow recovery, review, and release evidence become durable and
  machine-readable.
- Hosted services, vector search, and direct execution remain optional.

### Costs and risks

- Schema evolution and source ownership become first-class maintenance work.
- Adapter conformance must be maintained for every supported harness.
- A ledger may create false confidence if declared events are not visibly
  distinguished from observed or verified events.
- A richer controller can become an accidental executor unless the boundary is
  enforced in code and documentation.

## Alternatives considered

### Incremental federated v1+

Rejected as the primary v2 direction. It minimizes migration but leaves the
cross-surface composition and effective-policy gap unresolved.

### Hosted agent platform

Rejected for the core. It raises privacy, availability, vendor, offline, and
trust costs before local contracts have proven their value.

## Open decisions

- Exact public/private split for project policy files.
- Per-harness definition of directly observed evidence.
- Whether detached signatures are required for every installed asset or only
  for release bundles.
- The consent and sandbox contract for any future execution adapter.
