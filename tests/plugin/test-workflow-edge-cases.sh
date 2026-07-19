#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT

mkdir -p "$TEST_DIR/package/bin" "$TEST_DIR/package/scripts" "$TEST_DIR/project/workflows" "$TEST_DIR/project/subdir"
cp "$REPO_ROOT/bin/go-beast.mjs" "$TEST_DIR/package/bin/"
cp "$REPO_ROOT/scripts/workflow.mjs" "$REPO_ROOT/scripts/workflow-roots.mjs" "$REPO_ROOT/scripts/transversal-rules.mjs" "$TEST_DIR/package/scripts/"
cp "$REPO_ROOT/go-beast.workflow.schema.json" "$TEST_DIR/package/"

CLI=(node "$TEST_DIR/package/bin/go-beast.mjs")

run_cli() {
  (
    cd "$TEST_DIR/project"
    "${CLI[@]}" "$@"
  )
}

run_cli_with_env() {
  local mode="$1"
  shift
  (
    cd "$TEST_DIR/project"
    GO_BEAST_WORKFLOW_MODE="$mode" "${CLI[@]}" "$@"
  )
}

run_cli_with_env_and_cli_mode() {
  local environment_mode="$1"
  local cli_mode="$2"
  shift 2
  (
    cd "$TEST_DIR/project"
    GO_BEAST_WORKFLOW_MODE="$environment_mode" "${CLI[@]}" "$@" --mode "$cli_mode"
  )
}

expect_failure() {
  local label="$1"
  local expected_pattern="$2"
  local expected_status="$3"
  shift 3
  local output status
  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e
  if [ "$status" -ne "$expected_status" ]; then
    echo "[FAIL] $label: expected exit $expected_status, got $status"
    echo "$output"
    return 1
  fi
  if ! printf '%s\n' "$output" | grep -Eq -- "$expected_pattern"; then
    echo "[FAIL] $label: expected output pattern $expected_pattern"
    echo "$output"
    return 1
  fi
  echo "[PASS] $label"
}

expect_success() {
  local label="$1"
  local expected_pattern="$2"
  shift 2
  local output
  if ! output="$("$@" 2>&1)"; then
    echo "[FAIL] $label: command failed"
    echo "$output"
    return 1
  fi
  if ! printf '%s\n' "$output" | grep -Eq -- "$expected_pattern"; then
    echo "[FAIL] $label: expected output pattern $expected_pattern"
    echo "$output"
    return 1
  fi
  echo "[PASS] $label"
}

write_manifest() {
  local id="$1"
  local mode="$2"
  local variant="$3"
  node - "$TEST_DIR/project/workflows/$id.json" "$id" "$mode" "$variant" <<'NODE'
const fs = require('node:fs')

const [, , target, id, mode, variant] = process.argv
const artifact = {
  path: `.go-beast/example/${id}.md`,
  type: 'file',
  non_empty: true,
  sections: ['# Artifact'],
}
const phase = (phaseId, dependsOn = [], transitions = [], produces = []) => ({
  id: phaseId,
  skill: 'test-skill',
  depends_on: dependsOn,
  preconditions: [],
  requires: [],
  produces,
  transitions,
})

let phases = [phase('phase', [], [], [artifact])]
if (variant === 'duplicate-id') phases = [phase('phase'), phase('phase')]
if (variant === 'unknown-dependency') phases = [phase('phase', ['missing'])]
if (variant === 'cycle') phases = [phase('a', ['b'], ['b']), phase('b', ['a'], ['a'])]
if (variant === 'invalid-transition') phases = [phase('a'), phase('b', ['a'])]

const manifest = { schema_version: 1, id, version: 1, phases }
if (mode !== 'none') manifest.mode = mode
fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`)
NODE
}

prepare_workflow() {
  local id="$1"
  local mode="$2"
  write_manifest "$id" "$mode" valid
  run_cli workflow start --file "workflows/$id.json" >/dev/null
  run_cli workflow begin --file "workflows/$id.json" --phase phase >/dev/null
}

for variant in duplicate-id unknown-dependency cycle invalid-transition; do
  id="invalid-$variant"
  write_manifest "$id" none "$variant"
  case "$variant" in
    duplicate-id) pattern='duplicate phase: phase' ;;
    unknown-dependency) pattern='unknown dependency: missing' ;;
    cycle) pattern='dependency cycle detected' ;;
    invalid-transition) pattern='does not allow transition to b' ;;
  esac
  expect_failure "rejects $variant" "$pattern" 1 run_cli workflow validate --file "workflows/$id.json"
done

prepare_workflow state-corrupt none
printf '{' > "$TEST_DIR/project/.go-beast/workflows/state-corrupt.json"
expect_failure 'rejects corrupt state JSON' 'Workflow validation failed:' 1 run_cli workflow status --file workflows/state-corrupt.json

prepare_workflow state-incompatible none
node - "$TEST_DIR/project/.go-beast/workflows/state-incompatible.json" <<'NODE'
const fs = require('node:fs')
const file = process.argv[2]
const state = JSON.parse(fs.readFileSync(file, 'utf8'))
state.manifest_version = 999
fs.writeFileSync(file, `${JSON.stringify(state)}\n`)
NODE
expect_failure 'rejects incompatible state' 'persisted state does not match the manifest version' 1 run_cli workflow status --file workflows/state-incompatible.json

prepare_workflow state-incomplete none
node - "$TEST_DIR/project/.go-beast/workflows/state-incomplete.json" <<'NODE'
const fs = require('node:fs')
const file = process.argv[2]
fs.writeFileSync(file, JSON.stringify({ schema_version: 1, workflow_id: 'state-incomplete', manifest_version: 1, revision: 0 }))
NODE
expect_failure 'rejects incomplete state' 'persisted state is incomplete: phases are missing' 1 run_cli workflow status --file workflows/state-incomplete.json

for artifact_case in missing empty wrong-type; do
  id="artifact-$artifact_case"
  prepare_workflow "$id" strict
  artifact="$TEST_DIR/project/.go-beast/example/$id.md"
  case "$artifact_case" in
    empty) mkdir -p "$(dirname "$artifact")"; : > "$artifact"; pattern='artifact is empty' ;;
    wrong-type) mkdir -p "$artifact"; pattern='artifact is not a file' ;;
    missing) pattern='missing artifact' ;;
  esac
  expect_failure "rejects $artifact_case artifact" "$pattern" 1 run_cli workflow complete --file "workflows/$id.json" --phase phase --mode strict
done

id=artifact-unreadable
prepare_workflow "$id" strict
artifact="$TEST_DIR/project/.go-beast/example/$id.md"
printf '# Artifact\n' > "$artifact"
chmod 000 "$artifact"
if [ -r "$artifact" ]; then
  echo '[SKIP] rejects unreadable artifact (filesystem permits owner read despite chmod)'
else
  expect_failure 'rejects unreadable artifact' 'Workflow validation failed:.*ermission denied|EACCES' 1 run_cli workflow complete --file "workflows/$id.json" --phase phase --mode strict
fi
chmod 644 "$artifact"

prepare_workflow mode-default none
expect_success 'uses default warn mode' 'WARN:.*missing artifact' run_cli workflow complete --file workflows/mode-default.json --phase phase

prepare_workflow mode-manifest strict
expect_failure 'manifest mode blocks missing artifact' 'missing artifact' 1 run_cli workflow complete --file workflows/mode-manifest.json --phase phase

prepare_workflow mode-environment none
expect_failure 'environment mode overrides manifest mode' 'missing artifact' 1 run_cli_with_env strict workflow complete --file workflows/mode-environment.json --phase phase

prepare_workflow mode-cli none
expect_success 'CLI mode overrides environment mode' 'WARN:.*missing artifact' run_cli_with_env_and_cli_mode strict warn workflow complete --file workflows/mode-cli.json --phase phase

prepare_workflow mode-cli-strict none
expect_failure 'CLI strict mode overrides environment off' 'missing artifact' 1 run_cli_with_env_and_cli_mode off strict workflow complete --file workflows/mode-cli-strict.json --phase phase

expect_failure 'unknown workflow command uses usage exit code' 'unknown workflow command' 2 run_cli workflow unknown --file workflows/mode-default.json
expect_failure 'missing phase uses usage exit code' '--phase must identify a phase' 2 run_cli workflow begin --file workflows/mode-default.json

LINK_PROJECT="$TEST_DIR/link-project"
mkdir -p "$LINK_PROJECT/node_modules" "$LINK_PROJECT/workflows" "$LINK_PROJECT/subdir"
ln -s "$TEST_DIR/package" "$LINK_PROJECT/node_modules/go-beast"
cp "$TEST_DIR/project/workflows/mode-default.json" "$LINK_PROJECT/workflows/linked.json"
(
  cd "$LINK_PROJECT/subdir"
  node "$LINK_PROJECT/node_modules/go-beast/bin/go-beast.mjs" workflow validate --file workflows/linked.json
)
echo '[PASS] linked package works from a project subdirectory'

ARCHIVE_PROJECT="$TEST_DIR/archive-project"
ARCHIVE_PACKAGE="$TEST_DIR/archive-source/go-beast"
mkdir -p "$ARCHIVE_PROJECT/workflows" "$ARCHIVE_PROJECT/subdir" "$(dirname "$ARCHIVE_PACKAGE")"
cp -R "$TEST_DIR/package" "$ARCHIVE_PACKAGE"
cp "$TEST_DIR/project/workflows/mode-default.json" "$ARCHIVE_PROJECT/workflows/archive.json"
(
  cd "$ARCHIVE_PROJECT/subdir"
  node "$ARCHIVE_PACKAGE/bin/go-beast.mjs" workflow validate --file workflows/archive.json
)
echo '[PASS] archive-style package works from a project subdirectory'

echo '[PASS] workflow edge-case coverage completed'
