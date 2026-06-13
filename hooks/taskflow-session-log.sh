#!/usr/bin/env bash
# Registra início de sessão do Claude Code para o projeto TaskFlow API.
# Event: SessionStart
# Comportamento: observer — sempre exit 0, nunca bloqueia.

set -euo pipefail

LOG_DIR="$HOME/.claude/logs"
LOG_FILE="$LOG_DIR/taskflow-sessions.log"

mkdir -p "$LOG_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
WORKING_DIR="${PWD:-unknown}"
USER_NAME="${USER:-unknown}"
HOSTNAME_VAL="${HOSTNAME:-$(hostname 2>/dev/null || echo 'unknown')}"

echo "${TIMESTAMP} | session_start | user=${USER_NAME} | host=${HOSTNAME_VAL} | cwd=${WORKING_DIR}" >> "$LOG_FILE"

exit 0
