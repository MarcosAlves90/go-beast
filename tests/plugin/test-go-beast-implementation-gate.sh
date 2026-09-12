#!/usr/bin/env bash

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO_ROOT/hooks/go-beast-implementation-gate.sh"
TEST_HOME="$(mktemp -d)"
STATE_DIR="$TEST_HOME/.go-beast"
STATE_FILE="$STATE_DIR/anti-drift/runtime-gate-test.json"

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
  mkdir -p "$STATE_DIR/anti-drift"
  touch "$STATE_DIR/bootstrap.enabled"
  cat > "$STATE_FILE" <<EOF
{"version":1,"session_id":"runtime-gate-test","cwd":"$REPO_ROOT","harness":"codex","mode":"bootstrap","active_beast":"go-hawk","required_artifact":".go-beast/REQUIREMENTS.md","implementation_unlocked":$implementation_unlocked,"task_state":"$task_state","task_id":"runtime-gate-test","unanchored_stop_count":0,"last_reanchor_reason":"","updated_at":"2026-09-11T00:00:00Z"}
EOF
}

run_gate() {
  local harness="$1"
  local file_path="$2"
  local input
  input=$(jq -nc --arg file_path "$file_path" --arg cwd "$REPO_ROOT" '{tool_name:"Edit",tool_input:{file_path:$file_path,new_string:"implementation"},session_id:"runtime-gate-test",cwd:$cwd}')
  printf '%s' "$input" | HOME="$TEST_HOME" GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="$harness" bash "$GATE" 2>&1
}

run_bash_gate() {
  local harness="$1"
  local command="$2"
  local input
  input=$(jq -nc --arg command "$command" --arg cwd "$REPO_ROOT" '{tool_name:"Bash",tool_input:{command:$command},session_id:"runtime-gate-test",cwd:$cwd}')
  printf '%s' "$input" | HOME="$TEST_HOME" GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="$harness" bash "$GATE" 2>&1
}

[[ -f "$GATE" ]] || {
  echo "RUNTIME-GATE-RED: implementation gate is not registered yet"
  exit 1
}

write_state false active
output=$(run_gate codex "$REPO_ROOT/src/new-file.mjs")
status=$?
[[ "$status" -eq 2 ]] || fail "locked bootstrap blocks implementation edits"
grep -q 'REQUIREMENTS.md' <<<"$output" || fail "blocked output names the required artifact"
pass "locked bootstrap blocks implementation edits"

before_hash=$(shasum -a 256 "$STATE_FILE" | awk '{print $1}')
output=$(run_gate codex "$REPO_ROOT/src/new-file.mjs")
status=$?
after_hash=$(shasum -a 256 "$STATE_FILE" | awk '{print $1}')
[[ "$status" -eq 2 && "$before_hash" == "$after_hash" ]] || fail "blocking is side-effect free"
pass "blocking is side-effect free"

output=$(run_gate codex "$REPO_ROOT/.go-beast/REQUIREMENTS.md")
[[ "$?" -eq 0 ]] || fail "required discovery artifact remains writable"
pass "required discovery artifact remains writable"

write_state true active
output=$(run_gate codex "$REPO_ROOT/src/new-file.mjs")
[[ "$?" -eq 0 ]] || fail "unlocked implementation passes"
pass "unlocked implementation passes"

write_state false complete
output=$(run_gate codex "$REPO_ROOT/src/new-file.mjs")
[[ "$?" -eq 0 ]] || fail "completed task passes"
pass "completed task passes"

write_state false active
rm -f "$STATE_DIR/bootstrap.enabled"
output=$(run_gate codex "$REPO_ROOT/src/new-file.mjs")
[[ "$?" -eq 0 ]] || fail "non-bootstrap mode passes"
pass "non-bootstrap mode passes"

write_state false active
output=$(run_gate codex "$REPO_ROOT/src/new-file.mjs")
[[ "$?" -eq 2 ]] || fail "codex blocks with exit code 2"
output=$(run_gate copilot "$REPO_ROOT/src/new-file.mjs")
[[ "$?" -eq 2 ]] || fail "copilot blocks with exit code 2"
grep -q '"decision":"block"' <<<"$output" || fail "copilot receives a structured block decision"
pass "harness-specific blocking output is stable"

write_state false active
rm -f "$STATE_FILE"
output=$(run_gate codex "$REPO_ROOT/src/new-file.mjs")
[[ "$?" -eq 2 ]] || fail "missing bootstrap state fails closed"
grep -q 'missing or invalid' <<<"$output" || fail "missing state explains the block"
pass "missing bootstrap state fails closed"

write_state false active
output=$(run_bash_gate codex 'git apply /tmp/change.patch')
[[ "$?" -eq 2 ]] || fail "locked bootstrap blocks mutating Bash commands"
grep -q 'Bash' <<<"$output" || fail "Bash block names the tool"
pass "locked bootstrap blocks mutating Bash commands"

output=$(run_bash_gate codex 'git status --short')
[[ "$?" -eq 0 ]] || fail "read-only Bash inspection passes"
pass "read-only Bash inspection passes"

output=$(run_bash_gate codex 'git add .go-beast/REQUIREMENTS.md')
[[ "$?" -eq 2 ]] || fail "Git staging remains blocked before unlock"
pass "Git staging remains blocked before unlock"

output=$(run_bash_gate codex "printf 'requirements' > '$REPO_ROOT/.go-beast/REQUIREMENTS.md'")
[[ "$?" -eq 0 ]] || fail "exact required artifact write passes"
pass "exact required artifact write passes"

write_state true active
output=$(run_bash_gate codex 'git apply /tmp/change.patch')
[[ "$?" -eq 0 ]] || fail "unlocked Bash mutation passes"
pass "unlocked Bash mutation passes"

echo "Runtime gate tests passed"
