---
name: go-swift
version: 1.2.0
platform: Claude Code, Codex
description: "Designs, writes, tests, and registers lifecycle hooks for hook-capable coding agents — currently Claude Code and Codex. Produces hook scripts, wires them into the agent's hook configuration, and verifies execution."
when_to_use: "Use when the user wants to automate a behavior on a supported agent lifecycle event — before, after, or around tool calls, session start/stop, compaction, or user prompt submission. Supported targets: Claude Code and Codex. Invoke after go-jay when the desired behavior cannot be expressed as instructions alone. Invoke before go-raven when hooks are part of the deployment or developer-setup story."
---

# go-swift — Lifecycle Hook Authoring `[Claude Code · Codex]`

<!-- BEGIN GENERATED: skill-contract -->
## Generated skill contract

- **ID:** `go-swift`
- **Alias:** `hook-authoring` (documentation only)
- **Phase:** hooks
- **When to use:** A new lifecycle automation is needed
- **Prerequisites:** Target harness and event
- **Input artifacts:** Hook behavior contract
- **Output artifacts:** Hook script and wiring
- **Gates:** Direct happy and blocked-path tests
- **Dependencies:** go-jay
- **Conflicts:** go-wren

The manifest defines this contract; the remainder of this skill defines how to fulfill it.
<!-- END GENERATED: skill-contract -->

go-swift reacts before the moment passes. It does not build features — it wires automated responses to lifecycle events in hook-capable coding agents. Claude Code and Codex use different configuration files, so choose the target agent before writing the hook.

## Quick start

```
User: "Whenever Claude runs a bash command, log it to a file."
→ invoke go-swift
→ identify target agent and event → design script → write hook → wire hook config → test
```

## Workflow

### 1. Identify the event

Map the user's intent to the correct lifecycle event for the target agent:

| Event | Fires when |
|-------|-----------|
| `SessionStart` | A new session begins |
| `PreToolUse` | Just before any tool call executes |
| `PostToolUse` | Just after a tool call completes |
| `Stop` | The agent produces a final response (non-subagent) |
| `SubagentStop` | A subagent produces a final response |
| `PreCompact` | Context is about to be compacted |
| `PermissionRequest` | Codex asks whether a tool action should be approved |
| `PostCompact` | Codex finishes compaction |
| `UserPromptSubmit` | Codex receives a user prompt |
| `SubagentStart` | Codex starts a subagent |

Checklist:
- [ ] Is the target agent Claude Code or Codex?
- [ ] Is the trigger a supported lifecycle event for that agent, not a file system event or timer?
- [ ] Which specific event fires at the right moment?
- [ ] Does the hook need to block execution (`PreToolUse` with non-zero exit) or just observe?
- [ ] Does the hook need to read tool input from stdin (`PreToolUse`, `PostToolUse`)?

If the trigger cannot be mapped to a supported lifecycle event for the target agent, stop — this is not a hook use case. Suggest an alternative (cron, file watcher, MCP tool).

### 2. Determine hook behavior

Decide what the hook does and its side effects:

- **Observer**: reads event data, logs or notifies — never exits non-zero
- **Blocker**: exits non-zero on `PreToolUse` to cancel the tool call — must output a human-readable reason to stdout
- **Mutator**: writes to files, calls external APIs, triggers side effects — must be idempotent

Checklist:
- [ ] Does it need the tool name, input, or output? (available via stdin JSON on Pre/PostToolUse)
- [ ] Should it block silently, block with message, or only observe?
- [ ] Could it run more than once for the same operation? Design for idempotency.
- [ ] Does it need to be fast? `SessionStart` blocks session load — keep it under 2s.

### 3. Write the hook script

Hook scripts are shell scripts (`bash` or `zsh`) placed in the target agent's hook script directory:

| Agent | Script directory |
|-------|------------------|
| Claude Code | `~/.claude/hooks/` |
| Codex | `~/.codex/hooks/` |

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

### 4. Wire the hook into agent config

Hooks are registered in the target agent's lifecycle configuration:

| Agent | Global config | Project-local config |
|-------|---------------|----------------------|
| Claude Code | `~/.claude/settings.json` | `.claude/settings.json` |
| Codex | `~/.codex/hooks.json` or `[hooks]` in `~/.codex/config.toml` | `.codex/hooks.json` or `[hooks]` in `.codex/config.toml` |

**Claude Code global hook entry structure:**
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

**Codex hooks.json entry structure:**
```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "<matcher or omit when unsupported>",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.codex/hooks/<script-name>.sh",
            "statusMessage": "<message shown in UI while hook runs>"
          }
        ]
      }
    ]
  }
}
```

**Codex inline TOML structure:**
```toml
[[hooks.PreToolUse]]
matcher = "^Bash$"

[[hooks.PreToolUse.hooks]]
type = "command"
command = "bash ~/.codex/hooks/<script-name>.sh"
statusMessage = "Checking Bash command"
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
- [ ] Does the matcher syntax match the target agent's supported matcher values?
- [ ] For Codex, will the user review and trust the hook with `/hooks` after configuration?
- [ ] For Claude Code, does the hook need `continueOnBlock: true` to let the session continue even if the hook exits non-zero?
- [ ] Is `statusMessage` set for hooks that take more than ~0.5s?

### 5. Test the hook

Test before declaring done:

1. **Dry-run the script directly**: run `echo '<test-json>' | bash <agent-hook-dir>/<script>.sh` and verify exit code and output.
2. **Start a new session** (for SessionStart hooks) and confirm the status message appears.
3. **Trigger the event** manually in a test session — use a throw-away command for PreToolUse blockers.
4. **Codex trust review**: for Codex hooks, run `/hooks` and confirm the hook is reviewed and trusted before expecting it to execute.
5. **Check logs**: if the hook writes to a file, confirm the file has the expected content.
6. **Check for regressions**: verify the hook does not block legitimate operations.

For blocker hooks, test both the blocked path (non-zero exit, correct message) and the allowed path (exit 0, no message).

### 6. Register in the pack handoff

If this hook is part of a go-beast project workflow, add it to the project's handoff plan:

- Document the event, script name, target agent, and purpose in the project's `REQUIREMENTS.md`, `CLAUDE.md`, or `AGENTS.md`.
- If the hook syncs from a shared repo (like go-beast), confirm the sync script (e.g., `sync-go-beast-skills.sh`) includes the new hook directory or file.
- Note whether this is a **global** hook (developer machine default) or **project-local** hook (checked into `.claude/` or `.codex/`).

## Rules

- Do not write hooks for events that cannot be mapped to a supported lifecycle event for the target agent. Suggest the correct tool instead.
- Blocker hooks must exit non-zero AND write a human-readable message to stdout. Silent blocks are not acceptable.
- Never write a hook that modifies its own hook configuration from within itself — that creates recursive configuration drift.
- Observer hooks must exit 0 unconditionally. A failing observer that blocks the tool call is a bug.
- Codex hooks must include a trust-review step using `/hooks` after configuration; installing the script file alone is not enough.
- Test every hook before marking the task done. "It should work" is not a test.

## Output

- `<agent-hook-dir>/<name>.sh` — executable hook script
- Updated hook configuration — `~/.claude/settings.json`, `.claude/settings.json`, `~/.codex/hooks.json`, `.codex/hooks.json`, or inline `[hooks]` in Codex `config.toml`
- Test evidence — manual run output confirming correct behavior for both happy path and error path

## Position in the pack

```
go-jay → go-swift → go-raven
```

- **go-jay** identifies that a behavior cannot be expressed as instructions alone and produces the updated context file.
- **go-swift** implements the automation as a hook script and wires it.
- **go-raven** includes hooks in CI/CD setup, dotfile provisioning, or developer onboarding scripts.

go-swift is also invoked on demand, independently of the full chain, whenever a user wants to add or modify a supported lifecycle hook.
