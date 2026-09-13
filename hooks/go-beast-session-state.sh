#!/usr/bin/env bash
# Initializes shared go-beast anti-drift session state.
# Event: SessionStart

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
session_id="$(gb_json_get "$input" '.session_id // empty')"
cwd="$(gb_json_get "$input" '.cwd // empty')"

[[ -z "$session_id" ]] && session_id="session-$(date +%s)"
[[ -z "$cwd" ]] && cwd="$(pwd)"

harness="$(gb_detect_harness "$0")"
mode="$(gb_detect_mode)"
state_file="$(gb_state_file "$session_id")"
if [[ -f "$state_file" ]]; then
  existing_state="$(cat "$state_file" 2>/dev/null || true)"
  if gb_state_is_valid_for_context "$existing_state" "$session_id" "$cwd" "$mode"; then
    state="$(printf '%s' "$existing_state" | jq \
      --arg harness "$harness" \
      --arg mode "$mode" \
      --arg cwd "$cwd" \
      '.harness = $harness
      | .mode = $mode
      | .cwd = $cwd
      | .last_transition = "session-resume"')"
  else
    state="$(gb_default_state_json "$session_id" "$cwd" "$harness" "$mode")"
  fi
else
  state="$(gb_default_state_json "$session_id" "$cwd" "$harness" "$mode")"
fi

gb_save_state_json "$session_id" "$state"

exit 0
