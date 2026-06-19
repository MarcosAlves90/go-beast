#!/usr/bin/env bash
# Blocks git commit when the message contains a Co-Authored-By tag.
# Event: PreToolUse (Bash)

set -uo pipefail

input=$(cat)

strip_matching_quotes() {
  local value="$1"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "$value"
}

extract_command_from_raw_input() {
  local raw_input="$1"
  printf '%s' "$raw_input" | perl -0ne '
    if (/"tool_input"\s*:\s*\{.*?"command"\s*:\s*"((?:[^"\\]|\\.)*)"/s) {
      print $1;
    }
  '
}

extract_commit_message_file() {
  local cmd="$1"
  local file_arg=""

  if [[ "$cmd" =~ (^|[[:space:]])-F[[:space:]]+((\"[^\"]+\")|(\'[^\']+\')|([^[:space:];\|\&]+)) ]]; then
    file_arg="${BASH_REMATCH[2]}"
  elif [[ "$cmd" =~ (^|[[:space:]])--file[[:space:]]+((\"[^\"]+\")|(\'[^\']+\')|([^[:space:];\|\&]+)) ]]; then
    file_arg="${BASH_REMATCH[2]}"
  elif [[ "$cmd" =~ (^|[[:space:]])--file=(([^\ ;\|\&]+)|(\"[^\"]+\")|(\'[^\']+\')) ]]; then
    file_arg="${BASH_REMATCH[2]}"
  fi

  strip_matching_quotes "$file_arg"
}

# Extract tool_name via jq; if jq fails (literal newlines in JSON), grep the raw input.
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
if [[ -z "$tool_name" ]]; then
  echo "$input" | grep -q '"tool_name"[[:space:]]*:[[:space:]]*"Bash"' || exit 0
else
  [[ "$tool_name" != "Bash" ]] && exit 0
fi

# Extract command via jq; if jq fails, extract the command from the raw input.
command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
if [[ -z "$command" ]]; then
  command=$(extract_command_from_raw_input "$input")
fi

[[ -z "$command" ]] && exit 0

# Only act on git commit (handles flags between git and commit, e.g. git -C /path commit)
echo "$command" | grep -qE '(^|;|&&|\|\|)[[:space:]]*git([[:space:]]+[^|&;]+)?[[:space:]]+commit' || exit 0
message_file=$(extract_commit_message_file "$command")
if [[ -n "$message_file" && -f "$message_file" ]]; then
  grep -iqE 'co-authored' "$message_file" && {
    echo "🚫 Blocked: commit message contains a 'Co-Authored-By' tag."
    echo ""
    echo "Remove all 'Co-Authored-By: ...' lines from the message and resend the commit."
    exit 1
  }
fi

# Detect Co-Authored-By in the message (case-insensitive, covers variants)
echo "$command" | grep -iqE 'co-authored' || exit 0

echo "🚫 Blocked: commit message contains a 'Co-Authored-By' tag."
echo ""
echo "Remove all 'Co-Authored-By: ...' lines from the message and resend the commit."
exit 1
