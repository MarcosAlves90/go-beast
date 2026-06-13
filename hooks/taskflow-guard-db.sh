#!/usr/bin/env bash
# Bloqueia comandos Bash que contenham operações SQL destrutivas sem flag de confirmação.
# Event: PreToolUse (matcher: Bash)
# Comportamento: blocker — exit 1 com mensagem legível quando detecta padrão proibido.
#
# Padrões bloqueados:
#   - DROP TABLE / DROP DATABASE
#   - DELETE FROM sem WHERE (deleção em massa)
#   - TRUNCATE TABLE
#   - psql com -c contendo os padrões acima
#
# Para contornar: inclua o comentário "# taskflow-allow-destructive" na mesma linha do comando.

set -euo pipefail

# Lê JSON do stdin (PreToolUse sempre fornece)
input=$(cat)

tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
[[ -z "$tool_name" ]] && exit 0

# Só age em chamadas Bash
if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)

# Bypass explícito — o desenvolvedor sabe o que está fazendo
if echo "$command" | grep -q "taskflow-allow-destructive"; then
  exit 0
fi

# Normaliza para comparação case-insensitive
command_lower=$(echo "$command" | tr '[:upper:]' '[:lower:]')

# Padrão 1: DROP TABLE ou DROP DATABASE
if echo "$command_lower" | grep -qE "drop\s+(table|database)"; then
  echo "Hook bloqueou: comando contém DROP TABLE ou DROP DATABASE."
  echo "Risco: destruição irreversível de schema ou banco no TaskFlow API."
  echo "Para prosseguir, adicione '# taskflow-allow-destructive' ao comando e confirme a intenção."
  exit 1
fi

# Padrão 2: TRUNCATE TABLE
if echo "$command_lower" | grep -qE "truncate\s+table"; then
  echo "Hook bloqueou: comando contém TRUNCATE TABLE."
  echo "Risco: remoção de todos os registros sem condição no TaskFlow API."
  echo "Para prosseguir, adicione '# taskflow-allow-destructive' ao comando e confirme a intenção."
  exit 1
fi

# Padrão 3: DELETE FROM sem cláusula WHERE (deleção em massa)
# Detecta "delete from <tabela>" não seguido de "where" na mesma linha ou subsequente
if echo "$command_lower" | grep -qE "delete\s+from\s+\w+\s*;"; then
  echo "Hook bloqueou: comando contém DELETE FROM sem cláusula WHERE."
  echo "Risco: deleção de todos os registros da tabela no TaskFlow API."
  echo "Para prosseguir, adicione '# taskflow-allow-destructive' ao comando e confirme a intenção."
  exit 1
fi

exit 0
