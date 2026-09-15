# Release trains

Release preparation is manual. Ordinary pull requests should not edit
`package.json`, version markers, or released changelog sections. Feature work
is integrated into the permanent `release` branch; when that branch is ready,
use the GitHub Actions **Prepare Release** workflow with `workflow_dispatch`.

## Prepare a release

1. Open **Actions → Prepare Release → Run workflow** against `release`.
2. Leave `version` empty for automatic SemVer calculation, or enter an explicit
   `x.y.z` override.
3. Review and merge the generated `release/prepare` → `release` pull request,
   especially the version and `CHANGELOG.md` grouping.
4. Review and merge the generated `release` → `main` promotion pull request.
5. Keep `release` for the next integration cycle; it is never deleted.

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

The workflow is idempotent: rerunning it refreshes the same `release/prepare`
branch, preparation PR, and promotion PR instead of creating duplicates.

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
