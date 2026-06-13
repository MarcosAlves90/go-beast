#!/usr/bin/env bash
# Bloqueia git commit quando a mensagem contém tag Co-Authored-By.
# Event: PreToolUse (Bash)

set -uo pipefail

input=$(cat)

# Extrai tool_name via jq; se jq falhar (newlines literais no JSON), grep no raw input.
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
if [[ -z "$tool_name" ]]; then
  echo "$input" | grep -q '"tool_name"[[:space:]]*:[[:space:]]*"Bash"' || exit 0
else
  [[ "$tool_name" != "Bash" ]] && exit 0
fi

# Extrai command via jq; se jq falhar, usa o raw input para os greps abaixo.
command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
raw_fallback=false
if [[ -z "$command" ]]; then
  # jq falhou ou command é vazio — verifica se o raw input tem commit + co-authored
  echo "$input" | grep -qE 'git[[:space:]]+commit' || exit 0
  raw_fallback=true
fi

if [[ "$raw_fallback" == "true" ]]; then
  # Verifica co-authored no raw input diretamente
  echo "$input" | grep -iqE 'co-authored' || exit 0
else
  # Só age em git commit
  echo "$command" | grep -qE '(^|;|&&|\|\|)[[:space:]]*git[[:space:]]+commit' || exit 0
  # Detecta Co-Authored-By na mensagem (case-insensitive, cobre variantes)
  echo "$command" | grep -iqE 'co-authored' || exit 0
fi

echo "🚫 Bloqueado: mensagem de commit contém tag 'Co-Authored-By'."
echo ""
echo "Remova todas as linhas 'Co-Authored-By: ...' da mensagem e reenvie o commit."
exit 1
