#!/usr/bin/env bash
# Reminds Claude to bump version when CHANGELOG.md has unreleased content.
# Event: Stop — exit 2 re-triggers Claude with the reminder as mandatory feedback.

set -uo pipefail

FLAG_FILE="$HOME/.claude/.docs-update-pending"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

[[ "$stop_hook_active" == "true" ]] && exit 0

# Only fire when a docs-update flag exists (source was modified this session)
[[ ! -f "$FLAG_FILE" ]] && exit 0

PROJECT_DIR=$(cat "$FLAG_FILE")
[[ ! -d "$PROJECT_DIR" ]] && exit 0

CHANGELOG="$PROJECT_DIR/CHANGELOG.md"
[[ ! -f "$CHANGELOG" ]] && exit 0

# Check if [Unreleased] section has content (any non-empty line after it)
has_unreleased_content=false
in_unreleased=false
while IFS= read -r line; do
  if echo "$line" | grep -qE '^\#\# \[Unreleased\]'; then
    in_unreleased=true
    continue
  fi
  if [[ "$in_unreleased" == "true" ]]; then
    # Next version header signals end of Unreleased section
    if echo "$line" | grep -qE '^\#\# \[[0-9]'; then
      break
    fi
    # Non-empty, non-comment line = real content
    if echo "$line" | grep -qE '^[^[:space:]]|^[[:space:]]+[^[:space:]]'; then
      has_unreleased_content=true
      break
    fi
  fi
done < "$CHANGELOG"

[[ "$has_unreleased_content" == "false" ]] && exit 0

# Detect current version from PACKAGE.md or package.json
CURRENT_VERSION=""
if [[ -f "$PROJECT_DIR/PACKAGE.md" ]]; then
  CURRENT_VERSION=$(grep -E '^version:' "$PROJECT_DIR/PACKAGE.md" | head -1 | sed 's/version:[[:space:]]*//')
elif [[ -f "$PROJECT_DIR/package.json" ]]; then
  CURRENT_VERSION=$(jq -r '.version // empty' "$PROJECT_DIR/package.json" 2>/dev/null || echo "")
fi

SHORT_DIR=$(echo "$PROJECT_DIR" | sed "s|$HOME|~|")
VERSION_HINT=""
[[ -n "$CURRENT_VERSION" ]] && VERSION_HINT=" (current: $CURRENT_VERSION)"

MSG=""
MSG+=$'\n'
MSG+="╔══════════════════════════════════════════════════════════╗"$'\n'
MSG+="║  🏷️   Reminder: version bump needed                     ║"$'\n'
MSG+="╟──────────────────────────────────────────────────────────╢"$'\n'
MSG+="║  CHANGELOG.md has [Unreleased] content in:             ║"$'\n'
DISPLAY_DIR="${SHORT_DIR:0:46}"
MSG+="║  ${DISPLAY_DIR}$(printf '%*s' $((48 - ${#DISPLAY_DIR})) '')║"$'\n'
MSG+="║                                                          ║"$'\n'
MSG+="║  Before closing, bump the version${VERSION_HINT}:$(printf '%*s' $((23 - ${#VERSION_HINT})) '')║"$'\n'
MSG+="║  1. Move [Unreleased] → [x.y.z] - YYYY-MM-DD           ║"$'\n'
MSG+="║  2. Update version in PACKAGE.md (or package.json)      ║"$'\n'
MSG+="║  3. Update version badge in README.md                   ║"$'\n'
MSG+="╚══════════════════════════════════════════════════════════╝"$'\n'

echo "$MSG"
echo "Ask the user if they want to bump the version and close the [Unreleased] section before ending the session."
echo "$MSG" >&2

exit 2
