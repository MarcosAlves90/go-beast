#!/usr/bin/env bash
# Flags the project for type/test verification when a supported agent modifies source code files.
# Event: PostToolUse (Edit, Write, MultiEdit)

set -uo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
[[ -z "$tool_name" ]] && exit 0

file_path=""
case "$tool_name" in
  Edit|Write|MultiEdit)
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
    ;;
  *)
    exit 0
    ;;
esac

[[ -z "$file_path" ]] && exit 0

STATE_DIR="${GO_BEAST_STATE_DIR:-$HOME/.go-beast}"
if echo "$file_path" | grep -qE '\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|swift|c|cpp|h|hpp)$'; then
  mkdir -p "$STATE_DIR"
  printf '%s' "$(dirname "$file_path")" > "$STATE_DIR/code-verify.pending"
fi

exit 0
