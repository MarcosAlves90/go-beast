# Runbook Template & Required Runbooks

## Template

```md
# Runbook: <scenario name>

## Symptoms
What the user or monitor sees.

## Probable causes
Ordered by likelihood.

## Diagnosis steps
1. Check X
2. Run `command` — expected output: Y
3. If Z, proceed to Resolution A; otherwise Resolution B

## Resolution steps
### Resolution A
...

### Resolution B
...

## Escalation
Who to contact if unresolved after X minutes. Include: name, Slack handle, on-call rotation link.

## Post-mortem template
- What happened?
- When was it detected?
- What was the impact?
- Root cause?
- What prevented earlier detection?
- Action items (with owners and due dates)
```

## Minimum required runbooks for any production service

### 1. Application down / health check failing
Symptoms: `/health` returns non-200 or times out.
Causes: app crash · OOM · config error · dependency down.
Steps: check container logs · check resource usage · check dependency health.

### 2. Database connection exhausted
Symptoms: errors containing "connection pool" or "too many clients".
Causes: connection leak · pool size too small · long-running transactions.
Steps: check active connections (`SELECT count(*) FROM pg_stat_activity`) · identify long-running queries · restart connection pool if safe.

### 3. High error rate spike
Symptoms: error rate exceeds threshold in monitoring.
Causes: bad deploy · upstream dependency degraded · data anomaly.
Steps: check recent deploys · check upstream services · check logs for data errors.

### 4. How to roll back a deploy
Steps: identify last known-good tag · trigger rollback deploy · verify health check · notify team.
