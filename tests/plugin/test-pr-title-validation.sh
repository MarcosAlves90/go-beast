#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

VALID_TITLES=(
  'fix: restore archive lookup'
  'feat(install): support alternate source'
  'feat!: remove the legacy adapter'
  'refactor(hooks)!: change the guard contract'
)

INVALID_TITLES=(
  '[ci] enforce title validation'
  'Fix: use a capitalized type'
  'fix(scope) missing colon'
  'fix: '
  'fix(scope):'
  'fix(): empty scope'
)

for title in "${VALID_TITLES[@]}"; do
  node "$REPO_ROOT/scripts/validate-pr-title.mjs" "$title" > /dev/null
done
echo '[PASS] valid pull request titles are accepted'

for title in "${INVALID_TITLES[@]}"; do
  if node "$REPO_ROOT/scripts/validate-pr-title.mjs" "$title" > /dev/null 2>&1; then
    echo "[FAIL] invalid pull request title was accepted: $title" >&2
    exit 1
  fi
done
echo '[PASS] invalid pull request titles are rejected'

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT
FIXTURE="$TEST_DIR/repo"
git clone -q "$REPO_ROOT" "$FIXTURE"
git -C "$FIXTURE" config user.name 'PR title test'
git -C "$FIXTURE" config user.email 'pr-title-test@example.com'
git -C "$FIXTURE" -c tag.gpgSign=false tag v1.47.2
git -C "$FIXTURE" commit --allow-empty -q -m 'feat(parser)!: exercise shared grammar'
env -u GH_TOKEN -u GITHUB_TOKEN GITHUB_REPOSITORY=example/repo \
  node "$FIXTURE/scripts/prepare-release.mjs" --dry-run > /dev/null
echo '[PASS] release preparation accepts the same scoped breaking grammar'
