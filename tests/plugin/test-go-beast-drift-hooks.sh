#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_HOME="$(mktemp -d)"
cleanup() {
  rm -rf "$TEST_HOME"
}
trap cleanup EXIT

STATE_DIR="$TEST_HOME/.go-beast"
mkdir -p "$STATE_DIR"
touch "$STATE_DIR/bootstrap.enabled"

HOOK_HOME="$TEST_HOME/.claude/hooks"
mkdir -p "$HOOK_HOME"
ln -s "$REPO_ROOT/hooks/go-beast-session-state.sh" "$HOOK_HOME/go-beast-session-state.sh"

SESSION_INPUT='{"session_id":"sess-1","cwd":"/tmp/project","source":"startup"}'
printf '%s' "$SESSION_INPUT" | GO_BEAST_STATE_DIR="$STATE_DIR" bash "$HOOK_HOME/go-beast-session-state.sh"

STATE_FILE="$STATE_DIR/anti-drift/sess-1.json"
assert_contains "$STATE_FILE" '"mode":"bootstrap"' "session-state initializes bootstrap mode"
assert_contains "$STATE_FILE" '"harness":"claude-code"' "session-state records harness from symlink path"
assert_contains "$STATE_FILE" '"task_state":"active"' "session-state initializes active task state"

cat > "$STATE_FILE" <<'JSON'
{
  "version": 1,
  "session_id": "sess-1",
  "cwd": "/tmp/project",
  "harness": "codex",
  "mode": "bootstrap",
  "active_beast": "go-hawk",
  "required_artifact": ".go-beast/REQUIREMENTS.md",
  "implementation_unlocked": false,
  "task_state": "active",
  "task_id": "task-1",
  "unanchored_stop_count": 0,
  "last_reanchor_reason": "",
  "updated_at": "2026-06-19T00:00:00Z"
}
JSON

PROMPT_OUTPUT="$TEST_HOME/prompt-output.json"
printf '%s' '{"session_id":"sess-1","cwd":"/tmp/project","prompt":"siga"}' \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-user-prompt-context.sh" \
  > "$PROMPT_OUTPUT"

assert_contains "$PROMPT_OUTPUT" 'go_beast_state' "user-prompt hook emits re-anchor context"
assert_contains "$PROMPT_OUTPUT" 'go-hawk' "user-prompt hook includes active beast"
assert_contains "$PROMPT_OUTPUT" '.go-beast/REQUIREMENTS.md' "user-prompt hook includes required artifact"

STOP_INPUT='{"session_id":"sess-1","cwd":"/tmp/project","stop_hook_active":false,"last_assistant_message":"Continuing with the task now."}'

set +e
printf '%s' "$STOP_INPUT" | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" > "$TEST_HOME/stop-first.out" 2>&1
FIRST_EXIT=$?
for attempt in 2 3 4; do
  printf '%s' "$STOP_INPUT" | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" > "$TEST_HOME/stop-$attempt.out" 2>&1
done
printf '%s' "$STOP_INPUT" | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" > "$TEST_HOME/stop-threshold.out" 2>&1
THRESHOLD_EXIT=$?
set -e

if [[ "$FIRST_EXIT" -ne 0 ]]; then
  echo "[FAIL] stop hook first unanchored turn stays passive"
  echo "Expected: 0"
  echo "Actual:   $FIRST_EXIT"
  exit 1
fi
echo "[PASS] stop hook first unanchored turn stays passive"

if [[ "$THRESHOLD_EXIT" -ne 2 ]]; then
  echo "[FAIL] stop hook threshold unanchored turn forces re-anchor"
  echo "Expected: 2"
  echo "Actual:   $THRESHOLD_EXIT"
  exit 1
fi
echo "[PASS] stop hook threshold unanchored turn forces re-anchor"

assert_contains "$TEST_HOME/stop-threshold.out" 'go_beast_state' "stop hook emits re-anchor state on drift"

printf '%s' '{"session_id":"sess-1","cwd":"/tmp/project","stop_hook_active":false,"last_assistant_message":"Re-anchor: active beast go-lark, required artifact .go-beast/APPROACH.md, implementation unlocked is false."}' \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" \
  > "$TEST_HOME/stop-anchored.out" 2>&1

assert_contains "$STATE_FILE" '"active_beast": "go-lark"' "stop hook refreshes active beast from anchored reply"
assert_contains "$STATE_FILE" '"required_artifact": ".go-beast/APPROACH.md"' "stop hook refreshes required artifact from anchored reply"
assert_contains "$STATE_FILE" '"unanchored_stop_count": 0' "stop hook resets drift counter after anchored reply"

printf '%s' '{"session_id":"sess-1","cwd":"/tmp/project","stop_hook_active":false,"last_assistant_message":"Re-anchor: active beast go-lark, required artifact .go-beast/APPROACH.md, implementation unlocked is true. Task state: complete."}' \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" \
  > "$TEST_HOME/stop-complete.out" 2>&1

assert_contains "$STATE_FILE" '"task_state": "complete"' "stop hook marks anchored completed task as complete"

set +e
printf '%s' "$STOP_INPUT" | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" > "$TEST_HOME/stop-after-complete.out" 2>&1
AFTER_COMPLETE_EXIT=$?
set -e

if [[ "$AFTER_COMPLETE_EXIT" -ne 0 ]]; then
  echo "[FAIL] stop hook does not re-anchor completed task"
  echo "Expected: 0"
  echo "Actual:   $AFTER_COMPLETE_EXIT"
  exit 1
fi
echo "[PASS] stop hook does not re-anchor completed task"

printf '%s' '{"session_id":"sess-1","cwd":"/tmp/project","prompt":"using go-wren to change the hook"}' \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-user-prompt-context.sh" \
  > "$TEST_HOME/prompt-new-task-output.json"

assert_contains "$STATE_FILE" '"task_state": "active"' "user-prompt hook reopens task state when prompt names a beast"
assert_contains "$STATE_FILE" '"active_beast": "go-wren"' "user-prompt hook records the new active beast"
assert_contains "$TEST_HOME/prompt-new-task-output.json" 'go-wren' "user-prompt hook emits new active beast context"

echo "STATUS: PASSED"
