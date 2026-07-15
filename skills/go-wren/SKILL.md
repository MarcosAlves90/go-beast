---
name: go-wren
version: 1.2.0
platform: Claude Code, Codex
description: "Audits an existing lifecycle hook script for Claude Code or Codex, records the current contract (hook name, event, behaviour, exit codes), classifies the requested change (threshold / condition / behaviour / bug fix), applies the minimal edit as an explicit before/after diff, and re-validates with direct shell tests. Never rewrites a working hook from scratch — every change must be proven by running the hook with real JSON inputs."
when_to_use: "Use when a Claude Code or Codex hook already exists and needs to be changed — the trigger condition is wrong, a new file type must be matched, a threshold changed, or a bug fixed. Invoke instead of go-swift when the hook file already exists. Invoke go-hook-eval after to confirm no regressions."
---

# go-wren — Hook Maintenance `[Claude Code · Codex]`

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-wren`
- **Alias:** `hook-maintenance` (documentation only)
- **Phase:** hooks
- **When to use:** An existing lifecycle hook needs a behavior or bug fix
- **Prerequisites:** Existing hook contract
- **Input artifacts:** Hook script and direct tests
- **Output artifacts:** Minimal hook diff and test evidence
- **Gates:** Exit-code and happy-path compatibility
- **Dependencies:** None
- **Conflicts:** go-swift

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

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

- [ ] Read the full script from `~/.claude/hooks/<name>.sh` (or the provided hook content in eval context)
- [ ] For Codex hooks, also check `~/.codex/hooks/<name>.sh` or the project-local `.codex/hooks/<name>.sh` path.
- [ ] Identify the event it handles (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, etc.)
- [ ] Map its current behaviour: what inputs does it read, what conditions does it check, what does it output, what exit codes does it use?
- [ ] Confirm the hook entry in the target agent's config — Claude Code `settings.json`, Codex `hooks.json`, or Codex inline `[hooks]` in `config.toml`; record event key, command path, matcher, timeout, and status message.

Produce the **HOOK CONTRACT** block as the first artifact — always, before any edit:

```
## HOOK CONTRACT

Hook:     <name>.sh
Event:    <EventName>
Trigger:  <what causes it to fire — tool name, matcher, or always>
Behaviour: <one sentence — what it does today>
Exit codes:
  0 = <condition — e.g., "file is not a source file or no violation found">
  1 = <condition — e.g., "violation detected, tool use blocked">
  2 = <condition — e.g., "flag file present, re-triggers Claude">
Side effects: <flag files written, files modified, none>
Test cases in go-hook-eval.js: <yes — N cases / no>
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

**Hook input mechanics (read before writing any hook code):**

Claude Code and Codex pass event data to command hooks via **stdin as JSON** — not environment variables, not positional arguments. The hook reads it with `input=$(cat)`. The JSON shape differs by event and agent, so inspect the existing hook and test with realistic input before editing:

| Event | stdin shape |
|-------|-------------|
| `PreToolUse` / `PostToolUse` | `{"tool_name":"Bash","tool_input":{...}}` |
| `Stop` / `SubagentStop` | `{"stop_hook_active":true/false}` |
| `SessionStart` | `{}` (empty or minimal) |
| `PermissionRequest` (Codex) | approval request JSON for the requested tool action |
| `UserPromptSubmit` (Codex) | prompt submission JSON |

Any proposed hook code that reads from `$TOOL_INPUT`, `$1`, or environment variables is incorrect. If the existing script uses `input=$(cat)` + `jq`, preserve that pattern.

**Platform compatibility (macOS / Darwin):**

`grep -P` (PCRE) is not available on macOS's native BSD `grep`. Hooks that use `grep -P` will silently fail on macOS with `|| true` fallbacks — the hook runs but never matches. Use POSIX ERE (`grep -E`) instead. All existing go-beast hooks use `grep -E` or `grep -qE` — preserve that pattern. If the existing script uses `grep -E`, do not change it to `grep -P`.

**Common pitfalls in strict bash (`set -euo pipefail`):**

These patterns cause silent failures or wrong behavior in hooks that use `set -euo pipefail`. Check for them before and after any edit.

| Pitfall | Wrong | Correct |
|---------|-------|---------|
| Capturing exit code of a command that may fail | `cmd \|\| var=$?` — if `cmd` exits 0, `var` stays at its initial value (not 0 from the cmd), making the check wrong | `var=0; cmd \|\| var=$?` — initialize before, capture only on failure |
| Using `||` to suppress failure in a pipeline | `cmd1 \| cmd2 \|\| true` — `pipefail` propagates the first failure even with `\|\| true` at the end | `cmd1 \| cmd2` with `set +o pipefail` around the block, or restructure to avoid the pipe |
| Running `git check-ignore` on a non-existent path | Exit 128 (can't `cd` to a missing directory) — `if git -C "$dir" ...` silently skips the block when `$dir` doesn't exist | Walk up to the nearest existing ancestor: `while [[ ! -d "$dir" ]]; do dir=$(dirname "$dir"); done` |
| `git check-ignore` exit code semantics | Exit 0 = **ignored**, exit 1 = **not ignored** — the opposite of what most boolean checks expect | `is_ignored=0; git check-ignore -q "$path" 2>/dev/null \|\| is_ignored=$?; [[ $is_ignored -eq 0 ]] && exit 0` |
| Unbound variable with `set -u` | Using `${var}` before assignment when the variable might be empty causes immediate exit | Initialize all variables before use: `var=""` or `var=0` |
| `$(pwd)` in PostToolUse hooks | Returns the hook process's working directory (usually `$HOME`), not the project directory | Derive from `file_path`: `$(dirname "$file_path")` or `git rev-parse --show-toplevel` |

**Claude Code settings.json hook registration schema:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/<name>.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/<name>.sh" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/<name>.sh" }]
      }
    ]
  }
}
```

**Codex hooks.json hook registration schema:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "bash ~/.codex/hooks/<name>.sh" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "bash ~/.codex/hooks/<name>.sh" }]
      }
    ]
  }
}
```

**Codex inline TOML hook registration schema:**

```toml
[[hooks.PreToolUse]]
matcher = "^Bash$"

[[hooks.PreToolUse.hooks]]
type = "command"
command = "bash ~/.codex/hooks/<name>.sh"
```

Stop/UserPromptSubmit hooks do **not** use a `matcher` field in Codex. In Claude Code, Stop/SessionStart/SubagentStop/PreCompact hooks fire unconditionally. PreToolUse and PostToolUse hooks use `matcher` to filter by tool name. The outer array element has a `matcher` key and a `hooks` array — there is no additional nesting layer.

First, show the **before/after diff** explicitly as a named artifact before applying it:

```diff
## PROPOSED DIFF — <hook-name>.sh

--- before
+++ after
@@ -<line>,<count> +<line>,<count> @@
 <context line>
-<removed line>
+<added line>
 <context line>
```

Rules for the edit:
- Do not reformat unrelated lines
- Do not rename variables
- Do not add or remove unrelated comments
- Do not change `set -euo pipefail` or shebang unless that is the fix

Apply the edit with the `Edit` tool (not `Write`) unless the full file must be replaced.

After editing, verify:
- [ ] The script is still executable (`chmod +x` if it was not already)
- [ ] The exit-code contract is unchanged (unless the change explicitly alters it)
- [ ] All existing comment headers still describe the behaviour accurately — update only the lines that changed
- [ ] For Codex hooks, note whether `/hooks` trust review is required because the hook definition or script changed.

### 4. Update go-hook-eval test cases (if needed)

If the change alters observable behaviour (new blocked pattern, different exit code, new flag file), the corresponding test case in `go-hook-eval.js` must be updated:

- [ ] Locate the test case(s) for this hook in `workflows/go-hook-eval.js`
- [ ] Update `expectExit`, `expectOutput`, `expectNoOutput`, or `name` as needed
- [ ] Add a new test case if the change introduces a new condition not previously tested
- [ ] Do not delete existing test cases that still describe valid behaviour

### 5. Re-validate

Produce **TEST EVIDENCE** as a named artifact — show the actual command and its output, not a description of what should happen.

**Direct test (always — both cases required):**

```bash
# Case 1: new/fixed behaviour — must produce expected result
echo '{"tool_name":"Edit","tool_input":{"file_path":"/workspace/src/app.<ext>"}}' \
  | bash ~/.claude/hooks/<name>.sh; echo "EXIT_CODE:$?"
# Expected: EXIT_CODE:<n>, <flag or output if applicable>

# Case 2: unchanged happy path — must still exit 0
echo '{"tool_name":"Edit","tool_input":{"file_path":"/workspace/README.md"}}' \
  | bash ~/.claude/hooks/<name>.sh; echo "EXIT_CODE:$?"
# Expected: EXIT_CODE:0
```

Show the commands with real JSON and the expected exit codes filled in. In eval context where the shell cannot run, write the commands as-if executed and state the expected output — mark them `(simulated — cannot execute in eval context)` rather than omitting them.

**Full eval (for medium/high risk changes):**

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

- If the hook file does not exist, stop immediately. Tell the user the hook is not deployed and invoke go-swift to create it. go-wren only works on existing hooks.
- Do not rewrite a working hook from scratch. If a rewrite is needed, invoke go-swift instead.
- Never change the exit-code contract without explicitly stating the change and updating all dependent test cases.
- Apply edits with the `Edit` tool, not `Write`, unless the full file must be replaced.
- Every change must be validated with at least one direct shell test before marking done. In eval context where the shell cannot execute, write the test commands with expected outputs and mark them `(simulated — eval context)`. Never omit the TEST EVIDENCE block.
- Do not update `go-hook-eval.js` test cases without re-running the eval to confirm they pass.
- Hook input always arrives via stdin JSON — never `$TOOL_INPUT`, `$1`, or environment variables. Any generated hook code using those patterns is a bug.
- For Codex hooks, do not claim the changed hook will run until its updated definition has been reviewed and trusted with `/hooks`.

## Output

- **HOOK CONTRACT** block — current behaviour documented before any edit (always required)
- **PROPOSED DIFF** block — before/after diff shown explicitly before applying (always required)
- Modified hook script (`~/.claude/hooks/<name>.sh`, `~/.codex/hooks/<name>.sh`, or project-local equivalent) — minimal diff applied, existing contract preserved
- **TEST EVIDENCE** block — shell commands with expected outputs for changed path and happy path (always required; mark simulated if shell is unavailable)
- Updated `workflows/go-hook-eval.js` — test cases reflect new behaviour (if applicable)
- Updated `CHANGELOG.md` entry (if behaviour changed)

## Position in the pack

```
go-swift → (hook in production) → go-wren → go-hook-eval
```

- **go-swift** creates hooks and wires them into the target agent's hook config.
- **go-wren** maintains hooks after they are in production — bug fixes, threshold changes, new conditions.
- **go-hook-eval** validates the full hook suite after any change.

go-wren is invoked on demand whenever an existing hook needs to change. It does not create new hook files — that is go-swift's job.
