#!/usr/bin/env bash
# Forces a re-anchor when bootstrap sessions drift away from go-beast state framing.
# Event: Stop

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

if [[ "$task_state" == "complete" || "$task_state" == "idle" ]]; then
  exit 0
fi

if gb_message_is_anchored "$last_message"; then
  detected_beast="$(gb_extract_beast "$last_message")"
  detected_artifact="$(gb_extract_artifact "$last_message")"
  detected_task_state="$(gb_extract_task_state "$last_message")"
  [[ -n "$detected_beast" ]] && active_beast="$detected_beast"
  [[ -n "$detected_artifact" ]] && required_artifact="$detected_artifact"
  [[ -n "$detected_task_state" ]] && task_state="$detected_task_state"

  state="$(printf '%s' "$state" | jq \
    --arg beast "$active_beast" \
    --arg artifact "$required_artifact" \
    --arg task_state "$task_state" \
    --arg now "$(gb_now_utc)" \
    '.active_beast = $beast
    | .required_artifact = $artifact
    | .task_state = $task_state
    | .unanchored_stop_count = 0
    | .last_reanchor_reason = ""
    | .updated_at = $now')"
  gb_save_state_json "$session_id" "$state"
  exit 0
fi

unanchored_stop_count=$((unanchored_stop_count + 1))
state="$(printf '%s' "$state" | jq \
  --arg now "$(gb_now_utc)" \
  --arg reason "missing-state-frame" \
  --argjson count "$unanchored_stop_count" \
  '.unanchored_stop_count = $count
  | .last_reanchor_reason = $reason
  | .updated_at = $now')"
gb_save_state_json "$session_id" "$state"

if (( unanchored_stop_count < 2 )); then
  exit 0
fi

# Re-anchor block: factual XML state declaration, not an imperative.
# Research basis: asserting current state as fact forces the model to reconcile
# its next output against stated reality. Asking for compliance invites
# "yes I will" sycophancy without behavioral change. (Anthropic hooks docs;
# Constitutional AI study on intrinsic self-correction limits.)
artifact_el=""
[[ -n "$required_artifact" ]] && artifact_el="
  <required_artifact>${required_artifact}</required_artifact>
  <implementation>blocked — ${required_artifact} missing</implementation>"

msg="go-beast drift detected — workflow frame absent from last response.

<go_beast_state>
  <beast>${active_beast}</beast>
  <task>${task_state}</task>${artifact_el}
  <drift>state frame missing — next response must open with beast, artifact, and implementation gate</drift>
</go_beast_state>"

echo "$msg"
echo "$msg" >&2
exit 2
