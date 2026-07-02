#!/usr/bin/env bash
# Reminds the agent to bump version when CHANGELOG.md has unreleased content.
# Event: Stop — exit 2 re-triggers the agent with the reminder as mandatory feedback.

set -uo pipefail

STATE_DIR="${GO_BEAST_STATE_DIR:-$HOME/.go-beast}"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

[[ "$stop_hook_active" == "true" ]] && exit 0

session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null || echo "")
session_id="${session_id:-default}"
FLAG_FILE="$STATE_DIR/docs-update.${session_id}.pending"

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

# Detect current canonical version from package.json first, then fall back to PACKAGE.md
CURRENT_VERSION=""
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  CURRENT_VERSION=$(jq -r '.version // empty' "$PROJECT_DIR/package.json" 2>/dev/null || echo "")
elif [[ -f "$PROJECT_DIR/PACKAGE.md" ]]; then
  CURRENT_VERSION=$(grep -E '^version:' "$PROJECT_DIR/PACKAGE.md" | head -1 | sed 's/version:[[:space:]]*//')
fi

SHORT_DIR=$(echo "$PROJECT_DIR" | sed "s|$HOME|~|")
VERSION_HINT=""
[[ -n "$CURRENT_VERSION" ]] && VERSION_HINT=" (current: $CURRENT_VERSION)"

# stderr → terminal (one concise line)
echo "version-bump-remind: CHANGELOG.md has [Unreleased] content in ${SHORT_DIR}${VERSION_HINT}" >&2

# stdout → the agent (plain text)
echo "CHANGELOG.md has unreleased content in: $PROJECT_DIR${VERSION_HINT:+ Current version: $CURRENT_VERSION.}"
echo "Ask the user if they want to cut a release before ending the session: run release-version.mjs with the appropriate SemVer bump, then publish the git tag and certificate."

exit 2
