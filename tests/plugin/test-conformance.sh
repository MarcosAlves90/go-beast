#!/usr/bin/env bash

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="$REPO_ROOT/bin/go-beast.mjs"
TEST_ROOT="$(mktemp -d)"
GOOD_TRACE="$TEST_ROOT/good.json"
BAD_TRACE="$TEST_ROOT/bad.json"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  echo "[FAIL] $1"
  exit 1
}

pass() {
  echo "[PASS] $1"
}

if [[ ! -f "$REPO_ROOT/scripts/conformance.mjs" ]]; then
  echo "CONFORMANCE-RED: conformance checker is not implemented yet"
  exit 1
fi

node - "$GOOD_TRACE" "$BAD_TRACE" <<'NODE'
const fs = require('fs')
const [goodPath, badPath] = process.argv.slice(2)
const artifact = path => ({ type: 'artifact', path, status: 'present' })
const good = {
  version: 1,
  kind: 'feature',
  events: [
    { type: 'skill_invoked', phase: 'discover', skill: 'go-hawk' },
    artifact('.go-beast/REQUIREMENTS.md'),
    { type: 'approval', kind: 'requirements', status: 'approved' },
    { type: 'skill_invoked', phase: 'explore', skill: 'go-lark' },
    artifact('.go-beast/APPROACH.md'),
    { type: 'approval', kind: 'approach', status: 'approved' },
    { type: 'skill_invoked', phase: 'architecture', skill: 'go-fox' },
    artifact('docs/architecture/task-artifacts/CONTRACTS.md'),
    { type: 'skill_invoked', phase: 'specify', skill: 'go-snipe' },
    artifact('SPEC.md'),
    { type: 'red', status: 'failed', evidence: 'acceptance test failed' },
    artifact('.go-beast/checkpoints/RED.md'),
    { type: 'implementation', status: 'completed', skill: 'go-bee' },
    artifact('.go-beast/checkpoints/IMPLEMENTATION.md'),
    { type: 'green', status: 'passed', evidence: 'npm test' },
    artifact('.go-beast/checkpoints/GREEN.md'),
    { type: 'review', kind: 'spec', status: 'passed' },
    artifact('.go-beast/checkpoints/SPEC_REVIEW.md'),
    { type: 'review', kind: 'quality', status: 'passed' },
    artifact('.go-beast/checkpoints/QUALITY_REVIEW.md'),
    { type: 'finish', status: 'passed' },
    artifact('.go-beast/checkpoints/FINISH.md'),
  ],
}
const bad = {
  version: 1,
  kind: 'feature',
  events: [
    { type: 'skill_invoked', phase: 'discover', skill: 'go-hawk' },
    { type: 'implementation', status: 'completed', skill: 'go-bee' },
    { type: 'green', status: 'passed' },
  ],
}
fs.writeFileSync(goodPath, JSON.stringify(good))
fs.writeFileSync(badPath, JSON.stringify(bad))
NODE

good_output="$(node "$CLI" conformance check --trace "$GOOD_TRACE" --format json)" || fail "complete trace passes"
GOOD_OUTPUT="$good_output" node - <<'NODE'
const verdict = JSON.parse(process.env.GOOD_OUTPUT)
if (!verdict.passed || verdict.missing.length !== 0 || verdict.violations.length !== 0) throw new Error('complete trace did not pass cleanly')
NODE
pass "complete ordered trace produces a passing verdict"

set +e
bad_output="$(node "$CLI" conformance check --trace "$BAD_TRACE" --format json 2>&1)"
bad_status=$?
set -e
[[ "$bad_status" -ne 0 ]] || fail "incomplete trace is rejected"
BAD_OUTPUT="$bad_output" node - <<'NODE'
const verdict = JSON.parse(process.env.BAD_OUTPUT)
if (verdict.passed) throw new Error('incomplete trace incorrectly passed')
if (verdict.missing.length === 0 || verdict.violations.length === 0) throw new Error('conformance failure did not separate missing evidence and ordering violations')
NODE
pass "incomplete and out-of-order trace reports actionable failures"

echo "Conformance tests passed"
