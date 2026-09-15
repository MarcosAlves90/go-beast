#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT

mkdir -p "$TEST_DIR/package/bin" "$TEST_DIR/package/scripts" "$TEST_DIR/project/workflows"
cp "$REPO_ROOT/bin/go-beast.mjs" "$TEST_DIR/package/bin/"
cp "$REPO_ROOT/scripts/workflow.mjs" "$REPO_ROOT/scripts/workflow-roots.mjs" "$REPO_ROOT/scripts/transversal-rules.mjs" "$TEST_DIR/package/scripts/"
cp "$REPO_ROOT/go-beast.workflow.schema.json" "$TEST_DIR/package/"

cat > "$TEST_DIR/project/workflows/parallel-route.json" <<'JSON'
{
  "schema_version": 2,
  "id": "parallel-route",
  "version": 1,
  "mode": "strict",
  "phases": [
    {
      "id": "discover",
      "skill": "go-hawk",
      "depends_on": [],
      "preconditions": [],
      "requires": [],
      "produces": [{"path": ".go-beast/context.md", "type": "file", "non_empty": true, "sections": []}],
      "transitions": ["left", "right"],
      "retry": {"max_attempts": 3},
      "checkpoint": true
    },
    {
      "id": "left",
      "skill": "go-lark",
      "depends_on": ["discover"],
      "preconditions": [],
      "requires": [{"path": ".go-beast/context.md", "type": "file", "non_empty": true, "sections": []}],
      "produces": [{"path": ".go-beast/left.md", "type": "file", "non_empty": true, "sections": []}],
      "transitions": ["join"],
      "parallel_group": "research",
      "retry": {"max_attempts": 2},
      "handoff": {"targets": ["codex", "claude-code"]}
    },
    {
      "id": "right",
      "skill": "go-fox",
      "depends_on": ["discover"],
      "preconditions": [],
      "requires": [{"path": ".go-beast/context.md", "type": "file", "non_empty": true, "sections": []}],
      "produces": [{"path": ".go-beast/right.md", "type": "file", "non_empty": true, "sections": []}],
      "transitions": ["join"],
      "parallel_group": "research",
      "retry": {"max_attempts": 2},
      "handoff": {"targets": ["codex", "claude-code"]}
    },
    {
      "id": "join",
      "skill": "go-fox",
      "depends_on": ["left", "right"],
      "preconditions": [],
      "requires": [],
      "produces": [{"path": ".go-beast/join.md", "type": "file", "non_empty": true, "sections": []}],
      "transitions": []
    }
  ]
}
JSON

cat > "$TEST_DIR/project/workflows/legacy.json" <<'JSON'
{
  "schema_version": 1,
  "id": "legacy",
  "version": 1,
  "mode": "warn",
  "phases": [
    {
      "id": "legacy",
      "skill": "go-hawk",
      "depends_on": [],
      "preconditions": [],
      "requires": [],
      "produces": [],
      "transitions": []
    }
  ]
}
JSON

cd "$TEST_DIR/project"
CLI=(node "$TEST_DIR/package/bin/go-beast.mjs")

plan="$(${CLI[@]} workflow plan --file workflows/parallel-route.json --format json)"
PLAN="$plan" node - <<'NODE'
const plan = JSON.parse(process.env.PLAN)
if (plan.schema_version !== 1 || plan.parallel_slices[0].id !== 'research') process.exit(1)
if (plan.order.join(',') !== 'discover,left,right,join') process.exit(1)
NODE

"${CLI[@]}" workflow validate --file workflows/parallel-route.json
"${CLI[@]}" workflow start --file workflows/parallel-route.json
mkdir -p .go-beast
printf '# Context\n' > .go-beast/context.md
"${CLI[@]}" workflow begin --file workflows/parallel-route.json --phase discover
"${CLI[@]}" workflow checkpoint --file workflows/parallel-route.json --phase discover --name discovery --artifact .go-beast/context.md
"${CLI[@]}" workflow complete --file workflows/parallel-route.json --phase discover
"${CLI[@]}" workflow continue --file workflows/parallel-route.json

node - <<'NODE'
const state = require('./.go-beast/workflows/parallel-route.json')
if (state.schema_version !== 2 || state.phases.left.status !== 'running' || state.phases.right.status !== 'running') process.exit(1)
if (state.phases.left.attempts !== 1 || state.phases.right.attempts !== 1) process.exit(1)
NODE

"${CLI[@]}" workflow handoff --file workflows/parallel-route.json --phase right --to codex --note "Review route"
"${CLI[@]}" workflow resume --file workflows/parallel-route.json
node - <<'NODE'
const state = require('./.go-beast/workflows/parallel-route.json')
if (state.phases.left.status !== 'interrupted' || state.phases.right.status !== 'handoff_pending') process.exit(1)
if (!state.phases.discover.checkpoints[0].provenance.artifacts[0].sha256) process.exit(1)
if (!state.history.some(event => event.event === 'handoff')) process.exit(1)
NODE

"${CLI[@]}" workflow retry --file workflows/parallel-route.json --phase left
"${CLI[@]}" workflow continue --file workflows/parallel-route.json
printf '# Left\n' > .go-beast/left.md
printf '# Right\n' > .go-beast/right.md
"${CLI[@]}" workflow complete --file workflows/parallel-route.json --phase left
"${CLI[@]}" workflow complete --file workflows/parallel-route.json --phase right
"${CLI[@]}" workflow continue --file workflows/parallel-route.json
printf '# Join\n' > .go-beast/join.md
"${CLI[@]}" workflow complete --file workflows/parallel-route.json --phase join

node - <<'NODE'
const state = require('./.go-beast/workflows/parallel-route.json')
if (state.phases.left.status !== 'completed' || state.phases.left.attempts !== 2) process.exit(1)
if (state.phases.join.status !== 'completed') process.exit(1)
if (!state.history.some(event => event.event === 'retry')) process.exit(1)
NODE

mkdir -p .go-beast/workflows
node - <<'NODE'
const fs = require('fs')
const manifest = require('./workflows/legacy.json')
fs.writeFileSync('.go-beast/workflows/legacy.json', JSON.stringify({
  schema_version: 1,
  revision: 4,
  workflow_id: 'legacy',
  manifest_version: 1,
  mode: 'warn',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  phases: { legacy: { status: 'running', skill: 'go-hawk', started_at: '2026-01-01T00:00:00.000Z' } },
  history: [],
  manifest,
}, null, 2))
NODE
"${CLI[@]}" workflow resume --file workflows/legacy.json
node - <<'NODE'
const state = require('./.go-beast/workflows/legacy.json')
if (state.schema_version !== 2 || state.phases.legacy.status !== 'interrupted') process.exit(1)
if (!state.history.some(event => event.event === 'migrate')) process.exit(1)
NODE

echo 'Workflow v2 engine tests passed'
