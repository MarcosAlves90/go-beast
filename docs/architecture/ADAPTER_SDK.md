# Adapter SDK and capability matrix

Go Beast v2 keeps the core pack harness-neutral and describes each supported AI
surface through `adapters/manifest.json`. The manifest is validated by
`go-beast.adapters.schema.json` and consumed by hook wiring, conformance
normalization, and the capability registry.

## Adapter contract

Every adapter declares:

- a stable `go-beast-<harness>` ID and contract version;
- install and native configuration paths;
- the capabilities it can provide (`skills`, `hooks`, `prompt-context`,
  `tool-events`, and lifecycle/configuration/install support);
- canonical lifecycle event mappings for session start, prompt submit, stop,
  pre-tool, and post-tool events;
- compatibility metadata for the contract, Node, and trace envelope;
- ownership and keying rules that identify managed entries; and
- explicit degradation behavior for capabilities that are unavailable at
  runtime.

The manifest currently covers Claude Code, Codex, and Copilot CLI. Native
spelling differences remain in the adapter declaration: Claude Code and Codex
use PascalCase event names and Copilot uses camelCase names and flat entries.

## Inspection CLI

```bash
go-beast adapters validate --format text
go-beast adapters list --format json
go-beast adapters show codex --format json
go-beast adapters matrix --format json
go-beast adapters diagnose \
  --agent codex \
  --capabilities hooks,tool-events \
  --events preToolUse \
  --format json
```

`diagnose` exits non-zero when a requested capability or event is not declared.
Its structured `degradation` entries explain the harness-neutral fallback and
prevent an unsupported feature from being treated as silently active.

## Integration boundaries

`scripts/hook-wire.mjs` derives native hook directories, configuration paths,
formats, and event names from the manifest. It keeps the existing ownership
key (`event+matcher+command`) so managed entries are refreshed idempotently;
unmanaged native entries and external symlinks remain untouched.

`scripts/conformance.mjs` keeps the v1 `source.adapter` value for compatibility
and adds `source.adapter_id`, `source.contract_version`, and declared
capabilities to normalized traces. This makes provenance inspectable without
invalidating existing trace consumers.

`scripts/capabilities.mjs` derives adapter capability entries from the SDK
implementation and points their source at `scripts/adapters.mjs`. The registry
therefore exposes structural adapter facts without copying operational hook or
skill prose.

## Adding an adapter

1. Add a complete declaration to `adapters/manifest.json` in sorted ID order.
2. Add the native event/configuration behavior to the manifest, including a
   degradation entry for every known limitation.
3. Add a raw fixture under `tests/fixtures/adapters/` and extend
   `tests/plugin/test-adapter-sdk-v2.sh` with preservation and diagnostics
   assertions.
4. Run `go-beast adapters validate`, the adapter fixture tests, and
   `npm run verify`.

An adapter declaration is not permission to mutate user configuration. Install
and sync operations remain explicit, and every adapter must preserve unrelated
native entries.
