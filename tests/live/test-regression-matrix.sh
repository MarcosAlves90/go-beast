#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

for harness in claude-code codex copilot; do
  suite="$REPO_ROOT/tests/$harness"
  if [ ! -d "$suite" ] || [ -z "$(find "$suite" -type f -name '*.sh' -print -quit)" ]; then
    echo "Live regression matrix is missing a suite for $harness" >&2
    exit 1
  fi
done

if [ "${GO_BEAST_RUN_LIVE_AGENT_TESTS:-0}" != "1" ]; then
  echo '[SKIP] live-agent regression matrix (set GO_BEAST_RUN_LIVE_AGENT_TESTS=1 to enable)'
  exit 0
fi

for harness in claude-code codex copilot; do
  case "$harness" in
    claude-code) command_name="claude" ;;
    codex) command_name="codex" ;;
    copilot) command_name="copilot" ;;
  esac
  if command -v "$command_name" >/dev/null 2>&1; then
    echo "[READY] $harness live-agent suite"
  else
    echo "[SKIP] $harness live-agent suite ($command_name not installed)"
  fi
done

echo 'Live regression matrix inventory passed'
