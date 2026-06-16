#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/go-beast"
SYSTEM_PROMPT="$(cat "$REPO_ROOT/AGENTS.bootstrap.md")"
source "$REPO_ROOT/tests/helpers.sh"
require_live_agent_tests claude

TEST_PROJECT="$(create_test_project)"
trap 'cleanup_test_project "$TEST_PROJECT"' EXIT

cat > "$TEST_PROJECT/README.md" <<'EOF'
# Bootstrap Fixture

Legacy billing service.
EOF

OUTPUT_FILE="$TEST_PROJECT/output.txt"
PROMPT="We need to add role-based access control to this project. Do not implement. Tell me which go-beast skill you would invoke first and why."

cd "$TEST_PROJECT"
run_with_timeout 300 claude -p "$PROMPT" \
  --plugin-dir "$PLUGIN_DIR" \
  --append-system-prompt "$SYSTEM_PROMPT" \
  --dangerously-skip-permissions \
  > "$OUTPUT_FILE" 2>&1

assert_contains "$OUTPUT_FILE" "go-mole|go-hawk" "bootstrap steers triage before implementation"

echo "STATUS: PASSED"
