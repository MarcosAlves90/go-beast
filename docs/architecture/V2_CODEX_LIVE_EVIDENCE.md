# Go Beast v2 Codex live evidence

**Captured:** 2026-09-15

These observations were produced by fresh Codex subagent threads with no prior
conversation context. They are separate from `npm run verify` and do not change
the repository.

## Observed runs

| Case | Command | Result |
|---|---|---|
| Fresh Codex `go-tern` thread A | `GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/codex/test-go-tern.sh` | `STATUS: PASSED`, exit 0 |
| Fresh Codex `go-tern` thread B | `GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/codex/test-go-tern.sh` | `STATUS: PASSED`, exit 0 |
| Fresh Codex `go-mule` thread | `GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/codex/test-go-mule.sh` | **INCONCLUSIVE**, exit 1 before a test status |
| Full live matrix attempt | `GO_BEAST_RUN_LIVE_AGENT_TESTS=1 npm run test:live` | **TIMEOUT** while a Codex case was still active; not a pass |

The passing cases confirmed that a new `codex exec` process was exercised and
reported `OpenAI Codex v0.153.4`. The subagent repository remained on
`release/v2` and clean.

## Boundary and limitation

The `go-mule` thread could not initialize the Codex state database/app-server
inside its sandbox: the state DB was read-only and app-server initialization
returned `Operation not permitted`. Because no `STATUS` line was produced,
this run is recorded as **INCONCLUSIVE**, not as a test failure or pass.

The full matrix attempt reached the Codex live suite but exceeded the bounded
execution window. A complete v2 live gate still requires a host where all
Codex subagent state and app-server permissions are available. The offline
validation gate remains independent of that environment.
