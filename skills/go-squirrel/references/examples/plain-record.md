---
kind: record
schema_version: 1.0
id: deployment-fact
title: Deployments have immutable versions
record_type: fact
status: active
audience: agent
summary: Every deployment publishes an immutable version identifier.
content: Every deployment publishes an immutable version identifier.
tags: [deployment]
aliases: []
references: []
sources: [release-process.md]
epistemic_status: observed
confidence: 0.9
priority: high
retrieval_hints: [deployment, version, release]
created_at: 2026-09-13T10:00:00Z
updated_at: 2026-09-13T10:00:00Z
verified_at: 2026-09-13T10:00:00Z
provenance:
  - origin: import
    actor: release-tool
    source: release-process.md
    captured_at: 2026-09-13T10:00:00Z
    note: Imported from the release procedure.
history: []
---

## Content

Every deployment publishes an immutable version identifier.
