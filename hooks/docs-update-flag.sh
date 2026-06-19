#!/usr/bin/env bash
# Flags the project for a docs reminder when a supported agent modifies any non-doc, non-ignored file.
# Event: PostToolUse (Edit, Write, MultiEdit)

set -uo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
[[ -z "$tool_name" ]] && exit 0

file_path=""
case "$tool_name" in
  Edit|Write|MultiEdit)
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
    ;;
  *)
    exit 0
    ;;
esac

[[ -z "$file_path" ]] && exit 0

# Ignore documentation and repo meta-config files
if echo "$file_path" | grep -qE '\.(md|rst|txt|adoc)$|README|CHANGELOG|CONTRIBUTING|/docs/'; then
  exit 0
fi
if echo "$file_path" | grep -qE '(^|/)\.gitignore$|(^|/)\.gitattributes$|(^|/)\.editorconfig$|(^|/)\.prettierrc|(^|/)\.eslintrc|(^|/)\.npmrc$|(^|/)\.nvmrc$'; then
  exit 0
fi

# Ignore agent/system config directories (not project source)
if echo "$file_path" | grep -qE "^$HOME/(\.claude|\.config|\.local|\.codex)/"; then
  exit 0
fi

# Find the nearest existing ancestor directory (file may not exist yet)
ancestor_dir="$(dirname "$file_path")"
while [[ ! -d "$ancestor_dir" && "$ancestor_dir" != "/" ]]; do
  ancestor_dir="$(dirname "$ancestor_dir")"
done

# Resolve project root: git root if available, otherwise the ancestor dir
project_dir=$(git -C "$ancestor_dir" rev-parse --show-toplevel 2>/dev/null \
  || echo "$ancestor_dir")

# If in a git repo, skip files that are gitignored (build artifacts, node_modules, etc.)
if git -C "$ancestor_dir" rev-parse --show-toplevel &>/dev/null; then
  # git check-ignore requires path relative to git root
  rel_path="${file_path#"$project_dir/"}"
  is_ignored=0
  git -C "$project_dir" check-ignore -q "$rel_path" 2>/dev/null || is_ignored=$?
  # exit code 0 = ignored, exit code 1 = not ignored, exit code 128 = error
  [[ "$is_ignored" -eq 0 ]] && exit 0
fi

STATE_DIR="${GO_BEAST_STATE_DIR:-$HOME/.go-beast}"
mkdir -p "$STATE_DIR"

# Flag the project for a docs reminder
printf '%s' "$project_dir" > "$STATE_DIR/docs-update.pending"

exit 0
