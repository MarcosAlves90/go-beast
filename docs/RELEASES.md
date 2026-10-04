# Release trains

Release preparation is manual. Ordinary pull requests should not edit
`package.json`, version markers, or released changelog sections. Feature work
is integrated into the permanent `release` branch; maintainers start a release
through the GitHub Actions **Prepare Release** workflow.

## Prepare and promote

1. Open **Actions → Prepare Release → Run workflow** against `release`.
2. Leave `version` empty for automatic SemVer calculation, or enter an explicit
   `x.y.z` override.
3. Review the generated `chore/release-prepare` → `release` PR, especially the
   calculated version, certificate, and `CHANGELOG.md`. If its normal Verify run
   is awaiting approval, approve it in GitHub; merge only after its required
   contexts pass.
4. Merging the preparation PR triggers **Promote Release**. It creates or
   updates the `release` → `main` promotion PR only after preparation has
   merged. If main is ahead, it asks GitHub to update the protected release
   head; if the ruleset rejects that update, the workflow fails closed and
   reports the reviewed synchronization fallback. If there is no promotion
   diff, the workflow records a successful no-op instead of creating an empty
   PR.
5. Review the promotion PR and its normal Verify contexts; approve any pending
   workflow run in GitHub, then merge only after required checks pass. Use a
   merge commit, not squash or rebase, so the promoted release head remains an
   ancestor of the tag commit. Neither PR is auto-merged or exempted from branch
   protection.
6. The promotion merge triggers **Publish Release** on the merged `main` commit.
   It runs `release:version:check` and `npm run verify`, creates/pushes the
   annotated tag and draft GitHub Release, dispatches `release-finalize.yml`,
   and waits for the public release and attestation asset. Routine releases do
   not require a local publish command.
7. Keep `release` for the next integration cycle; it is never deleted.

GitHub rulesets require the `verify`, `Validate pull request title`, and
`Enforce branch flow` contexts. These required contexts come from the normal
`pull_request` event; workflow_dispatch checks do not satisfy required status
checks. The release workflows create or update PRs with `GITHUB_TOKEN`, so
GitHub places the resulting PR workflow runs in an approval-required state. A
user with write access must approve each pending run in the PR before those
checks can complete. The preparation/promotion workflow's own success means
only that the PR was created or updated; it is not evidence that PR checks
passed. Never merge while required contexts are pending.

Approving an Actions run is separate from approving the pull request itself.
The active ruleset also requires approval of the latest push by someone other
than the pusher, even though its ordinary approval count is zero. A reviewer
must approve the bot's last push; if a maintainer pushes a manual correction,
another authorized reviewer must approve that new push.

## Release baseline and SemVer

The latest release tag is selected from the history reachable from
`origin/main`, not from tags reachable only on the `release` checkout. The
package version must match that tag. Unreleased commits are those after the
merge-base of the tag and the current `release` HEAD. This preserves the
promoted-main tag target and works when a release tag is not itself an ancestor
of `release`; no separate merge-back PR is required just to make the tag
reachable. Fetch `origin/main` and its tags before running a local dry run.

If the latest tag cannot be found on `origin/main`, no merge-base exists, or
the package version differs from the tag, preparation fails closed. Finish or
repair the pending release rather than calculating against an older tag.

Conventional Commit types determine both the SemVer bump and changelog section:

| Conventional Commit | Default bump | Changelog section |
|---|---|---|
| `feat` | minor | Added |
| `fix` | patch | Fixed |
| `!` or `BREAKING CHANGE` | major | type-derived section |
| `docs`, `ci`, `chore`, `refactor`, `perf`, `test`, `build`, `style` | patch | Changed |

Pull request labels can override these defaults:

- `release:major`, `release:minor`, or `release:patch` overrides the bump;
- `changelog:added`, `changelog:changed`, `changelog:fixed`,
  `changelog:removed`, or `changelog:security` overrides the section.

## Idempotency and recovery

- Preparation reruns refresh the same `chore/release-prepare` branch and PR.
  The branch is force-updated, so do not rerun after manually correcting
  generated notes; commit the correction to the existing preparation branch.
- Promotion runs update the existing `release` → `main` PR rather than creating
  duplicates. If gh pr update-branch is rejected because the release head is
  protected, do not bypass rules: create a reviewed `main` → `release`
  synchronization PR, merge it with a merge commit, then rerun the failed
  promotion workflow. This contingency adds one human merge only when the
  server-side update is refused.
- Publication retries re-finalize an existing draft release and wait for the
  attestation bundle. An already-public release is accepted only if its
  publication metadata and `release-certificate.sigstore.json` asset exist.
  A public release missing that evidence fails closed.
- Approval of PR-event workflows is not a one-time rollout step: each
  bot-created or bot-updated PR run may require a user with write access to
  approve it. A workflow_dispatch run is not a substitute for the required PR
  contexts.
- The promotion PR must use a merge commit. The publish workflow fails closed
  after squash/rebase because those methods do not preserve the release head as
  an ancestor of the tagged `main` commit.

The local `npm run release:version:publish` command remains available for
controlled recovery, but it is not part of the routine release train.
Scheduled weekly preparation is intentionally deferred until that cadence is
adopted by maintainers.