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
    *"/.codex/hooks/"*) printf 'codex\n' ;;
    *"/.claude/hooks/"*) printf 'claude-code\n' ;;
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
      active_beast: "",
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
  printf '%s\n' "$text" | grep -Eo 'go-[a-z]+' | head -n 1 || true
}

gb_extract_artifact() {
  local text="${1:-}"
  printf '%s\n' "$text" | grep -Eo 'REQUIREMENTS\.md|APPROACH\.md|STACK\.md|ADR\.md|DIAGRAM\.md|CONTRACTS\.md|CHANGELOG\.md|AGENTS\.md|SECURITY_REVIEW|TEST_PLAN' | head -n 1 || true
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

  if printf '%s\n' "$text" | grep -Eqi 'go-[a-z]+'; then
    return 0
  fi

  if printf '%s\n' "$text" | grep -Eqi 'active beast|required artifact|implementation (is )?unlocked|re-anchor|bootstrap gate'; then
    return 0
  fi

  return 1
}
