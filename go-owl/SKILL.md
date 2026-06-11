---
name: go-owl
description: Audits and writes technical documentation for a software project — README, API reference, architecture docs, ADRs, runbooks, and changelog — ensuring every document is accurate, complete, and runnable.
version: 1.1.0
when_to_use: Use when setting up documentation for a new project, filling gaps in existing docs, writing an API reference, producing runbooks for operations, or before any release. Can be invoked at any phase of the project.
---

# go-owl — Documentation

go-owl sees in the dark. It produces documentation that actually helps the next person — not documentation that exists to check a box.

## Quick start

```
Can be invoked at any phase.
→ invoke go-owl
→ audit what is missing → write targeted docs → verify accuracy
```

## Workflow

### 1. Audit

Check each item. Write only what is missing or wrong.

- [ ] `README.md` at repo root
- [ ] `docs/SETUP.md` — local dev setup
- [ ] `docs/architecture/` — ADR, stack, diagrams
- [ ] `docs/DATABASE.md` — schema, migrations
- [ ] `docs/TESTING.md` — test strategy
- [ ] `docs/DEPLOYMENT.md` — environments, deploy, rollback
- [ ] `docs/security/` — threat model, security review
- [ ] API reference (OpenAPI spec or `docs/API.md`)
- [ ] Runbooks for known operational scenarios
- [ ] `CHANGELOG.md`

### 2. README.md

Answer in order: what is this · why it exists · how to run locally (copy-paste commands) · how to run tests · how to deploy · where the architecture doc is · how to contribute.

Rules: no marketing language · commands must actually work · under 150 lines · link to `docs/` for detail.

### 3. API reference

Prefer OpenAPI 3.x (`docs/openapi.yaml`). Otherwise `docs/API.md` with: method + path · auth requirement · request schema · response schema · example request/response.

Never document behavior the code does not implement. Verify against the running server.

### 4. Runbooks

Write one runbook per known operational scenario. Use this template:

```md
# Runbook: <scenario name>

## Symptoms
## Probable causes (ordered by likelihood)
## Diagnosis steps
## Resolution steps
## Escalation (who, Slack, on-call link)
## Post-mortem template
```

**Minimum runbooks required for any production service:**

1. **Application down / health check failing** — container logs · resource usage · dependency health
2. **Database connection exhausted** — `SELECT count(*) FROM pg_stat_activity` · pool config · long-running queries
3. **High error rate spike** — recent deploys · upstream services · log anomalies
4. **How to roll back a deploy** — identify last known-good tag · trigger rollback · verify `/health` · notify team

Store runbooks in `docs/runbooks/`. Each file = one scenario.

### 5. Changelog

Use [Keep a Changelog](https://keepachangelog.com) format. Update on every release. Do not update retroactively.

```md
## [Unreleased]

## [1.0.0] - YYYY-MM-DD
### Added / Changed / Fixed / Removed / Security
```

### 6. Quality bar

Before considering documentation done:
- [ ] Every command was actually run and produced the expected output
- [ ] No dead links
- [ ] No placeholders (TODO, TBD, coming soon)
- [ ] Terminology is consistent with the codebase

## Rules

- Wrong documentation is worse than no documentation. Verify before publishing.
- Document interfaces and behaviors, not internal implementation details.
- Keep docs close to the code they describe.

## Output

- `README.md` — accurate and runnable
- `docs/` — complete per audit checklist
- `CHANGELOG.md` — current
- OpenAPI spec or `docs/API.md` — verified against running server
