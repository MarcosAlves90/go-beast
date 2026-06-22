# Changelog

All notable changes to the go-beast skill pack are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- `workflows/go-skill-eval.js`, `workflows/go-hook-eval.js`, `workflows/go-workflow-eval.js` — all three eval workflows now emit a structured JSON output file per run to `~/.claude/workflows/{name}/results/` in addition to the existing Markdown report. The file uses a shared envelope schema (`schema_version`, `workflow`, `run_id`, `timestamp`, `summary`, `inputs`, `meta`, `detail`) with a typed `detail.runs` block per workflow type, optimized for agent consumption. Last 10 runs are retained automatically.
- `scripts/eval-output.mjs` — added a shared Markdown writer for eval reports, removed the agent-mediated report-writing step from the three eval workflows, and made the retention default explicit via `DEFAULT_EVAL_KEEP_RUNS`.

### Changed

- `scripts/eval-output.mjs` and the three eval workflows — factored the JSON write path into a shared deterministic helper that writes the envelope directly, validates the saved file, aligns `run_id` with the documented `{workflow-name}-{YYYYMMDD-HHmmss}` pattern, and makes retention configurable via `EVAL_KEEP_RUNS`.

- `docs/architecture/` — task-scoped go-fox outputs (`ADR.md`, `STACK.md`, `DIAGRAM.md`, `CONTRACTS.md`) moved to `docs/architecture/task-artifacts/` to separate them from permanent architecture docs. Updated references in `AGENTS.md`, `PACKAGE.md`, and skills `go-fox`, `go-kite`, `go-otter`, `go-snipe`.

## [1.40.0] - 2026-06-21

### Added

- `skills/go-snipe/` — new beast for behavioral specification (ATDD/BDD). Translates approved contracts and functional requirements into BDD scenarios (Given/When/Then), an acceptance test skeleton, and `SPEC.md` — a hard prerequisite for go-wolf and go-lynx before implementation begins.
- `README.md`, `PACKAGE.md` — updated pipeline diagram and skill tables to include go-snipe at `[go-snipe]` position between go-beaver and go-wolf/go-lynx.
- `workflows/go-skill-eval.js` — added go-snipe checklist and skillOverrides eval scenario.

### Changed

- **`skills/go-wolf/SKILL.md`** (v1.1.0 → v1.3.0): added `SPEC.md` from go-snipe as an explicit prerequisite and a hard TDD rule — implementation must not begin before the corresponding failing stub exists and is confirmed red.
- **`skills/go-lynx/SKILL.md`** (v1.1.0 → v1.3.0): added `SPEC.md` from go-snipe as an explicit prerequisite and a hard TDD rule — component implementation must not begin before the corresponding failing stub exists and is confirmed red.

## [1.39.0] - 2026-06-19

### Added

- `.github/workflows/release-finalize.yml` — finalizes draft releases by uploading `release-certificate.sigstore.json` and then publishing the immutable release so GitHub generates the real release attestation.

### Changed

- `CONTRIBUTING.md`, `README.md`, and `docs/architecture/RELEASE_VERSIONING_APPROACH.md` — clarified the draft-release finalization flow, the immutable release attestation, and the `release-certificate.sigstore.json` asset.
- `hooks/go-beast-drift-lib.sh`, `hooks/go-beast-stop-reanchor.sh`, `hooks/go-beast-user-prompt-context.sh`, and `hooks/manifest.json` — added task-state tracking so a completed task stops re-triggering bootstrap re-anchor loops while a new prompt that names a `go-*` beast reopens the same session as an active task across Claude Code and Codex.
- `docs/architecture/CONTRACTS.md` — documented `task_state` and the distinction between completing a task and ending a session.

### Fixed

- `hooks/git-strip-coauthored.sh` — now extracts and inspects the `tool_input.command` field from malformed hook payloads instead of scanning the entire raw JSON blob, which avoids false positives outside the actual commit command while still blocking `Co-Authored-By` trailers in heredoc and file-based commit messages. Also fixed detection when git is invoked with flags between the binary and subcommand (e.g. `git -C /path commit`), which previously bypassed the Co-Authored-By check entirely.
- `tests/plugin/test-git-strip-coauthored.sh` and `workflows/go-hook-eval.js` — added regression coverage for malformed payloads that carry `Co-Authored-By` text outside the commit command.
- `hooks/sync-go-beast-skills.sh` — now resolves its real repository path when executed through `~/.claude/hooks` or `~/.codex/hooks` symlinks, preventing SessionStart failures that looked for `scripts/hook-wire.mjs` under the agent config directory.
- `tests/plugin/test-go-beast-drift-hooks.sh`, `tests/claude-code/test-hook-wire.sh`, and `workflows/go-hook-eval.js` — added regression coverage for completing an active anti-drift task, reopening task state from a new prompt in the same session, and wiring the prompt re-anchor hook for Claude Code.

## [1.38.0] - 2026-06-19

### Added

- `.github/workflows/release-attestation.yml` — added a GitHub Actions attestation workflow that publishes a real GitHub attestation for `release-certificate.json` when a release is published, with a manual backfill path for older tags.

## [1.37.0] - 2026-06-19

### Added

- `scripts/release-version.mjs` now uploads `release-certificate.json` and `release-certificate.json.sha256` as GitHub Release assets during `publish`, and supports `GH_BIN` so publish can run through a configured GitHub CLI binary.

## [1.36.0] - 2026-06-19

### Added

- `scripts/release-version.mjs` now produces a `release-certificate.json` release attestation and exposes a `publish` mode that creates annotated git tags for released versions.

### Changed

- `PACKAGE.md` now identifies `MarcosAlves90` as the author.
- `README.md`, `CONTRIBUTING.md`, and `hooks/version-bump-remind.sh` now describe the tag-plus-certificate release workflow.

## [1.35.0] - 2026-06-19

### Added

- `scripts/release-version.mjs` plus `package.json` scripts and `tests/plugin/test-release-version.sh` — added a canonical release/versioning contract with `check` and `release` modes so `package.json` drives version sync across `README.md`, `PACKAGE.md`, and the latest released section of `CHANGELOG.md`.

### Changed

- `CONTRIBUTING.md`, `README.md`, `PACKAGE.md`, and `hooks/version-bump-remind.sh` — updated maintainer guidance and the reminder hook to treat `package.json` as the canonical release version and point maintainers at the new release-version workflow.

## [1.34.0] - 2026-06-19

### Fixed

- `hooks/git-strip-coauthored.sh` — now inspects commit message files passed via `git commit -F <path>` or `--file=<path>` so `Co-Authored-By` trailers are blocked even when the message is not inlined in the shell command.
- `workflows/go-hook-eval.js` — added coverage for `git-strip-coauthored.sh` when the commit message comes from a file.
- `scripts/hook-wire.mjs` and `scripts/install.mjs` — reinstallation now removes and rewires go-beast-managed hook symlinks and hook-config entries for the selected hooks before adding them back, while preserving hooks that were never managed by go-beast.
- `tests/plugin/test-hook-wire.sh` — added regression coverage for the reinstall case: refresh previously wired go-beast hooks and preserve external hook entries.
- `AGENTS.global.md`, `AGENTS.bootstrap.md`, and `AGENTS.md` — added session-wide context-retention and anti-drift rules so workflow state, beast gates, and enforcement posture are explicitly re-anchored instead of being left implicit.

### Added

- `tests/codex/test-hook-wire.sh` and `tests/claude-code/test-hook-wire.sh` plus `package.json`/`README.md` script registration — live harness coverage for hook rewire behavior on both Codex and Claude layouts.
- `REQUIREMENTS.md`, `APPROACH.md`, and `docs/architecture/{STACK.md,ADR.md,DIAGRAM.md,CONTRACTS.md}` — recorded the anti-drift problem statement, selected the stateful drift-guard approach, and defined the runtime contracts before hook implementation.
- `hooks/go-beast-session-state.sh`, `hooks/go-beast-user-prompt-context.sh`, `hooks/go-beast-stop-reanchor.sh`, and `hooks/go-beast-drift-lib.sh` — added shared anti-drift runtime state, Codex prompt-time re-anchoring, and bootstrap Stop enforcement for repeated workflow drift.
- `tests/plugin/test-go-beast-drift-hooks.sh`, `tests/codex/test-hook-wire.sh`, `tests/claude-code/test-hook-wire.sh`, and `workflows/go-hook-eval.js` — added deterministic and live coverage for anti-drift hook wiring and enforcement paths.

## [1.33.1] - 2026-06-18
### Added

- `CONTRIBUTING.md` — canonical contributor guide covering issue and PR workflow, validation expectations, common change types, and release/versioning rules for go-beast maintainers.

### Changed

- `README.md`, `PACKAGE.md`, and `AGENTS.md` — now point contributors at the canonical contribution guide and register the new top-level document in the documented repo layout.

## [1.33.0] - 2026-06-18
### Added

- `docs/architecture/MAINTAINER_PROTOCOLS.md` — defines the initial maintainer-facing operational protocol layer with Discovery, Implementation, Validation, PR/Release, and Blocker/Escalation protocols, including triggers, stop conditions, outputs, exit criteria, and related go-* skills.

### Changed

- `docs/architecture/AGENT_INSTRUCTION_CONTRACTS.md` — clarified the relationship between instruction contracts and protocols, and documented that protocols are operational sequences rather than a new precedence layer.
- `AGENTS.global.md` and `AGENTS.bootstrap.md` — now point to the canonical maintainer protocol layer and explain how protocols interact with baseline versus bootstrap behavior.
- `AGENTS.md`, `README.md`, and `PACKAGE.md` — registered the maintainer protocol layer and linked it from the repo-maintainer architecture docs.

## [1.32.0] - 2026-06-18
### Added

- `docs/architecture/AGENT_INSTRUCTION_CONTRACTS.md` — documents how `AGENTS.global.md`, `AGENTS.bootstrap.md`, and repository-local `AGENTS.md` should be layered, and records reusable techniques for writing stronger agent instruction contracts.

### Changed

- `AGENTS.global.md` — restructured the baseline agent contract into explicit precedence, mandatory rules, defaults, investigation requirements, validation requirements, and forbidden claims.
- `AGENTS.bootstrap.md` — hardened bootstrap mode into a stricter behavioral overlay with explicit precedence, mandatory gates, elevated stop conditions, and a completion gate.
- `AGENTS.md`, `README.md`, and `PACKAGE.md` — documented the instruction-layer relationship and registered the new architecture guide.

## [1.31.1] - 2026-06-18
### Added

- `docs/architecture/ADR-003-harness-bootstrap-architecture.md` — records the architectural split between the canonical core pack, optional harness adapters, and optional bootstrap policy.
- `docs/architecture/HARNESS_BOOTSTRAP_ARCHITECTURE.md` — maintainer-facing reference for ownership boundaries, drift points, and the checklist for adding or changing supported agent surfaces.

### Changed

- `AGENTS.bootstrap.md` — clarified bootstrap non-goals so bootstrap mode cannot be confused with installer, hook wiring, or plugin-packaging behavior.
- `README.md`, `PACKAGE.md`, and `AGENTS.md` — linked the new architecture docs, updated the documented repo tree, and aligned release metadata with the new patch release.

## [1.31.0] - 2026-06-17
### Added

- `skills/go-mule/SKILL.md` — new meta-skill for explicit go-beast initialization as an alternative to SessionStart sync-hook instrumentation, including core setup, optional harness wiring, validation, and next-beast handoff.
- `tests/codex/test-go-mule.sh` plus `package.json` script `test:codex:go-mule` — live Codex integration coverage for the initialization skill contract.

### Changed

- `README.md`, `PACKAGE.md`, and `AGENTS.global.md` — registered `go-mule`, documented when to prefer explicit initialization versus the sync hook, and added the new live validation command.
- `workflows/go-skill-eval.js` — registered `go-mule` with a structural checklist and a repo-specific initialization scenario.
- `tests/plugin/test-plugin-bundle.sh` — now asserts that the plugin adapter exposes the canonical `go-mule` skill.
- `.github/ISSUE_TEMPLATE.md`, `.github/pull_request_template.md`, `README.md`, and `AGENTS.md` — clarified issue/PR linking expectations by adding explicit related-items guidance for issues and a required GitHub closing-keyword reminder for PRs.

## [1.30.0] - 2026-06-17
### Added

- `.github/ISSUE_TEMPLATE.md` — standardized issue body for go-beast changes, covering the problem, why it matters, desired outcome, constraints, and acceptance criteria.
- `docs/architecture/ADR-002-canonical-skills-directory.md` — records the decision to move the canonical skills into a real top-level `skills/` directory without preserving a root compatibility layer.

### Changed

- `skills/` — the canonical source of truth now lives only in `skills/go-*`; root `go-*` entries were removed instead of being retained as compatibility symlinks.
- `scripts/install.mjs`, `scripts/sync-plugin-skills.mjs`, and `hooks/sync-go-beast-skills.sh` — installer, plugin sync, and session-start sync now source skills from the canonical `skills/` directory.
- `tests/plugin/test-plugin-bundle.sh` — plugin bundle assertions now verify that plugin skill symlinks resolve to `skills/go-*`.
- `AGENTS.md`, `PACKAGE.md`, `README.md`, `plugins/go-beast/README.md`, and `docs/architecture/ADR-001-plugin-adapter-bundle.md` — updated docs to describe the canonical `skills/` directory, the removal of the root compatibility layer, and the superseding architecture decision.

## [1.29.0] - 2026-06-17

### Added

- `plugins/go-beast/` — plugin adapter bundle with Codex and Claude plugin manifests plus a dedicated `skills/` directory for plugin-oriented packaging.
- `docs/architecture/ADR-001-plugin-adapter-bundle.md` — records the decision to keep the root `go-*` directories as the canonical source while exposing a plugin-friendly adapter bundle.
- `package.json` and `scripts/sync-plugin-skills.mjs` — package metadata plus a maintenance script to keep the plugin adapter skill symlinks aligned with the root skill directories.
- `AGENTS.bootstrap.md` plus installer/sync support for optional bootstrap mode, persisted at `~/.go-beast/bootstrap.enabled`.
- `go-tern/SKILL.md` and `go-marten/SKILL.md` — new meta-skills for code review and git worktree workflows.
- `tests/` — initial integration suite covering the plugin bundle, Claude real-session skill/bootstrap behavior, and Codex real-session checks for the new meta-skills.

### Fixed

- `tests/codex/test-go-marten.sh` and `tests/codex/test-go-tern.sh` — reduced output fragility by matching the expected skill artifacts and headings instead of overly exact wording, while keeping the tests live-harness opt-in.

## [1.28.2] - 2026-06-15

### Changed

- **AGENTS.md** and **PACKAGE.md** — clarified SemVer `x.y.z` handling for patch, minor, and major releases.

## [1.28.1] - 2026-06-15

### Fixed

- **go-jay/SKILL.md** (v1.2.0 → v1.2.1): quoted the frontmatter `description` value so the internal `Agent-agnostic:` label parses as valid YAML.
- **AGENTS.md** and **PACKAGE.md** — clarified that patch-only unreleased changes should be released as `x.y.z`, not a new minor version.

## [1.28.0] - 2026-06-15

### Fixed

- **AGENTS.global.md** — aligned the synced global pipeline and skill tables with the current README/PACKAGE docs by adding `go-lark`, optional `go-crane`, and `go-ant`.
- **PACKAGE.md** — aligned the dependency graph and new-beast contribution steps with `AGENTS.md`, and listed existing skill reference/output directories in the manifest tree.
- **AGENTS.md**, **AGENTS.global.md**, and `.github/pull_request_template.md` — documented the Conventional Commits requirement for commit messages.
- **hooks/git-commit-remind.sh** — updated the commit/push reminder to require Conventional Commits when committing, with hook-eval coverage.
- **go-jay/SKILL.md** (v1.1.0 → v1.2.0): added the required `## Output` section so the skill satisfies the repository's SKILL.md structure contract.

## [1.27.0] - 2026-06-15

### Added

- `.github/pull_request_template.md` — standardized PR body for go-beast changes, covering summary, problem, root cause, change, validation, risks, and follow-ups.
- `AGENTS.md` — added a pull request pattern section to require one problem per PR, a short imperative title, and end-to-end diff review before opening a PR.
- `hooks/manifest.json` and `scripts/hook-wire.mjs` — shared hook manifest and idempotent wiring helper for Claude Code and Codex.

### Changed

- `scripts/install.mjs` — now auto-wires Claude Code and Codex hook configs from the shared manifest while preserving existing entries.
- `hooks/sync-go-beast-skills.sh` — now syncs skills, workflows, hooks, and global instructions for both Claude Code and Codex, then rewires hook config on SessionStart.
- `hooks/code-verify-flag.sh`, `hooks/code-verify-run.sh`, `hooks/docs-update-flag.sh`, `hooks/docs-update-remind.sh`, `hooks/git-commit-remind-flag.sh`, `hooks/git-commit-remind.sh`, and `hooks/version-bump-remind.sh` — moved shared state from `~/.claude` to `~/.go-beast` so Claude Code and Codex use the same flag files.
- `workflows/go-hook-eval.js` — updated the hook-eval harness to use the shared `~/.go-beast` flag directory.

## [1.26.0] - 2026-06-15

### Removed

- **extensions/beast-control/** — removed the optional Firefox/Zen Browser MCP bridge from the skill pack and deleted its setup, architecture, security, testing, extension, and MCP server files.

### Added

- **hooks/version-bump-remind.sh** — Stop hook: fires when `CHANGELOG.md` has a non-empty `[Unreleased]` section; via exit 2 instructs Claude to ask the user to bump the version in `PACKAGE.md`, `package.json`, and `README.md` before ending the session.

### Changed

- **scripts/install.mjs**: treats Codex as a hook-capable agent by symlinking selected hook scripts into `~/.codex/hooks/` and warning about Codex hook wiring via `~/.codex/hooks.json` or inline `[hooks]` in `~/.codex/config.toml`. Updated README, PACKAGE, AGENTS, and AGENTS.global wording so hooks are no longer described as Claude Code-only.
- **go-swift/SKILL.md** (v1.1.0 → v1.2.0): expanded hook authoring from Claude Code-only to Claude Code and Codex, including Codex hook config paths and `/hooks` trust review.
- **go-wren/SKILL.md** (v1.1.0 → v1.2.0): expanded hook maintenance from Claude Code-only to Claude Code and Codex, including Codex hook script locations, config schemas, and trust-review checks.
- **workflows/go-skill-eval.js**: updated go-swift/go-wren descriptions and replaced the go-swift structural term `settings.json` with `hook configuration`.
- **workflows/go-hook-eval.js**: replaced old `docs-update-flag` test cases (extension-based) with new git-aware cases (`.sh` in git repo, `.gitignore` exclusion, non-git project). Added 6 new test cases covering `git-commit-remind-flag` (Edit in git, Edit outside git, non-Edit tool) and `git-commit-remind` (no flag, stop_hook_active, repo with changes).
- **go-wren/SKILL.md**: added "Common pitfalls in strict bash (`set -euo pipefail`)" table covering `|| var=$?` pattern, `git check-ignore` exit semantics, non-existent directory for `git -C`, `$(pwd)` in PostToolUse hooks, and `pipefail` with pipes.

## [1.25.0] - 2026-06-15

### Changed

- **hooks/docs-update-flag.sh**: replaced language extension allowlist with git-aware detection — any file not in `.gitignore` triggers the docs reminder, regardless of extension. Falls back to firing for all non-doc files in non-git projects. Also resolves project root via `git rev-parse --show-toplevel` instead of `dirname`, so the reminder displays the correct project path.

### Added

- **hooks/git-commit-remind-flag.sh** — PostToolUse observer: flags `~/.claude/.git-commit-remind-pending` with the git root whenever Edit, Write, or MultiEdit occurs inside a git repository.
- **hooks/git-commit-remind.sh** — Stop hook: reads the flag, checks for uncommitted changes via `git status --short`, and via exit 2 instructs Claude to ask the user whether to commit and/or push before ending the session. Anti-loop guard via `stop_hook_active`.

### Fixed

- **workflows/go-deep-analysis.js**: architecture focus now requires reading the concrete call site for every external integration identified — not only the HTTP client interface. Added explicit instruction: do not infer data direction (IN vs OUT) from the HTTP verb alone, as POST is used for both writes and queries. Motivated by a real error where `@PostMapping` on a Feign client was misread as a write to the downstream system, while the calling Tasklet showed it was a read with local persistence.
- **workflows/go-deep-analysis.js**: minimum files read per dimension raised from 3-5 to 8-10, with an architecture-specific rule requiring at least one concrete implementation file per external integration found.

---

## [1.24.1] - 2026-06-14

### Fixed

- **workflows/go-workflow-eval.js**: added `DIMENSIONS`, `outputDir`, `repoPath`, `args?.repoPath`, `args?.outputDir` to the patterns_found checklist in the extractor — these patterns were present in go-deep-analysis.js but missed by the extractor, causing false structural failures.
- **workflows/go-workflow-eval.js**: added `analysis` type-specific judge criteria for go-deep-analysis.

---

## [1.24.0] - 2026-06-14

### Added

- **workflows/go-deep-analysis.js** — deep multi-dimensional codebase analysis workflow. Discovery phase reads repo structure and tech stack. Analysis phase fans out 6 independent dimensions in parallel (architecture, security, performance, testing, documentation gaps, dependency health) using real file reads via MCP filesystem. Documentation phase saves one complete Markdown file per dimension. Aggregation phase writes an index.md linking all documents. Parameterized via `args.repoPath`, `args.outputDir`, and optional `args.dimensions` filter.

---

## [1.23.5] - 2026-06-14

### Fixed

- **workflows/go-hook-eval.js**: resolved all 15 test failures caused by Claude Code auto-mode safety classifier blocking `~/.claude/` flag file operations as "audit tampering / prompt injection". Solution: each test now runs in its own isolated temp home (`/tmp/hook-eval-<test-id>/`). Hooks write flags to `$testHome/.claude/` (via `HOME=$testHome`) so no `~/.claude/` path is ever touched during tests. `EVAL_HOME` is the canonical placeholder in `TESTS` definitions; runner remaps it to `testHome` at execution time via `replaceAll`. Parallel-run flag contamination eliminated. Result: 31/31 pass.
- Fixed `ReferenceError: Cannot access 'testHome' before initialization` — moved `testId`/`testHome` declarations before the `rawSetup` line that references them.

---

## [1.23.4] - 2026-06-14

### Fixed

- **workflows/go-workflow-eval.js**: extractor now recognizes both `phase('...')` standalone calls AND `phase: '...'` as named parameters inside agent() calls — go-skill-eval uses the latter pattern, which was causing false "missing phase" findings. Added `expectOutput`, `label`, `schema` to patterns_found checklist. Removed `label` from go-hook-eval structural checklist (dynamic template labels match regex unreliably).

---

## [1.23.3] - 2026-06-14

### Changed

- **workflows/go-workflow-eval.js**: redesigned evaluation pipeline to handle large files correctly. Stage 1 now reads the file in 3 chunks of 400 lines each and extracts structural elements (meta block, schemas, phases called, agent labels, patterns found, has_return, total_lines) into a JSON object. Stages 2 and 3 operate on this extract instead of truncated raw source — eliminates false penalties for elements that exist beyond the 10k char cutoff. Judge prompt updated to explicitly instruct against penalizing elements present in the extract.

---

## [1.23.2] - 2026-06-14

### Fixed

- **workflows/go-workflow-eval.js**: read stage no longer uses schema (which forced JSON wrapping of large strings and caused agent stalls on go-skill-eval's 1010 lines). Now reads in two 600-line chunks via mcp__filesystem__read_text_file and returns raw text.
- **workflows/go-hook-eval.js**: added `.ts` file test for code-verify-flag (previously only .py and .go were tested); added MultiEdit tool path test for docs-update-flag; simplified code-verify-run exit-1 setup into a single chained command (previous multiline heredoc was fragile).

---

## [1.23.1] - 2026-06-14

### Fixed

- **workflows/go-workflow-eval.js**: source read stage now instructs agent to use `mcp__filesystem__read_text_file` in two calls (offset 0 then offset 500) for large files — go-skill-eval (1010 lines) was stalling the read agent on every attempt. Updated go-hook-eval checklist to include `setup`.
- **workflows/go-hook-eval.js**: added two missing test cases — (1) `code-dedup-check.sh` blocking case: sets up a file with a function in the project, then tries to write the same function again (expectExit:1); (2) `code-verify-run.sh` exit 1 path: creates a minimal TypeScript project with a deliberate type error, flags it, and expects the hook to exit 1 with a check failure message.

---

## [1.23.0] - 2026-06-14

### Added

- **workflows/go-workflow-eval.js** — new eval workflow for Workflow scripts. Reads each workflow source via agent, runs a structural checklist (meta purity, labels, return statement, null guards, discovery schemas), then an LLM judge with four dimensions: correctness, completeness, coverage, and clarity. Coverage criteria are type-specific: skill-eval harnesses are judged on skill registration quality, input diversity, and judge calibration; hook-eval harnesses are judged on case coverage, edge cases, and cleanup. Supports `args.workflows` filter and `args.repoPath`.

---

## [1.22.2] - 2026-06-14

### Changed

- **go-bee/SKILL.md** (v1.1.0 → v1.2.0): two critical correctness fixes from eval iteration 3 — (1) discovery agents that return arrays MUST use a schema; an agent() without schema returns a string, and iterating over it in the next pipeline stage silently iterates characters instead of items; (2) report-writing agent still requires label and phase even though it omits schema — all agent() calls without exception.

---

## [1.22.1] - 2026-06-14

### Changed

- **go-bee/SKILL.md** (v1.0.0 → v1.1.0): four technical accuracy fixes from eval iteration 1 — (1) the report-writing agent must never use schema (prose-driven, Write tool); (2) labels for per-item agents must use index or basename, not full paths; (3) prompts must be built lazily inside stage functions, never at script top level; (4) a single pipeline() must cover all sequential stages of the same item set, not split into two calls. Added step 4b with null-guard pattern before accessing pipeline results. Added meta pure-literal rule clarification: array defaults belong in comments below meta, not inside it.

---

## [1.22.0] - 2026-06-14

### Added

- **go-bee** — new meta-skill for Workflow script authoring. Covers: defining purpose and phases (meta block), choosing orchestration primitives (pipeline vs parallel vs loop), defining JSON schemas for structured agent output, labeling agents, writing the script body structure, saving reports, and registering in the pack. Position: on-demand meta-skill invoked whenever a multi-agent workflow needs to be built or extended.
- **go-skill-eval**: `go-bee` added to `SKILLS` (runs on all inputs A/B/C/D). Checklist: `meta`, `phase`, `pipeline`, `schema`, `label`, `return`. Override injects a concrete auth-audit workflow task.
- **AGENTS.global.md** + **PACKAGE.md**: `go-bee` registered as meta-skill.

---

## [1.21.2] - 2026-06-14

### Changed

- **AGENTS.md**: updated to reflect current repo state — added `scripts/install.mjs` and `extensions/` to repo layout; fixed "one workflow" to "two eval workflows"; added steps 6 and 7 to "Adding a new beast" (FILESYSTEM_SKILLS and skillOverrides); removed hardcoded personal path from symlink note; removed `---` dividers.

---

## [1.21.1] - 2026-06-14

### Changed

- **AGENTS.global.md**: MCP install guidance made agent-agnostic — removed `claude mcp add` commands (Claude Code-specific), now provides package names only and refers users to their agent's documentation and the MCP quickstart guide.

---

## [1.21.0] - 2026-06-14

### Changed

- **AGENTS.global.md**: removed personal references — `filesystem` MCP no longer hardcodes a specific home directory, now describes the user's home directory generically. Communication section no longer hardcodes Portuguese — now says "respond in the same language the user writes in". Removed `---` dividers.
- **AGENTS.global.md**: MCP Tools section expanded — each entry now includes an "If missing" column with the exact install command or fallback strategy, so the agent can guide the user to install missing servers instead of silently degrading.

---

## [1.20.4] - 2026-06-14

### Changed

- **README.md**: full rewrite — cleaner structure, pipeline diagram at the top, skills split into pipeline vs meta-skills tables with "Produces" column, hooks and workflows in concise tables, installation section streamlined with three clear paths (interactive installer, Claude Code auto-sync, other agents).

---

## [1.20.3] - 2026-06-14

### Fixed

- **scripts/install.mjs**: hooks warning now reads `~/.claude/settings.json` and only shows hooks that are not already wired — previously always warned even when all hooks were registered.

---

## [1.20.2] - 2026-06-14

### Changed

- **scripts/install.mjs**: polished ANSI UI — header and prompt sections rendered as Unicode boxes (`╭╮╰╯`), pick list shown in two columns, install results grouped (new items listed individually, already-linked items collapsed to a single count line), summary box at the end with counters for new/linked/warnings.

---

## [1.20.1] - 2026-06-14

### Removed

- **scripts/install.sh** — replaced by `scripts/install.mjs`. The bash installer is no longer maintained.

---

## [1.20.0] - 2026-06-14

### Added

- **scripts/install.mjs** — cross-platform installer rewritten in Node.js (macOS, Linux, Windows). No external dependencies, requires Node.js 18+. Same UX as `install.sh` (`a/n/p` prompt, numbered list with range support, `--all` / `--uninstall` flags) but runs on all platforms. On Windows, creates directory symlinks for skill folders and file symlinks for hooks/workflows; skips `chmod` (Unix only). Colours disabled automatically on Windows unless Windows Terminal or ANSI is detected.

### Changed

- **README.md**: installation section updated to use `install.mjs` as the primary installer.

---

## [1.19.1] - 2026-06-14

### Fixed

- **scripts/install.sh**: normalize trailing slash in `readlink` output before comparison — `go-smith` and `go-swift` were incorrectly reported as "linked elsewhere" because the existing symlinks had a trailing slash (created by the old sync hook using `$skill_dir/`) while the new installer passed paths without one.

### Changed

- **scripts/install.sh**: rewrote `select_items` — replaced fzf sentinel hack with a clean `[a] all / [n] none / [p] pick` prompt; pick mode uses a numbered list with range support (`1-5`) instead of fzf, which was unreliable in this context. fzf is still used for pick mode on large lists (skills).
- **scripts/install.sh**: `link_item` now shows `–` for already-linked items and `⚠` with the current target for conflicts, so re-running the installer always produces visible output.

---

## [1.19.0] - 2026-06-14

### Added

- **scripts/install.sh** — interactive local installer. Detects installed agents, multi-selects skills/hooks/workflows via fzf (fallback: numbered menu), symlinks everything, and copies `AGENTS.global.md` to each agent's expected global instructions file. Supports `--all` (non-interactive, install everything) and `--uninstall` (remove all repo symlinks). Claude Code is the only agent that gets hooks and workflows; all agents get skills. Global instructions mapping: `claude-code` → `CLAUDE.md`, `cursor` → `.cursor/rules`, `gemini` → `GEMINI.md`, `cline/codex/agents` → `AGENTS.md`, `copilot` → `copilot-instructions.md`.

---

## [1.18.3] - 2026-06-13

### Changed

- **go-vole/SKILL.md** (v1.2.0 → v1.3.0): two final fixes from eval iteration 3 — (1) Templater note expanded: frontmatter vs body duplication rule added (don't repeat frontmatter fields as markdown prose; use Dataview to query frontmatter); (2) new Rule: team vaults must include a git/versioning strategy in VAULT.md, with `.gitignore` recommendations for `.obsidian/workspace.json` and plugin config files.

---

## [1.18.2] - 2026-06-13

### Changed

- **go-vole/SKILL.md** (v1.1.0 → v1.2.0): three technical accuracy fixes — (1) VAULT.md step now specifies writing as a plain Markdown document, not wrapped in a fenced code block, to avoid nested fence conflicts; (2) Obsidian Publish section added clarifying that `published: false` frontmatter does not control publication state — Publish uses internal UI state, not frontmatter; (3) migration note added for existing vaults: move files inside Obsidian to trigger auto-link-update, not via OS file manager. Also: Templater variable capture pattern added — prompt once, reuse via JS variable instead of calling `tp.system.prompt()` multiple times.

---

## [1.18.1] - 2026-06-13

### Changed

- **go-vole/SKILL.md** (v1.0.0 → v1.1.0): step 6 expanded — added correct Templater variable reference (`tp.system.prompt()` for user input, `tp.file.title` for note name, explicit warning never to use `tp.file.cursor()` as a variable); added context-based additional templates (ADR, Meeting Note, Incident Post-Mortem, Literature Note, Person Note) beyond the 3 minimum.

---

## [1.18.0] - 2026-06-13

### Added

- **go-vole** — new meta-skill for Obsidian vault design and PKM. Covers: VAULT AUDIT (purpose, scope, volume, state, plugins), folder structure strategy (PARA / Zettelkasten / Flat+MOCs / Hybrid), naming conventions, wikilink + MOC strategy, plugin configuration (Dataview, Templater, Tasks), note templates, and VAULT.md specification document. Invoked on demand — not bound to a pipeline phase.
- **go-skill-eval**: `go-vole` added to `SKILLS` (runs on all inputs A/B/C/D). Checklist: `VAULT AUDIT`, `STRUCTURE`, `NAMING`, `LINKING`, `VAULT.md`, `template`, `plugin`. Override injects a solo developer scenario with Dataview + Templater.
- **AGENTS.global.md** + **PACKAGE.md**: `go-vole` registered as meta-skill.

---

## [1.17.4] - 2026-06-13

### Changed

- **go-eagle/SKILL.md** (v1.1.0 → v1.1.1): Output section — "CI workflow with test gates configured" expanded with platform-neutral path examples (GitHub Actions, GitLab CI, Jenkins).
- **go-bear/SKILL.md** (v1.1.0 → v1.1.1): Output section — "Dependency audit report" expanded to `docs/security/DEPENDENCY_AUDIT.md` with per-entry format (package, CVE, severity, versions, resolution status), release-blocker rule for open High/Critical entries, and go-raven CI gate handoff note.

---

## [1.17.3] - 2026-06-13

### Changed

- **go-finch/SKILL.md** (v1.2.0 → v1.3.0): step 3 now specifies that "verbatim" includes all markdown formatting (backtick fences, bold, list prefixes, indentation) and requires marking Edit tool calls as `(simulated — eval context)` rather than omitting them. Platform-agnostic note strengthened: acknowledging a platform assumption and proceeding is explicitly flagged as a harder violation than missing it. Step 7 CHANGELOG format made mandatory: `**go-<animal>/SKILL.md** (vX → vY): <sentence>.`

---

## [1.17.2] - 2026-06-13

### Changed

- **go-finch/SKILL.md** (v1.1.0 → v1.2.0): step 5 now includes a platform-agnostic note — when adding file paths that are platform-specific (e.g., `.github/workflows/ci.yml`), use a placeholder unless the skill explicitly scopes to one platform. CHECKLIST ASSESSMENT format updated to require quoting the actual current terms from `go-skill-eval.js` and naming the specific term affected.

---

## [1.17.1] - 2026-06-13

### Changed

- **go-finch/SKILL.md** (v1.0.0 → v1.1.0): step 6 rewritten — now produces a mandatory `CHECKLIST ASSESSMENT` named artifact (always required, even when no update is needed) with structured fields: current terms, change type, update needed, reason, action. Output section updated to include `CHECKLIST ASSESSMENT` as a named always-required artifact.
- **workflows/go-skill-eval.js**: `go-finch` checklist updated — added `CHECKLIST ASSESSMENT` term to match new named artifact.

---

## [1.17.0] - 2026-06-13

### Added

- **go-finch** — new meta-skill for go-* skill maintenance. Covers: SKILL AUDIT (current state before any edit), change classification (Wording / Sharpening / Addition / Structural / Contract with risk levels), PROPOSED EDIT block (before/after for the specific change), version bump policy, internal consistency check, go-skill-eval checklist update, and CHANGELOG entry. Never rewrites a working skill — one weakness per invocation. Position: `go-smith → (skill in production) → go-finch → go-skill-eval`.
- **go-skill-eval**: `go-finch` added to `SKILLS` and `FILESYSTEM_SKILLS` (C/D only). Checklist: `SKILL AUDIT`, `change type`, `PROPOSED EDIT`, `version bump`, `consistency check`, `CHANGELOG`. Per-input overrides: C = go-eagle Rules sharpening; D = go-bear Output section spec.
- **AGENTS.global.md** + **AGENTS.md**: `go-finch` added to meta-skills table.
- **PACKAGE.md**: `go-finch` added to directory tree and dependency graph.

---

## [1.16.5] - 2026-06-13

### Changed

- **go-wren/SKILL.md** (v1.3.0 → v1.4.0): step 3 now includes a platform compatibility note — `grep -P` (PCRE) is unavailable on macOS BSD grep; any proposed hook code must use `grep -E` instead or it will silently fail.
- **hooks/code-verify-run.sh**: Python detection condition now also triggers on `requirements.txt` — projects with only a requirements file (no pyproject.toml/setup.py/setup.cfg) were previously skipped.

---

## [1.16.4] - 2026-06-13

### Changed

- **workflows/go-skill-eval.js**: `go-wren` input C override tightened — now explicitly constrains the task to a single grep-regex line edit in `docs-update-flag.sh` with exact JSON test cases for the four required test evidence cases, preventing the agent from drifting into full hook creation instead of targeted maintenance.

---

## [1.16.3] - 2026-06-13

### Changed

- **go-wren/SKILL.md** (v1.2.0 → v1.3.0): step 3 now includes the correct `settings.json` hook registration schema with matcher semantics (Stop/SessionStart have no matcher; PreToolUse/PostToolUse use `matcher` key at the outer array element level). Rules section expanded with: stop-if-hook-missing rule, explicit simulated-evidence rule, stdin-only rule.
- **workflows/go-skill-eval.js**: `go-wren` override split by input — input C keeps the PayLink/Jinja2 condition change; input D now gets a ShopLegacy/secret-detection scenario (gap analysis between existing `git-commit-guard.sh` Bash hook and a new Edit/Write content-inspection hook). Override preamble strengthened to suppress skill-registration meta-commentary.

---

## [1.16.2] - 2026-06-13

### Changed

- **go-wren/SKILL.md** (v1.1.0 → v1.2.0): step 3 now includes a hook input mechanics table — documents that Claude Code passes event data via stdin JSON, not env vars or positional args; any `$TOOL_INPUT`/`$1` pattern is explicitly flagged as incorrect.
- **workflows/go-skill-eval.js**: `go-wren` skill override rewritten for input C — now injects a PayLink-specific change request (Jinja2 `.html` templates under `templates/` directory) with full stdin mechanics reminder and four explicit test cases for TEST EVIDENCE. Override also enforces that the agent must not question the skill's registration.

---

## [1.16.1] - 2026-06-13

### Changed

- **go-wren/SKILL.md** (v1.0.0 → v1.1.0): step 1 now produces a mandatory `HOOK CONTRACT` artifact before any edit; step 3 requires an explicit `PROPOSED DIFF` block (before/after) before applying the change; step 5 requires a `TEST EVIDENCE` block with real commands and expected outputs (marked simulated when shell is unavailable). Output section updated to list all three named artifacts as always-required.
- **workflows/go-skill-eval.js**: `go-wren` skill override added — injects the real `docs-update-flag.sh` script and a concrete change request so the eval agent has a real hook to work on instead of generating generic output. Checklist updated to match the three new named artifacts (`HOOK CONTRACT`, `PROPOSED DIFF`, `TEST EVIDENCE`).

---

## [1.16.0] - 2026-06-13

### Added

- **go-wren** `[Claude Code only]` — new meta-skill for Claude Code hook maintenance. Covers: reading the current hook contract, classifying the change scope (threshold / condition / behaviour / bug fix), applying the minimal diff with the `Edit` tool, updating `go-hook-eval.js` test cases when needed, and re-validating with a direct shell test + full eval run. Never rewrites a working hook from scratch — that remains go-swift's domain. Position: `go-swift → (hook in production) → go-wren → go-hook-eval`.
- **go-skill-eval**: `go-wren` added to `SKILLS` and `FILESYSTEM_SKILLS` — runs only with inputs C and D (requires real hook files). Checklist: `current contract`, `change type`, `minimal diff`, `exit code`, `test evidence`, `happy path`.
- **AGENTS.global.md**: `go-wren` added to meta-skills table.

---

## [1.15.2] - 2026-06-13

### Changed

- **Full repository translation to English**: all Portuguese content translated across hooks, workflows, docs, and the beast-control extension — `hooks/*.sh` comments and user-facing strings, `workflows/go-hook-eval.js` (meta, test case names, prompts, report), `workflows/go-skill-eval.js` (meta, input data, prompts, report), `CHANGELOG.md` historical entries, `extensions/beast-control/` docs and source code (JS/TS comments, error strings, test names).

---

## [1.15.1] - 2026-06-13

### Added

- **AGENTS.md**: `### Language` convention — all content in the repo (skills, docs, commits, PRs, code comments) must be written in English.
- **README.md**: design principle 6 — "English only" — with a pointer to `AGENTS.md` for the full policy.

---

## [1.15.0] - 2026-06-13

### Fixed

- **hooks/docs-update-remind.sh**: output redirected to stdout (Claude) and stderr (terminal) in parallel — previously only stdout was used, leaving the terminal with no visible output ("No stderr output").

---

## [1.14.0] - 2026-06-13

### Changed

- **hooks/docs-update-remind.sh**: converted from passive observer to active blocker — `exit 2` re-triggers Claude with the reminder as mandatory feedback, forcing docs and version updates before ending the session.
- **workflows/go-hook-eval.js**: case `shows reminder when flag exists` updated to `expectExit: 2`.

---

## [1.13.0] - 2026-06-13

### Changed

- **hooks/docs-update-remind.sh**: detects versioning files (`PACKAGE.md`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`) and adds a version bump reminder to the warning box.

---

## [1.12.0] - 2026-06-13

### Added

- **go-hook-eval**: test harness with 27 cases covering all go-beast hooks — blockers, observers, stop hooks, jq fallback with literal newlines, flag files, and `stop_hook_active`. Harness bugs fixed after first run (flag cleanup and removal of unnecessary setup in `code-verify-run`).

### Changed

- **go-skill-eval**: `go-swift` and `go-jay` added to `FILESYSTEM_SKILLS` — run only with inputs C and D (real code). Inputs C and D enriched with `.claude/settings.json`, `CLAUDE.md`, and `AGENTS.md` for Claude Code context. `skillOverrides` instruction added to `buildPrompt` so go-kite, go-swift, go-jay, and go-ant operate correctly without filesystem tools. Structural eval removed Portuguese term acceptance (no longer needed after full English translation).
- **hooks/sync-go-beast-skills.sh**: removes stale symlinks from renamed workflows before re-linking — prevents dangling symlinks after renames.
- **global settings.json**: removed hooks taskflow-session-log, taskflow-guard-db, and taskflow-node-postrun — they were artifacts of the fictional TaskFlow API project and do not belong in the global settings.

### Removed

- **hooks/taskflow-session-log.sh**, **hooks/taskflow-guard-db.sh**, **hooks/taskflow-node-postrun.sh**: removed from repo. They were hooks generated for the fictional TaskFlow API project during eval sessions.

### Fixed

- `~/.claude/hooks/sync-go-beast-skills.sh` was a stale local copy; replaced with a symlink to go-beast (version with dangling cleanup and cp of AGENTS.global.md).
- Stale symlinks `go-star-eval.js` and `hook-eval.js` in `~/.claude/workflows/` removed after workflow renames.

---

## [1.11.0] - 2026-06-13

### Added

- **go-hook-eval** workflow (`workflows/go-hook-eval.js`) — eval suite for all go-beast hooks. 27 test cases covering blockers (`git-strip-coauthored`, `git-commit-guard`), observers (`docs-update-flag`, `code-verify-flag`), stop hooks (`docs-update-remind`, `code-verify-run`), and `code-dedup-check`. Adversarial cases include jq fallback with literal newlines, `stop_hook_active=true`, flag file present/absent.

### Changed

- **go-star-eval** renamed to **go-skill-eval** (`workflows/go-skill-eval.js`) — name now reflects scope (skills only, not hooks).
- **go-skill-eval**: Input D adversarial added — ShopLegacy Flask project with SQL injection, hardcoded secrets, auth bypass, `debug=True` in production, zero tests. Skills filesystem-dependent (`go-kite`, `go-ant`, `go-crane`, `go-owl`, `go-beaver`, `go-mole`) now run only with C and D (real code). Judge recalibrated: baseline 3.5 (was 4), automatic penalties for placeholders and missed vulnerabilities in Input D. Checklists expanded across 11 skills.
- **hooks/git-strip-coauthored.sh**, **hooks/git-commit-guard.sh**: added raw-input fallback for when `jq` fails on literal-newline JSON — critical hooks now block even when `jq` cannot parse the input.
- **hooks/docs-update-flag.sh**, **hooks/code-verify-flag.sh**, **hooks/docs-update-remind.sh**, **hooks/code-verify-run.sh**: `jq` calls silenced with `2>/dev/null`; exit early on parse failure (non-critical hooks — observer behavior preserved).
- **go-mole/SKILL.md**: added "label is not content" rule — each `(inferred)` section must contain at least 1–2 concrete sentences, not just a label.
- **go-owl/SKILL.md**: quality bar exception documented for environments without a running server; runbook steps now require numbered lists and code blocks.

### Fixed

- Removed `Co-Authored-By` tag from 4 commits (history rewritten via `filter-branch`). Root cause: `jq` parse error on literal-newline JSON caused `git-strip-coauthored` to exit 0 silently.
- Replaced 4 independent skill directories (`go-ant`, `go-crane`, `go-kite`, `go-lark`) with symlinks to go-beast source — all 18 go-* skills in `~/.claude/skills/` are now symlinks.

---

## [1.10.0] - 2026-06-12

### Changed

- **CLAUDE.md** renamed to **AGENTS.md** — format recognized by Claude Code, Gemini CLI, Copilot CLI, and other agents.
- **CLAUDE.global.md** renamed to **AGENTS.global.md** — maintains naming convention; removes Claude-specific prefix.
- **hooks/sync-go-beast-skills.sh**: updated to read `AGENTS.global.md` instead of `CLAUDE.global.md`. Destination (`~/.claude/CLAUDE.md`) unchanged.
- **PACKAGE.md**, **README.md**: all references to renamed files updated.

---

## [1.9.0] - 2026-06-12

### Changed

- **go-swift/SKILL.md**: explicitly marked as `[Claude Code only]` in title and frontmatter. Added `platform: Claude Code` field. Content unchanged.
- **go-jay/SKILL.md**: made agent-agnostic. Description rewritten to not cite Claude Code as primary — CLAUDE.md is one target among others. Title updated to reflect support for any agent context format.
- **go-smith/SKILL.md**: output path generalized — removed reference to `~/.claude/skills/` as destination; the agent's skills directory is the sync system's responsibility, not the skill's.
- **go-hawk/SKILL.md**: `invoke` → `load` in meta-skills list; go-swift added with `[Claude Code only]` marker.
- **go-beaver/SKILL.md**: `invoke the setup-pre-commit skill` → `the setup-pre-commit skill can be loaded` (agent-agnostic language).
- **README.md**: "Installing in Claude Code" section renamed to "Installation" and expanded with instructions for Gemini CLI / Copilot CLI / other agents. Skills table: go-jay and go-swift updated to reflect real scope.
- **CLAUDE.md**: added scope note — this file is the context for the repo *maintainer* agent, not for agents that use the skills.

---

## [1.8.0] - 2026-06-12

### Added

- **go-lark** — new solution-space exploration skill. Position: `go-hawk → go-lark → go-fox`. Covers: generating 3–5 distinct approaches, evaluating against project constraints and quality attributes, selecting one with explicit rationale. Produces `APPROACH.md` as handoff to go-fox. Optional when requirements already constrain the solution to a single approach.

---

## [1.7.0] - 2026-06-12

### Added

- **go-ant** — new performance profiling and optimization skill. Covers: mandatory baseline before any change, profiling with stack-native tools (pprof, clinic.js, EXPLAIN ANALYZE, Lighthouse), root cause diagnosis (N+1, missing index, excessive bundle, etc.), surgical fix application, and before/after benchmark. Produces `PERF.md` with evidence. Never invoked speculatively — requires a proven problem with a numeric baseline. Position: after go-crane (metrics reveal the problem) or after go-eagle (load tests reveal the bottleneck).

---

## [1.6.0] - 2026-06-12

### Added

- **go-crane** — new observability and monitoring skill. Covers: structured logging with correlation IDs, metrics (Prometheus/OpenTelemetry), distributed tracing, health endpoints (`/health`, `/ready`, `/live`), alerts with runbooks, and dashboards. Produces `OBSERVABILITY.md`. Pipeline position: after go-raven or after go-wolf before the go-bear review.

---

## [1.5.3] - 2026-06-11

### Added

- **hooks/git-strip-coauthored.sh** — `PreToolUse (Bash)`: blocks commits whose message contains the `Co-Authored-By` tag (case-insensitive). Requires Claude to resend the commit without the tag before proceeding.

---

## [1.5.2] - 2026-06-11

### Fixed

- **go-smith/SKILL.md** and **go-swift/SKILL.md** added to the repository. Both directories had been documented in README.md, PACKAGE.md, CHANGELOG.md, and go-star-eval.js since v1.3.0, but the physical files existed only in `~/.claude/skills/` and had never been committed to the repo. Copied from the local installation.

---

## [1.5.1] - 2026-06-11

### Added

- **hooks/docs-update-flag.sh** — `PostToolUse (Edit/Write/MultiEdit)`: writes `~/.claude/.docs-update-pending` when a source file (.ts/.py/.go/etc.) is modified. Ignores documentation files (.md/.rst/.adoc/docs/) to avoid false positives.
- **hooks/docs-update-remind.sh** — `Stop`: reads the pending flag, displays a reminder box listing detected documentation files (README.md, docs/, CHANGELOG.md) in the project, then removes the flag. Observer-only — always exits 0. Guard against `stop_hook_active` to prevent loops.

### Changed

- **CLAUDE.global.md**: hooks table updated with `docs-update-flag` and `docs-update-remind` entries.
- **README.md**: hooks table expanded with the two new hooks.
- **PACKAGE.md**: directory tree updated with the two new hook files.

---

## [1.5.0] - 2026-06-11

### Added

- **CLAUDE.global.md** — global agent instructions file living inside the go-beast repo. Contains the full Engineering Agent Guidelines (priority order, stop conditions, fabrication policy, go-* pack table with all beasts including go-kite, hooks table, MCP tools table). This file is the source of truth for `~/.claude/CLAUDE.md`.
- **hooks/git-commit-guard.sh** — `PreToolUse (Bash)`: blocks `git commit` and `git add` when sensitive files (.env, credentials, .pem, .tfstate) or build artifacts (node_modules, dist, target, .pyc) are in staging. Supports bypass via `# taskflow-allow-destructive` comment.
- **hooks/code-dedup-check.sh** — `PreToolUse (Edit/Write/MultiEdit)`: extracts function/class/type declaration names from new code and searches the project for existing declarations with the same name. Warns before creating duplicate identifiers. Supports TS/JS/Python/Go/Rust/Java/Kotlin/Ruby/Swift/C/C++.
- **hooks/code-verify-flag.sh** — `PostToolUse (Edit/Write/MultiEdit)`: writes the current project directory to `~/.claude/.code-verify-pending` whenever a source file is modified. Trigger for code-verify-run.
- **hooks/code-verify-run.sh** — `Stop`: reads the pending flag and runs language-appropriate checks (tsc --noEmit, vitest/jest, mypy/pytest, go vet/test, cargo check/test). Exits non-zero on failure to re-prompt Claude. Guard against `stop_hook_active` to prevent infinite loops.

### Changed

- **hooks/sync-go-beast-skills.sh**: added final step that copies `CLAUDE.global.md` → `~/.claude/CLAUDE.md` on every `SessionStart`. The global instructions now stay in sync with the repo automatically.
- **PACKAGE.md**: version 1.5.0, date updated, `CLAUDE.global.md` added to directory tree, all 5 hooks listed in tree with their events.
- **README.md**: version 1.5.0, hooks table expanded with all 5 hooks.
- **CLAUDE.md** (project context): hooks section updated to reflect the 4 new generic hooks now managed by the go-beast repo.

---

## [1.4.0] - 2026-06-11

### Added

- **go-kite** — new meta-skill: strategic architecture health audit of existing systems. Audits five dimensions (structure/modularity, observability, reliability, scalability, security posture), identifies capability gaps with domain-grounded evidence, and produces a prioritized HTML report with Tailwind + Mermaid opened in the browser. Each finding references the next beast to invoke. Position: on-demand before go-fox revisions or when a strategic view of an existing system is needed.
- **workflows/go-star-eval.js**: go-kite added to SKILLS — 15 skills × 3 inputs = 45 runs per evaluation. Checklist: `structure`, `observability`, `reliability`, `scalability`, `security`, `capability gaps`, `recommendation`. `SKIP_INPUTS_FOR_SCORE['go-kite'] = ['A']` — Input A (TaskFlow, a fictional new project) excluded from average score as go-kite requires an existing codebase. Phase detail updated to reflect 45 combinations. Header count now derived from `Object.keys(SKILLS).length` dynamically.

### Changed

- **~/.claude/CLAUDE.md** (global): go-kite added to meta-skills table — "Strategic architecture health audit of an existing system — before go-fox revisions".
- **README.md**: go-kite added to skills table and meta-skills pipeline diagram.
- **PACKAGE.md**: go-kite added to directory tree, dependency graph updated.

---

## [1.3.1] - 2026-06-10

### Added

- `CLAUDE.md` — project-level agent context file for the go-beast repo itself. Covers: repo conventions, skill structure requirements, checklist quality rules, reference file policy, how to add a new beast, and how to run go-star-eval (full and filtered).

### Changed

- `~/.claude/CLAUDE.md` (global): rewrote "Skills and Workflows" section to document the full go-* pack with phase table, meta-skills table, and invocation rule. Non-go-* skills and the Workflow tool documented in sub-sections.
- `PACKAGE.md`: added `CLAUDE.md` to directory tree.

---

## [1.3.0] - 2026-06-10

### Added

- **go-smith** — new meta-skill: gap analysis, SKILL.md authoring, naming, and pack integration. Position: on-demand, not bound to a phase.
- **go-swift** — new meta-skill: Claude Code hook authoring (SessionStart, PreToolUse, PostToolUse, Stop, SubagentStop, PreCompact). Produces hook scripts and wires them into settings.json. Position: go-jay → go-swift → go-raven.

### Changed

- **README.md** and **PACKAGE.md**: added go-smith and go-swift to skills table, directory tree, and dependency graph. Added meta-skills section to pipeline docs. Updated go-star-eval workflow description to reflect A/B/C benchmark and `args.skills` filter.
- **workflows/go-star-eval.js**: added `args.skills` filter — pass `{ skills: ["go-swift"] }` via Workflow tool to run eval on a subset. Note: filter requires Workflow tool invocation; `/go-star-eval` slash command does not support args.

---

## [1.2.9] - 2026-06-10

### Added

- **workflows/go-star-eval.js**: go-swift added to SKILLS — 14 skills × 3 inputs = 42 runs per evaluation. Checklist: `hook script`, `settings.json`, `event`, `exit 0`.

---

## [1.2.8] - 2026-06-10

### Changed

- **workflows/go-star-eval.js**: `SKIP_INPUTS_FOR_SCORE` now excludes Input B from go-bear average score — ServerWatch (Go + InfluxDB monitoring) lacks the web auth/PCI/PII surface that go-bear's OWASP-centered workflow requires; judge penalized A=1 in 2 of 3 runs with this input, not due to skill failure but domain mismatch. Input B raw score still visible in results table.
- **workflows/go-star-eval.js**: fixed cosmetic bug where `Skills avaliadas` denominator was hardcoded as `/12`; now dynamically reads `Object.keys(SKILLS).length`, correctly showing `13/13` after go-smith was added.

### Added

- **go-smith** added to `SKILLS` in `go-star-eval.js` — 13 skills × 3 inputs = 39 runs per evaluation. Checklist: `gap analysis`, `SKILL.md`, `position in chain`, `handoff`.

---

## [1.2.7] - 2026-06-10

### Added

- **workflows/go-star-eval.js**: outlier detection in aggregator — flags any score that deviates ≥1.5 points from the median of the other inputs for the same skill. Outliers appear as a new `### Outliers detectados ⚠️` section in the report with skill name, input, raw score, median, and delta. Prevents silent distortions of average scores from judge variability.

---

## [1.2.6] - 2026-06-10

### Changed

- **workflows/go-star-eval.js** — two eval correctness fixes:
  - `INPUT_C.files`: added real simulated file contents (README.md, CHANGELOG.md, CONTRIBUTING.md, docs/ARCHITECTURE.md) so go-mole runs against actual file content instead of metadata, matching its real-world usage pattern. `buildPrompt` now injects file contents verbatim when `input.files` is present and switches the IMPORTANTE note from "simulate" to "read from these files".
  - `SKIP_INPUTS_FOR_SCORE`: go-bear and go-raven now exclude Input A from their average score calculation. Input A (TaskFlow API — a personal todo app) lacks the security surface and infrastructure complexity these skills require. The raw scores still appear in the results table; only the summary average is affected. A note is appended next to any skill with excluded inputs so the exclusion is visible in the report.

---

## [1.2.5] - 2026-06-10

### Changed

- **go-raven**: step 3 (CD pipeline) inlined staging + production pipeline templates, deploy strategy table, and rollback procedure — replaces the `${CLAUDE_SKILL_DIR}/references/pipeline-templates.md` reference that was unreadable at runtime, causing A=3 adherence.
- **go-owl**: step 4 (Runbooks) inlined runbook template and minimum required runbooks list — replaces the `${CLAUDE_SKILL_DIR}/references/runbook-template.md` reference for the same reason.
- **workflows/go-star-eval.js**: added Input C (PayLink — mid-complexity SaaS payments platform with simulated existing documentation) as a third benchmark input. RUNS expanded from 24 to 36 (12 skills × 3 inputs). Report comparativo updated to A/B/C. `buildPrompt` now surfaces `docs_existentes` field when present, enabling go-mole, go-owl, and go-raven to be tested with realistic documentation context.

---

## [1.2.4] - 2026-06-10

### Changed

- **go-mole**: step 3 now specifies "when documentation is absent or minimal, produce all sections with `(inferred)` labels rather than omitting them" — resolves the R=3 score on sparse/fictional projects by making inference explicit and listing inferred sections under **Gaps**.
- **go-bear**: step 6 (infrastructure hardening) inlined a concrete checklist (IAM, network, secrets in CI, logging/monitoring) replacing the `${CLAUDE_SKILL_DIR}/references/infra-hardening.md` reference that the LLM cannot read at runtime — step was previously skipped, causing A=3 on adherence.
- **go-beaver**: step 1 now provides an explicit decision table (single-repo vs monorepo vs multi-repo) with signal-based criteria — previously defaulted to monorepo for all projects, producing over-engineered scaffolds for simple apps.

---

## [1.2.3] - 2026-06-10

### Changed

- **workflows/go-star-eval.js** — multiple eval improvements:
  - `buildPrompt` now injects checklist items as explicit "ARTEFATOS OBRIGATÓRIOS" in the skill execution prompt, eliminating guesswork about required outputs
  - Structural eval prompt now specifies case-insensitive matching and accepts plural/singular/suffix variants (e.g. "migration" matches "migrations")
  - Checklists for go-lynx, go-otter, go-eagle, go-raven, go-jay normalized to English (removed Portuguese accented terms that caused false negatives)
  - Judge dimensions (relevancia/completude/clareza/aderencia) now surfaced per-row in the report table as `R/C/Cl/A`
  - Token count replaced: fake LLM-estimated `tokens_skill` replaced with deterministic `chars/4` proxy computed from actual output string length

---

## [1.2.2] - 2026-06-10

### Fixed

- **go-fox**: steps 2 and 5 now explicitly name the output files (`STACK.md`, `CONTRACTS.md`) inline — prevents the LLM from producing content without file-name anchors, which caused structural eval false negatives.
- **go-bear**: step 2 (OWASP review) now includes the `SECURITY_REVIEW.md` template with an explicit `severity` field per finding — previously these terms only appeared in the Output section and were not reproduced in the skill's response.

---

## [1.2.1] - 2026-06-10

### Fixed

- **go-otter**: step 1 (Entity-relationship model) now requires the `erDiagram` as an explicit fenced Mermaid code block before proceeding to migrations. Previously the instruction to "draw a Mermaid erDiagram" was ignored in favor of prose descriptions when the project was new or fictional.
- **go-fox**: Output section now states that all four documents (`ADR.md`, `STACK.md`, `DIAGRAM.md`, `CONTRACTS.md`) are mandatory regardless of project size. Previously the "Do not design what was not required" rule caused the LLM to skip `STACK.md` and `CONTRACTS.md` for simple projects.

---

## [1.2.0] - 2026-06-09

### Added

- `go-jay` — AI Context File Editor: creates, audits, edits, and synchronizes AI context files (CLAUDE.md, AGENTS.md, GEMINI.md, memory files). Includes `references/REFERENCE.md` with CLAUDE.md conventions, memory schema, audit checklist, and sync protocol.
- `go-mole` — Documentation Briefing: scans project docs and produces a compact `## Project Briefing` block for session context.
- `workflows/go-star-eval.js` — eval pipeline that tests all 12 go-* skills with structural checklist + LLM-as-judge (4-dimension rubric with per-level anchors) + A/B benchmark across two input profiles (TaskFlow API / ServerWatch). Produces a Markdown report with results table, A/B comparativo, Top/Bottom 3, and cost estimate.
- `hooks/sync-go-beast-skills.sh` — extended to also symlink `workflows/*.js` into `~/.claude/workflows/` and `hooks/*.sh` into `~/.claude/hooks/` on session start (previously only synced skills).

---

## [1.1.0] - 2026-06-09

### Changed

All 11 skills updated based on official Claude Code skills documentation research.

- **All skills**: added `when_to_use` frontmatter field (separates discovery triggers from description); added `version` field; compacted SKILL.md bodies to stay within Level 2 progressive disclosure budget (< 5k tokens).
- **go-bear**: split OWASP Top 10 checklist → `references/owasp-checklist.md`; split infrastructure hardening → `references/infra-hardening.md`. Body now references both via `${CLAUDE_SKILL_DIR}`.
- **go-eagle**: split test level guidelines → `references/test-levels.md`. Body now references it via `${CLAUDE_SKILL_DIR}`.
- **go-raven**: split pipeline templates and rollback procedures → `references/pipeline-templates.md`. Body now references it via `${CLAUDE_SKILL_DIR}`.
- **go-owl**: split runbook template and minimum runbook list → `references/runbook-template.md`. Body now references it via `${CLAUDE_SKILL_DIR}`.
- **go-rhino**: replaced hardcoded path references with `${CLAUDE_SKILL_DIR}` pattern; simplified setup section.

### Added

- `go-bear/references/owasp-checklist.md` — full OWASP Top 10 checklist with per-item tasks.
- `go-bear/references/infra-hardening.md` — IAM, storage, compute, network, secrets, and logging hardening checklists.
- `go-eagle/references/test-levels.md` — unit, integration, E2E, contract, and performance test guidelines.
- `go-raven/references/pipeline-templates.md` — staging/production CD templates, deploy strategies, rollback procedure, smoke test checklist.
- `go-owl/references/runbook-template.md` — runbook template and minimum required runbooks for production services.

---

## [1.0.0] - 2026-06-09

### Added

- `go-hawk` — Discovery & Requirements: structured interview process, requirements doc template, handoff plan.
- `go-fox` — Architecture & Design: stack selection table, ADR format, Mermaid component diagram, interface contracts.
- `go-beaver` — Scaffolding & Project Init: monorepo structure, tooling config checklist, `.env.example` convention, SETUP.md template.
- `go-wolf` — Backend API Development: layered architecture enforcement, auth model, validation, error handling, security checklist.
- `go-lynx` — Frontend UI Development: component hierarchy pattern, state management matrix, API integration layer, a11y checklist.
- `go-otter` — Database Design & Migrations: ER modeling, schema conventions, migration safety rules, indexing strategy, seed data.
- `go-eagle` — Testing Strategy & QA: test pyramid design, unit/integration/E2E guidelines, CI gate definition, coverage policy.
- `go-bear` — Security Review & Hardening: threat model, OWASP Top 10 checklist, secrets management, HTTP headers, dependency audit.
- `go-raven` — CI/CD & Deployment: CI pipeline template, environment strategy, deploy strategies, IaC guidance, secrets in CI.
- `go-owl` — Documentation: README template, API reference format, ADR maintenance, runbook templates, changelog discipline.
- `README.md` — pack index with skill map, standard pipeline, design principles, install instructions.
- `CHANGELOG.md` — this file.
