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

# Build compact XML state block — declarative facts, not imperatives.
# Research basis: XML tags produce 20-40% better Claude compliance than prose;
# factual state assertion ("phase is X") outperforms imperative correction
# ("please follow workflow") by removing the model's sycophantic exit.
# Target: under 500 chars to stay within the attention-reliable window.
impl_gate="allowed"
artifact_line=""
bootstrap_line=""

if [[ -n "$required_artifact" ]]; then
  if [[ "$implementation_unlocked" == "true" ]]; then
    impl_gate="allowed"
    artifact_line="  <unlocked_by>${required_artifact}</unlocked_by>"
  else
    impl_gate="blocked — ${required_artifact} missing"
    artifact_line="  <required_artifact>${required_artifact}</required_artifact>"
  fi
fi

if [[ "$mode" == "bootstrap" ]]; then
  bootstrap_line="  <bootstrap>active — go-mole/go-hawk/go-lark gate before implementation</bootstrap>"
fi

context="<go_beast_state>
  <beast>${active_beast}</beast>
  <task>${task_state}</task>
  <implementation>${impl_gate}</implementation>${artifact_line:+
${artifact_line}}${bootstrap_line:+
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
