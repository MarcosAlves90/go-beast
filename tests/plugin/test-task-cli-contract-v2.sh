#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI=(node "$REPO_ROOT/bin/go-beast.mjs")
SNAPSHOT="$REPO_ROOT/tests/fixtures/task-cli-v2/help.txt"

if [ ! -f "$SNAPSHOT" ]; then
  echo 'V2_TASK_CLI_CONTRACT_RED'
  exit 1
fi

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

> "$TEST_ROOT/help.txt"
"${CLI[@]}" init --help > "$TEST_ROOT/help.txt"
diff -u "$SNAPSHOT" "$TEST_ROOT/help.txt"

grep -Fq 'Compatibility namespaces remain available:' "$TEST_ROOT/help.txt"
grep -Fq 'doctor' "$TEST_ROOT/help.txt"
grep -Fq 'workflow' "$TEST_ROOT/help.txt"

"${CLI[@]}" init --root "$TEST_ROOT" --id contract-task --agent codex --format json > "$TEST_ROOT/init.json"
node - "$TEST_ROOT/init.json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.schema_version !== 2 || result.command !== 'init' || result.task_id !== 'contract-task') throw new Error('JSON task envelope snapshot is invalid')
if (result.task?.compatibility?.v2_facade !== true) throw new Error('v2 compatibility metadata is missing')
if (!Array.isArray(result.task?.compatibility?.v1_namespaces) || !result.task.compatibility.v1_namespaces.includes('workflow')) throw new Error('v1 namespace migration metadata is missing')
NODE

"${CLI[@]}" capabilities validate --format json > "$TEST_ROOT/capabilities.json"
node - "$TEST_ROOT/capabilities.json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.valid !== true) throw new Error('v1 capabilities compatibility command failed')
NODE

echo 'Task CLI v2 contract snapshots passed'
