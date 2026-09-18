#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

TOOL="$REPO_ROOT/skills/go-squirrel/scripts/kb-tool.mjs"
SKILL="$REPO_ROOT/skills/go-squirrel/SKILL.md"
EVAL="$REPO_ROOT/workflows/go-skill-eval.js"
FIXTURES="$REPO_ROOT/skills/go-squirrel/references/examples"
KB_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/go-squirrel-cli.XXXXXX")"
trap 'rm -rf "$KB_ROOT"' EXIT

checksum_file() {
  node -e 'const crypto=require("node:crypto"),fs=require("node:fs"); process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$1"
}

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

record_path="$KB_ROOT/records/cache-decision.md"
manifest_before_update="$(checksum_file "$KB_ROOT/MANIFEST.md")"

cat > "$KB_ROOT/update-1.json" <<'JSON'
{
  "id": "cache-decision",
  "content": "Use the deployment version as the cache namespace and invalidate only bounded affected entries.",
  "status": "stale",
  "provenance": [
    {
      "origin": "agent",
      "actor": "issue-75-test",
      "source": "tests/plugin/test-go-squirrel-cli.sh",
      "captured_at": "2026-09-17T12:00:00Z",
      "note": "Captured by the native update regression."
    }
  ],
  "history": [
    {
      "version": 1,
      "changed_at": "2026-09-17T12:00:00Z",
      "change": "Expanded cache invalidation guidance.",
      "reason": "Issue #75 regression."
    }
  ]
}
JSON

update_error="$KB_ROOT/update-red.txt"
if ! node "$TOOL" update --root "$KB_ROOT" --record-file "$KB_ROOT/update-1.json" >"$KB_ROOT/update-1-output.txt" 2>"$update_error"; then
  if grep -Fq "unknown command: update" "$update_error"; then
    echo "GO_SQUIRREL_UPDATE_RED" >&2
  else
    cat "$update_error" >&2
  fi
  exit 1
fi

assert_contains "$record_path" 'title: "Use bounded cache invalidation"' "preserves omitted title"
assert_contains "$record_path" 'status: "stale"' "updates mutable field"
assert_contains "$record_path" 'actor: "maintainer"' "preserves existing provenance"
assert_contains "$record_path" 'actor: "issue-75-test"' "appends new provenance"
assert_contains "$record_path" 'version: 1' "appends first history entry"
node - "$record_path" <<'NODE'
const fs = require('fs');
const text = fs.readFileSync(process.argv[2], 'utf8');
const expected = '## Content\n\nUse the deployment version as the cache namespace and invalidate only bounded affected entries.';
if (!text.includes(expected)) {
  console.error('[FAIL] renders updated content in the Markdown body');
  process.exit(1);
}
console.log('[PASS] renders updated content in the Markdown body');
NODE

cat > "$KB_ROOT/update-2.json" <<'JSON'
{
  "id": "cache-decision",
  "priority": "critical",
  "history": [
    {
      "version": 2,
      "changed_at": "2026-09-17T12:05:00Z",
      "change": "Raised retrieval priority.",
      "reason": "Issue #75 append-only history regression."
    }
  ]
}
JSON
node "$TOOL" update --root "$KB_ROOT" --record-file "$KB_ROOT/update-2.json"
assert_contains "$record_path" 'priority: "critical"' "applies second partial patch"
assert_contains "$record_path" 'actor: "issue-75-test"' "preserves provenance across later update"
assert_contains "$record_path" 'version: 1' "preserves previous history entry"
assert_contains "$record_path" 'version: 2' "appends later history entry"
assert_contains "$record_path" 'invalidate only bounded affected entries' "preserves omitted content across later update"

record_checksum="$(checksum_file "$record_path")"
manifest_after_update="$(checksum_file "$KB_ROOT/MANIFEST.md")"
if [ "$manifest_before_update" = "$manifest_after_update" ]; then
  echo "[FAIL] successful update did not regenerate MANIFEST.md"
  exit 1
fi
echo "[PASS] successful update regenerates MANIFEST.md"
assert_contains "$KB_ROOT/MANIFEST.md" "$record_checksum" "manifest records updated checksum"
assert_contains "$KB_ROOT/INDEX.md" 'cache-decision.*\(stale\)' "regenerates index with updated status"

cat > "$KB_ROOT/missing-update.json" <<'JSON'
{
  "id": "missing-record",
  "summary": "This record must not be created by update."
}
JSON
missing_error="$KB_ROOT/missing-update-error.txt"
if node "$TOOL" update --root "$KB_ROOT" --record-file "$KB_ROOT/missing-update.json" >"$KB_ROOT/missing-update-output.txt" 2>"$missing_error"; then
  echo "[FAIL] update accepted a missing record id"
  exit 1
fi
assert_contains "$missing_error" "record id does not exist: missing-record" "rejects update for missing record"
if [ -e "$KB_ROOT/records/missing-record.md" ]; then
  echo "[FAIL] missing-id update created a record"
  exit 1
fi
echo "[PASS] missing-id update creates nothing"

cat > "$KB_ROOT/invalid-update.json" <<'JSON'
{
  "id": "cache-decision",
  "priority": "urgent"
}
JSON
record_before_invalid="$(checksum_file "$record_path")"
manifest_before_invalid="$(checksum_file "$KB_ROOT/MANIFEST.md")"
invalid_error="$KB_ROOT/invalid-update-error.txt"
if node "$TOOL" update --root "$KB_ROOT" --record-file "$KB_ROOT/invalid-update.json" >"$KB_ROOT/invalid-update-output.txt" 2>"$invalid_error"; then
  echo "[FAIL] invalid update was accepted"
  exit 1
fi
assert_contains "$invalid_error" "priority must be one of" "rejects invalid merged record"
record_after_invalid="$(checksum_file "$record_path")"
manifest_after_invalid="$(checksum_file "$KB_ROOT/MANIFEST.md")"
if [ "$record_before_invalid" != "$record_after_invalid" ] || [ "$manifest_before_invalid" != "$manifest_after_invalid" ]; then
  echo "[FAIL] invalid update mutated record or generated surfaces"
  exit 1
fi
echo "[PASS] invalid update is non-destructive"

# Regression: nullable verified_at is valid and must remain updateable.
nullable_root="$KB_ROOT/nullable-kb"
node "$TOOL" init \
  --root "$nullable_root" \
  --kb-id nullable-kb \
  --title "Nullable KB" \
  --purpose "Exercise nullable verified_at updates." \
  --format md:plain >/dev/null
node "$TOOL" add --root "$nullable_root" --record-file "$FIXTURES/deployment-record.json" >/dev/null
node - "$nullable_root/records/deployment-fact.md" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, text.replace('verified_at: "2026-09-13T10:00:00Z"', 'verified_at: null'));
NODE
cat > "$nullable_root/update.json" <<'JSON'
{
  "id": "deployment-fact",
  "status": "stale"
}
JSON
node "$TOOL" update --root "$nullable_root" --record-file "$nullable_root/update.json" >/dev/null
assert_contains "$nullable_root/records/deployment-fact.md" 'verified_at: null' "update accepts nullable verified_at"
assert_contains "$nullable_root/records/deployment-fact.md" 'status: "stale"' "nullable verified_at update applies patch"

# Regression: update must not follow a record symlink outside the KB root.
symlink_root="$KB_ROOT/symlink-kb"
node "$TOOL" init \
  --root "$symlink_root" \
  --kb-id symlink-kb \
  --title "Symlink KB" \
  --purpose "Exercise update filesystem containment." \
  --format md:plain >/dev/null
node "$TOOL" add --root "$symlink_root" --record-file "$FIXTURES/deployment-record.json" >/dev/null
external_record="$KB_ROOT/external-deployment-record.md"
mv "$symlink_root/records/deployment-fact.md" "$external_record"
ln -s "$external_record" "$symlink_root/records/deployment-fact.md"
cat > "$symlink_root/update.json" <<'JSON'
{
  "id": "deployment-fact",
  "status": "stale"
}
JSON
external_before="$(checksum_file "$external_record")"
symlink_error="$symlink_root/update-error.txt"
if node "$TOOL" update --root "$symlink_root" --record-file "$symlink_root/update.json" >"$symlink_root/update-output.txt" 2>"$symlink_error"; then
  echo "[FAIL] update followed a record symlink outside the KB root"
  exit 1
fi
assert_contains "$symlink_error" "record target must remain inside the KB root" "rejects update target outside KB root"
external_after="$(checksum_file "$external_record")"
if [ "$external_before" != "$external_after" ]; then
  echo "[FAIL] rejected symlink update mutated the external record"
  exit 1
fi
echo "[PASS] rejected symlink update preserves external record bytes"

# Regression: append-only fields must fail closed when stored baseline shape is invalid.
malformed_root="$KB_ROOT/malformed-kb"
node "$TOOL" init \
  --root "$malformed_root" \
  --kb-id malformed-kb \
  --title "Malformed KB" \
  --purpose "Exercise append-only baseline preservation." \
  --format md:plain >/dev/null
node "$TOOL" add --root "$malformed_root" --record-file "$FIXTURES/deployment-record.json" >/dev/null
malformed_record="$malformed_root/records/deployment-fact.md"
node - "$malformed_record" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, text.replace('history: []', 'history: "legacy manual note"'));
NODE
cat > "$malformed_root/update.json" <<'JSON'
{
  "id": "deployment-fact",
  "history": [
    {
      "version": 1,
      "changed_at": "2026-09-17T12:10:00Z",
      "change": "Attempt append over malformed legacy history."
    }
  ]
}
JSON
malformed_before="$(checksum_file "$malformed_record")"
malformed_error="$malformed_root/update-error.txt"
if node "$TOOL" update --root "$malformed_root" --record-file "$malformed_root/update.json" >"$malformed_root/update-output.txt" 2>"$malformed_error"; then
  echo "[FAIL] update replaced malformed append-only history"
  exit 1
fi
assert_contains "$malformed_error" "existing history must be an array" "rejects malformed append-only baseline"
malformed_after="$(checksum_file "$malformed_record")"
if [ "$malformed_before" != "$malformed_after" ]; then
  echo "[FAIL] rejected malformed-history update mutated the record"
  exit 1
fi
echo "[PASS] rejected malformed-history update preserves record bytes"

help_output="$KB_ROOT/help.txt"
node "$TOOL" --help > "$help_output"
native_commands="$(awk '
  /^Native, dependency-free Markdown KB operations:/ { in_ops=1; next }
  in_ops && /^$/ { exit }
  in_ops { print $1 }
' "$help_output" | paste -sd, -)"
if [ "$native_commands" != "init,add,update,manifest,context,validate" ]; then
  echo "[FAIL] native help command set is unexpected: $native_commands"
  exit 1
fi
echo "[PASS] help lists the complete native command set"
assert_contains "$SKILL" 'Native Markdown helper commands: `init`, `add`, `update`, `manifest`, `context`, `validate`\.' "SKILL documents the native command set"
assert_contains "$SKILL" 'Semantic operations.*`link`.*`archive`.*not native `kb-tool.mjs` commands' "SKILL distinguishes non-native semantic operations"
assert_contains "$EVAL" 'init, add, update, manifest, context, and validate' "skill eval expects update as native"
assert_contains "$KB_ROOT/KB_SPEC.md" 'add rejects duplicate IDs while update intentionally revises an existing record' "generated spec explains add/update overwrite semantics"

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
assert_contains "$KB_ROOT/KB_VALIDATION.md" "Status: PASS" "writes passing validation report"
assert_contains "$KB_ROOT/KB_VALIDATION.md" "Errors: 0" "round trip reports zero validation errors"

echo "[PASS] go-squirrel native authoring and update path"
