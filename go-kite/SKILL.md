---
name: go-kite
version: 1.0.0
description: Audits an existing system's architecture across five dimensions — structure, observability, reliability, scalability, and security posture — and produces a prioritized HTML report with findings, capability gaps, and concrete improvement proposals. Uses repomix to pack the codebase, reads ADRs and CONTEXT.md when present, and opens the report in the browser.
when_to_use: Use when the user wants a strategic view of an existing system's health, a prioritized list of what to improve, or ideas for capabilities not yet built. Invoke after go-mole if the codebase is unfamiliar. Feeds into go-fox (for architectural revisions), go-wolf (for backend gaps), go-bear (for security gaps), and go-raven (for CI/CD gaps).
---

# go-kite — Architecture Health Audit

go-kite is the scout of the go-beast pack. It flies above the system, maps the terrain, and returns with a ranked report of what is healthy, what is fragile, and what is missing.

## Quick start

```
User: "Review our architecture and tell me what we should improve."
→ invoke go-kite
→ pack codebase → read ADRs + CONTEXT.md → audit 5 dimensions → HTML report → browser
```

## Workflow

### 1. Pack the codebase

Use `repomix pack_codebase` on the project root. If the repo is large, compress with `compress: true`. Store the output ID — all subsequent searches run against this packed output.

**If no codebase is available** (early planning phase, infrastructure-only project, or invoked with only conversational context): skip `pack_codebase`. Proceed directly to Step 2. All five dimensions and all capability gap sections must still be fully populated — a documentation-only audit is not a shorter audit. Mark every finding with `(doc-only — no code evidence)` and state the scope explicitly in the Executive Summary.

### 2. Load existing context

Before reading a single line of code, pull what the project already knows about itself:

- [ ] Read `CONTEXT.md` (domain glossary) if present — these are the canonical names for every concept
- [ ] Read `docs/architecture/ADR.md` or any `docs/adr/` directory — decisions already made are not to be re-litigated unless there is strong evidence of friction
- [ ] Read `docs/architecture/STACK.md` if present — know the intended stack before observing the actual one
- [ ] Read `README.md` for stated goals and scope

If none of these exist, note the absence as a finding (Dimension 5: Missing context infrastructure).

### 3. Audit across five dimensions

For each dimension, run targeted searches with `grep_repomix_output` and read key files with `read_repomix_output`. Record findings with evidence (file:line references).

#### Dimension 1 — Structure & Modularity

- [ ] Map top-level modules and their responsibilities. Is each module's purpose inferable from its name alone?
- [ ] Identify circular or overly wide dependencies (a module that imports from 5+ other modules is a smell)
- [ ] Apply the deletion test: which modules, if deleted, would scatter complexity across callers?
- [ ] Look for shallow modules — interfaces nearly as complex as the implementation (pass-throughs, trivial wrappers)
- [ ] Identify God objects / God packages — one file doing everything
- [ ] Flag duplicated logic across modules that should share a seam

#### Dimension 2 — Observability

- [ ] Is there structured logging? Check for log levels, request IDs, correlation IDs
- [ ] Are there metrics endpoints or instrumentation (Prometheus, OpenTelemetry, StatsD)?
- [ ] Are there traces or span propagation?
- [ ] Are errors surfaced with enough context to diagnose without a debugger attached?
- [ ] Are there health/readiness/liveness endpoints?
- [ ] Flag: what would on-call need to answer "is the system healthy right now?"

#### Dimension 3 — Reliability

- [ ] Are there retry policies for external calls?
- [ ] Are there circuit breakers or timeouts on outbound dependencies?
- [ ] Is database access transactional where it should be?
- [ ] Are there graceful shutdown handlers?
- [ ] Are errors propagated or silently swallowed?
- [ ] Are background jobs supervised or fire-and-forget?

#### Dimension 4 — Scalability & Performance

- [ ] Are there N+1 query patterns?
- [ ] Is there caching, and is cache invalidation explicit?
- [ ] Are there synchronous operations that should be async (email send, file processing, webhook delivery)?
- [ ] Are there shared mutable globals that would break horizontal scaling?
- [ ] Are there unbounded in-memory collections?
- [ ] Is pagination implemented for list endpoints?

#### Dimension 5 — Security Posture

- [ ] Are secrets in env vars, not code? Search for hardcoded tokens, passwords, keys
- [ ] Are inputs validated at system boundaries (HTTP handlers, queue consumers)?
- [ ] Are SQL queries parameterized or using an ORM that prevents injection?
- [ ] Is authentication applied consistently, or are there unprotected routes?
- [ ] Are dependencies pinned? Check for `latest` or unpinned ranges in lockfiles
- [ ] Are file uploads validated for type and size?

### 4. Identify capability gaps

Beyond what is broken or fragile, ask what is **absent**:

- [ ] Is there a feature flag or rollout system? Would the team benefit from one?
- [ ] Is there an async job/queue system? Is it appropriate for the scale?
- [ ] Is there an audit log for sensitive operations?
- [ ] Is there rate limiting on public-facing APIs?
- [ ] Is there a multitenancy boundary if the domain requires it?
- [ ] Is there a search capability? Is it efficient for the data volume?
- [ ] Is there an event bus or event sourcing pattern appropriate for the domain?

Only flag gaps where the domain or existing code signals the need. Do not propose capabilities that are purely speculative.

### 5. Produce the HTML report

Write a self-contained HTML file to `<tmpdir>/architecture-audit-<timestamp>.html`. Resolve temp dir from `$TMPDIR`, fall back to `/tmp`, use `%TEMP%` on Windows. Open it with `open <path>` (macOS), `xdg-open <path>` (Linux), `start <path>` (Windows). Tell the user the absolute path.

The report uses **Tailwind via CDN** for layout and **Mermaid via CDN** for dependency graphs. Structure:

#### Executive summary (top of page)
- System name and inferred purpose (one sentence)
- Overall health score: `Healthy / Needs attention / At risk` — each dimension gets a colored badge
- Top 3 recommendations (numbered, clickable anchors to the relevant card below)

#### Dimension cards (one section per dimension)
Each card contains:
- **Status badge**: `Good / Warning / Critical`
- **Findings**: bulleted list with file:line evidence for every claim
- **Mermaid diagram** where the structure is graph-shaped (dependency graph, call flow) — omit if it adds no information
- **Recommendations**: numbered, actionable — each recommendation states *what* to do, *why* it matters, and *which beast to invoke next* (e.g., "→ invoke go-bear to harden auth")

#### Capability gaps section
One card per identified gap:
- **Gap name**
- **Why it matters** — what goes wrong without it (not a generic pitch)
- **Recommendation strength**: `Strong / Worth exploring / Speculative`
- **Suggested next step** — which beast handles it, or what to build

#### ADR conflicts
If any finding contradicts an existing ADR, surface it in a separate "ADR Conflicts" section with a warning callout: *"contradicts ADR-N — worth reopening because…"*

#### Missing documentation
If `CONTEXT.md`, `ADR.md`, or `STACK.md` are absent, list them as findings with a one-line explanation of the cost (e.g., "No CONTEXT.md: AI assistants and new contributors cannot use consistent terminology").

### 6. Present and offer next steps

After opening the report, summarize in 3–5 sentences:
- The most critical finding and its risk
- The highest-value capability gap
- Which beast to invoke next

Then ask: *"Which of these would you like to act on first?"*

## Rules

- Never fabricate findings. Every claim in the report must reference a specific file and line number from the packed codebase output.
- Do not re-litigate ADRs unless there is concrete evidence of friction (measured costs, recurring bugs, test failures). State this clearly when surfacing ADR conflicts.
- Do not propose capabilities that have no signal in the domain or existing code.
- `Speculative` strength is the correct label when a finding is plausible but not evidenced — do not hide uncertainty under `Worth exploring`.
- Do not implement. go-kite audits and proposes. Hand off to the appropriate beast for execution.

## Output

- `<tmpdir>/architecture-audit-<timestamp>.html` — self-contained HTML report opened in browser
- Verbal summary (3–5 sentences) presented after the report opens, covering the critical finding, highest-value gap, and recommended next beast
