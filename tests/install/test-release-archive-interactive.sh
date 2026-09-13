#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TEST_HOME="$(mktemp -d)"
ARCHIVE_DIR="$(mktemp -d)"
ARCHIVE_PATH="$ARCHIVE_DIR/go-beast-release-archive.tar.gz"
LATEST_JSON="$ARCHIVE_DIR/latest.json"
RELEASES_JSON="$ARCHIVE_DIR/releases.json"
SERVER_PORT_FILE="$ARCHIVE_DIR/server.port"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TEST_HOME" "$ARCHIVE_DIR"
}
trap cleanup EXIT

mkdir -p "$TEST_HOME/.claude"

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

INSTALL_OUTPUT="$(printf '1\n' | env \
  GO_BEAST_INSTALLER_SCRIPT_URL="http://127.0.0.1:$SERVER_PORT/install-from-release-archive.mjs" \
  GO_BEAST_RELEASE_LATEST_API_URL="http://127.0.0.1:$SERVER_PORT/latest.json" \
  GO_BEAST_RELEASES_API_URL="http://127.0.0.1:$SERVER_PORT/releases.json" \
  HOME="$TEST_HOME" \
  bash "$REPO_ROOT/scripts/install.sh" \
  --interactive \
  --all 2>&1)"

if ! grep -Fq 'Select an option [1]:' <<<"$INSTALL_OUTPUT"; then
  echo 'INTERACTIVE_RELEASE_MENU_MISSING' >&2
  printf '%s\n' "$INSTALL_OUTPUT" >&2
  exit 1
fi

echo 'STATUS: PASSED'
