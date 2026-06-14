#!/usr/bin/env bash
# go-beast local installer
# Symlinks skills (all agents), hooks, and workflows (Claude Code only).
# Copies AGENTS.global.md to each agent's expected global instructions file.
# Usage: bash scripts/install.sh [--all] [--uninstall]
#
# Requires bash 3.2+ (macOS default). No associative arrays used.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()     { echo -e "  ${GREEN}✓${RESET} $*"; }
info()   { echo -e "  ${CYAN}→${RESET} $*"; }
warn()   { echo -e "  ${YELLOW}⚠${RESET} $*"; }
err()    { echo -e "  ${RED}✗${RESET} $*"; }
header() { echo -e "\n${BOLD}$*${RESET}"; }

# ── Agent data (bash 3.2 compatible — no associative arrays) ─────────────────
# Parallel arrays: AGENTS, AGENTS_SKILLS_DIR, AGENTS_GLOBAL_MD, AGENTS_DETECT_DIR

AGENTS=(
  "claude-code"
  "cursor"
  "gemini"
  "cline"
  "copilot"
  "codex"
  "agents"
)

AGENTS_DETECT_DIR=(
  "$HOME/.claude"
  "$HOME/.cursor"
  "$HOME/.gemini"
  "$HOME/.cline"
  "$HOME/.github/copilot"
  "$HOME/.codex"
  "$HOME/.agents"
)

AGENTS_SKILLS_DIR=(
  "$HOME/.claude/skills"
  "$HOME/.cursor/skills"
  "$HOME/.gemini/skills"
  "$HOME/.cline/skills"
  "$HOME/.github/copilot/skills"
  "$HOME/.codex/skills"
  "$HOME/.agents/skills"
)

# Where AGENTS.global.md is copied for each agent
AGENTS_GLOBAL_MD=(
  "$HOME/.claude/CLAUDE.md"
  "$HOME/.cursor/rules"
  "$HOME/.gemini/GEMINI.md"
  "$HOME/.cline/AGENTS.md"
  "$HOME/.github/copilot-instructions.md"
  "$HOME/.codex/AGENTS.md"
  "$HOME/.agents/AGENTS.md"
)

# Lookup helpers — return value by echoing, call with $()
agent_index() {
  local name="$1" i=0
  for a in "${AGENTS[@]}"; do
    [[ "$a" == "$name" ]] && echo $i && return
    ((i++)) || true
  done
  echo -1
}

agent_skills_dir() {
  local idx; idx="$(agent_index "$1")"
  echo "${AGENTS_SKILLS_DIR[$idx]}"
}

agent_global_md() {
  local idx; idx="$(agent_index "$1")"
  echo "${AGENTS_GLOBAL_MD[$idx]}"
}

# ── Claude Code extras dirs ───────────────────────────────────────────────────
CLAUDE_HOOKS_DIR="$HOME/.claude/hooks"
CLAUDE_WORKFLOWS_DIR="$HOME/.claude/workflows"

# ── Detect installed agents ───────────────────────────────────────────────────
detect_agents() {
  local i=0
  for detect_dir in "${AGENTS_DETECT_DIR[@]}"; do
    [[ -d "$detect_dir" ]] && echo "${AGENTS[$i]}"
    ((i++)) || true
  done
}

# ── Collect installable items ─────────────────────────────────────────────────
collect_skills() {
  for d in "$REPO_DIR"/go-*/; do
    [[ -d "$d" && -f "$d/SKILL.md" ]] && echo "$(basename "$d")"
  done
}

collect_hooks() {
  for f in "$REPO_DIR"/hooks/*.sh; do
    [[ -f "$f" ]] && echo "$(basename "$f")"
  done
}

collect_workflows() {
  for f in "$REPO_DIR"/workflows/*.js; do
    [[ -f "$f" ]] && echo "$(basename "$f")"
  done
}

# ── select_items: all / pick / skip ──────────────────────────────────────────
select_items() {
  local prompt="$1"; shift
  local items=("$@")
  local count=${#items[@]}

  echo -e "\n  ${BOLD}${prompt}${RESET} (${count} available)" >&2
  echo -e "  [a] all   [p] pick individually   [s] skip" >&2
  local choice
  while true; do
    printf "  > " >&2
    read -r choice </dev/tty
    case "$choice" in
      a|A) printf '%s\n' "${items[@]}"; return ;;
      p|P) break ;;
      s|S) return ;;
      *)   echo -e "  ${YELLOW}Type a, p, or s${RESET}" >&2 ;;
    esac
  done

  # Pick mode — fzf if available, numbered list otherwise
  if command -v fzf &>/dev/null; then
    local tmpfile; tmpfile="$(mktemp)"
    printf '%s\n' "${items[@]}" > "$tmpfile"
    fzf --multi \
        --prompt="$prompt > " \
        --header="TAB=toggle  ENTER=confirm" \
        --height=60% --layout=reverse --border \
        --bind "tab:toggle" \
        < "$tmpfile"
    rm -f "$tmpfile"
  else
    local i=1
    for item in "${items[@]}"; do
      echo "  $i) $item" >&2
      ((i++)) || true
    done
    echo -e "  Numbers separated by spaces (e.g. 1 3 5): " >&2
    local choices
    read -r choices </dev/tty
    for n in $choices; do
      local idx=$(( n - 1 ))
      [[ $idx -ge 0 && $idx -lt $count ]] && echo "${items[$idx]}"
    done
  fi
}

# ── Symlink helper ─────────────────────────────────────────────────────────────
link_item() {
  local src="$1"
  local target_dir="$2"
  local name; name="$(basename "$src")"
  local target="$target_dir/$name"

  mkdir -p "$target_dir"

  if [[ -L "$target" ]]; then
    local existing; existing="$(readlink "$target")"
    if [[ "$existing" == "$src" ]]; then
      echo -e "  ${CYAN}~${RESET} $name (already linked)"
      return 0
    else
      warn "$name already linked elsewhere ($existing), skipping"
      return 0
    fi
  fi

  if [[ -e "$target" ]]; then
    warn "$name exists (not a symlink), skipping"
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
  while IFS= read -r link; do
    [[ -z "$link" ]] && continue
    local dest; dest="$(readlink "$link")"
    if [[ "$dest" == "$REPO_DIR"* && ! -e "$dest" ]]; then
      rm "$link"
      warn "removed stale → $(basename "$link")"
      ((count++)) || true
    fi
  done < <(find "$dir" -maxdepth 1 -type l 2>/dev/null)
  [[ $count -gt 0 ]] && info "cleaned $count stale link(s) in $dir"
}

# ── Uninstall ─────────────────────────────────────────────────────────────────
uninstall() {
  header "Uninstalling go-beast symlinks"
  local dirs=(
    "$HOME/.claude/skills"   "$HOME/.claude/hooks"  "$HOME/.claude/workflows"
    "$HOME/.cursor/skills"   "$HOME/.gemini/skills" "$HOME/.cline/skills"
    "$HOME/.github/copilot/skills" "$HOME/.codex/skills" "$HOME/.agents/skills"
  )
  for dir in "${dirs[@]}"; do
    [[ -d "$dir" ]] || continue
    while IFS= read -r link; do
      [[ -z "$link" ]] && continue
      local dest; dest="$(readlink "$link")"
      if [[ "$dest" == "$REPO_DIR"* ]]; then
        rm "$link"
        ok "removed $(basename "$link") ← $dir"
      fi
    done < <(find "$dir" -maxdepth 1 -type l 2>/dev/null)
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
  echo -e "  Repo: ${CYAN}$REPO_DIR${RESET}"

  # ── Step 1: Detect agents ─────────────────────────────────────────────────
  header "1. Detected agents"
  local detected_agents=()
  while IFS= read -r a; do
    [[ -n "$a" ]] && detected_agents+=("$a")
  done < <(detect_agents)

  if [[ ${#detected_agents[@]} -eq 0 ]]; then
    err "No supported agents detected."
    exit 1
  fi

  for a in "${detected_agents[@]}"; do
    ok "$a  ($(agent_skills_dir "$a"))"
  done

  # ── Step 2: Select agents ─────────────────────────────────────────────────
  header "2. Select agents"
  local selected_agents=()
  if [[ "$flag" == "--all" ]]; then
    selected_agents=("${detected_agents[@]}")
    info "All detected agents selected"
  else
    while IFS= read -r a; do
      [[ -n "$a" ]] && selected_agents+=("$a")
    done < <(select_items "Agents" "${detected_agents[@]}")
  fi

  if [[ ${#selected_agents[@]} -eq 0 ]]; then
    warn "No agents selected. (Did you press ENTER without selecting anything?)"
    exit 0
  fi
  info "Agents: ${selected_agents[*]}"

  # ── Step 3: Select skills ─────────────────────────────────────────────────
  header "3. Select skills"
  local all_skills=()
  while IFS= read -r s; do
    [[ -n "$s" ]] && all_skills+=("$s")
  done < <(collect_skills)

  local selected_skills=()
  if [[ "$flag" == "--all" ]]; then
    selected_skills=("${all_skills[@]}")
    info "All ${#all_skills[@]} skills selected"
  else
    while IFS= read -r s; do
      [[ -n "$s" ]] && selected_skills+=("$s")
    done < <(select_items "Skills" "${all_skills[@]}")
  fi

  info "Skills: ${#selected_skills[@]} selected"

  # ── Step 4: Claude Code extras ────────────────────────────────────────────
  local install_hooks=false install_workflows=false
  local selected_hooks=() selected_workflows=()
  local has_claude=false

  for a in "${selected_agents[@]}"; do
    [[ "$a" == "claude-code" ]] && has_claude=true
  done

  if [[ "$has_claude" == true ]]; then
    header "4. Claude Code extras"

    local all_hooks=()
    while IFS= read -r h; do [[ -n "$h" ]] && all_hooks+=("$h"); done < <(collect_hooks)

    if [[ ${#all_hooks[@]} -gt 0 ]]; then
      if [[ "$flag" == "--all" ]]; then
        selected_hooks=("${all_hooks[@]}")
        install_hooks=true
      else
        while IFS= read -r h; do
          [[ -n "$h" ]] && selected_hooks+=("$h")
        done < <(select_items "Hooks (Claude Code)" "${all_hooks[@]}")
        [[ ${#selected_hooks[@]} -gt 0 ]] && install_hooks=true
      fi
    fi

    local all_workflows=()
    while IFS= read -r w; do [[ -n "$w" ]] && all_workflows+=("$w"); done < <(collect_workflows)

    if [[ ${#all_workflows[@]} -gt 0 ]]; then
      if [[ "$flag" == "--all" ]]; then
        selected_workflows=("${all_workflows[@]}")
        install_workflows=true
      else
        while IFS= read -r w; do
          [[ -n "$w" ]] && selected_workflows+=("$w")
        done < <(select_items "Workflows (Claude Code)" "${all_workflows[@]}")
        [[ ${#selected_workflows[@]} -gt 0 ]] && install_workflows=true
      fi
    fi
  fi

  # ── Step 5: Install ───────────────────────────────────────────────────────
  header "5. Installing"

  # Skills → all selected agents
  if [[ ${#selected_skills[@]} -gt 0 ]]; then
    for agent in "${selected_agents[@]}"; do
      local sdir; sdir="$(agent_skills_dir "$agent")"
      echo -e "\n  ${BOLD}Skills → $agent${RESET}"
      clean_stale "$sdir"
      for skill in "${selected_skills[@]}"; do
        link_item "$REPO_DIR/$skill" "$sdir"
      done
    done
  fi

  # Hooks → Claude Code only
  if [[ "$install_hooks" == true ]]; then
    echo -e "\n  ${BOLD}Hooks → claude-code${RESET}"
    clean_stale "$CLAUDE_HOOKS_DIR"
    for hook in "${selected_hooks[@]}"; do
      link_item "$REPO_DIR/hooks/$hook" "$CLAUDE_HOOKS_DIR"
      chmod +x "$REPO_DIR/hooks/$hook"
    done
  fi

  # Workflows → Claude Code only
  if [[ "$install_workflows" == true ]]; then
    echo -e "\n  ${BOLD}Workflows → claude-code${RESET}"
    clean_stale "$CLAUDE_WORKFLOWS_DIR"
    for wf in "${selected_workflows[@]}"; do
      link_item "$REPO_DIR/workflows/$wf" "$CLAUDE_WORKFLOWS_DIR"
    done
  fi

  # AGENTS.global.md → each agent's global instructions file
  if [[ -f "$REPO_DIR/AGENTS.global.md" ]]; then
    echo -e "\n  ${BOLD}Global instructions${RESET}"
    for agent in "${selected_agents[@]}"; do
      local dest; dest="$(agent_global_md "$agent")"
      [[ -z "$dest" ]] && continue
      mkdir -p "$(dirname "$dest")"
      cp "$REPO_DIR/AGENTS.global.md" "$dest"
      ok "$agent → $dest"
    done
  fi

  # ── Done ──────────────────────────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}  Done.${RESET}"

  if [[ "$install_hooks" == true ]]; then
    echo ""
    echo -e "  ${YELLOW}Hooks installed but not yet wired.${RESET}"
    echo -e "  Add them to ${CYAN}~/.claude/settings.json${RESET} or run go-swift."
  fi
  echo ""
}

main "$@"
