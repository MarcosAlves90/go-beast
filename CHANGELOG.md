# Changelog

All notable changes to the go-beast skill pack are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

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
