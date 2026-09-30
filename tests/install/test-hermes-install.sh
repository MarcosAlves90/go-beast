#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_ROOT="$(mktemp -d)"
TEST_HOME="$TEST_ROOT/user-home"
HERMES_HOME="$TEST_ROOT/hermes-data"
UNINSTALL_HOME="$TEST_ROOT/uninstall-home"
UNINSTALL_HERMES_HOME="$TEST_ROOT/uninstall-hermes-data"
PROFILE_HOME="$TEST_ROOT/profile-home"
PROFILE_HERMES_A="$TEST_ROOT/profile-a"
PROFILE_HERMES_B="$TEST_ROOT/profile-b"
ERROR_HOME="$TEST_ROOT/error-home"
ERROR_HERMES_HOME="$TEST_ROOT/error-hermes-data"
RACE_REMOVE_HOME="$TEST_ROOT/race-remove-home"
RACE_REMOVE_HERMES="$TEST_ROOT/race-remove-hermes"
RACE_UPDATE_HOME="$TEST_ROOT/race-update-home"
RACE_UPDATE_HERMES="$TEST_ROOT/race-update-hermes"
RACE_CREATE_HOME="$TEST_ROOT/race-create-home"
RACE_CREATE_HERMES="$TEST_ROOT/race-create-hermes"
RACE_BACKUP_HOME="$TEST_ROOT/race-backup-home"
RACE_BACKUP_HERMES="$TEST_ROOT/race-backup-hermes"
LEGACY_HOME="$TEST_ROOT/legacy-home"
LEGACY_HERMES_HOME="$TEST_ROOT/legacy-hermes-home"
ROLLBACK_HOME="$TEST_ROOT/rollback-home"
ROLLBACK_HERMES_A="$TEST_ROOT/rollback-hermes-a"
ROLLBACK_HERMES_B="$TEST_ROOT/rollback-hermes-b"
failures=0

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$TEST_HOME" "$HERMES_HOME/skills/go-beast/go-fox"
printf '%s\n' 'user-owned Hermes skill' > "$HERMES_HOME/skills/go-beast/go-fox/USER.md"

HOME="$TEST_HOME" USERPROFILE="$TEST_HOME" HERMES_HOME="$HERMES_HOME" node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/install.log"
test -d "$HERMES_HOME/skills/go-beast/go-hawk"
test ! -L "$HERMES_HOME/skills/go-beast/go-hawk"
test -f "$HERMES_HOME/skills/go-beast/go-hawk/SKILL.md"
test "$(<"$HERMES_HOME/skills/go-beast/go-fox/USER.md")" = 'user-owned Hermes skill'
test ! -e "$HERMES_HOME/config.yaml"
test ! -e "$HERMES_HOME/SOUL.md"
test ! -e "$HERMES_HOME/plugins"

node - "$TEST_HOME/.go-beast/config.json" "$TEST_HOME/.go-beast/install-manifest.json" "$TEST_HOME/.go-beast/install-transactions" "$HERMES_HOME" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [profilePath, manifestPath, transactionsDir, hermesHome] = process.argv.slice(2)
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
if (!profile.agents.hermes?.managedSkillCopies?.['go-hawk']) throw new Error('installer did not record Hermes copy ownership')
if (!Object.values(profile.agents.hermes.managedSkillCopiesByHome ?? {}).some(records => records?.['go-hawk'])) {
  throw new Error('installer did not scope Hermes copy ownership to a Hermes home')
}
if (profile.agents.hermes.managedSkillCopies['go-fox']) throw new Error('installer claimed a pre-existing unmanaged Hermes skill')
if (!manifest.assets.some(asset => asset.agent === 'hermes' && asset.kind === 'skill')) throw new Error('integrity manifest omitted Hermes skills')
const transactionPath = path.join(transactionsDir, fs.readdirSync(transactionsDir)[0], 'transaction.json')
const transaction = JSON.parse(fs.readFileSync(transactionPath, 'utf8'))
if (!transaction.allowed_roots.includes(hermesHome)) throw new Error('install transaction omitted the external Hermes home root')
if (!transaction.snapshots.some(snapshot => snapshot.target === path.join(hermesHome, 'skills', 'go-beast', 'go-hawk'))) {
  throw new Error('install transaction omitted the Hermes skill copy target')
}
NODE

printf '\nuser edit before rollback\n' >> "$HERMES_HOME/skills/go-beast/go-hawk/SKILL.md"
HOME="$TEST_HOME" USERPROFILE="$TEST_HOME" HERMES_HOME="$HERMES_HOME" node "$REPO_ROOT/scripts/install.mjs" --rollback > "$TEST_ROOT/rollback.log"
if ! test -f "$HERMES_HOME/skills/go-beast/go-hawk/SKILL.md" \
  || ! grep -Fq 'user edit before rollback' "$HERMES_HOME/skills/go-beast/go-hawk/SKILL.md" \
  || ! grep -Fq 'changed since install — preserved' "$TEST_ROOT/rollback.log"; then
  fail 'rollback must preserve and report a Hermes copy edited after installation'
fi
test "$(<"$HERMES_HOME/skills/go-beast/go-fox/USER.md")" = 'user-owned Hermes skill'
test ! -e "$TEST_HOME/.go-beast/config.json"

mkdir -p "$PROFILE_HOME" "$PROFILE_HERMES_A" "$PROFILE_HERMES_B"
run_profile() {
  local command="$1" target="$2"
  shift 2
  HOME="$PROFILE_HOME" USERPROFILE="$PROFILE_HOME" HERMES_HOME="$target" \
    node "$REPO_ROOT/bin/go-beast.mjs" integration "$command" --agent hermes "$@" \
    --repo "$REPO_ROOT" --home "$PROFILE_HOME" --format json
}
run_profile sync "$PROFILE_HERMES_A" > "$TEST_ROOT/profile-a-sync.json"
run_profile sync "$PROFILE_HERMES_B" > "$TEST_ROOT/profile-b-sync.json"
run_profile disable "$PROFILE_HERMES_B" --kind skill --name go-fox > "$TEST_ROOT/profile-b-disable.json"
status_a=$(run_profile status "$PROFILE_HERMES_A")
status_b=$(run_profile status "$PROFILE_HERMES_B")
if ! node - "$status_a" "$status_b" <<'NODE'
const status = JSON.parse(process.argv[2])
const statusB = JSON.parse(process.argv[3])
const skillA = status.skills.find(item => item.name === 'go-fox')
const skillB = statusB.skills.find(item => item.name === 'go-fox')
if (skillA?.state !== 'enabled' || skillA.ownership !== 'managed' || skillB?.state !== 'disabled') process.exit(1)
NODE
then
  fail 'skill selection and ownership must remain independent for each HERMES_HOME'
fi
test -f "$PROFILE_HERMES_A/skills/go-beast/go-fox/SKILL.md"
test ! -e "$PROFILE_HERMES_B/skills/go-beast/go-fox"

mkdir -p "$LEGACY_HOME" "$LEGACY_HERMES_HOME"
HOME="$LEGACY_HOME" USERPROFILE="$LEGACY_HOME" HERMES_HOME="$LEGACY_HERMES_HOME" \
  node "$REPO_ROOT/bin/go-beast.mjs" integration sync --agent hermes \
  --repo "$REPO_ROOT" --home "$LEGACY_HOME" --format json > "$TEST_ROOT/legacy-first-sync.json"
node - "$LEGACY_HOME/.go-beast/config.json" <<'NODE'
const fs = require('node:fs')
const file = process.argv[2]
const profile = JSON.parse(fs.readFileSync(file, 'utf8'))
const agent = profile.agents.hermes
delete agent.skillsByHome
delete agent.skillsHome
delete agent.managedSkillCopiesByHome
delete agent.managedSkillCopiesHome
fs.writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`)
NODE
HOME="$LEGACY_HOME" USERPROFILE="$LEGACY_HOME" HERMES_HOME="$LEGACY_HERMES_HOME" \
  node "$REPO_ROOT/bin/go-beast.mjs" integration sync --agent hermes \
  --repo "$REPO_ROOT" --home "$LEGACY_HOME" --format json > "$TEST_ROOT/legacy-migration-sync.json"
node - "$LEGACY_HOME/.go-beast/config.json" "$LEGACY_HERMES_HOME" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const homeKey = path.resolve(process.argv[3])
const agent = profile.agents.hermes
if (!agent.skillsByHome?.[homeKey] || !agent.managedSkillCopiesByHome?.[homeKey]?.['go-hawk']) {
  throw new Error('legacy Hermes skill policy and ownership did not migrate to the active home')
}
NODE

mkdir -p "$ROLLBACK_HOME" "$ROLLBACK_HERMES_A" "$ROLLBACK_HERMES_B"
HOME="$ROLLBACK_HOME" USERPROFILE="$ROLLBACK_HOME" HERMES_HOME="$ROLLBACK_HERMES_A" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/rollback-a-install.log"
HOME="$ROLLBACK_HOME" USERPROFILE="$ROLLBACK_HOME" HERMES_HOME="$ROLLBACK_HERMES_B" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/rollback-b-install.log"
HOME="$ROLLBACK_HOME" USERPROFILE="$ROLLBACK_HOME" HERMES_HOME="$ROLLBACK_HERMES_B" \
  node "$REPO_ROOT/scripts/install.mjs" --rollback > "$TEST_ROOT/rollback-b.log"
test -f "$ROLLBACK_HERMES_A/skills/go-beast/go-hawk/SKILL.md"
test ! -e "$ROLLBACK_HERMES_B/skills/go-beast/go-hawk"

mkdir -p "$UNINSTALL_HOME" "$UNINSTALL_HERMES_HOME"
HOME="$UNINSTALL_HOME" USERPROFILE="$UNINSTALL_HOME" HERMES_HOME="$UNINSTALL_HERMES_HOME" node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/uninstall-install.log"
printf '\nUser edit\n' >> "$UNINSTALL_HERMES_HOME/skills/go-beast/go-hawk/SKILL.md"
HOME="$UNINSTALL_HOME" USERPROFILE="$UNINSTALL_HOME" HERMES_HOME="$UNINSTALL_HERMES_HOME" node "$REPO_ROOT/scripts/install.mjs" --uninstall > "$TEST_ROOT/uninstall.log"
grep -Fq 'User edit' "$UNINSTALL_HERMES_HOME/skills/go-beast/go-hawk/SKILL.md"
test ! -e "$UNINSTALL_HERMES_HOME/skills/go-beast/go-fox"

mkdir -p "$ERROR_HOME" "$ERROR_HERMES_HOME"
HOME="$ERROR_HOME" USERPROFILE="$ERROR_HOME" HERMES_HOME="$ERROR_HERMES_HOME" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/error-install.log"
cat > "$TEST_ROOT/block-remove.cjs" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')
const original = fs.rmSync
const originalSpawnSync = childProcess.spawnSync
const safeFsRequest = (file, options) => {
  if (!path.basename(String(file)).startsWith('go-beast-safe-fs-')) return null
  try { return JSON.parse(String(options?.input ?? '{}')) } catch { return null }
}
fs.rmSync = function (target, ...args) {
  const resolvedTarget = path.resolve(String(target))
  const blockedTarget = path.resolve(process.env.GO_BEAST_TEST_BLOCK_REMOVE)
  const quarantineParent = path.dirname(resolvedTarget)
  const isBlockedQuarantine = path.basename(resolvedTarget) === 'previous'
    && path.dirname(quarantineParent) === path.dirname(blockedTarget)
    && path.basename(quarantineParent).startsWith(`.${path.basename(blockedTarget)}-`)
  if (resolvedTarget === blockedTarget || isBlockedQuarantine) {
    const error = new Error('blocked removal for regression test')
    error.code = 'EACCES'
    throw error
  }
  return original.call(this, target, ...args)
}
childProcess.spawnSync = function (file, args, options = {}) {
  const request = safeFsRequest(file, options)
  if (request?.operation === 'remove' && request.path === 'skills/go-beast/go-fox') {
    return { status: 1, stdout: '', stderr: 'blocked removal for regression test' }
  }
  return originalSpawnSync.call(this, file, args, options)
}
NODE
set +e
HOME="$ERROR_HOME" USERPROFILE="$ERROR_HOME" HERMES_HOME="$ERROR_HERMES_HOME" \
  GO_BEAST_TEST_BLOCK_REMOVE="$ERROR_HERMES_HOME/skills/go-beast/go-fox" \
  NODE_OPTIONS="--require=$TEST_ROOT/block-remove.cjs" \
  node "$REPO_ROOT/scripts/install.mjs" --uninstall > "$TEST_ROOT/error-uninstall.log" 2>&1
uninstall_exit=$?
set -e
if [ "$uninstall_exit" -eq 0 ] \
  || ! grep -Fq 'removal failed' "$TEST_ROOT/error-uninstall.log" \
  || ! test -f "$ERROR_HERMES_HOME/skills/go-beast/go-fox/SKILL.md"; then
  fail 'uninstall must report a failed Hermes copy removal and exit nonzero'
fi

cat > "$TEST_ROOT/inject-race.cjs" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const childProcess = require('node:child_process')
const target = path.resolve(process.env.GO_BEAST_TEST_RACE_TARGET)
const mode = process.env.GO_BEAST_TEST_RACE_MODE
const originalCpSync = fs.cpSync
const originalRenameSync = fs.renameSync
const originalRmSync = fs.rmSync
const originalSpawnSync = childProcess.spawnSync
let injected = false
const safeFsRequest = (file, options) => {
  if (!path.basename(String(file)).startsWith('go-beast-safe-fs-')) return null
  try { return JSON.parse(String(options?.input ?? '{}')) } catch { return null }
}
const interceptSafeFs = handler => {
  childProcess.spawnSync = function (file, args, options = {}) {
    const request = safeFsRequest(file, options)
    if (request) {
      const replacement = handler(request)
      if (replacement) return replacement
    }
    return originalSpawnSync.call(this, file, args, options)
  }
}

if (mode === 'remove') {
  interceptSafeFs(request => {
    if (request.operation !== 'remove' || injected) return null
    injected = true
    fs.appendFileSync(path.join(target, 'SKILL.md'), '\nConcurrent user edit\n')
    return null
  })
  fs.renameSync = function (source, destination) {
    if (!injected && path.resolve(String(source)) === target && path.basename(String(destination)) === 'previous') {
      injected = true
      fs.appendFileSync(path.join(target, 'SKILL.md'), '\nConcurrent user edit\n')
    }
    return originalRenameSync.call(this, source, destination)
  }
} else if (mode === 'update') {
  interceptSafeFs(request => {
    if (request.operation !== 'install' || !request.expected_sha256 || injected) return null
    injected = true
    fs.appendFileSync(path.join(target, 'SKILL.md'), '\nConcurrent user edit\n')
    return null
  })
  fs.renameSync = function (source, destination) {
    if (!injected && path.resolve(String(source)) === target && path.basename(String(destination)) === 'previous') {
      injected = true
      fs.appendFileSync(path.join(target, 'SKILL.md'), '\nConcurrent user edit\n')
    }
    return originalRenameSync.call(this, source, destination)
  }
} else if (mode === 'create') {
  interceptSafeFs(request => {
    if (request.operation !== 'install' || request.expected_sha256 || injected) return null
    injected = true
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(target, 'USER.md'), 'concurrent unmanaged skill')
    return null
  })
  fs.cpSync = function (source, destination, ...args) {
    const result = originalCpSync.call(this, source, destination, ...args)
    if (!injected && path.basename(String(destination)) === 'staged') {
      injected = true
      fs.mkdirSync(target)
      fs.writeFileSync(path.join(target, 'USER.md'), 'concurrent unmanaged skill')
    }
    return result
  }
} else if (mode === 'backup-failure') {
  interceptSafeFs(request => {
    if (request.operation !== 'install' || !request.expected_sha256) return null
    fs.writeFileSync(process.env.GO_BEAST_TEST_HELPER_CALLED, 'yes')
    return { status: 1, stdout: '', stderr: 'injected safe helper update failure' }
  })
  fs.renameSync = function (source, destination) {
    if (path.resolve(String(destination)) === target && path.basename(String(source)) === 'staged') {
      const error = new Error('injected staged-copy rename failure')
      error.code = 'EIO'
      throw error
    }
    if (path.resolve(String(destination)) === target && path.basename(String(source)) === 'previous') {
      fs.writeFileSync(process.env.GO_BEAST_TEST_BACKUP_LOG, String(source))
      const error = new Error('injected backup restore failure')
      error.code = 'EACCES'
      throw error
    }
    return originalRenameSync.call(this, source, destination)
  }
} else if (mode === 'rollback-race') {
  const injectEdit = () => {
    if (injected) return
    injected = true
    fs.appendFileSync(path.join(target, 'SKILL.md'), '\nConcurrent rollback user edit\n')
  }
  interceptSafeFs(request => {
    if (request.operation === 'restore') injectEdit()
    return null
  })
  fs.renameSync = function (source, destination) {
    if (path.resolve(String(source)) === target) injectEdit()
    return originalRenameSync.call(this, source, destination)
  }
  fs.rmSync = function (candidate, ...args) {
    if (path.resolve(String(candidate)) === target) injectEdit()
    return originalRmSync.call(this, candidate, ...args)
  }
} else if (mode === 'symlink-swap') {
  let swapped = false
  const swapSkillsAncestor = () => {
    if (swapped) return
    swapped = true
    originalRenameSync(process.env.GO_BEAST_TEST_SKILLS_DIR, process.env.GO_BEAST_TEST_MOVED_SKILLS)
    fs.symlinkSync(process.env.GO_BEAST_TEST_EXTERNAL_SKILLS, process.env.GO_BEAST_TEST_SKILLS_DIR, 'dir')
  }
  fs.renameSync = function (source, destination) {
    if (!swapped && path.resolve(String(source)) === target && path.basename(String(destination)) === 'previous') {
      swapSkillsAncestor()
      fs.mkdirSync(path.dirname(String(destination)), { recursive: true })
    }
    return originalRenameSync.call(this, source, destination)
  }
  childProcess.spawnSync = function (file, args, options = {}) {
    if (!swapped && path.basename(String(file)).startsWith('go-beast-safe-fs-')) {
      const request = safeFsRequest(file, options)
      if (request?.operation === 'remove') swapSkillsAncestor()
    }
    return originalSpawnSync.call(this, file, args, options)
  }
}
NODE

run_race_profile() {
  local command="$1" profile_home="$2" hermes_home="$3"
  shift 3
  HOME="$profile_home" USERPROFILE="$profile_home" HERMES_HOME="$hermes_home" \
    node "$REPO_ROOT/bin/go-beast.mjs" integration "$command" --agent hermes "$@" \
    --repo "$REPO_ROOT" --home "$profile_home" --format json
}

mkdir -p "$RACE_REMOVE_HOME" "$RACE_REMOVE_HERMES"
HOME="$RACE_REMOVE_HOME" USERPROFILE="$RACE_REMOVE_HOME" HERMES_HOME="$RACE_REMOVE_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/race-remove-install.log"
HOME="$RACE_REMOVE_HOME" USERPROFILE="$RACE_REMOVE_HOME" HERMES_HOME="$RACE_REMOVE_HERMES" \
  GO_BEAST_TEST_RACE_MODE=remove \
  GO_BEAST_TEST_RACE_TARGET="$RACE_REMOVE_HERMES/skills/go-beast/go-fox" \
  NODE_OPTIONS="--require=$TEST_ROOT/inject-race.cjs" \
  run_race_profile disable "$RACE_REMOVE_HOME" "$RACE_REMOVE_HERMES" --kind skill --name go-fox > "$TEST_ROOT/race-remove.json"
if ! test -f "$RACE_REMOVE_HERMES/skills/go-beast/go-fox/SKILL.md" \
  || ! grep -Fq 'Concurrent user edit' "$RACE_REMOVE_HERMES/skills/go-beast/go-fox/SKILL.md"; then
  fail 'disable must preserve an edit concurrent with the removal check'
fi

mkdir -p "$RACE_UPDATE_HOME" "$RACE_UPDATE_HERMES"
HOME="$RACE_UPDATE_HOME" USERPROFILE="$RACE_UPDATE_HOME" HERMES_HOME="$RACE_UPDATE_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/race-update-install.log"
node - "$RACE_UPDATE_HOME/.go-beast/config.json" <<'NODE'
const fs = require('node:fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
profile.agents.hermes.managedSkillCopies['go-fox'].source_sha256 = '0'.repeat(64)
fs.writeFileSync(process.argv[2], `${JSON.stringify(profile, null, 2)}\n`)
NODE
HOME="$RACE_UPDATE_HOME" USERPROFILE="$RACE_UPDATE_HOME" HERMES_HOME="$RACE_UPDATE_HERMES" \
  GO_BEAST_TEST_RACE_MODE=update \
  GO_BEAST_TEST_RACE_TARGET="$RACE_UPDATE_HERMES/skills/go-beast/go-fox" \
  NODE_OPTIONS="--require=$TEST_ROOT/inject-race.cjs" \
  run_race_profile sync "$RACE_UPDATE_HOME" "$RACE_UPDATE_HERMES" > "$TEST_ROOT/race-update.json"
if ! grep -Fq 'Concurrent user edit' "$RACE_UPDATE_HERMES/skills/go-beast/go-fox/SKILL.md"; then
  fail 'sync must preserve an edit concurrent with the update rename'
fi

mkdir -p "$RACE_CREATE_HOME" "$RACE_CREATE_HERMES"
HOME="$RACE_CREATE_HOME" USERPROFILE="$RACE_CREATE_HOME" HERMES_HOME="$RACE_CREATE_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/race-create-install.log"
run_race_profile disable "$RACE_CREATE_HOME" "$RACE_CREATE_HERMES" --kind skill --name go-fox > "$TEST_ROOT/race-create-disable.json"
HOME="$RACE_CREATE_HOME" USERPROFILE="$RACE_CREATE_HOME" HERMES_HOME="$RACE_CREATE_HERMES" \
  GO_BEAST_TEST_RACE_MODE=create \
  GO_BEAST_TEST_RACE_TARGET="$RACE_CREATE_HERMES/skills/go-beast/go-fox" \
  NODE_OPTIONS="--require=$TEST_ROOT/inject-race.cjs" \
  run_race_profile enable "$RACE_CREATE_HOME" "$RACE_CREATE_HERMES" --kind skill --name go-fox > "$TEST_ROOT/race-create-enable.json"
if ! test -f "$RACE_CREATE_HERMES/skills/go-beast/go-fox/USER.md"; then
  fail 'enable must preserve an unmanaged target created concurrently with copy staging'
fi

mkdir -p "$RACE_BACKUP_HOME" "$RACE_BACKUP_HERMES"
HOME="$RACE_BACKUP_HOME" USERPROFILE="$RACE_BACKUP_HOME" HERMES_HOME="$RACE_BACKUP_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/race-backup-install.log"
node - "$RACE_BACKUP_HOME/.go-beast/config.json" <<'NODE'
const fs = require('node:fs')
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
profile.agents.hermes.managedSkillCopies['go-fox'].source_sha256 = '0'.repeat(64)
fs.writeFileSync(process.argv[2], `${JSON.stringify(profile, null, 2)}\n`)
NODE
HOME="$RACE_BACKUP_HOME" USERPROFILE="$RACE_BACKUP_HOME" HERMES_HOME="$RACE_BACKUP_HERMES" \
  GO_BEAST_TEST_RACE_MODE=backup-failure \
  GO_BEAST_TEST_RACE_TARGET="$RACE_BACKUP_HERMES/skills/go-beast/go-fox" \
  GO_BEAST_TEST_HELPER_CALLED="$TEST_ROOT/safe-helper-called" \
  GO_BEAST_TEST_BACKUP_LOG="$TEST_ROOT/preserved-backup-path" \
  NODE_OPTIONS="--require=$TEST_ROOT/inject-race.cjs" \
  run_race_profile sync "$RACE_BACKUP_HOME" "$RACE_BACKUP_HERMES" > "$TEST_ROOT/race-backup-sync.json"
if test -f "$RACE_BACKUP_HERMES/skills/go-beast/go-fox/SKILL.md"; then
  if ! test -f "$TEST_ROOT/safe-helper-called" \
    || ! grep -Fq 'injected safe helper update failure' "$TEST_ROOT/race-backup-sync.json"; then
    fail 'a failed native helper update must leave the active copy untouched and report failure'
  fi
else
  backup_path="$(<"$TEST_ROOT/preserved-backup-path")"
  if ! test -f "$backup_path/SKILL.md"; then
    fail 'failed copy replacement must retain its backup when restoration also fails'
  fi
fi

PENDING_HOME="$TEST_ROOT/pending-home"
PENDING_HERMES="$TEST_ROOT/pending-hermes"
mkdir -p "$PENDING_HOME" "$PENDING_HERMES"
HOME="$PENDING_HOME" USERPROFILE="$PENDING_HOME" HERMES_HOME="$PENDING_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/pending-install.log"
node - "$PENDING_HOME/.go-beast/install-transactions" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const root = process.argv[2]
const transactionDir = fs.readdirSync(root).find(name => fs.statSync(path.join(root, name)).isDirectory())
const recordPath = path.join(root, transactionDir, 'transaction.json')
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
record.status = 'pending'
for (const snapshot of record.snapshots) delete snapshot.installed_state
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
NODE
printf '\nPending transaction user edit\n' >> "$PENDING_HERMES/skills/go-beast/go-hawk/SKILL.md"
if HOME="$PENDING_HOME" USERPROFILE="$PENDING_HOME" HERMES_HOME="$PENDING_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --rollback > "$TEST_ROOT/pending-rollback.log" 2>&1; then
  pending_rollback_status=0
else
  pending_rollback_status=$?
fi
if [ "$pending_rollback_status" -eq 0 ] \
  || ! grep -Fq 'missing installed-state fingerprint' "$TEST_ROOT/pending-rollback.log" \
  || ! grep -Fq "$PENDING_HERMES/skills/go-beast/go-hawk" "$TEST_ROOT/pending-rollback.log"; then
  fail 'rollback must fail visibly when a pending transaction has no installed fingerprint'
fi
if ! test -f "$PENDING_HERMES/skills/go-beast/go-hawk/SKILL.md" \
  || ! grep -Fq 'Pending transaction user edit' "$PENDING_HERMES/skills/go-beast/go-hawk/SKILL.md"; then
  fail 'rollback must preserve edits when a pending transaction has no installed fingerprint'
fi
node - "$PENDING_HOME/.go-beast/install-transactions" "$PENDING_HERMES/skills/go-beast/go-hawk" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [root, target] = process.argv.slice(2)
const transactionDir = fs.readdirSync(root).find(name => fs.existsSync(path.join(root, name, 'transaction.json')))
const record = JSON.parse(fs.readFileSync(path.join(root, transactionDir, 'transaction.json'), 'utf8'))
if (record.status !== 'rollback_failed'
    || !record.rollback_errors?.some(error => error.includes('missing installed-state fingerprint'))
    || !record.rollback_preserved?.includes(target)) {
  console.error('pending rollback must persist rollback_failed and the preserved target')
  process.exit(1)
}
NODE

SYMLINK_SNAPSHOT_HOME="$TEST_ROOT/symlink-snapshot-home"
SYMLINK_SNAPSHOT_HERMES="$TEST_ROOT/symlink-snapshot-hermes"
SYMLINK_SNAPSHOT_EXTERNAL="$TEST_ROOT/symlink-snapshot-external"
mkdir -p "$SYMLINK_SNAPSHOT_HOME" "$SYMLINK_SNAPSHOT_HERMES" "$SYMLINK_SNAPSHOT_EXTERNAL/go-beast/go-fox"
printf '%s\n' 'user-owned external Hermes skill' > "$SYMLINK_SNAPSHOT_EXTERNAL/go-beast/go-fox/USER.md"
ln -s "$SYMLINK_SNAPSHOT_EXTERNAL" "$SYMLINK_SNAPSHOT_HERMES/skills"
set +e
HOME="$SYMLINK_SNAPSHOT_HOME" USERPROFILE="$SYMLINK_SNAPSHOT_HOME" HERMES_HOME="$SYMLINK_SNAPSHOT_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/symlink-snapshot-install.log" 2>&1
symlink_snapshot_exit=$?
set -e
if [ "$symlink_snapshot_exit" -eq 0 ] \
  || ! test -f "$SYMLINK_SNAPSHOT_EXTERNAL/go-beast/go-fox/USER.md" \
  || test -e "$SYMLINK_SNAPSHOT_EXTERNAL/go-beast/go-hawk/SKILL.md"; then
  fail 'installer snapshot must reject a symlinked Hermes ancestor without writing outside Hermes home'
fi

SYMLINK_HOME_PATH_HOME="$TEST_ROOT/symlink-home-path-home"
SYMLINK_HOME_PATH_REAL="$TEST_ROOT/symlink-home-path-real"
SYMLINK_HOME_PATH_LINK="$TEST_ROOT/symlink-home-path-link"
mkdir -p "$SYMLINK_HOME_PATH_HOME" "$SYMLINK_HOME_PATH_REAL"
ln -s "$SYMLINK_HOME_PATH_REAL" "$SYMLINK_HOME_PATH_LINK"
HOME="$SYMLINK_HOME_PATH_HOME" USERPROFILE="$SYMLINK_HOME_PATH_HOME" HERMES_HOME="$SYMLINK_HOME_PATH_LINK" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/symlink-home-path-install.log"
if ! test -f "$SYMLINK_HOME_PATH_REAL/skills/go-beast/go-hawk/SKILL.md"; then
  fail 'installer must allow the explicit Hermes home itself to be a symlink'
fi
HOME="$SYMLINK_HOME_PATH_HOME" USERPROFILE="$SYMLINK_HOME_PATH_HOME" HERMES_HOME="$SYMLINK_HOME_PATH_LINK" \
  node "$REPO_ROOT/scripts/install.mjs" --rollback > "$TEST_ROOT/symlink-home-path-rollback.log"
if test -e "$SYMLINK_HOME_PATH_REAL/skills/go-beast/go-hawk"; then
  fail 'rollback must work when the explicit Hermes home itself is a symlink'
fi

SYMLINK_PROFILE_HOME="$TEST_ROOT/symlink-profile-home"
SYMLINK_PROFILE_HERMES="$TEST_ROOT/symlink-profile-hermes"
SYMLINK_PROFILE_SKILLS="$TEST_ROOT/symlink-profile-skills"
mkdir -p "$SYMLINK_PROFILE_HOME" "$SYMLINK_PROFILE_HERMES"
HOME="$SYMLINK_PROFILE_HOME" USERPROFILE="$SYMLINK_PROFILE_HOME" HERMES_HOME="$SYMLINK_PROFILE_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/symlink-profile-install.log"
mv "$SYMLINK_PROFILE_HERMES/skills" "$SYMLINK_PROFILE_SKILLS"
ln -s "$SYMLINK_PROFILE_SKILLS" "$SYMLINK_PROFILE_HERMES/skills"
if run_race_profile disable "$SYMLINK_PROFILE_HOME" "$SYMLINK_PROFILE_HERMES" \
  --kind skill --name go-fox > "$TEST_ROOT/symlink-profile-disable.json" 2>&1; then
  :
fi
if ! test -f "$SYMLINK_PROFILE_SKILLS/go-beast/go-fox/SKILL.md"; then
  fail 'integration CLI must not remove managed-looking skills through a symlinked Hermes ancestor'
fi

SYMLINK_ROLLBACK_HOME="$TEST_ROOT/symlink-rollback-home"
SYMLINK_ROLLBACK_HERMES="$TEST_ROOT/symlink-rollback-hermes"
SYMLINK_ROLLBACK_SKILLS="$TEST_ROOT/symlink-rollback-skills"
mkdir -p "$SYMLINK_ROLLBACK_HOME" "$SYMLINK_ROLLBACK_HERMES"
HOME="$SYMLINK_ROLLBACK_HOME" USERPROFILE="$SYMLINK_ROLLBACK_HOME" HERMES_HOME="$SYMLINK_ROLLBACK_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/symlink-rollback-install.log"
mv "$SYMLINK_ROLLBACK_HERMES/skills" "$SYMLINK_ROLLBACK_SKILLS"
ln -s "$SYMLINK_ROLLBACK_SKILLS" "$SYMLINK_ROLLBACK_HERMES/skills"
if HOME="$SYMLINK_ROLLBACK_HOME" USERPROFILE="$SYMLINK_ROLLBACK_HOME" HERMES_HOME="$SYMLINK_ROLLBACK_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --rollback > "$TEST_ROOT/symlink-rollback.log" 2>&1; then
  :
fi
if ! test -f "$SYMLINK_ROLLBACK_SKILLS/go-beast/go-hawk/SKILL.md"; then
  fail 'installer rollback must not remove targets through a symlinked Hermes ancestor'
fi

ROLLBACK_RACE_HOME="$TEST_ROOT/rollback-race-home"
ROLLBACK_RACE_HERMES="$TEST_ROOT/rollback-race-hermes"
mkdir -p "$ROLLBACK_RACE_HOME" "$ROLLBACK_RACE_HERMES"
HOME="$ROLLBACK_RACE_HOME" USERPROFILE="$ROLLBACK_RACE_HOME" HERMES_HOME="$ROLLBACK_RACE_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/rollback-race-install.log"
HOME="$ROLLBACK_RACE_HOME" USERPROFILE="$ROLLBACK_RACE_HOME" HERMES_HOME="$ROLLBACK_RACE_HERMES" \
  GO_BEAST_TEST_RACE_MODE=rollback-race \
  GO_BEAST_TEST_RACE_TARGET="$ROLLBACK_RACE_HERMES/skills/go-beast/go-hawk" \
  NODE_OPTIONS="--require=$TEST_ROOT/inject-race.cjs" \
  node "$REPO_ROOT/scripts/install.mjs" --rollback > "$TEST_ROOT/rollback-race.log"
if ! test -f "$ROLLBACK_RACE_HERMES/skills/go-beast/go-hawk/SKILL.md" \
  || ! grep -Fq 'Concurrent rollback user edit' "$ROLLBACK_RACE_HERMES/skills/go-beast/go-hawk/SKILL.md"; then
  fail 'rollback must preserve an edit made after its fingerprint check'
fi

NOFOLLOW_HOME="$TEST_ROOT/nofollow-home"
NOFOLLOW_HERMES="$TEST_ROOT/nofollow-hermes"
NOFOLLOW_EXTERNAL="$TEST_ROOT/nofollow-external"
NOFOLLOW_MOVED="$TEST_ROOT/nofollow-moved-skills"
mkdir -p "$NOFOLLOW_HOME" "$NOFOLLOW_HERMES"
HOME="$NOFOLLOW_HOME" USERPROFILE="$NOFOLLOW_HOME" HERMES_HOME="$NOFOLLOW_HERMES" \
  node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/nofollow-install.log"
cp -R "$NOFOLLOW_HERMES/skills" "$NOFOLLOW_EXTERNAL"
HOME="$NOFOLLOW_HOME" USERPROFILE="$NOFOLLOW_HOME" HERMES_HOME="$NOFOLLOW_HERMES" \
  GO_BEAST_TEST_RACE_MODE=symlink-swap \
  GO_BEAST_TEST_RACE_TARGET="$NOFOLLOW_HERMES/skills/go-beast/go-fox" \
  GO_BEAST_TEST_SKILLS_DIR="$NOFOLLOW_HERMES/skills" \
  GO_BEAST_TEST_MOVED_SKILLS="$NOFOLLOW_MOVED" \
  GO_BEAST_TEST_EXTERNAL_SKILLS="$NOFOLLOW_EXTERNAL" \
  NODE_OPTIONS="--require=$TEST_ROOT/inject-race.cjs" \
  run_race_profile disable "$NOFOLLOW_HOME" "$NOFOLLOW_HERMES" --kind skill --name go-fox --format json > "$TEST_ROOT/nofollow-disable.log" 2>&1 || true
if ! test -f "$NOFOLLOW_EXTERNAL/go-beast/go-fox/SKILL.md"; then
  printf '%s\n' 'HERMES_NOFOLLOW_RED' >&2
  fail 'a concurrent symlink replacement must not move or remove an external skill target'
fi
if ! test -f "$NOFOLLOW_MOVED/go-beast/go-fox/SKILL.md" \
  || ! grep -qiE 'symlink|symbolic link' "$TEST_ROOT/nofollow-disable.log"; then
  fail 'the rooted helper must reject the symlink swap and leave the original Hermes tree intact'
fi

printf '%s\n' 'Hermes installer tests passed'
if [ "$failures" -gt 0 ]; then
  printf 'Hermes installer regression failures: %s\n' "$failures" >&2
  exit 1
fi