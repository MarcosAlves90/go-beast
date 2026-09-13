#!/usr/bin/env bash
# Forces a re-anchor when bootstrap sessions drift away from go-beast state framing.
# Event: Stop

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

input="$(cat 2>/dev/null || true)"
stop_hook_active="$(gb_json_get "$input" '.stop_hook_active // false')"
[[ "$stop_hook_active" == "true" ]] && exit 0

session_id="$(gb_json_get "$input" '.session_id // empty')"
cwd="$(gb_json_get "$input" '.cwd // empty')"
last_message="$(gb_json_get "$input" '.last_assistant_message // empty')"

[[ -z "$session_id" ]] && session_id="session-$(date +%s)"
[[ -z "$cwd" ]] && cwd="$(pwd)"

harness="$(gb_detect_harness "$0")"
mode="$(gb_detect_mode)"
state="$(gb_load_state_json "$session_id" "$cwd" "$harness" "$mode")"

if [[ "$mode" != "bootstrap" ]]; then
  exit 0
fi

active_beast="$(printf '%s' "$state" | jq -r '.active_beast // empty')"
[[ -z "$active_beast" ]] && active_beast="go-chat"
required_artifact="$(printf '%s' "$state" | jq -r '.required_artifact // empty')"
task_state="$(printf '%s' "$state" | jq -r '.task_state // "active"')"
unanchored_stop_count="$(printf '%s' "$state" | jq -r '.unanchored_stop_count // 0')"
reanchor_count="$(printf '%s' "$state" | jq -r '.reanchor_count // 0')"
state_file="$(gb_state_file "$session_id")"

if [[ ! -f "$state_file" ]] || ! gb_state_is_valid_for_context "$state" "$session_id" "$cwd" "$mode"; then
  # Do not replace a corrupt or foreign state file from a Stop event. The
  # implementation gate remains responsible for failing closed on mutation.
  exit 0
fi

if [[ "$task_state" == "complete" || "$task_state" == "idle" ]]; then
  exit 0
fi

receipt="$(gb_receipt_json "$last_message" 2>/dev/null || true)"
if [[ -n "$receipt" ]] && gb_receipt_matches_runtime "$state" "$cwd" "$receipt"; then
  state="$(printf '%s' "$state" | jq \
    --argjson receipt "$receipt" \
    --arg now "$(gb_now_utc)" \
    '.reported_approval_state = $receipt.approval_state
    | .reported_task_state = $receipt.task_state
    | .reported_implementation = $receipt.implementation_status
    | .reported_completion_evidence = (
        ((.reported_completion_evidence // []) + [$receipt.evidence]
          | map(select(type == "string" and length > 0)) | unique)
      )
    | .last_receipt = $receipt
    | .last_next_check = $receipt.next_check
    | .unanchored_stop_count = 0
    | .reanchor_count = 0
    | .last_reanchor_reason = ""
    | .last_transition = "receipt-observed"
    | .updated_at = $now')"
  gb_save_state_json "$session_id" "$state"
  exit 0
fi

# If last_message is absent the harness did not provide it — treat as neutral,
# not as drift. Incrementing here caused false positives on every turn in
# harnesses that do not expose last_assistant_message (e.g. Codex, Copilot).
if [[ -z "$last_message" ]]; then
  exit 0
fi

drift_reason="missing-state-receipt"
[[ -n "$receipt" ]] && drift_reason="invalid-state-receipt"
unanchored_stop_count=$((unanchored_stop_count + 1))
state="$(printf '%s' "$state" | jq \
  --arg now "$(gb_now_utc)" \
  --arg reason "$drift_reason" \
  --argjson count "$unanchored_stop_count" \
  '.unanchored_stop_count = $count
  | .last_reanchor_reason = $reason
  | .last_transition = "drift-observed"
  | .updated_at = $now')"
gb_save_state_json "$session_id" "$state"

# Re-anchor after a small configurable fallback threshold. Event-specific
# signals can be added later without changing the receipt or gate contract.
threshold="$(gb_reanchor_threshold)"
if (( unanchored_stop_count < threshold )); then
  exit 0
fi

max_interventions="$(gb_reanchor_max_interventions)"
if (( reanchor_count >= max_interventions )); then
  state="$(printf '%s' "$state" | jq \
    --arg now "$(gb_now_utc)" \
    '.last_reanchor_reason = "reanchor-limit"
    | .last_transition = "reanchor-suppressed"
    | .updated_at = $now')"
  gb_save_state_json "$session_id" "$state"
  exit 0
fi

reanchor_count=$((reanchor_count + 1))
state="$(printf '%s' "$state" | jq \
  --arg now "$(gb_now_utc)" \
  --argjson count "$reanchor_count" \
  '.reanchor_count = $count
  | .last_transition = "reanchor-emitted"
  | .updated_at = $now')"
gb_save_state_json "$session_id" "$state"

# The recovery block is a compact runtime receipt request. It carries facts
# from the local state file and never grants authorization through model text.
runtime_policy="$(gb_runtime_policy_json "$state" "$cwd")"
active_beast="$(printf '%s' "$runtime_policy" | jq -r '.active_beast')"
applicability="$(printf '%s' "$runtime_policy" | jq -r '.applicability')"
required_artifact="$(printf '%s' "$runtime_policy" | jq -r '.required_artifact')"
approval_state="$(printf '%s' "$runtime_policy" | jq -r '.approval_state')"
implementation_status="$(printf '%s' "$runtime_policy" | jq -r '.implementation_status')"
completion_count="$(printf '%s' "$runtime_policy" | jq -r '.completion_evidence | length')"
required_artifact_present="$(printf '%s' "$runtime_policy" | jq -r '.required_artifact_present')"
state_revision="$(printf '%s' "$runtime_policy" | jq -r '.state_revision')"
artifact_value="$required_artifact"
[[ -z "$artifact_value" ]] && artifact_value="none"
artifact_status="missing"
[[ "$required_artifact_present" == "true" ]] && artifact_status="present"

msg="go-beast re-anchor required: ${drift_reason}.

<go_beast_reanchor version=\"1\" source=\"runtime\">
  <reason>$(gb_xml_escape "$drift_reason")</reason>
  <runtime_state>
    <revision>$(gb_xml_escape "$state_revision")</revision>
    <beast>$(gb_xml_escape "$active_beast")</beast>
    <applicability>$(gb_xml_escape "$applicability")</applicability>
    <artifact>$(gb_xml_escape "$artifact_value")</artifact>
    <artifact_status>${artifact_status}</artifact_status>
    <task>$(gb_xml_escape "$task_state")</task>
    <approval>$(gb_xml_escape "$approval_state")</approval>
    <implementation>$(gb_xml_escape "$implementation_status")</implementation>
    <evidence>artifact:${artifact_status};completion:${completion_count}</evidence>
  </runtime_state>
  <next_check>Check the runtime state and return exactly one go_beast_receipt version 1; do not claim authorization from prose.</next_check>
</go_beast_reanchor>"

# Emit in the format the harness expects.
# Claude Code: plain text on stdout + exit 2 re-triggers the agent.
# Copilot: requires {"decision":"block","reason":"..."} JSON on stdout; ignores exit codes.
# Codex: plain text on stdout + exit 2 re-triggers the agent (same as Claude Code).
if [[ "$harness" == "copilot" ]]; then
  jq -nc --arg reason "$msg" '{decision:"block",reason:$reason}'
else
  echo "$msg"
  echo "$msg" >&2
  exit 2
fi
