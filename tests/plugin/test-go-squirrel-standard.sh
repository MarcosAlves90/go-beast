#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$REPO_ROOT/tests/helpers.sh"

SKILL="$REPO_ROOT/skills/go-squirrel/SKILL.md"
STANDARD="$REPO_ROOT/skills/go-squirrel/references/KB_STANDARD.md"
SCHEMA="$REPO_ROOT/skills/go-squirrel/references/kb-record.schema.json"
JSON_FIXTURE="$REPO_ROOT/skills/go-squirrel/references/examples/record.json"
TOON_FIXTURE="$REPO_ROOT/skills/go-squirrel/references/examples/record.toon"

[ -f "$SKILL" ]
[ -f "$STANDARD" ]
[ -f "$SCHEMA" ]
[ -f "$JSON_FIXTURE" ]
[ -f "$TOON_FIXTURE" ]

assert_contains "$SKILL" '^name: go-squirrel$' 'go-squirrel metadata declares its name'
assert_contains "$SKILL" '^version: [0-9]+\.[0-9]+\.[0-9]+$' 'go-squirrel metadata declares a version'
assert_contains "$SKILL" '^when_to_use:' 'go-squirrel metadata declares when_to_use'
assert_contains "$SKILL" '^## Workflow$' 'go-squirrel has a workflow section'
assert_contains "$SKILL" '^### 1\. Scope the memory$' 'go-squirrel starts with scoping'
assert_contains "$SKILL" '^## Rules$' 'go-squirrel has hard rules'
assert_contains "$SKILL" '^## Output$' 'go-squirrel names its outputs'
assert_contains "$SKILL" 'KB_VALIDATION\.md' 'go-squirrel names validation evidence'
assert_contains "$SKILL" 'CONTEXT_PACKET' 'go-squirrel names bounded retrieval context'

assert_contains "$STANDARD" 'INDEX\.<ext>' 'standard defines the index projection'
assert_contains "$STANDARD" 'MANIFEST\.<ext>' 'standard defines the manifest projection'
assert_contains "$STANDARD" 'stable IDs' 'standard defines stable graph identity'
assert_contains "$STANDARD" 'generated.*backlinks' 'standard defines generated backlinks'
assert_contains "$STANDARD" 'unresolved references' 'standard defines unresolved-reference validation'
assert_contains "$STANDARD" 'Obsidian' 'standard defines the Obsidian projection'
assert_contains "$STANDARD" 'JSON Schema' 'standard defines the JSON projection'
assert_contains "$STANDARD" 'TOON' 'standard defines the TOON projection'
assert_contains "$STANDARD" 'CONTEXT_PACKET' 'standard defines the context packet'
assert_contains "$STANDARD" 'KB_VALIDATION\.md' 'standard defines validation evidence'

node --input-type=module - "$SCHEMA" "$JSON_FIXTURE" "$TOON_FIXTURE" <<'NODE'
import fs from 'node:fs'

const [schemaPath, recordPath, toonPath] = process.argv.slice(2)
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
const toon = fs.readFileSync(toonPath, 'utf8')

if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
  throw new Error('schema must target JSON Schema draft 2020-12')
}

const required = [
  'kind', 'schema_version', 'id', 'title', 'record_type', 'status', 'audience',
  'summary', 'content', 'tags', 'aliases', 'references', 'sources',
  'epistemic_status', 'confidence', 'priority', 'retrieval_hints', 'created_at',
  'updated_at', 'verified_at', 'provenance',
]
for (const field of required) {
  if (!schema.required.includes(field)) throw new Error(`schema missing ${field}`)
  if (!(field in record)) throw new Error(`fixture missing ${field}`)
}

if (record.kind !== 'record' || record.schema_version !== '1.0') throw new Error('invalid record envelope')
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) throw new Error('fixture ID is not stable kebab-case')
if (record.confidence < 0 || record.confidence > 1) throw new Error('fixture confidence is outside 0..1')
if (!Array.isArray(record.provenance) || record.provenance.length === 0) throw new Error('fixture lacks provenance')
if (!record.references.every(value => !value.startsWith('/') && !value.split('/').includes('..'))) {
  throw new Error('fixture contains an unsafe local reference')
}

for (const marker of [
  'toon_spec_version: 4.1',
  'tags[2]:',
  'references[1]:',
  'provenance[1]{origin,actor,source,captured_at,note}:',
  'history[0]{version,changed_at,change,reason}:',
]) {
  if (!toon.includes(marker)) throw new Error(`TOON fixture missing ${marker}`)
}

console.log('[PASS] go-squirrel schema and format fixtures')
NODE

echo '[PASS] go-squirrel standard tests'
