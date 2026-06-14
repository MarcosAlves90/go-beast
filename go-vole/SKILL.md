---
name: go-vole
version: 1.3.0
description: "Designs and maintains Obsidian vaults — folder structure, naming conventions, wikilink strategy, plugin configuration (Dataview, Templater, Tasks, Kanban, etc.), note templates, and MOC (Map of Content) architecture. Produces a vault specification document, template files, and plugin config recommendations ready to apply."
when_to_use: "Use when setting up a new Obsidian vault, restructuring an existing one, configuring plugins, designing a PKM system, or integrating Obsidian notes into a project workflow. Invoke on demand — not bound to a phase. go-owl may hand off documentation tasks that benefit from a structured knowledge base."
---

# go-vole — Obsidian Vault Design & Maintenance

go-vole builds the underground network. It designs knowledge structures, configures tools, and keeps notes findable and interconnected. Its discipline: every note serves a purpose and every connection is intentional.

## Quick start

```
User: "Set up an Obsidian vault for my software projects."
→ invoke go-vole
→ audit vault purpose → design structure → configure plugins → write templates → produce VAULT.md
```

## Workflow

### 1. Audit vault purpose and scope

Before touching structure, answer:

- [ ] What is the primary use case? (project notes / research / journaling / reference library / mixed)
- [ ] Who consumes this vault? (solo / team)
- [ ] What is the note volume? (< 100 / 100–1000 / > 1000)
- [ ] Are there existing notes to migrate or a clean start?
- [ ] Which plugins are already installed?

Record answers in a short **VAULT AUDIT** block at the start of the output:

```
## VAULT AUDIT
Purpose:  <primary use case>
Scope:    <solo | team>
Volume:   <estimated note count>
State:    <new vault | existing vault — N notes>
Plugins:  <installed | none>
```

### 2. Design the folder structure

Choose the folder strategy based on vault purpose:

| Strategy | Use when | Structure |
|----------|----------|-----------|
| **PARA** | Project-heavy work | `Projects/` `Areas/` `Resources/` `Archive/` |
| **Zettelkasten** | Research and ideas | `Fleeting/` `Literature/` `Permanent/` `Maps/` |
| **Flat + MOCs** | Large reference library | No folders; navigation via MOC notes |
| **Hybrid** | Mixed use (most common) | `Projects/` `Notes/` `Templates/` `Assets/` |

Rules for folder design:
- [ ] Maximum 3 folder levels deep — deeper hierarchies rot
- [ ] Every folder must have a clear inclusion rule (what goes here and why)
- [ ] `Templates/` and `Assets/` are always separate — never mix content with structure files
- [ ] Inbox folder (`00-Inbox/` or `_Inbox/`) for unprocessed captures

**Migration note (existing vaults only):** when moving notes into a new folder structure, wikilinks break if the note's filename changes. Obsidian's built-in "Update links" auto-updates links when files are moved inside the vault — but only if the move is done inside Obsidian (not via the OS file manager). For bulk migrations, recommend:
1. Move files inside Obsidian (drag-and-drop in file explorer) — links auto-update
2. For renames, use Obsidian's rename command — linked notes update automatically
3. After migration, run a broken-links check: Obsidian's Graph view shows orphaned nodes; or use the community plugin "Find unresolved links"

Output a **STRUCTURE** block:

```
## STRUCTURE
<vault-root>/
├── 00-Inbox/
├── Projects/
│   └── <project-name>/
├── Notes/
├── Templates/
└── Assets/
```

### 3. Define naming conventions

Every vault needs exactly one naming convention — never mix styles:

| Convention | Pattern | Best for |
|-----------|---------|----------|
| Title Case | `My Project Notes.md` | Human-first vaults |
| kebab-case | `my-project-notes.md` | Developer vaults, version control |
| Date-prefix | `2026-06-13 Meeting Notes.md` | Journals, dailies |
| ID-prefix | `202606131423 Meeting Notes.md` | Zettelkasten |

Rules:
- [ ] Pick one and document it — no exceptions for "special" notes
- [ ] Never use special characters (`/`, `:`, `?`, `*`, `|`, `<`, `>`, `\`, `"`)
- [ ] Decide: spaces or hyphens? Pick one.

Output a **NAMING** block documenting the chosen convention with examples.

### 4. Design the link and MOC strategy

Links are the vault's connective tissue:

- [ ] Decide wikilink style: `[[Note Title]]` or `[[note-title|Display Name]]`
- [ ] Define when to link: always / only when relevant / only from MOCs
- [ ] Define MOC (Map of Content) notes: one per domain area, lists related notes with context
- [ ] Define tags vs links: use tags for status/type (`#status/active`, `#type/reference`); use links for conceptual connections

Output a **LINKING** block with the strategy and an example MOC skeleton:

```markdown
## LINKING
Style:    [[Title]] wikilinks, aliased as [[Title|alias]] when display differs
When:     Link on first mention of a concept that has its own note
Tags:     #status/(active|archived|draft) | #type/(reference|project|person|concept)
MOC:      One MOC note per domain; listed under Maps/

### Example MOC skeleton
# <Domain> MOC
## Active
- [[Note A]] — one-line context
- [[Note B]] — one-line context
## Reference
- [[Note C]]
```

### 5. Configure plugins

For each plugin in scope, produce a concrete configuration recommendation:

#### Dataview
```yaml
# .obsidian/plugins/dataview/data.json key settings
"renderNullAs": "-"
"warnOnMissingFields": false
"inlineQueriesEnabled": true
```
Provide at least one working Dataview query matching the vault's use case.

#### Templater
- [ ] Enable "Trigger Templater on new file creation"
- [ ] Set template folder to `Templates/`
- [ ] Produce at least one `tp.*` template per note type defined in step 6

#### Tasks
```
# Global task filter (recommended)
not done
```
Define which folders are scanned for tasks.

#### Obsidian Publish
Obsidian Publish does **not** use frontmatter fields to control publication state. There is no `published: true/false` frontmatter key — the plugin manages publication state internally via its own UI. Do not recommend frontmatter-based publication control. Instead, document:
- Which folders are included/excluded from publish (configured in the Publish plugin UI)
- Recommended folder exclusions: `00-Inbox/`, `Templates/`, any private notes folder
- Note: inclusion/exclusion is set per-note or per-folder in the Publish plugin, not via config files

#### Other plugins
For each additional plugin requested, document: purpose, key settings, and a usage example.

### 6. Write note templates

Produce a template file for each primary note type in the vault:

**Minimum templates for any vault:**
- `Templates/Daily Note.md` — date, tasks, notes
- `Templates/Project Note.md` — status, goal, links, tasks
- `Templates/Reference Note.md` — source, summary, key points, links

**Additional templates based on vault purpose (produce all that apply):**
- Engineering vault: `Templates/ADR.md` (Architecture Decision Record — context, decision, consequences, status)
- Engineering vault: `Templates/Meeting Note.md` — date, attendees, decisions, action items
- Engineering vault: `Templates/Incident Post-Mortem.md` — timeline, root cause, action items, severity
- Research vault: `Templates/Literature Note.md` — citation, key claims, own notes
- All vaults with people: `Templates/Person Note.md` — role, contact, meeting history

Each template must:
- Use Templater syntax if Templater is installed, YAML frontmatter otherwise
- Include a `created` field: `<% tp.date.now("YYYY-MM-DD") %>`
- Include at least one link placeholder

**Correct Templater variable usage:**
- Date: `<% tp.date.now("YYYY-MM-DD") %>`
- User-prompted value (e.g., project name, slug): `<% tp.system.prompt("Project name") %>`
- File title: `<% tp.file.title %>`
- Cursor jump position: `<% tp.file.cursor() %>` — use sparingly, only for edit-mode jump points
- **Never use `tp.file.cursor()` as a variable** — it is a positional marker, not a string value. Use `tp.system.prompt()` for user-input fields and `tp.file.title` for the note name.
- **Capture user-input once, reuse via variable**: if the same value (e.g., ADR number) appears multiple times in a template, capture it once: `<% const adr_num = await tp.system.prompt("ADR number") %>` then reuse `<%= adr_num %>`. Never call `tp.system.prompt()` twice for the same value — it prompts the user twice.
- **Frontmatter vs body — avoid duplication**: if a field is defined in YAML frontmatter (e.g., `status: proposed`), do not repeat it as a markdown heading or prose line in the body. Use Dataview to query frontmatter fields; use the body for human-readable narrative only.

### 7. Produce VAULT.md

Write the vault specification document at the vault root as `VAULT.md`. Write it as a plain Markdown document — **do not wrap it in a fenced code block** inside the output. Fenced code blocks inside VAULT.md content (e.g., for folder trees) must use indented code blocks (4 spaces) or be omitted to avoid nested fence conflicts.

Required sections:

**# \<Vault Name\> — Vault Specification**

**## Purpose** — one paragraph describing the vault's primary use case and audience.

**## Structure** — folder tree using indented plain text (not a fenced block), with one-line inclusion rule per folder.

**## Naming Convention** — the chosen convention, rules, and 3–5 examples.

**## Linking Strategy** — wikilink style, when to link, tag taxonomy.

**## Plugins** — installed plugins, their purpose, and key settings.

**## Templates** — list of template files with their use case.

**## Maintenance** — weekly/monthly process: inbox processing, archiving, MOC review.

## Rules

- Never design a vault structure without first documenting its purpose in the VAULT AUDIT block. Structure without purpose produces folders nobody uses.
- Maximum 3 folder levels. If a design requires a 4th level, flatten it with better naming or MOC notes instead.
- Every template must be immediately usable — no placeholder-only files. A template with only `# Title` is not a template.
- Do not recommend more than 5 plugins unless the user explicitly requests a specific plugin. Plugin sprawl degrades vault performance and discoverability.
- VAULT.md lives at the vault root and is the single source of truth for vault conventions. Any convention not in VAULT.md does not officially exist.
- For team vaults, always include a git/versioning strategy in VAULT.md: recommend a `.gitignore` that excludes `.obsidian/workspace.json` (personal UI state) and any private-notes folder; recommend committing `.obsidian/plugins/` and `.obsidian/community-plugins.json` so all team members get the same plugin set.

## Output

- **VAULT AUDIT** block — purpose, scope, volume, state, plugins
- **STRUCTURE** block — folder tree with inclusion rules
- **NAMING** block — chosen convention with examples
- **LINKING** block — wikilink strategy and example MOC skeleton
- `VAULT.md` — complete vault specification document (vault root)
- Template files — one `.md` per primary note type (in `Templates/` folder)
- Plugin configuration recommendations — settings and usage examples per plugin

## Position in the pack

```
(any phase) → go-vole → go-owl
```

go-vole is a meta-skill invoked on demand. It does not depend on preceding beasts — it can be called at any point when Obsidian vault design or maintenance is needed. go-owl may hand off to go-vole when project documentation is better maintained as a knowledge base than as static docs.
