#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_HOME="$(mktemp -d)"
OLD_REPO="$(mktemp -d)"
EXTERNAL_HOOKS="$(mktemp -d)"
cleanup() {
  rm -rf "$TEST_HOME" "$OLD_REPO" "$EXTERNAL_HOOKS"
}
trap cleanup EXIT

mkdir -p "$TEST_HOME/.codex/hooks" "$OLD_REPO/hooks"

cp "$REPO_ROOT/hooks/manifest.json" "$OLD_REPO/hooks/manifest.json"
printf '#!/usr/bin/env bash\necho old-go-beast\n' > "$OLD_REPO/hooks/code-dedup-check.sh"
chmod +x "$OLD_REPO/hooks/code-dedup-check.sh"

printf '#!/usr/bin/env bash\necho external\n' > "$EXTERNAL_HOOKS/code-verify-flag.sh"
chmod +x "$EXTERNAL_HOOKS/code-verify-flag.sh"

ln -s "$OLD_REPO/hooks/code-dedup-check.sh" "$TEST_HOME/.codex/hooks/code-dedup-check.sh"
ln -s "$EXTERNAL_HOOKS/code-verify-flag.sh" "$TEST_HOME/.codex/hooks/code-verify-flag.sh"

cat > "$TEST_HOME/.codex/hooks.json" <<'JSON'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.codex/hooks/code-dedup-check.sh",
            "statusMessage": "OLD MESSAGE"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.codex/hooks/custom-stop.sh",
            "statusMessage": "Custom stop"
          }
        ]
      }
    ]
  }
}
JSON

OUTPUT_JSON="$TEST_HOME/output.json"
node "$REPO_ROOT/scripts/hook-wire.mjs" sync \
  --repo "$REPO_ROOT" \
  --home "$TEST_HOME" \
  --agent codex \
  --hooks code-dedup-check.sh,code-verify-flag.sh,go-beast-user-prompt-context.sh \
  > "$OUTPUT_JSON"

assert_symlink_target \
  "$TEST_HOME/.codex/hooks/code-dedup-check.sh" \
  "$REPO_ROOT/hooks/code-dedup-check.sh" \
  "replaces previously wired go-beast hook symlink"

assert_symlink_target \
  "$TEST_HOME/.codex/hooks/code-verify-flag.sh" \
  "$(cd "$EXTERNAL_HOOKS" && pwd -P)/code-verify-flag.sh" \
  "preserves external hook symlink"

assert_contains \
  "$TEST_HOME/.codex/hooks.json" \
  "Checking for duplicate code" \
  "rewires go-beast hook config with manifest status message"

assert_contains \
  "$TEST_HOME/.codex/hooks.json" \
  "Re-anchoring go-beast context" \
  "rewires codex UserPromptSubmit anti-drift hook config"

assert_contains \
  "$TEST_HOME/.codex/hooks.json" \
  "bash ~/.codex/hooks/custom-stop.sh" \
  "preserves non-go-beast hook config entries"

assert_contains \
  "$OUTPUT_JSON" \
  "\"status\": \"replaced\"" \
  "reports replaced managed hook during sync"

assert_contains \
  "$OUTPUT_JSON" \
  "\"status\": \"warn\"" \
  "reports preserved external hook during sync"

SYNC_HOME="$(mktemp -d)"
mkdir -p "$SYNC_HOME/.claude/hooks"
ln -s "$REPO_ROOT/hooks/sync-go-beast-skills.sh" "$SYNC_HOME/.claude/hooks/sync-go-beast-skills.sh"

printf '%s' '{"session_id":"sync-test","cwd":"/tmp/project","source":"startup"}' \
  | HOME="$SYNC_HOME" bash "$SYNC_HOME/.claude/hooks/sync-go-beast-skills.sh" \
  > "$SYNC_HOME/sync.out" 2>&1

assert_contains \
  "$SYNC_HOME/.claude/CLAUDE.md" \
  "Engineering Agent Guidelines" \
  "sync hook resolves repo root when executed through symlink"

assert_contains \
  "$SYNC_HOME/.codex/AGENTS.md" \
  "Engineering Agent Guidelines" \
  "sync hook writes Codex global instructions from symlink execution"

echo "STATUS: PASSED"
