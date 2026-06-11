#!/usr/bin/env bash
# Marca projeto para verificação quando Claude modifica arquivos de código-fonte.
# Event: PostToolUse (Edit, Write, MultiEdit)

set -uo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

file_path=""
case "$tool_name" in
  Edit|Write|MultiEdit)
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    ;;
  *)
    exit 0
    ;;
esac

[[ -z "$file_path" ]] && exit 0

if echo "$file_path" | grep -qE '\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|swift|c|cpp|h|hpp)$'; then
  printf '%s' "$(pwd)" > "$HOME/.claude/.code-verify-pending"
fi

exit 0
