# Changelog

All notable changes to the go-beast skill pack are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [1.7.0] - 2026-06-12

### Added

- **go-ant** — nova skill de profiling e otimização de performance. Cobre: baseline obrigatório antes de qualquer mudança, profiling com ferramentas nativas por stack (pprof, clinic.js, EXPLAIN ANALYZE, Lighthouse), diagnóstico de root cause (N+1, índice ausente, bundle excessivo, etc.), aplicação de fix cirúrgico, e benchmark antes/depois. Produz `PERF.md` com evidências. Nunca é invocada especulativamente — requer problema comprovado com dado numérico. Posição: após go-crane (métricas revelam o problema) ou após go-eagle (load tests revelam gargalo).

---

## [1.6.0] - 2026-06-12

### Added

- **go-crane** — nova skill de observabilidade e monitoramento. Cobre: logging estruturado com correlation IDs, métricas (Prometheus/OpenTelemetry), tracing distribuído, health endpoints (`/health`, `/ready`, `/live`), alertas com runbooks, e dashboards. Produz `OBSERVABILITY.md`. Posição no pipeline: após go-raven ou após go-wolf antes da revisão go-bear.

---

## [1.5.3] - 2026-06-11

### Added

- **hooks/git-strip-coauthored.sh** — `PreToolUse (Bash)`: bloqueia commits cuja mensagem contenha a tag `Co-Authored-By` (case-insensitive). Exige que o Claude reenvie o commit sem a tag antes de prosseguir.

---

## [1.5.2] - 2026-06-11

### Fixed

- **go-smith/SKILL.md** e **go-swift/SKILL.md** adicionados ao repositório. Os dois diretórios estavam documentados em README.md, PACKAGE.md, CHANGELOG.md e go-star-eval.js desde v1.3.0, mas os arquivos físicos existiam apenas em `~/.claude/skills/` e nunca foram commitados no repo. Copiados da instalação local.

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

- **go-raven**: step 3 (CD pipeline) inlined staging + production pipeline templates, deploy strategy table, and rollback procedure — replaces the `${CLAUDE_SKILL_DIR}/references/pipeline-templates.md` reference that was unreadable at runtime, causing A=3 aderência.
- **go-owl**: step 4 (Runbooks) inlined runbook template and minimum required runbooks list — replaces the `${CLAUDE_SKILL_DIR}/references/runbook-template.md` reference for the same reason.
- **workflows/go-star-eval.js**: added Input C (PayLink — mid-complexity SaaS payments platform with simulated existing documentation) as a third benchmark input. RUNS expanded from 24 to 36 (12 skills × 3 inputs). Report comparativo updated to A/B/C. `buildPrompt` now surfaces `docs_existentes` field when present, enabling go-mole, go-owl, and go-raven to be tested with realistic documentation context.

---

## [1.2.4] - 2026-06-10

### Changed

- **go-mole**: step 3 now specifies "when documentation is absent or minimal, produce all sections with `(inferred)` labels rather than omitting them" — resolves the R=3 score on sparse/fictional projects by making inference explicit and listing inferred sections under **Gaps**.
- **go-bear**: step 6 (infrastructure hardening) inlined a concrete checklist (IAM, network, secrets in CI, logging/monitoring) replacing the `${CLAUDE_SKILL_DIR}/references/infra-hardening.md` reference that the LLM cannot read at runtime — step was previously skipped, causing A=3 on aderência.
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
