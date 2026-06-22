# Repo-Free Install Approach

## Requirements summary
- Install go-beast without cloning the repository locally first.
- Keep the canonical `skills/` directory as the source of truth.
- Preserve the current checkout-based installer for maintainers and contributors.
- Keep the install path cross-platform and reproducible.
- Avoid a distribution mechanism that is harder to maintain than the current flow.

## Approaches considered

### 1. Release source archive bootstrap
Download the GitHub release source archive for a tagged version, extract it to a temporary directory, and run the existing installer from that extracted tree. The archive acts as the transport layer; the extracted files remain the same canonical repository layout, so the current installer logic can stay mostly intact.

Trade-offs:
- Optimizes for the smallest change to the existing install model.
- Reuses the current `skills/`, hooks, and docs layout.
- Depends on release archive availability and extraction support.
- Still couples installation to release publication, but not to a local clone.

### 2. Dedicated install bundle release asset
Publish a separate install bundle as a release asset containing only the files required for installation: canonical skills, hook scripts, installer metadata, and any bootstrap docs. The installer downloads that bundle directly and installs from it instead of from the source archive.

Trade-offs:
- Optimizes for a smaller, purpose-built distribution payload.
- Avoids shipping the full repo contents to end users.
- Requires a new bundle build step and asset format.
- Higher maintenance cost because the bundle becomes another release surface.

### 3. npm-distributed installer package
Publish a minimal npm package or `npx`-runnable installer that fetches the release artifacts and installs them into the selected target locations. The package would serve as the entry point, while the repository remains the canonical source and release publisher.

Trade-offs:
- Optimizes for easy one-command installation.
- Makes installation accessible without asking users to touch the repo at all.
- Adds a second distribution channel and a separate package lifecycle.
- Risks diverging behavior between npm distribution and repo releases.

## Evaluation

| Approach | Simplicity | Scalability | Dev speed | Operational cost | Fit to constraints |
|---|---|---|---|---|---|
| Release source archive bootstrap | ✓✓ | ✓ | ✓✓ | ✓✓ | ✓✓ |
| Dedicated install bundle release asset | ✓ | ✓✓ | ✓ | ✓ | ✓ |
| npm-distributed installer package | ✓ | ✓✓ | ✓ | ✗ | ✓ |

### Selected approach
**Selected:** Release source archive bootstrap

**Rationale:** The release source archive already exists for every tagged release, so it provides a repo-free transport layer without introducing a second build artifact or a new packaging pipeline. It keeps the canonical repository layout intact, preserves the current checkout-based workflow for maintainers, and lets the bootstrap wrapper either consume a pre-downloaded archive or fetch the published archive directly before extracting it into a persistent cache under `~/.go-beast/source/`. The main trade-off is that the installer still expects a canonical tree after extraction, but that is acceptable because the archive already contains that tree.

**Key risk:** Extraction and temporary-directory handling need to be cross-platform and robust enough not to become a second source of install failures.

**Deferred:** Whether to add checksum verification for archive integrity; whether to publish a dedicated install asset later.

## Deferred decisions
- Integrity verification for the archive payload.
- Whether a dedicated install asset is warranted later for size or speed.
