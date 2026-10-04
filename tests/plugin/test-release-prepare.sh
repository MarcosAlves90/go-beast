#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_DIR="$(create_test_project)"
trap 'cleanup_test_project "$TEST_DIR"' EXIT
CURRENT_VERSION="$(node --input-type=module -e 'import fs from "node:fs"; process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).version)' "$REPO_ROOT/package.json")"
NEXT_PATCH_VERSION="$(node -e 'const [major,minor,patch]=process.argv[1].split(".").map(Number); process.stdout.write(`${major}.${minor}.${patch+1}`)' "$CURRENT_VERSION")"
CURRENT_TAG="v$CURRENT_VERSION"

FIXTURE="$TEST_DIR/repo"
git clone -q "$REPO_ROOT" "$FIXTURE"
cp "$REPO_ROOT/scripts/prepare-release.mjs" "$FIXTURE/scripts/prepare-release.mjs"
cp "$REPO_ROOT/scripts/conventional-commit.mjs" "$FIXTURE/scripts/conventional-commit.mjs"
git -C "$FIXTURE" config user.name "Release Test"
git -C "$FIXTURE" config user.email "release-test@example.com"
BASE_FIXTURE_SHA="$(git -C "$FIXTURE" rev-parse HEAD)"
git -C "$FIXTURE" -c tag.gpgSign=false tag -f -a "$CURRENT_TAG" "$BASE_FIXTURE_SHA" -m "go-beast $CURRENT_VERSION" >/dev/null
git -C "$FIXTURE" update-ref refs/remotes/origin/main "$BASE_FIXTURE_SHA"
git -C "$FIXTURE" switch -q -C release "$BASE_FIXTURE_SHA"
git -C "$FIXTURE" commit --allow-empty -q -m "fix(test): exercise release preparation"
git -C "$FIXTURE" commit --allow-empty -q -m "fix(test): exercise second release record"

FAKE_GH="$TEST_DIR/gh"
cat > "$FAKE_GH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    *$'\n'*|*$'\r'*)
      echo "gh argument contains a control character" >&2
      exit 1
      ;;
  esac
done

printf '[]\n'
EOF
chmod +x "$FAKE_GH"

GH_BIN="$FAKE_GH" GH_TOKEN=test GITHUB_REPOSITORY=example/repo \
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

RANGE_FIXTURE="$TEST_DIR/diverged-release-repo"
git clone -q "$REPO_ROOT" "$RANGE_FIXTURE"
cp "$REPO_ROOT/scripts/prepare-release.mjs" "$RANGE_FIXTURE/scripts/prepare-release.mjs"
cp "$REPO_ROOT/scripts/conventional-commit.mjs" "$RANGE_FIXTURE/scripts/conventional-commit.mjs"
BASE_SHA="$(git -C "$RANGE_FIXTURE" rev-parse HEAD)"
git -C "$RANGE_FIXTURE" tag -f -a v0.0.1 "$BASE_SHA" -m "go-beast baseline" >/dev/null
git -C "$RANGE_FIXTURE" switch -q -C main "$BASE_SHA"
git -C "$RANGE_FIXTURE" commit --allow-empty -q -m "chore(release): publish $CURRENT_TAG"
MAIN_SHA="$(git -C "$RANGE_FIXTURE" rev-parse HEAD)"
git -C "$RANGE_FIXTURE" tag -f -a "$CURRENT_TAG" "$MAIN_SHA" -m "go-beast $CURRENT_VERSION" >/dev/null
git -C "$RANGE_FIXTURE" update-ref refs/remotes/origin/main "$MAIN_SHA"
git -C "$RANGE_FIXTURE" switch -q -C release "$BASE_SHA"
git -C "$RANGE_FIXTURE" commit --allow-empty -q -m "fix(test): post-release patch"
if git -C "$RANGE_FIXTURE" merge-base --is-ancestor "$CURRENT_TAG" HEAD; then
  echo "[FAIL] divergence fixture must keep the latest published tag off release" >&2
  exit 1
fi

env -u GH_TOKEN -u GITHUB_TOKEN GITHUB_REPOSITORY=example/repo \
  node "$RANGE_FIXTURE/scripts/prepare-release.mjs" --dry-run > "$TEST_DIR/diverged-release.json"
assert_contains "$TEST_DIR/diverged-release.json" "\"baseTag\": \"$CURRENT_TAG\"" 'release calculation selects the latest published tag on main when release has diverged'
assert_contains "$TEST_DIR/diverged-release.json" '"commits": 1' 'release calculation counts only commits after the shared release baseline'
assert_contains "$TEST_DIR/diverged-release.json" "\"nextVersion\": \"$NEXT_PATCH_VERSION\"" 'a post-release fix calculates the next patch version'
echo '[PASS] release preparation uses the published main baseline across branch divergence'

MISMATCH_FIXTURE="$TEST_DIR/mismatched-release-repo"
git clone -q "$REPO_ROOT" "$MISMATCH_FIXTURE"
cp "$REPO_ROOT/scripts/prepare-release.mjs" "$MISMATCH_FIXTURE/scripts/prepare-release.mjs"
cp "$REPO_ROOT/scripts/conventional-commit.mjs" "$MISMATCH_FIXTURE/scripts/conventional-commit.mjs"
MISMATCH_BASE="$(git -C "$MISMATCH_FIXTURE" rev-parse HEAD)"
git -C "$MISMATCH_FIXTURE" tag -f -a v0.0.1 "$MISMATCH_BASE" -m "go-beast baseline" >/dev/null
git -C "$MISMATCH_FIXTURE" switch -q -C main "$MISMATCH_BASE"
git -C "$MISMATCH_FIXTURE" commit --allow-empty -q -m "chore(release): publish $CURRENT_TAG"
MISMATCH_MAIN="$(git -C "$MISMATCH_FIXTURE" rev-parse HEAD)"
git -C "$MISMATCH_FIXTURE" tag -f -a "$CURRENT_TAG" "$MISMATCH_MAIN" -m "go-beast $CURRENT_VERSION" >/dev/null
git -C "$MISMATCH_FIXTURE" update-ref refs/remotes/origin/main "$MISMATCH_MAIN"
git -C "$MISMATCH_FIXTURE" switch -q -C release "$MISMATCH_BASE"
node --input-type=module -e 'import fs from "node:fs"; const file=process.argv[1]; const version=process.argv[2]; const pkg=JSON.parse(fs.readFileSync(file,"utf8")); pkg.version=version; fs.writeFileSync(file,`${JSON.stringify(pkg,null,2)}\n`)' "$MISMATCH_FIXTURE/package.json" "$NEXT_PATCH_VERSION"
if env -u GH_TOKEN -u GITHUB_TOKEN GITHUB_REPOSITORY=example/repo \
  node "$MISMATCH_FIXTURE/scripts/prepare-release.mjs" --dry-run > "$TEST_DIR/mismatch.out" 2>&1; then
  echo '[FAIL] release preparation rejects a package version that differs from the latest main tag'
  exit 1
fi
assert_contains "$TEST_DIR/mismatch.out" "Latest release tag $CURRENT_TAG does not match package version $NEXT_PATCH_VERSION" 'release preparation explains a stale package release version'
echo '[PASS] release preparation rejects a package version that differs from the latest main tag'
