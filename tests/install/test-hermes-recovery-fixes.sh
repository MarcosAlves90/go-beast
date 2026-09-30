#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

set +e
(
  cd "$REPO_ROOT/scripts/safe-fs" &&
    go test -run 'TestRecoveryMoveDoesNotFollowSwapped|TestUpdateReportsDisplacedAndPartialCopies|TestRestoreSnapshotToAbsentReportsFailureWhenBackupIsMissing' -count=1 ./...
)
go_status=$?
node --test "$REPO_ROOT/tests/unit/install-transaction-recovery.test.mjs"
node_status=$?
set -e

if [ "$go_status" -eq 0 ] && [ "$node_status" -eq 0 ]; then
  exit 0
fi
printf '%s\n' 'HERMES_RECOVERY_REVIEW_RED'
exit 1
