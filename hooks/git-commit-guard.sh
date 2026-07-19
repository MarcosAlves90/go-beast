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

git_command_prefix='git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|--git-dir(=|[[:space:]]+)[^[:space:]]+|--work-tree(=|[[:space:]]+)[^[:space:]]+|--no-pager|--paginate|--no-replace-objects))*'
echo "$command" | grep -qE "(^|[;&|[:space:](])${git_command_prefix}[[:space:]]+commit([[:space:]]|$)" && has_commit=true
echo "$command" | grep -qE "(^|[;&|[:space:](])${git_command_prefix}[[:space:]]+add([[:space:]]|$)"    && has_add=true

[[ "$has_commit" == "false" && "$has_add" == "false" ]] && exit 0

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

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

# Task-scoped go-beast outputs are disposable by default. The local
# .git/info/exclude entry is still useful for normal Git behavior, but the
# hook must also protect the staging boundary when that entry is missing or a
# command uses a broad/forced add. Intentionally tracked files remain allowed.
is_disposable_go_beast_artifact() {
  local f="$1"
  f="${f#./}"

  [[ "$f" == "REQUIREMENTS.md" || "$f" == "APPROACH.md" ]] && return 0
  [[ "$f" == ".go-beast" || "$f" == ".go-beast/" || "$f" == .go-beast/* || "$f" == */.go-beast || "$f" == */.go-beast/* ]] && return 0

  return 1
}

is_committed_path() {
  local f="$1"
  git -C "$repo_root" cat-file -e "HEAD:$f" >/dev/null 2>&1
}

normalize_git_path() {
  local f="$1"
  local absolute
  f="${f#./}"

  if [[ -n "$repo_root" && "$f" == /* && "$f" == "$repo_root/"* ]]; then
    printf '%s\n' "${f#"$repo_root"/}"
    return
  fi

  if [[ -n "$repo_root" && "$f" != /* && -e "$f" ]]; then
    absolute="$(cd "$(dirname "$f")" && pwd -P)/$(basename "$f")"
    if [[ "$absolute" == "$repo_root/"* ]]; then
      printf '%s\n' "${absolute#"$repo_root"/}"
      return
    fi
  fi

  printf '%s\n' "$f"
}

VIOLATIONS=""

collect_violations() {
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    normalized="$(normalize_git_path "$file")"
    if is_disposable_go_beast_artifact "$normalized" && ! is_committed_path "$normalized"; then
      VIOLATIONS="${VIOLATIONS}  - ${file} (disposable go-beast artifact)\n"
    elif is_dangerous "$file"; then
      VIOLATIONS="${VIOLATIONS}  - ${file}\n"
    fi
  done
}

# ── Verifica git commit ──────────────────────────────────────────────────────
if [[ "$has_commit" == "true" ]]; then
  staged=$(git -C "$repo_root" diff --cached --name-only 2>/dev/null || true)
  [[ -n "$staged" ]] && collect_violations <<< "$staged"

  # git commit -am also includes modified tracked files
  if echo "$command" | grep -qE 'git[[:space:]]+commit[[:space:]].*-[a-zA-Z]*a'; then
    modified=$(git -C "$repo_root" diff --name-only 2>/dev/null || true)
    [[ -n "$modified" ]] && collect_violations <<< "$modified"
  fi
fi

# ── Verifica git add ─────────────────────────────────────────────────────────
if [[ "$has_add" == "true" ]]; then
  is_broad=false
  add_tail="${command#* add }"
  echo "$add_tail" | grep -qE '(^|[[:space:]])(-A|--all|-u|--interactive|-i|--patch|-p|--pathspec-file-nul)([[:space:]]|$)' && is_broad=true
  echo "$add_tail" | grep -qE '(^|[[:space:]])--pathspec-from-file([=[:space:]]|$)' && is_broad=true
  echo "$add_tail" | grep -qE '(^|[[:space:]])(--[[:space:]]+)?(\./?|\.)([[:space:]]|$|[;&|])' && is_broad=true
  echo "$add_tail" | grep -qE '(^|[[:space:]])(:/|:\(top\))([[:space:]]|$|[;&|])' && is_broad=true

  if [[ "$is_broad" == "true" ]]; then
    to_stage=$(git -C "$repo_root" status --short 2>/dev/null | awk '{print $NF}' || true)
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
  echo "git-commit-guard: blocked — sensitive or artifact files detected" >&2
  echo "Blocked: sensitive files or build artifacts detected for commit/staging:"
  printf '%b' "$VIOLATIONS"
  echo "For disposable go-beast artifacts, leave them untracked and record the exact path in .git/info/exclude."
  echo "Remove from staging with: git reset HEAD <file>"
  exit 1
fi

exit 0
