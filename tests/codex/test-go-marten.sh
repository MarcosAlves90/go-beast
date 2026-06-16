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
echo "# Test" > README.md
git add README.md
git commit -m "chore: init" --quiet

OUTPUT_FILE="$TEST_PROJECT/output.txt"
PROMPT="Use the go-marten skill. I need an isolated worktree for a risky auth refactor. Do not execute commands. Produce the worktree plan, worktree state expectations, and cleanup rules."

codex exec "$PROMPT" \
  -C "$TEST_PROJECT" \
  --sandbox workspace-write \
  --output-last-message "$OUTPUT_FILE" \
  >/tmp/go-beast-codex-go-marten.log

assert_contains "$OUTPUT_FILE" "WORKTREE PLAN" "go-marten produced worktree plan"
assert_contains "$OUTPUT_FILE" "CLEANUP RULES" "go-marten produced cleanup rules"

echo "STATUS: PASSED"
