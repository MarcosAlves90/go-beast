#!/usr/bin/env bash
# Verifica se funções/classes no novo código já existem no projeto.
# Avisa Claude antes de criar código potencialmente duplicado.
# Event: PreToolUse (Edit, Write, MultiEdit)

set -uo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

case "$tool_name" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

# ── Extrai conteúdo novo e arquivo alvo ────────────────────────────────────
new_content=""
target_file=""

case "$tool_name" in
  Edit)
    new_content=$(echo "$input" | jq -r '.tool_input.new_string // empty')
    target_file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    ;;
  Write)
    new_content=$(echo "$input" | jq -r '.tool_input.content // empty')
    target_file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    ;;
  MultiEdit)
    new_content=$(echo "$input" | jq -r '[.tool_input.edits[]? | .new_string // ""] | join("\n")' 2>/dev/null || echo "")
    target_file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    ;;
esac

[[ -z "$new_content" || -z "$target_file" ]] && exit 0

# Só processa arquivos de código-fonte
echo "$target_file" | grep -qE '\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|swift|c|cpp|h|hpp)$' || exit 0

PROJECT_DIR=$(pwd)
if [[ "$target_file" != /* ]]; then
  target_file_abs="${PROJECT_DIR}/${target_file}"
else
  target_file_abs="$target_file"
fi

# ── Extrai nomes de declarações do novo conteúdo ────────────────────────────
new_names=$(
  {
    echo "$new_content" | grep -E '^\s*(export\s+)?(default\s+)?(async\s+)?function\s+[a-zA-Z_$][a-zA-Z0-9_$]*' | \
      sed -E 's/.*function[[:space:]]+([a-zA-Z_$][a-zA-Z0-9_$]*).*/\1/'
    echo "$new_content" | grep -E '^\s*(export\s+)?(abstract\s+|declare\s+)?class\s+[a-zA-Z_$][a-zA-Z0-9_$]*' | \
      sed -E 's/.*class[[:space:]]+([a-zA-Z_$][a-zA-Z0-9_$]*).*/\1/'
    echo "$new_content" | grep -E '^\s*(export\s+)?const\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*(async\s+)?(\(|[a-zA-Z_$])' | \
      sed -E 's/.*const[[:space:]]+([a-zA-Z_$][a-zA-Z0-9_$]*)[[:space:]]*=.*/\1/'
    echo "$new_content" | grep -E '^\s*(async\s+)?def\s+[a-zA-Z_][a-zA-Z0-9_]*' | \
      sed -E 's/.*def[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*).*/\1/'
    echo "$new_content" | grep -E '^\s*class\s+[a-zA-Z_][a-zA-Z0-9_]*' | \
      sed -E 's/.*class[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*).*/\1/'
    echo "$new_content" | grep -E '^func\s+[a-zA-Z_][a-zA-Z0-9_]*' | \
      sed -E 's/^func[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*).*/\1/'
    echo "$new_content" | grep -E '^func\s+\(' | \
      sed -E 's/^func[[:space:]]+\([^)]*\)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*).*/\1/'
    echo "$new_content" | grep -E '^type\s+[a-zA-Z_][a-zA-Z0-9_]*\s+(struct|interface)' | \
      sed -E 's/^type[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*).*/\1/'
    echo "$new_content" | grep -E '^\s*(pub(\([^)]*\))?\s+)?(async\s+)?fn\s+[a-zA-Z_][a-zA-Z0-9_]*' | \
      sed -E 's/.*fn[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*).*/\1/'
    echo "$new_content" | grep -E '^\s*(pub(\([^)]*\))?\s+)?(struct|enum|trait)\s+[a-zA-Z_][a-zA-Z0-9_]*' | \
      sed -E 's/.*(struct|enum|trait)[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*).*/\2/'
  } | grep -vE '^[[:space:]]*$' | sort -u
)

[[ -z "$new_names" ]] && exit 0

GENERIC="^(new|get|set|run|do|main|init|test|setup|teardown|index|handle|process|execute|start|stop|reset|clear|clean|update|create|delete|remove|list|find|fetch|load|save|open|close|read|write|send|recv|receive|connect|disconnect|format|parse|build|render|validate|check|apply|call|make|from|to|is|has|use|pub|mod|impl|type|it|describe|expect|assert|before|after|each|all|any|some|none|ok|err|error|result|data|value|item|node|root|log|debug|info|warn|fatal|default|base|common|shared|core|util|utils|helper|helpers)$"

FOUND=""

while IFS= read -r name; do
  [[ ${#name} -lt 3 ]] && continue
  echo "$name" | grep -qiE "$GENERIC" && continue

  decl_pattern="(function|class|def|fn|struct|enum|trait)[[:space:]]+${name}([[:space:]({<\[]|$)|^type[[:space:]]+${name}[[:space:]]"

  matches=$(grep -rEn "$decl_pattern" "$PROJECT_DIR" \
    --include="*.ts" --include="*.tsx" \
    --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.cjs" \
    --include="*.py" \
    --include="*.go" \
    --include="*.rs" \
    --include="*.java" --include="*.kt" \
    --include="*.rb" --include="*.swift" \
    --include="*.c" --include="*.cpp" --include="*.h" --include="*.hpp" \
    --exclude-dir=node_modules --exclude-dir=.git \
    --exclude-dir=dist --exclude-dir=build --exclude-dir=out \
    --exclude-dir=target --exclude-dir=vendor \
    --exclude-dir=__pycache__ --exclude-dir=.mypy_cache \
    --exclude-dir=.next --exclude-dir=coverage \
    --exclude-dir=.turbo --exclude-dir=.cache \
    2>/dev/null | grep -v "^${target_file_abs}:" | head -5 || true)

  arrow_matches=$(grep -rEn "(export[[:space:]]+)?const[[:space:]]+${name}[[:space:]]*=[[:space:]]*(async[[:space:]]+)?(\(|[a-zA-Z_\$][a-zA-Z0-9_\$]*[[:space:]]*=>)" "$PROJECT_DIR" \
    --include="*.ts" --include="*.tsx" \
    --include="*.js" --include="*.jsx" --include="*.mjs" \
    --exclude-dir=node_modules --exclude-dir=.git \
    --exclude-dir=dist --exclude-dir=build \
    --exclude-dir=.next --exclude-dir=coverage \
    2>/dev/null | grep -v "^${target_file_abs}:" | head -3 || true)

  combined=""
  [[ -n "$matches" ]] && combined="$matches"
  if [[ -n "$arrow_matches" ]]; then
    combined="${combined}${combined:+$'\n'}${arrow_matches}"
  fi
  combined=$(echo "$combined" | grep -v '^$' | head -5 || true)

  if [[ -n "$combined" ]]; then
    FOUND="${FOUND}  '${name}' já existe em:\n"
    while IFS= read -r line; do
      FOUND="${FOUND}    ${line}\n"
    done <<< "$combined"
    FOUND="${FOUND}\n"
  fi
done <<< "$new_names"

if [[ -n "$FOUND" ]]; then
  echo "⚠ Possível código duplicado — os seguintes identificadores já existem no projeto:"
  echo ""
  printf '%b' "$FOUND"
  echo "Antes de criar código novo, verifique se o existente pode ser reutilizado ou modificado."
  echo "Se a duplicação for intencional (override, teste isolado, namespace diferente), prossiga normalmente."
  exit 1
fi

exit 0
