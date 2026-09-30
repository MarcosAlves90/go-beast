#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_ROOT="$(mktemp -d)"
TEST_HOME="$TEST_ROOT/home"
HERMES_HOME="$TEST_ROOT/hermes-home"
CLI=(node "$REPO_ROOT/bin/go-beast.mjs")

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT
mkdir -p "$TEST_HOME"

run_integration() {
  HOME="$TEST_HOME" HERMES_HOME="$HERMES_HOME" "${CLI[@]}" integration "$@" \
    --repo "$REPO_ROOT" \
    --home "$TEST_HOME"
}

if ! status=$(run_integration status --agent hermes --format json 2>&1); then
  printf '%s\n' 'HERMES_INTEGRATION_RED'
  printf '%s\n' "$status"
  exit 1
fi

node - "$status" <<'NODE'
const status = JSON.parse(process.argv[2])
if (status.agent !== 'hermes') throw new Error('integration status did not identify Hermes')
if (!Array.isArray(status.hooks) || status.hooks.length !== 0) throw new Error('Hermes must remain a skills-only integration')
NODE

test ! -e "$HERMES_HOME/config.yaml"
test ! -e "$HERMES_HOME/SOUL.md"
test ! -e "$HERMES_HOME/plugins"

run_integration sync --agent hermes --format json > "$TEST_ROOT/sync.json"
HERMES_HOME="$HERMES_HOME" node - "$REPO_ROOT" "$HERMES_HOME" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [repoRoot, hermesHome] = process.argv.slice(2)
for (const skill of ['go-hawk', 'go-fox']) {
  const source = path.join(repoRoot, 'skills', skill)
  const target = path.join(hermesHome, 'skills', 'go-beast', skill)
  const stat = fs.lstatSync(target)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${skill} was not installed as an independent directory copy`)
  if (fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8') !== fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')) {
    throw new Error(`${skill} copy differs from its canonical source`)
  }
}
const home = path.join(path.dirname(hermesHome), 'home')
const profile = JSON.parse(fs.readFileSync(path.join(home, '.go-beast', 'config.json'), 'utf8'))
if (!profile.agents.hermes?.managedSkillCopies?.['go-hawk']) throw new Error('copy ownership metadata was not recorded')
NODE

node - "$TEST_HOME/.go-beast/config.json" <<'NODE'
const fs = require('node:fs')
const filePath = process.argv[2]
const profile = JSON.parse(fs.readFileSync(filePath, 'utf8'))
profile.agents.hermes.managedSkillCopies['go-fox'].source_sha256 = '0'.repeat(64)
fs.writeFileSync(filePath, `${JSON.stringify(profile, null, 2)}\n`)
NODE
status=$(run_integration status --agent hermes --format json)
node - "$status" <<'NODE'
const status = JSON.parse(process.argv[2])
const skill = status.skills.find(item => item.name === 'go-fox')
if (!skill?.updateAvailable) throw new Error('status did not report a safe refresh for an unchanged copy')
NODE
run_integration sync --agent hermes --format json > "$TEST_ROOT/refresh.json"
node - "$TEST_HOME/.go-beast/config.json" <<'NODE'
const fs = require('node:fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (profile.agents.hermes.managedSkillCopies['go-fox'].source_sha256 === '0'.repeat(64)) {
  throw new Error('sync did not refresh the ownership digest')
}
NODE

printf '\nUser edit\n' >> "$HERMES_HOME/skills/go-beast/go-hawk/SKILL.md"
run_integration sync --agent hermes --format json > "$TEST_ROOT/resync.json"
grep -Fq 'User edit' "$HERMES_HOME/skills/go-beast/go-hawk/SKILL.md"

run_integration disable --agent hermes --kind skill --name go-hawk --format json > "$TEST_ROOT/disable-edited.json"
test -f "$HERMES_HOME/skills/go-beast/go-hawk/SKILL.md"
run_integration disable --agent hermes --kind skill --name go-fox --dry-run --format json > "$TEST_ROOT/disable-clean-dry-run.json"
test -f "$HERMES_HOME/skills/go-beast/go-fox/SKILL.md"
run_integration disable --agent hermes --kind skill --name go-fox --format json > "$TEST_ROOT/disable-clean.json"
test ! -e "$HERMES_HOME/skills/go-beast/go-fox"

status=$(run_integration status --agent hermes --format json)
node - "$status" <<'NODE'
const status = JSON.parse(process.argv[2])
const edited = status.skills.find(item => item.name === 'go-hawk')
const clean = status.skills.find(item => item.name === 'go-fox')
if (!edited || edited.state !== 'unmanaged') throw new Error('edited skill was not preserved as unmanaged')
if (!clean || clean.state !== 'disabled') throw new Error('unchanged disabled skill was not removed')
NODE

run_integration enable --agent hermes --kind skill --name go-fox --format json > "$TEST_ROOT/enable-clean.json"
test -f "$HERMES_HOME/skills/go-beast/go-fox/SKILL.md"

printf '%s\n' 'Hermes integration tests passed'