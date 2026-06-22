#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_HOME="$(mktemp -d)"
ARCHIVE_DIR="$(mktemp -d)"
ARCHIVE_PATH="$ARCHIVE_DIR/go-beast-release-archive.tar.gz"
cleanup() {
  rm -rf "$TEST_HOME" "$ARCHIVE_DIR"
}
trap cleanup EXIT

mkdir -p "$TEST_HOME/.claude" "$TEST_HOME/.codex"

tar -czf "$ARCHIVE_PATH" \
  --exclude='go-beast/.git' \
  --exclude='go-beast/.vscode' \
  -C "$(dirname "$REPO_ROOT")" \
  "$(basename "$REPO_ROOT")"

HOME="$TEST_HOME" node "$REPO_ROOT/scripts/install-from-release-archive.mjs" \
  --archive "$ARCHIVE_PATH" \
  --all \
  --bootstrap

INSTALL_ROOT="$(cd "$TEST_HOME/.go-beast/source/go-beast-release-archive" && pwd -P)"

assert_contains \
  "$TEST_HOME/.go-beast/bootstrap.enabled" \
  '^enabled$' \
  "archive bootstrap persists bootstrap mode marker"

assert_symlink_target \
  "$TEST_HOME/.claude/skills/go-mule" \
  "$INSTALL_ROOT/skills/go-mule" \
  "archive bootstrap installs skills from persistent extracted source"

assert_symlink_target \
  "$TEST_HOME/.claude/hooks/sync-go-beast-skills.sh" \
  "$INSTALL_ROOT/hooks/sync-go-beast-skills.sh" \
  "archive bootstrap installs hooks from persistent extracted source"

assert_contains \
  "$TEST_HOME/.codex/AGENTS.md" \
  'Bootstrap mode' \
  "archive bootstrap copies bootstrap global instructions"

assert_contains \
  "$TEST_HOME/.claude/skills/go-hawk/SKILL.md" \
  '^description: Conducts structured discovery interviews,' \
  "archive bootstrap leaves canonical skill content available through symlink"

test -f "$INSTALL_ROOT/scripts/install.mjs"
echo "[PASS] archive bootstrap extracted persistent install root"

echo "STATUS: PASSED"
