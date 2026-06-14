#!/usr/bin/env bash
# Forces documentation and versioning update after code modifications.
# Event: Stop — exit 2 re-triggers Claude with the reminder as mandatory feedback.

set -uo pipefail

FLAG_FILE="$HOME/.claude/.docs-update-pending"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# Do not re-trigger when the hook itself already activated Claude
[[ "$stop_hook_active" == "true" ]] && exit 0

[[ ! -f "$FLAG_FILE" ]] && exit 0

PROJECT_DIR=$(cat "$FLAG_FILE")
rm -f "$FLAG_FILE"

[[ ! -d "$PROJECT_DIR" ]] && exit 0

# Detect whether the project has documentation and versioning files to guide the reminder
DOC_HINTS=""
HAS_VERSIONING=false

if [[ -f "$PROJECT_DIR/README.md" ]]; then
  DOC_HINTS="${DOC_HINTS}README.md "
fi
if [[ -d "$PROJECT_DIR/docs" ]]; then
  DOC_HINTS="${DOC_HINTS}docs/ "
fi
if [[ -f "$PROJECT_DIR/CHANGELOG.md" ]]; then
  DOC_HINTS="${DOC_HINTS}CHANGELOG.md "
fi

# Detect versioning files
for vfile in PACKAGE.md package.json pyproject.toml Cargo.toml go.mod; do
  if [[ -f "$PROJECT_DIR/$vfile" ]]; then
    HAS_VERSIONING=true
    break
  fi
done

# Build the message (stdout → Claude as system-reminder; stderr → terminal for the user)
MSG=""
MSG+=$'\n'
MSG+="╔══════════════════════════════════════════════════════════╗"$'\n'
MSG+="║  📝  Reminder: review documentation                     ║"$'\n'
MSG+="╟──────────────────────────────────────────────────────────╢"$'\n'
MSG+="║  Source files were modified in:                         ║"$'\n'
SHORT_DIR=$(echo "$PROJECT_DIR" | sed "s|$HOME|~|")
MSG+="║  ${SHORT_DIR}$(printf '%*s' $((44 - ${#SHORT_DIR})) '')║"$'\n'
if [[ -n "$DOC_HINTS" ]]; then
  MSG+="║                                                          ║"$'\n'
  MSG+="║  Detected docs: ${DOC_HINTS}$(printf '%*s' $((42 - ${#DOC_HINTS})) '')║"$'\n'
fi
MSG+="║                                                          ║"$'\n'
MSG+="║  Update before closing:                                 ║"$'\n'
MSG+="║  • README (usage, examples, configuration)              ║"$'\n'
MSG+="║  • JSDoc/docstrings on modified functions               ║"$'\n'
MSG+="║  • CHANGELOG if this is a notable change                ║"$'\n'
if [[ "$HAS_VERSIONING" == "true" ]]; then
  MSG+="║  • Version in PACKAGE.md/package.json and README        ║"$'\n'
fi
MSG+="╚══════════════════════════════════════════════════════════╝"$'\n'

# stdout → Claude (system-reminder via exit 2)
echo "$MSG"
# stderr → terminal (visible to the user)
echo "$MSG" >&2

# exit 2 re-triggers Claude with stdout as mandatory feedback.
exit 2
