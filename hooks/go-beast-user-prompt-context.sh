#!/usr/bin/env bash
# Re-injects go-beast workflow context on each user prompt.
# Event: UserPromptSubmit

# BEGIN GENERATED: anti-drift-prompt
# <go_beast_policy>
#   <precedence>System and harness rules | Repository-local AGENTS.md | AGENTS.bootstrap.md when bootstrap mode is active | AGENTS.global.md</precedence>
#   <phases>discovery | solution exploration | validation</phases>
#   <gates>Do not fabricate requirements, validation results, or compatibility claims. | Do not implement while a required discovery artifact is missing. | Use the strongest relevant validation available before declaring completion.</gates>
# </go_beast_policy>
# END GENERATED: anti-drift-prompt

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [[ -L "$SCRIPT_PATH" ]]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
# shellcheck source=hooks/go-beast-drift-lib.sh
source "$SCRIPT_DIR/go-beast-drift-lib.sh"

input="$(cat)"
session_id="$(gb_json_get "$input" '.session_id // empty')"
cwd="$(gb_json_get "$input" '.cwd // empty')"
prompt="$(gb_json_get "$input" '.prompt // empty')"

[[ -z "$session_id" ]] && session_id="session-$(date +%s)"
[[ -z "$cwd" ]] && cwd="$(pwd)"

harness="$(gb_detect_harness "$0")"
mode="$(gb_detect_mode)"
state="$(gb_load_state_json "$session_id" "$cwd" "$harness" "$mode")"

active_beast="$(printf '%s' "$state" | jq -r '.active_beast // empty')"

prompt_beast="$(gb_extract_beast "$prompt")"
if [[ -n "$prompt_beast" ]]; then
  active_beast="$prompt_beast"
  required_artifact="$(gb_runtime_required_artifact "" "$active_beast")"
  applicability="$(gb_runtime_applicability "$active_beast")"
  task_state="active"
  state="$(printf '%s' "$state" | jq \
    --arg beast "$active_beast" \
    --arg artifact "$required_artifact" \
    --arg applicability "$applicability" \
    --arg task_id "${session_id}:$(date +%s)" \
    --arg now "$(gb_now_utc)" \
    '.active_beast = $beast
    | .applicability = $applicability
    | .required_artifact = $artifact
    | .approval_state = "pending"
    | .completion_evidence = []
    | .implementation_unlocked = false
    | .task_state = "active"
    | .task_id = $task_id
    | .unanchored_stop_count = 0
    | .reanchor_count = 0
    | .last_reanchor_reason = ""
    | .last_transition = "task-start"
    | .last_next_check = ""
    | .last_receipt = null
    | .reported_approval_state = ""
    | .reported_task_state = ""
    | .reported_implementation = ""
    | .reported_completion_evidence = []
    | .updated_at = $now')"
  gb_save_state_json "$session_id" "$state"
elif [[ -z "$active_beast" ]]; then
  # No beast in prompt and none persisted — default to go-chat so go-beast
  # is never without an active skill.
  active_beast="go-chat"
  state="$(printf '%s' "$state" | jq \
    --arg beast "$active_beast" \
    --arg applicability "conversation" \
    --arg now "$(gb_now_utc)" \
    '.active_beast = $beast
    | .applicability = $applicability
    | .updated_at = $now')"
  gb_save_state_json "$session_id" "$state"
fi

runtime_policy="$(gb_runtime_policy_json "$state" "$cwd")"
active_beast="$(printf '%s' "$runtime_policy" | jq -r '.active_beast')"
applicability="$(printf '%s' "$runtime_policy" | jq -r '.applicability')"
required_artifact="$(printf '%s' "$runtime_policy" | jq -r '.required_artifact')"
approval_state="$(printf '%s' "$runtime_policy" | jq -r '.approval_state')"
implementation_unlocked="$(printf '%s' "$runtime_policy" | jq -r '.implementation_unlocked')"
task_state="$(printf '%s' "$runtime_policy" | jq -r '.task_state')"
required_artifact_present="$(printf '%s' "$runtime_policy" | jq -r '.required_artifact_present')"
completion_count="$(printf '%s' "$runtime_policy" | jq -r '.completion_evidence | length')"
implementation_status="$(printf '%s' "$runtime_policy" | jq -r '.implementation_status')"
state_revision="$(printf '%s' "$runtime_policy" | jq -r '.state_revision')"
last_next_check="$(printf '%s' "$state" | jq -r '.last_next_check // empty' 2>/dev/null || true)"

# Build a compact XML state block with runtime facts only. The receipt protocol
# is a recovery acknowledgement, not an authorization channel.
impl_gate="$implementation_status"
artifact_line=""
bootstrap_line=""
next_check_line=""

if [[ "$task_state" == "complete" ]]; then
  impl_gate="complete"
elif [[ -n "$required_artifact" ]]; then
  if [[ "$implementation_unlocked" == "true" && "$approval_state" == "approved" ]]; then
    impl_gate="allowed"
  elif [[ "$required_artifact_present" == "true" ]]; then
    impl_gate="blocked — approval ${approval_state}"
  else
    impl_gate="blocked — ${required_artifact} missing"
  fi
fi

escaped_beast="$(gb_xml_escape "$active_beast")"
escaped_applicability="$(gb_xml_escape "$applicability")"
escaped_task_state="$(gb_xml_escape "$task_state")"
escaped_approval_state="$(gb_xml_escape "$approval_state")"
escaped_impl_gate="$(gb_xml_escape "$impl_gate")"
escaped_artifact="$(gb_xml_escape "$required_artifact")"
escaped_state_revision="$(gb_xml_escape "$state_revision")"
escaped_next_check="$(gb_xml_escape "$last_next_check")"

if [[ -n "$required_artifact" ]]; then
  artifact_line="  <required_artifact>${escaped_artifact}</required_artifact>"
fi

evidence_line="  <evidence>artifact:${required_artifact_present};completion:${completion_count}</evidence>"
revision_line="  <revision>${escaped_state_revision}</revision>"
receipt_line="  <receipt_protocol>go_beast_receipt/v1</receipt_protocol>"
if [[ -n "$last_next_check" ]]; then
  next_check_line="  <next_check source=\"receipt\">${escaped_next_check}</next_check>"
fi

if [[ "$mode" == "bootstrap" ]]; then
  bootstrap_line="  <bootstrap>active — go-mole/go-hawk/go-lark gate before implementation</bootstrap>"
fi

context="<go_beast_state version=\"2\" source=\"runtime\">
  <beast>${escaped_beast}</beast>
  <applicability>${escaped_applicability}</applicability>
  <task>${escaped_task_state}</task>
  <approval>${escaped_approval_state}</approval>
  <implementation>${escaped_impl_gate}</implementation>
  ${revision_line}
  ${receipt_line}${artifact_line:+
${artifact_line}}${evidence_line:+
${evidence_line}}${next_check_line:+
${next_check_line}}${bootstrap_line:+
${bootstrap_line}}
</go_beast_state>"

# Claude Code expects additionalContext nested inside hookSpecificOutput.
# Copilot CLI reads additionalContext at the top level of the JSON object.
# Emit the format the harness expects.
if [[ "$harness" == "copilot" ]]; then
  jq -nc --arg context "$context" '{"additionalContext": $context}'
else
  jq -nc \
    --arg context "$context" \
    '{
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: $context
      }
    }'
fi
