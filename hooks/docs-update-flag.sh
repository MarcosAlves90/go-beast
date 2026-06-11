#!/usr/bin/env bash
# Marca projeto para lembrete de docs quando Claude modifica arquivos de código-fonte.
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

# Ignora arquivos de documentação — não lembrar sobre docs ao editar docs
if echo "$file_path" | grep -qE '\.(md|rst|txt|adoc)$|README|CHANGELOG|CONTRIBUTING|/docs/'; then
  exit 0
fi

# Marca apenas arquivos de código-fonte
if echo "$file_path" | grep -qE '\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|swift|c|cpp|h|hpp)$'; then
  printf '%s' "$(pwd)" > "$HOME/.claude/.docs-update-pending"
fi

exit 0
