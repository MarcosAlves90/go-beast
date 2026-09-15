---
name: go-squirrel
version: 1.1.0
description: "Creates and maintains portable, agent-first knowledge bases for durable project context, decisions, procedures, references, and bounded task context across Markdown, JSON, and TOON projections, with a deterministic native Markdown authoring path."
when_to_use: "Use when an AI agent needs durable context that must survive sessions, remain searchable, preserve provenance, and be portable across harnesses. Invoke after go-mole or go-hawk when a knowledge base is needed; invoke go-vole instead for an Obsidian vault or PKM system as the primary goal."
---

# go-squirrel — Agent Knowledge Base

go-squirrel turns durable knowledge into a small, linked, provenance-aware file tree that an agent can retrieve just in time. It is agent-agnostic: the files are portable, while the agent's existing filesystem and search tools perform the operations.

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-squirrel`
- **Alias:** `knowledge-base` (documentation only)
- **Phase:** knowledge
- **When to use:** Durable agent context or future reference needs a searchable source of truth
- **Prerequisites:** Project or research context
- **Input artifacts:** Project context or source material
- **Output artifacts:** KB_SPEC.md; INDEX.<ext>; MANIFEST.<ext>; records/<id>.<ext>; CONTEXT_PACKET.<ext>; KB_VALIDATION.md
- **Gates:** One semantic model; explicit provenance; resolved references; bounded retrieval context
- **Dependencies:** go-mole or go-hawk
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

## Quick start

```
User: "Keep the architecture decisions and operating facts available to future agents."
→ invoke go-squirrel
→ choose one format and Markdown style → initialize the KB → write linked records
→ validate references and provenance → emit a bounded CONTEXT_PACKET for the next task
```

Read [references/KB_STANDARD.md](references/KB_STANDARD.md) before creating files. Use [references/kb-record.schema.json](references/kb-record.schema.json) for JSON validation and as the semantic contract for conversions.

## Native execution protocol

For `md:plain` or `md:obsidian`, resolve the directory containing this `SKILL.md` as `SKILL_DIR` and invoke the bundled helper directly from a normal terminal. Do not paste Markdown fences into JavaScript source or require an ad hoc wrapper to create the first artifacts.

```bash
node "$SKILL_DIR/scripts/kb-tool.mjs" init --root "$KB_ROOT" --kb-id "<kebab-case-id>" --title "<title>" --purpose "<purpose>" --format md:plain
node "$SKILL_DIR/scripts/kb-tool.mjs" add --root "$KB_ROOT" --record-file "/path/to/record.json"
node "$SKILL_DIR/scripts/kb-tool.mjs" manifest --root "$KB_ROOT"
node "$SKILL_DIR/scripts/kb-tool.mjs" context --root "$KB_ROOT" --task "<task>" --records "<id>,<id>" --max-records 8
node "$SKILL_DIR/scripts/kb-tool.mjs" validate --root "$KB_ROOT"
```

Use the generated `templates/record.json` as the input template and edit it with the host's native file editor. The helper is intentionally limited to deterministic Markdown projections; use the standard's format-specific rules for JSON or TOON output.

## Workflow

### 1. Scope the memory

- State the KB purpose, audience, retention horizon, and source boundary.
- Separate facts, decisions, hypotheses, procedures, references, sessions, tasks, and concepts.
- Decide what must never be stored; do not put secrets, credentials, or personal data in the KB by default.
- Record the scope and safety boundary in `KB_SPEC.md`.

### 2. Select one representation

Choose exactly one canonical file representation for a KB: `md:plain`, `md:obsidian`, `json`, or `toon`. Keep the semantic fields identical across projections; never make a format conversion a content rewrite. Use `md:obsidian` only when Obsidian navigation is an explicit requirement.

### 3. Initialize the tree

Create `KB_SPEC.md`, the selected-format `INDEX.<ext>` and `MANIFEST.<ext>`, `records/`, `templates/`, and optional `contexts/` and `sources/` directories. For Markdown, use `scripts/kb-tool.mjs init` so the required tree is created without overwriting existing files. Give every record a stable kebab-case `id`; keep generated manifest data deterministic.

### 4. Author records

Use the common record envelope: identity, `record_type`, lifecycle `status`, audience, short `summary`, content, tags, local `references`, external or source `sources`, epistemic status, confidence, retrieval hints, timestamps, and provenance. Start from `templates/record.json`, edit it with a native file tool, and run `scripts/kb-tool.mjs add` for a Markdown KB. Put evidence near the claim. Mark uncertainty instead of laundering an inference into a fact.

### 5. Connect and control

Use `add` to create a record, `update` to revise it without erasing history, `link` to add a typed local edge, `archive` to make a record inactive but recoverable, and `export` or `convert` only after validating semantic equivalence. Every local reference must resolve within the KB root. Maintain both forward references and a generated reverse-link/backlink view in `MANIFEST.<ext>` or a report.

### 6. Retrieve task context

Start at `INDEX.<ext>`, search by terms/tags/status, traverse only relevant graph edges, and prefer recent, high-confidence records. For Markdown, use `scripts/kb-tool.mjs context` with explicit record IDs or a bounded query. Produce `CONTEXT_PACKET.<ext>` with the task, scope, budget, selected records and reasons, unresolved or conflicting claims, and next reads/actions. Keep the packet bounded; do not dump the whole KB into a prompt.

When the task is entering a declared v2 workflow phase, use the package-level
`go-beast context compile` command to turn this retrieval into a
`context_packet`. It adds workflow and phase identity, record digests,
validation evidence, and machine-readable provenance. Use `go-beast context
verify` before relying on a saved packet; recompile when a selected record or
the KB validation report changes.

### 7. Validate and maintain

Run `validate` after initialization, import, conversion, and material updates. For Markdown, invoke `scripts/kb-tool.mjs validate` and retain its `KB_VALIDATION.md`. Check syntax, schema fields, duplicate IDs, safe paths, index and manifest consistency, unresolved references, orphan warnings, stale records, provenance, and deterministic output. Write `KB_VALIDATION.md` with the command or method, timestamp, checks, findings, and limitations.

## Rules

- One KB has one canonical representation; projections must preserve the same record meaning and stable IDs.
- Treat unverified agent output as a hypothesis or draft until a source or human review supports it.
- Keep local graph edges explicit and resolvable; an unresolved reference is a validation error, not a search feature.
- Keep retrieval task-specific and bounded; prefer path-addressed, just-in-time reads over full-tree prompt injection.
- Use flat, portable Markdown frontmatter; Obsidian wikilinks are navigation sugar, never the sole portable reference.
- Preserve provenance and history on update; archive is reversible, while deletion requires explicit authorization.
- Never store secrets or silently copy sensitive source material into a KB.
- Use the bundled native helper for first-run Markdown authoring; never make successful KB creation depend on an inline JavaScript wrapper or an unreported host-specific operation.

## Output

- `KB_SPEC.md` — purpose, scope, format, layout, field, link, safety, and maintenance contract
- `INDEX.<ext>` — concise human- and agent-oriented entry point
- `MANIFEST.<ext>` — deterministic machine index, graph edges, checksums, and backlink data
- `records/<id>.<ext>` — linked durable records using the common semantic envelope
- `CONTEXT_PACKET.<ext>` — bounded task-specific retrieval context when requested
- v2 phase context packet — hash-verifiable workflow handoff produced by
  `go-beast context compile`, with a finalized completion record when the phase
  is complete
- `KB_VALIDATION.md` — validation evidence, warnings, and remaining limitations
- Native execution protocol — copy-safe commands and `scripts/kb-tool.mjs` for deterministic Markdown initialization, authoring, retrieval, and validation
- Change report — records added, updated, linked, archived, or converted

## Position in pack

```
go-mole or go-hawk → go-squirrel → go-lark, go-fox, go-owl, or future sessions
                         └─ go-vole when the primary target is an Obsidian/PKM vault
```
