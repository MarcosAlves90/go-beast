#!/usr/bin/env bash

set -euo pipefail

create_test_project() {
  mktemp -d
}

cleanup_test_project() {
  local test_dir="$1"
  [ -d "$test_dir" ] && rm -rf "$test_dir"
}

run_with_timeout() {
  local seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
    return
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
    return
  fi

  python3 - "$seconds" "$@" <<'PY'
import subprocess
import sys

timeout = int(sys.argv[1])
cmd = sys.argv[2:]
completed = subprocess.run(cmd, timeout=timeout)
sys.exit(completed.returncode)
PY
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local test_name="$3"
  if rg -q "$pattern" "$file"; then
    echo "[PASS] $test_name"
  else
    echo "[FAIL] $test_name"
    echo "Expected pattern: $pattern"
    echo "File: $file"
    return 1
  fi
}

assert_symlink_target() {
  local link_path="$1"
  local expected="$2"
  local test_name="$3"
  if [ ! -L "$link_path" ]; then
    echo "[FAIL] $test_name"
    echo "Not a symlink: $link_path"
    return 1
  fi
  local actual
  actual="$(cd "$(dirname "$link_path")" && realpath "$(readlink "$link_path")")"
  if [ "$actual" = "$expected" ]; then
    echo "[PASS] $test_name"
  else
    echo "[FAIL] $test_name"
    echo "Expected: $expected"
    echo "Actual:   $actual"
    return 1
  fi
}

require_live_agent_tests() {
  local harness="$1"
  if [ "${GO_BEAST_RUN_LIVE_AGENT_TESTS:-0}" != "1" ]; then
    echo "[SKIP] $harness live-agent test (set GO_BEAST_RUN_LIVE_AGENT_TESTS=1 to enable)"
    exit 0
  fi

  if ! command -v "$harness" >/dev/null 2>&1; then
    echo "[SKIP] $harness live-agent test ($harness not installed)"
    exit 0
  fi
}
