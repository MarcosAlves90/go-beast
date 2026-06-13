#!/usr/bin/env bash
# Executa verificação de tipagem e testes após Claude finalizar modificações de código.
# Event: Stop — sai com código não-zero se houver falhas para re-disparar Claude.

set -uo pipefail

FLAG_FILE="$HOME/.claude/.code-verify-pending"

input=$(cat)
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")

# Previne loop infinito quando o próprio hook re-dispara Claude
[[ "$stop_hook_active" == "true" ]] && exit 0

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
    append "--- Testes (Node.js): $test_cmd ---"
    if test_out=$($test_cmd 2>&1); then
      append "✓ Testes passaram"
    else
      append "✗ Testes falharam:"
      append "$(echo "$test_out" | tail -40)"
      ERRORS=$((ERRORS + 1))
    fi
    append ""
  fi
fi

# ── Python ──────────────────────────────────────────────────────────────────
if [[ -f "pyproject.toml" || -f "setup.py" || -f "setup.cfg" ]]; then
  if command -v mypy &>/dev/null; then
    HAS_CHECKS=true
    append "--- Python: mypy ---"
    if mypy_out=$(mypy . 2>&1); then
      append "✓ Tipagem OK"
    else
      append "✗ Erros de tipagem (mypy):"
      append "$(echo "$mypy_out" | tail -30)"
      ERRORS=$((ERRORS + 1))
    fi
    append ""
  fi

  if command -v pytest &>/dev/null; then
    HAS_CHECKS=true
    append "--- Python: pytest ---"
    if pytest_out=$(pytest --tb=short -q 2>&1); then
      append "✓ Testes passaram"
    else
      append "✗ Testes falharam:"
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
    append "✗ go vet encontrou problemas:"
    append "$vet_out"
    ERRORS=$((ERRORS + 1))
  fi
  append ""

  append "--- Go: test ---"
  if test_out=$(go test ./... 2>&1); then
    append "✓ Testes passaram"
  else
    append "✗ Testes falharam:"
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
    append "✗ Erros de compilação (cargo check):"
    append "$(echo "$check_out" | tail -30)"
    ERRORS=$((ERRORS + 1))
  fi
  append ""

  append "--- Rust: cargo test ---"
  if test_out=$(cargo test 2>&1); then
    append "✓ Testes passaram"
  else
    append "✗ Testes falharam:"
    append "$(echo "$test_out" | tail -40)"
    ERRORS=$((ERRORS + 1))
  fi
  append ""
fi

[[ "$HAS_CHECKS" == "false" ]] && exit 0

echo "=== Verificação pós-modificação: $PROJECT_DIR ==="
printf '%b' "$OUTPUT"

if [[ $ERRORS -gt 0 ]]; then
  echo "⚠ $ERRORS verificação(ões) com falhas. Corrija os problemas acima antes de prosseguir."
  exit 1
fi

echo "✓ Todas as verificações passaram."
exit 0
