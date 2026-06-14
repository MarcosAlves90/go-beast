#!/usr/bin/env bash
# go-beast local installer
# Symlinks skills (all agents), hooks, and workflows (Claude Code only).
# Copies AGENTS.global.md to each agent's expected global instructions file.
# Usage: bash scripts/install.sh [--all] [--uninstall]

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
info() { echo -e "  ${CYAN}→${RESET} $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $*"; }
err()  { echo -e "  ${RED}✗${RESET} $*"; }
header() { echo -e "\n${BOLD}$*${RESET}"; }

# ── Agent registry ────────────────────────────────────────────────────────────
# format: "display_name:skills_dir:hooks_dir:workflows_dir:global_md_dest"
# hooks_dir and workflows_dir are empty for agents that don't support them.
declare -A AGENT_SKILLS_DIR=(
  [claude-code]="$HOME/.claude/skills"
  [cursor]="$HOME/.cursor/skills"
  [gemini]="$HOME/.gemini/skills"
  [cline]="$HOME/.cline/skills"
  [copilot]="$HOME/.github/copilot/skills"
  [codex]="$HOME/.codex/skills"
  [agents]="$HOME/.agents/skills"
)

# Only Claude Code supports hooks and workflows
CLAUDE_HOOKS_DIR="$HOME/.claude/hooks"
CLAUDE_WORKFLOWS_DIR="$HOME/.claude/workflows"

# Global instructions file per agent (where AGENTS.global.md is copied to)
# Each agent reads a different filename for global AI instructions.
declare -A AGENT_GLOBAL_MD=(
  [claude-code]="$HOME/.claude/CLAUDE.md"
  [cursor]="$HOME/.cursor/rules"           # Cursor uses .cursor/rules (plain text)
  [gemini]="$HOME/.gemini/GEMINI.md"
  [cline]="$HOME/.cline/AGENTS.md"
  [copilot]="$HOME/.github/copilot-instructions.md"
  [codex]="$HOME/.codex/AGENTS.md"
  [agents]="$HOME/.agents/AGENTS.md"
)

# ── Detect installed agents ───────────────────────────────────────────────────
detect_agents() {
  local detected=()
  [[ -d "$HOME/.claude" ]]                    && detected+=(claude-code)
  [[ -d "$HOME/.cursor" ]]                    && detected+=(cursor)
  [[ -d "$HOME/.gemini" ]]                    && detected+=(gemini)
  [[ -d "$HOME/.cline" ]]                     && detected+=(cline)
  [[ -d "$HOME/.github/copilot" ]]            && detected+=(copilot)
  [[ -d "$HOME/.codex" ]]                     && detected+=(codex)
  [[ -d "$HOME/.agents" ]]                    && detected+=(agents)
  echo "${detected[@]:-}"
}

# ── Collect installable items ─────────────────────────────────────────────────
collect_skills() {
  local items=()
  for d in "$REPO_DIR"/go-*/; do
    [[ -d "$d" && -f "$d/SKILL.md" ]] || continue
    items+=("$(basename "$d")")
  done
  echo "${items[@]:-}"
}

collect_hooks() {
  local items=()
  for f in "$REPO_DIR"/hooks/*.sh; do
    [[ -f "$f" ]] || continue
    items+=("$(basename "$f")")
  done
  echo "${items[@]:-}"
}

collect_workflows() {
  local items=()
  for f in "$REPO_DIR"/workflows/*.js; do
    [[ -f "$f" ]] || continue
    items+=("$(basename "$f")")
  done
  echo "${items[@]:-}"
}

# ── fzf multi-select (falls back to numbered menu) ───────────────────────────
select_items() {
  local prompt="$1"; shift
  local items=("$@")

  if command -v fzf &>/dev/null; then
    printf '%s\n' "${items[@]}" \
      | fzf --multi --prompt="$prompt > " \
            --header="TAB to select, ENTER to confirm, Ctrl-A to select all" \
            --height=40% --layout=reverse --border
  else
    echo -e "${CYAN}$prompt${RESET}" >&2
    local i=1
    for item in "${items[@]}"; do
      echo "  $i) $item" >&2
      ((i++))
    done
    echo -e "  Enter numbers separated by spaces (e.g. 1 3 5), or 'a' for all:" >&2
    read -r choices
    if [[ "$choices" == "a" ]]; then
      printf '%s\n' "${items[@]}"
    else
      for n in $choices; do
        local idx=$(( n - 1 ))
        [[ $idx -ge 0 && $idx -lt ${#items[@]} ]] && echo "${items[$idx]}"
      done
    fi
  fi
}

# ── Symlink helper ─────────────────────────────────────────────────────────────
# link_item SOURCE TARGET_DIR
# Creates TARGET_DIR/<basename(SOURCE)> → SOURCE
link_item() {
  local src="$1"
  local target_dir="$2"
  local name
  name="$(basename "$src")"
  local target="$target_dir/$name"

  mkdir -p "$target_dir"

  if [[ -L "$target" ]]; then
    local existing
    existing="$(readlink "$target")"
    if [[ "$existing" == "$src" ]]; then
      return 0  # already correct
    else
      warn "$name → already linked to a different path, skipping"
      return 0
    fi
  fi

  if [[ -e "$target" ]]; then
    warn "$name → target exists and is not a symlink, skipping"
    return 0
  fi

  ln -s "$src" "$target"
  ok "$name"
}

# ── Remove stale symlinks pointing into this repo ────────────────────────────
clean_stale() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  local count=0
  while IFS= read -r -d '' link; do
    local dest
    dest="$(readlink "$link")"
    if [[ "$dest" == "$REPO_DIR"* && ! -e "$dest" ]]; then
      rm "$link"
      warn "removed stale symlink → $(basename "$link")"
      ((count++)) || true
    fi
  done < <(find "$dir" -maxdepth 1 -type l -print0)
  [[ $count -gt 0 ]] && info "cleaned $count stale link(s) in $dir"
}

# ── Uninstall ─────────────────────────────────────────────────────────────────
uninstall() {
  header "Uninstalling go-beast symlinks"
  local dirs=(
    "$HOME/.claude/skills"
    "$HOME/.claude/hooks"
    "$HOME/.claude/workflows"
    "$HOME/.cursor/skills"
    "$HOME/.gemini/skills"
    "$HOME/.cline/skills"
    "$HOME/.github/copilot/skills"
    "$HOME/.codex/skills"
    "$HOME/.agents/skills"
  )
  for dir in "${dirs[@]}"; do
    [[ -d "$dir" ]] || continue
    while IFS= read -r -d '' link; do
      local dest
      dest="$(readlink "$link")"
      if [[ "$dest" == "$REPO_DIR"* ]]; then
        rm "$link"
        ok "removed $(basename "$link") from $dir"
      fi
    done < <(find "$dir" -maxdepth 1 -type l -print0)
  done
  echo ""
  ok "Uninstall complete."
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  local flag="${1:-}"

  if [[ "$flag" == "--uninstall" ]]; then
    uninstall
    exit 0
  fi

  echo ""
  echo -e "${BOLD}  go-beast installer${RESET}"
  echo -e "  Repository: ${CYAN}$REPO_DIR${RESET}"
  echo ""

  # ── Step 1: Detect agents ──────────────────────────────────────────────────
  header "1. Detected agents"
  local detected_str
  detected_str="$(detect_agents)"
  local all_agents=()
  read -ra all_agents <<< "$detected_str"

  if [[ ${#all_agents[@]} -eq 0 ]]; then
    err "No supported agents detected. Install Claude Code, Cursor, Gemini, or another supported agent first."
    exit 1
  fi

  for a in "${all_agents[@]}"; do
    ok "$a (${AGENT_SKILLS_DIR[$a]})"
  done

  # ── Step 2: Select agents ──────────────────────────────────────────────────
  header "2. Select agents to install into"
  local selected_agents=()
  if [[ "$flag" == "--all" ]]; then
    selected_agents=("${all_agents[@]}")
    info "Installing into all detected agents"
  else
    mapfile -t selected_agents < <(select_items "Agents" "${all_agents[@]}")
  fi

  if [[ ${#selected_agents[@]} -eq 0 ]]; then
    warn "No agents selected. Exiting."
    exit 0
  fi

  # ── Step 3: Select skills ──────────────────────────────────────────────────
  header "3. Select skills to install"
  local all_skills=()
  read -ra all_skills <<< "$(collect_skills)"
  local selected_skills=()

  if [[ "$flag" == "--all" ]]; then
    selected_skills=("${all_skills[@]}")
    info "Installing all ${#all_skills[@]} skills"
  else
    mapfile -t selected_skills < <(select_items "Skills" "${all_skills[@]}")
  fi

  # ── Step 4: Claude Code extras ────────────────────────────────────────────
  local install_hooks=false
  local install_workflows=false
  local selected_hooks=()
  local selected_workflows=()

  local has_claude=false
  for a in "${selected_agents[@]}"; do
    [[ "$a" == "claude-code" ]] && has_claude=true
  done

  if [[ "$has_claude" == true ]]; then
    header "4. Claude Code extras"

    local all_hooks=()
    read -ra all_hooks <<< "$(collect_hooks)"
    if [[ ${#all_hooks[@]} -gt 0 ]]; then
      echo -e "  ${CYAN}Hooks${RESET} (Claude Code only — wired via settings.json):"
      if [[ "$flag" == "--all" ]]; then
        selected_hooks=("${all_hooks[@]}")
        install_hooks=true
        info "Installing all ${#all_hooks[@]} hooks"
      else
        mapfile -t selected_hooks < <(select_items "Hooks (Claude Code)" "${all_hooks[@]}")
        [[ ${#selected_hooks[@]} -gt 0 ]] && install_hooks=true
      fi
    fi

    local all_workflows=()
    read -ra all_workflows <<< "$(collect_workflows)"
    if [[ ${#all_workflows[@]} -gt 0 ]]; then
      echo -e "  ${CYAN}Workflows${RESET} (Claude Code only):"
      if [[ "$flag" == "--all" ]]; then
        selected_workflows=("${all_workflows[@]}")
        install_workflows=true
        info "Installing all ${#all_workflows[@]} workflows"
      else
        mapfile -t selected_workflows < <(select_items "Workflows (Claude Code)" "${all_workflows[@]}")
        [[ ${#selected_workflows[@]} -gt 0 ]] && install_workflows=true
      fi
    fi
  fi

  # ── Step 5: Install ───────────────────────────────────────────────────────
  header "5. Installing"

  # Skills → all selected agents
  if [[ ${#selected_skills[@]} -gt 0 ]]; then
    for agent in "${selected_agents[@]}"; do
      local skills_dir="${AGENT_SKILLS_DIR[$agent]}"
      echo -e "\n  ${BOLD}Skills → $agent${RESET} ($skills_dir)"
      clean_stale "$skills_dir"
      for skill in "${selected_skills[@]}"; do
        link_item "$REPO_DIR/$skill" "$skills_dir"
      done
    done
  fi

  # Hooks → Claude Code only
  if [[ "$install_hooks" == true ]]; then
    echo -e "\n  ${BOLD}Hooks → claude-code${RESET} ($CLAUDE_HOOKS_DIR)"
    clean_stale "$CLAUDE_HOOKS_DIR"
    for hook in "${selected_hooks[@]}"; do
      link_item "$REPO_DIR/hooks/$hook" "$CLAUDE_HOOKS_DIR"
      chmod +x "$REPO_DIR/hooks/$hook"
    done
  fi

  # Workflows → Claude Code only
  if [[ "$install_workflows" == true ]]; then
    echo -e "\n  ${BOLD}Workflows → claude-code${RESET} ($CLAUDE_WORKFLOWS_DIR)"
    clean_stale "$CLAUDE_WORKFLOWS_DIR"
    for wf in "${selected_workflows[@]}"; do
      link_item "$REPO_DIR/workflows/$wf" "$CLAUDE_WORKFLOWS_DIR"
    done
  fi

  # AGENTS.global.md → each agent's global instructions file
  if [[ -f "$REPO_DIR/AGENTS.global.md" ]]; then
    echo -e "\n  ${BOLD}Global instructions → selected agents${RESET}"
    for agent in "${selected_agents[@]}"; do
      local dest="${AGENT_GLOBAL_MD[$agent]:-}"
      [[ -z "$dest" ]] && continue
      mkdir -p "$(dirname "$dest")"
      cp "$REPO_DIR/AGENTS.global.md" "$dest"
      ok "$agent → $dest"
    done
  fi

  # ── Done ──────────────────────────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}  Done.${RESET}"
  echo ""

  if [[ "$install_hooks" == true ]]; then
    echo -e "  ${YELLOW}Hooks installed but not yet wired.${RESET}"
    echo -e "  To activate, add them to ${CYAN}~/.claude/settings.json${RESET} under the"
    echo -e "  appropriate event key, or run go-swift to wire them automatically."
    echo ""
  fi
}

main "$@"
