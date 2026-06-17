# ADR-002: Canonical Skills Directory

## Status

Accepted

## Context

ADR-001 introduced `plugins/go-beast/` as a plugin-friendly adapter bundle
without moving the canonical skills away from the repository root. That kept
the initial rollout small, but it left the repository with two competing mental
models:

- plugin-oriented consumers expected a real top-level `skills/` directory
- core repo tooling still treated root `go-*` directories as canonical
- documentation had to explain that the plugin bundle exposed `skills/`, but
  the actual source of truth lived elsewhere

Issue `[pack] evaluate moving canonical skills into a real skills directory`
requested a direct evaluation of whether the canonical source should move into
an actual `skills/` directory instead of only being represented there through
plugin symlinks.

## Decision

Move the canonical skills into a real top-level `skills/` directory and keep
root `go-*` entries as compatibility symlinks.

This migration changes the source of truth for repository maintenance:

- canonical skill directories live at `skills/go-*`
- root `go-*` paths remain available as symlinks for compatibility
- plugin adapter symlinks now target `skills/go-*`
- installer and sync tooling enumerate canonical skills from `skills/`

## Consequences

### Positive

- aligns repository layout with plugin-oriented expectations
- removes the mismatch between documented and actual `skills/` semantics
- gives the pack one explicit canonical location for skill maintenance
- preserves backward compatibility for tooling or docs that still reference
  root `go-*` paths

### Negative

- introduces a compatibility layer that must stay intact until legacy path
  assumptions are removed
- requires repo tooling and tests to stay aware that root `go-*` entries are
  symlinks, not real directories

## Operational rule

Edit canonical skills only under `skills/`. Treat root `go-*` paths as
compatibility aliases, not primary locations.
