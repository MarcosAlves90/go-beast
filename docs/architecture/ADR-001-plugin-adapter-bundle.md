# ADR-001: Plugin Adapter Bundle for Harness-Specific Packaging

## Status

Accepted

## Context

`go-beast` is maintained as an agent-agnostic skill pack: the canonical skills
live as `go-*` directories at the repository root, while installation today is
handled through `scripts/install.mjs` plus hook sync for Claude Code and Codex.

This structure is good for direct file-based consumption, but it is a poor fit
for plugin surfaces that expect a dedicated plugin root with a manifest and a
single `skills/` directory.

## Decision

Introduce a plugin adapter bundle at `plugins/go-beast/` instead of moving the
canonical skills.

The adapter bundle:

- exposes plugin manifests for Codex and Claude
- provides a `skills/` directory composed of symlinks to the canonical root
  `go-*` directories
- keeps plugin-specific metadata separate from the core pack

Hook installation remains outside the plugin manifests. Current local Codex
plugin guidance rejects manifest-level `hooks`, so hooks continue to be wired by
`scripts/install.mjs` and `hooks/sync-go-beast-skills.sh`.

## Consequences

### Positive

- enables plugin-oriented packaging without breaking the existing root layout
- preserves the root `go-*` directories as the single source of truth
- reduces future migration cost if the pack is published through plugin
  marketplaces

### Negative

- introduces an additional adapter surface that can drift if not maintained
- requires a sync step when skills are added, removed, or renamed

## Operational rule

After any `go-*` skill inventory change, run:

```bash
node scripts/sync-plugin-skills.mjs
```
