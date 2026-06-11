---
name: go-raven
version: 1.1.0
description: Designs CI/CD pipelines, environment promotion strategy, infrastructure-as-code, secrets management in CI, and release automation for a software project.
when_to_use: Use when setting up a deployment pipeline, configuring GitHub Actions or similar CI, managing staging and production environments, or automating releases. Invoke after go-eagle (tests passing) and go-bear (security review).
---

# go-raven — CI/CD & Deployment

go-raven carries things from one place to another, reliably. It builds the pipeline that takes code from a developer's machine to production without surprises.

## Quick start

```
Prerequisites: Passing tests from go-eagle, security review from go-bear
→ invoke go-raven
→ CI pipeline → environment strategy → deploy pipeline → release process
```

## Workflow

### 1. Environment strategy

Define the promotion chain first:

```
local dev → CI (ephemeral) → staging → production
```

For each environment document: how provisioned · what secrets it uses · who can deploy · what tests run before promotion.

### 2. CI pipeline (every PR)

Minimum gates — all must pass before merge:

```yaml
jobs:
  ci:
    steps:
      - lint
      - typecheck
      - unit-tests
      - integration-tests
      - build
      - security-audit
```

- CI must complete in under 10 minutes. Parallelize or split jobs if needed.
- A failing CI is a blocker. Never merge with red CI.
- Cache dependencies aggressively.

### 3. CD pipeline

**Staging** — trigger on merge to `main`:
```yaml
jobs:
  deploy-staging:
    needs: [ci]
    steps:
      - build image / bundle artifact
      - push to registry
      - deploy to staging
      - run smoke tests against staging
      - notify on failure
```

**Production** — choose one strategy:

| Strategy | When to use |
|---|---|
| Manual trigger | Default — human approves before deploy |
| Automatic on tag | High test confidence + fast rollback |
| Blue/green | Zero-downtime required |
| Canary | Gradual rollout with metrics monitoring |

Every production deploy must:
- [ ] Be traceable to a specific commit and PR
- [ ] Have a documented rollback procedure in `docs/DEPLOYMENT.md`
- [ ] Trigger a post-deploy smoke test (health check · login · main read endpoint)
- [ ] Alert on failure within 5 minutes

**Rollback:** identify last known-good tag → re-trigger deploy workflow → verify health check → notify team in #incidents.

### 4. Infrastructure as Code

- All infrastructure in code (Terraform, Pulumi, CDK, docker-compose for small projects).
- No manual console changes. If made, codify immediately.
- IaC goes through the same PR review as application code.
- Separate state files per environment.

### 5. Secrets in CI/CD

- Never hardcode secrets in workflow files.
- Use platform secrets store (GitHub Actions secrets, Vault, AWS SSM).
- Rotate CI secrets on schedule and on team member offboarding.
- Never print secret values in logs.

### 6. Observability hook

Every deploy must ship with: error tracking (Sentry/Rollbar) · health check endpoint (`/health`) · APM if required.

## Rules

- No production deploy without passing CI and a human approval step (initially).
- No secrets in workflow files, logs, or build artifacts.
- Every deploy must be reversible. If it is not, state it and require double approval.
- Never use a personal access token for CI. Use a machine account or OIDC.

## Output

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`
- `docs/DEPLOYMENT.md` — environment guide, rollback procedure, release process
- IaC files under `infra/`
