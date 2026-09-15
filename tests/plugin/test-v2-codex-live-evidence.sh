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
grep -Fq 'INCONCLUSIVE' "$EVIDENCE"
grep -Fq 'not a pass' "$EVIDENCE"
grep -Fq 'TIMEOUT' "$EVIDENCE"

if grep -Eq 'go-mule[^\n]*(PASS|PASSED)' "$EVIDENCE"; then
  echo 'go-mule evidence must not be represented as PASS'
  exit 1
fi

echo 'Codex fresh-context live evidence checks passed'
