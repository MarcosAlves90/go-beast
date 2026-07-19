# Declarative orchestration contract

`go-beast.manifest.yaml` is the structured coordination layer for facts shared
across the skill pack. It describes skill identity, phases, dependencies,
gates, artifacts, and the consumers that must run repository validation. The
JSON schema is versioned in `go-beast.manifest.schema.json`.

## Ownership boundary

The manifest owns structural facts that can be checked deterministically:

- skill IDs, aliases, phases, dependencies, conflicts, and gates;
- declared input and output artifacts;
- required validation consumers and their commands;
- references to supported generated surfaces.

Federated domain sources remain authoritative for operational behavior:

- `skills/*/SKILL.md` owns reasoning, procedures, heuristics, and examples;
- `hooks/manifest.json` and hook scripts own runtime enforcement;
- `workflows/` owns workflow composition;
- adapters and documentation own integration and explanatory details.

The first delivery does not make hooks or runtime agents read the manifest
directly. `npm run verify` validates the manifest and its declared surfaces,
and CI runs that same command.

## Validation guarantees

The validator rejects unknown references, duplicate artifacts or consumers,
dependency cycles, unregistered required-phase artifacts, missing consumer
commands, missing required `verify`/CI consumers, malformed canonical skill
documents, missing generated surfaces, and stale generated surfaces. Canonical
skill documents must have matching identity in their frontmatter, a semantic
version, numbered workflow headings, and the required `Rules` and `Output`
sections. These checks validate structural contracts; they do not attempt to
judge free-form instructional prose.

Run `npm run rules:generate` after changing the manifest, review the generated
diff, and run `npm run verify`. Generated blocks must not be edited manually.

## Deferred migration

This contract does not replace Markdown execution instructions or introduce a
workflow engine. A later migration may allow hooks or agents to consume the
manifest directly, but that requires explicit compatibility design and
behavioral tests.
