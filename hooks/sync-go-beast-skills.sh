#!/usr/bin/env bash
# Syncs go-beast skills, workflows, and hooks into ~/.claude on session start.
# Run automatically via Claude Code SessionStart hook.

rm -f /tmp/.go-rhino-active

GO_BEAST_DIR="$HOME/Documents/@cherry-c/go-beast"
SKILLS_DIR="$HOME/.claude/skills"
WORKFLOWS_DIR="$HOME/.claude/workflows"
HOOKS_DIR="$HOME/.claude/hooks"

if [ ! -d "$GO_BEAST_DIR" ]; then
  exit 0
fi

# Sync skills (go-* directories)
for skill_dir in "$GO_BEAST_DIR"/go-*/; do
  [ -d "$skill_dir" ] || continue
  skill_name=$(basename "$skill_dir")
  target="$SKILLS_DIR/$skill_name"
  if [ ! -e "$target" ]; then
    ln -s "$skill_dir" "$target"
    echo "go-beast: linked skill → $skill_name"
  fi
done

# Sync workflows (*.js files)
mkdir -p "$WORKFLOWS_DIR"
for workflow_file in "$GO_BEAST_DIR"/workflows/*.js; do
  [ -f "$workflow_file" ] || continue
  workflow_name=$(basename "$workflow_file")
  target="$WORKFLOWS_DIR/$workflow_name"
  if [ ! -e "$target" ]; then
    ln -s "$workflow_file" "$target"
    echo "go-beast: linked workflow → $workflow_name"
  fi
done

# Sync hooks (*.sh files, except this script itself)
for hook_file in "$GO_BEAST_DIR"/hooks/*.sh; do
  [ -f "$hook_file" ] || continue
  hook_name=$(basename "$hook_file")
  target="$HOOKS_DIR/$hook_name"
  # Skip if this is the sync script itself (avoid overwriting a running script)
  if [ "$hook_name" = "sync-go-beast-skills.sh" ] && [ -e "$target" ]; then
    continue
  fi
  if [ ! -e "$target" ]; then
    ln -s "$hook_file" "$target"
    echo "go-beast: linked hook → $hook_name"
  fi
done

# Sync AGENTS.global.md → ~/.claude/CLAUDE.md
GLOBAL_MD="$GO_BEAST_DIR/AGENTS.global.md"
if [ -f "$GLOBAL_MD" ]; then
  cp "$GLOBAL_MD" "$HOME/.claude/CLAUDE.md"
  echo "go-beast: synced AGENTS.global.md → ~/.claude/CLAUDE.md"
fi
