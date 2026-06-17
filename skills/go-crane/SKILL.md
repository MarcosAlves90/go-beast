---
name: go-crane
version: 1.0.0
description: Implements observability for a running system — structured logging with correlation IDs, metrics collection (Prometheus/OpenTelemetry), distributed tracing, health endpoints, alerting rules, and runbook-linked dashboards. Produces OBSERVABILITY.md documenting signal inventory, retention policy, and alert thresholds.
when_to_use: Use when a service is deployed or nearing deployment and lacks production visibility. Invoke after go-raven (pipeline running) or after go-wolf (backend implemented) when observability must be added before go-bear's pre-release review.
---

# go-crane — Observability & Monitoring

go-crane stands still and watches everything. It instruments a running system so that failures surface as signals, not surprises.

## Quick start

```
Prerequisites: Running service from go-wolf or go-raven pipeline

User: "We have no idea what's happening in production."
→ invoke go-crane
→ audit signals → instrument → alert → dashboard → OBSERVABILITY.md
```

## Workflow

### 1. Audit existing signals

Before adding anything, map what already exists:

- [ ] Is there any logging? Format (plain text / JSON / structured)?
- [ ] Are there metrics endpoints (`/metrics`, StatsD, CloudWatch)?
- [ ] Is there tracing (Jaeger, Zipkin, OTLP)?
- [ ] Are health endpoints present (`/health`, `/ready`, `/live`)?
- [ ] Is there an alerting system (PagerDuty, Alertmanager, Grafana)?

Record findings in `OBSERVABILITY.md` under `## Current State`. Do not instrument what already works.

### 2. Define the signal inventory

Establish what must be observable before instrumentation begins:

- [ ] **Logs:** which events are worth logging? At what level? What fields are mandatory (trace_id, service, env, user_id if applicable)?
- [ ] **Metrics:** which RED signals apply (Rate, Errors, Duration)? Which USE signals (Utilization, Saturation, Errors) for infra?
- [ ] **Traces:** which request paths need end-to-end tracing? Where are the service boundaries?
- [ ] **Health:** what constitutes "ready" vs "live"? What dependencies must be reachable?

Write the signal inventory to `OBSERVABILITY.md` under `## Signal Inventory`. This document is the contract — do not instrument signals not listed here.

### 3. Implement structured logging

- Add a logging library appropriate to the stack (e.g., `pino`, `zerolog`, `structlog`, `slog`).
- Every log line must include: `timestamp`, `level`, `service`, `env`, `trace_id`, `message`.
- Remove or replace `console.log`, `fmt.Println`, `print()` calls with structured equivalents.
- Do not log secrets, PII, or full request bodies. Mask or omit sensitive fields.
- Correlation ID must be propagated through all async calls and service hops.

### 4. Implement metrics

- Instrument the four golden signals where applicable: latency, traffic, errors, saturation.
- Expose a `/metrics` endpoint (Prometheus format) or push to the configured collector.
- Add counters, histograms, and gauges only for signals defined in Step 2.
- Label metrics with `service`, `env`, `version`. Never use high-cardinality labels (user ID, request ID).

### 5. Implement distributed tracing

- Instrument entry points (HTTP handlers, queue consumers, cron jobs) with span creation.
- Propagate trace context via headers (W3C TraceContext or B3) across service calls.
- Add span attributes for: HTTP method, route, status code, DB query (without parameters), external service name.
- Do not trace internal utility functions — only I/O boundaries and business-critical paths.

### 6. Add health endpoints

Implement three endpoints if the framework supports it:

| Endpoint | Returns healthy when |
|----------|----------------------|
| `/health` | Process is running |
| `/ready` | All dependencies (DB, cache, queue) are reachable |
| `/live` | Process is not deadlocked or in degraded state |

Return `200` for healthy, `503` for unhealthy. Include dependency status in the response body.

### 7. Write alerting rules

Define at minimum:

- [ ] Error rate alert: fires when error rate exceeds threshold for N minutes
- [ ] Latency alert: fires when p95 exceeds SLO for N minutes
- [ ] Availability alert: fires when health endpoint fails for N minutes
- [ ] Saturation alert: fires when resource usage exceeds safe threshold

Each alert must reference a runbook section in `OBSERVABILITY.md` — no alert fires without a documented response.

### 8. Produce OBSERVABILITY.md

Final document must include:

- `## Current State` — what existed before go-crane ran
- `## Signal Inventory` — all signals, their sources, retention policy
- `## Alert Thresholds` — each alert, its threshold, severity, and runbook link
- `## Runbooks` — one section per alert: symptoms, likely causes, remediation steps
- `## Dashboard` — link to dashboard or instructions to provision it

## Rules

- Do not add logging, metrics, or tracing not listed in the signal inventory. Observability scope creep is a maintenance liability.
- Do not log PII, secrets, passwords, tokens, or full payloads. go-bear will flag this as a finding.
- Do not create alerts without runbooks. An alert with no response plan causes on-call fatigue.
- Do not instrument internal functions. Instrument I/O boundaries: HTTP, DB, queue, external APIs.
- Every alert threshold must be derived from a measured or agreed SLO — not from a guess.

## Output

- `OBSERVABILITY.md` — signal inventory, alert thresholds, runbooks, dashboard reference
- Structured logging implementation wired into the application
- Metrics endpoint or push configuration
- Tracing instrumentation at I/O boundaries
- Health endpoints (`/health`, `/ready`, `/live`)
- Alerting rules in the format required by the monitoring stack

## Position in the pack

```
... → go-raven → [go-crane] → go-owl
                      ↑
              also invokable after go-wolf,
              before go-bear pre-release review
```

go-crane feeds go-owl (runbooks become documentation) and go-bear (observability gaps are a security finding). go-kite audits observability health in existing systems — go-crane implements it from scratch.
