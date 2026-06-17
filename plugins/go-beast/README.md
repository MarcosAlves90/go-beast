# go-beast Plugin Adapter

This directory packages the root `go-*` skills in a plugin-friendly layout for
optional surfaces that expect a plugin bundle with a dedicated `skills/`
directory.

## Scope

- `skills/` contains symlinks to the canonical root skill directories
- `.codex-plugin/plugin.json` provides Codex plugin metadata
- `.claude-plugin/plugin.json` provides Claude plugin metadata

If you do not use those harnesses, this adapter directory is not required for
using the core pack.

## Deliberate limitations

- Hook wiring is **not** declared in the plugin manifests. The current Codex
  plugin validation guidance rejects manifest-level `hooks`, so hook
  installation remains the job of `scripts/install.mjs` and
  `hooks/sync-go-beast-skills.sh`.
- The root repository layout remains the source of truth. Do not edit skills
  through the symlinked adapter directory.

## Maintenance

Whenever a `go-*` skill is added, removed, or renamed, run:

```bash
node scripts/sync-plugin-skills.mjs
```

This keeps `plugins/go-beast/skills/` aligned with the canonical root skills.
