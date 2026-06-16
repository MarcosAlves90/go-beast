#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

cd "$REPO_ROOT"

node scripts/sync-plugin-skills.mjs >/tmp/go-beast-plugin-sync.json
node --input-type=module -e "import fs from 'fs'; JSON.parse(fs.readFileSync('plugins/go-beast/.codex-plugin/plugin.json','utf8')); JSON.parse(fs.readFileSync('plugins/go-beast/.claude-plugin/plugin.json','utf8'));"

assert_symlink_target \
  "$REPO_ROOT/plugins/go-beast/skills/go-mole" \
  "$REPO_ROOT/go-mole" \
  "plugin bundle links canonical go-mole skill"

assert_symlink_target \
  "$REPO_ROOT/plugins/go-beast/skills/go-tern" \
  "$REPO_ROOT/go-tern" \
  "plugin bundle links canonical go-tern skill"

assert_symlink_target \
  "$REPO_ROOT/plugins/go-beast/skills/go-marten" \
  "$REPO_ROOT/go-marten" \
  "plugin bundle links canonical go-marten skill"

echo "STATUS: PASSED"
