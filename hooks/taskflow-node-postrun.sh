#!/usr/bin/env bash
# Captura erros de comandos npm/node após execução e os registra no log de sessão.
# Event: PostToolUse (matcher: Bash)
# Comportamento: observer — sempre exit 0, nunca bloqueia execução posterior.

set -euo pipefail

LOG_DIR="$HOME/.claude/logs"
LOG_FILE="$LOG_DIR/taskflow-errors.log"

mkdir -p "$LOG_DIR"

# Lê JSON do stdin (PostToolUse sempre fornece)
input=$(cat)

tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
[[ -z "$tool_name" ]] && exit 0

# Só age em chamadas Bash
if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)

# Só interessa comandos npm, node, npx ou jest
if ! echo "$command" | grep -qE "^(npm|node|npx|jest)\b"; then
  exit 0
fi

exit_code=$(echo "$input" | jq -r '.tool_response.exit_code // "0"')
output=$(echo "$input" | jq -r '.tool_response.stdout // empty')
stderr_output=$(echo "$input" | jq -r '.tool_response.stderr // empty')

# Registra apenas quando há erro (exit_code != 0 ou stderr não vazio)
if [[ "$exit_code" != "0" ]] || echo "$stderr_output" | grep -qiE "error|err:|warn:"; then
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  {
    echo "---"
    echo "timestamp: ${TIMESTAMP}"
    echo "command: ${command}"
    echo "exit_code: ${exit_code}"
    if [[ -n "$stderr_output" ]]; then
      echo "stderr: ${stderr_output}"
    fi
    if echo "$output" | grep -qiE "error|err:"; then
      echo "stdout_errors: $(echo "$output" | grep -iE 'error|err:' | head -20)"
    fi
  } >> "$LOG_FILE"
fi

exit 0
