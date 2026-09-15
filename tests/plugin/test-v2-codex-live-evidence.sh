#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVIDENCE="$REPO_ROOT/docs/architecture/V2_CODEX_LIVE_EVIDENCE.md"

if [ ! -f "$EVIDENCE" ]; then
  echo 'V2_CODEX_LIVE_EVIDENCE_RED'
  exit 1
fi

grep -Fq 'go-tern' "$EVIDENCE"
grep -Fq 'STATUS: PASSED' "$EVIDENCE"
grep -Fq 'codex exec' "$EVIDENCE"
grep -Fq 'fresh Codex' "$EVIDENCE"
grep -Fq 'go-mule' "$EVIDENCE"
if ! grep -Fq 'Fresh Codex `go-mule` initial attempt' "$EVIDENCE"; then
  echo 'CODEX_LIVE_EVIDENCE_RED'
  exit 1
fi
if ! grep -Fq 'Fresh Codex `go-mule` retry' "$EVIDENCE"; then
  echo 'CODEX_LIVE_EVIDENCE_RED'
  exit 1
fi
grep -Fq '9 assertions' "$EVIDENCE"
grep -Fq 'INCONCLUSIVE' "$EVIDENCE"
grep -Fq 'not a pass' "$EVIDENCE"
grep -Fq 'TIMEOUT' "$EVIDENCE"

if grep -Fq 'Fresh Codex `go-mule` initial attempt | `GO_BEAST_RUN_LIVE_AGENT_TESTS=1 bash tests/codex/test-go-mule.sh` | `STATUS: PASSED`' "$EVIDENCE"; then
  echo 'go-mule initial attempt must remain inconclusive'
  exit 1
fi

echo 'Codex fresh-context live evidence checks passed'
