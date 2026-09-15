#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if ! grep -q "capabilities" "$REPO_ROOT/bin/go-beast.mjs"; then
  printf '%s\n' 'CAPABILITY_REGISTRY_RED: capabilities CLI is not wired'
  exit 1
fi

CLI=(node "$REPO_ROOT/bin/go-beast.mjs" capabilities)

"${CLI[@]}" validate --format json > "$TMP_DIR/validation.json"
"${CLI[@]}" list --kind skill --format json > "$TMP_DIR/skills.json"
"${CLI[@]}" show go-hawk --format json > "$TMP_DIR/show.json"
"${CLI[@]}" export --output "$TMP_DIR/registry.json" --format json > "$TMP_DIR/export.json"
"${CLI[@]}" export --output "$TMP_DIR/registry-second.json" --format json > "$TMP_DIR/export-second.json"

node - "$TMP_DIR" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const root = process.argv[2]
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
const validation = read('validation.json')
const registry = read('registry.json')
const skills = read('skills.json')
const shown = read('show.json')
const exported = read('export.json')

if (!validation.valid || validation.schema_version !== 2) throw new Error(`registry did not validate: ${JSON.stringify(validation)}`)
if (!Array.isArray(registry.capabilities) || registry.capabilities.length < 50) throw new Error('registry inventory is unexpectedly small')
if (exported.count !== registry.capabilities.length) throw new Error('export count does not match registry')

const kinds = new Set(registry.capabilities.map(item => item.kind))
for (const kind of ['skill', 'hook', 'workflow', 'profile', 'adapter']) {
  if (!kinds.has(kind)) throw new Error(`registry is missing capability kind: ${kind}`)
}

const ids = registry.capabilities.map(item => item.id)
if (new Set(ids).size !== ids.length) throw new Error('registry contains duplicate IDs')
if (ids.join('\n') !== [...ids].sort().join('\n')) throw new Error('registry IDs are not deterministic')
for (const capability of registry.capabilities) {
  if (Object.hasOwn(capability, 'content') || Object.hasOwn(capability, 'body')) throw new Error(`${capability.id} duplicated operational content`)
  if (!/^\d+\.\d+\.\d+$/.test(capability.version)) throw new Error(`${capability.id} has an invalid version`)
  if (!capability.source || capability.source.startsWith('/') || capability.source.includes('..')) throw new Error(`${capability.id} has an unsafe source path`)
  if (!capability.supports || Object.values(capability.supports).some(value => typeof value !== 'boolean')) throw new Error(`${capability.id} has invalid support data`)
  for (const dependency of capability.depends_on) {
    if (!ids.includes(dependency)) throw new Error(`${capability.id} has unknown dependency ${dependency}`)
  }
}

if (!skills.capabilities.every(item => item.kind === 'skill')) throw new Error('skill list returned another capability kind')
if (!skills.capabilities.some(item => item.id === 'go-hawk')) throw new Error('skill list omitted go-hawk')
if (shown.capability?.id !== 'go-hawk' || shown.capability.source !== 'skills/go-hawk/SKILL.md') throw new Error('show did not return go-hawk metadata')
if (fs.readFileSync(path.join(root, 'registry.json'), 'utf8') !== fs.readFileSync(path.join(root, 'registry-second.json'), 'utf8')) {
  throw new Error('registry export is not byte deterministic')
}

fs.writeFileSync(path.join(root, 'invalid.json'), JSON.stringify({
  ...registry,
  capabilities: registry.capabilities.map((item, index) => index === 0
    ? { ...item, depends_on: ['missing-capability'], source: '../outside', supports: { codex: 'yes' } }
    : index === 1 ? { ...item, id: registry.capabilities[0].id } : item),
}, null, 2))
NODE

if "${CLI[@]}" validate --input "$TMP_DIR/invalid.json" --format json > "$TMP_DIR/invalid.out" 2>&1; then
  printf '%s\n' 'invalid capability registry unexpectedly passed validation' >&2
  exit 1
fi

grep -qi 'duplicate capability ID\|duplicate id' "$TMP_DIR/invalid.out"
grep -qi 'unknown dependency' "$TMP_DIR/invalid.out"
grep -qi 'unsafe source' "$TMP_DIR/invalid.out"
grep -qi 'supports' "$TMP_DIR/invalid.out"

if ! "${CLI[@]}" validate --format text | grep -q 'Capability registry valid'; then
  printf '%s\n' 'text validation output is missing its success message' >&2
  exit 1
fi

printf '%s\n' 'Capability registry tests passed'
