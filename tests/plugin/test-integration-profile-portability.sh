#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NO_RG_BIN="$(mktemp -d)"

cleanup() {
  rm -rf "$NO_RG_BIN"
}
trap cleanup EXIT

ln -s "$(command -v node)" "$NO_RG_BIN/node"
ln -s "$(command -v jq)" "$NO_RG_BIN/jq"

restricted_path="$NO_RG_BIN:/usr/bin:/bin"
PATH="$restricted_path" /bin/bash "$SCRIPT_DIR/test-integration-profile.sh"
PATH="$restricted_path" /bin/bash "$SCRIPT_DIR/test-integration-profile-advanced.sh"

echo "Integration profile portability tests passed"
