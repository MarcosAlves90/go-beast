# Pipeline Templates & Deploy Strategies

## CD pipeline — staging

Trigger: merge to `main`

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

Staging must be live within 5 minutes of merge.

## CD pipeline — production

Choose a strategy based on project risk:

| Strategy | When to use |
|---|---|
| **Manual trigger** | Default. Human approves production deploy. |
| **Automatic on tag** | When team has high test confidence and fast rollback. |
| **Blue/green** | Zero-downtime required. |
| **Canary** | Gradual rollout with metrics monitoring. |

Every production deploy must:
- [ ] Be traceable to a specific commit and PR
- [ ] Have a documented rollback procedure
- [ ] Trigger a post-deploy smoke test
- [ ] Alert on failure within 5 minutes

## Rollback procedure template

```md
## Rollback: <service name>

### When to roll back
- Error rate exceeds X% for more than Y minutes
- Health check fails for more than Z minutes
- P0 bug reported in production

### How to roll back
1. Identify the last known-good release tag
2. Trigger the deploy workflow with that tag
3. Verify health check returns 200
4. Notify the team in #incidents

### After rollback
- Open a post-mortem issue
- Do not re-deploy without root cause identified
```

## Release documentation template

Tag every production release:

```md
## v<semver> — YYYY-MM-DD

### What changed
- [feature] ...
- [fix] ...
- [security] ...

### Breaking changes
- None / List with migration steps

### Rollback
Deploy tag v<previous> to revert.
```

## Smoke test checklist

Minimum smoke tests to run after every deploy:
- [ ] Health check endpoint returns 200
- [ ] Login flow completes successfully
- [ ] Main data read endpoint returns expected shape
- [ ] Error tracking service receives a test event
