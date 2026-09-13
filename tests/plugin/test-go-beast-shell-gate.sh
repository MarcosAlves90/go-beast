#!/usr/bin/env bash

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO_ROOT/hooks/go-beast-implementation-gate.sh"
TEST_HOME="$(mktemp -d)"
STATE_DIR="$TEST_HOME/.go-beast"
STATE_FILE="$STATE_DIR/anti-drift/shell-gate-test.json"
PROJECT_ROOT="$TEST_HOME/project"

mkdir -p "$PROJECT_ROOT/.go-beast"
printf '%s\n' '# runtime gate fixture' > "$PROJECT_ROOT/.go-beast/REQUIREMENTS.md"

cleanup() {
  rm -rf "$TEST_HOME"
}
trap cleanup EXIT

fail() {
  echo "[FAIL] $1"
  exit 1
}

pass() {
  echo "[PASS] $1"
}

write_state() {
  local implementation_unlocked="$1"
  local task_state="$2"
  local approval_state="pending"
  [[ "$implementation_unlocked" == "true" ]] && approval_state="approved"
  mkdir -p "$STATE_DIR/anti-drift"
  touch "$STATE_DIR/bootstrap.enabled"
  printf '%s\n' "{\"version\":1,\"session_id\":\"shell-gate-test\",\"cwd\":\"$PROJECT_ROOT\",\"harness\":\"codex\",\"mode\":\"bootstrap\",\"active_beast\":\"go-hawk\",\"required_artifact\":\".go-beast/REQUIREMENTS.md\",\"implementation_unlocked\":$implementation_unlocked,\"task_state\":\"$task_state\",\"approval_state\":\"$approval_state\",\"task_id\":\"shell-gate-test\",\"unanchored_stop_count\":0,\"last_reanchor_reason\":\"\",\"updated_at\":\"2026-09-11T00:00:00Z\"}" > "$STATE_FILE"
}

run_gate() {
  local harness="$1"
  local command="$2"
  local input
  input=$(jq -nc --arg command "$command" --arg cwd "$PROJECT_ROOT" '{tool_name:"Bash",tool_input:{command:$command},session_id:"shell-gate-test",cwd:$cwd}')
  printf '%s' "$input" | HOME="$TEST_HOME" GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="$harness" bash "$GATE" 2>&1
}

[[ -f "$GATE" ]] || {
  echo "RUNTIME-SHELL-GATE-RED: shell implementation gate is not registered yet"
  exit 1
}

write_state false active
output=$(run_gate codex 'git apply /tmp/change.patch')
[[ "$?" -eq 2 ]] || fail "locked bootstrap blocks git apply"
grep -q 'Bash' <<<"$output" || fail "blocked shell output names Bash"
pass "locked bootstrap blocks git apply"

output=$(run_gate codex 'git status --short')
[[ "$?" -eq 0 ]] || fail "locked bootstrap permits git status"
pass "locked bootstrap permits git status"

output=$(run_gate codex 'git add .go-beast/REQUIREMENTS.md')
[[ "$?" -eq 2 ]] || fail "locked bootstrap blocks git add"
pass "locked bootstrap blocks git add"

output=$(run_gate codex "printf 'requirements' > '$PROJECT_ROOT/.go-beast/REQUIREMENTS.md'")
[[ "$?" -eq 0 ]] || fail "locked bootstrap permits the exact required artifact"
pass "locked bootstrap permits the exact required artifact"

write_state true active
output=$(run_gate codex 'git apply /tmp/change.patch')
[[ "$?" -eq 0 ]] || fail "unlocked bootstrap permits git apply"
pass "unlocked bootstrap permits git apply"

echo "Shell runtime gate tests passed"
