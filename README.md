# go-beast

A versioned skill pack for full-stack software development, from discovery to deployment.

Each skill in the pack is named `go-<animal>`. Each beast owns exactly one phase of the project lifecycle. Together they form a complete, opinionated pipeline that can be invoked in sequence or individually.

---

## Version

**1.5.2** — 2026-06-11

---

## Skills

| Skill | Animal | Phase | Unique responsibility |
|---|---|---|---|
| [go-hawk](go-hawk/SKILL.md) | Hawk | Discovery | Requirements elicitation, scope definition, handoff plan |
| [go-fox](go-fox/SKILL.md) | Fox | Architecture | Stack selection, ADRs, component diagrams, interface contracts |
| [go-beaver](go-beaver/SKILL.md) | Beaver | Scaffolding | Monorepo setup, tooling config, dev environment bootstrap |
| [go-wolf](go-wolf/SKILL.md) | Wolf | Backend | REST/GraphQL API, auth, business logic, server-side validation |
| [go-lynx](go-lynx/SKILL.md) | Lynx | Frontend | Component architecture, state management, API integration, a11y |
| [go-otter](go-otter/SKILL.md) | Otter | Database | Schema design, migrations, indexing, query review |
| [go-eagle](go-eagle/SKILL.md) | Eagle | Testing | Test pyramid, unit/integration/E2E strategy, CI gates |
| [go-bear](go-bear/SKILL.md) | Bear | Security | OWASP Top 10, secrets, dependency audit, threat model |
| [go-raven](go-raven/SKILL.md) | Raven | CI/CD | Pipeline design, environment strategy, release automation |
| [go-owl](go-owl/SKILL.md) | Owl | Documentation | README, API reference, ADRs, runbooks, changelog |
| [go-jay](go-jay/SKILL.md) | Jay | AI Context | CLAUDE.md, AGENTS.md, GEMINI.md authoring and synchronization |
| [go-mole](go-mole/SKILL.md) | Mole | Briefing | Documentation scan, project briefing for downstream skills |
| [go-smith](go-smith/SKILL.md) | Smith | Skill Authoring | Gap analysis, SKILL.md creation, pack integration (meta-skill) |
| [go-swift](go-swift/SKILL.md) | Swift | Hook Authoring | Claude Code hook scripts, settings.json wiring, lifecycle automation |
| [go-kite](go-kite/SKILL.md) | Kite | Architecture Audit | Health audit of existing systems: 5 dimensions, capability gaps, HTML report |

---

## Workflows

| Workflow | File | Purpose |
|---|---|---|
| [go-star-eval](workflows/go-star-eval.js) | `workflows/go-star-eval.js` | Eval pipeline: tests all go-* skills with structural checklist + LLM-as-judge + A/B/C benchmark. Supports `args.skills` filter for isolated runs. |

---

## Hooks

| Hook | File | Trigger | Purpose |
|---|---|---|---|
| sync-go-beast-skills | `hooks/sync-go-beast-skills.sh` | `SessionStart` | Symlinks skills/workflows/hooks + copies `CLAUDE.global.md` → `~/.claude/CLAUDE.md` |
| git-commit-guard | `hooks/git-commit-guard.sh` | `PreToolUse (Bash)` | Blocks commits/staging of sensitive files and build artifacts |
| code-dedup-check | `hooks/code-dedup-check.sh` | `PreToolUse (Edit/Write)` | Warns before creating functions/classes that already exist in the project |
| code-verify-flag | `hooks/code-verify-flag.sh` | `PostToolUse (Edit/Write)` | Flags the project for post-session type/test verification |
| code-verify-run | `hooks/code-verify-run.sh` | `Stop` | Runs tsc/mypy/go vet/cargo check + tests when source files were modified |
| docs-update-flag | `hooks/docs-update-flag.sh` | `PostToolUse (Edit/Write)` | Flags the project when source code files are modified (ignores .md/.rst/docs/) |
| docs-update-remind | `hooks/docs-update-remind.sh` | `Stop` | Reminds to update README, docstrings, and CHANGELOG after code modifications |

---

## Extensions

Optional tools that augment the pack's capabilities. Not phases — not required by any beast — but available to beasts when installed.

| Extension | Directory | What it adds |
|---|---|---|
| [beast-control](extensions/beast-control/README.md) | `extensions/beast-control/` | Firefox/Zen Browser MCP bridge — exposes `browser_*` tools so beasts can interact with the user's real browser (authenticated sessions, real DOM, screenshots). go-lynx, go-eagle, and go-bear use it when available; fall back to Playwright otherwise. |

**Installing beast-control:** see `extensions/beast-control/docs/SETUP.md`.

---

## Standard pipeline

```
go-hawk → go-fox → go-otter → go-beaver → go-wolf + go-lynx → go-eagle → go-bear → go-raven → go-owl
```

go-bear can be invoked earlier — and should be — whenever a feature involves auth, payments, PII, or file uploads.
go-owl can be invoked at any phase.

**Meta-skills** (invoked on demand, not bound to a phase):

```
go-jay  → go-swift → go-raven    (AI context + hooks + CI/CD onboarding)
go-smith                          (new skill creation, pack gap analysis)
go-mole                           (session briefing before any other beast)
go-kite                           (architecture audit before go-fox revisions)
```

---

## Design principles

1. **One beast, one responsibility.** No skill duplicates the work of another.
2. **Prerequisites are explicit.** Each skill states what it needs from previous beasts.
3. **Output is concrete.** Every skill produces named files. Nothing ends with "think about it."
4. **Security is not a phase.** go-bear can interrupt any beast at any time.
5. **Do not skip steps.** Each beast reduces the cost of every beast that follows.

---

## Installing in Claude Code

Clone the repo and run the sync hook once to wire everything up:

```bash
git clone <repo-url> ~/Documents/@cherry-c/go-beast
bash ~/Documents/@cherry-c/go-beast/hooks/sync-go-beast-skills.sh
```

Then add the hook to `~/.claude/settings.json` so it runs on every session start:

```json
{
  "hooks": {
    "SessionStart": [
      { "command": "bash ~/.claude/hooks/sync-go-beast-skills.sh" }
    ]
  }
}
```

After setup, all skills, workflows, and hooks are available automatically in every Claude Code session.

Skills invoke with `/go-hawk`, `/go-fox`, etc. Workflows run via the Workflow tool or `/workflows`.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
