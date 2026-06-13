#!/usr/bin/env bash
# Força atualização de documentação e versionamento após modificações de código.
# Event: Stop — exit 2 re-dispara o Claude com o lembrete como feedback obrigatório.

set -uo pipefail

FLAG_FILE="$HOME/.claude/.docs-update-pending"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# Não re-disparar quando o próprio hook já ativou o Claude
[[ "$stop_hook_active" == "true" ]] && exit 0

[[ ! -f "$FLAG_FILE" ]] && exit 0

PROJECT_DIR=$(cat "$FLAG_FILE")
rm -f "$FLAG_FILE"

[[ ! -d "$PROJECT_DIR" ]] && exit 0

# Detecta se há documentação e versionamento no projeto para guiar o lembrete
DOC_HINTS=""
HAS_VERSIONING=false

if [[ -f "$PROJECT_DIR/README.md" ]]; then
  DOC_HINTS="${DOC_HINTS}README.md "
fi
if [[ -d "$PROJECT_DIR/docs" ]]; then
  DOC_HINTS="${DOC_HINTS}docs/ "
fi
if [[ -f "$PROJECT_DIR/CHANGELOG.md" ]]; then
  DOC_HINTS="${DOC_HINTS}CHANGELOG.md "
fi

# Detecta arquivos de versionamento
for vfile in PACKAGE.md package.json pyproject.toml Cargo.toml go.mod; do
  if [[ -f "$PROJECT_DIR/$vfile" ]]; then
    HAS_VERSIONING=true
    break
  fi
done

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
if [[ "$HAS_VERSIONING" == "true" ]]; then
echo "║  • Versão em PACKAGE.md/package.json e README           ║"
fi
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# exit 2 re-dispara o Claude com este output como feedback obrigatório.
# O Claude deve atualizar os docs/versão antes de encerrar a sessão.
exit 2
