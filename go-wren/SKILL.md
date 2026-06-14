---
name: go-wren
version: 1.0.0
platform: Claude Code
description: "[Claude Code] Audits an existing Claude Code hook script, identifies the scope of a requested change (bug fix, behaviour change, threshold adjustment, new condition), applies the minimal edit, and re-validates with go-hook-eval. Never rewrites a working hook from scratch — preserves existing logic, comments, and exit-code contracts."
when_to_use: "Use when a Claude Code hook already exists and needs to be changed — the trigger condition is wrong, a new file type must be matched, a threshold changed, or a bug fixed. Invoke instead of go-swift when the hook file already exists. Invoke go-hook-eval after to confirm no regressions."
---

# go-wren — Hook Maintenance `[Claude Code only]`

go-wren patches what go-swift built. It does not design new hooks — it audits, edits, and re-validates existing ones. The discipline is surgical: change the minimum, preserve the contract, prove no regression.

## Quick start

```
User: "The docs-update-remind hook fires even for .md files — fix it."
→ invoke go-wren
→ read script → classify change → edit minimal diff → re-validate
```

## Workflow

### 1. Read and audit the existing hook

Before touching anything, understand what the hook currently does:

- [ ] Read the full script from `~/.claude/hooks/<name>.sh`
- [ ] Identify the event it handles (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, etc.)
- [ ] Map its current behaviour: what inputs does it read, what conditions does it check, what does it output, what exit codes does it use?
- [ ] Confirm the hook entry in `~/.claude/settings.json` — event key, command path, any matcher

Record the **current contract** in a short summary before writing anything:

```
Hook: <name>.sh
Event: <EventName>
Behaviour: <one sentence — what it does today>
Exit codes: <0 = …, 1 = …, 2 = …>
Known callers: <matchers, related hooks>
```

Do not proceed if the script does not exist or cannot be read.

### 2. Classify the requested change

Determine the change type — this sets the risk level and review depth:

| Type | Description | Risk |
|------|-------------|------|
| **Threshold** | Change a numeric or string constant (file extension list, size limit, pattern) | Low |
| **Condition** | Add or remove a branch (new file type to ignore, new blocked pattern) | Medium |
| **Behaviour** | Change what the hook outputs, which exit code it uses, or when it fires | High |
| **Bug fix** | Correct a logic error that causes incorrect blocking or silent failure | High |

Checklist for medium/high risk changes:
- [ ] Does the change affect any existing happy path (currently-passing operations)?
- [ ] Does the change affect the exit code contract? (changing exit 0 → exit 1 is breaking)
- [ ] Does any other hook depend on this hook's output or flag file?
- [ ] Is the hook referenced in `go-hook-eval.js`? If so, the test cases need updating too.

### 3. Write the minimal diff

Edit only what the change requires. Do not:

- Reformat unrelated lines
- Rename variables
- Add or remove unrelated comments
- Change `set -euo pipefail` or shebang unless that is the fix

Apply the edit with the `Edit` tool (not `Write`) unless the full file must be replaced.

After editing, verify:
- [ ] The script is still executable (`chmod +x` if it was not already)
- [ ] The exit-code contract is unchanged (unless the change explicitly alters it)
- [ ] All existing comment headers still describe the behaviour accurately — update only the lines that changed

### 4. Update go-hook-eval test cases (if needed)

If the change alters observable behaviour (new blocked pattern, different exit code, new flag file), the corresponding test case in `go-hook-eval.js` must be updated:

- [ ] Locate the test case(s) for this hook in `workflows/go-hook-eval.js`
- [ ] Update `expectExit`, `expectOutput`, `expectNoOutput`, or `name` as needed
- [ ] Add a new test case if the change introduces a new condition not previously tested
- [ ] Do not delete existing test cases that still describe valid behaviour

### 5. Re-validate

Run the hook directly to confirm the changed behaviour, then run the full eval:

**Direct test (always):**
```bash
echo '<test-json>' | bash ~/.claude/hooks/<name>.sh; echo "EXIT_CODE:$?"
```

Run at minimum:
- One case that triggers the new/fixed behaviour (must produce expected result)
- One case that exercises the unchanged happy path (must still exit 0)

**Full eval (for medium/high risk changes):**

Run `go-hook-eval` filtered to this hook:
```js
Workflow({ name: "go-hook-eval" })
```

All previously-passing cases must still pass.

### 6. Update documentation

If the change is user-visible (new blocked pattern, different message, new event):

- [ ] Update the hook's one-line comment at the top of the script
- [ ] Update the hooks table in `README.md` if the description changed
- [ ] Update `AGENTS.global.md` hooks table if it references this hook's behaviour
- [ ] Add a `CHANGELOG.md` entry under `[Unreleased]`

## Rules

- Do not rewrite a working hook from scratch. If a rewrite is needed, invoke go-swift instead.
- Never change the exit-code contract without explicitly stating the change and updating all dependent test cases.
- Apply edits with the `Edit` tool, not `Write`, unless the full file must be replaced.
- Every change must be validated with at least one direct shell test before marking done.
- Do not update `go-hook-eval.js` test cases without re-running the eval to confirm they pass.

## Output

- Modified `~/.claude/hooks/<name>.sh` — minimal diff applied, existing contract preserved
- Updated `workflows/go-hook-eval.js` — test cases reflect new behaviour (if applicable)
- Test evidence — direct shell run output for changed path and unchanged happy path
- Updated `CHANGELOG.md` entry (if behaviour changed)

## Position in the pack

```
go-swift → (hook in production) → go-wren → go-hook-eval
```

- **go-swift** creates hooks and wires them into `settings.json`.
- **go-wren** maintains hooks after they are in production — bug fixes, threshold changes, new conditions.
- **go-hook-eval** validates the full hook suite after any change.

go-wren is invoked on demand whenever an existing hook needs to change. It does not create new hook files — that is go-swift's job.
