#!/usr/bin/env bash
# Blocks implementation edits and mutating shell commands until the active
# bootstrap artifact is complete.
# Event: PreToolUse (Edit, Write, MultiEdit, Bash)

set -uo pipefail

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
tool_name="$(gb_json_get "$input" '.tool_name // empty')"

case "$tool_name" in
  Edit|Write|MultiEdit|Bash) ;;
  *) exit 0 ;;
esac

session_id="$(gb_json_get "$input" '.session_id // empty')"
cwd="$(gb_json_get "$input" '.cwd // empty')"
target_file="$(gb_json_get "$input" '.tool_input.file_path // empty')"
command="$(gb_json_get "$input" '.tool_input.command // empty')"

if [[ "$tool_name" == "Bash" ]]; then
  target_file="$command"
fi

[[ -z "$session_id" ]] && session_id="default"
[[ -z "$cwd" ]] && cwd="$(pwd)"
# A mutation without a concrete target is outside this editor gate's contract.
[[ -z "$target_file" ]] && exit 0

harness="$(gb_detect_harness "$0")"
mode="$(gb_detect_mode)"
state="$(gb_load_state_json "$session_id" "$cwd" "$harness" "$mode")"

[[ "$mode" != "bootstrap" ]] && exit 0

block_reason() {
  local reason="$1"
  if [[ "$harness" == "copilot" ]]; then
    jq -nc --arg reason "$reason" '{decision:"block",reason:$reason}'
  else
    printf '%s\n' "$reason"
  fi
  exit 2
}

state_file="$(gb_state_file "$session_id")"
if [[ ! -f "$state_file" ]]; then
  block_reason "go-beast implementation gate: blocked $tool_name for $target_file; bootstrap session state is missing or invalid"
fi

if ! gb_state_is_valid_for_context "$state" "$session_id" "$cwd" "$mode"; then
  block_reason "go-beast implementation gate: blocked $tool_name for $target_file; bootstrap session state is missing or invalid"
fi

runtime_policy="$(gb_runtime_policy_json "$state" "$cwd")"
active_beast="$(printf '%s' "$runtime_policy" | jq -r '.active_beast')"
required_artifact="$(printf '%s' "$runtime_policy" | jq -r '.required_artifact')"
implementation_unlocked="$(printf '%s' "$runtime_policy" | jq -r '.implementation_unlocked')"
approval_state="$(printf '%s' "$runtime_policy" | jq -r '.approval_state')"
task_state="$(printf '%s' "$runtime_policy" | jq -r '.task_state')"
implementation_status="$(printf '%s' "$runtime_policy" | jq -r '.implementation_status')"

[[ "$implementation_status" == "allowed" || "$implementation_status" == "complete" ]] && exit 0

normalize_relative_path() {
  local value="$1"
  value="${value#./}"
  if [[ "$value" == "$cwd/"* ]]; then
    value="${value#"$cwd"/}"
  fi
  printf '%s\n' "${value#./}"
}

command_has_shell_control_operator() {
  local value="$1"
  case "$value" in
    *';'*|*'&&'*|*'||'*|*'|'*|*'`'*|*'$('*|*'<'*) return 0 ;;
    *) return 1 ;;
  esac
}

runtime_command_is_read_only() {
  local value="$1"
  local trimmed="${value#"${value%%[![:space:]]*}"}"

  [[ -n "$trimmed" ]] || return 0
  command_has_shell_control_operator "$trimmed" && return 1

  case "$trimmed" in
    git\ status*|git\ diff*|git\ log*|git\ show*|git\ ls-files*|git\ rev-parse*|git\ branch\ --show-current*|git\ remote\ -v*) return 0 ;;
    rg\ *|grep\ *|find\ *|ls|ls\ *|pwd|cat|cat\ *|head\ *|tail\ *|sed\ -n\ *|jq\ *|wc\ *|sort\ *|uniq\ *|cut\ *|awk\ *|stat\ *|file\ *|readlink\ *|dirname\ *|basename\ *|date) return 0 ;;
    npm\ run\ verify|npm\ test|npm\ run\ test|node\ --check\ *|bash\ -n\ *) return 0 ;;
    *) return 1 ;;
  esac
}

runtime_command_writes_required_artifact() {
  local value="$1"
  local required_relative_path="$2"
  local required_absolute_path="$cwd/$required_relative_path"
  local candidate

  command_has_shell_control_operator "$value" && return 1
  [[ "$value" == *'>'* ]] || return 1
  [[ "$value" != *'>&'* && "$value" != *'<&'* ]] || return 1

  case "$value" in
    printf\ *|echo\ *|cat\ *) ;;
    *) return 1 ;;
  esac

  for candidate in "$required_relative_path" "$required_absolute_path"; do
    [[ "$value" == *"> $candidate" || "$value" == *"> '$candidate'" || "$value" == *"> \"$candidate\"" || "$value" == *">> $candidate" || "$value" == *">> '$candidate'" || "$value" == *">> \"$candidate\"" ]] && return 0
  done

  return 1
}

target_relative="$(normalize_relative_path "$target_file")"
required_relative="$(normalize_relative_path "$required_artifact")"

if [[ -n "$required_artifact" && "$target_relative" == "$required_relative" ]]; then
  exit 0
fi

if [[ "$tool_name" == "Bash" ]]; then
  runtime_command_is_read_only "$command" && exit 0
  runtime_command_writes_required_artifact "$command" "$required_relative" && exit 0
fi

active_beast="${active_beast:-unknown}"
required_artifact="${required_artifact:-the active discovery or solution artifact}"
reason="go-beast implementation gate: blocked $tool_name for $target_file; active beast $active_beast requires approval=$approval_state and artifact $required_artifact before implementation is unlocked"
block_reason "$reason"
