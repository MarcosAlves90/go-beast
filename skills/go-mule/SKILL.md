---
name: go-mule
version: 1.0.0
description: "Initializes go-beast explicitly for a new agent session or environment: classifies the target harness, chooses between planning-only/manual/installer-backed setup, separates canonical core steps from optional harness wiring, and validates that skills, instructions, and optional integrations are actually ready."
when_to_use: "Use when a developer wants to bootstrap go-beast explicitly instead of relying on SessionStart automation, or when hooks are unavailable, untrusted, or undesirable. Invoke before go-mole on an unfamiliar repository and before go-jay or go-swift when baseline skill discovery, instructions, or optional harness wiring must exist first."
---

# go-mule — Agent Initialization & Instrumentation

go-mule carries the pack into place before the rest of the beasts start moving. It turns initialization into an explicit, repeatable workflow instead of hidden background sync.

## Quick start

```
User: "Initialize go-beast for Codex without relying on SessionStart hooks."
→ invoke go-mule
→ classify target and permissions → choose setup path → separate core from optional wiring → validate readiness
```

## Workflow

### 1. Classify the target and the allowed actions

Identify the initialization surface before proposing any step:

- [ ] Which agent or harness is being initialized? (`Codex`, `Claude Code`, plugin surface, or another agent)
- [ ] Is the request planning-only, read-only validation, or permission to change files / run commands?
- [ ] Is this a hookless environment, a hook-capable environment, or a mixed environment with partial support?
- [ ] Is initialization meant to be session-only, machine-level, or project-local?
- [ ] Does the user want the sync hook preserved as an option, or explicitly avoided?

If the user has not authorized file changes or command execution, constrain the output to a procedural plan only.

### 2. Define the canonical core initialization contract

Anchor the workflow in the real go-beast artifacts and separate them by responsibility:

- `skills/` — canonical skill source
- `AGENTS.global.md` and `AGENTS.bootstrap.md` — synced global instruction sources
- `scripts/install.mjs` — explicit installer entrypoint
- `plugins/go-beast/` — optional plugin adapter bundle
- `hooks/sync-go-beast-skills.sh` — optional SessionStart automation, not the only valid path

- [ ] Which of these artifacts are relevant to the target harness?
- [ ] Is bootstrap mode desired, or should the global instructions stay on the standard path?
- [ ] Is the plugin adapter needed, or is direct file-based skill loading enough?
- [ ] Which parts are agent-agnostic core setup versus harness-specific wiring?

Produce `INITIALIZATION PLAN` before suggesting any mutation.

### 3. Choose the explicit setup path

Select exactly one primary path and justify it:

1. **Planning-only path** — no mutation; produce repeatable steps and validation criteria.
2. **Installer-backed path** — use `scripts/install.mjs` when the environment can safely accept explicit installation.
3. **Manual path** — link or point the agent at `skills/`, copy the chosen global instructions file, and leave hooks/plugin wiring optional.
4. **Refresh path** — validate an existing installation, fix drift, and report only the missing pieces.

- [ ] Does the chosen path avoid unnecessary harness coupling?
- [ ] Can the same path be repeated safely in the same environment?
- [ ] If the path touches global files, has the user explicitly allowed that scope?
- [ ] If the path needs more than baseline initialization, should go-jay or go-swift be invoked next instead of folding that work into go-mule?

### 4. Execute or describe the core setup

The core setup must stay valid even when hooks are absent:

- Point the agent at the canonical `skills/` directory or run the explicit installer path.
- Choose between `AGENTS.global.md` and `AGENTS.bootstrap.md` based on the user's desired behavior.
- Record whether the environment should rely on manual invocation, installer-backed setup, or later hook automation.
- Keep all steps ordered, repeatable, and easy to re-run.

- [ ] If using `scripts/install.mjs`, specify the exact mode (`interactive`, `--all`, `--bootstrap`, or `--uninstall` when relevant).
- [ ] If using the manual path, name the concrete directories or files that must be pointed at or copied.
- [ ] If staying planning-only, make the operator sequence explicit enough that another agent could follow it without guessing.

Produce `CORE SETUP` as the exact ordered sequence or applied changes.

### 5. Isolate optional harness-specific wiring

Anything AI-surface-specific is additive, never core:

- **Codex**: optional `~/.codex/hooks.json` or `[hooks]` in `~/.codex/config.toml`; `/hooks` trust review after changes
- **Claude Code**: optional `~/.claude/settings.json` wiring
- **Plugin surfaces**: optional use of `plugins/go-beast/`
- **Bootstrap mode**: optional replacement of standard global instructions with `AGENTS.bootstrap.md`

- [ ] Which of these steps are safe and relevant for the current harness?
- [ ] Which ones should remain manual or deferred because the user only asked for explicit initialization?
- [ ] Does any step require go-jay for instruction editing or go-swift for hook authoring instead of ad-hoc edits here?

Produce `OPTIONAL HARNESS STEPS` separately from the core path. Never mix them into the baseline sequence.

### 6. Validate readiness and hand off

Initialization is not done until readiness is proven:

- [ ] Are the expected skills discoverable from `skills/` or the chosen install path?
- [ ] Is the correct global instruction file active?
- [ ] If optional hook wiring was touched, has the trust/review step been completed?
- [ ] Is there any drift between the explicit path and the optional sync-hook path?
- [ ] Which beast should run next: `go-mole`, `go-hawk`, `go-jay`, or `go-swift`?

Produce:
- `VALIDATION REPORT`
- `NEXT BEAST HANDOFF`

If readiness cannot be proven, mark the setup blocked and name the exact blocker.

## Rules

- Do not require SessionStart hooks. Hook automation is one valid path, not the baseline contract.
- Keep the core setup agent-agnostic. Put Codex-, Claude-, or plugin-specific wiring only under `OPTIONAL HARNESS STEPS`.
- Do not edit global instructions, hook config, or symlinks unless the user explicitly authorizes file changes or command execution.
- If initialization requires new or changed context files, invoke go-jay after the baseline setup. If it requires new or changed hook automation, invoke go-swift.
- Do not claim initialization is active until validation proves skill discovery, instruction loading, and any requested optional wiring are actually ready.

## Output

- `INITIALIZATION PLAN` — target harness, allowed actions, chosen explicit setup path, and bootstrap mode decision
- `CORE SETUP` — repeatable core initialization steps or applied changes for `skills/`, instruction files, and the installer path
- `OPTIONAL HARNESS STEPS` — Codex/Claude/plugin-specific wiring, trust review, and sync-hook tradeoffs
- `VALIDATION REPORT` — readiness evidence, drift findings, and exact blockers if setup is incomplete
- `NEXT BEAST HANDOFF` — whether `go-mole`, `go-hawk`, `go-jay`, or `go-swift` should run next

## Position in the pack

```
go-mule → go-mole / go-hawk
        └─► go-jay → go-swift (optional, when baseline initialization needs deeper customization)
```

- **go-mule** establishes explicit initialization and readiness.
- **go-mole** consumes the initialized context for repository discovery.
- **go-hawk** follows when the task itself is still underspecified.
- **go-jay** and **go-swift** only follow if baseline initialization needs context-file or hook customization.
