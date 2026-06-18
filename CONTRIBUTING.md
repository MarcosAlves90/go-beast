# Contributing to go-beast

This repository maintains the go-beast skill pack, optional harness adapters,
maintainer-facing instruction contracts, and related docs, hooks, tests, and
workflows.

Contributions should keep the pack agent-agnostic at its core and preserve the
documented boundaries between:

- canonical `skills/`
- optional harness adapters
- maintainer-facing instruction and protocol layers

## Before you start

1. Read [README.md](README.md) for the pack overview and install model.
2. Read [AGENTS.md](AGENTS.md) for maintainer-specific rules.
3. Read the relevant architecture docs in [docs/architecture](docs/architecture/)
   when your change affects instruction contracts, protocols, harness behavior,
   plugin packaging, or canonical skill layout.

## Core rules

- Keep one problem per PR.
- Keep one problem per issue.
- Use English only for docs, skills, commits, PRs, and issue text.
- Follow existing repository patterns before introducing a new local convention.
- Do not claim validation that did not actually run.
- Do not mix canonical skill changes with unrelated harness or docs work unless
  the boundary-crossing change is intentional and documented.

## Issue workflow

Use [.github/ISSUE_TEMPLATE.md](.github/ISSUE_TEMPLATE.md).

Requirements:

- Use a short imperative title in the form `[area] summary`.
- State the concrete problem, why it matters, desired outcome, constraints, and
  acceptance criteria.
- List related issues, PRs, ADRs, docs, or code paths explicitly.
- Do not open speculative issues with no concrete problem statement.

## Pull request workflow

Use [.github/pull_request_template.md](.github/pull_request_template.md).

Requirements:

- Use a short imperative PR title in the form `[area] summary`.
- Keep the PR scoped to one problem.
- Add a GitHub closing keyword such as `Closes #123` when the PR resolves an
  issue.
- Explain the problem, root cause, change, validation, risks, and follow-ups.
- Review the full diff before opening the PR.

Commit messages must follow Conventional Commits:

```text
type(scope): summary
```

Examples:

- `docs(agents): add maintainer protocols`
- `feat(pack): add explicit initialization skill`
- `fix(install): restore canonical skills source path`

## Choosing the right workflow

Use the maintainer protocol layer in
[docs/architecture/MAINTAINER_PROTOCOLS.md](docs/architecture/MAINTAINER_PROTOCOLS.md)
for recurring workflows:

- Discovery Protocol
- Implementation Protocol
- Validation Protocol
- PR/Release Protocol
- Blocker/Escalation Protocol

Use the strongest relevant `go-*` skill when a skill covers the task better
than ad-hoc work.

Examples:

- `go-smith` when adding a new beast
- `go-finch` when tightening an existing skill
- `go-jay`, `go-swift`, or `go-wren` when changing agent instructions or hooks
- `go-owl` when the change is docs or release-facing
- `go-tern` before merge or handoff review

## Common change types

### Adding a new beast

1. Run `go-smith` to validate the gap and naming.
2. Create `skills/go-<animal>/SKILL.md` with the required structure.
3. Register the skill in `README.md`, `PACKAGE.md`, and `workflows/go-skill-eval.js`.
4. Add integration coverage when the skill changes real agent behavior.
5. Update `CHANGELOG.md` and bump version at the correct SemVer level.

### Changing an existing skill

1. Prefer `go-finch` when the task is to tighten or repair one concrete weakness.
2. Keep edits minimal and intentional.
3. Update eval coverage if the skill contract changed materially.
4. Update `CHANGELOG.md` and version metadata.

### Changing hooks, harness wiring, or agent context

1. Respect the documented harness/bootstrap boundaries in
   [docs/architecture/HARNESS_BOOTSTRAP_ARCHITECTURE.md](docs/architecture/HARNESS_BOOTSTRAP_ARCHITECTURE.md).
2. Prefer `go-jay`, `go-swift`, and `go-wren` over ad-hoc edits.
3. Keep shared-manifest and hook-wiring paths consistent.
4. Update live harness tests when runtime behavior changes.

### Docs or release-facing changes

1. Review `README.md`, `PACKAGE.md`, `CHANGELOG.md`, and relevant architecture
   docs together.
2. If `[Unreleased]` content is being released, bump version metadata
   consistently.
3. Do not leave docs partially updated across duplicated entry points.

## Validation expectations

Before claiming a contribution is ready:

- run the strongest relevant checks you can access
- state exactly what was run
- state what was not run
- describe residual risk when validation is partial

Useful repository commands:

```bash
npm run sync:plugin-skills
npm run test:plugin
GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:claude:bootstrap
GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:codex:go-mule
GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:codex:go-tern
GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:codex:go-marten
```

## Release and versioning

Update [CHANGELOG.md](CHANGELOG.md) before bumping version metadata.

SemVer policy:

- patch: wording corrections, checklist fixes, metadata fixes, other
  backward-compatible corrections
- minor: new rules, new docs/contracts/protocols, new skills, new hooks, new
  workflows that are backward-compatible
- major: removed or renamed skills, changed pipeline order, breaking contract
  changes

When the change is notable and user-facing, keep:

- `CHANGELOG.md`
- `README.md`
- `PACKAGE.md`
- `package.json`

aligned to the same released version.
