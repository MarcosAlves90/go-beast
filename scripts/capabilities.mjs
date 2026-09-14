#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseYaml } from './transversal-rules.mjs'
import { SKILL_AGENTS } from './integration-profile.mjs'
import {
  AGENTS as HOOK_AGENTS,
  loadHookManifest,
} from './hook-wire.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCHEMA_VERSION = 2
const CAPABILITY_KINDS = new Set(['skill', 'hook', 'workflow', 'profile', 'adapter'])
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/
const ALL_SURFACES = [...new Set([...Object.keys(SKILL_AGENTS), ...Object.keys(HOOK_AGENTS)])].sort()
const ADAPTERS = ['claude-code', 'codex', 'copilot']

function fail(message) {
  throw new Error(message)
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read JSON ${filePath}: ${error.message}`)
  }
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function dependencyReferences(expressions = []) {
  return sortedUnique(expressions.flatMap(expression =>
    [...String(expression).matchAll(/\bgo-[a-z0-9-]+\b/g)].map(match => match[0]),
  ))
}

function supportMap(supported) {
  const allowed = new Set(supported)
  return Object.fromEntries(ALL_SURFACES.map(surface => [surface, allowed.has(surface)]))
}

function capability({ id, kind, version, phase, depends_on = [], conflicts_with = [], inputs, outputs, permissions, risk, supports, source, deprecated = false }) {
  return {
    id,
    kind,
    version,
    phase,
    depends_on: sortedUnique(depends_on),
    conflicts_with: sortedUnique(conflicts_with),
    inputs: sortedUnique(inputs),
    outputs: sortedUnique(outputs),
    permissions: sortedUnique(permissions),
    risk,
    supports,
    source,
    deprecated,
  }
}

function readSkillFrontmatter(filePath, expectedName) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) fail(`skill ${expectedName} is missing YAML frontmatter`)
  const fields = {}
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-z_]+):\s+(.+)$/)
    if (field) fields[field[1]] = field[2].trim()
  }
  if (fields.name !== expectedName) fail(`skill ${expectedName} frontmatter name is ${fields.name ?? 'missing'}`)
  if (!VERSION_PATTERN.test(fields.version ?? '')) fail(`skill ${expectedName} has invalid version`)
  return fields
}

function packageVersion(repoRoot) {
  const packageJson = readJson(path.join(repoRoot, 'package.json'))
  if (!VERSION_PATTERN.test(packageJson.version ?? '')) fail('package.json has an invalid version')
  return packageJson.version
}

function buildSkillCapabilities(repoRoot, manifest) {
  return Object.entries(manifest.skills ?? {}).map(([id, entry]) => {
    const source = `skills/${id}/SKILL.md`
    const frontmatter = readSkillFrontmatter(path.join(repoRoot, source), id)
    return capability({
      id,
      kind: 'skill',
      version: frontmatter.version,
      phase: entry.phase,
      depends_on: dependencyReferences(entry.depends_on),
      conflicts_with: dependencyReferences(entry.conflicts_with),
      inputs: entry.input_artifacts,
      outputs: entry.output_artifacts,
      permissions: ['read-project'],
      risk: id === 'go-bear' ? 'medium' : 'low',
      supports: supportMap(ALL_SURFACES),
      source,
    })
  })
}

function buildHookCapabilities(repoRoot, packageVersionValue) {
  return loadHookManifest(repoRoot).map(spec => capability({
    id: spec.name,
    kind: 'hook',
    version: packageVersionValue,
    phase: spec.event.toLowerCase(),
    depends_on: spec.dependsOn,
    inputs: ['harness-event'],
    outputs: ['hook-observation'],
    permissions: ['read-project', 'write-agent-state'],
    risk: 'high',
    supports: supportMap(spec.targets),
    source: `hooks/${spec.name}`,
  }))
}

function workflowId(fileName) {
  return fileName.replace(/\.(?:json|js)$/, '')
}

function buildWorkflowCapabilities(repoRoot, packageVersionValue) {
  const workflowRoot = path.join(repoRoot, 'workflows')
  return fs.readdirSync(workflowRoot)
    .filter(name => /\.(?:json|js)$/.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map(name => capability({
      id: workflowId(name),
      kind: 'workflow',
      version: packageVersionValue,
      phase: 'workflow',
      inputs: ['task-scope'],
      outputs: ['workflow-output'],
      permissions: ['write-project-state'],
      risk: 'medium',
      supports: supportMap(ALL_SURFACES),
      source: `workflows/${name}`,
    }))
}

function buildProfileCapabilities(packageVersionValue) {
  return Object.keys(SKILL_AGENTS).sort().map(agent => capability({
    id: `profile-${agent}`,
    kind: 'profile',
    version: packageVersionValue,
    phase: 'integration',
    inputs: ['profile-intent'],
    outputs: ['effective-integration-profile'],
    permissions: ['write-agent-config'],
    risk: 'medium',
    supports: supportMap([agent]),
    source: 'scripts/integration-profile.mjs',
  }))
}

function buildAdapterCapabilities(packageVersionValue) {
  return ADAPTERS.map(agent => capability({
    id: `adapter-${agent}`,
    kind: 'adapter',
    version: packageVersionValue,
    phase: 'adapter',
    inputs: ['harness-event'],
    outputs: ['normalized-agent-event'],
    permissions: ['write-agent-config', 'write-hook-config'],
    risk: 'high',
    supports: supportMap([agent]),
    source: 'scripts/hook-wire.mjs',
  }))
}

function buildRegistry(repoRoot = REPO) {
  const manifest = parseYaml(fs.readFileSync(path.join(repoRoot, 'go-beast.manifest.yaml'), 'utf8'))
  const version = packageVersion(repoRoot)
  const capabilities = [
    ...buildSkillCapabilities(repoRoot, manifest),
    ...buildHookCapabilities(repoRoot, version),
    ...buildWorkflowCapabilities(repoRoot, version),
    ...buildProfileCapabilities(version),
    ...buildAdapterCapabilities(version),
  ].sort((left, right) => left.id.localeCompare(right.id))

  return {
    schema_version: SCHEMA_VERSION,
    generated_from: [
      'go-beast.manifest.yaml',
      'hooks/manifest.json',
      'scripts/hook-wire.mjs',
      'scripts/integration-profile.mjs',
      'skills/',
      'workflows/',
    ],
    capabilities,
  }
}

function isSafeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !path.posix.isAbsolute(value)
    && !value.split('/').includes('..')
}

function expectedSourcePrefix(kind) {
  return {
    skill: 'skills/',
    hook: 'hooks/',
    workflow: 'workflows/',
    profile: 'scripts/',
    adapter: 'scripts/',
  }[kind]
}

function validateRegistry(registry, { repoRoot = null, requireSources = false } = {}) {
  const errors = []
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return ['registry must be an object']
  if (registry.schema_version !== SCHEMA_VERSION) errors.push(`unsupported schema_version: ${registry.schema_version}`)
  if (!Array.isArray(registry.generated_from) || registry.generated_from.some(item => typeof item !== 'string' || !item)) {
    errors.push('generated_from must be a non-empty array of strings')
  }
  if (!Array.isArray(registry.capabilities) || registry.capabilities.length === 0) return [...errors, 'capabilities must be a non-empty array']

  const ids = new Set()
  const allowedKeys = new Set(['id', 'kind', 'version', 'phase', 'depends_on', 'conflicts_with', 'inputs', 'outputs', 'permissions', 'risk', 'supports', 'source', 'deprecated'])
  for (const [index, item] of registry.capabilities.entries()) {
    const label = `capabilities[${index}]`
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${label} must be an object`)
      continue
    }
    for (const key of Object.keys(item)) if (!allowedKeys.has(key)) errors.push(`${label} has unknown field: ${key}`)
    for (const key of allowedKeys) if (!Object.hasOwn(item, key)) errors.push(`${label} is missing ${key}`)
    if (typeof item.id !== 'string' || !/^[a-z][a-z0-9._:-]*$/.test(item.id ?? '')) errors.push(`${label}.id is invalid`)
    if (ids.has(item.id)) errors.push(`duplicate capability ID: ${item.id}`)
    ids.add(item.id)
    if (!CAPABILITY_KINDS.has(item.kind)) errors.push(`${label}.kind is unsupported: ${item.kind}`)
    if (!VERSION_PATTERN.test(item.version ?? '')) errors.push(`${label}.version is invalid`)
    if (typeof item.phase !== 'string' || !item.phase) errors.push(`${label}.phase is required`)
    for (const field of ['depends_on', 'conflicts_with', 'inputs', 'outputs', 'permissions']) {
      if (!Array.isArray(item[field]) || item[field].some(value => typeof value !== 'string' || !value)) errors.push(`${label}.${field} must be an array of strings`)
      else if (new Set(item[field]).size !== item[field].length) errors.push(`${label}.${field} contains duplicates`)
    }
    if (!['low', 'medium', 'high'].includes(item.risk)) errors.push(`${label}.risk is invalid`)
    if (!item.supports || typeof item.supports !== 'object' || Array.isArray(item.supports)) errors.push(`${label}.supports must be an object`)
    else if (Object.entries(item.supports).some(([surface, enabled]) => !ALL_SURFACES.includes(surface) || typeof enabled !== 'boolean')) errors.push(`${label}.supports contains an invalid surface or value`)
    if (!isSafeRelativePath(item.source)) errors.push(`${label}.unsafe source path`)
    else if (item.kind && !item.source.startsWith(expectedSourcePrefix(item.kind))) errors.push(`${label}.source does not match ${item.kind}`)
    if (typeof item.deprecated !== 'boolean') errors.push(`${label}.deprecated must be boolean`)
    if (requireSources && repoRoot && isSafeRelativePath(item.source) && !fs.existsSync(path.join(repoRoot, item.source))) errors.push(`${label}.source does not exist: ${item.source}`)
  }

  const orderedIds = registry.capabilities.map(item => item?.id).filter(Boolean)
  if (orderedIds.join('\n') !== [...orderedIds].sort((left, right) => left.localeCompare(right)).join('\n')) errors.push('capability IDs must be sorted')
  for (const item of registry.capabilities) {
    if (!item || typeof item !== 'object') continue
    for (const dependency of item.depends_on ?? []) if (!ids.has(dependency)) errors.push(`${item.id} has unknown dependency: ${dependency}`)
    for (const conflict of item.conflicts_with ?? []) if (!ids.has(conflict)) errors.push(`${item.id} has unknown conflict: ${conflict}`)
  }
  return [...new Set(errors)]
}

function counts(registry) {
  return Object.fromEntries([...CAPABILITY_KINDS].sort().map(kind => [kind, registry.capabilities.filter(item => item.kind === kind).length]))
}

function parseArgs(argv) {
  const args = [...argv]
  const command = args.shift() ?? 'help'
  const options = { command, repo: REPO, format: 'text', kind: null, id: null, input: null, output: null }
  while (args.length) {
    const arg = args.shift()
    if (arg === '--repo') options.repo = path.resolve(args.shift() ?? fail('--repo requires a path'))
    else if (arg === '--format') options.format = args.shift() ?? fail('--format requires a value')
    else if (arg === '--kind') options.kind = args.shift() ?? fail('--kind requires a value')
    else if (arg === '--input') options.input = path.resolve(args.shift() ?? fail('--input requires a path'))
    else if (arg === '--output') options.output = path.resolve(args.shift() ?? fail('--output requires a path'))
    else if (arg === '--id') options.id = args.shift() ?? fail('--id requires a value')
    else if (arg === '--help' || arg === '-h') options.command = 'help'
    else if (!options.id && options.command === 'show' && !arg.startsWith('-')) options.id = arg
    else fail(`unknown option: ${arg}`)
  }
  if (!['help', 'validate', 'list', 'show', 'export'].includes(options.command)) fail(`unknown capabilities command: ${options.command}`)
  if (!['text', 'json'].includes(options.format)) fail(`unsupported output format: ${options.format}`)
  if (options.kind && !CAPABILITY_KINDS.has(options.kind)) fail(`unsupported capability kind: ${options.kind}`)
  return options
}

function usage() {
  return [
    'Usage: go-beast capabilities <validate|list|show|export> [options]',
    '',
    '  validate [--input PATH]        Validate the derived or supplied registry',
    '  list [--kind KIND]             List structural capability metadata',
    '  show <id>                      Show one capability',
    '  export --output PATH           Write deterministic registry JSON',
    '  --repo PATH                    Use another go-beast repository',
    '  --format text|json             Select output format',
  ].join('\n')
}

function loadForInspection(options) {
  if (options.input) return { registry: readJson(options.input), external: true }
  return { registry: buildRegistry(options.repo), external: false }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temporary, filePath)
  } finally {
    try { fs.rmSync(temporary, { force: true }) } catch {}
  }
}

function emit(value, format) {
  if (format === 'json') process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  else if (typeof value === 'string') process.stdout.write(`${value}\n`)
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function run(options) {
  if (options.command === 'help') {
    emit(usage(), options.format)
    return
  }
  const { registry, external } = loadForInspection(options)
  const errors = validateRegistry(registry, { repoRoot: external ? null : options.repo, requireSources: !external })
  if (errors.length) {
    const result = { schema_version: SCHEMA_VERSION, command: options.command, valid: false, errors }
    emit(options.format === 'json' ? result : `Capability registry invalid:\n${errors.map(error => `- ${error}`).join('\n')}`, options.format)
    process.exitCode = 1
    return
  }
  if (options.command === 'validate') {
    emit(options.format === 'json'
      ? { schema_version: SCHEMA_VERSION, command: 'validate', valid: true, count: registry.capabilities.length, counts: counts(registry) }
      : `Capability registry valid: ${registry.capabilities.length} capabilities`, options.format)
    return
  }
  if (options.command === 'list') {
    const capabilities = options.kind ? registry.capabilities.filter(item => item.kind === options.kind) : registry.capabilities
    emit({ schema_version: SCHEMA_VERSION, command: 'list', kind: options.kind, count: capabilities.length, capabilities }, options.format)
    return
  }
  if (options.command === 'show') {
    if (!options.id) fail('show requires a capability ID')
    const result = registry.capabilities.find(item => item.id === options.id)
    if (!result) fail(`capability not found: ${options.id}`)
    emit({ schema_version: SCHEMA_VERSION, command: 'show', capability: result }, options.format)
    return
  }
  if (!options.output) fail('export requires --output')
  writeJsonAtomic(options.output, registry)
  emit({ schema_version: SCHEMA_VERSION, command: 'export', output: options.output, count: registry.capabilities.length }, options.format)
}

function main(argv = process.argv.slice(2)) {
  try {
    run(parseArgs(argv))
  } catch (error) {
    console.error(`go-beast capabilities: ${error.message}`)
    process.exitCode = 1
  }
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) main()

export {
  buildRegistry,
  main,
  validateRegistry,
}
