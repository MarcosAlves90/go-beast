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

initial_revision="$(jq -r '.revision' "$STATE_FILE")"
jq '.active_beast = "go-hawk" | .required_artifact = ".go-beast/REQUIREMENTS.md" | .task_id = "resume-task"' \
  "$STATE_FILE" > "$STATE_FILE.tmp"
mv "$STATE_FILE.tmp" "$STATE_FILE"
printf '%s' "$SESSION_INPUT" | GO_BEAST_STATE_DIR="$STATE_DIR" bash "$HOOK_HOME/go-beast-session-state.sh"
if [[ "$(jq -r '.active_beast' "$STATE_FILE")" != "go-hawk" || "$(jq -r '.task_id' "$STATE_FILE")" != "resume-task" || "$(jq -r '.revision' "$STATE_FILE")" -le "$initial_revision" ]]; then
  echo "RUNTIME-RECEIPT-RED: session resume discarded valid workflow state"
  exit 1
fi
echo "[PASS] session-state preserves valid state across resume"

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

MISMATCHED_RECEIPT='<go_beast_receipt version="1">
  <beast>go-lark</beast>
  <artifact>.go-beast/APPROACH.md</artifact>
  <task>active</task>
  <approval>pending</approval>
  <implementation>blocked</implementation>
  <next_check>inspect the runtime artifact</next_check>
  <evidence>artifact:missing</evidence>
</go_beast_receipt>'
MISMATCHED_INPUT="$(jq -n --arg message "$MISMATCHED_RECEIPT" '{session_id:"sess-1",cwd:"/tmp/project",stop_hook_active:false,last_assistant_message:$message}')"
printf '%s' "$MISMATCHED_INPUT" \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" \
    bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" \
  > "$TEST_HOME/stop-mismatched-receipt.out" 2>&1 || true

if [[ "$(jq -r '.active_beast' "$STATE_FILE")" != "go-hawk" || "$(jq -r '.unanchored_stop_count' "$STATE_FILE")" -ne 1 ]]; then
  echo "RUNTIME-RECEIPT-RED: mismatched receipt changed runtime identity or drift state"
  exit 1
fi
echo "[PASS] mismatched receipt cannot change runtime identity"

jq '.unanchored_stop_count = 0 | .last_reanchor_reason = ""' "$STATE_FILE" > "$STATE_FILE.tmp"
mv "$STATE_FILE.tmp" "$STATE_FILE"

STOP_INPUT='{"session_id":"sess-1","cwd":"/tmp/project","stop_hook_active":false,"last_assistant_message":"Continuing with the task now."}'

set +e
printf '%s' "$STOP_INPUT" | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" > "$TEST_HOME/stop-first.out" 2>&1
FIRST_EXIT=$?
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
  echo "[FAIL] stop hook fallback threshold forces re-anchor"
  echo "Expected: 2"
  echo "Actual:   $THRESHOLD_EXIT"
  exit 1
fi
echo "[PASS] stop hook fallback threshold forces re-anchor"

assert_contains "$TEST_HOME/stop-threshold.out" 'go_beast_reanchor' "stop hook emits re-anchor state on drift"

MATCHING_RECEIPT='<go_beast_receipt version="1">
  <beast>go-hawk</beast>
  <artifact>.go-beast/REQUIREMENTS.md</artifact>
  <task>active</task>
  <approval>pending</approval>
  <implementation>blocked</implementation>
  <next_check>inspect the requirements artifact</next_check>
  <evidence>artifact:missing</evidence>
</go_beast_receipt>'
printf '%s' "$(jq -n --arg message "$MATCHING_RECEIPT" '{session_id:"sess-1",cwd:"/tmp/project",stop_hook_active:false,last_assistant_message:$message}')" \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" \
  > "$TEST_HOME/stop-anchored.out" 2>&1

assert_contains "$STATE_FILE" '"active_beast":"go-hawk"' "stop hook preserves active beast from runtime state"
assert_contains "$STATE_FILE" '"required_artifact":".go-beast/REQUIREMENTS.md"' "stop hook preserves required artifact from runtime state"
assert_contains "$STATE_FILE" '"unanchored_stop_count":0' "stop hook resets drift counter after anchored reply"
assert_contains "$STATE_FILE" '"reported_approval_state":"pending"' "stop hook records receipt approval as a report"

CLAIMED_COMPLETION_RECEIPT='<go_beast_receipt version="1">
  <beast>go-hawk</beast>
  <artifact>.go-beast/REQUIREMENTS.md</artifact>
  <task>complete</task>
  <approval>approved</approval>
  <implementation>allowed</implementation>
  <next_check>continue implementation</next_check>
  <evidence>npm run verify passed</evidence>
</go_beast_receipt>'
printf '%s' "$(jq -n --arg message "$CLAIMED_COMPLETION_RECEIPT" '{session_id:"sess-1",cwd:"/tmp/project",stop_hook_active:false,last_assistant_message:$message}')" \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" \
  > "$TEST_HOME/stop-complete.out" 2>&1

assert_contains "$STATE_FILE" '"task_state":"active"' "stop hook rejects model completion as runtime state"
assert_contains "$STATE_FILE" '"approval_state":"pending"' "stop hook rejects model approval as runtime state"
assert_contains "$STATE_FILE" '"implementation_unlocked":false' "stop hook cannot unlock implementation from a receipt"

set +e
printf '%s' "$STOP_INPUT" | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" > "$TEST_HOME/stop-after-claim.out" 2>&1
AFTER_COMPLETE_EXIT=$?
set -e

if [[ "$AFTER_COMPLETE_EXIT" -ne 2 ]]; then
  echo "[FAIL] stop hook continues recovery after an unverified completion claim"
  echo "Expected: 2"
  echo "Actual:   $AFTER_COMPLETE_EXIT"
  exit 1
fi
echo "[PASS] stop hook continues recovery after an unverified completion claim"

printf '%s' '{"session_id":"sess-1","cwd":"/tmp/project","prompt":"using go-wren to change the hook"}' \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" bash "$REPO_ROOT/hooks/go-beast-user-prompt-context.sh" \
  > "$TEST_HOME/prompt-new-task-output.json"

assert_contains "$STATE_FILE" '"task_state":"active"' "user-prompt hook reopens task state when prompt names a beast"
assert_contains "$STATE_FILE" '"active_beast":"go-wren"' "user-prompt hook records the new active beast"
assert_contains "$TEST_HOME/prompt-new-task-output.json" 'go-wren' "user-prompt hook emits new active beast context"

CANONICAL_FRAME='<go_beast_receipt version="1">
  <beast>go-wren</beast>
  <artifact>none</artifact>
  <task>active</task>
  <approval>pending</approval>
  <implementation>blocked</implementation>
  <next_check>inspect the specification</next_check>
  <evidence>artifact:missing</evidence>
</go_beast_receipt>'
for attempt in 1 2 3 4 5; do
  canonical_input="$(jq -n --arg message "$CANONICAL_FRAME" '{session_id:"sess-1",cwd:"/tmp/project",stop_hook_active:false,last_assistant_message:$message}')"
  set +e
  printf '%s' "$canonical_input" \
    | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" \
      bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" \
    > "$TEST_HOME/stop-canonical-$attempt.out" 2>&1
  canonical_exit=$?
  set -e
  if [[ "$canonical_exit" -ne 0 ]]; then
    echo "[FAIL] canonical state frame was rejected"
    echo "Expected: 0"
    echo "Actual:   $canonical_exit"
    jq -c . "$STATE_FILE"
    sed -n '1,80p' "$TEST_HOME/stop-canonical-$attempt.out"
    exit 1
  fi
done
assert_contains "$STATE_FILE" '"unanchored_stop_count":0' "canonical state frame resets drift counter"
echo "[PASS] canonical state frame does not trigger repeated re-anchor"

LIMIT_STATE_FILE="$STATE_DIR/anti-drift/sess-limit.json"
jq '.session_id = "sess-limit"
  | .active_beast = "go-hawk"
  | .required_artifact = ".go-beast/REQUIREMENTS.md"
  | .task_state = "active"
  | .approval_state = "pending"
  | .implementation_unlocked = false
  | .unanchored_stop_count = 1
  | .reanchor_count = 3
  | .last_transition = "drift-observed"' "$STATE_FILE" > "$LIMIT_STATE_FILE"
set +e
printf '%s' '{"session_id":"sess-limit","cwd":"/tmp/project","stop_hook_active":false,"last_assistant_message":"Continuing with the task now."}' \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" \
    bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" \
  > "$TEST_HOME/stop-limit.out" 2>&1
LIMIT_EXIT=$?
set -e
if [[ "$LIMIT_EXIT" -ne 0 || "$(jq -r '.reanchor_count' "$LIMIT_STATE_FILE")" -ne 3 || "$(jq -r '.last_transition' "$LIMIT_STATE_FILE")" != "reanchor-suppressed" ]]; then
  echo "[FAIL] re-anchor intervention limit is not enforced"
  exit 1
fi
echo "[PASS] re-anchor intervention limit is enforced"

XML_STATE_FILE="$STATE_DIR/anti-drift/sess-xml.json"
jq '.session_id = "sess-xml"
  | .active_beast = "go-wren"
  | .required_artifact = ""
  | .last_next_check = "<injected>"' "$STATE_FILE" > "$XML_STATE_FILE"
XML_OUTPUT="$TEST_HOME/prompt-xml-output.json"
printf '%s' '{"session_id":"sess-xml","cwd":"/tmp/project","prompt":"what should happen next?"}' \
  | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" \
    bash "$REPO_ROOT/hooks/go-beast-user-prompt-context.sh" \
  > "$XML_OUTPUT"
assert_contains "$XML_OUTPUT" '&lt;injected&gt;' "user-prompt hook escapes receipt-derived XML values"
if grep -q '<injected>' "$XML_OUTPUT"; then
  echo "[FAIL] user-prompt hook emitted an unescaped XML tag"
  exit 1
fi
echo "[PASS] user-prompt hook prevents XML tag injection"

EMPTY_FRAME_CASES=(
  $'Beast: go-chat\nArtifact:\nImplementation gate: allowed'
  $'Beast: go-chat\nArtifact: CHANGELOG.md\nImplementation gate:'
)
for index in "${!EMPTY_FRAME_CASES[@]}"; do
  empty_frame_input="$(jq -n --arg session "sess-empty-$index" --arg message "${EMPTY_FRAME_CASES[$index]}" '{session_id:$session,cwd:"/tmp/project",stop_hook_active:false,last_assistant_message:$message}')"
  set +e
  printf '%s' "$empty_frame_input" \
    | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" \
      bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" \
    > "$TEST_HOME/stop-empty-$index.out" 2>&1
  empty_frame_exit=$?
  set -e
  if [[ "$empty_frame_exit" -ne 0 ]]; then
    echo "[FAIL] empty canonical field changed the first-stop exit contract"
    exit 1
  fi
done
echo "[PASS] empty canonical fields do not count as anchored"

INVALID_SEMANTIC_CASES=(
  $'Beast: go-chat\nArtifact: UNKNOWN.md\nImplementation gate: allowed'
  $'Beast: go-chat\nArtifact: CHANGELOG.md\nImplementation gate: maybe'
)
for index in "${!INVALID_SEMANTIC_CASES[@]}"; do
  semantic_input="$(jq -n --arg session "sess-semantic-$index" --arg message "${INVALID_SEMANTIC_CASES[$index]}" '{session_id:$session,cwd:"/tmp/project",stop_hook_active:false,last_assistant_message:$message}')"
  set +e
  printf '%s' "$semantic_input" \
    | GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE="codex" \
      bash "$REPO_ROOT/hooks/go-beast-stop-reanchor.sh" \
    > "$TEST_HOME/stop-semantic-$index.out" 2>&1
  semantic_exit=$?
  set -e
  if [[ "$semantic_exit" -ne 0 ]]; then
    echo "[FAIL] invalid semantic frame changed the first-stop exit contract"
    exit 1
  fi
done
echo "[PASS] invalid semantic fields do not count as anchored"

echo "STATUS: PASSED"
