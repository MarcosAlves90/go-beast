#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI=(node "$REPO_ROOT/bin/go-beast.mjs")

if [[ ! -f "$REPO_ROOT/scripts/task-cli.mjs" || ! -f "$REPO_ROOT/go-beast.task.schema.json" ]]; then
  echo 'V2_TASK_CLI_RED'
  exit 1
fi

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

init_json="$TEST_ROOT/init.json"
"${CLI[@]}" init --root "$TEST_ROOT" --id task-local --agent codex --profile minimal --format json > "$init_json"
node - "$init_json" "$TEST_ROOT" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const root = process.argv[3]
if (result.command !== 'init' || result.task?.task_id !== 'task-local') throw new Error('init did not create the requested task')
if (!fs.existsSync(`${root}/.go-beast/tasks/task-local.json`)) throw new Error('init task record is missing')
NODE

plan_json="$TEST_ROOT/plan.json"
"${CLI[@]}" plan --root "$TEST_ROOT" --task task-local --kind feature --surface agnostic --format json > "$plan_json"
node - "$plan_json" "$TEST_ROOT" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const root = process.argv[3]
if (result.command !== 'plan' || result.task_id !== 'task-local' || !result.plan_path) throw new Error('plan envelope is incomplete')
if (!fs.existsSync(`${root}/${result.plan_path}`)) throw new Error('plan artifact is missing')
NODE

run_json="$TEST_ROOT/run.json"
"${CLI[@]}" run --root "$TEST_ROOT" --task task-local --adapter codex --format json > "$run_json"
node - "$run_json" "$TEST_ROOT" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const root = process.argv[3]
if (result.command !== 'run' || result.task_id !== 'task-local' || result.adapter !== 'go-beast-codex') throw new Error('run did not preserve task adapter identity')
if (!fs.existsSync(`${root}/${result.manifest_path}`)) throw new Error('run did not create workflow manifest')
NODE

status_json="$TEST_ROOT/status.json"
"${CLI[@]}" status --root "$TEST_ROOT" --task task-local --format json > "$status_json"
node - "$status_json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.command !== 'status' || result.task_id !== 'task-local' || !result.workflow) throw new Error('status did not expose workflow state')
NODE

resume_json="$TEST_ROOT/resume.json"
"${CLI[@]}" resume --root "$TEST_ROOT" --task task-local --format json > "$resume_json"
node - "$resume_json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.command !== 'resume' || result.task_id !== 'task-local') throw new Error('resume envelope is incomplete')
NODE

explain_json="$TEST_ROOT/explain.json"
"${CLI[@]}" explain capability go-hawk --format json > "$explain_json"
node - "$explain_json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.command !== 'explain' || result.subject !== 'capability' || result.capability?.id !== 'go-hawk') throw new Error('explain did not resolve go-hawk')
if (!result.capability.source || !result.capability.supports) throw new Error('explain omitted registry provenance')
NODE

audit_json="$TEST_ROOT/audit.json"
"${CLI[@]}" audit --root "$TEST_ROOT" --task task-local --format json > "$audit_json"
node - "$audit_json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.command !== 'audit' || result.task_id !== 'task-local' || result.passed !== true) throw new Error('audit did not report structural task evidence')
if (result.claims?.execution !== 'not_verified') throw new Error('audit fabricated execution evidence')
NODE

"${CLI[@]}" capabilities validate --format json > "$TEST_ROOT/v1-capabilities.json"
node - "$TEST_ROOT/v1-capabilities.json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.valid !== true) throw new Error('v1 capabilities namespace stopped working')
NODE

echo 'Task CLI v2 tests passed'
