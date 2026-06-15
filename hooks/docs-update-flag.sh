#!/usr/bin/env bash
# Flags the project for a docs reminder when Claude modifies source code files.
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

# Ignore documentation files — do not remind about docs when editing docs
if echo "$file_path" | grep -qE '\.(md|rst|txt|adoc)$|README|CHANGELOG|CONTRIBUTING|/docs/'; then
  exit 0
fi

# Flag only source code files
if echo "$file_path" | grep -qE '\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|swift|c|cpp|h|hpp)$'; then
  printf '%s' "$(dirname "$file_path")" > "$HOME/.claude/.docs-update-pending"
fi

exit 0
