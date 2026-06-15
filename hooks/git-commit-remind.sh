#!/usr/bin/env bash
# Reminds Claude to ask the user about committing and pushing changes.
# Event: Stop — exit 2 re-triggers Claude with the reminder as mandatory feedback.

set -uo pipefail

FLAG_FILE="$HOME/.claude/.git-commit-remind-pending"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# Do not re-trigger when the hook itself already activated Claude
[[ "$stop_hook_active" == "true" ]] && exit 0

[[ ! -f "$FLAG_FILE" ]] && exit 0

PROJECT_DIR=$(cat "$FLAG_FILE")
rm -f "$FLAG_FILE"

[[ ! -d "$PROJECT_DIR" ]] && exit 0

# Only remind if there are actual uncommitted changes
if ! git -C "$PROJECT_DIR" diff --quiet 2>/dev/null || \
   ! git -C "$PROJECT_DIR" diff --cached --quiet 2>/dev/null || \
   [[ -n "$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard 2>/dev/null)" ]]; then
  :
else
  exit 0
fi

# Collect summary of changes
CHANGED_FILES=$(git -C "$PROJECT_DIR" status --short 2>/dev/null | head -10)
SHORT_DIR=$(echo "$PROJECT_DIR" | sed "s|$HOME|~|")

MSG=""
MSG+=$'\n'
MSG+="╔══════════════════════════════════════════════════════════╗"$'\n'
MSG+="║  🔀  Reminder: uncommitted changes detected             ║"$'\n'
MSG+="╟──────────────────────────────────────────────────────────╢"$'\n'
# Truncate path if too long for the box (max 46 chars)
DISPLAY_DIR="${SHORT_DIR:0:46}"
MSG+="║  Project: ${DISPLAY_DIR}$(printf '%*s' $((48 - ${#DISPLAY_DIR})) '')║"$'\n'
MSG+="║                                                          ║"$'\n'
MSG+="║  Modified files:                                        ║"$'\n'
while IFS= read -r line; do
  DISPLAY_LINE="${line:0:50}"
  MSG+="║    ${DISPLAY_LINE}$(printf '%*s' $((54 - ${#DISPLAY_LINE})) '')║"$'\n'
done <<< "$CHANGED_FILES"
MSG+="║                                                          ║"$'\n'
MSG+="╚══════════════════════════════════════════════════════════╝"$'\n'

# stdout → Claude (system-reminder via exit 2)
echo "$MSG"
echo "Ask the user if they want to commit and/or push these changes before ending the session."

# stderr → terminal (visible to the user)
echo "$MSG" >&2

exit 2
