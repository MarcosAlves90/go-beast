# Anti-Drift Stack Selection

| Layer | Choice | Why | Risk |
|---|---|---|---|
| Frontend | None | The anti-drift mechanism is runtime enforcement inside supported agent harnesses, not a user-facing application. | No visual control plane; debugging remains file/log driven. |
| Backend | Node.js 18+ scripts plus strict Bash hooks | Matches the existing go-beast harness adapter layer (`scripts/*.mjs`, `hooks/*.sh`) and avoids introducing a second runtime model. | Cross-file logic split between Bash and Node can become hard to reason about if responsibilities are not kept narrow. |
| Database | None; short-lived file state in `~/.go-beast` | Requirements call for minimal operational state, not durable application storage. The repo already uses `~/.go-beast` for shared hook state. | Flat-file state can drift or become ambiguous if schema/versioning is not explicit. |
| Auth | Harness-local trust plus existing Claude/Codex hook trust flow | The mechanism runs inside already-installed local agent harnesses and should reuse the current hook trust model rather than inventing a new auth layer. | If users do not trust or review updated hooks, Codex/Claude may not actually enforce the new behavior. |
| Infra / hosting | Local-only execution inside Claude Code and Codex | Requirements are for session-local runtime enforcement on supported local harnesses, not a hosted service. | No central policy rollout or remote observability. |
| CI/CD | Existing repo workflow: shell tests, live harness tests, PR review, release via normal git/GitHub flow | Aligns with current go-beast maintenance and lets anti-drift stay inside the existing contributor path. | Live harness tests remain opt-in and may lag if contributors skip them. |
| Observability | Local audit trail through explicit state files, hook outputs, and targeted regression tests | Supports explainability and low complexity without collecting sensitive prompt history. | Limited post-mortem visibility if the hook output is too terse or state transitions are not logged clearly enough. |

## Design notes

- Default bias remains “boring technology first”: no daemon, database, or hosted
  policy engine is needed for v1.
- The anti-drift system should stay inside the existing harness adapter layer,
  with policy defined by bootstrap/context docs and execution owned by hooks and
  small scripts.
