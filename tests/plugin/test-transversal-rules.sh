#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT

FIXTURE="$TEST_DIR/repo"
mkdir -p "$FIXTURE/docs/architecture" "$FIXTURE/scripts" "$FIXTURE/hooks" "$FIXTURE/workflows"
cp "$REPO_ROOT/go-beast.manifest.yaml" "$REPO_ROOT/go-beast.manifest.schema.json" "$FIXTURE/"
cp "$REPO_ROOT/scripts/transversal-rules.mjs" "$FIXTURE/scripts/"
cp -R "$REPO_ROOT/skills" "$FIXTURE/"
cp "$REPO_ROOT/AGENTS.global.md" "$REPO_ROOT/AGENTS.bootstrap.md" "$REPO_ROOT/AGENTS.md" "$FIXTURE/"
cp "$REPO_ROOT/docs/PIPELINE.md" "$FIXTURE/docs/"
cp "$REPO_ROOT/hooks/go-beast-user-prompt-context.sh" "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" "$FIXTURE/hooks/"
cp "$REPO_ROOT/workflows/go-skill-eval.js" "$REPO_ROOT/workflows/go-hook-eval.js" "$FIXTURE/workflows/"
cp "$REPO_ROOT/docs/architecture/TRANSVERSAL_RULES.md" "$FIXTURE/docs/architecture/"
cp "$REPO_ROOT/docs/architecture/transversal-rules-index.json" "$FIXTURE/docs/architecture/"

node "$FIXTURE/scripts/transversal-rules.mjs" check --root "$FIXTURE"
echo '[PASS] committed transversal surfaces are synchronized'

printf '\nManual repository note.\n' >> "$FIXTURE/AGENTS.global.md"
node "$FIXTURE/scripts/transversal-rules.mjs" generate --root "$FIXTURE"
assert_contains "$FIXTURE/AGENTS.global.md" 'Manual repository note\.' 'generation preserves manual content'

node -e "const fs=require('fs'); const p=process.argv[1]; fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Security and correctness take priority', 'Changed generated rule'))" "$FIXTURE/docs/architecture/TRANSVERSAL_RULES.md"
if node "$FIXTURE/scripts/transversal-rules.mjs" check --root "$FIXTURE" > "$TEST_DIR/drift.out" 2>&1; then
  echo '[FAIL] drift check accepts stale generated documentation'
  exit 1
fi
assert_contains "$TEST_DIR/drift.out" 'TRANSVERSAL_RULES.md is out of date' 'drift check rejects stale output'

printf '\n<!-- BEGIN GENERATED: transversal-rules -->\n' >> "$FIXTURE/AGENTS.md"
if node "$FIXTURE/scripts/transversal-rules.mjs" check --root "$FIXTURE" > "$TEST_DIR/marker.out" 2>&1; then
  echo '[FAIL] marker check accepts duplicate generated markers'
  exit 1
fi
assert_contains "$TEST_DIR/marker.out" 'exactly one generated marker pair' 'marker check rejects duplicate markers'

cp "$REPO_ROOT/AGENTS.global.md" "$REPO_ROOT/AGENTS.bootstrap.md" "$REPO_ROOT/AGENTS.md" "$FIXTURE/"
cp "$REPO_ROOT/docs/PIPELINE.md" "$REPO_ROOT/docs/architecture/TRANSVERSAL_RULES.md" "$REPO_ROOT/docs/architecture/transversal-rules-index.json" "$FIXTURE/docs/architecture/"
sed -i.bak '/BEGIN GENERATED: skill-contract/,/END GENERATED: skill-contract/d' "$FIXTURE/skills/go-hawk/SKILL.md"
if node "$FIXTURE/scripts/transversal-rules.mjs" check --root "$FIXTURE" > "$TEST_DIR/skill-marker.out" 2>&1; then
  echo '[FAIL] marker check accepts a missing skill contract marker pair'
  exit 1
fi
assert_contains "$TEST_DIR/skill-marker.out" 'exactly one skill contract marker pair' 'marker check rejects missing skill contract markers'
cp "$REPO_ROOT/skills/go-hawk/SKILL.md" "$FIXTURE/skills/go-hawk/SKILL.md"

node -e "const fs=require('fs'); const p=process.argv[1]; fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('schema_version: 2', 'schema_version: 1'))" "$FIXTURE/go-beast.manifest.yaml"
node -e "const fs=require('fs'); const p=process.argv[1]; fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('schema_version: 1', 'schema_version: 2'))" "$FIXTURE/go-beast.manifest.yaml"
if node "$FIXTURE/scripts/transversal-rules.mjs" check --root "$FIXTURE" > "$TEST_DIR/schema.out" 2>&1; then
  echo '[FAIL] schema check accepts an unsupported schema version'
  exit 1
fi
assert_contains "$TEST_DIR/schema.out" 'unsupported schema_version 2' 'schema check rejects unsupported versions'

node -e "const fs=require('fs'); const p=process.argv[1]; fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('schema_version: 2', 'schema_version: 1'))" "$FIXTURE/go-beast.manifest.yaml"
node -e "const fs=require('fs'); const p=process.argv[1]; fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('alias: discover', 'alias: security'))" "$FIXTURE/go-beast.manifest.yaml"
if node "$FIXTURE/scripts/transversal-rules.mjs" check --root "$FIXTURE" > "$TEST_DIR/alias.out" 2>&1; then
  echo '[FAIL] alias check accepts duplicate aliases'
  exit 1
fi
assert_contains "$TEST_DIR/alias.out" 'duplicate skill alias' 'alias check rejects duplicate aliases'

echo '[PASS] transversal rules generation tests'
