#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"
require_live_agent_tests copilot

TEST_HOME="$(mktemp -d)"
OLD_REPO="$(mktemp -d)"
EXTERNAL_HOOKS="$(mktemp -d)"
cleanup() {
  rm -rf "$TEST_HOME" "$OLD_REPO" "$EXTERNAL_HOOKS"
}
trap cleanup EXIT

mkdir -p "$TEST_HOME/.copilot/hooks" "$OLD_REPO/hooks"

cp "$REPO_ROOT/hooks/manifest.json" "$OLD_REPO/hooks/manifest.json"
printf '#!/usr/bin/env bash\necho old-go-beast\n' > "$OLD_REPO/hooks/code-dedup-check.sh"
chmod +x "$OLD_REPO/hooks/code-dedup-check.sh"

printf '#!/usr/bin/env bash\necho external\n' > "$EXTERNAL_HOOKS/code-verify-flag.sh"
chmod +x "$EXTERNAL_HOOKS/code-verify-flag.sh"

ln -s "$OLD_REPO/hooks/code-dedup-check.sh" "$TEST_HOME/.copilot/hooks/code-dedup-check.sh"
ln -s "$EXTERNAL_HOOKS/code-verify-flag.sh" "$TEST_HOME/.copilot/hooks/code-verify-flag.sh"

# Pre-existing go-beast.json with a managed entry that should be refreshed
# and an external entry that must be preserved.
cat > "$TEST_HOME/.copilot/hooks/go-beast.json" <<'JSON'
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "bash ~/.copilot/hooks/code-dedup-check.sh",
        "matcher": "Edit|Write|MultiEdit"
      }
    ]
  }
}
JSON

OUTPUT_JSON="$TEST_HOME/output.json"
node "$REPO_ROOT/scripts/hook-wire.mjs" sync \
  --repo "$REPO_ROOT" \
  --home "$TEST_HOME" \
  --agent copilot \
  --hooks code-dedup-check.sh,go-beast-user-prompt-context.sh \
  > "$OUTPUT_JSON"

# Symlinks
assert_symlink_target \
  "$TEST_HOME/.copilot/hooks/code-dedup-check.sh" \
  "$REPO_ROOT/hooks/code-dedup-check.sh" \
  "copilot rewire replaces managed hook symlink"

assert_symlink_target \
  "$TEST_HOME/.copilot/hooks/code-verify-flag.sh" \
  "$(cd "$EXTERNAL_HOOKS" && pwd -P)/code-verify-flag.sh" \
  "copilot rewire preserves external hook symlink"

# Config format: version 1, camelCase events, flat bash entries
assert_contains \
  "$TEST_HOME/.copilot/hooks/go-beast.json" \
  '"version": 1' \
  "copilot hook config has version 1"

assert_contains \
  "$TEST_HOME/.copilot/hooks/go-beast.json" \
  '"userPromptSubmitted"' \
  "copilot hook config uses camelCase event names"

assert_contains \
  "$TEST_HOME/.copilot/hooks/go-beast.json" \
  '"bash":' \
  "copilot hook config uses bash field"

assert_contains \
  "$TEST_HOME/.copilot/hooks/go-beast.json" \
  'go-beast-user-prompt-context.sh' \
  "copilot rewire wires UserPromptSubmit anti-drift hook"

# Output report
assert_contains \
  "$OUTPUT_JSON" \
  '"status": "replaced"' \
  "copilot rewire reports replaced managed hook"

assert_contains \
  "$OUTPUT_JSON" \
  '"status": "warn"' \
  "copilot rewire reports preserved external hook"

echo "STATUS: PASSED"
