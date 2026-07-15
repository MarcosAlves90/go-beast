# go-beast

![go-beast banner](go-beast-banner.png)

> A versioned, agent-agnostic skill pack for AI-assisted software development.

go-beast gives coding agents a structured path from discovery to delivery.
Each `go-<animal>` skill owns one phase, states its prerequisites, and produces
concrete artifacts for the next phase. Skills are plain Markdown and work with
Claude Code, Codex, Copilot, Cursor, Gemini, and other agents.

**Version 1.47.1** · [Changelog](CHANGELOG.md)

## Start here

For the fastest installation, choose the path that matches your environment:

```bash
# From a checkout
git clone <repo-url> <repo-dir>
node <repo-dir>/scripts/install.mjs --all

# Without cloning the repository
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MarcosAlves90/go-beast/main/scripts/install.sh)" -- --all
```

Use `--bootstrap` with either installer to enable the stricter discovery-first
agent contract. See [Getting started](docs/GETTING_STARTED.md) for archive
selection, updates, uninstall, and agent-specific setup.

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

## License

MIT.
