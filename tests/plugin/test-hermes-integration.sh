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

node - "$status" "$HERMES_HOME" <<'NODE'
const path = require('node:path')
const status = JSON.parse(process.argv[2])
const hermesHome = process.argv[3]
if (status.agent !== 'hermes') throw new Error('integration status did not identify Hermes')
if (!Array.isArray(status.hooks) || status.hooks.length !== 0) throw new Error('Hermes must not expose hooks')
if (!Array.isArray(status.instructions)) throw new Error('HERMES_PROFILE_SOUL_RED: Hermes status omitted profile instructions')
const soul = status.instructions.find(item => item.name === 'global')
if (!soul || soul.target !== path.join(hermesHome, 'SOUL.md')) {
  throw new Error('HERMES_PROFILE_SOUL_RED: Hermes instruction target must be this profile SOUL.md')
}
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

for profile in coder research replaced failure import-failure configure-failure persist-failure import-write-failure import-no-instructions-write-failure configure-write-failure sync-failure preview preview-preserve; do
  mkdir -p "$HERMES_HOME/profiles/$profile"
  printf '%s\n' '{}' > "$HERMES_HOME/profiles/$profile/config.yaml"
done

status=$(run_integration status --agent hermes --hermes-profile coder --format json)
node - "$status" "$HERMES_HOME/profiles/coder" <<'NODE'
const path = require('node:path')
const status = JSON.parse(process.argv[2])
const home = process.argv[3]
if (status.hermesHome !== home) throw new Error('named Hermes profile resolved to the wrong home')
const soul = status.instructions?.find(item => item.name === 'global')
if (!soul || soul.target !== path.join(home, 'SOUL.md')) throw new Error('profile status omitted its SOUL target')
NODE

run_integration enable --agent hermes --kind instructions --name global --hermes-profile coder --format json > "$TEST_ROOT/coder-enable.json"
run_integration enable --agent hermes --kind instructions --name global --hermes-profile research --bootstrap --format json > "$TEST_ROOT/research-enable.json"
node - "$REPO_ROOT" "$HERMES_HOME" "$TEST_HOME/.go-beast/config.json" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [repoRoot, hermesRoot, configPath] = process.argv.slice(2)
const coderHome = path.join(hermesRoot, 'profiles', 'coder')
const researchHome = path.join(hermesRoot, 'profiles', 'research')
if (fs.readFileSync(path.join(coderHome, 'SOUL.md'), 'utf8') !== fs.readFileSync(path.join(repoRoot, 'AGENTS.global.md'), 'utf8')) {
  throw new Error('standard contract was not installed into the selected profile SOUL.md')
}
if (fs.readFileSync(path.join(researchHome, 'SOUL.md'), 'utf8') !== fs.readFileSync(path.join(repoRoot, 'AGENTS.bootstrap.md'), 'utf8')) {
  throw new Error('bootstrap contract was not installed into the selected profile SOUL.md')
}
if (fs.existsSync(path.join(hermesRoot, 'SOUL.md'))) throw new Error('named profile selection changed the default SOUL.md')
const profile = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const coderKey = path.resolve(coderHome)
const researchKey = path.resolve(researchHome)
if (profile.agents.hermes.instructionsByHome?.[coderKey]?.source !== 'global') throw new Error('standard source selection was not scoped to coder')
if (profile.agents.hermes.instructionsByHome?.[researchKey]?.source !== 'bootstrap') throw new Error('bootstrap source selection was not scoped to research')
NODE

printf '\nUser edit\n' >> "$HERMES_HOME/profiles/coder/SOUL.md"
run_integration sync --agent hermes --hermes-profile coder --format json > "$TEST_ROOT/coder-resync.json"
run_integration disable --agent hermes --kind instructions --name global --hermes-profile coder --format json > "$TEST_ROOT/coder-disable.json"
grep -Fq 'User edit' "$HERMES_HOME/profiles/coder/SOUL.md"

printf '%s\n' 'user-owned profile identity' > "$HERMES_HOME/profiles/replaced/SOUL.md"
run_integration enable --agent hermes --kind instructions --name global --hermes-profile replaced --format json > "$TEST_ROOT/replaced-enable.json"
cmp "$REPO_ROOT/AGENTS.global.md" "$HERMES_HOME/profiles/replaced/SOUL.md"
node - "$TEST_HOME/.go-beast/install-transactions" "$HERMES_HOME/profiles/replaced/SOUL.md" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [transactionsDir, target] = process.argv.slice(2)
let found = false
for (const entry of fs.readdirSync(transactionsDir)) {
  const root = path.join(transactionsDir, entry)
  const recordPath = path.join(root, 'transaction.json')
  if (!fs.existsSync(recordPath)) continue
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  for (const snapshot of record.snapshots ?? []) {
    if (snapshot.target !== target) continue
    if (snapshot.state !== 'file' || !snapshot.backup) throw new Error('explicit SOUL replacement did not snapshot the prior file')
    const backup = path.join(root, 'backups', snapshot.backup)
    if (fs.readFileSync(backup, 'utf8') !== 'user-owned profile identity\n') throw new Error('SOUL transaction snapshot did not preserve original bytes')
    found = true
  }
}
if (!found) throw new Error('explicit SOUL replacement has no transaction snapshot')
NODE
HOME="$TEST_HOME" USERPROFILE="$TEST_HOME" HERMES_HOME="$HERMES_HOME" \
  node "$REPO_ROOT/scripts/install.mjs" --rollback --hermes-profile replaced > "$TEST_ROOT/replaced-rollback.json"
test "$(<"$HERMES_HOME/profiles/replaced/SOUL.md")" = 'user-owned profile identity'

review_failures=0
mkdir -p "$HERMES_HOME/profiles/failure/SOUL.md"
if run_integration enable --agent hermes --kind instructions --name global --hermes-profile failure --format json > "$TEST_ROOT/failure-enable.json" 2>&1; then
  printf '%s\n' 'HERMES_RECONCILIATION_FAILURE_RED: failed SOUL installation exited successfully'
  review_failures=$((review_failures + 1))
fi
if node - "$TEST_HOME/.go-beast/config.json" "$HERMES_HOME/profiles/failure" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const hermesHome = path.resolve(process.argv[3])
const policy = profile.agents?.hermes?.instructionsByHome?.[hermesHome]?.policy
const enabled = policy?.mode === 'all'
  ? !policy.disabled?.includes('global')
  : policy?.enabled?.includes('global')
if (enabled) throw new Error('failed SOUL installation persisted the enabled instruction policy')
NODE
then
  :
else
  printf '%s\n' 'HERMES_RECONCILIATION_FAILURE_RED: failed SOUL installation persisted its policy'
  review_failures=$((review_failures + 1))
fi
test -d "$HERMES_HOME/profiles/failure/SOUL.md"

run_integration export --agent hermes --hermes-profile preview --output "$TEST_ROOT/hermes-import-preview.json" --format json > /dev/null
node - "$TEST_ROOT/hermes-import-preview.json" <<'NODE'
const fs = require('node:fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
profile.skills = { mode: 'selected', enabled: ['go-hawk'] }
profile.instructions = {
  policy: { mode: 'selected', enabled: ['global'] },
  source: 'global',
}
fs.writeFileSync(process.argv[2], `${JSON.stringify(profile, null, 2)}\n`)
NODE
mkdir -p "$HERMES_HOME/profiles/import-failure/SOUL.md"
if run_integration import --agent hermes --hermes-profile import-failure --input "$TEST_ROOT/hermes-import-preview.json" --format json > "$TEST_ROOT/failure-import.json" 2>&1; then
  printf '%s\n' 'HERMES_RECONCILIATION_FAILURE_RED: failed SOUL import exited successfully'
  review_failures=$((review_failures + 1))
fi
if node - "$TEST_HOME/.go-beast/config.json" "$HERMES_HOME/profiles/import-failure" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const hermesHome = path.resolve(process.argv[3])
const policy = profile.agents?.hermes?.instructionsByHome?.[hermesHome]?.policy
const enabled = policy?.mode === 'all'
  ? !policy.disabled?.includes('global')
  : policy?.enabled?.includes('global')
const copyPath = path.join(hermesHome, 'skills', 'go-beast', 'go-hawk')
const homeKey = process.platform === 'win32' ? hermesHome.toLowerCase() : hermesHome
const ownership = profile.agents?.hermes?.managedSkillCopiesByHome?.[homeKey]?.['go-hawk']
if (enabled) throw new Error('failed SOUL import persisted the enabled instruction policy')
if (fs.existsSync(copyPath) && !ownership) throw new Error('failed SOUL import left go-hawk installed without ownership metadata')
NODE
then
  :
else
  printf '%s\n' 'HERMES_RECONCILIATION_FAILURE_RED: failed SOUL import persisted policy or left an unowned skill copy'
  review_failures=$((review_failures + 1))
fi
test -d "$HERMES_HOME/profiles/import-failure/SOUL.md"

readonly_home="$TEST_ROOT/readonly-home"
mkdir -p "$HERMES_HOME/profiles/persist-failure/SOUL.md" "$readonly_home/.go-beast"
chmod 0555 "$readonly_home/.go-beast"
if HOME="$readonly_home" HERMES_HOME="$HERMES_HOME" "${CLI[@]}" integration import --agent hermes --hermes-profile persist-failure --input "$TEST_ROOT/hermes-import-preview.json" --home "$readonly_home" --repo "$REPO_ROOT" --format json > "$TEST_ROOT/readonly-import.json" 2>&1; then
  printf '%s\n' 'HERMES_RECONCILIATION_FAILURE_RED: import with unavailable profile storage exited successfully'
  review_failures=$((review_failures + 1))
fi
chmod 0755 "$readonly_home/.go-beast"
if test -e "$HERMES_HOME/profiles/persist-failure/skills/go-beast/go-hawk"; then
  printf '%s\n' 'HERMES_IMPORT_ROLLBACK_RED: import installed a sibling skill without writable profile storage'
  review_failures=$((review_failures + 1))
fi
test -d "$HERMES_HOME/profiles/persist-failure/SOUL.md"

node - "$TEST_ROOT/hermes-import-preview.json" "$TEST_ROOT/hermes-import-skills-only.json" <<'NODE'
const fs = require('node:fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
delete profile.instructions
profile.skills = { mode: 'selected', enabled: ['go-hawk'] }
fs.writeFileSync(process.argv[3], `${JSON.stringify(profile, null, 2)}\n`)
NODE
if HOME="$TEST_HOME" HERMES_HOME="$HERMES_HOME" node --input-type=module - "$REPO_ROOT" "$TEST_ROOT" "$HERMES_HOME" "$TEST_ROOT/hermes-import-preview.json" "$TEST_ROOT/hermes-import-skills-only.json" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const [repoRoot, testRoot, hermesRoot, importWithInstructions, importWithoutInstructions] = process.argv.slice(2)
process.argv[1] = path.join(repoRoot, 'bin', 'go-beast.mjs')
const { configureAgent, importProfile } = await import(pathToFileURL(path.join(repoRoot, 'scripts/integration-profile.mjs')).href)
const homes = {
  importWithInstructions: path.join(testRoot, 'write-failure-home-with-instructions'),
  importWithoutInstructions: path.join(testRoot, 'write-failure-home-without-instructions'),
  configure: path.join(testRoot, 'write-failure-home-configure'),
}
for (const home of Object.values(homes)) fs.mkdirSync(home, { recursive: true })
const blockedProfiles = Object.values(homes).map(home => path.join(home, '.go-beast', 'config.json'))
const originalWriteFileSync = fs.writeFileSync
fs.writeFileSync = function (file, ...args) {
  const target = path.resolve(String(file))
  if (blockedProfiles.some(profile => target.startsWith(`${profile}.`) && target.endsWith('.tmp'))) {
    throw new Error('injected profile write failure')
  }
  return originalWriteFileSync.call(fs, file, ...args)
}
function assertWriteFailureAndRollback({ label, home, hermesHome, operation }) {
  let failure
  try { operation() } catch (error) { failure = error }
  if (!failure?.message.includes('injected profile write failure')) {
    failures.push(`${label} did not expose the injected profile-write failure`)
  }
  const skill = path.join(hermesHome, 'skills', 'go-beast', 'go-hawk')
  if (fs.existsSync(skill)) failures.push(`${label} left a skill copy after profile persistence failed`)
  if (fs.existsSync(path.join(hermesHome, 'SOUL.md'))) failures.push(`${label} left SOUL.md after profile persistence failed`)
  if (fs.existsSync(path.join(home, '.go-beast', 'config.json'))) failures.push(`${label} unexpectedly persisted a profile`)
}
const profiles = {
  importWithInstructions: path.join(hermesRoot, 'profiles', 'import-write-failure'),
  importWithoutInstructions: path.join(hermesRoot, 'profiles', 'import-no-instructions-write-failure'),
  configure: path.join(hermesRoot, 'profiles', 'configure-write-failure'),
}
const failures = []
process.env.HERMES_HOME = profiles.importWithInstructions
assertWriteFailureAndRollback({
  label: 'Hermes import with instructions',
  home: homes.importWithInstructions,
  hermesHome: profiles.importWithInstructions,
  operation: () => importProfile({ home: homes.importWithInstructions, repoRoot, agentName: 'hermes', inputPath: importWithInstructions }),
})
process.env.HERMES_HOME = profiles.importWithoutInstructions
assertWriteFailureAndRollback({
  label: 'Hermes import without instructions',
  home: homes.importWithoutInstructions,
  hermesHome: profiles.importWithoutInstructions,
  operation: () => importProfile({ home: homes.importWithoutInstructions, repoRoot, agentName: 'hermes', inputPath: importWithoutInstructions }),
})
process.env.HERMES_HOME = profiles.configure
assertWriteFailureAndRollback({
  label: 'Hermes configureAgent',
  home: homes.configure,
  hermesHome: profiles.configure,
  operation: () => configureAgent({
    home: homes.configure,
    repoRoot,
    agentName: 'hermes',
    skillNames: ['go-hawk'],
    skillsMode: 'selected',
    instructionsSource: 'global',
    instructionsMode: 'all',
  }),
})
if (failures.length) throw new Error(failures.join('; '))
NODE
then
  :
else
  printf '%s\n' 'HERMES_IMPORT_ROLLBACK_RED: profile persistence failure left sibling Hermes assets installed'
  review_failures=$((review_failures + 1))
fi

mkdir -p "$HERMES_HOME/profiles/configure-failure/SOUL.md"
if HOME="$TEST_HOME" HERMES_HOME="$HERMES_HOME/profiles/configure-failure" node --input-type=module - "$REPO_ROOT" "$TEST_HOME" "$HERMES_HOME/profiles/configure-failure" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const [repoRoot, home, hermesHome] = process.argv.slice(2)
process.argv[1] = path.join(repoRoot, 'bin', 'go-beast.mjs')
const { configureAgent } = await import(pathToFileURL(path.join(repoRoot, 'scripts/integration-profile.mjs')).href)
let failure
try {
  configureAgent({
    home,
    repoRoot,
    agentName: 'hermes',
    skillNames: ['go-hawk'],
    skillsMode: 'selected',
    instructionsSource: 'global',
    instructionsMode: 'all',
    replaceUnmanagedInstructions: true,
  })
} catch (error) {
  failure = error
}
if (!failure?.message.includes('Hermes instruction reconciliation failed')) {
  throw new Error('direct configureAgent did not surface the SOUL reconciliation failure')
}
const profile = JSON.parse(fs.readFileSync(path.join(home, '.go-beast', 'config.json'), 'utf8'))
const resolvedHermesHome = path.resolve(hermesHome)
const homeKey = process.platform === 'win32' ? resolvedHermesHome.toLowerCase() : resolvedHermesHome
const instructionPolicy = profile.agents?.hermes?.instructionsByHome?.[homeKey]?.policy
const instructionsEnabled = instructionPolicy?.mode === 'all'
  ? !instructionPolicy.disabled?.includes('global')
  : instructionPolicy?.enabled?.includes('global')
const copyPath = path.join(resolvedHermesHome, 'skills', 'go-beast', 'go-hawk')
const ownership = profile.agents?.hermes?.managedSkillCopiesByHome?.[homeKey]?.['go-hawk']
if (instructionsEnabled) throw new Error('failed configureAgent persisted the enabled instruction policy')
if (fs.existsSync(copyPath) && !ownership) throw new Error('failed configureAgent left go-hawk installed without ownership metadata')
NODE
then
  :
else
  printf '%s\n' 'HERMES_RECONCILIATION_FAILURE_RED: direct configureAgent left policy or sibling assets inconsistent'
  review_failures=$((review_failures + 1))
fi

run_integration enable --agent hermes --kind instructions --name global --hermes-profile sync-failure --format json > "$TEST_ROOT/sync-enable.json"
if HOME="$TEST_HOME" HERMES_HOME="$HERMES_HOME/profiles/sync-failure" node --input-type=module - "$REPO_ROOT" "$TEST_HOME" "$HERMES_HOME/profiles/sync-failure" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const [repoRoot, home, hermesHome] = process.argv.slice(2)
process.argv[1] = path.join(repoRoot, 'bin', 'go-beast.mjs')
const { sync } = await import(pathToFileURL(path.join(repoRoot, 'scripts/integration-profile.mjs')).href)
const originalMkdtempSync = fs.mkdtempSync
fs.mkdtempSync = function (prefix, ...args) {
  if (path.resolve(String(prefix)).startsWith(`${path.resolve(hermesHome)}${path.sep}.go-beast-instructions-`)) {
    throw new Error('injected SOUL copy failure')
  }
  return originalMkdtempSync.call(fs, prefix, ...args)
}
process.env.HERMES_HOME = hermesHome
let failure
try { sync({ home, repoRoot, agentName: 'hermes', bootstrap: true }) } catch (error) { failure = error }
if (!failure?.message.includes('Hermes instruction reconciliation failed')) {
  throw new Error('sync did not report the injected SOUL reconciliation failure')
}
const profile = JSON.parse(fs.readFileSync(path.join(home, '.go-beast', 'config.json'), 'utf8'))
const key = process.platform === 'win32' ? path.resolve(hermesHome).toLowerCase() : path.resolve(hermesHome)
if (profile.agents?.hermes?.instructionsByHome?.[key]?.source !== 'global') {
  throw new Error('failed sync persisted the requested bootstrap source')
}
if (fs.readFileSync(path.join(hermesHome, 'SOUL.md'), 'utf8') !== fs.readFileSync(path.join(repoRoot, 'AGENTS.global.md'), 'utf8')) {
  throw new Error('failed sync changed SOUL.md despite the injected copy failure')
}
NODE
then
  :
else
  printf '%s\n' 'HERMES_SYNC_SOURCE_RED: failed bootstrap sync persisted its source or did not report failure'
  review_failures=$((review_failures + 1))
fi

preview=$(run_integration import --agent hermes --hermes-profile preview --input "$TEST_ROOT/hermes-import-preview.json" --dry-run --format text)
if printf '%s\n' "$preview" | grep -Fq '1 instruction change'; then
  :
else
  printf '%s\n' 'HERMES_INSTRUCTION_PREVIEW_RED: text import preview omitted the SOUL change count'
  review_failures=$((review_failures + 1))
fi
test ! -e "$HERMES_HOME/profiles/preview/SOUL.md"

node - "$TEST_ROOT/hermes-import-preview.json" "$TEST_ROOT/hermes-import-preserve.json" <<'NODE'
const fs = require('node:fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
profile.instructions = { policy: { mode: 'selected', enabled: [] }, source: 'global' }
fs.writeFileSync(process.argv[3], `${JSON.stringify(profile, null, 2)}\n`)
NODE
mkdir -p "$HERMES_HOME/profiles/preview-preserve"
printf '%s\n' 'user-owned profile instructions' > "$HERMES_HOME/profiles/preview-preserve/SOUL.md"
preserve_preview=$(run_integration import --agent hermes --hermes-profile preview-preserve --input "$TEST_ROOT/hermes-import-preserve.json" --dry-run --format text)
if printf '%s\n' "$preserve_preview" | grep -Fq '0 instruction changes'; then
  :
else
  printf '%s\n' 'HERMES_INSTRUCTION_PRESERVE_PREVIEW_RED: preserved SOUL was counted as a change'
  review_failures=$((review_failures + 1))
fi
grep -Fq 'user-owned profile instructions' "$HERMES_HOME/profiles/preview-preserve/SOUL.md"
if [ "$review_failures" -gt 0 ]; then
  printf '%s\n' 'HERMES_REVIEW_REGRESSIONS_RED'
  exit 1
fi

test ! -e "$HERMES_HOME/config.yaml"
test ! -e "$HERMES_HOME/plugins"
printf '%s\n' 'Hermes integration tests passed'