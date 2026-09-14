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
- `npm run test` runs the mandatory offline plugin and release-archive
  installation suites, followed by Node's built-in deterministic unit tests.
- `npm run verify` runs `lint`, then `test`, and fails if either validation
  changes the Git working tree unexpectedly.
- `npm run test:live` runs the separate live-agent matrix and the
  agent-dependent Claude Code, Codex, and Copilot CLI tests. It is not part of
  `verify`.

## Test taxonomy

The v2 validation boundary has three deliberately different layers:

| Layer | Location | Dependencies | Default command | Evidence |
|---|---|---|---|---|
| Deterministic unit | `tests/unit/*.test.mjs` | Node.js built-ins and local modules | `npm run verify` | pure registry, profile, conformance, and evidence assertions |
| Offline integration and fixtures | `tests/plugin/`, `tests/install/`, `tests/fixtures/` | Node.js, Bash, temporary files | `npm run verify` | CLI, installation, adapter, and migration behavior |
| Live-agent regression | `tests/live/`, `tests/claude-code/`, `tests/codex/`, `tests/copilot/` | opt-in harness binaries and credentials | `npm run test:live` | harness-specific output or an explicit skip |

The live matrix inventory always checks that all three supported harness suites
exist. Live execution is disabled unless `GO_BEAST_RUN_LIVE_AGENT_TESTS=1` is
set, and an unavailable harness remains `SKIP`; neither state is reported as a
passing live run. The offline layers do not invoke a harness, network service,
or credential.

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

The current baseline uses deterministic shell integration suites and Node's
built-in test runner; it does not define an instrumented coverage threshold.
The existing `go-skill-eval` and `go-hook-eval` workflows are agent-dependent
LLM evaluations and are not silently folded into `npm run verify`. See the
[v2 validation baseline](architecture/V2_VALIDATION_BASELINE.md) for measured
results and residual limitations.

The installation regression suite also covers permission preview, dry-run
non-mutation, per-asset integrity metadata, tamper rejection, unmanaged-file
preservation, failed-transaction rollback, explicit rollback, and upgrade
records. Archive-source pointer replacement is tested separately by the
release-archive installation suite.
