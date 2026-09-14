# Go Beast v2 stack

This is a stack selection for the local control plane, not for application
projects that use the skills.

| Layer | Choice | Why | Risk |
|---|---|---|---|
| Frontend | None required; plain CLI and Markdown first | Preserves agent-agnostic use and avoids making a GUI a release dependency | A later TUI or GUI needs a stable JSON API |
| Backend | Node.js 18+ ESM modules | Matches the existing installer, workflow, delivery, profile, and release tooling with no new runtime dependency | Runtime behavior must remain portable across macOS, Linux, and Windows |
| Database | Atomic JSON files under user/project `.go-beast/` scopes | Reviewable, offline, portable, and consistent with current workflow and runtime state | Concurrent writers and migrations require strict locking and revision checks |
| Auth | OS filesystem permissions plus explicit local consent | The product is a local integration layer, not a hosted multi-tenant service | Hooks still run with harness permissions and are not a sandbox |
| Infra / hosting | Local filesystem; optional CI runner | Keeps the core usable without network access and lets CI validate contracts | Cross-machine coordination is intentionally not a core guarantee |
| CI/CD | Existing GitHub Actions with `npm run verify`, release certificate, and attestation | Reuses the current release boundary and mandatory validation command | Live-agent tests and external harness behavior need separate scheduled coverage |
| Observability | Versioned evidence ledger, normalized traces, artifact hashes, and JSON diagnostics | Makes phase progress and claims inspectable without collecting prompts by default | Observations can still be incomplete or falsely declared by an agent |
| Context | `go-squirrel` local record graph and bounded context packets | Gives v2 durable provenance and portable retrieval without hosted memory | Retrieval quality and stale-record handling require benchmarks |
| Package integrity | Release certificate plus per-asset manifest hashes; detached signatures as an extension | Builds on existing release verification and supports transactional install | Hash integrity does not establish semantic correctness |

## Selection rules

- Prefer existing Node and filesystem primitives before adding dependencies.
- Keep the canonical pack readable with ordinary filesystem tools.
- Introduce a package only when it removes a proven portability or correctness
  risk and the release contract can validate it offline.
- Treat remote storage, vector search, GUI, and agent execution as adapters,
  not prerequisites.
