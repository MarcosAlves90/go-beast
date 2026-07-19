#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_HOME="$(mktemp -d)"
ARCHIVE_DIR="$(mktemp -d)"
ARCHIVE_PATH="$ARCHIVE_DIR/go-beast-release-archive.tar.gz"
LATEST_JSON="$ARCHIVE_DIR/latest.json"
RELEASES_JSON="$ARCHIVE_DIR/releases.json"
SERVER_PORT_FILE="$ARCHIVE_DIR/server.port"
SECOND_WORKDIR=""
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TEST_HOME" "$ARCHIVE_DIR"
  if [ -n "$SECOND_WORKDIR" ]; then
    rm -rf "$SECOND_WORKDIR"
  fi
}
trap cleanup EXIT

mkdir -p "$TEST_HOME/.claude" "$TEST_HOME/.codex"

tar -czf "$ARCHIVE_PATH" \
  --exclude='go-beast/.git' \
  --exclude='go-beast/.vscode' \
  -C "$(dirname "$REPO_ROOT")" \
  "$(basename "$REPO_ROOT")"

cp "$REPO_ROOT/scripts/install-from-release-archive.mjs" "$ARCHIVE_DIR/install-from-release-archive.mjs"

python3 - "$ARCHIVE_DIR" "$SERVER_PORT_FILE" <<'PY' &
import http.server
import socketserver
import sys

root = sys.argv[1]
port_file = sys.argv[2]

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=root, **kwargs)

with socketserver.TCPServer(("127.0.0.1", 0), Handler) as httpd:
    with open(port_file, "w", encoding="utf-8") as handle:
        handle.write(str(httpd.server_address[1]))
    httpd.serve_forever()
PY
SERVER_PID=$!

while [ ! -f "$SERVER_PORT_FILE" ]; do
  sleep 0.1
done

SERVER_PORT="$(cat "$SERVER_PORT_FILE")"
printf '{"tag_name":"v1.40.3","tarball_url":"http://127.0.0.1:%s/go-beast-release-archive.tar.gz"}\n' "$SERVER_PORT" > "$LATEST_JSON"
printf '[{"tag_name":"v1.40.3","tarball_url":"http://127.0.0.1:%s/go-beast-release-archive.tar.gz","draft":false,"published_at":"2026-06-22T00:00:00Z"}]\n' "$SERVER_PORT" > "$RELEASES_JSON"

printf '1\n' | env \
  GO_BEAST_INSTALLER_SCRIPT_URL="http://127.0.0.1:$SERVER_PORT/install-from-release-archive.mjs" \
  GO_BEAST_FORCE_RELEASE_MENU=1 \
  GO_BEAST_RELEASE_LATEST_API_URL="http://127.0.0.1:$SERVER_PORT/latest.json" \
  GO_BEAST_RELEASES_API_URL="http://127.0.0.1:$SERVER_PORT/releases.json" \
  HOME="$TEST_HOME" \
  bash "$REPO_ROOT/scripts/install.sh" \
  --all \
  --bootstrap

INSTALL_BASE="$TEST_HOME/.go-beast/source/go-beast-release-archive"
CURRENT_ROOT="$INSTALL_BASE/current"
INSTALL_ROOT="$(cd "$CURRENT_ROOT" && pwd -P)"

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

SECOND_WORKDIR="$(mktemp -d)"
ARCHIVE_PATH_2="$ARCHIVE_DIR/go-beast-release-archive-v2.tar.gz"

tar -xzf "$ARCHIVE_PATH" -C "$SECOND_WORKDIR"
SECOND_REPO="$SECOND_WORKDIR/$(basename "$REPO_ROOT")"

perl -0pi -e 's/^description: Conducts structured discovery interviews, produces a versioned `\.go-beast\/REQUIREMENTS\.md`, identifies unknowns and risks, and generates a go-beast handoff plan for a software project\./description: Conducts structured discovery interviews, produces a versioned .go-beast\/REQUIREMENTS.md, identifies unknowns and risks, and generates a go-beast handoff plan for a software project with update verification./m' \
  "$SECOND_REPO/skills/go-hawk/SKILL.md"

assert_contains \
  "$SECOND_REPO/skills/go-hawk/SKILL.md" \
  '^description: Conducts structured discovery interviews, produces a versioned \.go-beast/REQUIREMENTS\.md, identifies unknowns and risks, and generates a go-beast handoff plan for a software project with update verification\.$' \
  "archive bootstrap test fixture updates selected release content"

tar -czf "$ARCHIVE_PATH_2" \
  --exclude='go-beast/.git' \
  --exclude='go-beast/.vscode' \
  -C "$SECOND_WORKDIR" \
  "$(basename "$REPO_ROOT")"

printf '[{"tag_name":"v1.40.4","tarball_url":"http://127.0.0.1:%s/go-beast-release-archive-v2.tar.gz","draft":false,"published_at":"2026-06-22T01:00:00Z"},{"tag_name":"v1.40.3","tarball_url":"http://127.0.0.1:%s/go-beast-release-archive.tar.gz","draft":false,"published_at":"2026-06-22T00:00:00Z"}]\n' "$SERVER_PORT" "$SERVER_PORT" > "$RELEASES_JSON"
printf '{"tag_name":"v1.40.4","tarball_url":"http://127.0.0.1:%s/go-beast-release-archive-v2.tar.gz"}\n' "$SERVER_PORT" > "$LATEST_JSON"

printf '2\n1\n' | env \
  GO_BEAST_FORCE_RELEASE_MENU=1 \
  GO_BEAST_RELEASE_LATEST_API_URL="http://127.0.0.1:$SERVER_PORT/latest.json" \
  GO_BEAST_RELEASES_API_URL="http://127.0.0.1:$SERVER_PORT/releases.json" \
  HOME="$TEST_HOME" \
  node "$REPO_ROOT/scripts/install-from-release-archive.mjs" \
  --all \
  --bootstrap

UPDATED_INSTALL_ROOT="$(cd "$CURRENT_ROOT" && pwd -P)"

assert_symlink_target \
  "$TEST_HOME/.go-beast/source/go-beast-release-archive/current" \
  "$UPDATED_INSTALL_ROOT" \
  "archive bootstrap refreshes the active source pointer in place"

assert_symlink_target \
  "$TEST_HOME/.claude/skills/go-mule" \
  "$UPDATED_INSTALL_ROOT/skills/go-mule" \
  "archive bootstrap keeps installed links pointed at the active source pointer"

assert_contains \
  "$TEST_HOME/.claude/skills/go-hawk/SKILL.md" \
  '^description: Conducts structured discovery interviews, produces a versioned \.go-beast/REQUIREMENTS\.md, identifies unknowns and risks, and generates a go-beast handoff plan for a software project with update verification\.$' \
  "archive bootstrap updates installed content after rerun"

echo "STATUS: PASSED"
