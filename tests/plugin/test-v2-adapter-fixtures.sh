#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI=(node "$REPO_ROOT/bin/go-beast.mjs")
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

if [ ! -f "$REPO_ROOT/tests/fixtures/adapters/claude-code.json" ]; then
  printf '%s\n' 'V2_ADAPTER_MATRIX_RED: adapter fixtures are missing'
  exit 1
fi

for harness in claude-code codex copilot; do
  case "$harness" in
    claude-code) adapter="go-beast-claude-code" ;;
    codex) adapter="go-beast-codex" ;;
    copilot) adapter="go-beast-copilot" ;;
  esac

  fixture="$REPO_ROOT/tests/fixtures/adapters/$harness.json"
  normalized="$TEST_ROOT/$harness-normalized.json"
  ledger="$TEST_ROOT/$harness-ledger.json"
  event="$TEST_ROOT/$harness-event.json"

  "${CLI[@]}" conformance normalize --trace "$fixture" --format json > "$normalized"
  node - "$normalized" "$harness" <<'NODE'
const fs = require('node:fs')
const [file, expectedHarness] = process.argv.slice(2)
const trace = JSON.parse(fs.readFileSync(file, 'utf8'))
if (trace.version !== 1 || trace.source?.harness !== expectedHarness) throw new Error(`fixture source mismatch for ${expectedHarness}`)
if (trace.source?.adapter !== 'go-beast-conformance') throw new Error('fixture normalization changed the v1 adapter contract')
if (trace.events?.[0]?.phase !== 'discover' || trace.events?.[0]?.skill !== 'go-hawk') throw new Error(`phase alias was not normalized for ${expectedHarness}`)
NODE

  "${CLI[@]}" evidence init \
    --output "$ledger" \
    --task "adapter-fixture-$harness" \
    --kind feature \
    --harness "$harness" \
    --adapter "$adapter" \
    --format json > "$TEST_ROOT/$harness-init.json"

  node - "$event" "$harness" <<'NODE'
const fs = require('node:fs')
const [file, harness] = process.argv.slice(2)
const digest = 'a'.repeat(64)
fs.writeFileSync(file, JSON.stringify({
  type: 'command',
  status: 'observed',
  actor: { kind: 'tool', id: 'adapter-fixture' },
  payload: { harness },
  provenance: {
    command: {
      argv: ['fixture', harness],
      cwd: '.',
      exit_code: 0,
      stdout_sha256: digest,
      stderr_sha256: digest,
    },
  },
  recorded_at: '2026-09-14T00:00:00.000Z',
}, null, 2))
NODE

  "${CLI[@]}" evidence append --ledger "$ledger" --event "$event" --format json > "$TEST_ROOT/$harness-append.json"
  "${CLI[@]}" evidence verify --ledger "$ledger" --format json > "$TEST_ROOT/$harness-verify.json"
  node - "$TEST_ROOT/$harness-verify.json" "$ledger" "$harness" "$adapter" <<'NODE'
const fs = require('node:fs')
const [verdictFile, ledgerFile, expectedHarness, expectedAdapter] = process.argv.slice(2)
const verdict = JSON.parse(fs.readFileSync(verdictFile, 'utf8'))
const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'))
if (!verdict.valid || verdict.errors.length !== 0) throw new Error(`v2 fixture ledger did not verify for ${expectedHarness}`)
if (ledger.source?.harness !== expectedHarness || ledger.source?.adapter !== expectedAdapter) throw new Error(`v2 source claim mismatch for ${expectedHarness}`)
if (ledger.events?.[0]?.source?.adapter !== expectedAdapter) throw new Error(`event source claim mismatch for ${expectedHarness}`)
NODE
done

if "${CLI[@]}" evidence init \
  --output "$TEST_ROOT/unsupported.json" \
  --task unsupported \
  --harness codex \
  --adapter go-beast-unknown \
  --format json > "$TEST_ROOT/unsupported.out" 2>&1; then
  echo 'unsupported adapter unexpectedly initialized' >&2
  exit 1
fi
grep -qi 'unsupported adapter' "$TEST_ROOT/unsupported.out"

echo "V2 adapter fixture tests passed"
