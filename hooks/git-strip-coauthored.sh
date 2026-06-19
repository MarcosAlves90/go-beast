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

# Extract command via jq; if jq fails, use the raw input for the greps below.
command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
raw_fallback=false
if [[ -z "$command" ]]; then
  # jq failed or command is empty — check raw input for commit + co-authored
  echo "$input" | grep -qE 'git[[:space:]]+commit' || exit 0
  raw_fallback=true
fi

if [[ "$raw_fallback" == "true" ]]; then
  # Check co-authored directly in the raw input
  echo "$input" | grep -iqE 'co-authored' || exit 0
else
  # Only act on git commit
  echo "$command" | grep -qE '(^|;|&&|\|\|)[[:space:]]*git[[:space:]]+commit' || exit 0
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
fi

echo "🚫 Blocked: commit message contains a 'Co-Authored-By' tag."
echo ""
echo "Remove all 'Co-Authored-By: ...' lines from the message and resend the commit."
exit 1
