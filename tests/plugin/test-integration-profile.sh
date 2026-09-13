#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_HOME="$(mktemp -d)"

cleanup() {
  rm -rf "$TEST_HOME"
}
trap cleanup EXIT

run_integration() {
  HOME="$TEST_HOME" node "$REPO_ROOT/bin/go-beast.mjs" integration "$@" \
    --repo "$REPO_ROOT" \
    --home "$TEST_HOME"
}

if ! initial_status=$(run_integration status --agent codex --format json 2>&1); then
  printf '%s\n' 'INTEGRATION_PROFILE_RED'
  printf '%s\n' "$initial_status"
  exit 1
fi

mkdir -p "$TEST_HOME/.codex/hooks" "$TEST_HOME/.codex/skills/go-fox"
printf '#!/usr/bin/env bash\necho custom-stop\n' > "$TEST_HOME/.codex/hooks/custom-stop.sh"
chmod +x "$TEST_HOME/.codex/hooks/custom-stop.sh"
cat > "$TEST_HOME/.codex/hooks.json" <<'JSON'
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.codex/hooks/custom-stop.sh",
            "statusMessage": "Custom stop"
          }
        ]
      }
    ]
  }
}
JSON

run_integration disable --agent codex --kind skill --name go-bear --format json >/tmp/go-beast-integration-disable-skill.json
run_integration disable --agent codex --kind skill --name go-bear --format json >/tmp/go-beast-integration-disable-skill-again.json
run_integration disable --agent codex --kind hook --name docs-update-remind.sh --format json >/tmp/go-beast-integration-disable-hook.json

test -f "$TEST_HOME/.go-beast/config.json"
test ! -e "$TEST_HOME/.codex/skills/go-bear"
test -L "$TEST_HOME/.codex/skills/go-hawk"
test -d "$TEST_HOME/.codex/skills/go-fox"
test ! -e "$TEST_HOME/.codex/hooks/docs-update-remind.sh"

node - "$TEST_HOME/.go-beast/config.json" "$TEST_HOME/.codex/hooks.json" <<'NODE'
const fs = require('fs')
const [profilePath, hooksPath] = process.argv.slice(2)
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
const codex = profile.agents.codex
if (codex.skills.mode !== 'all' || !codex.skills.disabled.includes('go-bear')) throw new Error('skill disable was not persisted')
if (codex.hooks.mode !== 'all' || !codex.hooks.disabled.includes('docs-update-remind.sh')) throw new Error('hook disable was not persisted')
const stopHooks = hooks.hooks.Stop.flatMap(entry => entry.hooks ?? [])
if (!stopHooks.some(entry => entry.command === 'bash ~/.codex/hooks/custom-stop.sh')) throw new Error('custom hook was not preserved')
if (stopHooks.some(entry => entry.command === 'bash ~/.codex/hooks/docs-update-remind.sh')) throw new Error('disabled hook remains wired')
NODE

dry_run=$(run_integration enable --agent codex --kind skill --name go-bear --dry-run --format json)
grep -Fq 'go-bear' <<<"$dry_run"
grep -Fq 'create' <<<"$dry_run"
test ! -e "$TEST_HOME/.codex/skills/go-bear"

run_integration enable --agent codex --kind skill --name go-bear --format json >/tmp/go-beast-integration-enable-skill.json
test -L "$TEST_HOME/.codex/skills/go-bear"

run_integration disable --agent codex --kind skill --name go-bear --format json >/tmp/go-beast-integration-disable-skill-final.json
run_integration sync --agent codex --format json >/tmp/go-beast-integration-sync-codex.json
test ! -e "$TEST_HOME/.codex/skills/go-bear"
test ! -e "$TEST_HOME/.codex/hooks/docs-update-remind.sh"

run_integration sync --agent claude-code --format json >/tmp/go-beast-integration-sync-claude.json
test -L "$TEST_HOME/.claude/skills/go-bear"

status=$(run_integration status --agent codex --format json)
node - "$status" <<'NODE'
const status = JSON.parse(process.argv[2])
const skill = status.skills.find(item => item.name === 'go-bear')
const conflict = status.skills.find(item => item.name === 'go-fox')
const hook = status.hooks.find(item => item.name === 'docs-update-remind.sh')
if (!skill || skill.desired !== 'disabled' || skill.state !== 'disabled') throw new Error('status did not report disabled skill')
if (!conflict || conflict.state !== 'unmanaged') throw new Error('status did not report unmanaged skill conflict')
if (!hook || hook.desired !== 'disabled' || hook.state !== 'disabled') throw new Error('status did not report disabled hook')
NODE

test -L "$REPO_ROOT/plugins/go-beast/skills/go-bear"
echo "Integration profile tests passed"
