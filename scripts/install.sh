#!/usr/bin/env bash

set -euo pipefail

SCRIPT_URL="${GO_BEAST_INSTALLER_SCRIPT_URL:-https://raw.githubusercontent.com/MarcosAlves90/go-beast/main/scripts/install-from-release-archive.mjs}"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js 18+ is required."
command -v curl >/dev/null 2>&1 || fail "curl is required."

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

INSTALLER="$TMP_DIR/install-from-release-archive.mjs"
curl -fsSL "$SCRIPT_URL" -o "$INSTALLER"

node "$INSTALLER" "$@"
