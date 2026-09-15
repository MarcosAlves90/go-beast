#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI="$REPO_ROOT/bin/go-beast.mjs"
TEST_ROOT="$(mktemp -d)"
GOOD_LEDGER="$TEST_ROOT/good.json"
BAD_LEDGER="$TEST_ROOT/bad-order.json"
trap 'rm -rf "$TEST_ROOT"' EXIT

if ! grep -q "evidence" "$CLI"; then
  printf '%s\n' 'EVIDENCE_LEDGER_RED: evidence CLI is not wired'
  exit 1
fi

node - "$REPO_ROOT" "$GOOD_LEDGER" "$BAD_LEDGER" "$TEST_ROOT" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const [repo, goodLedger, badLedger, root] = process.argv.slice(2)
const cli = path.join(repo, 'bin', 'go-beast.mjs')
const hash = 'a'.repeat(64)
const actor = { kind: 'agent', id: 'session-1' }
const command = { argv: ['node', 'fixture'], cwd: '.', exit_code: 0, stdout_sha256: hash, stderr_sha256: hash }
const artifact = file => ({ path: file, sha256: hash, kind: 'fixture' })
const payloads = [
  ['skill_invoked', { phase: 'discover', skill: 'go-hawk' }],
  ['artifact', { path: '.go-beast/REQUIREMENTS.md', status: 'present' }, artifact('.go-beast/REQUIREMENTS.md')],
  ['approval', { kind: 'requirements', status: 'approved' }],
  ['skill_invoked', { phase: 'explore', skill: 'go-lark' }],
  ['artifact', { path: '.go-beast/APPROACH.md', status: 'present' }, artifact('.go-beast/APPROACH.md')],
  ['approval', { kind: 'approach', status: 'approved' }],
  ['skill_invoked', { phase: 'architecture', skill: 'go-fox' }],
  ['artifact', { path: 'docs/architecture/task-artifacts/CONTRACTS.md', status: 'present' }, artifact('docs/architecture/task-artifacts/CONTRACTS.md')],
  ['skill_invoked', { phase: 'specify', skill: 'go-snipe' }],
  ['artifact', { path: 'SPEC.md', status: 'present' }, artifact('SPEC.md')],
  ['red', { status: 'failed', evidence: 'acceptance test failed' }, null, 'verified'],
  ['artifact', { path: '.go-beast/checkpoints/RED.md', status: 'present' }, artifact('.go-beast/checkpoints/RED.md')],
  ['implementation', { status: 'completed', skill: 'go-bee' }, null, 'declared'],
  ['artifact', { path: '.go-beast/checkpoints/IMPLEMENTATION.md', status: 'present' }, artifact('.go-beast/checkpoints/IMPLEMENTATION.md')],
  ['green', { status: 'passed', evidence: 'npm test' }, null, 'verified'],
  ['artifact', { path: '.go-beast/checkpoints/GREEN.md', status: 'present' }, artifact('.go-beast/checkpoints/GREEN.md')],
  ['review', { kind: 'spec', status: 'passed' }],
  ['artifact', { path: '.go-beast/checkpoints/SPEC_REVIEW.md', status: 'present' }, artifact('.go-beast/checkpoints/SPEC_REVIEW.md')],
  ['review', { kind: 'quality', status: 'passed' }],
  ['artifact', { path: '.go-beast/checkpoints/QUALITY_REVIEW.md', status: 'present' }, artifact('.go-beast/checkpoints/QUALITY_REVIEW.md')],
  ['finish', { status: 'passed' }, null, 'verified'],
  ['artifact', { path: '.go-beast/checkpoints/FINISH.md', status: 'present' }, artifact('.go-beast/checkpoints/FINISH.md')],
]

function run(args) {
  const result = spawnSync('node', [cli, ...args], { cwd: repo, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`command failed: ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

function makeLedger(target, sourceEvents) {
  run(['evidence', 'init', '--output', target, '--task', 'task-v2', '--harness', 'codex', '--adapter', 'go-beast-codex', '--format', 'json'])
  sourceEvents.forEach(([type, payload, artifactData, trust = 'observed'], index) => {
    const eventPath = path.join(root, `event-${path.basename(target)}-${index}.json`)
    const event = {
      type,
      status: trust,
      actor,
      payload,
      provenance: { command, ...(artifactData ? { artifact: artifactData } : {}) },
      recorded_at: new Date(Date.UTC(2026, 8, 14, 0, 0, index)).toISOString(),
    }
    fs.writeFileSync(eventPath, JSON.stringify(event, null, 2))
    run(['evidence', 'append', '--ledger', target, '--event', eventPath, '--format', 'json'])
  })
}

makeLedger(goodLedger, payloads)
makeLedger(badLedger, [payloads[0], ...payloads.slice(1, 10), payloads[12], payloads[10], payloads[11], payloads[13], ...payloads.slice(14)])
NODE

node "$CLI" evidence verify --ledger "$GOOD_LEDGER" --protocol --format json > "$TEST_ROOT/good-verdict.json"
node - "$TEST_ROOT/good-verdict.json" <<'NODE'
const fs = require('node:fs')
const verdict = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (!verdict.valid || !verdict.conformance?.passed || verdict.errors.length !== 0) throw new Error(`valid ledger did not pass: ${JSON.stringify(verdict)}`)
if (verdict.event_count !== 22) throw new Error(`unexpected event count: ${verdict.event_count}`)
NODE

node "$CLI" evidence audit --ledger "$GOOD_LEDGER" --format json > "$TEST_ROOT/audit.json"
node - "$TEST_ROOT/audit.json" <<'NODE'
const fs = require('node:fs')
const audit = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (audit.event_count !== 22 || audit.trust.observed === 0 || audit.trust.verified === 0) throw new Error('audit did not separate trust statuses')
if (audit.provenance.commands === 0 || audit.provenance.artifacts === 0) throw new Error('audit omitted provenance counts')
NODE

node - "$GOOD_LEDGER" "$TEST_ROOT/before-hashes.json" <<'NODE'
const fs = require('node:fs')
const ledger = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
fs.writeFileSync(process.argv[3], JSON.stringify(ledger.events.map(event => event.event_hash)))
NODE
cat > "$TEST_ROOT/append.json" <<'JSON'
{
  "type": "command",
  "status": "observed",
  "actor": {"kind": "tool", "id": "test"},
  "payload": {"name": "npm run verify"},
  "provenance": {"command": {"argv": ["npm", "run", "verify"], "cwd": ".", "exit_code": 0, "stdout_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "stderr_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}},
  "recorded_at": "2026-09-14T00:01:00.000Z"
}
JSON
node "$CLI" evidence append --ledger "$GOOD_LEDGER" --event "$TEST_ROOT/append.json" --format json > "$TEST_ROOT/append-result.json"
node - "$GOOD_LEDGER" "$TEST_ROOT/before-hashes.json" <<'NODE'
const fs = require('node:fs')
const ledger = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const before = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
if (before.some((hash, index) => ledger.events[index].event_hash !== hash)) throw new Error('append rewrote an earlier event hash')
NODE
node "$CLI" evidence verify --ledger "$GOOD_LEDGER" --format json > "$TEST_ROOT/after-append.json"

node - "$GOOD_LEDGER" "$TEST_ROOT/tampered.json" <<'NODE'
const fs = require('node:fs')
const ledger = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
ledger.events[0].payload.skill = 'go-fox'
fs.writeFileSync(process.argv[3], JSON.stringify(ledger, null, 2))
NODE
if node "$CLI" evidence verify --ledger "$TEST_ROOT/tampered.json" --format json > "$TEST_ROOT/tampered.out" 2>&1; then
  echo 'tampered ledger unexpectedly passed' >&2
  exit 1
fi
grep -qi 'event hash mismatch' "$TEST_ROOT/tampered.out"

set +e
node "$CLI" evidence verify --ledger "$BAD_LEDGER" --protocol --format json > "$TEST_ROOT/bad-order.out" 2>&1
bad_status=$?
set -e
test "$bad_status" -ne 0
node - "$TEST_ROOT/bad-order.out" <<'NODE'
const fs = require('node:fs')
const verdict = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (verdict.valid || !verdict.conformance.violations.some(item => item.includes('implementation evidence precedes red'))) throw new Error('ordering failure was not reported')
NODE

if node "$CLI" evidence init --output "$TEST_ROOT/unsupported.json" --task task-v2 --harness codex --adapter unknown --format json > "$TEST_ROOT/unsupported.out" 2>&1; then
  echo 'unsupported adapter unexpectedly initialized' >&2
  exit 1
fi
grep -qi 'unsupported adapter' "$TEST_ROOT/unsupported.out"

echo "Evidence ledger tests passed"
