# go-beast

![go-beast banner](go-beast-banner.png)

> A versioned, agent-agnostic skill pack for AI-assisted software development.

go-beast gives coding agents a structured path from discovery to delivery.
Each `go-<animal>` skill owns one phase, states its prerequisites, and produces
concrete artifacts for the next phase. Skills are plain Markdown and work with
Claude Code, Codex, Copilot, Cursor, Gemini, and other agents.

**Version 1.53.2** · [Changelog](CHANGELOG.md)

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
```

Selections are persisted in `~/.go-beast/config.json`. Session-start sync
honors that profile, while unmanaged files and custom hook entries are left
untouched. Status reports desired state, installation ownership, dependency
gaps, conflicts, and blocked assets. Profiles can be exported/imported between
machines, and named presets capture an agent's skill and hook policy. Use
`--dry-run` to inspect a change before applying it.

## What is included

- A lifecycle pipeline from discovery and architecture through testing, security,
  CI/CD, and documentation.
- Optional Claude Code, Codex, and Copilot CLI hooks and workflows.
- A plugin adapter under `plugins/go-beast/`; canonical skills remain under
  `skills/`.

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
without executing skills directly. See [Workflow engine](docs/architecture/WORKFLOW_ENGINE.md).

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

Lifecycle adapters share one runtime policy for active-beast applicability,
required artifacts, approvals, implementation unlock, and completion evidence.
See [ADR-006](docs/architecture/ADR-006-runtime-policy-gate.md).

## License

MIT.
