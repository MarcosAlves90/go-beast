---
name: go-ant
version: 1.0.0
description: Profiles a running system to find real performance bottlenecks, establishes baseline measurements, applies targeted optimizations (query tuning, cache strategy, bundle reduction, async patterns), and validates improvement with before/after benchmarks. Produces PERF.md with evidence-backed findings and applied changes.
when_to_use: Use when there is a proven performance problem — slow endpoint, high memory, large bundle, degraded throughput — measured with real data. Invoke after go-crane (metrics show the problem) or after go-eagle (load tests reveal bottlenecks). Never invoke speculatively.
---

# go-ant — Performance Profiling & Optimization

go-ant carries weight far beyond its size. It does not optimize speculatively — it profiles first, proves the problem, then removes exactly what is slow.

## Quick start

```
Prerequisite: a measured performance problem (p95 > SLO, bundle > threshold, query > N ms)

User: "The /orders endpoint is timing out under load."
→ invoke go-ant
→ establish baseline → profile → identify bottleneck → apply fix → benchmark → PERF.md
```

## Workflow

### 1. Establish baseline

Before touching any code, record current performance:

- [ ] Identify the symptom: which endpoint, query, page, or operation is slow?
- [ ] Record the baseline metric: p50, p95, p99 latency — or bundle size, memory, CPU, throughput — as appropriate
- [ ] Identify the SLO or threshold being violated (if none exists, define one before proceeding)
- [ ] Confirm the problem is reproducible in a stable environment (not a one-off spike)

Write findings to `PERF.md` under `## Baseline`. Do not proceed without a numeric baseline. "It feels slow" is not a baseline.

### 2. Profile — find the bottleneck

Use the appropriate profiler for the stack. Do not guess:

**Backend (Node.js):** `clinic.js`, `0x`, `node --prof`, or `autocannon` for load profiling
**Backend (Go):** `pprof` CPU and heap profiles, `go test -bench`, `go tool trace`
**Backend (Python):** `cProfile`, `py-spy`, `line_profiler`
**Database:** `EXPLAIN ANALYZE` (Postgres), `SHOW PROFILE` (MySQL), slow query log
**Frontend — runtime:** Chrome DevTools Performance tab, React Profiler, Lighthouse
**Frontend — bundle:** `webpack-bundle-analyzer`, `vite-plugin-visualizer`, `source-map-explorer`
**Frontend — network:** Lighthouse, WebPageTest, Core Web Vitals

- [ ] Run the profiler. Capture output as a file or screenshot.
- [ ] Identify the top 3 consumers of time, memory, or bytes
- [ ] Confirm the bottleneck is in application code — not in infra, network, or load generator noise

Record profiler findings in `PERF.md` under `## Profiler Output`. Attach or link the profile file.

### 3. Diagnose the root cause

For each bottleneck found, determine *why* it is slow:

- **N+1 query:** loop executing one query per record — fix with JOIN or batch load
- **Missing index:** sequential scan on large table — fix with targeted index
- **Synchronous I/O in hot path:** blocking call where async would work — fix with async/await or queue
- **Redundant computation:** same value computed repeatedly — fix with memoization or cache
- **Over-fetching:** returning more data than the client uses — fix with field selection or pagination
- **Large bundle:** importing full library when only one function is used — fix with tree shaking or dynamic import
- **Layout thrash:** DOM reads/writes interleaved — fix with batched DOM updates
- **Memory leak:** objects retained past their lifetime — fix with cleanup or WeakRef

- [ ] Write one sentence per bottleneck: "X is slow because Y."
- [ ] Confirm the fix addresses the root cause, not the symptom

Record diagnoses in `PERF.md` under `## Root Cause`.

### 4. Apply the fix

Implement the smallest change that resolves the bottleneck:

- [ ] One fix per bottleneck. Do not bundle unrelated changes.
- [ ] Do not refactor surrounding code. Performance fix only.
- [ ] Do not add caching as a first resort — fix the underlying inefficiency first. Cache only when the computation is provably expensive and idempotent.
- [ ] If the fix changes a database query, run `EXPLAIN ANALYZE` before and after to confirm the plan changed.
- [ ] If the fix changes a bundle, verify tree shaking or code splitting took effect with the bundle analyzer.

### 5. Benchmark — validate the improvement

Re-run the same measurement used in Step 1:

- [ ] Record the new p50/p95/p99 (or size, memory, throughput) under identical conditions
- [ ] Confirm the metric now meets or beats the SLO defined in Step 1
- [ ] Confirm no regression in correctness (run existing test suite)
- [ ] If the improvement is less than 20% over baseline, question whether the fix addressed the actual bottleneck

Write results to `PERF.md` under `## Benchmark Results` as a before/after table:

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| p95 latency | 1200ms | 320ms | -73% |

### 6. Produce PERF.md

Final document must include:

- `## Baseline` — the original measured problem with numeric value
- `## Profiler Output` — raw profiler data or link to file
- `## Root Cause` — one-sentence diagnosis per bottleneck
- `## Changes Applied` — list of code changes made, with rationale
- `## Benchmark Results` — before/after table
- `## Remaining Work` — bottlenecks identified but not yet fixed, with estimated impact

## Rules

- Do not invoke go-ant without a numeric baseline. Speculative optimization is prohibited.
- Do not apply more than one fix at a time. Measure after each change, or you cannot attribute the improvement.
- Do not cache before fixing the underlying inefficiency. Caching a broken implementation hides the problem.
- Do not refactor surrounding code during a performance fix. go-ant does one thing: remove the bottleneck.
- If the profiler shows the bottleneck is in infra or a third-party service, stop. Document the finding in PERF.md and escalate — go-ant does not fix what it does not own.

## Output

- `PERF.md` — baseline, profiler output, root cause diagnoses, changes applied, benchmark results, remaining work
- Profile artifacts — saved profiler output files (flamegraph, heap snapshot, bundle report)
- Before/after benchmark table confirming SLO is met

## Position in the pack

```
... → go-crane → [go-ant] → go-owl
           ↑
   also invokable after go-eagle (load tests reveal bottleneck)
   or standalone when a specific slow operation is already known
```

go-crane provides the metrics that surface the problem. go-ant fixes it. go-owl documents the changes in runbooks and changelogs. go-bear should review any caching or async patterns introduced by go-ant for security implications.
