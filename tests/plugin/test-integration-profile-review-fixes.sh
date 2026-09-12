#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EFFECTIVE_HOME="$(mktemp -d)"
HOOK_HOME="$(mktemp -d)"
CUSTOM_HOME="$(mktemp -d)"
PRESET_HOME="$(mktemp -d)"

cleanup() {
  rm -rf "$EFFECTIVE_HOME" "$HOOK_HOME" "$CUSTOM_HOME" "$PRESET_HOME"
}
trap cleanup EXIT

run_integration() {
  local home="$1"
  shift
  HOME="$home" node "$REPO_ROOT/bin/go-beast.mjs" integration "$@" \
    --repo "$REPO_ROOT" \
    --home "$home"
}

if ! node - "$REPO_ROOT/hooks/manifest.json" <<'NODE'
const fs = require('fs')
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const hooks = manifest.hooks ?? manifest
const verify = hooks.find(hook => hook.name === 'code-verify-run.sh')
if (!verify || !verify.dependsOn?.includes('code-verify-flag.sh')) {
  throw new Error('canonical hook dependency metadata is missing')
}
NODE
then
  printf '%s\n' 'INTEGRATION_PROFILE_REVIEW_FIXES_RED'
  exit 1
fi

mkdir -p "$EFFECTIVE_HOME/.codex"
HOME="$EFFECTIVE_HOME" node "$REPO_ROOT/scripts/install.mjs" --all > /dev/null
rm "$EFFECTIVE_HOME/.codex/skills/go-hawk"
mkdir -p "$EFFECTIVE_HOME/.codex/skills/go-hawk"
run_integration "$EFFECTIVE_HOME" status --agent codex --format json > "$EFFECTIVE_HOME/status.json"
node - "$EFFECTIVE_HOME/status.json" <<'NODE'
const fs = require('fs')
const status = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const prerequisite = status.skills.find(item => item.name === 'go-hawk')
const dependent = status.skills.find(item => item.name === 'go-fox')
if (!prerequisite || prerequisite.state !== 'unmanaged' || !prerequisite.blocked) {
  throw new Error('status did not block the unmanaged prerequisite')
}
if (!dependent || dependent.state !== 'enabled' || dependent.classification !== 'dependency-missing' || !dependent.blocked) {
  throw new Error('status did not block the dependent on the effective prerequisite set')
}
if (!dependent.dependencies.missing.includes('go-hawk')) {
  throw new Error('status did not report the unavailable prerequisite')
}
NODE

mkdir -p "$HOOK_HOME/.codex"
HOME="$HOOK_HOME" node "$REPO_ROOT/scripts/install.mjs" --all > /dev/null
run_integration "$HOOK_HOME" disable --agent codex --kind hook --name code-verify-flag.sh --cascade --format json > "$HOOK_HOME/disable.json"
node - "$HOOK_HOME/.go-beast/config.json" "$HOOK_HOME/disable.json" "$HOOK_HOME/.codex/hooks.json" <<'NODE'
const fs = require('fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const result = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
const hooks = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'))
const disabled = profile.agents.codex.hooks.disabled
if (!disabled.includes('code-verify-flag.sh') || !disabled.includes('code-verify-run.sh')) {
  throw new Error('hook cascade did not persist the dependent disablement')
}
if (!result.cascadeDisabled.includes('code-verify-run.sh')) {
  throw new Error('hook cascade did not report the dependent')
}
const commands = Object.values(hooks.hooks).flatMap(entries => entries ?? [])
  .flatMap(entry => entry.hooks ?? [])
  .map(entry => entry.command)
if (commands.some(command => /code-verify-(flag|run)\.sh$/.test(command))) {
  throw new Error('cascaded hooks remain wired')
}
NODE

mkdir -p "$CUSTOM_HOME/.codex/hooks"
node - "$CUSTOM_HOME/.codex/hooks.json" <<'NODE'
const fs = require('fs')
const path = process.argv[2]
fs.writeFileSync(path, JSON.stringify({
  hooks: {
    SessionStart: [{
      hooks: [{
        type: 'command',
        command: 'bash ~/.codex/hooks/go-beast-session-state.sh',
        statusMessage: 'USER CUSTOM MESSAGE',
      }],
    }],
  },
}, null, 2) + '\n')
NODE
run_integration "$CUSTOM_HOME" sync --agent codex --format json > "$CUSTOM_HOME/sync.json"
node - "$CUSTOM_HOME/.codex/hooks.json" <<'NODE'
const fs = require('fs')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const entries = config.hooks.SessionStart.flatMap(entry => entry.hooks ?? [])
if (!entries.some(entry => entry.statusMessage === 'USER CUSTOM MESSAGE')) {
  throw new Error('custom same-command hook was overwritten')
}
if (!entries.some(entry => entry.statusMessage === 'Initializing go-beast session state')) {
  throw new Error('canonical hook was not refreshed beside the custom entry')
}
NODE
before_dry_disable=$(<"$CUSTOM_HOME/.codex/hooks.json")
run_integration "$CUSTOM_HOME" disable --agent codex --kind hook --name go-beast-session-state.sh --dry-run --format json > "$CUSTOM_HOME/dry-disable-state.json"
after_dry_disable=$(<"$CUSTOM_HOME/.codex/hooks.json")
test "$before_dry_disable" = "$after_dry_disable"
run_integration "$CUSTOM_HOME" disable --agent codex --kind hook --name go-beast-session-state.sh --format json > "$CUSTOM_HOME/disable-state.json"
node - "$CUSTOM_HOME/.codex/hooks.json" <<'NODE'
const fs = require('fs')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const entries = config.hooks.SessionStart.flatMap(entry => entry.hooks ?? [])
if (!entries.some(entry => entry.statusMessage === 'USER CUSTOM MESSAGE')) {
  throw new Error('custom same-command hook was removed during disable')
}
if (entries.some(entry => entry.statusMessage === 'Initializing go-beast session state')) {
  throw new Error('canonical disabled hook remains configured')
}
NODE
test ! -e "$CUSTOM_HOME/.codex/hooks/go-beast-session-state.sh"

run_integration "$PRESET_HOME" preset save minimal --agent codex --format json > "$PRESET_HOME/save-codex.json"
run_integration "$PRESET_HOME" preset save minimal --agent claude-code --format json > "$PRESET_HOME/save-claude.json"
run_integration "$PRESET_HOME" preset list --format json > "$PRESET_HOME/presets.json"
node - "$PRESET_HOME/presets.json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const agents = result.presets.filter(preset => preset.name === 'minimal').map(preset => preset.agent).sort()
if (agents.join(',') !== 'claude-code,codex') {
  throw new Error('same-named presets were not isolated per agent')
}
NODE
run_integration "$PRESET_HOME" disable --agent codex --kind skill --name go-bear --format json > "$PRESET_HOME/disable-bear.json"
run_integration "$PRESET_HOME" preset apply minimal --agent codex --format json > "$PRESET_HOME/apply-codex.json"
run_integration "$PRESET_HOME" preset delete minimal --agent codex --format json > "$PRESET_HOME/delete-codex.json"
run_integration "$PRESET_HOME" preset list --format json > "$PRESET_HOME/presets-after-delete.json"
node - "$PRESET_HOME/presets-after-delete.json" <<'NODE'
const fs = require('fs')
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (result.presets.length !== 1 || result.presets[0].agent !== 'claude-code') {
  throw new Error('deleting one agent preset removed another agent preset')
}
NODE

run_integration "$PRESET_HOME" export --agent codex --output "$PRESET_HOME/export.json" --format json > "$PRESET_HOME/export-result.json"
node - "$PRESET_HOME/export.json" "$PRESET_HOME/import.json" <<'NODE'
const fs = require('fs')
const source = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
source.skills = { mode: 'selected', enabled: ['go-bear'] }
fs.writeFileSync(process.argv[3], JSON.stringify(source, null, 2) + '\n')
NODE
before_import=$(<"$PRESET_HOME/.go-beast/config.json")
dry_import=$(run_integration "$PRESET_HOME" import --agent codex --input "$PRESET_HOME/import.json" --dry-run --format text)
[[ "$dry_import" == *"preview:"* ]]
after_dry_import=$(<"$PRESET_HOME/.go-beast/config.json")
test "$before_import" = "$after_dry_import"

test -L "$REPO_ROOT/plugins/go-beast/skills/go-bear"
echo "Integration profile review-fix tests passed"
