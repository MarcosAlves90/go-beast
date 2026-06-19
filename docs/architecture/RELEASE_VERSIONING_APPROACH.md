# Release Versioning Approach

## Requirements summary

- Release state must stop depending on manually syncing `CHANGELOG.md`,
  `README.md`, `PACKAGE.md`, and `package.json`.
- The process must preserve the existing SemVer policy and make the chosen bump
  explicit.
- Core release/versioning must remain understandable and must not depend on
  optional Claude/Codex-specific runtime layers.
- The system should reduce manual release steps and detect drift automatically.

## Approaches considered

### 1. `package.json` as canonical source

Use `package.json` as the single canonical version value. Add a release script
that updates `CHANGELOG.md`, `README.md`, and `PACKAGE.md` from the package
version and validates consistency before or after the release step.

Trade-offs:
- Optimizes for standard tooling expectations and easy machine parsing.
- Sacrifices some human readability because `PACKAGE.md` still needs a derived
  mirror of the version.

### 2. `PACKAGE.md` as canonical source

Treat `PACKAGE.md` as the canonical release manifest because it already carries
  version and date metadata in a pack-specific format. Add a release script that
  parses `PACKAGE.md`, then propagates the version into `package.json`,
  `README.md`, and `CHANGELOG.md`.

Trade-offs:
- Optimizes for repository-local semantics and pack-specific documentation.
- Sacrifices tooling ergonomics because Markdown parsing is more brittle than
  JSON parsing and less conventional for automation.

### 3. Dedicated release manifest as canonical source

Introduce a new machine-readable file such as `release.json` or
`version.json` that stores the canonical version and release metadata. Convert
all current surfaces into derived outputs and add scripts to sync and validate
them.

Trade-offs:
- Optimizes for explicit contracts and clean automation boundaries.
- Sacrifices simplicity by adding a new top-level concept and another file that
  maintainers must understand.

## Evaluation

| Approach | Simplicity | Scalability | Dev speed | Operational cost | Fit to constraints |
|---|---|---|---|---|---|
| `package.json` canonical | ✓✓ | ✓ | ✓✓ | ✓✓ | ✓✓ |
| `PACKAGE.md` canonical | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dedicated manifest | ✗ | ✓✓ | ✗ | ✗ | ✓ |

## Selected approach

**Selected:** `package.json` as canonical source

`package.json` is already the most natural machine-readable version surface in
the repo, and it gives the lowest-complexity path to deterministic validation
and synchronization. It avoids introducing a new release concept, keeps the
automation conventional, and lets `README.md`, `PACKAGE.md`, and
`CHANGELOG.md` become clearly derived or validated surfaces instead of
maintainer memory checks.

The selected implementation also adds a release certificate file for each cut
and a separate publish step that creates the annotated git tag after the release
commit exists. That keeps the version bump, the attestation, and the git tag
each explicit without forcing the release script to guess about commit state.

**Key risk:** the repo still needs explicit policy for how `CHANGELOG.md`
release sections are cut, or the automation could sync version numbers while
leaving release notes semantically wrong.

## Deferred decisions

- Whether the release workflow should include an interactive CLI or only
  explicit script arguments.
- Whether the release script should mutate files directly or offer separate
  `check` and `apply` modes.
- Whether hook-level reminders should call the new validation script directly or
  remain advisory.
- Whether the release certificate should eventually become signed with an
  external key instead of staying as a deterministic attestation file.
