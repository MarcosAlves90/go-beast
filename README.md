# go-beast

![go-beast banner](go-beast-banner.png)

> A versioned, agent-agnostic skill pack for AI-assisted software development.

go-beast gives coding agents a structured path from discovery to delivery.
Each `go-<animal>` skill owns one phase, states its prerequisites, and produces
concrete artifacts for the next phase. Skills are plain Markdown and work with
Claude Code, Codex, Copilot, Cursor, Gemini, and other agents.

**Version 2.0.0** · [Changelog](CHANGELOG.md)

## Start here

For the fastest installation, choose the path that matches your environment:

```bash
# From a checkout (interactive)
git clone <repo-url> <repo-dir>
node <repo-dir>/scripts/install.mjs

# From a checkout (non-interactive, install everything detected)
node <repo-dir>/scripts/install.mjs --all

# Without cloning the repository (interactive)
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MarcosAlves90/go-beast/main/scripts/install.sh)" -- --interactive

# Without cloning the repository (non-interactive, install everything detected)
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MarcosAlves90/go-beast/main/scripts/install.sh)" -- --all
```

Use `--bootstrap` with either installer to enable the stricter discovery-first
agent contract. `--interactive` shows the release and asset selection prompts;
`--all` selects the latest release and installs every detected asset without
prompts. See [Getting started](docs/GETTING_STARTED.md) for archive selection,
updates, uninstall, and agent-specific setup.

After installation, integrations can be managed independently per agent:

```bash
go-beast integration status --agent codex
go-beast integration disable --agent codex --kind skill --name go-bear
go-beast integration enable --agent codex --kind hook --name docs-update-remind.sh
go-beast integration sync --agent codex
go-beast integration export --agent codex --output ./codex-profile.json
go-beast integration import --agent codex --input ./codex-profile.json --dry-run
go-beast integration preset save minimal --agent codex
go-beast integration preset apply minimal --agent codex
go-beast doctor --agent codex --project . --session current --format json
```

Selections are persisted in `~/.go-beast/config.json`. Session-start sync
honors that profile, while unmanaged files and custom hook entries are left
untouched. Status reports desired state, installation ownership, dependency
gaps, conflicts, and blocked assets. Profiles can be exported/imported between
machines, and named presets capture an agent's skill and hook policy. Use
`--dry-run` to inspect a change before applying it.

The v2 doctor resolves the global v1-compatible profile, optional project
`.go-beast/profile.json`, and optional session
`.go-beast/sessions/<id>.json` in that order. It reports provenance,
capability gaps, conflicts, ownership, blocked assets, and exact reconciliation
mutations without writing files.

## What is included

- A lifecycle pipeline from discovery and architecture through testing, security,
  CI/CD, and documentation.
- Optional Claude Code, Codex, and Copilot CLI hooks and workflows.
- A plugin adapter under `plugins/go-beast/`; canonical skills remain under
  `skills/`.

| Knowledge need | Beast |
|---|---|
| Portable, provenance-aware agent knowledge bases in Markdown, JSON, or TOON | `go-squirrel` |
| Obsidian vault structure, PKM navigation, and vault plugins | `go-vole` |
| Agent instruction and memory files such as `AGENTS.md` or `CLAUDE.md` | `go-jay` |

Browse the [skill pipeline and catalog](docs/PIPELINE.md), or jump directly to
the [installation guide](docs/GETTING_STARTED.md), [validation contract](docs/TESTING.md),
[harness guide](docs/HARNESS.md), or [architecture index](docs/architecture/README.md).

The pipeline catalog also lists one semantic alias for every skill. Aliases are
documentation only; `go-*` names remain the official identifiers.

## Maintainer path

```bash
npm install
npm run verify
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing the pack. It covers
issues, pull requests, versioning, and the canonical validation flow.

## Documentation map

| Need | Document |
|---|---|
| Install, update, uninstall, or enable bootstrap | [Getting started](docs/GETTING_STARTED.md) |
| Understand beasts, hooks, and workflows | [Pipeline](docs/PIPELINE.md) |
| Run mandatory or live validation | [Testing](docs/TESTING.md) |
| Configure supported agent surfaces | [Harness guide](docs/HARNESS.md) |
| Read architecture decisions and protocols | [Architecture](docs/architecture/README.md) |
| Report or understand security issues | [Security policy](SECURITY.md) |
| Contribute, release, or open a PR | [Contributing](CONTRIBUTING.md) |

## Principles

1. One beast, one responsibility.
2. Prerequisites and outputs are explicit.
3. The canonical source is `skills/`; adapters are optional.
4. Security can interrupt any phase.
5. Repository content is written in English.

Use the manual [release-train workflow](docs/RELEASES.md) to calculate the
version, generate `CHANGELOG.md`, and open a release PR. After that PR is merged,
publish the prepared release from a clean checkout:

```bash
npm run release:version:check
npm run release:version:publish
```

Maintainer-facing transversal rules are defined in
[`go-beast.manifest.yaml`](go-beast.manifest.yaml). Generated instruction and
architecture surfaces are checked by `npm run verify`.

The manifest is a declarative orchestration contract for shared structural
facts. See [Declarative orchestration](docs/architecture/DECLARATIVE_ORCHESTRATION.md)
for its ownership boundary; operational skill instructions remain in each
`SKILL.md`.

An optional state-machine engine coordinates versioned pipeline manifests
without executing skills directly. Its artifact contracts support composable
validators for non-empty files, real Markdown headings, JSON Schema, supported
YAML, and bounded patterns. See [Workflow engine](docs/architecture/WORKFLOW_ENGINE.md)
for the manifest contract and validator configuration.

For a stricter Superpowers-style delivery loop, use the delivery controller.
It plans and starts disposable, artifact-gated routes with explicit approvals,
RED/GREEN checkpoints, specification review, quality review, and a finish gate:

```bash
go-beast delivery plan --kind feature --surface agnostic --format text
go-beast delivery start --kind feature --surface backend --id delivery-login
```

The controller coordinates skills through the existing workflow engine; it
does not execute implementation work or claim completion on the agent's behalf.

Adapters can normalize a harness-specific event trace and then validate the
harness-neutral result:

```bash
go-beast conformance normalize --trace .go-beast/codex-events.json --format json \
  > .go-beast/trace.json
go-beast conformance verify --trace .go-beast/trace.json --format json
```

Conformance reports missing evidence and ordering violations. A passing report
only describes the declared trace; normalization does not prove hidden agent
intent and verification does not replace tests, security review, or human
judgment.

The v2 capability registry exposes a deterministic structural view of the
canonical skills, hooks, workflows, profiles, and lifecycle adapters. It is
metadata-only and does not execute any registered asset:

```bash
go-beast capabilities validate --format text
go-beast capabilities list --kind skill --format json
go-beast capabilities show go-hawk --format json
go-beast capabilities export --output ./go-beast-capabilities.json
```

Validate an exported or externally supplied registry with
`go-beast capabilities validate --input PATH`; malformed references and unsafe
source paths fail closed.

The v2 adapter SDK centralizes native harness declarations for Claude Code,
Codex, and Copilot CLI. It exposes lifecycle/tool-event mappings, installation
paths, compatibility, ownership, and explicit degradation behavior:

```bash
go-beast adapters validate --format text
go-beast adapters list --format json
go-beast adapters matrix --format json
go-beast adapters diagnose --agent codex \
  --capabilities hooks,tool-events --format json
```

Hook wiring and conformance consume this manifest while preserving unmanaged
native configuration and the v1 normalized trace source field. See the
[adapter SDK contract](docs/architecture/ADAPTER_SDK.md).

The task-oriented v2 CLI provides a single task ID across planning, workflow
state, explanations, recovery, and structural audit. The existing lower-level
namespaces remain compatible entry points:

```bash
go-beast init --id task-login --agent codex --profile default
go-beast plan --task task-login --kind feature --surface backend --format json
go-beast run --task task-login --adapter codex --format json
go-beast status --task task-login --format json
go-beast resume --task task-login --format json
go-beast explain capability go-hawk --format json
go-beast audit --task task-login --format json
```

`audit` reports structural observations and labels execution as
`not_verified` until a stronger evidence source is present. See the [task CLI
contract](docs/architecture/TASK_CLI.md).

The v2 evidence ledger records an append-only, hash-linked account of workflow
events. It keeps command and artifact digests, source adapter identity, and the
distinction between declared, observed, and verified evidence. It does not
store raw command output or treat a digest as authorization:

```bash
go-beast evidence init --output .go-beast/evidence.json \
  --task task-123 --harness codex --adapter go-beast-codex
go-beast evidence append --ledger .go-beast/evidence.json \
  --event .go-beast/events/implementation.json
go-beast evidence verify --ledger .go-beast/evidence.json --protocol --format json
go-beast evidence audit --ledger .go-beast/evidence.json --format json
```

`verify` detects altered events, broken sequence links, unsafe artifact paths,
and unsupported adapter claims. With `--protocol`, it reuses the v1
harness-neutral conformance rules, preserving compatibility while making
provenance auditable.

The v2 context compiler creates a bounded phase-entry packet from a validated
`go-squirrel` knowledge base. It records the selected record hashes, workflow
identity, validation evidence, decisions, open questions, and next reads:

```bash
go-beast context compile --kb-root knowledge \
  --workflow-file workflows/feature.json --phase plan \
  --task "Decide the implementation approach" \
  --max-records 8 --max-tokens 2500 \
  --output .go-beast/context-entry.json
go-beast context verify --kb-root knowledge \
  --packet .go-beast/context-entry.json
go-beast context finalize --kb-root knowledge \
  --packet .go-beast/context-entry.json \
  --completion .go-beast/context-completion.json \
  --output .go-beast/context-final.json
go-beast workflow complete --file workflows/feature.json \
  --phase plan --context .go-beast/context-final.json
```

See the [context compiler contract](docs/architecture/CONTEXT_COMPILER.md).

Lifecycle adapters share one runtime policy for active-beast applicability,
required artifacts, approvals, implementation unlock, and completion evidence.
See [ADR-006](docs/architecture/ADR-006-runtime-policy-gate.md).

## License

MIT.
