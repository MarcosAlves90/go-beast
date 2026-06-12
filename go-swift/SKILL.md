---
name: go-swift
version: 1.1.0
platform: Claude Code
description: "[Claude Code] Designs, writes, tests, and registers Claude Code hooks — shell scripts triggered by lifecycle events (SessionStart, PreToolUse, PostToolUse, Stop, SubagentStop, PreCompact). Produces hook scripts, wires them into settings.json, and verifies execution."
when_to_use: "Use when the user wants to automate a behavior on a Claude Code lifecycle event — before, after, or around tool calls, session start/stop, or compaction. Claude Code only: other agents do not have an equivalent hook system. Invoke after go-jay when the desired behavior cannot be expressed as instructions alone. Invoke before go-raven when hooks are part of the deployment or developer-setup story."
---

# go-swift — Claude Code Hook Authoring `[Claude Code only]`

go-swift reacts before the moment passes. It does not build features — it wires automated responses to Claude Code lifecycle events. This skill is specific to Claude Code and has no equivalent for other agents.

## Quick start

```
User: "Whenever Claude runs a bash command, log it to a file."
→ invoke go-swift
→ identify event → design script → write hook → wire settings.json → test
```

## Workflow

### 1. Identify the event

Map the user's intent to the correct Claude Code hook event:

| Event | Fires when |
|-------|-----------|
| `SessionStart` | A new Claude Code session begins |
| `PreToolUse` | Just before any tool call executes |
| `PostToolUse` | Just after a tool call completes |
| `Stop` | Claude produces a final response (non-subagent) |
| `SubagentStop` | A subagent produces a final response |
| `PreCompact` | Context is about to be compacted |

Checklist:
- [ ] Is the trigger a Claude Code lifecycle event, not a file system event or timer?
- [ ] Which specific event fires at the right moment?
- [ ] Does the hook need to block execution (`PreToolUse` with non-zero exit) or just observe?
- [ ] Does the hook need to read tool input from stdin (`PreToolUse`, `PostToolUse`)?

If the trigger cannot be mapped to one of these six events, stop — this is not a hook use case. Suggest an alternative (cron, file watcher, MCP tool).

### 2. Determine hook behavior

Decide what the hook does and its side effects:

- **Observer**: reads event data, logs or notifies — never exits non-zero
- **Blocker**: exits non-zero on `PreToolUse` to cancel the tool call — must output a human-readable reason to stdout
- **Mutator**: writes to files, calls external APIs, triggers side effects — must be idempotent

Checklist:
- [ ] Does it need the tool name, input, or output? (available via stdin JSON on Pre/PostToolUse)
- [ ] Should it block silently, block with message, or only observe?
- [ ] Could it run more than once for the same operation? Design for idempotency.
- [ ] Does it need to be fast? SessionStart blocks session load — keep it under 2s.

### 3. Write the hook script

Hook scripts are shell scripts (`bash` or `zsh`) placed in `~/.claude/hooks/`.

**Script skeleton for observer hooks:**
```bash
#!/usr/bin/env bash
# <what this hook does — one line>
# Event: <EventName>
# Reads stdin JSON for PreToolUse/PostToolUse; no stdin for SessionStart/Stop.

set -euo pipefail

# Read stdin if needed (PreToolUse / PostToolUse only)
# input=$(cat)
# tool_name=$(echo "$input" | jq -r '.tool_name // empty')

# Your logic here

exit 0
```

**Script skeleton for blocker hooks (PreToolUse only):**
```bash
#!/usr/bin/env bash
# Blocks <condition> — exits non-zero with reason.
# Event: PreToolUse

set -euo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

if [[ "$tool_name" == "Bash" ]]; then
  command=$(echo "$input" | jq -r '.tool_input.command // empty')
  if echo "$command" | grep -q "<forbidden_pattern>"; then
    echo "Hook blocked: <reason>"
    exit 1
  fi
fi

exit 0
```

Rules for scripts:
- Always `chmod +x` the script file.
- Use `set -euo pipefail` unless you intentionally want partial failures to pass.
- Parse stdin with `jq` — never `grep` or `sed` raw JSON.
- Write to stderr for debug output; write block reasons to stdout.
- Never hardcode absolute paths outside of `$HOME`-relative paths.

### 4. Wire the hook into settings.json

Hooks are registered in `~/.claude/settings.json` (global) or `.claude/settings.json` (project-local).

**Global hook entry structure:**
```json
{
  "hooks": {
    "<EventName>": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/<script-name>.sh",
            "statusMessage": "<message shown in UI while hook runs>"
          }
        ]
      }
    ]
  }
}
```

**With matcher (PreToolUse / PostToolUse only):**
```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "bash ~/.claude/hooks/<script-name>.sh"
    }
  ]
}
```

Checklist:
- [ ] Is the event key spelled exactly right (case-sensitive)?
- [ ] Is the command path correct relative to the user's `$HOME`?
- [ ] Does the hook need `continueOnBlock: true` to let the session continue even if the hook exits non-zero?
- [ ] Is `statusMessage` set for hooks that take more than ~0.5s?

### 5. Test the hook

Test before declaring done:

1. **Dry-run the script directly**: run `echo '<test-json>' | bash ~/.claude/hooks/<script>.sh` and verify exit code and output.
2. **Start a new session** (for SessionStart hooks) and confirm the status message appears.
3. **Trigger the event** manually in a test session — use a throw-away command for PreToolUse blockers.
4. **Check logs**: if the hook writes to a file, confirm the file has the expected content.
5. **Check for regressions**: verify the hook does not block legitimate operations.

For blocker hooks, test both the blocked path (non-zero exit, correct message) and the allowed path (exit 0, no message).

### 6. Register in the pack handoff

If this hook is part of a go-beast project workflow, add it to the project's handoff plan:

- Document the event, script name, and purpose in the project's `REQUIREMENTS.md` or `CLAUDE.md`.
- If the hook syncs from a shared repo (like go-beast), confirm the sync script (e.g., `sync-go-beast-skills.sh`) includes the new hook directory or file.
- Note whether this is a **global** hook (developer machine default) or **project-local** hook (checked into `.claude/`).

## Rules

- Do not write hooks for events that cannot be mapped to a Claude Code lifecycle event. Suggest the correct tool instead.
- Blocker hooks must exit non-zero AND write a human-readable message to stdout. Silent blocks are not acceptable.
- Never write a hook that modifies `settings.json` from within itself — that creates recursive configuration drift.
- Observer hooks must exit 0 unconditionally. A failing observer that blocks the tool call is a bug.
- Test every hook before marking the task done. "It should work" is not a test.

## Output

- `~/.claude/hooks/<name>.sh` — executable hook script
- Updated `~/.claude/settings.json` (or `.claude/settings.json`) — hook wired to the correct event
- Test evidence — manual run output confirming correct behavior for both happy path and error path

## Position in the pack

```
go-jay → go-swift → go-raven
```

- **go-jay** identifies that a behavior cannot be expressed as instructions alone and produces the updated context file.
- **go-swift** implements the automation as a hook script and wires it.
- **go-raven** includes hooks in CI/CD setup, dotfile provisioning, or developer onboarding scripts.

go-swift is also invoked on demand, independently of the full chain, whenever a user wants to add or modify a Claude Code hook.
