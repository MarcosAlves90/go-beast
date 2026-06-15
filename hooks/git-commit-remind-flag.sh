#!/usr/bin/env bash
# Flags the current project for commit/push reminder when files are modified.
# Event: PostToolUse (Edit, Write, MultiEdit)

set -uo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || echo "")

[[ "$tool_name" == "Edit" || "$tool_name" == "Write" || "$tool_name" == "MultiEdit" ]] || exit 0

# Resolve project root from the modified file path
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || echo "")
if [[ -z "$file_path" ]]; then
  exit 0
fi

project_dir=$(dirname "$file_path")
# Walk up to find git root
git_root=$(git -C "$project_dir" rev-parse --show-toplevel 2>/dev/null || echo "")
[[ -z "$git_root" ]] && exit 0

STATE_DIR="${GO_BEAST_STATE_DIR:-$HOME/.go-beast}"
mkdir -p "$STATE_DIR"
echo "$git_root" > "$STATE_DIR/git-commit-remind.pending"
exit 0
