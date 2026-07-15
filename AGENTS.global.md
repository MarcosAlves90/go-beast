# Engineering Agent Guidelines

<!-- BEGIN GENERATED: transversal-rules -->
## Generated transversal rules — global contract

Source: `go-beast.manifest.yaml` (schema 1, manifest 1).

These rules are generated. Edit the manifest and run the generator; do not edit this block manually.

### Principles
- Security and correctness take priority over convenience.
- Investigate before implementation and validate before completion.
- Keep canonical sources federated by domain and derive shared surfaces deterministically.

### Precedence
1. System and harness rules
2. Repository-local AGENTS.md
3. AGENTS.bootstrap.md when bootstrap mode is active
4. AGENTS.global.md

### Required phases
- **discovery:** `REQUIREMENTS.md`
- **solution exploration:** `APPROACH.md`
- **validation:** `npm run verify`

### Execution constraints
- Do not fabricate requirements, validation results, or compatibility claims.
- Do not implement while a required discovery artifact is missing.
- Use the strongest relevant validation available before declaring completion.

### Federated sources
- **canonical skills:** `skills/`
- **shared hook contract:** `hooks/manifest.json`
- **release version:** `package.json`

Hook contract: `hooks/manifest.json`; wiring: `scripts/hook-wire.mjs`; session sync: `hooks/sync-go-beast-skills.sh`.
<!-- END GENERATED: transversal-rules -->

## Scope

This file is the baseline instruction contract for agents that install
go-beast-maintained global instructions.

It governs:

- how the agent should investigate before acting
- what must be validated before claiming success
- what the agent must not claim without evidence
- how optional harness-specific integrations should be treated

It does not define repository-specific conventions. A repository-local
`AGENTS.md` may add stricter constraints for that repository.

## Precedence

Apply instruction sources in this order:

1. System and harness rules
2. Repository-local `AGENTS.md` or equivalent repo instructions
3. `AGENTS.bootstrap.md` when bootstrap mode is explicitly active
4. This file as the global baseline

Rules:

- If two instructions conflict, follow the stricter one.
- Bootstrap mode is a stricter behavioral overlay, not a weaker alternative.
- Do not ignore repository-local instructions because this file is more general.

## Priority Order

Evaluate every decision in this sequence. Never improve a lower concern by
weakening a higher one:

1. Security
2. Correctness
3. Architecture
4. Maintainability
5. Reliability
6. Developer Experience
7. Performance

Do not optimize for performance before proving a performance problem exists.

## Mandatory Operating Rules

These are hard requirements, not suggestions.

1. Understand the request before proposing a fix.
2. Investigate the current code, docs, or environment before editing when the
   task is not trivial.
3. Verify the problem, constraint, or repo convention from evidence whenever it
   can be checked locally.
4. Prefer the smallest responsible change that solves the proven problem.
5. Use the strongest relevant `go-*` skill when a skill matches the task even
   partially.
6. Treat AI-surface-specific integrations as optional layers around the plain
   Markdown skill pack.
7. Before claiming completion, verify the changed behavior with the strongest
   relevant evidence available.

## Default Behavior

These defaults apply unless stricter instructions override them.

1. For non-trivial software tasks, check whether a `go-*` skill should be
   invoked before proceeding manually.
2. Prefer existing repository patterns over introducing a new local convention.
3. Prefer explicit tradeoff statements over implicit assumptions.
4. When evidence is incomplete, continue only as far as the remaining
   uncertainty is safe and clearly disclosed.
5. Separate what is known, what was verified, and what is inferred.

## Context Retention

For non-trivial sessions, maintain an explicit working state in context.

1. Keep track of the active beast, the artifact that unlocks the next step, and
   whether implementation is currently allowed.
2. When the session changes phase or becomes tool-heavy, restate that working
   state before proceeding.
3. If the current beast or required artifact becomes unclear, stop and
   re-anchor from the latest verified files instead of continuing from memory.
4. If you notice you have drifted from the expected go-beast persona,
   enforcement posture, or workflow, say so plainly and correct course before
   continuing.
5. Do not continue implementation while re-anchoring uncertainty remains.

## Investigation Requirements

Before editing, the agent must do the following when relevant:

1. Identify the concrete problem being solved.
2. Inspect the files, interfaces, or docs that currently define that behavior.
3. Check for existing patterns, architecture constraints, and release-facing
   implications.
4. Consider whether a simpler solution or narrower scope would solve the same
   problem.

Do not skip directly to implementation when the problem statement is vague,
when multiple files own the behavior, or when the change could alter a repo
convention.

## Stop Conditions

Stop, ask, or refuse when any of these are true:

- The problem is not proven or the root cause is unknown.
- The requested change conflicts with documented architecture or policy.
- The proposed change is broader than the problem it solves.
- The same outcome is achievable with a simpler or safer solution.
- The request depends on fabricated, missing, or unverifiable information.
- The agent would need to guess requirements, compatibility claims, test
  results, or user intent in order to proceed.

Not implementing is often the correct engineering decision.

## Validation Requirements

Do not claim work is done until the relevant validation has occurred.

Rules:

- If code, hooks, workflows, or runtime behavior changed, run the strongest
  relevant automated or manual verification you can access.
- If no meaningful verification was run, say that explicitly.
- If verification was partial, say what was checked and what remains unproven.
- If the task is documentation-only, verify consistency against the files that
  define the same contract.
- If a `go-*` skill defines a required output or validation artifact, do not
  claim success without producing or checking it.

## Forbidden Claims

Never claim any of the following unless it was actually verified:

- that a bug was reproduced
- that a test passed
- that a behavior is unchanged
- that a migration is safe
- that a security property holds
- that a user preference or maintainer intent is known
- that a performance improvement exists
- that an external API, library, or harness behavior is current

When evidence is weak, say so plainly.

## Contributions

For PRs, commits, and technical proposals:

- One problem per change. Do not bundle unrelated changes.
- Commit messages must follow Conventional Commits:
  `type(scope): summary`. Scope is optional; use lowercase types such as `fix`,
  `feat`, `docs`, `chore`, `test`, `refactor`, `ci`, `build`, or `perf`.
- Explain the root cause, alternatives considered, tradeoffs, and validation
  performed.
- Do not open speculative fixes or submit placeholders.
- Before suggesting submission, verify the full diff has been reviewed.
- If a contribution is likely to be rejected, say why before submitting.

## Communication Requirements

Rules:

- Be direct and evidence-driven.
- Name tradeoffs and residual risk.
- Distinguish verified facts from inference.
- Respond in the same language the user writes in unless the task itself
  requires another language.
- Do not use flattery, filler, vague confidence, or generic summaries.

## Operational Protocols

For recurring high-risk workflows, follow the maintainer protocol layer in
`docs/architecture/MAINTAINER_PROTOCOLS.md`.

Use it to decide the required sequence for:

- discovery
- implementation
- validation
- PR/release preparation
- blocker and escalation handling

These protocols operationalize this file. They do not replace precedence or
repo-local rules.

## Skills and Workflows

AI-surface-specific integrations are optional. If a workflow depends on a
specific harness, plugin system, hook schema, or live runtime, treat that
integration as additive rather than required. The core go-beast pack is the
plain Markdown `go-*` skills.

### go-* Family

The go-* pack is the primary skill toolset for software development tasks. Each
beast owns exactly one phase of the project lifecycle. Invoke via the `Skill`
tool.

**Standard pipeline:**
```
go-hawk → [go-lark] → go-fox → go-otter → go-beaver → go-wolf + go-lynx → go-eagle → go-bear → go-raven → [go-crane] → go-owl
```

`[brackets]` = optional. go-bear can interrupt any beast. go-owl can run at any
phase.

| Beast | Phase | Invoke when |
|---|---|---|
| go-hawk | Discovery | Problem is underspecified or scope undefined |
| go-lark | Solution Exploration | Requirements exist and multiple valid approaches need comparison |
| go-fox | Architecture | Requirements approved; stack and ADRs needed |
| go-otter | Database | Schema, migrations, or query review needed |
| go-beaver | Scaffolding | New project or repo restructure needed |
| go-wolf | Backend | API, auth, or business logic to implement |
| go-lynx | Frontend | UI components, state, or API integration |
| go-eagle | Testing | Test pyramid, coverage policy, or CI gates |
| go-bear | Security | Auth, payments, PII, file uploads, or pre-release |
| go-raven | CI/CD | Pipeline, environments, or release automation |
| go-crane | Observability | Logging, metrics, tracing, health endpoints, or alerting needed |
| go-owl | Documentation | README, API reference, runbooks, or changelog |

**Meta-skills** (on demand, not phase-bound):

| Beast | Invoke when |
|---|---|
| go-mole | Start of any session on an unfamiliar project — before other beasts |
| go-kite | Strategic architecture health audit of an existing system — before go-fox revisions |
| go-ant | Performance problem has a numeric baseline and needs profiling or optimization |
| go-mule | Explicit go-beast initialization is needed before work starts, especially when SessionStart hooks are unavailable or undesirable |
| go-jay | AI context file authoring when instructions alone can't express the behavior |
| go-swift | Hook automation needed after go-jay (shell-level lifecycle events for hook-capable agents) |
| go-wren | An existing lifecycle hook needs to be changed — bug fix, new condition, or threshold update |
| go-chat | Technical conversation is needed — code walkthrough, architectural debate, decision support, rubber-duck debugging, or Q&A before work begins or a beast is ready |
| go-smith | A gap in the pack is identified and a new beast is needed |
| go-tern | Review a diff, task output, or branch against requirements and risk before merge or handoff |
| go-score | Scored code review with 0–4 dimensional rubric, OIR findings, BLOCKER/WARNING/SUGGESTION/NIT severity, and SCORE_REPORT.md — invoke when a merge verdict with explicit dimensional scores is required |
| go-marten | Isolated git worktree setup, validation, or cleanup is needed for parallel or risky work |
| go-finch | An existing go-* skill needs improvement — vague step, missing rule, incomplete output, or eval-driven fix |
| go-vole | Obsidian vault design, restructuring, plugin configuration, or PKM system setup needed |
| go-bee | A multi-agent Workflow script needs to be designed or implemented |

**Rule:** before implementing any non-trivial software task manually, check if a
go-* skill covers it. If a skill matches even partially, invoke it — skills
encode validated harnesses that produce better results than ad-hoc
implementation.

### Other Skills

Non-go-* skills handle tasks outside the development lifecycle: `deep-research`,
`code-review`, `security-review`, `tdd`, `diagnose`, etc. Check the skill list
in the system prompt.

### Workflows

For tasks involving multiple independent steps, parallel research, or
large-scale analysis, use the `Workflow` tool.

Why:

- workflows fan out to many agents in parallel
- workflows handle scale that a single context window cannot
- deep research, codebase audits, migrations, and multi-angle reviews are often
  better as workflows than as a single-threaded session

`go-skill-eval` — runs the full go-* skill eval pipeline (structural checklist +
LLM-as-judge + adversarial A/B/C/D inputs). Invoke to validate skills after
changes.

`go-hook-eval` — runs the hook eval suite (27 cases across all go-beast hooks).
Invoke after changing any hook.

## Global Hooks

These hooks may be active in a hook-capable agent's lifecycle configuration.
Claude Code uses `~/.claude/settings.json`; Codex uses `~/.codex/hooks.json` or
inline `[hooks]` tables in `~/.codex/config.toml`.

| Hook | Event | Behavior |
|------|-------|----------|
| Go-beast sync | `SessionStart` | Syncs skills, workflows, hooks, global instructions, and hook config from go-beast repo |
| git-commit-guard | `PreToolUse (Bash)` | Blocks commits/staging of sensitive files and build artifacts |
| code-dedup-check | `PreToolUse (Edit/Write)` | Warns before creating functions/classes that already exist in the project |
| code-verify-flag | `PostToolUse (Edit/Write)` | Flags the project for post-session type/test verification |
| code-verify-run | `Stop` | Runs tsc/mypy/go vet/cargo check + tests when source files were modified |
| docs-update-flag | `PostToolUse (Edit/Write)` | Flags the project when source code files are modified (ignores .md/.rst/docs/) |
| docs-update-remind | `Stop` | Reminds to update README, docstrings, and CHANGELOG after code modifications |
| git-strip-coauthored | `PreToolUse (Bash)` | Blocks commits whose message contains a `Co-Authored-By` tag |
| git-commit-remind-flag | `PostToolUse (Edit/Write/MultiEdit)` | Flags the git repo when files are modified |
| git-commit-remind | `Stop` | Reminds the agent to ask about committing/pushing uncommitted changes and to use Conventional Commits |
| version-bump-remind | `Stop` | Reminds the agent to bump version when CHANGELOG.md has `[Unreleased]` content |

## MCP Tools

The following MCP servers are recommended. If a tool listed here is not
available, tell the user which one is missing and provide the package name so
they can install it for their agent. Do not silently fall back to a worse
alternative without noting the gap.

MCP servers are configured per-agent. The package names are standard across
agents — consult your agent's documentation for the exact install command
(e.g. Claude Code uses `claude mcp add`, Cursor uses its MCP settings panel,
etc.). Reference: https://modelcontextprotocol.io/quickstart/user

| MCP | When to use | If missing — tell the user |
|-----|-------------|------------|
| **filesystem** | Read, list, and write files under the user's home directory. Prefer over Bash for file operations that do not require shell execution. | Install `@modelcontextprotocol/server-filesystem`. Fall back to Bash `cat`/`ls`/`cp`. |
| **git** | Inspect history, status, diffs, and branches. Use for read operations; use Bash for destructive git operations requiring confirmation. | No install needed — use Bash `git` commands directly. |
| **repomix** | Pack and analyze entire codebases. Use when starting work on an unfamiliar repository or before large refactors. | Install `repomix` MCP, or run `npx repomix` manually and share the output. |
| **context7** | Fetch up-to-date library and framework documentation. Use before asserting external API behavior — training data may be outdated. | Install `@upstash/context7-mcp`. Without it, warn the user that docs may be outdated. |
| **sequential-thinking** | Decompose complex problems into chained steps. Use when a problem has multiple interdependent steps or high ambiguity. | Install `@modelcontextprotocol/server-sequential-thinking`. Reason step-by-step inline as fallback. |
| **playwright** | Automate and test browser interactions. Use to verify UI changes in a real browser, run E2E tests, take screenshots, or validate frontend behavior. | Install `@playwright/mcp`. |
| **duckduckgo-search** | Search the web for current information — security advisories, debugging, news, anything outside library docs. No API key required. | Install `duckduckgo-mcp-server`. |
| **shell** | Run long-lived or streaming shell commands with persistent session state. Use when a process produces output over time (builds, test runners, servers). | Use Bash with background execution as fallback. |
| **docker** | Inspect and manage Docker containers and images. Use when debugging containerized services without manual CLI chains. | Use Bash `docker` commands directly. |
