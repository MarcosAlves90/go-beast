# go-squirrel Knowledge Base Standard

Version: 1.0.0  
Status: normative for new go-squirrel KBs  
Canonical companion: `kb-record.schema.json`

This standard defines a portable file contract for knowledge bases made for AI
agents. It separates the semantic model from its Markdown, JSON, or TOON
projection so an agent can retrieve the same knowledge after a format change or
when it moves between harnesses.

## 1. Design goals

A compliant KB is:

- path-addressed and readable with ordinary filesystem and search tools;
- bounded at retrieval time rather than injected wholesale into a prompt;
- explicit about evidence, uncertainty, freshness, and provenance;
- connected by stable local IDs and relative paths;
- deterministic enough for an agent to validate and diff;
- portable across plain Markdown, Obsidian-flavoured Markdown, JSON, and TOON.

The standard does not require a daemon, vector database, hosted memory API, or
vendor-specific agent. Semantic or vector search may be added later, but it
must not replace the local index, graph, provenance, or validation contract.

## 2. Layout

The KB root contains the following files and directories:

```text
<kb-root>/
├── KB_SPEC.md
├── INDEX.<ext>
├── MANIFEST.<ext>
├── records/
│   └── <stable-id>.<ext>
├── templates/
│   └── record.<ext>
├── contexts/                 # optional saved CONTEXT_PACKET files
└── sources/                  # optional local source material, not records
```

`KB_SPEC.md` is always ordinary Markdown, even when the selected record format
is JSON or TOON. `<ext>` is `md`, `json`, or `toon`. A Markdown KB declares
`md_style: plain` or `md_style: obsidian` in `KB_SPEC.md` and `INDEX.md`.

The root must not contain credentials, tokens, private keys, or copied
confidential source material unless the user explicitly defines a protected
storage boundary outside this standard.

## 3. Common record envelope

Each record is a single file with these fields. JSON records must validate
against `kb-record.schema.json`; Markdown and TOON records must carry the same
values and satisfy the same invariants.

| Field | Required | Meaning |
|---|---:|---|
| `kind` | yes | `record` for a durable knowledge record |
| `schema_version` | yes | Semantic envelope version, currently `1.0` |
| `id` | yes | Stable kebab-case identifier; never derive identity from title |
| `title` | yes | Short display title |
| `record_type` | yes | `fact`, `decision`, `hypothesis`, `procedure`, `reference`, `session`, `task`, or `concept` |
| `status` | yes | `active`, `draft`, `stale`, `deprecated`, or `archived` |
| `audience` | yes | `agent`, `human`, or `both` |
| `summary` | yes | Retrieval-sized statement, normally no more than 500 characters |
| `content` | yes | The durable claim, procedure, or explanation |
| `tags` | yes | Normalized lowercase terms; an empty list is valid |
| `aliases` | yes | Alternate search names; an empty list is valid |
| `references` | yes | Local stable IDs or root-relative paths; an empty list is valid |
| `sources` | yes | URLs, source paths, issue IDs, or other provenance pointers |
| `epistemic_status` | yes | `observed`, `sourced`, `inferred`, `hypothesis`, `unknown`, or `disputed` |
| `confidence` | yes | Number from `0` to `1`; confidence is not truth |
| `priority` | yes | `low`, `normal`, `high`, or `critical` |
| `retrieval_hints` | yes | Terms or conditions that make the record useful |
| `created_at` | yes | RFC 3339 timestamp in UTC |
| `updated_at` | yes | RFC 3339 timestamp in UTC; never earlier than `created_at` |
| `verified_at` | yes | RFC 3339 timestamp or `null` |
| `provenance` | yes | One or more origin events; preserve it across updates |
| `history` | no | Append-only revision notes |

The `content` field is Markdown text in JSON and TOON projections. A record may
be detailed, but its `summary` must remain useful without reading the body.
Lists are intentionally explicit, not overloaded strings. Keep frontmatter
flat so Obsidian properties and non-Obsidian parsers see the same data.

### 3.1 Provenance and epistemic status

At least one provenance entry must identify how the record entered the KB. Use
`origin: human`, `agent`, `import`, `tool`, or `external`; include an actor or
source when available and a UTC `captured_at` timestamp. `sources` points to
the evidence location; `provenance` describes the capture event. If evidence
conflicts, keep both sources, set `epistemic_status: disputed`, lower
confidence as appropriate, and link a decision record explaining resolution.

### 3.2 Local graph edges

`references` is the portable graph edge. Each value is either a stable record
ID or a root-relative path such as `records/auth-decision.md`; absolute paths,
URLs, and paths escaping the KB root are invalid. A reference can point to a
record of any type, and cycles are allowed. Validators must report unresolved
references as errors and orphan records as warnings. Backlinks are generated
from forward references; they are not hand-authored as a second source of
truth.

## 4. Index and manifest

`INDEX.<ext>` is short enough to read at session start. It uses the same
selected format and contains:

```text
kind: index
schema_version: 1.0
kb_id: project-context
title: Project context
purpose: Durable context for agents maintaining the project.
format: md
md_style: plain
entry_points: [records/architecture.md, records/current-status.md]
record_ids: [architecture, current-status]
open_questions: ["Should the cache policy change after the next benchmark?"]
current_focus: Keep the deployment procedure and architecture decision aligned.
retrieval_guide: Start with current-status, then follow references for the task.
generated_at: 2026-09-13T10:00:00Z
```

For JSON and TOON, the values above are fields in one object. For Markdown,
use flat YAML frontmatter followed by a short human-readable guide. The index
is curated and may include entry points not present in every search result; it
must not become a content dump.

`MANIFEST.<ext>` is generated, not hand-edited. It contains `kind: manifest`,
`schema_version`, `kb_id`, `generated_at`, and a deterministically sorted
`records` list. Every item contains `id`, `path`, `title`, `record_type`,
`status`, `summary`, `references`, and a content checksum. It also contains
`unresolved_references`, `orphan_records`, and generated `backlinks`. A stable
sort by record ID, then path, makes changes reviewable. If a human needs a
curated relationship, store the forward edge in the record, not only in the
manifest.

## 5. Markdown projections

### 5.1 Plain Markdown

Use flat YAML frontmatter and predictable headings. Values in frontmatter must
be valid YAML scalars or lists; do not nest arbitrary objects. A portable body
uses ordinary relative Markdown links when a link is useful, but the
`references` field remains authoritative.

```markdown
---
kind: record
schema_version: 1.0
id: cache-decision
title: Use bounded cache invalidation
record_type: decision
status: active
audience: both
summary: Invalidate by deployment version rather than time alone.
content: Use the deployment version as the cache namespace.
tags: [architecture, caching]
aliases: [cache namespace]
references: [records/deployment-fact.md]
sources: [docs/architecture.md]
epistemic_status: sourced
confidence: 0.95
priority: high
retrieval_hints: [cache, invalidation, deployment]
created_at: 2026-09-13T10:00:00Z
updated_at: 2026-09-13T10:00:00Z
verified_at: 2026-09-13T10:00:00Z
provenance:
  - origin: human
    actor: maintainer
    source: docs/architecture.md
    captured_at: 2026-09-13T10:00:00Z
    note: Confirmed during architecture review.
history: []
---

## Content

Use the deployment version as the cache namespace.

## Evidence

See [deployment fact](records/deployment-fact.md).

## References

- [Deployment fact](records/deployment-fact.md)

## History

- 2026-09-13 — created from the architecture review.
```

### 5.2 Obsidian Markdown

Use the same flat frontmatter and semantic `references` as plain Markdown. Add
`[[records/deployment-fact|Deployment fact]]` wikilinks in the body for
Obsidian navigation. Wikilinks are a convenience projection: retain a
portable relative path in `references`, and never rely on a block reference
as the only graph edge. Avoid nested properties, inline fields, or plugins as
required data storage. If a vault moves outside Obsidian, the portable fields
must still be sufficient.

```markdown
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

## References

This fact is used by [[records/cache-decision|Use bounded cache invalidation]].
```

## 6. JSON projection

JSON is the preferred interchange format when a parser or API needs explicit
types. Store one record per file. Validate each record against the bundled
JSON Schema draft 2020-12 contract, then validate cross-file graph invariants
separately. JSON Schema validation alone cannot prove that a relative target
exists or that timestamps are ordered.

```json
{
  "kind": "record",
  "schema_version": "1.0",
  "id": "cache-decision",
  "title": "Use bounded cache invalidation",
  "record_type": "decision",
  "status": "active",
  "audience": "both",
  "summary": "Invalidate by deployment version rather than time alone.",
  "content": "Use the deployment version as the cache namespace.",
  "tags": ["architecture", "caching"],
  "aliases": ["cache namespace"],
  "references": ["records/deployment-fact.json"],
  "sources": ["docs/architecture.md"],
  "epistemic_status": "sourced",
  "confidence": 0.95,
  "priority": "high",
  "retrieval_hints": ["cache", "invalidation", "deployment"],
  "created_at": "2026-09-13T10:00:00Z",
  "updated_at": "2026-09-13T10:00:00Z",
  "verified_at": "2026-09-13T10:00:00Z",
  "provenance": [{
    "origin": "human",
    "actor": "maintainer",
    "source": "docs/architecture.md",
    "captured_at": "2026-09-13T10:00:00Z",
    "note": "Confirmed during architecture review."
  }],
  "history": []
}
```

## 7. TOON projection

TOON is useful when an agent or tool explicitly supports its compact,
indentation-based representation. Target and record the exact TOON spec
version used; this standard targets the 4.1 working draft. Use strict mode,
declared array counts, and declared object fields. A conversion must round-trip
all required fields without relying on implicit defaults.

```toon
toon_spec_version: 4.1
kind: record
schema_version: 1.0
id: cache-decision
title: Use bounded cache invalidation
record_type: decision
status: active
audience: both
summary: Invalidate by deployment version rather than time alone.
content: Use the deployment version as the cache namespace.
tags[2]: architecture,caching
aliases[1]: cache namespace
references[1]: records/deployment-fact.toon
sources[1]: docs/architecture.md
epistemic_status: sourced
confidence: 0.95
priority: high
retrieval_hints[3]: cache,invalidation,deployment
created_at: 2026-09-13T10:00:00Z
updated_at: 2026-09-13T10:00:00Z
verified_at: 2026-09-13T10:00:00Z
provenance[1]{origin,actor,source,captured_at,note}:
  human,maintainer,docs/architecture.md,2026-09-13T10:00:00Z,Confirmed during architecture review.
history[0]{version,changed_at,change,reason}:
```

The `toon_spec_version` field is pack metadata that makes the projection
auditable. It does not replace the KB `schema_version`. If a consumer supports
only an older or newer TOON dialect, convert through the semantic envelope and
re-run validation; do not edit delimiters by hand.

## 8. Operations and invariants

The agent may implement these operations with ordinary file and search tools,
an existing repository script, or a future adapter:

| Operation | Required behavior |
|---|---|
| `init` | Create the layout, `KB_SPEC.md`, index, manifest, and template without overwriting existing records |
| `add` | Allocate a unique stable ID, require provenance, update the manifest, and report sources |
| `update` | Preserve the ID, append history, update timestamps, and revalidate inbound/outbound links |
| `link` | Add a local forward edge, reject unsafe or missing targets, and regenerate backlinks |
| `search` | Search title, summary, content, tags, aliases, and hints; expose status and confidence |
| `context` | Select a bounded, ordered packet with reasons and unresolved/conflicting claims |
| `validate` | Run format, schema, path, graph, provenance, freshness, and deterministic-output checks |
| `status` | Report counts by type/status, stale records, orphan records, unresolved references, and last validation |
| `archive` | Set `status: archived`, preserve history and links, and make the operation reversible |
| `export`/`convert` | Project the same semantic records into another format and prove field-level equivalence |

Validation errors: duplicate IDs, duplicate paths, malformed format, missing
required fields, unsafe paths, unresolved references, invalid schema enums,
missing provenance, timestamps out of order, and a manifest that disagrees with
records. Warnings: orphans, stale verification, low confidence, deprecated
records still referenced, and an overlong summary or context packet.

## 9. Context packet contract

When an agent needs context for a task, save a packet when persistence or
review matters. The packet uses the selected KB format and contains:

```text
kind: context_packet
schema_version: 1.0
kb_id: project-context
task: Decide whether to change cache invalidation.
scope: Architecture and current deployment behavior.
budget: 4 records or 2500 tokens.
generated_at: 2026-09-13T10:00:00Z
records:
  - id: cache-decision
    path: records/cache-decision.md
    reason: Directly answers the decision under review.
    confidence: 0.95
    status: active
  - id: deployment-fact
    path: records/deployment-fact.md
    reason: Resolves the referenced deployment invariant.
    confidence: 0.9
    status: active
unresolved: []
conflicts: []
next_reads: [records/release-procedure.md]
next_actions: [Run the next deployment benchmark before changing the policy.]
```

The packet includes summaries and reasons before full bodies, caps the number
of records or tokens, and identifies what was not retrieved. It is a derived
view, not a second source of truth.

## 10. Conversion checklist

Before accepting a projection or import:

1. Parse every file in the selected format.
2. Validate each record against the semantic field contract.
3. Compare IDs, types, statuses, summaries, content, lists, timestamps, and provenance field by field.
4. Resolve every local reference from the KB root and regenerate backlinks.
5. Rebuild the deterministic manifest and compare checksums.
6. Record the format, dialect/spec version, command, timestamp, warnings, and limitations in `KB_VALIDATION.md`.
