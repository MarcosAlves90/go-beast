#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"
require_live_agent_tests codex

TEST_PROJECT="$(create_test_project)"
trap 'cleanup_test_project "$TEST_PROJECT"' EXIT

cd "$TEST_PROJECT"
git init --quiet
git config user.email "test@test.com"
git config user.name "Test User"
cat > AGENTS.md <<'EOF'
# Local Agent Notes

- This environment cannot rely on SessionStart hooks.
- Initialization must be explicit and repeatable.
EOF
git add AGENTS.md
git commit -m "chore: init" --quiet

OUTPUT_FILE="$TEST_PROJECT/output.txt"
PROMPT="Use the go-mule skill. I need to initialize go-beast for a hookless Codex environment as an explicit alternative to sync-hook instrumentation. Do not modify files or run installer commands. You may read local skill instructions if needed. Produce INITIALIZATION PLAN, CORE SETUP, OPTIONAL HARNESS STEPS, and VALIDATION blocks."

codex exec "$PROMPT" \
  -C "$TEST_PROJECT" \
  --sandbox workspace-write \
  --output-last-message "$OUTPUT_FILE" \
  >/tmp/go-beast-codex-go-mule.log

assert_contains "$OUTPUT_FILE" "INITIALIZATION PLAN|Initialization Plan" "go-mule produced initialization plan"
assert_contains "$OUTPUT_FILE" "CORE SETUP|Core Setup" "go-mule produced core setup block"
assert_contains "$OUTPUT_FILE" "OPTIONAL HARNESS STEPS|Optional Harness Steps" "go-mule separated optional harness steps"
assert_contains "$OUTPUT_FILE" "VALIDATION|Validation" "go-mule produced validation block"
assert_contains "$OUTPUT_FILE" "sync hook|sync-hook|SessionStart" "go-mule explained the sync-hook alternative"
assert_contains "$OUTPUT_FILE" "install\\.mjs|scripts/install\\.mjs" "go-mule referenced the explicit installer path"
assert_contains "$OUTPUT_FILE" "AGENTS\\.global\\.md|AGENTS\\.bootstrap\\.md" "go-mule referenced go-beast instruction files"
assert_contains "$OUTPUT_FILE" "skills/" "go-mule referenced the canonical skills directory"
assert_contains "$OUTPUT_FILE" "hooks\\.json|config\\.toml|/hooks" "go-mule separated Codex-specific optional wiring"

echo "STATUS: PASSED"
