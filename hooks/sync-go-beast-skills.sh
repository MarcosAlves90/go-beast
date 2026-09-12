#!/usr/bin/env bash
# Syncs go-beast skills, workflows, hooks, and global instructions on session start.
# Run automatically via Claude Code, Codex, or Copilot CLI SessionStart hook.

rm -f /tmp/.go-rhino-active

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [[ -L "$SCRIPT_PATH" ]]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
GO_BEAST_DIR="${GO_BEAST_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
CLAUDE_WORKFLOWS_DIR="$HOME/.claude/workflows"

if [ ! -d "$GO_BEAST_DIR" ]; then
  exit 0
fi

# Reconcile skills and hooks through the persisted per-agent profile. This keeps
# disabled assets disabled across future SessionStart runs.
for agent_name in claude-code codex copilot; do
  if ! node "$GO_BEAST_DIR/scripts/integration-profile.mjs" sync \
    --agent "$agent_name" \
    --repo "$GO_BEAST_DIR" \
    --home "$HOME" \
    --format json >/dev/null; then
    exit 1
  fi
done

# Sync workflows (*.js files) into Claude only
mkdir -p "$CLAUDE_WORKFLOWS_DIR"
for target in "$CLAUDE_WORKFLOWS_DIR"/*.js; do
  [ -L "$target" ] || continue
  dest=$(readlink "$target")
  [[ "$dest" == "$GO_BEAST_DIR/workflows/"* ]] || continue
  [ -f "$dest" ] || { rm "$target"; echo "go-beast: removed stale workflow symlink → $(basename "$target")"; }
done
for workflow_file in "$GO_BEAST_DIR"/workflows/*.js; do
  [ -f "$workflow_file" ] || continue
  workflow_name=$(basename "$workflow_file")
  target="$CLAUDE_WORKFLOWS_DIR/$workflow_name"
  if [ ! -e "$target" ]; then
    ln -s "$workflow_file" "$target"
    echo "go-beast: linked workflow → $workflow_name"
  fi
done

# Sync AGENTS.global.md or AGENTS.bootstrap.md → Claude, Codex, and Copilot global instructions
BOOTSTRAP_MARKER="$HOME/.go-beast/bootstrap.enabled"
GLOBAL_MD="$GO_BEAST_DIR/AGENTS.global.md"
if [ -f "$BOOTSTRAP_MARKER" ] && [ -f "$GO_BEAST_DIR/AGENTS.bootstrap.md" ]; then
  GLOBAL_MD="$GO_BEAST_DIR/AGENTS.bootstrap.md"
fi
if [ -f "$GLOBAL_MD" ]; then
  mkdir -p "$HOME/.claude" "$HOME/.codex" "$HOME/.copilot/instructions"
  cp "$GLOBAL_MD" "$HOME/.claude/CLAUDE.md"
  cp "$GLOBAL_MD" "$HOME/.codex/AGENTS.md"
  cp "$GLOBAL_MD" "$HOME/.copilot/instructions/go-beast.md"
  echo "go-beast: synced $(basename "$GLOBAL_MD") → ~/.claude/CLAUDE.md"
  echo "go-beast: synced $(basename "$GLOBAL_MD") → ~/.codex/AGENTS.md"
  echo "go-beast: synced $(basename "$GLOBAL_MD") → ~/.copilot/instructions/go-beast.md"
fi
