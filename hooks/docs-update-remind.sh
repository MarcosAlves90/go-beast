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

# Constrói a mensagem (stdout → Claude como system-reminder; stderr → terminal para o usuário)
MSG=""
MSG+=$'\n'
MSG+="╔══════════════════════════════════════════════════════════╗"$'\n'
MSG+="║  📝  Lembrete: verificar documentação                   ║"$'\n'
MSG+="╟──────────────────────────────────────────────────────────╢"$'\n'
MSG+="║  Arquivos de código foram modificados em:               ║"$'\n'
SHORT_DIR=$(echo "$PROJECT_DIR" | sed "s|$HOME|~|")
MSG+="║  ${SHORT_DIR}$(printf '%*s' $((44 - ${#SHORT_DIR})) '')║"$'\n'
if [[ -n "$DOC_HINTS" ]]; then
  MSG+="║                                                          ║"$'\n'
  MSG+="║  Documentos detectados: ${DOC_HINTS}$(printf '%*s' $((34 - ${#DOC_HINTS})) '')║"$'\n'
fi
MSG+="║                                                          ║"$'\n'
MSG+="║  Atualize antes de encerrar:                            ║"$'\n'
MSG+="║  • README (uso, exemplos, configuração)                 ║"$'\n'
MSG+="║  • Comentários JSDoc/docstrings nas funções alteradas   ║"$'\n'
MSG+="║  • CHANGELOG se for uma mudança relevante               ║"$'\n'
if [[ "$HAS_VERSIONING" == "true" ]]; then
  MSG+="║  • Versão em PACKAGE.md/package.json e README           ║"$'\n'
fi
MSG+="╚══════════════════════════════════════════════════════════╝"$'\n'

# stdout → Claude (system-reminder via exit 2)
echo "$MSG"
# stderr → terminal (visível ao usuário)
echo "$MSG" >&2

# exit 2 re-dispara o Claude com o stdout como feedback obrigatório.
exit 2
