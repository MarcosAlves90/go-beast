# Agent Knowledge Bases — Research Findings

> Research date: 2026-09-13
> Scope: durable, agent-specific knowledge bases for software development and reference work

## Conclusion

The useful unit is not a folder of notes. It is a small, inspectable knowledge
system with a stable semantic model, explicit provenance, bounded retrieval,
and a checked reference graph. Markdown, JSON, and TOON should be projections
of the same model rather than three unrelated authoring systems.

## Evidence from primary sources

### Long-running agent context

- Anthropic's long-running-agent work reports that sessions begin without the
  previous session's memory and uses durable progress files, a feature list,
  incremental work, and clean handoff artifacts to prevent premature completion
  and undocumented progress. See [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).
- Anthropic's memory guidance describes memory as path-addressed text files
  that are read and written on demand, keeping active context focused instead
  of loading the entire store up front. It also describes immutable versions as
  an audit and recovery mechanism. See [Using agent memory](https://platform.claude.com/docs/en/managed-agents/memory) and the [memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool).
- Anthropic documents context as working memory and warns that larger context
  does not automatically improve results; curation matters because accuracy
  and recall can degrade as context grows. See [Context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows).
- OpenAI recommends adding only relevant external context through retrieval,
  and recommends Markdown/XML boundaries to distinguish supporting documents
  and metadata. See [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering).
- Anthropic's tool-use guidance says that structured, guaranteed-shape output
  belongs in a tool schema rather than being recovered by regex from free-form
  text. See [How tool use works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works).

### Links and metadata

- Obsidian supports both wikilinks and URL-encoded Markdown links, folder-rooted
  paths, heading links, and block links. It can update internal links when a
  file is renamed, but block references are Obsidian-specific and are not
  standard Markdown. See [Internal links](https://obsidian.md/help/Linking%2Bnotes%2Band%2Bfiles/Internal%2Blinks).
- Obsidian properties are YAML frontmatter with typed values such as text,
  links, dates, numbers, lists, and checkboxes. Properties are intended to be
  small atomic values; nested properties and Markdown in properties are not
  fully supported. See [Properties](https://obsidian.md/help/Editing%2Band%2Bformatting/Properties).
- Obsidian's Backlinks view demonstrates the value of a reverse reference
  index, but it is a view over links rather than proof that every link resolves.
  See [Backlinks](https://obsidian.md/help/Plugins/Backlinks).

### Machine-readable formats

- JSON Schema 2020-12 is the current published JSON Schema specification and
  separates core vocabulary from validation vocabulary. It is an appropriate
  contract for the canonical JSON representation and its metadata. See
  [JSON Schema specification](https://json-schema.org/specification).
- TOON is a line-oriented, indentation-based encoding of the JSON data model.
  Its current official specification is a working draft that defines canonical
  encoding, array counts, tabular fields, strict-mode validation, and a declared
  specification version. See the [TOON specification](https://github.com/toon-format/spec/blob/main/SPEC.md).
- The TOON specification requires strict validation of structural details such
  as indentation, delimiter consistency, declared counts, and trailing content;
  therefore a KB controller must not treat a permissive parse as conformance.

## Design implications

1. Keep a small canonical record model containing identity, title, kind,
   summary, status, tags, content, references, provenance, and timestamps.
2. Store each record as one file and maintain an explicit manifest/index for
   paths, IDs, aliases, outgoing references, backlinks, and checksums.
3. Make references portable: use stable record IDs plus relative paths and
   optional heading anchors. Use Obsidian wikilinks only in the Obsidian MD
   projection; use standard Markdown links in normal MD.
4. Require provenance and epistemic status (`fact`, `decision`, `hypothesis`,
   `procedure`, or `reference`) so an agent can distinguish evidence from
   inference and stale notes.
5. Make the root `INDEX`/MOC a navigation and retrieval guide, not a dump of
   every note. Retrieval should return a compact context packet with selected
   records, paths, reasons, and unresolved-link warnings.
6. Define JSON Schema for JSON, a deterministic frontmatter/body profile for
   MD, and TOON 4.x strict-mode output for TOON. All three must validate to the
   same semantic model and round-trip without silently dropping fields.
7. Separate lifecycle operations: `init`, `add`, `update`, `link`, `search`,
   `context`, `validate`, `status`, `archive`, and `export`. Mutations must be
   explicit, idempotent, atomic, and limited to the selected KB root.
8. Treat retrieval as just-in-time. Prefer a small task-specific context packet
   over injecting the entire KB, and always include source paths and confidence
   with retrieved claims.

## Limits and open evidence

- The cited model documentation supports curation, external memory, structured
  context, and validation patterns; it does not prove that one KB layout is
  optimal for every model or task.
- TOON is still a working draft, so the controller must record its target TOON
  specification version and make conversion failures visible.
- No token-count or answer-quality benchmark was run in this repository yet.
  The implementation should provide deterministic fixtures and leave model
  quality measurement as a separate evaluation slice.
