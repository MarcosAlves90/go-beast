#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT

mkdir -p "$TEST_DIR/installed/bin" "$TEST_DIR/installed/scripts" "$TEST_DIR/project/workflows" "$TEST_DIR/project/subdir" "$TEST_DIR/caller"
cp "$REPO_ROOT/bin/go-beast.mjs" "$TEST_DIR/installed/bin/"
cp "$REPO_ROOT/scripts/workflow.mjs" "$REPO_ROOT/scripts/workflow-roots.mjs" "$REPO_ROOT/scripts/transversal-rules.mjs" "$TEST_DIR/installed/scripts/"
cp "$REPO_ROOT/go-beast.workflow.schema.json" "$TEST_DIR/installed/"
cp "$REPO_ROOT/workflows/minimal-pipeline.json" "$TEST_DIR/project/workflows/"

(
  cd "$TEST_DIR/project/subdir"
  node "$TEST_DIR/installed/bin/go-beast.mjs" workflow validate --file workflows/minimal-pipeline.json
  node "$TEST_DIR/installed/bin/go-beast.mjs" workflow start --file workflows/minimal-pipeline.json
)
[ -f "$TEST_DIR/project/.go-beast/workflows/minimal-pipeline.json" ]

(
  cd "$TEST_DIR/caller"
  node "$TEST_DIR/installed/bin/go-beast.mjs" workflow validate --root "$TEST_DIR/project" --file workflows/minimal-pipeline.json
)

mkdir -p "$TEST_DIR/repo/bin" "$TEST_DIR/repo/scripts" "$TEST_DIR/repo/workflows"
cp "$REPO_ROOT/bin/go-beast.mjs" "$TEST_DIR/repo/bin/"
cp "$REPO_ROOT/scripts/workflow.mjs" "$REPO_ROOT/scripts/workflow-roots.mjs" "$REPO_ROOT/scripts/transversal-rules.mjs" "$TEST_DIR/repo/scripts/"
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

sleep 5 &
LIVE_PID=$!
LIVE_PID="$LIVE_PID" node -e "const fs=require('fs'); const os=require('os'); fs.writeFileSync('.go-beast/workflows/locks/minimal-pipeline.lock', JSON.stringify({lock_id:'live-old-lock',pid:Number(process.env.LIVE_PID),hostname:os.hostname(),agent:'test',session_id:'live',created_at:'2000-01-01T00:00:00.000Z'}))"
if node bin/go-beast.mjs workflow begin --mode strict --file workflows/minimal-pipeline.json --phase discover > live-lock.out 2>&1; then
  echo '[FAIL] old lock with a live process was treated as stale'
  exit 1
fi
assert_contains live-lock.out 'WORKFLOW_LOCK_CONFLICT' 'live PID prevents timeout-only expiration'
kill "$LIVE_PID"
wait "$LIVE_PID" 2>/dev/null || true
node bin/go-beast.mjs workflow unlock --file workflows/minimal-pipeline.json

GO_BEAST_WORKFLOW_TEST_HOLD_LOCK_MS=5000 node bin/go-beast.mjs workflow begin --file workflows/minimal-pipeline.json --phase discover > killed-holder.out 2>&1 &
KILLED_PID=$!
for attempt in $(seq 1 50); do
  [ -f .go-beast/workflows/locks/minimal-pipeline.lock ] && break
  sleep 0.01
done
kill -KILL "$KILLED_PID"
wait "$KILLED_PID" 2>/dev/null || true
if node bin/go-beast.mjs workflow begin --mode strict --file workflows/minimal-pipeline.json --phase discover > killed-lock.out 2>&1; then
  echo '[FAIL] SIGKILL lock was not detected as stale'
  exit 1
fi
assert_contains killed-lock.out 'WORKFLOW_LOCK_STALE' 'SIGKILL leaves a recoverable stale lock'
node bin/go-beast.mjs workflow unlock --file workflows/minimal-pipeline.json

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

mkdir -p workflows/diamond .go-beast/diamond
cat > workflows/diamond/manifest.json <<'EOF'
{
  "schema_version": 1,
  "id": "diamond",
  "version": 1,
  "mode": "strict",
  "phases": [
    { "id": "root", "skill": "go-hawk", "depends_on": [], "preconditions": [], "requires": [], "produces": [], "transitions": ["left", "right"] },
    { "id": "left", "skill": "go-lark", "depends_on": ["root"], "preconditions": [], "requires": [], "produces": [], "transitions": ["join"] },
    { "id": "right", "skill": "go-fox", "depends_on": ["root"], "preconditions": [], "requires": [], "produces": [], "transitions": ["join"] },
    { "id": "join", "skill": "go-eagle", "depends_on": ["left", "right"], "preconditions": [], "requires": [], "produces": [], "transitions": [] }
  ]
}
EOF
node bin/go-beast.mjs workflow start --file workflows/diamond/manifest.json
for phase in root left right join; do
  node bin/go-beast.mjs workflow begin --file workflows/diamond/manifest.json --phase "$phase"
  node bin/go-beast.mjs workflow complete --file workflows/diamond/manifest.json --phase "$phase"
done
node bin/go-beast.mjs workflow begin --mode warn --file workflows/diamond/manifest.json --phase root > diamond-invalidation.out 2>&1
assert_contains diamond-invalidation.out 'dependent phase invalidated: left' 'diamond invalidates the left branch'
assert_contains diamond-invalidation.out 'dependent phase invalidated: right' 'diamond invalidates the right branch'
assert_contains diamond-invalidation.out 'dependent phase invalidated: join' 'diamond invalidates the converging phase'
if [ "$(grep -c 'dependent phase invalidated: join' diamond-invalidation.out)" -ne 1 ]; then
  echo '[FAIL] diamond converging phase was invalidated more than once'
  exit 1
fi
node -e "const s=require('./.go-beast/workflows/diamond.json'); if (s.phases.left.status !== 'invalidated' || s.phases.right.status !== 'invalidated' || s.phases.join.status !== 'invalidated') process.exit(1)"

rm .go-beast/example/discovery.md
if node bin/go-beast.mjs workflow begin --mode strict --file workflows/minimal-pipeline.json --phase explore > strict.out 2>&1; then
  echo '[FAIL] strict workflow mode allows missing required artifact'
  exit 1
fi
assert_contains strict.out 'missing artifact' 'strict mode blocks missing artifact'

GO_BEAST_WORKFLOW_MODE=off node bin/go-beast.mjs workflow begin --file workflows/minimal-pipeline.json --phase explore
if GO_BEAST_WORKFLOW_TEST_REPLACE_LOCK=1 node bin/go-beast.mjs workflow begin --file workflows/minimal-pipeline.json --phase discover > ownership.out 2>&1; then
  echo '[FAIL] lock replacement was removed by the original owner'
  exit 1
fi
assert_contains ownership.out 'WORKFLOW_LOCK_OWNERSHIP' 'lock release validates ownership after replacement'
rm -f .go-beast/workflows/locks/minimal-pipeline.lock
node -e "const fs=require('fs'); fs.writeFileSync('.go-beast/workflows/locks/minimal-pipeline.lock', JSON.stringify({pid:999999,hostname:'unknown-host',agent:'test',session_id:'stale',created_at:'2000-01-01T00:00:00.000Z'}))"
node bin/go-beast.mjs workflow unlock --file workflows/minimal-pipeline.json
[ ! -e .go-beast/workflows/locks/minimal-pipeline.lock ]
echo '[PASS] workflow engine coordinates, persists, resumes, and enforces modes'
