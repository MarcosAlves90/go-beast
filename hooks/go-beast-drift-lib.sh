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

gb_xml_escape() {
  local value="${1:-}"
  printf '%s' "$value" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g' \
    -e "s/'/\&apos;/g"
}

gb_artifact_is_safe() {
  local value="${1:-}"
  [[ -z "$value" ]] && return 0

  case "$value" in
    /*|*..*|*$'\n'*|*$'\r'*|*'<'*|*'>'*|*'&'*) return 1 ;;
    *) return 0 ;;
  esac
}

gb_state_is_valid_for_context() {
  local state="$1"
  local session_id="$2"
  local cwd="$3"
  local mode="$4"

  printf '%s' "$state" | jq -e \
    --arg session_id "$session_id" \
    --arg cwd "$cwd" \
    --arg mode "$mode" \
    '
      type == "object"
      and (.version == 1 or .version == 2)
      and .session_id == $session_id
      and .cwd == $cwd
      and .mode == $mode
      and (.task_state == "active" or .task_state == "complete" or .task_state == "idle")
      and (.implementation_unlocked | type == "boolean")
      and ((.unanchored_stop_count // 0) | if type == "number" then (. >= 0 and floor == .) else false end)
      and ((.reanchor_count // 0) | if type == "number" then (. >= 0 and floor == .) else false end)
    ' >/dev/null 2>&1
}

gb_reanchor_threshold() {
  local value="${GO_BEAST_REANCHOR_THRESHOLD:-2}"
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || value=2
  printf '%s\n' "$value"
}

gb_reanchor_max_interventions() {
  local value="${GO_BEAST_REANCHOR_MAX_INTERVENTIONS:-3}"
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || value=3
  printf '%s\n' "$value"
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
      version: 2,
      revision: 0,
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
      reanchor_count: 0,
      last_reanchor_reason: "",
      last_transition: "session-start",
      last_next_check: "",
      last_receipt: null,
      reported_approval_state: "",
      reported_task_state: "",
      reported_implementation: "",
      reported_completion_evidence: [],
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

gb_known_beast() {
  [[ "$(gb_runtime_applicability "${1:-}")" != "unknown" ]]
}

gb_runtime_required_artifact() {
  local explicit="${1:-}"
  local beast="${2:-go-chat}"
  if [[ -n "$explicit" ]] && gb_artifact_is_safe "$explicit"; then
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
  local approval
  approval="$(printf '%s' "$state" | jq -r '.approval_state // empty' 2>/dev/null || true)"
  if [[ "$approval" != "pending" && "$approval" != "approved" && "$approval" != "rejected" ]]; then
    approval="pending"
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
  local state_revision
  local implementation_status

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
  state_revision="$(printf '%s' "$state" | jq -r '.revision // 0' 2>/dev/null || printf '0')"
  [[ "$state_revision" =~ ^[0-9]+$ ]] || state_revision=0

  if [[ -n "$required_artifact" && "$required_artifact" != /* && "$required_artifact" != *..* && -e "$cwd/$required_artifact" ]]; then
    required_artifact_present=true
  elif [[ -n "$required_artifact" && "$required_artifact" == /* && -e "$required_artifact" ]]; then
    required_artifact_present=true
  fi

  implementation_status="blocked"
  if [[ "$implementation_unlocked" == "true" && "$approval_state" == "approved" \
    && ( -z "$required_artifact" || "$required_artifact_present" == "true" ) ]]; then
    if [[ "$task_state" == "complete" ]]; then
      implementation_status="complete"
    else
      implementation_status="allowed"
    fi
  fi

  jq -nc \
    --arg active_beast "$beast" \
    --arg applicability "$applicability" \
    --arg required_artifact "$required_artifact" \
    --arg approval_state "$approval_state" \
    --arg task_state "$task_state" \
    --arg implementation_status "$implementation_status" \
    --argjson state_revision "$state_revision" \
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
      task_state: $task_state,
      implementation_status: $implementation_status,
      state_revision: $state_revision
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
  local normalized

  state_file="$(gb_state_file "$session_id")"
  mkdir -p "$(dirname "$state_file")"

  if ! normalized="$(printf '%s' "$json" | jq -c \
    --arg now "$(gb_now_utc)" \
    'if type != "object" then error("state must be a JSON object") else
       .version = 2
       | .revision = (((.revision // 0) | if type == "number" then floor else 0 end) + 1)
       | .completion_evidence = ((.completion_evidence // []) | if type == "array" then . else [] end)
       | .reported_completion_evidence = ((.reported_completion_evidence // []) | if type == "array" then . else [] end)
       | .unanchored_stop_count = ((.unanchored_stop_count // 0) | if type == "number" and . >= 0 then floor else 0 end)
       | .reanchor_count = ((.reanchor_count // 0) | if type == "number" and . >= 0 then floor else 0 end)
       | .last_receipt = (.last_receipt // null)
       | .last_next_check = (.last_next_check // "")
       | .reported_approval_state = (.reported_approval_state // "")
       | .reported_task_state = (.reported_task_state // "")
       | .reported_implementation = (.reported_implementation // "")
       | .last_transition = (.last_transition // "state-update")
       | .updated_at = $now
     end')"; then
    return 1
  fi

  tmp_file="$(mktemp "${state_file}.tmp.XXXXXX")" || return 1
  printf '%s\n' "$normalized" > "$tmp_file"
  mv "$tmp_file" "$state_file"
}

gb_extract_beast() {
  local text="${1:-}"
  local candidate
  # Only extract a beast when it appears after an affirmative framing marker
  # ("Active beast:", "beast:", "<beast>", "using go-X", "invoking go-X").
  # Avoids extracting from negations ("don't use go-hawk") or incidental
  # mentions ("go-hawk would be premature here").
  candidate="$(printf '%s\n' "$text" | grep -Eoi '(active beast|beast|<beast>|using|invoking|running|invoke)[[:space:]:]+(go-[a-z]+)' \
    | grep -Eo 'go-[a-z]+' | head -n 1 || true)"
  if [[ -n "$candidate" ]] && gb_known_beast "$candidate"; then
    printf '%s\n' "$candidate"
  fi
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

gb_receipt_tag_value() {
  local body="$1"
  local tag="$2"
  local values
  local count

  values="$(printf '%s\n' "$body" | sed -nE "s|^[[:space:]]*<${tag}>([^<>]*)</${tag}>[[:space:]]*$|\\1|p")"
  count="$(printf '%s\n' "$values" | sed '/^$/d' | wc -l | tr -d '[:space:]')"
  [[ "$count" == "1" ]] || return 1
  printf '%s\n' "$values"
}

gb_receipt_json() {
  local text="${1:-}"
  local open_count
  local close_count
  local block
  local beast
  local artifact
  local task_state
  local approval_state
  local implementation_status
  local next_check
  local evidence
  local expected_artifact

  [[ -n "$text" ]] || return 1

  open_count="$(printf '%s\n' "$text" | grep -Ec '^[[:space:]]*<go_beast_receipt version="1">[[:space:]]*$' || true)"
  close_count="$(printf '%s\n' "$text" | grep -Ec '^[[:space:]]*</go_beast_receipt>[[:space:]]*$' || true)"
  [[ "$open_count" == "1" && "$close_count" == "1" ]] || return 1

  block="$(printf '%s\n' "$text" | awk '
    /^[[:space:]]*<go_beast_receipt version="1">[[:space:]]*$/ { inside=1 }
    inside { print }
    /^[[:space:]]*<\/go_beast_receipt>[[:space:]]*$/ { inside=0 }
  ')"
  [[ -n "$block" ]] || return 1

  beast="$(gb_receipt_tag_value "$block" beast)" || return 1
  artifact="$(gb_receipt_tag_value "$block" artifact)" || return 1
  task_state="$(gb_receipt_tag_value "$block" task)" || return 1
  approval_state="$(gb_receipt_tag_value "$block" approval)" || return 1
  implementation_status="$(gb_receipt_tag_value "$block" implementation)" || return 1
  next_check="$(gb_receipt_tag_value "$block" next_check)" || return 1
  evidence="$(gb_receipt_tag_value "$block" evidence)" || return 1

  gb_known_beast "$beast" || return 1
  expected_artifact="$(gb_runtime_required_artifact "" "$beast")"
  if [[ -n "$expected_artifact" ]]; then
    [[ "$artifact" == "$expected_artifact" ]] || return 1
  else
    [[ "$artifact" == "none" ]] || return 1
  fi

  case "$task_state" in
    active|complete|idle) ;;
    *) return 1 ;;
  esac
  case "$approval_state" in
    pending|approved|rejected) ;;
    *) return 1 ;;
  esac
  case "$implementation_status" in
    allowed|blocked|complete) ;;
    *) return 1 ;;
  esac
  [[ ${#next_check} -gt 0 && ${#next_check} -le 240 ]] || return 1
  [[ ${#evidence} -gt 0 && ${#evidence} -le 240 ]] || return 1

  jq -nc \
    --arg beast "$beast" \
    --arg artifact "$artifact" \
    --arg task_state "$task_state" \
    --arg approval_state "$approval_state" \
    --arg implementation_status "$implementation_status" \
    --arg next_check "$next_check" \
    --arg evidence "$evidence" \
    '{version: 1, beast: $beast, artifact: $artifact, task_state: $task_state,
      approval_state: $approval_state, implementation_status: $implementation_status,
      next_check: $next_check, evidence: $evidence}'
}

gb_receipt_matches_runtime() {
  local state="$1"
  local cwd="$2"
  local receipt="$3"
  local policy

  policy="$(gb_runtime_policy_json "$state" "$cwd")"
  printf '%s' "$receipt" | jq -e \
    --arg beast "$(printf '%s' "$policy" | jq -r '.active_beast')" \
    --arg artifact "$(printf '%s' "$policy" | jq -r '.required_artifact // ""')" \
    --arg approval "$(printf '%s' "$policy" | jq -r '.approval_state')" \
    --arg task_state "$(printf '%s' "$policy" | jq -r '.task_state')" \
    --arg implementation_status "$(printf '%s' "$policy" | jq -r '.implementation_status')" \
    '(.beast == $beast)
     and (.artifact == (if $artifact == "" then "none" else $artifact end))
     and (.approval_state == $approval)
     and (.task_state == $task_state)
     and (.implementation_status == $implementation_status)' >/dev/null 2>&1
}

gb_message_is_anchored() {
  local text="${1:-}"
  gb_receipt_json "$text" >/dev/null 2>&1
}
