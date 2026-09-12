#!/usr/bin/env bash

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="$REPO_ROOT/bin/go-beast.mjs"
TEST_ROOT="$(mktemp -d)"

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

if [[ ! -f "$REPO_ROOT/scripts/delivery.mjs" ]]; then
  echo "DELIVERY-RED: delivery controller is not implemented yet"
  exit 1
fi

plan_json="$(node "$CLI" delivery plan --kind feature --surface agnostic --format json)" || {
  echo "DELIVERY-RED: delivery plan command is not implemented yet"
  exit 1
}

PLAN_JSON="$plan_json" node - <<'NODE'
const plan = JSON.parse(process.env.PLAN_JSON)
const expected = [
  'discover',
  'approve-requirements',
  'explore',
  'approve-approach',
  'architecture',
  'specify',
  'red',
  'implement',
  'green',
  'spec-review',
  'quality-review',
  'finish',
]
const ids = plan.phases.map(phase => phase.id)
if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error(`unexpected phase route: ${ids.join(',')}`)
if (!plan.policy.strict || !plan.policy.approvals || !plan.policy.tdd || !plan.policy.reviews) throw new Error('strict delivery policy is incomplete')
if (plan.phases.find(phase => phase.id === 'implement').skill !== 'go-bee') throw new Error('agnostic implementation does not use go-bee')
if (plan.phases.findIndex(phase => phase.id === 'red') > plan.phases.findIndex(phase => phase.id === 'implement')) throw new Error('implementation precedes red')
NODE
pass "agnostic feature plan exposes strict gates and red-green review route"

backend_json="$(node "$CLI" delivery plan --kind feature --surface backend --format json)" || fail "backend plan command succeeds"
BACKEND_JSON="$backend_json" node - <<'NODE'
const plan = JSON.parse(process.env.BACKEND_JSON)
if (plan.phases.filter(phase => phase.id === 'implement').map(phase => phase.skill).join(',') !== 'go-wolf') throw new Error('backend implementation executor is not go-wolf')
NODE
pass "backend surface selects go-wolf"

full_json="$(node "$CLI" delivery plan --kind feature --surface full --format json)" || fail "full-stack plan command succeeds"
FULL_JSON="$full_json" node - <<'NODE'
const plan = JSON.parse(process.env.FULL_JSON)
const implementation = plan.phases.filter(phase => phase.id.startsWith('implement-')).map(phase => phase.skill)
if (implementation.join(',') !== 'go-wolf,go-lynx') throw new Error(`unexpected full-stack executors: ${implementation.join(',')}`)
NODE
pass "full-stack surface sequences go-wolf and go-lynx"

start_json="$(node "$CLI" delivery start --root "$TEST_ROOT" --kind feature --surface agnostic --id delivery-test --format json)" || fail "delivery start succeeds"
START_JSON="$start_json" TEST_ROOT="$TEST_ROOT" node - <<'NODE'
const fs = require('fs')
const path = require('path')
const result = JSON.parse(process.env.START_JSON)
const root = process.env.TEST_ROOT
const manifest = path.join(root, '.go-beast', 'workflows', 'manifests', 'delivery-test.json')
const state = path.join(root, '.go-beast', 'workflows', 'delivery-test.json')
if (result.manifest_path !== '.go-beast/workflows/manifests/delivery-test.json') throw new Error('start did not report the canonical manifest path')
if (!fs.existsSync(manifest) || !fs.existsSync(state)) throw new Error('delivery start did not create manifest and engine state')
const persisted = JSON.parse(fs.readFileSync(state, 'utf8'))
if (persisted.workflow_id !== 'delivery-test' || persisted.phases.discover.status !== 'pending') throw new Error('existing workflow engine state is incomplete')
NODE
pass "delivery start delegates to the existing workflow engine"

echo "Delivery controller tests passed"
