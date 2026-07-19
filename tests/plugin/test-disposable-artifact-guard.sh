#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

HOOK="$REPO_ROOT/hooks/git-commit-guard.sh"

run_guard() {
  local command="$1"
  local output="$2"
  printf '%s' "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":$(node -p 'JSON.stringify(process.argv[1])' "$command")}}" \
    | (cd "$TEST_DIR/repo" && bash "$HOOK") >"$output" 2>&1
}

mkdir -p "$TEST_DIR/repo"
git -C "$TEST_DIR/repo" init -q
git -C "$TEST_DIR/repo" config user.email test@example.com
git -C "$TEST_DIR/repo" config user.name Test
printf 'safe\n' > "$TEST_DIR/repo/source.txt"
git -C "$TEST_DIR/repo" add source.txt
git -C "$TEST_DIR/repo" commit -qm init

printf 'requirements\n' > "$TEST_DIR/repo/REQUIREMENTS.md"
set +e
run_guard 'git add REQUIREMENTS.md' "$TEST_DIR/explicit.out"
EXPLICIT_EXIT=$?
set -e
if [[ "$EXPLICIT_EXIT" -ne 1 ]]; then
  echo "[FAIL] explicit disposable artifact add is blocked"
  exit 1
fi
assert_contains "$TEST_DIR/explicit.out" 'disposable go-beast artifact' "explicit add identifies disposable artifact"

mkdir -p "$TEST_DIR/repo/.go-beast/workflows"
printf 'requirements\n' > "$TEST_DIR/repo/.go-beast/REQUIREMENTS.md"
set +e
run_guard 'git add .go-beast/REQUIREMENTS.md' "$TEST_DIR/canonical.out"
CANONICAL_EXIT=$?
set -e
if [[ "$CANONICAL_EXIT" -ne 1 ]]; then
  echo "[FAIL] canonical disposable artifact add is blocked"
  exit 1
fi
assert_contains "$TEST_DIR/canonical.out" 'disposable go-beast artifact' "canonical add identifies disposable artifact"

set +e
run_guard "git add -f $TEST_DIR/repo/.go-beast/REQUIREMENTS.md" "$TEST_DIR/absolute.out"
ABSOLUTE_EXIT=$?
set -e
if [[ "$ABSOLUTE_EXIT" -ne 1 ]]; then
  echo "[FAIL] absolute forced add of disposable artifact is blocked"
  exit 1
fi
assert_contains "$TEST_DIR/absolute.out" 'disposable go-beast artifact' "absolute forced add identifies disposable artifact"

printf '{}\n' > "$TEST_DIR/repo/.go-beast/workflows/state.json"
for command_name in \
  'git add -- .' \
  'git add ./' \
  'git add -i' \
  'git add -p' \
  'git add --pathspec-from-file=paths.txt' \
  "git -C $TEST_DIR/repo add ."; do
  set +e
  run_guard "$command_name" "$TEST_DIR/edge-${RANDOM}.out"
  EDGE_EXIT=$?
  set -e
  if [[ "$EDGE_EXIT" -ne 1 ]]; then
    echo "[FAIL] edge-case add is blocked: $command_name"
    exit 1
  fi
done
echo "[PASS] alternative add forms are blocked"

set +e
run_guard 'git add .' "$TEST_DIR/broad.out"
BROAD_EXIT=$?
set -e
if [[ "$BROAD_EXIT" -ne 1 ]]; then
  echo "[FAIL] broad disposable artifact add is blocked"
  exit 1
fi
assert_contains "$TEST_DIR/broad.out" 'REQUIREMENTS.md' "broad add reports root disposable artifact"
assert_contains "$TEST_DIR/broad.out" '\.go-beast/' "broad add reports workflow state directory"

git -C "$TEST_DIR/repo" add REQUIREMENTS.md
set +e
run_guard 'git commit -m "test"' "$TEST_DIR/staged.out"
STAGED_EXIT=$?
set -e
if [[ "$STAGED_EXIT" -ne 1 ]]; then
  echo "[FAIL] staged disposable artifact commit is blocked"
  exit 1
fi
assert_contains "$TEST_DIR/staged.out" 'REQUIREMENTS.md' "staged commit reports disposable artifact"
git -C "$TEST_DIR/repo" reset -q HEAD REQUIREMENTS.md

printf 'safe\n' > "$TEST_DIR/repo/.env.example"
set +e
run_guard 'git add .env.example' "$TEST_DIR/safe.out"
SAFE_EXIT=$?
set -e
if [[ "$SAFE_EXIT" -ne 0 ]]; then
  echo "[FAIL] safe example file remains stageable"
  exit 1
fi

printf 'tracked requirements\n' > "$TEST_DIR/repo/REQUIREMENTS.md"
git -C "$TEST_DIR/repo" add REQUIREMENTS.md
git -C "$TEST_DIR/repo" commit -qm 'track requirements intentionally'
set +e
run_guard 'git commit -am "update"' "$TEST_DIR/tracked.out"
TRACKED_EXIT=$?
set -e
if [[ "$TRACKED_EXIT" -ne 0 ]]; then
  echo "[FAIL] intentionally tracked requirements file remains allowed"
  exit 1
fi

echo "STATUS: PASSED"
