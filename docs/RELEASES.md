# Release trains

Release preparation is manual. Ordinary pull requests should not edit
`package.json`, version markers, or released changelog sections. When a
maintainer decides that `main` is ready, use the GitHub Actions **Prepare
Release** workflow with `workflow_dispatch`.

## Prepare a release

1. Open **Actions → Prepare Release → Run workflow** against `main`.
2. Leave `version` empty for automatic SemVer calculation, or enter an explicit
   `x.y.z` override.
3. Review the generated `release/next` pull request, especially the version and
   `CHANGELOG.md` grouping.
4. Merge the release PR after review.

The workflow considers commits since the latest `v<major>.<minor>.<patch>` tag.
Conventional Commit types determine both the SemVer bump and the changelog
section:

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

The workflow is idempotent: rerunning it refreshes the same `release/next`
branch and open release PR instead of creating duplicates.

## Publish after merge

After the release PR is merged, use the existing publication flow from a clean
checkout of `main`:

```bash
npm run release:version:check
npm run release:version:publish
```

Publication still creates the annotated tag and draft GitHub Release, dispatches
`release-finalize.yml`, uploads the attestation bundle, and publishes the
release. Scheduled weekly preparation is intentionally deferred until that
cadence is adopted by maintainers.
