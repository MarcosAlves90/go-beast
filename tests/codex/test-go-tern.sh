#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"
require_live_agent_tests codex

TEST_PROJECT="$(create_test_project)"
trap 'cleanup_test_project "$TEST_PROJECT"' EXIT

cd "$TEST_PROJECT"
git init --quiet
git config user.email "test@test.com"
git config user.name "Test User"

cat > app.py <<'EOF'
def find_user(email):
    return db.query("SELECT * FROM users WHERE email = ?", [email])
EOF
git add app.py
git commit -m "feat: safe query" --quiet
BASE_SHA="$(git rev-parse HEAD)"

cat > app.py <<'EOF'
def find_user(email):
    return db.query("SELECT * FROM users WHERE email = '" + email + "'")
EOF
git add app.py
git commit -m "refactor: inline query" --quiet
HEAD_SHA="$(git rev-parse HEAD)"

OUTPUT_FILE="$TEST_PROJECT/output.txt"
PROMPT="Review the change between $BASE_SHA and $HEAD_SHA using the go-tern skill. Return severity-ranked findings and a merge recommendation."

codex exec "$PROMPT" \
  -C "$TEST_PROJECT" \
  --sandbox workspace-write \
  --output-last-message "$OUTPUT_FILE" \
  >/tmp/go-beast-codex-go-tern.log

assert_contains "$OUTPUT_FILE" "Critical|Important" "go-tern produced a severity-ranked finding"
assert_contains "$OUTPUT_FILE" "merge" "go-tern produced a merge recommendation"

echo "STATUS: PASSED"
