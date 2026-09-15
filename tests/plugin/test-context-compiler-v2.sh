#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

if [ ! -f "$REPO_ROOT/scripts/context-compiler.mjs" ]; then
  echo 'V2_CONTEXT_COMPILER_RED'
  exit 1
fi

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT

mkdir -p "$TEST_DIR/package/bin" "$TEST_DIR/package/scripts" "$TEST_DIR/package/skills" "$TEST_DIR/project/workflows"
cp "$REPO_ROOT/bin/go-beast.mjs" "$TEST_DIR/package/bin/"
cp "$REPO_ROOT/scripts/context-compiler.mjs" "$REPO_ROOT/scripts/workflow.mjs" "$REPO_ROOT/scripts/workflow-roots.mjs" "$REPO_ROOT/scripts/transversal-rules.mjs" "$TEST_DIR/package/scripts/"
cp "$REPO_ROOT/go-beast.workflow.schema.json" "$TEST_DIR/package/"
cp -R "$REPO_ROOT/skills/go-squirrel" "$TEST_DIR/package/skills/"

KB_ROOT="$TEST_DIR/project/knowledge"
TOOL="$TEST_DIR/package/skills/go-squirrel/scripts/kb-tool.mjs"
node "$TOOL" init \
  --root "$KB_ROOT" \
  --kb-id context-fixture \
  --title "Context fixture" \
  --purpose "Bounded workflow context regression fixture." \
  --format md:plain
node "$TOOL" add --root "$KB_ROOT" --record-file "$REPO_ROOT/skills/go-squirrel/references/examples/deployment-record.json"
node "$TOOL" add --root "$KB_ROOT" --record-file "$REPO_ROOT/skills/go-squirrel/references/examples/record.json"
node - "$TEST_DIR/open-question.json" <<'NODE'
const fs = require('fs')
const record = require('./skills/go-squirrel/references/examples/record.json')
record.id = 'open-cache-question'
record.title = 'Open cache invalidation question'
record.record_type = 'hypothesis'
record.status = 'draft'
record.summary = 'Benchmark whether cache invalidation remains safe for the next release.'
record.content = 'The cache policy may need a benchmark before the next release.'
record.tags = ['cache', 'open-question']
record.references = ['records/cache-decision.md']
record.epistemic_status = 'hypothesis'
record.provenance = [{ origin: 'agent', actor: 'context-fixture', source: 'workflow-test', captured_at: '2026-09-14T00:00:00.000Z', note: 'Fixture question.' }]
fs.writeFileSync(process.argv[2], JSON.stringify(record, null, 2))
NODE
node "$TOOL" add --root "$KB_ROOT" --record-file "$TEST_DIR/open-question.json"
node "$TOOL" validate --root "$KB_ROOT"

cat > "$TEST_DIR/project/workflows/context-workflow.json" <<'JSON'
{
  "schema_version": 2,
  "id": "context-workflow",
  "version": 1,
  "mode": "strict",
  "phases": [
    {
      "id": "plan",
      "skill": "go-lark",
      "depends_on": [],
      "preconditions": [],
      "requires": [],
      "produces": [],
      "transitions": [],
      "checkpoint": true
    }
  ]
}
JSON

cd "$TEST_DIR/project"
CLI=(node "$TEST_DIR/package/bin/go-beast.mjs")
"${CLI[@]}" workflow start --file workflows/context-workflow.json
"${CLI[@]}" workflow begin --file workflows/context-workflow.json --phase plan
"${CLI[@]}" context compile \
  --kb-root knowledge \
  --workflow-file workflows/context-workflow.json \
  --phase plan \
  --task "Decide how to prepare the cache plan" \
  --records cache-decision,open-cache-question \
  --max-records 3 \
  --max-tokens 800 \
  --output .go-beast/context-entry.json \
  --format json

node - <<'NODE'
const packet = require('./.go-beast/context-entry.json')
if (packet.kind !== 'context_packet' || packet.phase.id !== 'plan') process.exit(1)
if (packet.records.length > 3 || packet.budget.used_tokens > 800) process.exit(1)
if (!packet.decisions.some(item => item.id === 'cache-decision')) process.exit(1)
if (!packet.open_questions.some(item => item.id === 'open-cache-question')) process.exit(1)
if (packet.validation_evidence.status !== 'PASS') process.exit(1)
if (!packet.records.every(item => /^[a-f0-9]{64}$/.test(item.sha256))) process.exit(1)
if (!packet.provenance.record_hashes['cache-decision']) process.exit(1)
if (packet.conflicts.length === 0) process.exit(1)
NODE

"${CLI[@]}" context verify --kb-root knowledge --packet .go-beast/context-entry.json
cp knowledge/records/cache-decision.md cache-decision.backup
printf '\nChanged after compile.\n' >> knowledge/records/cache-decision.md
if "${CLI[@]}" context verify --kb-root knowledge --packet .go-beast/context-entry.json > stale.out 2>&1; then
  echo '[FAIL] stale context packet was accepted'
  exit 1
fi
assert_contains stale.out 'stale record' 'context verification rejects stale records'
mv cache-decision.backup knowledge/records/cache-decision.md

cat > completion.json <<'JSON'
{
  "decisions": [{"id": "cache-decision", "summary": "Keep the bounded cache policy for this phase.", "status": "accepted"}],
  "open_questions": [{"id": "open-cache-question", "question": "Run the release benchmark before changing the policy."}],
  "validation_evidence": [{"path": "KB_VALIDATION.md", "status": "PASS"}],
  "provenance": [{"origin": "agent", "actor": "context-fixture", "source": "phase-run", "captured_at": "2026-09-14T00:00:00.000Z", "note": "Recorded after phase review."}]
}
JSON
"${CLI[@]}" context finalize --kb-root knowledge --packet .go-beast/context-entry.json --completion completion.json --output .go-beast/context-final.json
"${CLI[@]}" workflow complete --file workflows/context-workflow.json --phase plan --context .go-beast/context-final.json

node - <<'NODE'
const state = require('./.go-beast/workflows/context-workflow.json')
const context = state.phases.plan.context
if (state.phases.plan.status !== 'completed') process.exit(1)
if (!context || !/^[a-f0-9]{64}$/.test(context.sha256)) process.exit(1)
if (context.decisions_count !== 1 || context.open_questions_count !== 1 || context.validation_status !== 'PASS') process.exit(1)
if (!state.history.some(event => event.event === 'complete' && event.context_path === '.go-beast/context-final.json')) process.exit(1)
NODE

echo 'Context compiler v2 tests passed'
