#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVIDENCE="$REPO_ROOT/docs/architecture/V2_CLAUDE_LIVE_EVIDENCE.md"

if [ ! -f "$EVIDENCE" ]; then
  echo 'CLAUDE_LIVE_EVIDENCE_RED'
  exit 1
fi

require_marker() {
  local marker="$1"
  if ! grep -Fq -- "$marker" "$EVIDENCE"; then
    echo 'CLAUDE_LIVE_EVIDENCE_RED'
    echo "missing marker: $marker"
    exit 1
  fi
}

require_marker 'Fresh Claude Code `go-mole`'
require_marker 'GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/claude-code/test-go-mole.sh'
require_marker 'Fresh Claude Code `bootstrap triage`'
require_marker 'GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/claude-code/test-bootstrap-triage.sh'
require_marker 'Fresh Claude Code `hook-wire`'
require_marker 'GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/claude-code/test-hook-wire.sh'
require_marker '`STATUS: PASSED`, exit 0'
require_marker 'claude -p'
require_marker '9 assertions'
require_marker 'does not invoke a model'
require_marker '2.1.270'

echo 'Claude Code fresh-context live evidence checks passed'
