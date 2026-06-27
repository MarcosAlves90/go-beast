#!/usr/bin/env bash
# Re-injects go-beast workflow context on each user prompt.
# Event: UserPromptSubmit

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
required_artifact="$(printf '%s' "$state" | jq -r '.required_artifact // empty')"
implementation_unlocked="$(printf '%s' "$state" | jq -r '.implementation_unlocked // false')"
task_state="$(printf '%s' "$state" | jq -r '.task_state // "active"')"

prompt_beast="$(gb_extract_beast "$prompt")"
if [[ -n "$prompt_beast" ]]; then
  active_beast="$prompt_beast"
  task_state="active"
  state="$(printf '%s' "$state" | jq \
    --arg beast "$active_beast" \
    --arg task_id "${session_id}:$(date +%s)" \
    --arg now "$(gb_now_utc)" \
    '.active_beast = $beast
    | .task_state = "active"
    | .task_id = $task_id
    | .unanchored_stop_count = 0
    | .updated_at = $now')"
  gb_save_state_json "$session_id" "$state"
elif [[ -z "$active_beast" ]]; then
  # No beast in prompt and none persisted — default to go-chat so go-beast
  # is never without an active skill.
  active_beast="go-chat"
  state="$(printf '%s' "$state" | jq \
    --arg beast "$active_beast" \
    --arg now "$(gb_now_utc)" \
    '.active_beast = $beast
    | .updated_at = $now')"
  gb_save_state_json "$session_id" "$state"
fi

context="go-beast re-anchor: keep the current task state, active beast, required artifact, and implementation gate in working memory."
if [[ "$mode" == "bootstrap" ]]; then
  context="${context} Bootstrap mode is active: verify whether go-mole, go-hawk, or go-lark is required before implementation."
fi
context="${context} Task state: ${task_state}."
if [[ -n "$active_beast" ]]; then
  context="${context} Active beast: ${active_beast}."
fi
if [[ -n "$required_artifact" ]]; then
  if [[ "$implementation_unlocked" == "true" ]]; then
    context="${context} Latest unlocking artifact: ${required_artifact}. Implementation may continue if no stricter gate is missing."
  else
    context="${context} Required artifact is still missing: ${required_artifact}. Keep the gate closed until it exists."
  fi
fi

jq -nc \
  --arg context "$context" \
  '{
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: $context
    }
  }'
