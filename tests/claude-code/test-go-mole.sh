#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLUGIN_DIR="$REPO_ROOT/plugins/go-beast"
source "$REPO_ROOT/tests/helpers.sh"
require_live_agent_tests claude

TEST_PROJECT="$(create_test_project)"
trap 'cleanup_test_project "$TEST_PROJECT"' EXIT

cat > "$TEST_PROJECT/README.md" <<'EOF'
# Sample API

Small service for test coverage.

## Run

```bash
npm run dev
```

## Test

```bash
npm test
```
EOF

cat > "$TEST_PROJECT/AGENTS.md" <<'EOF'
# Sample API

Use Conventional Commits.
EOF

OUTPUT_FILE="$TEST_PROJECT/output.txt"
PROMPT="Use the go-mole skill to analyze this repository. Return the Project Briefing and include Purpose, Run, Test, Agent rules, and Gaps."

cd "$TEST_PROJECT"
run_with_timeout 300 claude -p "$PROMPT" \
  --plugin-dir "$PLUGIN_DIR" \
  --dangerously-skip-permissions \
  > "$OUTPUT_FILE" 2>&1

assert_contains "$OUTPUT_FILE" "## Project Briefing" "go-mole produced project briefing"
assert_contains "$OUTPUT_FILE" "Purpose" "go-mole included Purpose"
assert_contains "$OUTPUT_FILE" "Run" "go-mole included Run"
assert_contains "$OUTPUT_FILE" "Test" "go-mole included Test"
assert_contains "$OUTPUT_FILE" "Gaps" "go-mole included Gaps"

echo "STATUS: PASSED"
