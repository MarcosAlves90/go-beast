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

if [[ "$task_state" == "complete" || "$task_state" == "idle" ]]; then
  exit 0
fi

if gb_message_is_anchored "$last_message"; then
  detected_beast="$(gb_extract_beast "$last_message")"
  detected_artifact="$(gb_extract_artifact "$last_message")"
  detected_task_state="$(gb_extract_task_state "$last_message")"
  detected_approval_state="$(gb_extract_approval_state "$last_message")"
  detected_completion_evidence="$(gb_extract_completion_evidence "$last_message")"
  [[ -n "$detected_beast" ]] && active_beast="$detected_beast"
  [[ -n "$detected_artifact" ]] && required_artifact="$detected_artifact"
  [[ -z "$required_artifact" ]] && required_artifact="$(gb_runtime_required_artifact "" "$active_beast")"
  [[ -n "$detected_task_state" ]] && task_state="$detected_task_state"

  state="$(printf '%s' "$state" | jq \
    --arg beast "$active_beast" \
    --arg artifact "$required_artifact" \
    --arg task_state "$task_state" \
    --arg applicability "$(gb_runtime_applicability "$active_beast")" \
    --arg approval_state "$detected_approval_state" \
    --arg completion_evidence "$detected_completion_evidence" \
    --arg now "$(gb_now_utc)" \
    '.active_beast = $beast
    | .applicability = $applicability
    | .required_artifact = $artifact
    | .task_state = $task_state
    | .approval_state = (if $approval_state != "" then $approval_state else (.approval_state // "pending") end)
    | .completion_evidence = (
        if $completion_evidence != ""
        then ((.completion_evidence // []) + [$completion_evidence] | map(select(type == "string" and length > 0)) | unique)
        else ((.completion_evidence // []) | if type == "array" then . else [] end)
        end
      )
    | .unanchored_stop_count = 0
    | .last_reanchor_reason = ""
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

unanchored_stop_count=$((unanchored_stop_count + 1))
state="$(printf '%s' "$state" | jq \
  --arg now "$(gb_now_utc)" \
  --arg reason "missing-state-frame" \
  --argjson count "$unanchored_stop_count" \
  '.unanchored_stop_count = $count
  | .last_reanchor_reason = $reason
  | .updated_at = $now')"
gb_save_state_json "$session_id" "$state"

# Threshold raised from 2 to 5: a single prose response is not drift.
# Re-anchor only after 5 consecutive unanchored stops with a real last_message.
if (( unanchored_stop_count < 5 )); then
  exit 0
fi

# Re-anchor block: factual XML state declaration, not an imperative.
# Research basis: asserting current state as fact forces the model to reconcile
# its next output against stated reality. Asking for compliance invites
# "yes I will" sycophancy without behavioral change. (Anthropic hooks docs;
# Constitutional AI study on intrinsic self-correction limits.)
runtime_policy="$(gb_runtime_policy_json "$state" "$cwd")"
active_beast="$(printf '%s' "$runtime_policy" | jq -r '.active_beast')"
applicability="$(printf '%s' "$runtime_policy" | jq -r '.applicability')"
required_artifact="$(printf '%s' "$runtime_policy" | jq -r '.required_artifact')"
approval_state="$(printf '%s' "$runtime_policy" | jq -r '.approval_state')"
completion_count="$(printf '%s' "$runtime_policy" | jq -r '.completion_evidence | length')"
required_artifact_present="$(printf '%s' "$runtime_policy" | jq -r '.required_artifact_present')"
artifact_el=""
if [[ -n "$required_artifact" ]]; then
  if [[ "$required_artifact_present" == "true" ]]; then
    artifact_el="
  <required_artifact>${required_artifact} present</required_artifact>
  <implementation>blocked — approval ${approval_state}</implementation>
  <evidence>artifact:present;completion:${completion_count}</evidence>"
  else
    artifact_el="
  <required_artifact>${required_artifact}</required_artifact>
  <implementation>blocked — ${required_artifact} missing</implementation>
  <evidence>artifact:missing;completion:${completion_count}</evidence>"
  fi
fi

msg="go-beast drift detected — workflow frame absent from last response.

<go_beast_state>
  <beast>${active_beast}</beast>
  <applicability>${applicability}</applicability>
  <approval>${approval_state}</approval>
  <task>${task_state}</task>${artifact_el}
  <drift>state frame missing — next response must open with beast, artifact, and implementation gate</drift>
</go_beast_state>"

# Emit in the format the harness expects.
# Claude Code: plain text on stdout + exit 2 re-triggers the agent.
# Copilot: requires {"decision":"block","reason":"..."} JSON on stdout; ignores exit codes.
# Codex: plain text on stdout + exit 2 re-triggers the agent (same as Claude Code).
if [[ "$harness" == "copilot" ]]; then
  printf '{"decision":"block","reason":"%s"}\n' \
    "$(printf '%s' "$msg" | tr '\n' ' ' | sed 's/"/\\"/g')"
else
  echo "$msg"
  echo "$msg" >&2
  exit 2
fi
