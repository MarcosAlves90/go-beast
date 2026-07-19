#!/usr/bin/env bash

gb_state_dir() {
  printf '%s\n' "${GO_BEAST_STATE_DIR:-$HOME/.go-beast}"
}

gb_drift_dir() {
  printf '%s/anti-drift\n' "$(gb_state_dir)"
}

gb_now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

gb_detect_mode() {
  if [[ -f "$(gb_state_dir)/bootstrap.enabled" ]]; then
    printf 'bootstrap\n'
  else
    printf 'baseline\n'
  fi
}

gb_detect_harness() {
  if [[ -n "${GO_BEAST_HARNESS_OVERRIDE:-}" ]]; then
    printf '%s\n' "$GO_BEAST_HARNESS_OVERRIDE"
    return
  fi

  local script_path="${1:-$0}"
  case "$script_path" in
    *"/.codex/hooks/"*)   printf 'codex\n' ;;
    *"/.claude/hooks/"*)  printf 'claude-code\n' ;;
    *"/.copilot/hooks/"*) printf 'copilot\n' ;;
    *) printf 'unknown\n' ;;
  esac
}

gb_json_get() {
  local input="$1"
  local query="$2"
  printf '%s' "$input" | jq -r "$query" 2>/dev/null || true
}

gb_safe_session_id() {
  local session_id="${1:-default}"
  printf '%s' "$session_id" | tr '/:[:space:]' '____'
}

gb_state_file() {
  local session_id
  session_id="$(gb_safe_session_id "${1:-default}")"
  printf '%s/%s.json\n' "$(gb_drift_dir)" "$session_id"
}

gb_default_state_json() {
  local session_id="$1"
  local cwd="$2"
  local harness="$3"
  local mode="$4"

  jq -nc \
    --arg session_id "$session_id" \
    --arg cwd "$cwd" \
    --arg harness "$harness" \
    --arg mode "$mode" \
    --arg now "$(gb_now_utc)" \
    '{
      version: 1,
      session_id: $session_id,
      cwd: $cwd,
      harness: $harness,
      mode: $mode,
      active_beast: "go-chat",
      required_artifact: "",
      implementation_unlocked: false,
      task_id: "",
      task_state: "active",
      unanchored_stop_count: 0,
      last_reanchor_reason: "",
      updated_at: $now
    }'
}

gb_load_state_json() {
  local session_id="$1"
  local cwd="${2:-$(pwd)}"
  local harness="${3:-unknown}"
  local mode="${4:-$(gb_detect_mode)}"
  local state_file
  state_file="$(gb_state_file "$session_id")"

  if [[ -f "$state_file" ]]; then
    cat "$state_file"
  else
    gb_default_state_json "$session_id" "$cwd" "$harness" "$mode"
  fi
}

gb_save_state_json() {
  local session_id="$1"
  local json="$2"
  local state_file tmp_file

  state_file="$(gb_state_file "$session_id")"
  mkdir -p "$(dirname "$state_file")"
  tmp_file="${state_file}.tmp"
  printf '%s\n' "$json" > "$tmp_file"
  mv "$tmp_file" "$state_file"
}

gb_extract_beast() {
  local text="${1:-}"
  # Only extract a beast when it appears after an affirmative framing marker
  # ("Active beast:", "beast:", "<beast>", "using go-X", "invoking go-X").
  # Avoids extracting from negations ("don't use go-hawk") or incidental
  # mentions ("go-hawk would be premature here").
  printf '%s\n' "$text" | grep -Eoi '(active beast|<beast>|using|invoking|running|invoke)[[:space:]:]+(go-[a-z]+)' \
    | grep -Eo 'go-[a-z]+' | head -n 1 || true
}

gb_extract_artifact() {
  local text="${1:-}"
  printf '%s\n' "$text" | grep -Eo '(\.go-beast/)?(REQUIREMENTS\.md|APPROACH\.md)|STACK\.md|ADR\.md|DIAGRAM\.md|CONTRACTS\.md|CHANGELOG\.md|AGENTS\.md|SECURITY_REVIEW|TEST_PLAN' | head -n 1 || true
}

gb_extract_task_state() {
  local text="${1:-}"
  if printf '%s\n' "$text" | grep -Eqi 'task state:[[:space:]]*complete|task_state[[:space:]]*[:=][[:space:]]*complete'; then
    printf 'complete\n'
  elif printf '%s\n' "$text" | grep -Eqi 'task state:[[:space:]]*active|task_state[[:space:]]*[:=][[:space:]]*active'; then
    printf 'active\n'
  fi
}

gb_message_is_anchored() {
  local text="${1:-}"
  [[ -z "$text" ]] && return 1

  # Require at least one explicit state frame marker — incidental beast mentions
  # ("go-hawk would be useful") do not constitute anchoring. The response must
  # declare the current state, not merely reference a beast name in passing.
  # Research basis: permissive matching (any go-X mention) caused false anchoring
  # where drift persisted because casual mentions satisfied the check.
  if printf '%s\n' "$text" | grep -Eqi \
    'active beast[[:space:]]*:[[:space:]]*go-[a-z]+|<beast>[[:space:]]*go-[a-z]+|beast ativo[[:space:]]*:[[:space:]]*go-[a-z]+'; then
    return 0
  fi

  if printf '%s\n' "$text" | grep -Eqi \
    'required artifact|implementation (is |not )?(un)?locked|re-anchor|bootstrap gate|implementation_unlocked|<implementation>|<required_artifact>'; then
    return 0
  fi

  return 1
}
