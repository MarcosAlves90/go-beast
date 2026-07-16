#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT

mkdir -p "$TEST_DIR/repo/bin" "$TEST_DIR/repo/scripts" "$TEST_DIR/repo/workflows"
cp "$REPO_ROOT/bin/go-beast.mjs" "$TEST_DIR/repo/bin/"
cp "$REPO_ROOT/scripts/workflow.mjs" "$REPO_ROOT/scripts/transversal-rules.mjs" "$TEST_DIR/repo/scripts/"
cp "$REPO_ROOT/go-beast.workflow.schema.json" "$TEST_DIR/repo/"
cp "$REPO_ROOT/workflows/minimal-pipeline.json" "$TEST_DIR/repo/workflows/"

cd "$TEST_DIR/repo"
node bin/go-beast.mjs workflow validate --all
node bin/go-beast.mjs workflow start --file workflows/minimal-pipeline.json

GO_BEAST_WORKFLOW_TEST_HOLD_LOCK_MS=500 node bin/go-beast.mjs workflow begin --file workflows/minimal-pipeline.json --phase discover > holder.out 2>&1 &
HOLDER_PID=$!
for attempt in $(seq 1 50); do
  [ -f .go-beast/workflows/locks/minimal-pipeline.lock ] && break
  sleep 0.01
done
if node bin/go-beast.mjs workflow begin --mode strict --file workflows/minimal-pipeline.json --phase discover > conflict.out 2>&1; then
  echo '[FAIL] concurrent workflow writer was not rejected'
  exit 1
fi
assert_contains conflict.out 'WORKFLOW_LOCK_CONFLICT' 'concurrent writer receives an identifiable conflict'
wait "$HOLDER_PID"

node bin/go-beast.mjs workflow begin --file workflows/minimal-pipeline.json --phase discover

node -e "const fs=require('fs'); fs.mkdirSync('.go-beast/example', {recursive:true}); fs.writeFileSync('.go-beast/example/discovery.md', '# Discovery\\n')"
node bin/go-beast.mjs workflow complete --file workflows/minimal-pipeline.json --phase discover
node bin/go-beast.mjs workflow begin --file workflows/minimal-pipeline.json --phase explore
node -e "const fs=require('fs'); fs.writeFileSync('.go-beast/example/approach.md', '# Approach\\n')"
node bin/go-beast.mjs workflow complete --file workflows/minimal-pipeline.json --phase explore

node bin/go-beast.mjs workflow begin --file workflows/minimal-pipeline.json --phase discover
assert_contains .go-beast/workflows/minimal-pipeline.json '"explore": {' 'workflow state persists dependent phase'
assert_contains .go-beast/workflows/minimal-pipeline.json '"status": "invalidated"' 'rerun invalidates dependent phase'
assert_contains .go-beast/workflows/minimal-pipeline.json '"revision": [1-9]' 'workflow state revision advances on writes'

rm .go-beast/example/discovery.md
if node bin/go-beast.mjs workflow begin --mode strict --file workflows/minimal-pipeline.json --phase explore > strict.out 2>&1; then
  echo '[FAIL] strict workflow mode allows missing required artifact'
  exit 1
fi
assert_contains strict.out 'missing artifact' 'strict mode blocks missing artifact'

GO_BEAST_WORKFLOW_MODE=off node bin/go-beast.mjs workflow begin --file workflows/minimal-pipeline.json --phase explore
node -e "const fs=require('fs'); fs.writeFileSync('.go-beast/workflows/locks/minimal-pipeline.lock', JSON.stringify({pid:999999,hostname:'unknown-host',agent:'test',session_id:'stale',created_at:'2000-01-01T00:00:00.000Z'}))"
node bin/go-beast.mjs workflow unlock --file workflows/minimal-pipeline.json
[ ! -e .go-beast/workflows/locks/minimal-pipeline.lock ]
echo '[PASS] workflow engine coordinates, persists, resumes, and enforces modes'
