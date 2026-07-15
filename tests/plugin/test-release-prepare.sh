#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT

FIXTURE="$TEST_DIR/repo"
git clone -q "$REPO_ROOT" "$FIXTURE"
cp "$REPO_ROOT/scripts/prepare-release.mjs" "$FIXTURE/scripts/prepare-release.mjs"
git -C "$FIXTURE" config user.name "Release Test"
git -C "$FIXTURE" config user.email "release-test@example.com"
git -C "$FIXTURE" -c tag.gpgSign=false tag v1.47.2
git -C "$FIXTURE" commit --allow-empty -q -m "fix(test): exercise release preparation"

env -u GH_TOKEN -u GITHUB_TOKEN GITHUB_REPOSITORY=example/repo \
  node "$FIXTURE/scripts/prepare-release.mjs" --dry-run > "$TEST_DIR/dry-run.json"
assert_contains "$TEST_DIR/dry-run.json" '"dryRun": true' 'release preparation supports dry-run mode'
assert_contains "$TEST_DIR/dry-run.json" '"bump": "patch"' 'fix commits calculate a patch bump'

env -u GH_TOKEN -u GITHUB_TOKEN GITHUB_REPOSITORY=example/repo \
  node "$FIXTURE/scripts/prepare-release.mjs" --version 9.9.9 > "$TEST_DIR/release.json"
assert_contains "$FIXTURE/package.json" '"version": "9.9.9"' 'release preparation updates package version'
assert_contains "$FIXTURE/CHANGELOG.md" '^## \[9\.9\.9\] - ' 'release preparation creates released changelog section'
assert_contains "$FIXTURE/CHANGELOG.md" 'exercise release preparation' 'release preparation includes commit description'
node "$FIXTURE/scripts/release-version.mjs" check > /dev/null
echo '[PASS] generated release surfaces pass release-version check'
