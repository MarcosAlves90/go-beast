#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"
require_live_agent_tests claude

TEST_HOME="$(mktemp -d)"
OLD_REPO="$(mktemp -d)"
EXTERNAL_HOOKS="$(mktemp -d)"
cleanup() {
  rm -rf "$TEST_HOME" "$OLD_REPO" "$EXTERNAL_HOOKS"
}
trap cleanup EXIT

mkdir -p "$TEST_HOME/.claude/hooks" "$OLD_REPO/hooks"

cp "$REPO_ROOT/hooks/manifest.json" "$OLD_REPO/hooks/manifest.json"
printf '#!/usr/bin/env bash\necho old-go-beast\n' > "$OLD_REPO/hooks/code-dedup-check.sh"
chmod +x "$OLD_REPO/hooks/code-dedup-check.sh"

printf '#!/usr/bin/env bash\necho external\n' > "$EXTERNAL_HOOKS/code-verify-flag.sh"
chmod +x "$EXTERNAL_HOOKS/code-verify-flag.sh"

ln -s "$OLD_REPO/hooks/code-dedup-check.sh" "$TEST_HOME/.claude/hooks/code-dedup-check.sh"
ln -s "$EXTERNAL_HOOKS/code-verify-flag.sh" "$TEST_HOME/.claude/hooks/code-verify-flag.sh"

cat > "$TEST_HOME/.claude/settings.json" <<'JSON'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/code-dedup-check.sh",
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
            "command": "bash ~/.claude/hooks/custom-stop.sh",
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
  --agent claude-code \
  --hooks code-dedup-check.sh,code-verify-flag.sh,go-beast-stop-reanchor.sh,go-beast-user-prompt-context.sh \
  > "$OUTPUT_JSON"

assert_symlink_target \
  "$TEST_HOME/.claude/hooks/code-dedup-check.sh" \
  "$REPO_ROOT/hooks/code-dedup-check.sh" \
  "claude live rewire replaces managed hook symlink"

assert_symlink_target \
  "$TEST_HOME/.claude/hooks/code-verify-flag.sh" \
  "$(cd "$EXTERNAL_HOOKS" && pwd -P)/code-verify-flag.sh" \
  "claude live rewire preserves external hook symlink"

assert_contains \
  "$TEST_HOME/.claude/settings.json" \
  "Checking for duplicate code" \
  "claude live rewire refreshes managed hook config"

assert_contains \
  "$TEST_HOME/.claude/settings.json" \
  "Checking go-beast drift" \
  "claude live rewire wires Stop anti-drift hook"

assert_contains \
  "$TEST_HOME/.claude/settings.json" \
  "Re-anchoring go-beast context" \
  "claude live rewire wires UserPromptSubmit anti-drift hook"

assert_contains \
  "$TEST_HOME/.claude/settings.json" \
  "bash ~/.claude/hooks/custom-stop.sh" \
  "claude live rewire preserves external config entries"

assert_contains \
  "$OUTPUT_JSON" \
  "\"status\": \"replaced\"" \
  "claude live rewire reports replaced managed hook"

assert_contains \
  "$OUTPUT_JSON" \
  "\"status\": \"warn\"" \
  "claude live rewire reports preserved external hook"

echo "STATUS: PASSED"
