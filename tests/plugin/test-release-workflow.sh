#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

python3 - "$REPO_ROOT" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
prepare = (root / ".github/workflows/prepare-release.yml").read_text()
verify = (root / ".github/workflows/verify.yml").read_text()
docs = " ".join((root / "docs/RELEASES.md").read_text().lower().split())
promote_path = root / ".github/workflows/release-promote.yml"
publish_path = root / ".github/workflows/release-publish.yml"


def require(condition, message):
    if not condition:
        print(f"[FAIL] {message}")
        raise SystemExit(1)
    print(f"[PASS] {message}")


require("gh pr create --base main" not in prepare, "preparation workflow does not create promotion PR early")
require("gh workflow run verify.yml" not in prepare and "gh run watch" not in prepare, "preparation does not treat dispatched Verify as required PR validation")
require("GITHUB_REF" in prepare and "refs/heads/release" in prepare, "preparation fails closed unless dispatched against release")
generate_start = prepare.find("  generate:")
write_start = prepare.find("  write:")
generate_job = prepare[generate_start:write_start] if 0 <= generate_start < write_start else ""
write_job = prepare[write_start:] if write_start >= 0 else ""
require("contents: read" in generate_job and "pull-requests: read" in generate_job and "contents: write" not in generate_job and "GH_TOKEN: ${{ github.token }}" in generate_job, "release generation runs with read-only repository permissions")
require("contents: write" in write_job and "pull-requests: write" in write_job and "npm run verify" not in write_job, "only the release PR-writing job receives write permissions")
require("upload-artifact@v4" in generate_job and "download-artifact@v4" in write_job, "generated surfaces cross into the write job as an artifact")
require(promote_path.is_file(), "promotion workflow exists")
if promote_path.is_file():
    promote = promote_path.read_text()
    require("pull_request:" in promote and "- closed" in promote and "- release" in promote, "promotion workflow runs on closed PRs targeting release")
    require("github.event.pull_request.merged == true" in promote and "chore/release-prepare" in promote, "promotion requires a merged preparation PR")
    require("git diff --quiet origin/main...origin/release" in promote, "empty promotion diff is a successful no-op")
    require("gh pr update-branch" in promote, "promotion PR branch is updated when main is ahead")
    require("Protected release branch update was rejected" in promote and "main-to-release sync PR" in promote and "rerun this promotion workflow" in promote, "protected branch update failure has a reviewed recovery path")
    require("gh workflow run verify.yml" not in promote and "gh run watch" not in promote, "promotion relies on normal PR checks, not dispatch checks")
require(publish_path.is_file(), "automatic publication workflow exists")
if publish_path.is_file():
    publish = publish_path.read_text()
    require("- main" in publish and "github.event.pull_request.merged == true" in publish, "publication is restricted to merged PRs targeting main")
    require("head.ref == 'release'" in publish and "head.repo.full_name == github.repository" in publish, "publication accepts only the repository's release branch")
    require("startsWith(github.event.pull_request.title, 'chore(release): promote v')" in publish, "publication ignores non-release promotions")
    require("github.event.pull_request.merge_commit_sha" in publish, "publication checks out the merged main commit")
    require("PROMOTION_HEAD_SHA: ${{ github.event.pull_request.head.sha }}" in publish and "git merge-base --is-ancestor" in publish, "publication requires a merge commit that preserves release ancestry")
    require("npm run release:version:check" in publish and "npm run verify" in publish and "npm run release:version:publish" in publish, "publication validates before tagging and finalizing")
    require("pull_request_target" not in publish, "publication does not execute with pull_request_target privileges")
require("pull_request:" in verify and "workflow_dispatch:" not in verify and "- edited" in verify, "Verify required contexts originate from pull_request events and revalidate edits")
require("name: Validate pull request title" in verify and "name: Enforce branch flow" in verify and "  verify:" in verify, "Verify defines all required PR check jobs")
require("REPOSITORY: ${{ github.repository }}" in verify and '"$HEAD_REPO" = "$REPOSITORY"' in verify, "release-to-main branch flow verifies the repository identity")
require("workflow_dispatch checks do not satisfy required status checks" in docs.lower() and "approval-required" in docs.lower(), "release docs distinguish dispatched checks from the GITHUB_TOKEN approval gate")
require("merge commit" in docs and "squash or rebase" in docs, "release docs require a merge commit for promotion ancestry")
require("if gh pr update-branch is rejected" in docs and "main` → `release` synchronization pr" in docs, "release docs describe the protected-branch synchronization fallback")
PY

ruby -e 'require "yaml"; ARGV.each { |path| YAML.load_file(path) }' \
  "$REPO_ROOT/.github/workflows/prepare-release.yml" \
  "$REPO_ROOT/.github/workflows/verify.yml" \
  "$REPO_ROOT/.github/workflows/release-promote.yml" \
  "$REPO_ROOT/.github/workflows/release-publish.yml"
echo '[PASS] release workflow YAML parses'