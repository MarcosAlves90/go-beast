# ADR-007: Transactional installation and source integrity

- Status: Accepted
- Date: 2026-09-14
- Scope: checkout and release-archive installation

## Context

The installer changes several agent-owned paths in one operation: skill links,
hook wiring, workflow links, instruction files, profiles, and the active release
source pointer. A failure after the first mutation can otherwise leave a partial
installation that is difficult to diagnose or repair. Users also need a way to
inspect the permission boundary and detect source changes before installation.

## Decision

The canonical installer uses a persisted transaction boundary for every mutating
installation. Before mutation it snapshots managed targets, including absent
paths, symlinks, regular files, and directories. Regular-file snapshots are
stored in a private transaction directory. Mutations run in a deterministic
order; failures restore snapshots in reverse order and record the outcome. The
explicit `--rollback` operation restores the latest safe transaction and refuses
unsafe backup or target paths.

The installer exposes two non-mutating planning modes:

- `--permission-preview` reports managed targets and write locations.
- `--dry-run` reports the selected assets and planned mutations.

After a successful installation, `~/.go-beast/install-manifest.json` records a
schema-versioned entry for each selected asset with SHA-256, size, file count,
source, kind, and agent metadata. `--verify-integrity` validates the manifest
against the checkout before any mutation and fails closed on a mismatch. This
manifest detects local drift; it is not a cryptographic release signature or an
authenticity mechanism.

Release-archive source updates use a staged temporary symlink. The previous
pointer is retained until the new pointer is installed successfully and is
restored if the swap fails.

The installer preserves unmanaged real directories, external symlinks, custom
hook entries, and unrelated files. It only restores or removes paths captured as
managed by the transaction and integration ownership rules.

## Consequences

Positive consequences:

- failed installs become recoverable instead of silently partial;
- permission and mutation scope can be reviewed before execution;
- source integrity is checked per asset and recorded for later diagnosis;
- archive pointer replacement does not strand the previous usable source;
- existing user-owned content remains outside the managed rollback boundary.

Known limits:

- the local manifest is not a signed attestation and cannot prove archive
  authenticity;
- a process that changes a managed path concurrently with the installer can
  still race the snapshot or restore boundary;
- transaction records are retained locally and should be protected with the
  user's normal home-directory permissions;
- rollback restores the captured state, not changes made by an unrelated later
  process to the same managed path.
