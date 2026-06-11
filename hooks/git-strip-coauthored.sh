#!/usr/bin/env bash
# Bloqueia git commit quando a mensagem contém tag Co-Authored-By.
# Event: PreToolUse (Bash)

set -uo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')
[[ "$tool_name" != "Bash" ]] && exit 0

command=$(echo "$input" | jq -r '.tool_input.command // empty')
[[ -z "$command" ]] && exit 0

# Só age em git commit
echo "$command" | grep -qE '(^|;|&&|\|\|)[[:space:]]*git[[:space:]]+commit' || exit 0

# Detecta Co-Authored-By na mensagem (case-insensitive, cobre variantes)
echo "$command" | grep -iqE 'co-authored' || exit 0

echo "🚫 Bloqueado: mensagem de commit contém tag 'Co-Authored-By'."
echo ""
echo "Remova todas as linhas 'Co-Authored-By: ...' da mensagem e reenvie o commit."
exit 1
