#!/usr/bin/env bash
# Blocks git commit when the message contains a Co-Authored-By tag.
# Event: PreToolUse (Bash)

set -uo pipefail

input=$(cat)

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
  # Detect Co-Authored-By in the message (case-insensitive, covers variants)
  echo "$command" | grep -iqE 'co-authored' || exit 0
fi

echo "🚫 Blocked: commit message contains a 'Co-Authored-By' tag."
echo ""
echo "Remove all 'Co-Authored-By: ...' lines from the message and resend the commit."
exit 1
