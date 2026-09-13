#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TOOL="$REPO_ROOT/skills/go-squirrel/scripts/kb-tool.mjs"
FIXTURES="$REPO_ROOT/skills/go-squirrel/references/examples"
KB_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/go-squirrel-cli.XXXXXX")"
trap 'rm -rf "$KB_ROOT"' EXIT

node "$TOOL" init \
  --root "$KB_ROOT" \
  --kb-id relay-api \
  --title "Relay API" \
  --purpose "Keep deployment and caching decisions available to future agents." \
  --format md:plain
node "$TOOL" add --root "$KB_ROOT" --record-file "$FIXTURES/deployment-record.json"
node "$TOOL" add --root "$KB_ROOT" --record-file "$FIXTURES/record.json"
duplicate_error="$KB_ROOT/duplicate-error.txt"
if node "$TOOL" add --root "$KB_ROOT" --record-file "$FIXTURES/record.json" >"$KB_ROOT/duplicate-output.txt" 2>"$duplicate_error"; then
  echo "[FAIL] duplicate record was accepted"
  exit 1
fi
assert_contains "$duplicate_error" "record id already exists" "rejects duplicate record"
node "$TOOL" context \
  --root "$KB_ROOT" \
  --task "Prepare a safe cache deployment change" \
  --records cache-decision,deployment-fact \
  --max-records 2
node "$TOOL" validate --root "$KB_ROOT"

for required_file in \
  KB_SPEC.md INDEX.md MANIFEST.md CONTEXT_PACKET.md KB_VALIDATION.md \
  records/cache-decision.md records/deployment-fact.md; do
  [ -f "$KB_ROOT/$required_file" ] || {
    echo "[FAIL] missing generated artifact: $required_file"
    exit 1
  }
done

assert_contains "$KB_ROOT/records/cache-decision.md" "records/deployment-fact.md" "normalizes local reference"
assert_contains "$KB_ROOT/MANIFEST.md" "Backlinks" "generates backlink section"
assert_contains "$KB_ROOT/MANIFEST.md" "cache-decision" "indexes cache record"
assert_contains "$KB_ROOT/CONTEXT_PACKET.md" "Selected records" "emits bounded context packet"
assert_contains "$KB_ROOT/CONTEXT_PACKET.md" "cache-decision" "includes requested record"
assert_contains "$KB_ROOT/KB_VALIDATION.md" "PASS" "writes passing validation report"

echo "[PASS] go-squirrel native authoring path"
