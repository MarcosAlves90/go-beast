#!/usr/bin/env bash
# Initializes shared go-beast anti-drift session state.
# Event: SessionStart

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=hooks/go-beast-drift-lib.sh
source "$SCRIPT_DIR/go-beast-drift-lib.sh"

input="$(cat 2>/dev/null || true)"
session_id="$(gb_json_get "$input" '.session_id // empty')"
cwd="$(gb_json_get "$input" '.cwd // empty')"

[[ -z "$session_id" ]] && session_id="session-$(date +%s)"
[[ -z "$cwd" ]] && cwd="$(pwd)"

harness="$(gb_detect_harness "$0")"
mode="$(gb_detect_mode)"
state="$(gb_default_state_json "$session_id" "$cwd" "$harness" "$mode")"

gb_save_state_json "$session_id" "$state"

exit 0
