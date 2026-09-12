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
      applicability: "conversation",
      required_artifact: "",
      approval_state: "pending",
      completion_evidence: [],
      implementation_unlocked: false,
      task_id: "",
      task_state: "active",
      unanchored_stop_count: 0,
      last_reanchor_reason: "",
      updated_at: $now
    }'
}

gb_runtime_applicability() {
  local beast="${1:-go-chat}"
  case "$beast" in
    go-chat) printf 'conversation\n' ;;
    go-mule|go-mole|go-hawk) printf 'discovery\n' ;;
    go-lark|go-fox|go-otter|go-beaver|go-snipe) printf 'planning\n' ;;
    go-wolf|go-lynx|go-swift|go-wren|go-crane|go-raven|go-ant) printf 'implementation\n' ;;
    go-eagle|go-bear|go-tern|go-score|go-owl) printf 'verification\n' ;;
    *) printf 'unknown\n' ;;
  esac
}

gb_runtime_required_artifact() {
  local explicit="${1:-}"
  local beast="${2:-go-chat}"
  if [[ -n "$explicit" ]]; then
    printf '%s\n' "$explicit"
    return
  fi

  case "$beast" in
    go-mule|go-mole|go-hawk) printf '.go-beast/REQUIREMENTS.md\n' ;;
    go-lark) printf '.go-beast/APPROACH.md\n' ;;
    go-fox|go-otter|go-beaver) printf 'docs/architecture/task-artifacts/CONTRACTS.md\n' ;;
    go-snipe) printf 'SPEC.md\n' ;;
    go-wolf|go-lynx) printf 'SPEC.md\n' ;;
    go-eagle) printf '.go-beast/checkpoints/GREEN.md\n' ;;
    go-tern) printf '.go-beast/checkpoints/SPEC_REVIEW.md\n' ;;
    go-score) printf '.go-beast/checkpoints/QUALITY_REVIEW.md\n' ;;
    go-owl) printf '.go-beast/checkpoints/FINISH.md\n' ;;
    *) printf '\n' ;;
  esac
}

gb_runtime_approval_state() {
  local state="$1"
  local implementation_unlocked
  local approval
  implementation_unlocked="$(printf '%s' "$state" | jq -r '.implementation_unlocked // false' 2>/dev/null || printf 'false')"
  approval="$(printf '%s' "$state" | jq -r '.approval_state // empty' 2>/dev/null || true)"
  if [[ "$approval" != "pending" && "$approval" != "approved" && "$approval" != "rejected" ]]; then
    [[ "$implementation_unlocked" == "true" ]] && approval="approved" || approval="pending"
  fi
  printf '%s\n' "$approval"
}

gb_runtime_completion_evidence_json() {
  local state="$1"
  local evidence
  evidence="$(printf '%s' "$state" | jq -c '
    (.completion_evidence // [])
    | if type == "array" then map(select(type == "string" and length > 0)) | unique else [] end
  ' 2>/dev/null || printf '[]')"
  [[ "$evidence" == \[*\] ]] || evidence='[]'
  printf '%s\n' "$evidence"
}

gb_runtime_policy_json() {
  local state="$1"
  local cwd="${2:-$(pwd)}"
  local beast
  local explicit_artifact
  local applicability
  local required_artifact
  local required_artifact_present=false
  local approval_state
  local completion_evidence
  local implementation_unlocked
  local task_state

  beast="$(printf '%s' "$state" | jq -r '.active_beast // "go-chat"' 2>/dev/null || printf 'go-chat')"
  [[ -n "$beast" && "$beast" != "null" ]] || beast="go-chat"
  explicit_artifact="$(printf '%s' "$state" | jq -r '.required_artifact // empty' 2>/dev/null || true)"
  applicability="$(gb_runtime_applicability "$beast")"
  required_artifact="$(gb_runtime_required_artifact "$explicit_artifact" "$beast")"
  approval_state="$(gb_runtime_approval_state "$state")"
  completion_evidence="$(gb_runtime_completion_evidence_json "$state")"
  implementation_unlocked="$(printf '%s' "$state" | jq -r '.implementation_unlocked // false' 2>/dev/null || printf 'false')"
  [[ "$implementation_unlocked" == "true" || "$implementation_unlocked" == "false" ]] || implementation_unlocked="false"
  task_state="$(printf '%s' "$state" | jq -r '.task_state // "active"' 2>/dev/null || printf 'active')"

  if [[ -n "$required_artifact" && "$required_artifact" != /* && "$required_artifact" != *..* && -e "$cwd/$required_artifact" ]]; then
    required_artifact_present=true
  elif [[ -n "$required_artifact" && "$required_artifact" == /* && -e "$required_artifact" ]]; then
    required_artifact_present=true
  fi

  jq -nc \
    --arg active_beast "$beast" \
    --arg applicability "$applicability" \
    --arg required_artifact "$required_artifact" \
    --arg approval_state "$approval_state" \
    --arg task_state "$task_state" \
    --argjson required_artifact_present "$required_artifact_present" \
    --argjson completion_evidence "$completion_evidence" \
    --argjson implementation_unlocked "${implementation_unlocked:-false}" \
    '{
      active_beast: $active_beast,
      applicability: $applicability,
      required_artifact: $required_artifact,
      required_artifact_present: $required_artifact_present,
      approval_state: $approval_state,
      completion_evidence: $completion_evidence,
      implementation_unlocked: $implementation_unlocked,
      task_state: $task_state
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
  printf '%s\n' "$text" | grep -Eoi '(active beast|beast|<beast>|using|invoking|running|invoke)[[:space:]:]+(go-[a-z]+)' \
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

gb_extract_approval_state() {
  local text="${1:-}"
  if printf '%s\n' "$text" | grep -Eqi '(^|[[:space:];])((approval|approach approval|requirements approval|aprovação)[[:space:]]*[:=]?[[:space:]]*)(approved|accepted|aprovado|aceito)'; then
    printf 'approved\n'
  elif printf '%s\n' "$text" | grep -Eqi '(^|[[:space:];])((approval|approach approval|requirements approval|aprovação)[[:space:]]*[:=]?[[:space:]]*)(rejected|denied|rejeitado|negado)'; then
    printf 'rejected\n'
  fi
}

gb_extract_completion_evidence() {
  local text="${1:-}"
  local evidence
  evidence="$(printf '%s\n' "$text" | sed -nE 's/.*(<completion_evidence>|[Cc]ompletion evidence[[:space:]:=]+)([^;]+).*/\2/p' | head -n 1)"
  evidence="${evidence%%.}"
  [[ -n "$evidence" ]] && printf '%s\n' "$evidence"
  return 0
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

  if printf '%s\n' "$text" | grep -Eqi '(^|[[:space:]])beast[[:space:]]*:[[:space:]]*go-[a-z]+' \
    && printf '%s\n' "$text" | grep -Eqi '(^|[[:space:]])artifact[[:space:]]*:[[:space:]]*`?(\.go-beast/)?(REQUIREMENTS\.md|APPROACH\.md|STACK\.md|ADR\.md|DIAGRAM\.md|CONTRACTS\.md|CHANGELOG\.md|AGENTS\.md|SECURITY_REVIEW|TEST_PLAN)`?([[:space:]]|$)' \
    && printf '%s\n' "$text" | grep -Eqi 'implementation[[:space:]]+gate[[:space:]]*:[[:space:]]*(allowed|blocked|permitido|bloqueado)([[:space:][:punct:]]|$)'; then
    return 0
  fi

  if printf '%s\n' "$text" | grep -Eqi \
    'required artifact|implementation (is |not )?(un)?locked|re-anchor|bootstrap gate|implementation_unlocked|<implementation>|<required_artifact>'; then
    return 0
  fi

  return 1
}
