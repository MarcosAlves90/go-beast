#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

RAW_TRACE="$TMP_DIR/raw-codex.json"
NORMALIZED_TRACE="$TMP_DIR/normalized.json"

if ! grep -q "command === 'normalize'" "$REPO_ROOT/scripts/conformance.mjs"; then
  printf '%s\n' 'CONFORMANCE-ADAPTER-RED: normalize command is not implemented'
  exit 1
fi

node - "$RAW_TRACE" <<'NODE'
const fs = require('node:fs')
const output = process.argv[2]
const trace = {
  version: 1,
  harness: 'codex',
  kind: 'feature',
  events: [
    { event: 'skill', phase: 'discovery', skill: 'go-hawk', harness_tool: 'workflow' },
    { event: 'artifact', path: '.go-beast/REQUIREMENTS.md', status: 'created', harness_tool: 'write' },
    { event: 'approval', kind: 'requirements', status: 'approved', artifact: '.go-beast/REQUIREMENTS.md', harness_tool: 'prompt' },
    { event: 'skill', phase: 'solution exploration', skill: 'go-lark', harness_tool: 'workflow' },
    { event: 'artifact', path: '.go-beast/APPROACH.md', status: 'created', harness_tool: 'write' },
    { event: 'approval', kind: 'approach', status: 'approved', artifact: '.go-beast/APPROACH.md', harness_tool: 'prompt' },
    { event: 'skill', phase: 'architecture', skill: 'go-fox', harness_tool: 'workflow' },
    { event: 'artifact', path: 'docs/architecture/task-artifacts/CONTRACTS.md', status: 'created', harness_tool: 'write' },
    { event: 'skill', phase: 'specify', skill: 'go-snipe', harness_tool: 'workflow' },
    { event: 'artifact', path: 'SPEC.md', status: 'created', harness_tool: 'write' },
    { event: 'red', status: 'passed', evidence: 'test-red', harness_tool: 'terminal' },
    { event: 'artifact', path: '.go-beast/checkpoints/RED.md', status: 'created', harness_tool: 'write' },
    { event: 'implementation', status: 'passed', skill: 'go-smith', evidence: 'implementation', harness_tool: 'edit' },
    { event: 'artifact', path: '.go-beast/checkpoints/IMPLEMENTATION.md', status: 'created', harness_tool: 'write' },
    { event: 'green', status: 'passed', evidence: 'test-green', harness_tool: 'terminal' },
    { event: 'artifact', path: '.go-beast/checkpoints/GREEN.md', status: 'created', harness_tool: 'write' },
    { event: 'review', kind: 'spec', status: 'passed', evidence: 'spec-review', harness_tool: 'workflow' },
    { event: 'artifact', path: '.go-beast/checkpoints/SPEC_REVIEW.md', status: 'created', harness_tool: 'write' },
    { event: 'review', kind: 'quality', status: 'passed', evidence: 'quality-review', harness_tool: 'workflow' },
    { event: 'artifact', path: '.go-beast/checkpoints/QUALITY_REVIEW.md', status: 'created', harness_tool: 'write' },
    { event: 'finish', status: 'passed', evidence: 'finished', harness_tool: 'workflow' },
    { event: 'artifact', path: '.go-beast/checkpoints/FINISH.md', status: 'created', harness_tool: 'write' },
  ],
}
fs.writeFileSync(output, JSON.stringify(trace, null, 2))
NODE

node "$REPO_ROOT/bin/go-beast.mjs" conformance normalize --trace "$RAW_TRACE" --format json > "$NORMALIZED_TRACE"

node - "$NORMALIZED_TRACE" <<'NODE'
const fs = require('node:fs')
const trace = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (trace.source?.harness !== 'codex') throw new Error('normalized trace lost source harness')
if (trace.events?.[0]?.type !== 'skill_invoked' || trace.events?.[0]?.skill !== 'go-hawk') {
  throw new Error('normalized trace did not canonicalize skill event')
}
if (JSON.stringify(trace).includes('harness_tool')) throw new Error('harness-specific field leaked into canonical trace')
NODE

node "$REPO_ROOT/bin/go-beast.mjs" conformance verify --trace "$NORMALIZED_TRACE" --format json > "$TMP_DIR/verdict.json"
node - "$TMP_DIR/verdict.json" <<'NODE'
const fs = require('node:fs')
const verdict = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (!verdict.passed || verdict.missing.length !== 0 || verdict.violations.length !== 0) {
  throw new Error(`canonical trace did not verify: ${JSON.stringify(verdict)}`)
}
NODE

node - "$TMP_DIR/unsupported.json" <<'NODE'
const fs = require('node:fs')
fs.writeFileSync(process.argv[2], JSON.stringify({ version: 1, harness: 'unknown', kind: 'feature', events: [] }))
NODE
if node "$REPO_ROOT/bin/go-beast.mjs" conformance normalize --trace "$TMP_DIR/unsupported.json" --format json > "$TMP_DIR/unsupported.out" 2>&1; then
  printf '%s\n' 'unsupported harness unexpectedly normalized' >&2
  exit 1
fi
grep -qi 'unsupported harness' "$TMP_DIR/unsupported.out"

printf '%s\n' 'Conformance adapter tests passed'
