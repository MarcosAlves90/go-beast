#!/usr/bin/env bash
# Forces documentation and versioning update after code modifications.
# Event: Stop — exit 2 re-triggers the agent with the reminder as mandatory feedback.

set -uo pipefail

STATE_DIR="${GO_BEAST_STATE_DIR:-$HOME/.go-beast}"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# Do not re-trigger when the hook itself already activated the agent
[[ "$stop_hook_active" == "true" ]] && exit 0

session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null || true)
session_id="${session_id:-default}"
FLAG_FILE="$STATE_DIR/docs-update.${session_id}.pending"

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

SHORT_DIR=$(echo "$PROJECT_DIR" | sed "s|$HOME|~|")

# stderr → terminal (one concise line)
echo "docs-update-remind: documentation review required for ${SHORT_DIR}" >&2

# stdout → the agent (plain text)
echo "Documentation review required. Source files were modified in: $PROJECT_DIR"
[[ -n "$DOC_HINTS" ]] && echo "Detected documentation files: $DOC_HINTS"
echo "Review and update as needed: README, CHANGELOG (if this is a notable change), JSDoc/docstrings on modified functions."
[[ "$HAS_VERSIONING" == "true" ]] && echo "Also check whether the version in package.json/PACKAGE.md needs a bump."

exit 2
