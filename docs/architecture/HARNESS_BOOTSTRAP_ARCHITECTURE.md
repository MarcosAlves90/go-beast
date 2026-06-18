# Harness and bootstrap architecture

This document explains how go-beast is organized around agent integration. It
is for maintainers of this repository, not for end users installing the pack.

## Layer model

go-beast has three layers:

1. Core pack
2. Harness adapter
3. Bootstrap policy

Use this classification before editing files.

### Core pack

The core pack is the canonical `skills/` directory and the docs required to
maintain it.

Primary goal:

- keep the pack usable as plain Markdown skills without any required runtime integration

Primary files:

- `skills/`
- `README.md`
- `PACKAGE.md`
- `CHANGELOG.md`
- skill-eval and workflow-eval definitions when they validate canonical pack contracts

### Harness adapter

The harness adapter layer connects the core pack to specific runtime surfaces.

Primary goal:

- make supported agent harnesses consume the same canonical pack consistently

Primary files:

- `scripts/install.mjs`
- `scripts/hook-wire.mjs`
- `hooks/manifest.json`
- `hooks/sync-go-beast-skills.sh`
- `plugins/go-beast/`
- `tests/claude-code/`
- `tests/codex/`
- `tests/plugin/`

Responsibilities:

- install or sync pack assets into supported local agent locations
- wire hook configuration from the shared manifest
- preserve existing user hook entries where supported
- package the optional plugin adapter bundle
- test live harness behavior on supported surfaces

Non-responsibilities:

- defining the canonical meaning of a skill
- changing the discovery-first policy just because a harness supports hooks

### Bootstrap policy

The bootstrap policy layer changes how an agent should behave at session start
or before implementation.

Primary goal:

- force better sequencing and evidence before coding in stricter sessions

Primary files:

- `AGENTS.global.md`
- `AGENTS.bootstrap.md`
- `skills/go-mule/SKILL.md` for explicit initialization guidance

Responsibilities:

- define when to invoke `go-mole`, `go-hawk`, and `go-lark`
- define stricter stop conditions
- define stronger validation expectations before completion
- describe manual or explicit initialization paths when automatic sync is not desired

Non-responsibilities:

- installing skills
- syncing workflows
- wiring hooks
- mutating runtime config by virtue of bootstrap mode alone

## Source of truth by concern

| Concern | Source of truth | Notes |
|---|---|---|
| Canonical skills | `skills/` | Every other surface adapts from here |
| Pack overview | `README.md` | User-facing summary, not full maintainer architecture |
| Manifest and tree | `PACKAGE.md` | Maintainer-facing inventory |
| Release history | `CHANGELOG.md` | Required for every release |
| Shared hook contract | `hooks/manifest.json` | Agent-specific config is derived from this |
| Hook wiring logic | `scripts/hook-wire.mjs` | Preserves local config where possible |
| Installer entrypoint | `scripts/install.mjs` | Main install and sync orchestration |
| Session-start sync | `hooks/sync-go-beast-skills.sh` | Re-syncs assets and rewires hooks |
| Plugin adapter bundle | `plugins/go-beast/` | Optional packaging surface |
| Default maintainer policy | `AGENTS.global.md` | Baseline repo-maintainer instructions |
| Stricter bootstrap policy | `AGENTS.bootstrap.md` | Optional discovery-first overlay |
| Explicit initialization flow | `skills/go-mule/SKILL.md` | Alternative to sync-hook instrumentation |

## Known drift points

These are the places most likely to fall out of sync.

### Installer versus sync hook

`scripts/install.mjs` and `hooks/sync-go-beast-skills.sh` both orchestrate
asset sync. They should agree on:

- canonical skill source path
- optional plugin bundle expectations
- supported harness targets
- hook wiring entrypoint

If one changes its source paths or supported assets, review the other.

### Hook manifest versus hook docs

`hooks/manifest.json`, `README.md`, `PACKAGE.md`, and `AGENTS.md` all describe
hook behavior from different angles. The manifest defines the executable
contract. Docs must describe, not redefine, that contract.

### Global instructions versus bootstrap instructions

`AGENTS.global.md` and `AGENTS.bootstrap.md` overlap intentionally, but the
bootstrap file is an overlay, not an alternative installer. If bootstrap starts
describing sync mechanics, the boundary is drifting.

### go-mule versus sync-hook setup

`go-mule` is an explicit initialization skill. It can guide a user through
manual or installer-backed setup, but it must not redefine the low-level hook
or plugin wiring contract independently of the harness adapter files.

### Plugin adapter versus canonical pack

The plugin bundle must adapt the canonical `skills/` directory, never fork it.
Whenever canonical skills move, rename, or gain new required assets, the plugin
bundle sync and plugin tests must be reviewed.

## How to classify a change

Ask these questions in order.

1. Does the change alter what the canonical skill pack is?
2. Does the change alter how an agent runtime consumes or wires that pack?
3. Does the change alter how a session should be sequenced before coding?

Classification rules:

- `yes` to 1 means a core-pack change
- `no` to 1 and `yes` to 2 means a harness-adapter change
- `no` to 1 and 2 and `yes` to 3 means a bootstrap-policy change
- `yes` to more than one means a cross-layer change and must be documented as such in the PR

## Adding or changing a supported agent surface

Use this checklist.

1. Define whether the new surface needs only canonical skills, a plugin bundle, hook wiring, or all three.
2. Reuse canonical `skills/` as the source. Do not create a second canonical skill tree.
3. If hook support is needed, extend `hooks/manifest.json` and `scripts/hook-wire.mjs` instead of creating a surface-specific hook contract first.
4. If installation changes are needed, update `scripts/install.mjs`.
5. If SessionStart sync should support the surface, update `hooks/sync-go-beast-skills.sh`.
6. If plugin packaging is needed, update `plugins/go-beast/` and any sync helpers that maintain it.
7. Add or update live tests that exercise the real harness contract.
8. Update `README.md`, `PACKAGE.md`, `AGENTS.md`, and `CHANGELOG.md`.
9. If the change affects architecture boundaries, update this document and the relevant ADR.

## Review checklist for maintainers

Before merging a harness or bootstrap change, verify:

- the layer classification is explicit
- canonical `skills/` remains the only source of truth for skill content
- bootstrap changes do not silently perform harness mutations
- harness changes do not redefine skill semantics
- docs describe the same boundary consistently
- live tests were updated when runtime behavior changed
