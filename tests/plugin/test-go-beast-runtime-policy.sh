#!/usr/bin/env bash

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$REPO_ROOT/hooks/go-beast-drift-lib.sh"
PROMPT_HOOK="$REPO_ROOT/hooks/go-beast-user-prompt-context.sh"
STOP_HOOK="$REPO_ROOT/hooks/go-beast-stop-reanchor.sh"
GATE="$REPO_ROOT/hooks/go-beast-implementation-gate.sh"
TEST_HOME="$(mktemp -d)"
STATE_DIR="$TEST_HOME/.go-beast"
STATE_FILE="$STATE_DIR/anti-drift/runtime-policy-test.json"

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

if ! grep -q '^gb_runtime_policy_json()' "$LIB"; then
  echo "RUNTIME-POLICY-RED: shared runtime policy is not centralized yet"
  exit 1
fi

source "$LIB"

initial_state='{"active_beast":"go-hawk","required_artifact":"","implementation_unlocked":false,"task_state":"active","approval_state":"pending","completion_evidence":[]}'
policy="$(gb_runtime_policy_json "$initial_state" "$TEST_HOME")"
[[ "$(jq -r '.applicability' <<<"$policy")" == "discovery" ]] || fail "go-hawk maps to discovery applicability"
[[ "$(jq -r '.required_artifact' <<<"$policy")" == ".go-beast/REQUIREMENTS.md" ]] || fail "go-hawk derives its required artifact"
[[ "$(jq -r '.approval_state' <<<"$policy")" == "pending" ]] || fail "runtime policy preserves pending approval"
[[ "$(jq -r '.required_artifact_present' <<<"$policy")" == "false" ]] || fail "missing required artifact is observable"
pass "runtime policy centralizes applicability, artifact, approval, and evidence state"

mkdir -p "$STATE_DIR/anti-drift"
touch "$STATE_DIR/bootstrap.enabled"
printf '%s\n' '{"version":1,"session_id":"runtime-policy-test","cwd":"/tmp/project","harness":"codex","mode":"bootstrap","active_beast":"go-chat","required_artifact":"","implementation_unlocked":true,"task_state":"complete","approval_state":"approved","completion_evidence":["old evidence"],"task_id":"old-task","unanchored_stop_count":0,"last_reanchor_reason":"","updated_at":"2026-09-11T00:00:00Z"}' > "$STATE_FILE"

prompt_input='{"session_id":"runtime-policy-test","cwd":"/tmp/project","prompt":"using go-hawk for discovery"}'
prompt_output="$(printf '%s' "$prompt_input" | HOME="$TEST_HOME" GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE=codex bash "$PROMPT_HOOK")"
[[ "$(jq -r '.active_beast' "$STATE_FILE")" == "go-hawk" ]] || fail "new prompt records the active beast"
[[ "$(jq -r '.task_state' "$STATE_FILE")" == "active" ]] || fail "new prompt reopens the task"
[[ "$(jq -r '.implementation_unlocked' "$STATE_FILE")" == "false" ]] || fail "new prompt clears stale implementation unlock"
[[ "$(jq -r '.approval_state' "$STATE_FILE")" == "pending" ]] || fail "new prompt clears stale approval"
[[ "$(jq -r '.completion_evidence | length' "$STATE_FILE")" -eq 0 ]] || fail "new prompt clears stale completion evidence"
[[ "$(jq -r '.required_artifact' "$STATE_FILE")" == ".go-beast/REQUIREMENTS.md" ]] || fail "new prompt derives the discovery artifact"
grep -q '<applicability>discovery</applicability>' <<<"$prompt_output" || fail "prompt context exposes applicability"
grep -q '<approval>pending</approval>' <<<"$prompt_output" || fail "prompt context exposes approval state"
pass "prompt adapter resets stale task state through the shared policy"

stop_input='<go_beast_receipt version="1">
  <beast>go-hawk</beast>
  <artifact>.go-beast/REQUIREMENTS.md</artifact>
  <task>active</task>
  <approval>pending</approval>
  <implementation>blocked</implementation>
  <next_check>inspect the requirements artifact</next_check>
  <evidence>artifact:missing</evidence>
</go_beast_receipt>'
stop_input_json="$(jq -n --arg message "$stop_input" '{session_id:"runtime-policy-test",cwd:"/tmp/project",stop_hook_active:false,last_assistant_message:$message}')"
printf '%s' "$stop_input_json" | HOME="$TEST_HOME" GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE=codex bash "$STOP_HOOK" >/dev/null 2>&1 || true
[[ "$(jq -r '.active_beast' "$STATE_FILE")" == "go-hawk" ]] || fail "stop adapter preserves runtime beast"
[[ "$(jq -r '.approval_state' "$STATE_FILE")" == "pending" ]] || fail "stop adapter preserves runtime approval"
[[ "$(jq -r '.reported_approval_state' "$STATE_FILE")" == "pending" ]] || fail "stop adapter records receipt approval report"
[[ "$(jq -r '.reported_completion_evidence | index("artifact:missing")' "$STATE_FILE")" != "null" ]] || fail "stop adapter records reported receipt evidence"
[[ "$(jq -r '.task_state' "$STATE_FILE")" == "active" ]] || fail "stop adapter preserves runtime task state"
pass "stop adapter records receipt observations without changing authorization"

printf '%s\n' '{"version":1,"session_id":"runtime-policy-test","cwd":"/tmp/project","harness":"codex","mode":"bootstrap","active_beast":"go-hawk","required_artifact":"","implementation_unlocked":false,"task_state":"active","approval_state":"pending","completion_evidence":[],"task_id":"runtime-policy-test","unanchored_stop_count":0,"last_reanchor_reason":"","updated_at":"2026-09-11T00:00:00Z"}' > "$STATE_FILE"
gate_input="$(jq -nc '{tool_name:"Edit",tool_input:{file_path:"/tmp/project/src/implementation.js",new_string:"code"},session_id:"runtime-policy-test",cwd:"/tmp/project"}')"
set +e
gate_output="$(printf '%s' "$gate_input" | HOME="$TEST_HOME" GO_BEAST_STATE_DIR="$STATE_DIR" GO_BEAST_HARNESS_OVERRIDE=codex bash "$GATE" 2>&1)"
gate_code=$?
set -e
[[ "$gate_code" -eq 2 ]] || fail "derived discovery artifact still blocks implementation"
grep -q 'REQUIREMENTS.md' <<<"$gate_output" || fail "derived required artifact appears in gate reason"
pass "implementation gate consumes the centralized runtime policy"

echo "Runtime policy tests passed"
