#!/usr/bin/env bash
# Runs type checking and tests after the agent finishes modifying code.
# Event: Stop — exits non-zero on failures to re-trigger the agent.

set -uo pipefail

STATE_DIR="${GO_BEAST_STATE_DIR:-$HOME/.go-beast}"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# Prevent infinite loop when the hook itself re-triggers the agent
[[ "$stop_hook_active" == "true" ]] && exit 0

session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null || echo "")
session_id="${session_id:-default}"
FLAG_FILE="$STATE_DIR/code-verify.${session_id}.pending"

[[ ! -f "$FLAG_FILE" ]] && exit 0

PROJECT_DIR=$(cat "$FLAG_FILE")
rm -f "$FLAG_FILE"

[[ ! -d "$PROJECT_DIR" ]] && exit 0

cd "$PROJECT_DIR" || exit 0

ERRORS=0
HAS_CHECKS=false
OUTPUT=""

append() { OUTPUT="${OUTPUT}${1}\n"; }

# ── TypeScript ──────────────────────────────────────────────────────────────
if [[ -f "tsconfig.json" ]]; then
  HAS_CHECKS=true
  append "--- TypeScript: tsc --noEmit ---"
  if tsc_out=$(npx --no-install tsc --noEmit 2>&1); then
    append "✓ Tipagem OK"
  else
    append "✗ Erros de tipagem:"
    append "$(echo "$tsc_out" | head -40)"
    ERRORS=$((ERRORS + 1))
  fi
  append ""
fi

# ── Testes Node.js (vitest / jest / npm test) ───────────────────────────────
if [[ -f "package.json" ]]; then
  test_cmd=""
  if [[ -f "node_modules/.bin/vitest" ]]; then
    test_cmd="npx vitest run --reporter=verbose"
  elif [[ -f "node_modules/.bin/jest" ]]; then
    test_cmd="npx jest --passWithNoTests"
  else
    test_script=$(jq -r '.scripts.test // empty' package.json)
    placeholder='echo "Error: no test specified" && exit 1'
    if [[ -n "$test_script" && "$test_script" != "$placeholder" ]]; then
      test_cmd="npm test"
    fi
  fi

  if [[ -n "$test_cmd" ]]; then
    HAS_CHECKS=true
    append "--- Tests (Node.js): $test_cmd ---"
    if test_out=$($test_cmd 2>&1); then
      append "✓ Tests passed"
    else
      append "✗ Tests failed:"
      append "$(echo "$test_out" | tail -40)"
      ERRORS=$((ERRORS + 1))
    fi
    append ""
  fi
fi

# ── Python ──────────────────────────────────────────────────────────────────
if [[ -f "pyproject.toml" || -f "setup.py" || -f "setup.cfg" || -f "requirements.txt" ]]; then
  if command -v mypy &>/dev/null; then
    HAS_CHECKS=true
    append "--- Python: mypy ---"
    if mypy_out=$(mypy . 2>&1); then
      append "✓ Type check OK"
    else
      append "✗ Type errors (mypy):"
      append "$(echo "$mypy_out" | tail -30)"
      ERRORS=$((ERRORS + 1))
    fi
    append ""
  fi

  if command -v pytest &>/dev/null; then
    HAS_CHECKS=true
    append "--- Python: pytest ---"
    if pytest_out=$(pytest --tb=short -q 2>&1); then
      append "✓ Tests passed"
    else
      append "✗ Tests failed:"
      append "$(echo "$pytest_out" | tail -40)"
      ERRORS=$((ERRORS + 1))
    fi
    append ""
  fi
fi

# ── Go ──────────────────────────────────────────────────────────────────────
if [[ -f "go.mod" ]]; then
  HAS_CHECKS=true
  append "--- Go: vet ---"
  if vet_out=$(go vet ./... 2>&1); then
    append "✓ Vet OK"
  else
    append "✗ go vet found issues:"
    append "$vet_out"
    ERRORS=$((ERRORS + 1))
  fi
  append ""

  append "--- Go: test ---"
  if test_out=$(go test ./... 2>&1); then
    append "✓ Tests passed"
  else
    append "✗ Tests failed:"
    append "$(echo "$test_out" | tail -40)"
    ERRORS=$((ERRORS + 1))
  fi
  append ""
fi

# ── Rust ────────────────────────────────────────────────────────────────────
if [[ -f "Cargo.toml" ]]; then
  HAS_CHECKS=true
  append "--- Rust: cargo check ---"
  if check_out=$(cargo check 2>&1); then
    append "✓ Check OK"
  else
    append "✗ Compilation errors (cargo check):"
    append "$(echo "$check_out" | tail -30)"
    ERRORS=$((ERRORS + 1))
  fi
  append ""

  append "--- Rust: cargo test ---"
  if test_out=$(cargo test 2>&1); then
    append "✓ Tests passed"
  else
    append "✗ Tests failed:"
    append "$(echo "$test_out" | tail -40)"
    ERRORS=$((ERRORS + 1))
  fi
  append ""
fi

[[ "$HAS_CHECKS" == "false" ]] && exit 0

echo "=== Post-modification checks: $PROJECT_DIR ==="
printf '%b' "$OUTPUT"

if [[ $ERRORS -gt 0 ]]; then
  echo "⚠ $ERRORS check(s) failed. Fix the issues above before proceeding."
  exit 1
fi

echo "✓ All checks passed."
exit 0
