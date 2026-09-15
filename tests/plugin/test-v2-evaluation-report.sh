#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ ! -f "$REPO_ROOT/scripts/v2-validation-report.mjs" ]; then
  echo 'V2_EVALUATION_REPORT_RED'
  exit 1
fi

TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

node "$REPO_ROOT/scripts/v2-validation-report.mjs" \
  --repo "$REPO_ROOT" \
  --output "$TEST_ROOT/report.json" \
  --format json

node - "$TEST_ROOT/report.json" "$REPO_ROOT" <<'NODE'
const fs = require('fs')

const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const repoRoot = process.argv[3]

if (report.schema_version !== 1 || report.kind !== 'go_beast_v2_evaluation_report') throw new Error('evaluation report schema is invalid')
if (report.repository.root !== repoRoot) throw new Error('evaluation report root is not canonical')
if (report.deterministic.unit_tests.status !== 'passed') throw new Error('deterministic unit baseline did not pass')
if (report.live_matrix.inventory.status !== 'passed') throw new Error('live matrix inventory did not pass')
if (report.live_matrix.inventory.suites.length !== 3) throw new Error('live matrix must contain three harness suites')
if (report.live_matrix.execution.status !== 'not_requested') throw new Error('offline report must not claim live execution')

for (const name of ['go-skill-eval', 'go-hook-eval']) {
  const evaluation = report.workflow_evals[name]
  if (evaluation.structural_status !== 'passed') throw new Error(`${name} structural evaluation did not pass`)
  if (evaluation.execution_status !== 'not_measured') throw new Error(`${name} execution must remain explicitly unmeasured`)
}

if (!report.limitations.some(item => /live-agent/i.test(item))) throw new Error('live-agent limitation is missing')
if (!report.limitations.some(item => /LLM/i.test(item))) throw new Error('LLM limitation is missing')
console.log('V2 evaluation report tests passed')
NODE
