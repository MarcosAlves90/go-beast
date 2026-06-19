#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

DIRTY_MSG="$(mktemp /tmp/go-beast-coauthored-dirty.XXXXXX)"
CLEAN_MSG="$(mktemp /tmp/go-beast-coauthored-clean.XXXXXX)"
cleanup() {
  rm -f "$DIRTY_MSG" "$CLEAN_MSG"
}
trap cleanup EXIT

printf 'fix: something\nCo-Authored-By: Claude <noreply@anthropic.com>\n' > "$DIRTY_MSG"
printf 'fix: clean message\n' > "$CLEAN_MSG"

run_hook() {
  local payload="$1"
  local output_file="$2"
  local exit_code=0
  printf '%s' "$payload" | bash "$REPO_ROOT/hooks/git-strip-coauthored.sh" > "$output_file" 2>&1 || exit_code=$?
  printf 'EXIT:%s\n' "$exit_code" >> "$output_file"
}

run_hook '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"fix: something\\nCo-Authored-By: Claude <noreply@anthropic.com>\""}}' /tmp/go-beast-inline-coauthored.out
run_hook '{"tool_name":"Bash","note":"Co-Authored-By: Example Agent <agent@example.com>","tool_input":{"command":"git commit -m \"fix: clean message\""}' /tmp/go-beast-outside-command-coauthored.out
run_hook "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -F $DIRTY_MSG\"}}" /tmp/go-beast-file-coauthored.out
run_hook "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -F $CLEAN_MSG\"}}" /tmp/go-beast-file-clean.out
run_hook "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -F $CLEAN_MSG --trailer \\\"Co-Authored-By: Claude <noreply@anthropic.com>\\\"\"}}" /tmp/go-beast-file-trailer.out

assert_contains /tmp/go-beast-inline-coauthored.out "EXIT:1" "blocks inline Co-Authored-By commit"
assert_contains /tmp/go-beast-outside-command-coauthored.out "EXIT:0" "ignores Co-Authored-By outside the commit command"
assert_contains /tmp/go-beast-file-coauthored.out "EXIT:1" "blocks Co-Authored-By from message file"
assert_contains /tmp/go-beast-file-clean.out "EXIT:0" "passes clean message file commit"
assert_contains /tmp/go-beast-file-trailer.out "EXIT:1" "blocks Co-Authored-By trailer with clean message file"

rm -f /tmp/go-beast-inline-coauthored.out /tmp/go-beast-outside-command-coauthored.out /tmp/go-beast-file-coauthored.out /tmp/go-beast-file-clean.out /tmp/go-beast-file-trailer.out

echo "STATUS: PASSED"
