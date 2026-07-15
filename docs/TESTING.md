# Testing and validation

## Local contract

The repository has one contributor validation flow:

```bash
npm install
npm run verify
```

The commands are intentionally thin wrappers around existing repository
checks:

- `npm run lint` checks plugin synchronization and release/version consistency.
- `npm run test` runs the mandatory plugin and release-archive installation
  suites.
- `npm run verify` runs `lint`, then `test`, and fails if either validation
  changes the Git working tree unexpectedly.
- `npm run test:live` runs agent-dependent Claude Code, Codex, and Copilot CLI
  tests separately. It is not part of `verify`.

## Granular scripts

The existing granular scripts in `package.json` remain available for focused
diagnosis, compatibility, and selective live-test execution. They are not the
canonical contribution or CI flow, and CI must not compose them directly.

Use the consolidated commands by default. Use a granular command only when a
specific suite or operational action needs to be isolated, for example:

```bash
npm run test:plugin:drift-hooks
npm run test:plugin:release-version
npm run test:install:archive
GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:codex:go-tern
```

New validation should be added to the appropriate consolidated command rather
than creating another top-level validation entrypoint.

## CI policy

`.github/workflows/verify.yml` runs only `npm run verify` on pull requests and
pushes to `main`. The workflow uses Ubuntu, Node.js, and Bash and requires no
credentials, external services, or live-agent tools.

Tags and release workflows do not use this validation workflow. Release checks
remain owned by the existing release workflow.

## Scope and limitations

This repository currently relies on deterministic shell integration suites and
does not define a unit-test framework or coverage threshold. Adding new test
levels, coverage tooling, or live-agent cases is outside the scope of the
unified-command change.
