# ADR-003: Harness and bootstrap architecture

- Status: Accepted
- Date: 2026-06-18

## Context

go-beast now spans three related but different concerns:

1. The canonical skill pack under `skills/`
2. Optional harness adapters such as the installer, sync hook, hook wiring, and plugin bundle
3. Optional bootstrap policy that changes how an agent should sequence discovery before implementation

These concerns currently work, but the contract is easy to misread because the
same behavior is described across `README.md`, `AGENTS.md`,
`AGENTS.global.md`, `AGENTS.bootstrap.md`, installer scripts, sync scripts,
and live harness tests.

That ambiguity creates predictable drift risks:

- bootstrap mode can be confused with installer or hook behavior
- harness support can be changed without a single maintainer-facing source of truth
- new agent surfaces can be added without an explicit ownership model

## Decision

We separate the repository into three architecture layers with distinct
responsibilities.

### 1. Core pack

The core pack is the canonical `skills/` directory plus the documentation
required to understand and maintain those skills.

The core pack:

- is agent-agnostic
- must remain usable without hooks, plugins, or installer automation
- is the compatibility baseline for the repository

### 2. Harness adapter layer

The harness adapter layer is everything that connects the core pack to a
specific agent runtime or packaging surface.

This layer includes:

- `scripts/install.mjs`
- `scripts/hook-wire.mjs`
- `hooks/manifest.json`
- `hooks/sync-go-beast-skills.sh`
- `plugins/go-beast/`
- live harness tests under `tests/claude-code/`, `tests/codex/`, and `tests/plugin/`

The harness adapter layer may:

- install or sync skills into agent-specific locations
- register hook config for supported agents
- expose plugin-oriented packaging for runtimes that require manifests or dedicated bundle layout
- validate real-session behavior for supported agent surfaces

### 3. Bootstrap policy layer

The bootstrap policy layer changes session behavior by tightening decision
order, discovery expectations, and validation expectations before coding work.

This layer includes:

- `AGENTS.global.md`
- `AGENTS.bootstrap.md`
- `skills/go-mule/SKILL.md` when guiding explicit initialization choices

The bootstrap policy layer may:

- require `go-mole`, `go-hawk`, or `go-lark` before implementation
- define stricter stop conditions and evidence expectations
- steer users toward explicit initialization flows when hooks are unavailable or undesirable

The bootstrap policy layer must not:

- install skills or workflows
- wire or register hooks
- package plugin bundles
- mutate harness configuration by merely being enabled

Those actions belong to the harness adapter layer.

## Consequences

### Positive

- Maintainers get a stable ownership model for future changes.
- Bootstrap behavior can evolve without silently changing installer semantics.
- Adding a new supported agent surface becomes a harness concern, not a skill or bootstrap concern by default.
- Documentation can point to one maintainer-facing architecture guide instead of restating the same distinction ad hoc.

### Negative

- Some concepts will still be documented in multiple files because user-facing install docs and maintainer-facing architecture docs serve different audiences.
- Reviewers must classify changes deliberately before editing, instead of treating all agent integration changes as one bucket.

## Follow-up rules

When changing the repository:

1. If the change alters canonical skill content or pack semantics, treat it as a core-pack change.
2. If the change alters installation, hook registration, plugin packaging, or live harness behavior, treat it as a harness-adapter change.
3. If the change alters discovery-first behavior, stop conditions, or initialization guidance without changing runtime wiring, treat it as a bootstrap-policy change.
4. If a change crosses layers, document the boundary explicitly in the PR and update the maintainer architecture guide.
