<!-- BEGIN GENERATED: transversal-rules -->
## Generated transversal rules — architecture reference

Source: `go-beast.manifest.yaml` (schema 1, manifest 1).

These rules are generated. Edit the manifest and run the generator; do not edit this block manually.

### Principles
- Security and correctness take priority over convenience.
- Investigate before implementation and validate before completion.
- Keep canonical sources federated by domain and derive shared surfaces deterministically.

### Precedence
1. System and harness rules
2. Repository-local AGENTS.md
3. AGENTS.bootstrap.md when bootstrap mode is active
4. AGENTS.global.md

### Required phases
- **discovery:** `go-hawk discovery output`
- **solution exploration:** `go-lark approach decision`
- **validation:** `npm run verify`

### Execution constraints
- Do not fabricate requirements, validation results, or compatibility claims.
- Do not implement while a required discovery artifact is missing.
- Use the strongest relevant validation available before declaring completion.

### Federated sources
- **canonical skills:** `skills/`
- **shared hook contract:** `hooks/manifest.json`
- **release version:** `package.json`

Hook contract: `hooks/manifest.json`; wiring: `scripts/hook-wire.mjs`; session sync: `hooks/sync-go-beast-skills.sh`.
<!-- END GENERATED: transversal-rules -->

## Scope

`go-beast.manifest.yaml` is the canonical source for transversal maintainer
rules. It does not replace domain-specific sources: skills remain canonical in
`skills/`, hook behavior remains defined by `hooks/manifest.json`, and release
version remains owned by `package.json`.

## Workflow

Run `npm run rules:generate` after changing the manifest. Review the generated
diff, then run `npm run rules:check` or `npm run verify`. CI and local
validation use `check`; they never rewrite the working tree.

Generated blocks are delimited by markers and must not be edited manually.
Manual content outside those blocks is preserved. The first implementation
validates structure and synchronization; it does not attempt to infer every
semantic contradiction in prose across the repository.
