---
name: go-marten
version: 1.0.0
description: Plans, creates, validates, and cleans up isolated git worktrees for parallel development, risky refactors, or review staging; records provenance and safe cleanup rules.
when_to_use: Use when a developer needs isolated branch work, wants to avoid polluting the current checkout, or needs a safe workspace for parallel tasks or reviews. Invoke before go-wolf, go-lynx, go-tern, or go-eagle when the current checkout should remain untouched. Invoke before go-raven when worktree-based workflows need onboarding or automation.
---

# go-marten — Git Worktrees

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-marten`
- **Alias:** `worktree` (documentation only)
- **Phase:** meta
- **When to use:** Isolation is needed for parallel; risky; or review work
- **Prerequisites:** Clean or explicitly scoped repository state
- **Input artifacts:** Git repository
- **Output artifacts:** Worktree provenance and cleanup report
- **Gates:** Owned worktree cleanup only
- **Dependencies:** None
- **Conflicts:** None

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-marten moves through the branches without damaging the forest floor. It
creates isolated workspaces, records provenance, and never cleans up work it
does not own.

## Quick start

```
User: "Set up an isolated branch for this feature."
→ invoke go-marten
→ inspect git state → choose branch/worktree strategy → create and validate worktree → document cleanup rules
```

## Workflow

### 1. Inspect the repository state

- [ ] Is the current directory a git repository?
- [ ] Is the agent already inside a linked worktree?
- [ ] Does the requested work need a new branch, an existing branch, or review-only isolation?

If the repository is dirty, record that risk before creating a new worktree.

### 2. Choose a safe worktree strategy

- [ ] Use a dedicated `.worktrees/` directory inside the repo unless the user requests another location
- [ ] Choose a branch name that matches the task or review scope
- [ ] Record who created the worktree and for what purpose

Prefer deterministic locations over ad-hoc temporary folders.

### 3. Create and validate the worktree

- [ ] Confirm the branch target and base commit
- [ ] Create the worktree
- [ ] Verify the branch, remote tracking status, and working-tree cleanliness
- [ ] Run the minimum project bootstrap needed to prove the workspace is usable

If creation fails, stop and fix the cause before proceeding.

### 4. Define provenance and cleanup rules

- [ ] Mark whether the worktree was created by go-marten or pre-existed
- [ ] List the exact path and branch
- [ ] State when cleanup is safe and when it is forbidden

Cleanup must be provenance-based. A worktree the skill did not create is not
the skill's to remove.

### 5. Close out or hand off

- [ ] If the user wants cleanup, verify branch state first
- [ ] Refuse cleanup if unmerged or uncommitted work would be lost
- [ ] Hand off the isolated path to the next beast

## Rules

- Do not create or remove a worktree without an explicit branch and path decision.
- Do not delete a worktree the skill did not create unless the user explicitly overrides that safeguard.
- Do not clean up a worktree with uncommitted or unmerged work.
- Every worktree operation must report branch, path, and provenance.

## Output

- `WORKTREE PLAN` block — branch, base, path, and reason for isolation
- `WORKTREE STATE` block — creation result, cleanliness, tracking status, and provenance
- `CLEANUP RULES` block — exact conditions under which cleanup is safe or forbidden

## Position in the pack

```
go-hawk / go-lark / go-fox → go-marten → go-wolf + go-lynx + go-tern + go-eagle
```

- earlier beasts define what the isolated work should achieve
- go-marten creates the isolated workspace
- implementation, review, and testing beasts operate inside that workspace
