#!/usr/bin/env bash
# Lembra de atualizar a documentação após Claude finalizar modificações de código.
# Event: Stop — observador puro, nunca bloqueia.

set -uo pipefail

FLAG_FILE="$HOME/.claude/.docs-update-pending"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false')

# Não re-disparar quando o próprio hook já ativou o Claude
[[ "$stop_hook_active" == "true" ]] && exit 0

[[ ! -f "$FLAG_FILE" ]] && exit 0

PROJECT_DIR=$(cat "$FLAG_FILE")
rm -f "$FLAG_FILE"

[[ ! -d "$PROJECT_DIR" ]] && exit 0

# Detecta se há documentação no projeto para guiar o lembrete
DOC_HINTS=""
if [[ -f "$PROJECT_DIR/README.md" ]]; then
  DOC_HINTS="${DOC_HINTS}README.md "
fi
if [[ -d "$PROJECT_DIR/docs" ]]; then
  DOC_HINTS="${DOC_HINTS}docs/ "
fi
if [[ -f "$PROJECT_DIR/CHANGELOG.md" ]]; then
  DOC_HINTS="${DOC_HINTS}CHANGELOG.md "
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  📝  Lembrete: verificar documentação                   ║"
echo "╟──────────────────────────────────────────────────────────╢"
echo "║  Arquivos de código foram modificados em:               ║"
echo "║  $(echo "$PROJECT_DIR" | sed 's|'"$HOME"'|~|')$(printf '%*s' $((44 - ${#PROJECT_DIR})) '')║"
if [[ -n "$DOC_HINTS" ]]; then
echo "║                                                          ║"
echo "║  Documentos detectados: $DOC_HINTS$(printf '%*s' $((34 - ${#DOC_HINTS})) '')║"
fi
echo "║                                                          ║"
echo "║  Considere atualizar:                                   ║"
echo "║  • README (uso, exemplos, configuração)                 ║"
echo "║  • Comentários JSDoc/docstrings nas funções alteradas   ║"
echo "║  • CHANGELOG se for uma mudança relevante               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

exit 0
