---
name: go-beaver
version: 1.1.0
description: Creates a working, runnable project skeleton — monorepo or multi-repo structure, dependency install, linter, formatter, Git hooks, env files, and dev server validation.
when_to_use: Use when starting a new project from scratch or restructuring an existing repo layout. Invoke after go-fox has produced STACK.md. The setup-pre-commit skill can be loaded for Git hook configuration if available.
---

# go-beaver — Scaffolding & Project Init

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-beaver`
- **Alias:** `scaffold` (documentation only)
- **Phase:** scaffolding
- **When to use:** A new project or repository restructure
- **Prerequisites:** STACK.md from go-fox
- **Input artifacts:** STACK.md
- **Output artifacts:** Runnable repository skeleton
- **Gates:** Install and startup validation
- **Dependencies:** go-fox
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-beaver builds the dam before the water flows. It takes the stack decision from go-fox and produces a working, runnable project skeleton that every other beast can build on.

## Quick start

```
Prerequisites: STACK.md from go-fox
→ invoke go-beaver
→ scaffold → configure tooling → git init → verify dev server boots
```

## Workflow

### 1. Determine structure

Choose based on project scope:

| Signal | Structure |
|---|---|
| Single service or simple app (one frontend or one API) | **Single-repo** — flat layout, no workspaces |
| Full-stack with shared code between frontend and backend | **Monorepo** — `pnpm workspaces` or `turborepo` |
| Multiple independent services with separate deploy cycles | **Multi-repo** — one repo per service, shared packages in a registry |

**Single-repo layout** (simple projects):
```
/
├── src/
├── docs/
├── .github/workflows/
├── .env.example
└── package.json
```

**Monorepo layout** (full-stack projects):
```
/
├── apps/
│   ├── web/          # frontend
│   └── api/          # backend
├── packages/
│   ├── ui/           # shared components
│   ├── types/        # shared TypeScript types
│   └── config/       # shared tooling configs
├── docs/
├── .github/workflows/
├── .env.example
├── package.json
└── turbo.json
```

Document the choice and reason in `docs/SETUP.md`.

### 2. Scaffold each app

Run the canonical scaffolding command (`pnpm create next-app`, `pnpm create vite`, `cargo init`…). Confirm it boots without errors before proceeding.

### 3. Configure tooling

- [ ] **Linter**: ESLint (JS/TS), golangci-lint (Go), ruff (Python)
- [ ] **Formatter**: Prettier, gofmt, black — config in root
- [ ] **Type checking**: `tsc --noEmit` as a CI step
- [ ] **Git hooks**: use the `setup-pre-commit` skill
- [ ] **EditorConfig**: `.editorconfig` for cross-editor consistency

### 4. Configure environment

- Create `.env.example` with every required variable (no real values)
- Create `.env.local` (gitignored) for local dev
- Document each variable: name, purpose, required/optional, example value

### 5. Validate

- [ ] `pnpm dev` (or equivalent) starts without errors
- [ ] `pnpm lint` passes on fresh scaffold
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (even if zero tests)
- [ ] Initial commit is clean

### 6. Produce SETUP.md

`docs/SETUP.md` must include: prerequisites, step-by-step local setup, available scripts, how to add a new package/app.

## Rules

- Never commit `.env` files with real secrets.
- Never scaffold more than what the stack requires.
- If the scaffold command fails, fix before continuing — do not paper over.
- Repo must be in a clean, runnable state before handing off to go-wolf or go-lynx.

## Output

- Working project skeleton, runnable locally
- `docs/SETUP.md`
- `.env.example` — complete and documented
