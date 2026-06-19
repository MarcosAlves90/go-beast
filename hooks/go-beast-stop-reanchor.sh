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
required_artifact="$(printf '%s' "$state" | jq -r '.required_artifact // empty')"
unanchored_stop_count="$(printf '%s' "$state" | jq -r '.unanchored_stop_count // 0')"

if gb_message_is_anchored "$last_message"; then
  detected_beast="$(gb_extract_beast "$last_message")"
  detected_artifact="$(gb_extract_artifact "$last_message")"
  [[ -n "$detected_beast" ]] && active_beast="$detected_beast"
  [[ -n "$detected_artifact" ]] && required_artifact="$detected_artifact"

  state="$(printf '%s' "$state" | jq \
    --arg beast "$active_beast" \
    --arg artifact "$required_artifact" \
    --arg now "$(gb_now_utc)" \
    '.active_beast = $beast
    | .required_artifact = $artifact
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

msg="go-beast re-anchor required: the last response did not preserve the current workflow frame. State the active beast, the required artifact, whether implementation is unlocked, and continue from the latest verified artifact before doing more work."

echo "$msg"
echo "$msg" >&2
exit 2
