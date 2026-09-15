#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_ROOT="$(mktemp -d)"
SOURCE_ROOT="$TEST_ROOT/source"
INSTALL_HOME="$TEST_ROOT/install-home"
PREVIEW_HOME="$TEST_ROOT/preview-home"
DRY_RUN_HOME="$TEST_ROOT/dry-run-home"
FAIL_HOME="$TEST_ROOT/fail-home"
UPGRADE_HOME="$TEST_ROOT/upgrade-home"
cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

if ! grep -q 'createInstallTransaction' "$REPO_ROOT/scripts/install.mjs"; then
  printf '%s\n' 'V2_INSTALL_TRANSACTION_RED: transactional installer is not wired'
  exit 1
fi

mkdir -p "$SOURCE_ROOT" "$INSTALL_HOME/.codex" "$PREVIEW_HOME/.codex" "$DRY_RUN_HOME/.codex" "$UPGRADE_HOME/.codex"
tar -cf - \
  --exclude='.git' \
  --exclude='.go-beast' \
  --exclude='.polis' \
  -C "$REPO_ROOT" . | tar -xf - -C "$SOURCE_ROOT"

# An unmanaged file is part of the install contract and must survive every
# managed install and rollback operation.
mkdir -p "$INSTALL_HOME/.codex/skills"
printf '%s\n' 'user-owned skill content' > "$INSTALL_HOME/.codex/skills/go-hawk"
unmanaged_before="$(<"$INSTALL_HOME/.codex/skills/go-hawk")"

HOME="$INSTALL_HOME" GO_BEAST_INSTALL_ROOT="$SOURCE_ROOT" node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/install.log"
MANIFEST="$INSTALL_HOME/.go-beast/install-manifest.json"
TRANSACTIONS="$INSTALL_HOME/.go-beast/install-transactions"
test -s "$MANIFEST"
node - "$MANIFEST" <<'NODE'
const fs = require('node:fs')
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (manifest.schema_version !== 1 || !manifest.transaction_id || !Array.isArray(manifest.assets) || manifest.assets.length === 0) {
  throw new Error('install manifest is missing transaction or asset metadata')
}
for (const asset of manifest.assets) {
  if (!/^\/[a-z]/i.test(asset.source) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.size)) {
    throw new Error(`invalid integrity metadata for ${asset.name}`)
  }
}
NODE
test "$(<"$INSTALL_HOME/.codex/skills/go-hawk")" = "$unmanaged_before"
test -L "$INSTALL_HOME/.codex/skills/go-fox"
test -d "$TRANSACTIONS"

HOME="$PREVIEW_HOME" GO_BEAST_INSTALL_ROOT="$SOURCE_ROOT" node "$REPO_ROOT/scripts/install.mjs" --all --permission-preview > "$TEST_ROOT/permission-preview.log"
grep -q 'Permission preview' "$TEST_ROOT/permission-preview.log"
test ! -e "$PREVIEW_HOME/.go-beast/install-manifest.json"
test ! -e "$PREVIEW_HOME/.codex/skills/go-fox"

HOME="$DRY_RUN_HOME" GO_BEAST_INSTALL_ROOT="$SOURCE_ROOT" node "$REPO_ROOT/scripts/install.mjs" --all --dry-run > "$TEST_ROOT/dry-run.log"
grep -q 'Dry-run' "$TEST_ROOT/dry-run.log"
test ! -e "$DRY_RUN_HOME/.go-beast/install-manifest.json"
test ! -e "$DRY_RUN_HOME/.codex/skills/go-fox"

printf '%s\n' '# tampered source' >> "$SOURCE_ROOT/skills/go-hawk/SKILL.md"
if HOME="$INSTALL_HOME" GO_BEAST_INSTALL_ROOT="$SOURCE_ROOT" node "$REPO_ROOT/scripts/install.mjs" --all --verify-integrity > "$TEST_ROOT/integrity.out" 2>&1; then
  echo 'tampered source unexpectedly passed integrity verification' >&2
  exit 1
fi
grep -qi 'integrity mismatch' "$TEST_ROOT/integrity.out"
test "$(<"$INSTALL_HOME/.codex/skills/go-hawk")" = "$unmanaged_before"

HOME="$INSTALL_HOME" GO_BEAST_INSTALL_ROOT="$SOURCE_ROOT" node "$REPO_ROOT/scripts/install.mjs" --rollback > "$TEST_ROOT/rollback.log"
grep -q 'Install rollback' "$TEST_ROOT/rollback.log"
test ! -e "$INSTALL_HOME/.codex/skills/go-fox"
test "$(<"$INSTALL_HOME/.codex/skills/go-hawk")" = "$unmanaged_before"
test ! -e "$INSTALL_HOME/.go-beast/install-manifest.json"

mkdir -p "$FAIL_HOME/.codex"
printf '%s\n' 'pre-existing target directory file' > "$FAIL_HOME/.codex/skills"
if HOME="$FAIL_HOME" GO_BEAST_INSTALL_ROOT="$SOURCE_ROOT" node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/failure.out" 2>&1; then
  echo 'forced install failure unexpectedly passed' >&2
  exit 1
fi
grep -qi 'install transaction failed\|ENOTDIR\|not a directory' "$TEST_ROOT/failure.out"
test "$(<"$FAIL_HOME/.codex/skills")" = 'pre-existing target directory file'
test ! -e "$FAIL_HOME/.go-beast/install-manifest.json"

HOME="$UPGRADE_HOME" GO_BEAST_INSTALL_ROOT="$SOURCE_ROOT" node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/upgrade-first.log"
printf '%s\n' '# upgrade source' >> "$SOURCE_ROOT/skills/go-hawk/SKILL.md"
HOME="$UPGRADE_HOME" GO_BEAST_INSTALL_ROOT="$SOURCE_ROOT" node "$REPO_ROOT/scripts/install.mjs" --all > "$TEST_ROOT/upgrade-second.log"
transaction_count="$(find "$UPGRADE_HOME/.go-beast/install-transactions" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
test "$transaction_count" -ge 2

echo 'Transactional installer tests passed'
