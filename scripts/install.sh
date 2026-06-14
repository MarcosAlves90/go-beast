#!/usr/bin/env bash
# go-beast local installer — bash 3.2+ compatible (macOS default)
# Usage: ./scripts/install.sh [--all] [--uninstall]

set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Colours ───────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' B='\033[1m' X='\033[0m'
ok()     { echo -e "  ${G}✓${X} $*"; }
skip()   { echo -e "  ${C}–${X} $*"; }
warn()   { echo -e "  ${Y}⚠${X} $*"; }
err()    { echo -e "  ${R}✗${X} $*"; }
h()      { echo -e "\n${B}── $* ──────────────────────────────${X}"; }

# ── Agent registry (parallel arrays, bash 3.2 compat) ────────────────────────
AGENT_NAMES=(     "claude-code"            "cursor"           "gemini"           "cline"           "copilot"                    "codex"           "agents"          )
AGENT_DETECT=(    "$HOME/.claude"          "$HOME/.cursor"    "$HOME/.gemini"    "$HOME/.cline"    "$HOME/.github/copilot"      "$HOME/.codex"    "$HOME/.agents"   )
AGENT_SKILLS=(    "$HOME/.claude/skills"   "$HOME/.cursor/skills" "$HOME/.gemini/skills" "$HOME/.cline/skills" "$HOME/.github/copilot/skills" "$HOME/.codex/skills" "$HOME/.agents/skills" )
AGENT_GLOBAL=(    "$HOME/.claude/CLAUDE.md" "$HOME/.cursor/rules" "$HOME/.gemini/GEMINI.md" "$HOME/.cline/AGENTS.md" "$HOME/.github/copilot-instructions.md" "$HOME/.codex/AGENTS.md" "$HOME/.agents/AGENTS.md" )

CLAUDE_HOOKS="$HOME/.claude/hooks"
CLAUDE_WORKFLOWS="$HOME/.claude/workflows"

agent_field() { # agent_field <name> <array_name> → prints value
  local name="$1" arr="$2" i=0
  for n in "${AGENT_NAMES[@]}"; do
    if [[ "$n" == "$name" ]]; then
      eval "echo \"\${${arr}[$i]}\""
      return
    fi
    ((i++)) || true
  done
}

# ── Helpers ───────────────────────────────────────────────────────────────────
collect_skills()    { for d in "$REPO_DIR"/go-*/;       do [[ -f "$d/SKILL.md" ]] && basename "$d"; done; }
collect_hooks()     { for f in "$REPO_DIR"/hooks/*.sh;  do [[ -f "$f" ]] && basename "$f"; done; }
collect_workflows() { for f in "$REPO_DIR"/workflows/*.js; do [[ -f "$f" ]] && basename "$f"; done; }

link_item() {
  local src="$1" dir="$2"
  local name; name="$(basename "$src")"
  local dst="$dir/$name"
  mkdir -p "$dir"
  if [[ -L "$dst" ]]; then
    local cur; cur="$(readlink "$dst")"
    if [[ "$cur" == "$src" ]]; then skip "$name  (already linked)"; return; fi
    warn "$name  (linked elsewhere — skipping)"
    return
  fi
  [[ -e "$dst" ]] && { warn "$name  (file exists — skipping)"; return; }
  ln -s "$src" "$dst"
  ok "$name"
}

clean_stale() {
  local dir="$1"; [[ -d "$dir" ]] || return 0
  while IFS= read -r lnk; do
    [[ -z "$lnk" ]] && continue
    local dst; dst="$(readlink "$lnk")"
    if [[ "$dst" == "$REPO_DIR"* && ! -e "$dst" ]]; then
      rm "$lnk"; warn "removed stale: $(basename "$lnk")"
    fi
  done < <(find "$dir" -maxdepth 1 -type l 2>/dev/null)
}

# ── pick_items: prints selected items to stdout ───────────────────────────────
# pick_items <prompt> <item1> <item2> ...
pick_items() {
  local prompt="$1"; shift
  local items=("$@")
  local count=${#items[@]}

  echo -e "\n  ${B}${prompt}${X}  (${count} available)" >&2
  echo -e "  [a] all    [n] none    [p] pick" >&2
  local choice
  while true; do
    printf "  > " >&2; read -r choice </dev/tty
    case "$choice" in
      a|A) printf '%s\n' "${items[@]}"; return ;;
      n|N) return ;;
      p|P) break ;;
      *)   echo -e "  ${Y}a / n / p${X}" >&2 ;;
    esac
  done

  # Pick mode: always numbered (simple, reliable, bash 3.2 safe)
  echo "" >&2
  local i=1
  for item in "${items[@]}"; do
    printf "  %2d) %s\n" $i "$item" >&2
    ((i++)) || true
  done
  echo "" >&2
  echo -e "  Numbers (e.g. 1 3 5) or range (e.g. 1-5): " >&2
  local raw
  read -r raw </dev/tty

  # Expand ranges and print selected items
  for token in $raw; do
    if [[ "$token" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      local lo=${BASH_REMATCH[1]} hi=${BASH_REMATCH[2]}
      local j=$lo
      while [[ $j -le $hi ]]; do
        local idx=$(( j - 1 ))
        [[ $idx -ge 0 && $idx -lt $count ]] && echo "${items[$idx]}"
        ((j++)) || true
      done
    else
      local idx=$(( token - 1 ))
      [[ $idx -ge 0 && $idx -lt $count ]] && echo "${items[$idx]}"
    fi
  done
}

# ── Uninstall ─────────────────────────────────────────────────────────────────
uninstall() {
  h "Uninstall"
  local dirs=("$HOME/.claude/skills" "$HOME/.claude/hooks" "$HOME/.claude/workflows"
              "$HOME/.cursor/skills" "$HOME/.gemini/skills" "$HOME/.cline/skills"
              "$HOME/.github/copilot/skills" "$HOME/.codex/skills" "$HOME/.agents/skills")
  local total=0
  for dir in "${dirs[@]}"; do
    [[ -d "$dir" ]] || continue
    while IFS= read -r lnk; do
      [[ -z "$lnk" ]] && continue
      local dst; dst="$(readlink "$lnk")"
      if [[ "$dst" == "$REPO_DIR"* ]]; then
        rm "$lnk"; ok "$(basename "$lnk")  ← $(basename "$dir")"; ((total++)) || true
      fi
    done < <(find "$dir" -maxdepth 1 -type l 2>/dev/null)
  done
  echo ""
  [[ $total -eq 0 ]] && skip "Nothing to remove." || ok "$total symlink(s) removed."
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  local flag="${1:-}"
  [[ "$flag" == "--uninstall" ]] && { uninstall; exit 0; }

  echo ""
  echo -e "${B}  go-beast${X}  ${C}$REPO_DIR${X}"

  # 1. Detect agents
  h "Agents available"
  local detected=()
  local i=0
  for detect_dir in "${AGENT_DETECT[@]}"; do
    if [[ -d "$detect_dir" ]]; then
      detected+=("${AGENT_NAMES[$i]}")
      ok "${AGENT_NAMES[$i]}  →  ${AGENT_SKILLS[$i]}"
    fi
    ((i++)) || true
  done
  [[ ${#detected[@]} -eq 0 ]] && { err "No supported agents found."; exit 1; }

  # 2. Select agents
  local sel_agents=()
  if [[ "$flag" == "--all" ]]; then
    sel_agents=("${detected[@]}")
  else
    while IFS= read -r a; do [[ -n "$a" ]] && sel_agents+=("$a"); done \
      < <(pick_items "Install into which agents?" "${detected[@]}")
  fi
  [[ ${#sel_agents[@]} -eq 0 ]] && { warn "No agents selected. Exiting."; exit 0; }

  # 3. Select skills
  local all_skills=(); while IFS= read -r s; do [[ -n "$s" ]] && all_skills+=("$s"); done < <(collect_skills)
  local sel_skills=()
  if [[ "$flag" == "--all" ]]; then
    sel_skills=("${all_skills[@]}")
  else
    while IFS= read -r s; do [[ -n "$s" ]] && sel_skills+=("$s"); done \
      < <(pick_items "Skills" "${all_skills[@]}")
  fi

  # 4. Claude Code extras
  local sel_hooks=() sel_workflows=()
  local do_hooks=false do_workflows=false has_claude=false
  for a in "${sel_agents[@]}"; do [[ "$a" == "claude-code" ]] && has_claude=true; done

  if [[ "$has_claude" == true ]]; then
    local all_hooks=(); while IFS= read -r h; do [[ -n "$h" ]] && all_hooks+=("$h"); done < <(collect_hooks)
    local all_wf=();    while IFS= read -r w; do [[ -n "$w" ]] && all_wf+=("$w");    done < <(collect_workflows)

    if [[ "$flag" == "--all" ]]; then
      sel_hooks=("${all_hooks[@]}"); do_hooks=true
      sel_workflows=("${all_wf[@]}"); do_workflows=true
    else
      [[ ${#all_hooks[@]} -gt 0 ]] && {
        while IFS= read -r h; do [[ -n "$h" ]] && sel_hooks+=("$h"); done \
          < <(pick_items "Hooks  (Claude Code only)" "${all_hooks[@]}")
        [[ ${#sel_hooks[@]} -gt 0 ]] && do_hooks=true
      }
      [[ ${#all_wf[@]} -gt 0 ]] && {
        while IFS= read -r w; do [[ -n "$w" ]] && sel_workflows+=("$w"); done \
          < <(pick_items "Workflows  (Claude Code only)" "${all_wf[@]}")
        [[ ${#sel_workflows[@]} -gt 0 ]] && do_workflows=true
      }
    fi
  fi

  # 5. Install
  h "Installing"

  # Skills
  if [[ ${#sel_skills[@]} -gt 0 ]]; then
    for agent in "${sel_agents[@]}"; do
      local sdir; sdir="$(agent_field "$agent" "AGENT_SKILLS")"
      echo -e "\n  ${B}skills → $agent${X}"
      clean_stale "$sdir"
      for skill in "${sel_skills[@]}"; do
        link_item "$REPO_DIR/$skill" "$sdir"
      done
    done
  fi

  # Hooks
  if [[ "$do_hooks" == true ]]; then
    echo -e "\n  ${B}hooks → claude-code${X}"
    clean_stale "$CLAUDE_HOOKS"
    for hook in "${sel_hooks[@]}"; do
      link_item "$REPO_DIR/hooks/$hook" "$CLAUDE_HOOKS"
      chmod +x "$REPO_DIR/hooks/$hook"
    done
  fi

  # Workflows
  if [[ "$do_workflows" == true ]]; then
    echo -e "\n  ${B}workflows → claude-code${X}"
    clean_stale "$CLAUDE_WORKFLOWS"
    for wf in "${sel_workflows[@]}"; do
      link_item "$REPO_DIR/workflows/$wf" "$CLAUDE_WORKFLOWS"
    done
  fi

  # Global instructions
  if [[ -f "$REPO_DIR/AGENTS.global.md" ]]; then
    echo -e "\n  ${B}global instructions${X}"
    for agent in "${sel_agents[@]}"; do
      local dest; dest="$(agent_field "$agent" "AGENT_GLOBAL")"
      [[ -z "$dest" ]] && continue
      mkdir -p "$(dirname "$dest")"
      cp "$REPO_DIR/AGENTS.global.md" "$dest"
      ok "$agent  →  $dest"
    done
  fi

  # Summary
  echo ""
  h "Summary"
  echo -e "  agents:    ${#sel_agents[@]}  (${sel_agents[*]})"
  echo -e "  skills:    ${#sel_skills[@]}"
  [[ "$do_hooks" == true ]]     && echo -e "  hooks:     ${#sel_hooks[@]}"
  [[ "$do_workflows" == true ]] && echo -e "  workflows: ${#sel_workflows[@]}"
  echo ""

  if [[ "$do_hooks" == true ]]; then
    echo -e "  ${Y}Hooks are linked but not yet wired to events.${X}"
    echo -e "  Add entries to ${C}~/.claude/settings.json${X} or run go-swift."
    echo ""
  fi
}

main "$@"
