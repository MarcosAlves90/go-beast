#!/usr/bin/env bash
# Reminds the agent to ask the user about committing and pushing changes.
# Commit messages must follow Conventional Commits.
# Event: Stop — exit 2 re-triggers the agent with the reminder as mandatory feedback.

set -uo pipefail

STATE_DIR="${GO_BEAST_STATE_DIR:-$HOME/.go-beast}"
FLAG_FILE="$STATE_DIR/git-commit-remind.pending"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# Do not re-trigger when the hook itself already activated the agent
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

# stderr → terminal (box display for the human)
{
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  🔀  Reminder: uncommitted changes detected             ║"
  echo "╟──────────────────────────────────────────────────────────╢"
  printf "║  Project: %-48s║\n" "${SHORT_DIR:0:48}"
  echo "║                                                          ║"
  echo "║  Modified files:                                        ║"
  while IFS= read -r line; do
    printf "║    %-54s║\n" "${line:0:54}"
  done <<< "$CHANGED_FILES"
  echo "║                                                          ║"
  echo "╚══════════════════════════════════════════════════════════╝"
} >&2

# stdout → the agent (plain text, no decoration)
echo "Uncommitted changes detected in: $PROJECT_DIR"
echo "Modified files:"
echo "$CHANGED_FILES"
echo "Ask the user if they want to commit and/or push these changes before ending the session. If committing, use Conventional Commits: type(scope): summary."

exit 2
