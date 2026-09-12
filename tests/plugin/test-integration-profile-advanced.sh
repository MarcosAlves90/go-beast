#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_HOME="$(mktemp -d)"
MIGRATION_HOME="$(mktemp -d)"
CONFLICT_HOME="$(mktemp -d)"

cleanup() {
  rm -rf "$TEST_HOME" "$MIGRATION_HOME" "$CONFLICT_HOME"
}
trap cleanup EXIT

run_integration() {
  HOME="$TEST_HOME" node "$REPO_ROOT/bin/go-beast.mjs" integration "$@" \
    --repo "$REPO_ROOT" \
    --home "$TEST_HOME"
}

if ! initial_status=$(run_integration preset list --format json 2>&1); then
  printf '%s\n' 'INTEGRATION_PROFILE_ADVANCED_RED'
  printf '%s\n' "$initial_status"
  exit 1
fi

mkdir -p "$MIGRATION_HOME/.codex/skills"
ln -s "$REPO_ROOT/skills/go-hawk" "$MIGRATION_HOME/.codex/skills/go-hawk"
HOME="$MIGRATION_HOME" node "$REPO_ROOT/bin/go-beast.mjs" integration sync \
  --agent codex --repo "$REPO_ROOT" --home "$MIGRATION_HOME" --format json \
  > "$MIGRATION_HOME/sync.json"

node - "$MIGRATION_HOME/.go-beast/config.json" <<'NODE'
const fs = require('fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const skills = profile.agents.codex.skills
if (skills.mode !== 'selected' || skills.enabled.length !== 1 || skills.enabled[0] !== 'go-hawk') {
  throw new Error('legacy managed installation was not adopted as selected')
}
NODE
test -L "$MIGRATION_HOME/.codex/skills/go-hawk"
test ! -e "$MIGRATION_HOME/.codex/skills/go-bear"

mkdir -p "$TEST_HOME/.codex"
HOME="$TEST_HOME" node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_HOME/install.log"

dependency_output="$TEST_HOME/dependency.json"
run_integration disable --agent codex --kind skill --name go-hawk --format json > "$dependency_output"
node - "$dependency_output" "$TEST_HOME/.go-beast/config.json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const profile = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
if (!result.warnings.some(warning => warning.includes('go-fox'))) {
  throw new Error('disabling a skill dependency did not warn about go-fox')
}
if (!profile.agents.codex.skills.disabled.includes('go-hawk')) {
  throw new Error('dependency mutation was not persisted')
}
NODE

status=$(run_integration status --agent codex --format json)
node - "$status" <<'NODE'
const status = JSON.parse(process.argv[2])
const dependent = status.skills.find(item => item.name === 'go-fox')
if (!dependent || !dependent.blocked || dependent.classification !== 'dependency-missing') {
  throw new Error('status did not expose a blocked dependent skill')
}
if (!dependent.dependencies.missing.includes('go-hawk')) {
  throw new Error('status did not report the missing skill dependency')
}
NODE

mkdir -p "$CONFLICT_HOME/.codex/skills/go-fox"
node - "$CONFLICT_HOME/.go-beast/config.json" <<'NODE'
const fs = require('fs')
const path = process.argv[2]
fs.mkdirSync(require('path').dirname(path), { recursive: true })
fs.writeFileSync(path, JSON.stringify({
  schemaVersion: 1,
  agents: {
    codex: {
      skills: { mode: 'all', disabled: [] },
      hooks: { mode: 'all', disabled: [] }
    }
  }
}, null, 2) + '\n')
NODE
conflict_status=$(HOME="$CONFLICT_HOME" node "$REPO_ROOT/bin/go-beast.mjs" integration status \
  --agent codex --repo "$REPO_ROOT" --home "$CONFLICT_HOME" --format json)
node - "$conflict_status" <<'NODE'
const status = JSON.parse(process.argv[2])
const conflict = status.skills.find(item => item.name === 'go-fox')
if (!conflict || conflict.state !== 'unmanaged' || conflict.classification !== 'conflict' || !conflict.blocked) {
  throw new Error('status did not distinguish a blocked unmanaged conflict')
}
NODE

run_integration export --agent codex --output "$TEST_HOME/export.json" --format json > "$TEST_HOME/export-result.json"
test -s "$TEST_HOME/export.json"

run_integration preset save minimal --agent codex --format json > "$TEST_HOME/preset-save.json"
run_integration disable --agent codex --kind skill --name go-bear --format json > "$TEST_HOME/disable-bear.json"
run_integration preset apply minimal --agent codex --format json > "$TEST_HOME/preset-apply.json"

node - "$TEST_HOME/.go-beast/config.json" <<'NODE'
const fs = require('fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (profile.agents.codex.skills.disabled.includes('go-bear')) {
  throw new Error('preset apply did not restore the saved skill policy')
}
if (!profile.presets.codex || !profile.presets.codex.minimal) throw new Error('named preset was not persisted')
NODE

node - "$TEST_HOME/export.json" "$TEST_HOME/import.json" <<'NODE'
const fs = require('fs')
const source = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
source.skills = { mode: 'selected', enabled: ['go-bear'] }
fs.writeFileSync(process.argv[3], JSON.stringify(source, null, 2) + '\n')
NODE
before_import=$(node -e "process.stdout.write(require('fs').readFileSync(process.argv[1], 'utf8'))" "$TEST_HOME/.go-beast/config.json")
dry_import=$(run_integration import --agent codex --input "$TEST_HOME/import.json" --dry-run --format json)
printf '%s' "$dry_import" | rg -q 'go-bear'
after_dry_import=$(node -e "process.stdout.write(require('fs').readFileSync(process.argv[1], 'utf8'))" "$TEST_HOME/.go-beast/config.json")
test "$before_import" = "$after_dry_import"

run_integration import --agent codex --input "$TEST_HOME/import.json" --format json > "$TEST_HOME/import-result.json"
node - "$TEST_HOME/.go-beast/config.json" <<'NODE'
const fs = require('fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const skills = profile.agents.codex.skills
if (skills.mode !== 'selected' || skills.enabled.length !== 1 || skills.enabled[0] !== 'go-bear') {
  throw new Error('profile import did not replace the selected agent policy')
}
NODE
test -L "$TEST_HOME/.codex/skills/go-bear"
test ! -e "$TEST_HOME/.codex/skills/go-fox"

printf '%s\n' '{"schemaVersion":999}' > "$TEST_HOME/invalid-import.json"
if run_integration import --agent codex --input "$TEST_HOME/invalid-import.json" --format json > "$TEST_HOME/invalid-import.log" 2>&1; then
  echo "invalid profile import unexpectedly succeeded" >&2
  exit 1
fi

test -L "$REPO_ROOT/plugins/go-beast/skills/go-bear"
echo "Advanced integration profile tests passed"
