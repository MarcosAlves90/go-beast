#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT

mkdir -p "$TEST_DIR/installed/bin" "$TEST_DIR/installed/scripts" "$TEST_DIR/project/workflows" "$TEST_DIR/project/schemas"
cp "$REPO_ROOT/bin/go-beast.mjs" "$TEST_DIR/installed/bin/"
cp "$REPO_ROOT/scripts/workflow.mjs" "$REPO_ROOT/scripts/workflow-roots.mjs" "$REPO_ROOT/scripts/transversal-rules.mjs" "$TEST_DIR/installed/scripts/"
cp "$REPO_ROOT/go-beast.workflow.schema.json" "$TEST_DIR/installed/"

cd "$TEST_DIR/project"
CLI=(node "$TEST_DIR/installed/bin/go-beast.mjs")
mkdir -p .go-beast

run_cli() {
  "${CLI[@]}" "$@"
}

write_manifest() {
  local id="$1"
  local artifact_json="$2"
  ARTIFACT_JSON="$artifact_json" node - "$TEST_DIR/project/workflows/$id.json" "$id" <<'NODE'
const fs = require('node:fs')

const [, , target, id] = process.argv
const artifact = JSON.parse(process.env.ARTIFACT_JSON)
const manifest = {
  schema_version: 2,
  id,
  version: 1,
  mode: 'strict',
  phases: [{
    id: 'produce',
    skill: 'test-skill',
    depends_on: [],
    preconditions: [],
    requires: [],
    produces: [artifact],
    transitions: [],
  }],
}
fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`)
NODE
}

prepare_workflow() {
  local id="$1"
  local artifact_json="$2"
  write_manifest "$id" "$artifact_json"
  run_cli workflow start --file "workflows/$id.json" >/dev/null
  run_cli workflow begin --file "workflows/$id.json" --phase produce >/dev/null
}

expect_success() {
  local label="$1"
  local pattern="$2"
  shift 2
  local output
  if ! output="$($@ 2>&1)"; then
    echo "[FAIL] $label"
    echo "$output"
    return 1
  fi
  if ! grep -Eq -- "$pattern" <<<"$output"; then
    echo "[FAIL] $label"
    echo "Expected pattern: $pattern"
    echo "$output"
    return 1
  fi
  echo "[PASS] $label"
}

expect_failure() {
  local label="$1"
  local pattern="$2"
  shift 2
  local output
  if output="$($@ 2>&1)"; then
    echo "[FAIL] $label: command unexpectedly succeeded"
    echo "$output"
    return 1
  fi
  if ! grep -Eq -- "$pattern" <<<"$output"; then
    echo "[FAIL] $label"
    echo "Expected pattern: $pattern"
    echo "$output"
    return 1
  fi
  echo "[PASS] $label"
}

printf '# Report\nStatus: PASS\n' > .go-beast/multiple.md
prepare_workflow multiple '{"path":".go-beast/multiple.md","type":"file","validators":[{"type":"non-empty"},{"type":"markdown-heading","text":"Report","level":1},{"type":"contains-pattern","pattern":"Status: (PASS|WARN)"}]}'
expect_success 'runs multiple validators for one artifact' 'Phase completed: produce' run_cli workflow complete --file workflows/multiple.json --phase produce

printf 'The document is called Report, but this is not a heading.\n' > .go-beast/incidental.md
prepare_workflow incidental '{"path":".go-beast/incidental.md","type":"file","non_empty":false,"validators":[{"type":"markdown-heading","text":"Report","level":1}]}'
expect_failure 'rejects incidental text as a Markdown heading' 'artifact \.go-beast/incidental\.md validator 1 \(markdown-heading\): missing Markdown heading' run_cli workflow complete --file workflows/incidental.json --phase produce

printf '```markdown\n# Report\n```\n' > .go-beast/fenced.md
prepare_workflow fenced '{"path":".go-beast/fenced.md","type":"file","non_empty":false,"validators":[{"type":"markdown-heading","text":"Report","level":1}]}'
expect_failure 'rejects headings inside fenced code blocks' 'artifact \.go-beast/fenced\.md validator 1 \(markdown-heading\): missing Markdown heading' run_cli workflow complete --file workflows/fenced.json --phase produce

printf '    # Report\n' > .go-beast/indented.md
prepare_workflow indented '{"path":".go-beast/indented.md","type":"file","non_empty":false,"validators":[{"type":"markdown-heading","text":"Report","level":1}]}'
expect_failure 'rejects indented code as a Markdown heading' 'artifact \.go-beast/indented\.md validator 1 \(markdown-heading\): missing Markdown heading' run_cli workflow complete --file workflows/indented.json --phase produce

cat > schemas/profile.schema.json <<'JSON'
{
  "type": "object",
  "required": ["name", "enabled"],
  "additionalProperties": false,
  "properties": {
    "name": { "type": "string", "minLength": 1 },
    "enabled": { "type": "boolean" }
  }
}
JSON
printf '{"name":"go-beast","enabled":true}\n' > .go-beast/profile.json
prepare_workflow json-schema '{"path":".go-beast/profile.json","type":"file","non_empty":true,"validators":[{"type":"json-schema","schema":"schemas/profile.schema.json"}]}'
expect_success 'validates JSON artifacts against a repository schema' 'Phase completed: produce' run_cli workflow complete --file workflows/json-schema.json --phase produce

printf '{"name":42,"enabled":true}\n' > .go-beast/profile-invalid.json
prepare_workflow json-schema-invalid '{"path":".go-beast/profile-invalid.json","type":"file","non_empty":true,"validators":[{"type":"json-schema","schema":"schemas/profile.schema.json"}]}'
expect_failure 'reports JSON Schema violations with artifact and validator' 'artifact \.go-beast/profile-invalid\.json validator 1 \(json-schema\): JSON Schema violation' run_cli workflow complete --file workflows/json-schema-invalid.json --phase produce

printf 'name: go-beast\nenabled: true\n' > .go-beast/config.yaml
prepare_workflow yaml-valid '{"path":".go-beast/config.yaml","type":"file","non_empty":true,"validators":[{"type":"yaml-valid"}]}'
expect_success 'validates YAML artifacts' 'Phase completed: produce' run_cli workflow complete --file workflows/yaml-valid.json --phase produce

printf 'name:\n  nested: value\n   broken: value\n' > .go-beast/config-invalid.yaml
prepare_workflow yaml-invalid '{"path":".go-beast/config-invalid.yaml","type":"file","non_empty":true,"validators":[{"type":"yaml-valid"}]}'
expect_failure 'rejects invalid YAML artifacts' 'artifact \.go-beast/config-invalid\.yaml validator 1 \(yaml-valid\): YAML validation failed' run_cli workflow complete --file workflows/yaml-invalid.json --phase produce

write_manifest unsafe-pattern '{"path":".go-beast/multiple.md","type":"file","non_empty":false,"validators":[{"type":"contains-pattern","pattern":"(?=Status)"}]}'
expect_failure 'rejects unsafe pattern validators during manifest validation' 'validators\[0\]\.pattern cannot use lookaround assertions' run_cli workflow validate --file workflows/unsafe-pattern.json

write_manifest nested-pattern '{"path":".go-beast/multiple.md","type":"file","non_empty":false,"validators":[{"type":"contains-pattern","pattern":"(a+)+$"}]}'
expect_failure 'rejects nested quantifier patterns during manifest validation' 'validators\[0\]\.pattern cannot use nested quantifiers' run_cli workflow validate --file workflows/nested-pattern.json

echo 'Workflow artifact validator tests passed'
