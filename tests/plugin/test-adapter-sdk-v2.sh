#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI=(node "$REPO_ROOT/bin/go-beast.mjs")

if [[ ! -f "$REPO_ROOT/scripts/adapters.mjs" || ! -f "$REPO_ROOT/adapters/manifest.json" || ! -f "$REPO_ROOT/go-beast.adapters.schema.json" ]]; then
  echo 'V2_ADAPTER_SDK_RED'
  exit 1
fi

TEST_HOME="$(mktemp -d)"
trap 'rm -rf "$TEST_HOME"' EXIT

validate_json="$TEST_HOME/validate.json"
"${CLI[@]}" adapters validate --format json > "$validate_json"
node - "$validate_json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (!result.valid || result.count !== 3) throw new Error('adapter manifest did not validate all supported adapters')
NODE

matrix_json="$TEST_HOME/matrix.json"
"${CLI[@]}" adapters matrix --format json > "$matrix_json"
node - "$matrix_json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const requiredEvents = ['session_start', 'user_prompt_submit', 'stop', 'pre_tool_use', 'post_tool_use']
if (result.adapters?.length !== 3) throw new Error('capability matrix omitted an adapter')
for (const adapter of result.adapters) {
  if (!adapter.id.startsWith('go-beast-')) throw new Error('adapter ID is not namespaced')
  if (!adapter.capabilities.includes('lifecycle-events')) throw new Error(`${adapter.id} lacks lifecycle capability`)
  if (!adapter.install?.preserves_unmanaged) throw new Error(`${adapter.id} does not declare native config preservation`)
  if (!adapter.compatibility?.contract_range) throw new Error(`${adapter.id} lacks compatibility declaration`)
  if (!adapter.degradation?.length) throw new Error(`${adapter.id} lacks degradation behavior`)
  for (const event of requiredEvents) {
    if (!adapter.events?.[event]?.native || adapter.events[event].supported !== true) throw new Error(`${adapter.id} lacks ${event} mapping`)
  }
}
NODE

show_json="$TEST_HOME/show.json"
"${CLI[@]}" adapters show codex --format json > "$show_json"
node - "$show_json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.adapter?.id !== 'go-beast-codex' || result.adapter.harness !== 'codex') throw new Error('adapter show did not resolve codex')
NODE

diagnose_json="$TEST_HOME/diagnose.json"
if "${CLI[@]}" adapters diagnose --agent codex --capabilities hooks,unsupported-capability --format json > "$diagnose_json" 2>&1; then
  echo 'diagnose unexpectedly accepted an unsupported capability' >&2
  exit 1
fi
node - "$diagnose_json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.passed || !result.unsupported.includes('unsupported-capability')) throw new Error('unsupported capability diagnostic is incomplete')
if (!result.degradation.some(item => item.capability === 'unsupported-capability')) throw new Error('degradation guidance is missing')
NODE

for harness in claude-code codex copilot; do
  normalized="$TEST_HOME/$harness-normalized.json"
  "${CLI[@]}" conformance normalize --trace "$REPO_ROOT/tests/fixtures/adapters/$harness.json" --format json > "$normalized"
  node - "$normalized" "$harness" <<'NODE'
const fs = require('fs')
const trace = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const harness = process.argv[3]
if (trace.source?.adapter !== 'go-beast-conformance') throw new Error('v1 adapter source compatibility changed')
if (trace.source?.adapter_id !== `go-beast-${harness}` || trace.source.contract_version !== 2) throw new Error('normalized trace lost adapter SDK provenance')
if (!trace.source.capabilities.includes('lifecycle-events')) throw new Error('normalized trace lost adapter capabilities')
NODE
done

mkdir -p "$TEST_HOME/.codex/hooks"
cat > "$TEST_HOME/.codex/hooks.json" <<'JSON'
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "bash ~/.codex/hooks/custom-stop.sh" }] }
    ]
  }
}
JSON
HOME="$TEST_HOME" node "$REPO_ROOT/scripts/hook-wire.mjs" sync --agent codex > "$TEST_HOME/wire.json"
node - "$TEST_HOME/.codex/hooks.json" <<'NODE'
const fs = require('fs')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const entries = Object.values(config.hooks || {}).flat()
const serialized = JSON.stringify(entries)
if (!serialized.includes('bash ~/.codex/hooks/custom-stop.sh')) throw new Error('native custom hook was not preserved')
if (!serialized.includes('go-beast-stop-reanchor.sh')) throw new Error('managed codex hook was not installed')
NODE

registry_json="$TEST_HOME/registry.json"
"${CLI[@]}" capabilities export --output "$registry_json" --format json > /dev/null
node - "$registry_json" <<'NODE'
const fs = require('fs')
const registry = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const adapters = registry.capabilities.filter(item => item.kind === 'adapter')
if (adapters.length !== 3) throw new Error('capability registry omitted adapter matrix')
for (const adapter of adapters) {
  if (adapter.source !== 'scripts/adapters.mjs') throw new Error('adapter capability source is not the SDK')
  if (!adapter.outputs.includes('normalized-agent-event')) throw new Error(`${adapter.id} lacks normalized event output`)
}
NODE

echo 'Adapter SDK v2 tests passed'
