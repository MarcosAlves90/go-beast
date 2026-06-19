#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TEST_REPO="$(mktemp -d)"
cleanup() {
  rm -rf "$TEST_REPO"
}
trap cleanup EXIT

mkdir -p "$TEST_REPO/scripts"
mkdir -p "$TEST_REPO/plugins/go-beast/.codex-plugin" "$TEST_REPO/plugins/go-beast/.claude-plugin"
cp "$REPO_ROOT/scripts/release-version.mjs" "$TEST_REPO/scripts/release-version.mjs"

cat > "$TEST_REPO/package.json" <<'JSON'
{
  "name": "go-beast",
  "version": "1.2.3"
}
JSON

cat > "$TEST_REPO/README.md" <<'MD'
# go-beast

**Version 1.2.3** · [Changelog](CHANGELOG.md)
MD

cat > "$TEST_REPO/PACKAGE.md" <<'MD'
# go-beast — Package Manifest

```
name:    go-beast
version: 1.2.3
date:    2026-06-18
author:  @cherry-c
```
MD

cat > "$TEST_REPO/CHANGELOG.md" <<'MD'
# Changelog

## [Unreleased]

### Added

- New release command.

## [1.2.3] - 2026-06-18

### Fixed

- Previous release note.
MD

cat > "$TEST_REPO/plugins/go-beast/.codex-plugin/plugin.json" <<'JSON'
{
  "name": "go-beast",
  "version": "1.2.3"
}
JSON

cat > "$TEST_REPO/plugins/go-beast/.claude-plugin/plugin.json" <<'JSON'
{
  "name": "go-beast",
  "version": "1.2.3"
}
JSON

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

node scripts/release-version.mjs check > /tmp/go-beast-release-check-after.json
assert_contains /tmp/go-beast-release-check-after.json '"canonicalVersion": "1.3.0"' "release-version check sees the bumped canonical version"

python3 - <<'PY'
from pathlib import Path
text = Path("CHANGELOG.md").read_text()
unreleased_index = text.index("## [Unreleased]")
release_index = text.index("## [1.3.0] - 2026-06-19")
assert unreleased_index < release_index, "Unreleased must stay above the latest release"
PY
echo "[PASS] release-version preserves [Unreleased] above the latest release"

cat > "$TEST_REPO/README.md" <<'MD'
# go-beast

**Version 9.9.9** · [Changelog](CHANGELOG.md)
MD

set +e
node scripts/release-version.mjs check > /tmp/go-beast-release-check-fail.out 2>&1
EXIT_CODE=$?
set -e

if [[ "$EXIT_CODE" -eq 0 ]]; then
  echo "[FAIL] release-version check fails on version drift"
  exit 1
fi
echo "[PASS] release-version check fails on version drift"
assert_contains /tmp/go-beast-release-check-fail.out 'does not match package.json' "release-version reports drift clearly"

cat > "$TEST_REPO/README.md" <<'MD'
# go-beast

Version 1.3.0
MD

cat > "$TEST_REPO/CHANGELOG.md" <<'MD'
# Changelog

## [Unreleased]

### Changed

- Another release candidate.

## [1.3.0] - 2026-06-19

### Added

- New release command.
MD

set +e
node scripts/release-version.mjs release --bump patch --date 2026-06-20 > /tmp/go-beast-release-apply-fail.out 2>&1
EXIT_CODE=$?
set -e

if [[ "$EXIT_CODE" -eq 0 ]]; then
  echo "[FAIL] release-version release fails when README marker is missing"
  exit 1
fi
echo "[PASS] release-version release fails when README marker is missing"
assert_contains /tmp/go-beast-release-apply-fail.out 'README.md does not contain the expected release-version marker' "release-version reports missing README marker clearly"

popd >/dev/null
echo "STATUS: PASSED"
