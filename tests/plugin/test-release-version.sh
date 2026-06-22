#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

setup_release_repo() {
  local dir="$1"
  mkdir -p "$dir/scripts" "$dir/plugins/go-beast/.codex-plugin" "$dir/plugins/go-beast/.claude-plugin"
  cp "$REPO_ROOT/scripts/release-version.mjs" "$dir/scripts/release-version.mjs"

  cat > "$dir/package.json" <<'JSON'
{
  "name": "go-beast",
  "version": "1.2.3"
}
JSON

  cat > "$dir/README.md" <<'MD'
# go-beast

**Version 1.2.3** · [Changelog](CHANGELOG.md)
MD

  cat > "$dir/PACKAGE.md" <<'MD'
# go-beast — Package Manifest

```
name:    go-beast
version: 1.2.3
date:    2026-06-18
author:  MarcosAlves90
```
MD

  cat > "$dir/CHANGELOG.md" <<'MD'
# Changelog

## [Unreleased]

### Added

- New release command.

## [1.2.3] - 2026-06-18

### Fixed

- Previous release note.
MD

  cat > "$dir/plugins/go-beast/.codex-plugin/plugin.json" <<'JSON'
{
  "name": "go-beast",
  "version": "1.2.3"
}
JSON

  cat > "$dir/plugins/go-beast/.claude-plugin/plugin.json" <<'JSON'
{
  "name": "go-beast",
  "version": "1.2.3"
}
JSON

  git -C "$dir" init -q
  git -C "$dir" config user.name "Test User"
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" add .
  git -C "$dir" commit -q -m "chore(repo): base state"
}

setup_fake_gh() {
  local dir="$1"
  mkdir -p "$dir/bin" "$dir/gh-state/releases"
  cat > "$dir/bin/gh" <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${GH_FAKE_LOG:?missing GH_FAKE_LOG}"
STATE_DIR="${GH_FAKE_STATE_DIR:?missing GH_FAKE_STATE_DIR}"

printf '%s\n' "$*" >> "$LOG_FILE"

mark_published() {
  local release_dir="$1"
  rm -f "$release_dir/draft"
  printf '2026-06-19T00:00:00Z\n' > "$release_dir/publishedAt"
}

case "$1 $2 $3" in
  "release view "*)
    tag="${3:-}"
    if [[ -f "$STATE_DIR/releases/$tag/release-created" ]]; then
      if [[ "${4:-}" == "--json" ]]; then
        if [[ -f "$STATE_DIR/releases/$tag/draft" ]]; then
          is_draft=true
          published_at=null
        else
          is_draft=false
          if [[ -f "$STATE_DIR/releases/$tag/publishedAt" ]]; then
            published_at="\"$(cat "$STATE_DIR/releases/$tag/publishedAt")\""
          else
            published_at=null
          fi
        fi
        if [[ "${5:-}" == "isDraft,publishedAt" ]]; then
          printf '{"isDraft":%s,"publishedAt":%s}\n' "$is_draft" "$published_at"
        elif [[ "${5:-}" == "isDraft" ]]; then
          printf '{"isDraft":%s}\n' "$is_draft"
        else
          printf '{"tagName":"%s"}\n' "$tag"
        fi
      else
        printf '{"tagName":"%s"}\n' "$tag"
      fi
      exit 0
    fi
    exit 1
    ;;
  "workflow run "*)
    workflow_file="${3:-}"
    shift 3
    tag=""
    while (($# > 0)); do
      case "$1" in
        -f|--field|--raw-field)
          case "$2" in
            tag_name=*)
              tag="${2#tag_name=}"
              ;;
          esac
          shift 2
          ;;
        --ref)
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done
    if [[ "$workflow_file" == "release-finalize.yml" && -n "$tag" ]]; then
      release_dir="$STATE_DIR/releases/$tag"
      mkdir -p "$release_dir"
      touch "$release_dir/release-certificate.sigstore.json"
      mark_published "$release_dir"
    fi
    ;;
  "release edit "*)
    tag="${3:-}"
    if [[ -f "$STATE_DIR/releases/$tag/release-created" ]]; then
      release_dir="$STATE_DIR/releases/$tag"
      mark_published "$release_dir"
      exit 0
    fi
    exit 1
    ;;
  "release create "*)
    tag="$3"
    shift 3
    release_dir="$STATE_DIR/releases/$tag"
    mkdir -p "$release_dir"
    while (($# > 0)); do
      case "$1" in
        --draft)
          touch "$release_dir/draft"
          shift
          ;;
        --title)
          printf '%s\n' "$2" > "$release_dir/title.txt"
          shift 2
          ;;
        --notes-file)
          cp "$2" "$release_dir/notes.md"
          shift 2
          ;;
        --*)
          shift
          ;;
        *)
          shift
          ;;
      esac
    done
    touch "$release_dir/release-created"
    ;;
  "release upload "*)
    tag="$3"
    shift 3
    release_dir="$STATE_DIR/releases/$tag"
    mkdir -p "$release_dir"
    while (($# > 0)); do
      case "$1" in
        --clobber)
          shift
          ;;
        --*)
          shift
          ;;
        *)
          cp "$1" "$release_dir/$(basename "$1")"
          shift
          ;;
      esac
    done
    touch "$release_dir/release-created"
    ;;
  *)
    exit 0
    ;;
esac
BASH
  chmod +x "$dir/bin/gh"
}

TEST_REPO="$(mktemp -d)"
NEGATIVE_REPO="$(mktemp -d)"
FAKE_GH_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TEST_REPO" "$NEGATIVE_REPO"
  rm -rf "$FAKE_GH_ROOT"
}
trap cleanup EXIT

setup_release_repo "$TEST_REPO"
setup_fake_gh "$FAKE_GH_ROOT"

pushd "$TEST_REPO" >/dev/null

node scripts/release-version.mjs check > /tmp/go-beast-release-check.json
assert_contains /tmp/go-beast-release-check.json '"ok": true' "release-version check passes for consistent version surfaces"

node scripts/release-version.mjs release --bump minor --date 2026-06-19 > /tmp/go-beast-release-apply.json
assert_contains /tmp/go-beast-release-apply.json '"releasedVersion": "1.3.0"' "release-version release reports the new version"
assert_contains "$TEST_REPO/package.json" '"version": "1.3.0"' "release-version updates package.json"
assert_contains "$TEST_REPO/README.md" '\*\*Version 1.3.0\*\*' "release-version updates README.md"
assert_contains "$TEST_REPO/PACKAGE.md" 'version: 1.3.0' "release-version updates PACKAGE.md"
assert_contains "$TEST_REPO/PACKAGE.md" 'date:    2026-06-19' "release-version updates PACKAGE.md date"
assert_contains "$TEST_REPO/CHANGELOG.md" '## \[1.3.0\] - 2026-06-19' "release-version cuts a new changelog release section"
assert_contains "$TEST_REPO/plugins/go-beast/.codex-plugin/plugin.json" '"version": "1.3.0"' "release-version updates Codex plugin manifest"
assert_contains "$TEST_REPO/plugins/go-beast/.claude-plugin/plugin.json" '"version": "1.3.0"' "release-version updates Claude plugin manifest"
assert_contains "$TEST_REPO/release-certificate.json" '"tag": "v1.3.0"' "release-version writes a release certificate"

node scripts/release-version.mjs check > /tmp/go-beast-release-check-after.json
assert_contains /tmp/go-beast-release-check-after.json '"canonicalVersion": "1.3.0"' "release-version check sees the bumped canonical version"
assert_contains /tmp/go-beast-release-check-after.json '"unreleasedHasContent": false' "release-version check sees an empty [Unreleased] section after release"

git add package.json README.md PACKAGE.md CHANGELOG.md release-certificate.json plugins/go-beast/.codex-plugin/plugin.json plugins/go-beast/.claude-plugin/plugin.json
git commit -q -m "chore(release): bump version to 1.3.0"

export GH_BIN="$FAKE_GH_ROOT/bin/gh"
export GH_FAKE_LOG="$FAKE_GH_ROOT/gh.log"
export GH_FAKE_STATE_DIR="$FAKE_GH_ROOT/gh-state"

node scripts/release-version.mjs publish > /tmp/go-beast-release-publish.json
assert_contains /tmp/go-beast-release-publish.json '"status": "published"' "release-version publish publishes the GitHub release"
assert_contains /tmp/go-beast-release-publish.json '"tagStatus": "created"' "release-version publish creates a git tag"
git tag --list v1.3.0 > /tmp/go-beast-release-tag.out
assert_contains /tmp/go-beast-release-tag.out '^v1\.3\.0$' "release-version publish creates the annotated tag"

if [[ ! -e "$FAKE_GH_ROOT/gh-state/releases/v1.3.0/publishedAt" ]]; then
  echo "[FAIL] release-version finalizes the release"
  exit 1
fi
echo "[PASS] release-version finalizes the release"
assert_contains "$FAKE_GH_ROOT/gh-state/releases/v1.3.0/notes.md" 'New release command\.' "release-version writes release notes"
if [[ ! -e "$FAKE_GH_ROOT/gh-state/releases/v1.3.0/release-certificate.sigstore.json" ]]; then
  echo "[FAIL] release-version publish should upload the attestation bundle during finalize"
  exit 1
fi
echo "[PASS] release-version publish uploads the attestation bundle during finalize"

node scripts/release-version.mjs publish > /tmp/go-beast-release-publish-update.json
assert_contains /tmp/go-beast-release-publish-update.json '"status": "already-exists"' "release-version publish no-ops when the release already exists"
assert_contains "$FAKE_GH_ROOT/gh.log" 'release create v1.3.0' "release-version publish used create on the first run"
assert_contains "$FAKE_GH_ROOT/gh.log" 'workflow run release-finalize.yml' "release-version publish dispatches the finalize workflow"

python3 - <<'PY'
from pathlib import Path
text = Path("CHANGELOG.md").read_text()
unreleased_index = text.index("## [Unreleased]")
release_index = text.index("## [1.3.0] - 2026-06-19")
assert unreleased_index < release_index, "Unreleased must stay above the latest release"
PY
echo "[PASS] release-version preserves [Unreleased] above the latest release"

popd >/dev/null

setup_release_repo "$NEGATIVE_REPO"
printf '# go-beast\n\nVersion 1.2.3\n' > "$NEGATIVE_REPO/README.md"

set +e
pushd "$NEGATIVE_REPO" >/dev/null
node scripts/release-version.mjs release --bump patch --date 2026-06-20 > /tmp/go-beast-release-apply-fail.out 2>&1
EXIT_CODE=$?
popd >/dev/null
set -e

if [[ "$EXIT_CODE" -eq 0 ]]; then
  echo "[FAIL] release-version release fails when README marker is missing"
  exit 1
fi
echo "[PASS] release-version release fails when README marker is missing"
assert_contains /tmp/go-beast-release-apply-fail.out 'README.md does not contain the expected release-version marker' "release-version reports missing README marker clearly"

echo "STATUS: PASSED"
