#!/usr/bin/env bash
# Blocks git commit/add when sensitive files or build artifacts are staged.
# Event: PreToolUse (Bash)

set -uo pipefail

input=$(cat)

# Extract tool_name via jq; fallback to grep on raw input if jq fails (literal newlines).
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
if [[ -z "$tool_name" ]]; then
  echo "$input" | grep -q '"tool_name"[[:space:]]*:[[:space:]]*"Bash"' || exit 0
else
  [[ "$tool_name" != "Bash" ]] && exit 0
fi

# Extract command via jq; fallback to raw input if jq fails.
command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
if [[ -z "$command" ]]; then
  # jq failed — use raw input directly for detection
  command="$input"
fi

# ── Detect git commit or git add in the command ──────────────────────────────
has_commit=false
has_add=false

echo "$command" | grep -qE 'git[[:space:]]+commit' && has_commit=true
echo "$command" | grep -qE 'git[[:space:]]+add'    && has_add=true

[[ "$has_commit" == "false" && "$has_add" == "false" ]] && exit 0

# ── Classify a path as dangerous ─────────────────────────────────────────────
is_dangerous() {
  local f="$1"
  [[ -z "$f" ]] && return 1

  # Exceptions: example files are safe
  if echo "$f" | grep -qE '(^|/)\.env\.(example|sample|template|dist)$'; then
    return 1
  fi

  # Arquivos .env e variantes de ambiente
  echo "$f" | grep -qE '(^|/)\.env($|\.(local|development|production|staging|test|ci|docker))$' && return 0

  # Segredos e credenciais
  echo "$f" | grep -qE '(^|/)(secrets?|credentials?)\.(json|ya?ml|env|txt|toml|ini)$' && return 0
  echo "$f" | grep -qE '\.(pem|key|p12|pfx|cer|crt|der|jks|keystore)$' && return 0
  echo "$f" | grep -qE '\.(tfstate|tfstate\.backup)$' && return 0

  # Dependency and build directories
  echo "$f" | grep -qE '(^|/)node_modules/' && return 0
  echo "$f" | grep -qE '(^|/)(dist|build|out|\.next|\.nuxt|\.svelte-kit|\.turbo|\.parcel-cache)/' && return 0
  echo "$f" | grep -qE '(^|/)(coverage|\.nyc_output|\.c8)/' && return 0
  echo "$f" | grep -qE '(^|/)(target|vendor)/' && return 0       # Rust / Java / Go
  echo "$f" | grep -qE '(^|/)(__pycache__|\.venv|[Vv]env|\.mypy_cache|\.pytest_cache)/' && return 0
  echo "$f" | grep -qE '(^|/)\.terraform/' && return 0
  echo "$f" | grep -qE '\.(pyc|pyo|class|jar)$' && return 0

  # Bancos locais e logs
  echo "$f" | grep -qE '\.(sqlite|sqlite3|db|db3)$' && return 0
  echo "$f" | grep -qE '\.log$' && return 0

  # Artefatos de SO
  echo "$f" | grep -qE '(^|/)\.DS_Store$' && return 0
  echo "$f" | grep -qE '(^|/)Thumbs\.db$' && return 0

  return 1
}

VIOLATIONS=""

collect_violations() {
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    if is_dangerous "$file"; then
      VIOLATIONS="${VIOLATIONS}  - ${file}\n"
    fi
  done
}

# ── Verifica git commit ──────────────────────────────────────────────────────
if [[ "$has_commit" == "true" ]]; then
  staged=$(git diff --cached --name-only 2>/dev/null || true)
  [[ -n "$staged" ]] && collect_violations <<< "$staged"

  # git commit -am also includes modified tracked files
  if echo "$command" | grep -qE 'git[[:space:]]+commit[[:space:]].*-[a-zA-Z]*a'; then
    modified=$(git diff --name-only 2>/dev/null || true)
    [[ -n "$modified" ]] && collect_violations <<< "$modified"
  fi
fi

# ── Verifica git add ─────────────────────────────────────────────────────────
if [[ "$has_add" == "true" ]]; then
  is_broad=false
  echo "$command" | grep -qE 'git[[:space:]]+add[[:space:]]+(-A|--all|-u)' && is_broad=true
  echo "$command" | grep -qE 'git[[:space:]]+add[[:space:]]+\.$'            && is_broad=true
  echo "$command" | grep -qE 'git[[:space:]]+add[[:space:]]+\.[[:space:]]'  && is_broad=true

  if [[ "$is_broad" == "true" ]]; then
    to_stage=$(git status --short 2>/dev/null | awk '{print $NF}' || true)
    [[ -n "$to_stage" ]] && collect_violations <<< "$to_stage"
  else
    paths=$(echo "$command" \
      | sed -E 's/.*git[[:space:]]+add[[:space:]]*//' \
      | tr ' ' '\n' \
      | grep -v '^-' \
      | grep -v '^$' || true)
    [[ -n "$paths" ]] && collect_violations <<< "$paths"
  fi
fi

# ── Report violations ────────────────────────────────────────────────────────
if [[ -n "$VIOLATIONS" ]]; then
  echo "🚫 Blocked: sensitive files or build artifacts detected for commit/staging:"
  echo ""
  printf '%b' "$VIOLATIONS"
  echo ""
  echo "These files must not be committed."
  echo "Add them to .gitignore and remove from staging with:  git reset HEAD <file>"
  exit 1
fi

exit 0
