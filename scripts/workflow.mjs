#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createHash, randomUUID } from 'node:crypto'
import { parseYaml } from './transversal-rules.mjs'
import { resolveWorkflowRoots } from './workflow-roots.mjs'

const STATE_DIR = path.join('.go-beast', 'workflows')
const LOCK_DIR = path.join(STATE_DIR, 'locks')
const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000
const MODES = new Set(['off', 'warn', 'strict'])
const ARTIFACT_VALIDATOR_TYPES = new Set(['non-empty', 'markdown-heading', 'json-schema', 'yaml-valid', 'contains-pattern'])
const MAX_VALIDATOR_PATTERN_LENGTH = 256
const MAX_VALIDATOR_INPUT_LENGTH = 2 * 1024 * 1024
const MAX_JSON_SCHEMA_DEPTH = 64

function patternValidationError(pattern, flags = '', label = 'pattern') {
  if (typeof pattern !== 'string' || pattern.length === 0) return `${label} must be a non-empty string`
  if (pattern.length > MAX_VALIDATOR_PATTERN_LENGTH) return `${label} must be at most ${MAX_VALIDATOR_PATTERN_LENGTH} characters`
  if (typeof flags !== 'string' || !/^[ims]*$/.test(flags) || new Set(flags).size !== flags.length) return `${label} flags must contain only unique i, m, or s flags`
  if (/\\(?:[1-9]|k<)/.test(pattern)) return `${label} cannot use backreferences`
  if (/\(\?[=!<]/.test(pattern)) return `${label} cannot use lookaround assertions`
  if (/(?:\([^()\n]*(?:[+*]|\{\d+(?:,\d*)?\})[^()\n]*\)|\[[^\]\n]+\])(?:[+*]|\{\d+(?:,\d*)?\})/.test(pattern)) return `${label} cannot use nested quantifiers`
  try { new RegExp(pattern, flags) } catch (error) { return `${label} is not a valid regular expression: ${error.message}` }
  return null
}

function compileSafePattern(pattern, flags = '', label = 'pattern') {
  const error = patternValidationError(pattern, flags, label)
  assert(!error, error)
  return new RegExp(pattern, flags)
}

function compileSafePatternForRuntime(pattern, flags = '', label = 'pattern') {
  const error = patternValidationError(pattern, flags, label)
  if (error) throw new Error(error)
  return new RegExp(pattern, flags)
}

function validateArtifactValidator(validator, label) {
  assert(validator && typeof validator === 'object' && !Array.isArray(validator), `${label} must be an object`)
  assert(typeof validator.type === 'string' && ARTIFACT_VALIDATOR_TYPES.has(validator.type), `${label}.type is unsupported`)
  const allowedKeys = {
    'non-empty': ['type'],
    'markdown-heading': ['type', 'text', 'level'],
    'json-schema': ['type', 'schema'],
    'yaml-valid': ['type'],
    'contains-pattern': ['type', 'pattern', 'flags'],
  }[validator.type]
  for (const key of Object.keys(validator)) assert(allowedKeys.includes(key), `${label} has unknown key: ${key}`)
  if (validator.type === 'markdown-heading') {
    assert(typeof validator.text === 'string' && validator.text.trim().length > 0, `${label}.text must be a non-empty string`)
    if (validator.level !== undefined) assert(Number.isInteger(validator.level) && validator.level >= 1 && validator.level <= 6, `${label}.level must be an integer from 1 to 6`)
  }
  if (validator.type === 'json-schema') {
    assert(typeof validator.schema === 'string' && safeRelativePath(validator.schema), `${label}.schema must be a safe repository-relative path`)
  }
  if (validator.type === 'contains-pattern') compileSafePattern(validator.pattern, validator.flags, `${label}.pattern`)
}

function fail(message, code = 1) {
  console.error(`Workflow validation failed: ${message}`)
  process.exit(code)
}

function failCode(code, message, exitCode = 1) {
  console.error(`${code}: ${message}`)
  process.exit(exitCode)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const command = args.shift() ?? 'help'
  const options = { command, file: null, mode: null, phase: null, root: null, format: 'text', name: null, artifact: null, context: null, to: null, note: null, all: false }
  while (args.length) {
    const arg = args.shift()
    if (arg === '--all') options.all = true
    else if (['--file', '--mode', '--phase', '--root', '--format', '--name', '--artifact', '--context', '--to', '--note'].includes(arg)) {
      const value = args.shift()
      if (!value) fail(`${arg} requires a value`, 2)
      options[arg.slice(2)] = value
    } else if (arg === '--help' || arg === '-h') options.command = 'help'
    else fail(`unknown option: ${arg}`, 2)
  }
  return options
}

function assert(condition, message, code = 1) {
  if (!condition) fail(message, code)
}

function assertKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  for (const key of Object.keys(value)) assert(expected.includes(key), `${label} has unknown key ${key}`)
  for (const key of expected) assert(Object.hasOwn(value, key), `${label} is missing ${key}`)
}

function loadDocument(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  if (filePath.endsWith('.json')) return JSON.parse(text)
  return parseYaml(text)
}

function manifestFiles(root) {
  const directory = path.join(root, 'workflows')
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory).filter(name => /\.(json|ya?ml)$/.test(name)).sort().map(name => path.join(directory, name))
}

function loadManifest(projectRoot, file) {
  const candidates = file ? [path.resolve(projectRoot, file)] : manifestFiles(projectRoot)
  assert(candidates.length === 1, file ? `manifest not found under project root ${projectRoot}: ${candidates[0]}` : `use --file when workflows/ contains multiple manifests under project root ${projectRoot}`)
  const filePath = candidates[0]
  assert(fs.existsSync(filePath), `manifest not found under project root ${projectRoot}: ${filePath}`)
  let manifest
  try { manifest = loadDocument(filePath) } catch (error) { fail(`${path.relative(projectRoot, filePath)} is not valid JSON/YAML: ${error.message}`) }
  return { manifest, filePath }
}

function validateWorkflowSchema(packageRoot) {
  const schemaPath = path.join(packageRoot, 'go-beast.workflow.schema.json')
  assert(fs.existsSync(schemaPath), `workflow schema is missing from package root ${packageRoot}: ${schemaPath}`)
  let schema
  try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) } catch (error) { fail(`workflow schema is not valid JSON at package root ${packageRoot}: ${error.message}`) }
  assert(schema.type === 'object' && schema.title && schema.$defs?.artifact && schema.$defs?.['artifact-validator'], 'workflow schema has an invalid structural contract')
  for (const key of ['schema_version', 'id', 'version', 'phases']) assert(schema.required?.includes(key), `workflow schema is missing required field: ${key}`)
}

function validateArtifactDescriptor(artifact, label) {
  assert(artifact && typeof artifact === 'object' && !Array.isArray(artifact), `${label} must be an object`)
  for (const key of Object.keys(artifact)) assert(['path', 'type', 'non_empty', 'sections', 'validators'].includes(key), `${label} has unknown key ${key}`)
  assert(typeof artifact.path === 'string' && artifact.path.length > 0, `${label}.path must be non-empty`)
  assert(!path.isAbsolute(artifact.path) && !artifact.path.split('/').includes('..'), `${label}.path must stay within the repository`)
  assert(['file', 'directory'].includes(artifact.type), `${label}.type must be file or directory`)
  if (artifact.non_empty === undefined) artifact.non_empty = false
  assert(typeof artifact.non_empty === 'boolean', `${label}.non_empty must be boolean`)
  if (artifact.sections === undefined) artifact.sections = []
  assert(Array.isArray(artifact.sections) && artifact.sections.every(section => typeof section === 'string' && section.length > 0), `${label}.sections must be an array of non-empty strings`)
  if (artifact.validators !== undefined) {
    assert(Array.isArray(artifact.validators), `${label}.validators must be an array`)
    artifact.validators.forEach((validator, index) => validateArtifactValidator(validator, `${label}.validators[${index}]`))
  }
}

function validateManifest(manifest, root) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest must be an object')
  const schemaVersion = manifest.schema_version
  const manifestKeys = ['schema_version', 'id', 'version', 'mode', 'phases']
  if (schemaVersion === 2) manifestKeys.push('route')
  for (const key of Object.keys(manifest)) assert(manifestKeys.includes(key), `manifest has unknown key ${key}`)
  for (const key of ['schema_version', 'id', 'version', 'phases']) assert(Object.hasOwn(manifest, key), `manifest is missing ${key}`)
  assert([1, 2].includes(schemaVersion), `unsupported schema_version ${manifest.schema_version}`)
  assert(typeof manifest.id === 'string' && /^[a-z0-9-]+$/.test(manifest.id), 'id must match ^[a-z0-9-]+$')
  assert(Number.isInteger(manifest.version) && manifest.version >= 1, 'version must be a positive integer')
  if (manifest.mode !== undefined) assert(MODES.has(manifest.mode), `mode must be one of ${[...MODES].join(', ')}`)
  if (manifest.route !== undefined) {
    assert(schemaVersion === 2 && manifest.route && typeof manifest.route === 'object' && !Array.isArray(manifest.route), 'route must be an object in schema version 2')
    for (const key of Object.keys(manifest.route)) assert(['strategy'].includes(key), `route has unknown key ${key}`)
    if (manifest.route.strategy !== undefined) assert(manifest.route.strategy === 'compiled', 'route.strategy must be compiled')
  }
  assert(Array.isArray(manifest.phases) && manifest.phases.length > 0, 'phases must be a non-empty array')

  const phases = new Map()
  for (const [index, phase] of manifest.phases.entries()) {
    const label = `phases[${index}]`
    const phaseKeys = ['id', 'skill', 'depends_on', 'preconditions', 'requires', 'produces', 'transitions']
    const v2PhaseKeys = [...phaseKeys, 'parallel_group', 'retry', 'handoff', 'checkpoint']
    if (schemaVersion === 1) assertKeys(phase, phaseKeys, label)
    else {
      for (const key of Object.keys(phase)) assert(v2PhaseKeys.includes(key), `${label} has unknown key ${key}`)
      for (const key of phaseKeys) assert(Object.hasOwn(phase, key), `${label} is missing ${key}`)
      if (phase.parallel_group !== undefined) assert(typeof phase.parallel_group === 'string' && /^[a-z0-9-]+$/.test(phase.parallel_group), `${label}.parallel_group is invalid`)
      if (phase.checkpoint !== undefined) assert(typeof phase.checkpoint === 'boolean', `${label}.checkpoint must be boolean`)
      if (phase.retry !== undefined) {
        assert(phase.retry && typeof phase.retry === 'object' && !Array.isArray(phase.retry), `${label}.retry must be an object`)
        for (const key of Object.keys(phase.retry)) assert(['max_attempts', 'backoff_ms'].includes(key), `${label}.retry has unknown key ${key}`)
        assert(Number.isInteger(phase.retry.max_attempts) && phase.retry.max_attempts >= 1, `${label}.retry.max_attempts must be a positive integer`)
        if (phase.retry.backoff_ms !== undefined) assert(Number.isInteger(phase.retry.backoff_ms) && phase.retry.backoff_ms >= 0, `${label}.retry.backoff_ms must be a non-negative integer`)
      }
      if (phase.handoff !== undefined) {
        assert(phase.handoff && typeof phase.handoff === 'object' && !Array.isArray(phase.handoff), `${label}.handoff must be an object`)
        for (const key of Object.keys(phase.handoff)) assert(['targets'].includes(key), `${label}.handoff has unknown key ${key}`)
        assert(Array.isArray(phase.handoff.targets) && phase.handoff.targets.every(target => typeof target === 'string' && target.length > 0), `${label}.handoff.targets must be an array of non-empty strings`)
      }
    }
    assert(typeof phase.id === 'string' && /^[a-z0-9-]+$/.test(phase.id), `${label}.id is invalid`)
    assert(!phases.has(phase.id), `duplicate phase: ${phase.id}`)
    assert(typeof phase.skill === 'string' && phase.skill.length > 0, `${label}.skill must be non-empty`)
    for (const field of ['depends_on', 'transitions']) assert(Array.isArray(phase[field]) && phase[field].every(value => typeof value === 'string'), `${label}.${field} must be an array of strings`)
    assert(Array.isArray(phase.preconditions), `${label}.preconditions must be an array`)
    for (const [preIndex, precondition] of phase.preconditions.entries()) {
      assert(precondition && typeof precondition === 'object' && !Array.isArray(precondition), `${label}.preconditions[${preIndex}] must be an object`)
      for (const key of Object.keys(precondition)) assert(['type', 'path', 'name'].includes(key), `${label}.preconditions[${preIndex}] has unknown key ${key}`)
      assert(['path_exists', 'env'].includes(precondition.type), `${label}.preconditions[${preIndex}].type is unsupported`)
      if (precondition.type === 'path_exists') assert(typeof precondition.path === 'string' && !path.isAbsolute(precondition.path) && !precondition.path.split('/').includes('..'), `${label}.preconditions[${preIndex}].path is invalid`)
      if (precondition.type === 'env') assert(typeof precondition.name === 'string' && precondition.name.length > 0, `${label}.preconditions[${preIndex}].name is invalid`)
    }
    for (const field of ['requires', 'produces']) {
      assert(Array.isArray(phase[field]), `${label}.${field} must be an array`)
      phase[field].forEach((artifact, artifactIndex) => validateArtifactDescriptor(artifact, `${label}.${field}[${artifactIndex}]`))
    }
    phases.set(phase.id, phase)
  }

  for (const phase of phases.values()) {
    for (const dependency of phase.depends_on) assert(phases.has(dependency), `phase ${phase.id} references unknown dependency: ${dependency}`)
    for (const transition of phase.transitions) assert(phases.has(transition), `phase ${phase.id} references unknown transition: ${transition}`)
    for (const dependency of phase.depends_on) assert(phases.get(dependency).transitions.includes(phase.id), `phase ${dependency} does not allow transition to ${phase.id}`)
  }

  const visiting = new Set()
  const visited = new Set()
  function visit(id, trail = []) {
    if (visiting.has(id)) fail(`dependency cycle detected: ${[...trail, id].join(' -> ')}`)
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of phases.get(id).depends_on) visit(dependency, [...trail, id])
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of phases.keys()) visit(id)
  return phases
}

function resolveMode(manifest, requested) {
  const mode = requested ?? process.env.GO_BEAST_WORKFLOW_MODE ?? manifest.mode ?? 'warn'
  if (!MODES.has(mode)) fail(`invalid workflow mode: ${mode}`, 2)
  return mode
}

function compileRoute(manifest, phases) {
  const order = []
  const visiting = new Set()
  const visited = new Set()
  const visit = id => {
    if (visiting.has(id)) fail(`dependency cycle detected while compiling route: ${id}`)
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of phases.get(id).depends_on) visit(dependency)
    visiting.delete(id)
    visited.add(id)
    order.push(id)
  }
  for (const phase of manifest.phases) visit(phase.id)

  const parallel = new Map()
  for (const phase of manifest.phases) {
    if (!phase.parallel_group) continue
    if (!parallel.has(phase.parallel_group)) parallel.set(phase.parallel_group, [])
    parallel.get(phase.parallel_group).push(phase.id)
  }
  return {
    schema_version: 1,
    workflow_id: manifest.id,
    manifest_version: manifest.version,
    order,
    roots: manifest.phases.filter(phase => phase.depends_on.length === 0).map(phase => phase.id),
    edges: manifest.phases.flatMap(phase => phase.transitions.map(to => ({ from: phase.id, to }))),
    parallel_slices: [...parallel.entries()].map(([id, phaseIds]) => ({ id, phases: phaseIds })),
    phases: manifest.phases.map(phase => ({
      id: phase.id,
      skill: phase.skill,
      depends_on: [...phase.depends_on],
      transitions: [...phase.transitions],
      parallel_group: phase.parallel_group ?? null,
      retry: phase.retry ?? { max_attempts: null },
      handoff: phase.handoff ?? null,
    })),
  }
}

function phaseRetryLimit(phase) {
  return phase.retry?.max_attempts ?? Number.POSITIVE_INFINITY
}

function phaseRecord(phase) {
  return {
    status: 'pending',
    skill: phase.skill,
    attempts: 0,
    checkpoints: [],
    handoff: null,
  }
}

function normalizeState(state, manifest, phases) {
  const migrated = state.schema_version === 1
  const normalized = {
    ...state,
    schema_version: 2,
    route: compileRoute(manifest, phases),
    history: Array.isArray(state.history) ? [...state.history] : [],
    phases: Object.fromEntries(manifest.phases.map(phase => {
      const current = state.phases[phase.id] ?? phaseRecord(phase)
      return [phase.id, {
        ...phaseRecord(phase),
        ...current,
        skill: phase.skill,
        attempts: Number.isInteger(current.attempts) && current.attempts >= 0 ? current.attempts : 0,
        checkpoints: Array.isArray(current.checkpoints) ? current.checkpoints : [],
        handoff: current.handoff ?? null,
      }]
    })),
  }
  if (migrated) {
    normalized.history.push({ event: 'migrate', from_schema: 1, to_schema: 2, at: new Date().toISOString() })
  }
  Object.defineProperty(normalized, '__migrated', { value: migrated, enumerable: false })
  return normalized
}

function statePath(root, manifest) {
  return path.join(root, STATE_DIR, `${manifest.id}.json`)
}

function lockPath(root, manifest) {
  return path.join(root, LOCK_DIR, `${manifest.id}.lock`)
}

function lockTimeoutMs() {
  const value = Number(process.env.GO_BEAST_WORKFLOW_LOCK_TIMEOUT_MS ?? DEFAULT_LOCK_TIMEOUT_MS)
  if (!Number.isFinite(value) || value < 0) fail('GO_BEAST_WORKFLOW_LOCK_TIMEOUT_MS must be a non-negative number', 2)
  return value
}

function lockMetadata() {
  return {
    lock_id: randomUUID(),
    pid: process.pid,
    hostname: process.env.HOSTNAME || os.hostname(),
    agent: process.env.GO_BEAST_AGENT || process.env.AGENT || 'unknown',
    session_id: process.env.GO_BEAST_SESSION_ID || process.env.CODEX_SESSION_ID || 'unknown',
    created_at: new Date().toISOString(),
  }
}

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

function readLock(lockFile) {
  try { return JSON.parse(fs.readFileSync(lockFile, 'utf8')) } catch { return null }
}

function lockIsStale(lockFile, metadata) {
  const createdAt = Date.parse(metadata?.created_at ?? '')
  const age = Number.isFinite(createdAt) ? Date.now() - createdAt : Date.now() - fs.statSync(lockFile).mtimeMs
  const sameHost = metadata?.hostname === lockMetadata().hostname
  if (sameHost && Number.isInteger(metadata?.pid)) return !processIsAlive(metadata.pid)
  return age >= lockTimeoutMs()
}

function acquireLock(root, manifest) {
  const filePath = lockPath(root, manifest)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const metadata = lockMetadata()
  try {
    const descriptor = fs.openSync(filePath, 'wx')
    fs.writeFileSync(descriptor, `${JSON.stringify(metadata, null, 2)}\n`)
    fs.closeSync(descriptor)
    if (process.env.GO_BEAST_WORKFLOW_TEST_REPLACE_LOCK === '1') {
      fs.unlinkSync(filePath)
      fs.writeFileSync(filePath, `${JSON.stringify({ ...lockMetadata(), agent: 'replacement-process' }, null, 2)}\n`, { flag: 'wx' })
    }
    const holdMs = Number(process.env.GO_BEAST_WORKFLOW_TEST_HOLD_LOCK_MS ?? 0)
    if (holdMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, holdMs)
    return { filePath, lockId: metadata.lock_id }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const current = readLock(filePath)
    const owner = current ? `pid ${current.pid}, host ${current.hostname}, session ${current.session_id}` : 'unknown owner'
    if (current && lockIsStale(filePath, current)) failCode('WORKFLOW_LOCK_STALE', `lock is stale and must be removed explicitly: ${filePath} (${owner})`)
    failCode('WORKFLOW_LOCK_CONFLICT', `workflow is locked by ${owner}`)
  }
}

function releaseLock(filePath, lockId = null) {
  if (lockId) {
    const current = readLock(filePath)
    if (!current || current.lock_id !== lockId) failCode('WORKFLOW_LOCK_OWNERSHIP', `lock ownership changed before release: ${filePath}`)
  }
  try { fs.unlinkSync(filePath) } catch (error) { if (error.code !== 'ENOENT') throw error }
}

function withLock(root, manifest, operation) {
  const lock = acquireLock(root, manifest)
  try { return operation() } finally { releaseLock(lock.filePath, lock.lockId) }
}

function unlockStale(root, manifest) {
  const filePath = lockPath(root, manifest)
  assert(fs.existsSync(filePath), `no lock exists for ${manifest.id}`)
  const metadata = readLock(filePath)
  if (!lockIsStale(filePath, metadata)) failCode('WORKFLOW_LOCK_NOT_STALE', `lock is still live or within timeout: ${filePath}`)
  const lockId = metadata?.lock_id ?? null
  const current = readLock(filePath)
  if (lockId && current?.lock_id !== lockId) failCode('WORKFLOW_LOCK_CONFLICT', `lock changed while stale recovery was in progress: ${filePath}`)
  releaseLock(filePath)
  console.log(`Stale workflow lock removed: ${manifest.id}`)
}

function saveNewState(root, state) {
  const filePath = statePath(root, state.manifest)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
    fs.linkSync(temporary, filePath)
  } catch (error) {
    if (error.code === 'EEXIST') failCode('WORKFLOW_CONFLICT', `state was created concurrently: ${filePath}`)
    throw error
  } finally {
    try { fs.unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

function saveState(root, state, expectedRevision) {
  const filePath = statePath(root, state.manifest)
  const persisted = loadState(root, state.manifest)
  if (persisted.revision !== expectedRevision) failCode('WORKFLOW_CONFLICT', `expected revision ${expectedRevision}, found ${persisted.revision}`)
  state.revision = expectedRevision + 1
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
  try { fs.renameSync(temporary, filePath) } finally {
    try { fs.unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

function loadState(root, manifest) {
  const filePath = statePath(root, manifest)
  assert(fs.existsSync(filePath), `no persisted state for ${manifest.id}; run workflow start first`)
  const state = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  assert(state && typeof state === 'object' && !Array.isArray(state), 'persisted state is not a JSON object')
  assert([1, 2].includes(state.schema_version), `persisted state schema version is incompatible: ${state.schema_version ?? 'missing'}`)
  assert(state.workflow_id === manifest.id && state.manifest_version === manifest.version, 'persisted state does not match the manifest version')
  assert(state.phases && typeof state.phases === 'object' && !Array.isArray(state.phases), 'persisted state is incomplete: phases are missing')
  for (const phase of manifest.phases) {
    assert(state.phases[phase.id] && typeof state.phases[phase.id] === 'object', `persisted state is incomplete: phase ${phase.id} is missing`)
    assert(typeof state.phases[phase.id].status === 'string', `persisted state is incomplete: phase ${phase.id} status is missing`)
  }
  if (!Number.isInteger(state.revision)) state.revision = 0
  const phases = validateManifest(manifest, root)
  return normalizeState(state, manifest, phases)
}

function newState(manifest, mode, root) {
  const now = new Date().toISOString()
  const phases = validateManifest(manifest, root)
  return {
    schema_version: 2,
    revision: 0,
    workflow_id: manifest.id,
    manifest_version: manifest.version,
    mode,
    created_at: now,
    updated_at: now,
    route: compileRoute(manifest, phases),
    phases: Object.fromEntries(manifest.phases.map(phase => [phase.id, phaseRecord(phase)])),
    history: [],
    manifest,
  }
}

function violation(mode, messages) {
  if (!messages.length) return false
  for (const message of messages) console.error(`${mode === 'warn' ? 'WARN' : 'ERROR'}: ${message}`)
  if (mode === 'strict') return true
  return false
}

function markdownHeadingExists(content, expectedText, expectedLevel) {
  let fence = null
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.character && fenceMatch[1].length >= fence.length) fence = null
      continue
    }
    if (fenceMatch) {
      fence = { character: fenceMatch[1][0], length: fenceMatch[1].length }
      continue
    }
    const headingMatch = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/)
    if (!headingMatch) continue
    const level = headingMatch[1].length
    const text = headingMatch[2].replace(/[ \t]+#+[ \t]*$/, '').trim()
    if (text === expectedText.trim() && (expectedLevel === undefined || level === expectedLevel)) return true
  }
  return false
}

function jsonTypeMatches(value, type) {
  if (type === 'null') return value === null
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'string') return typeof value === 'string'
  return false
}

function jsonValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function jsonPathChild(parent, key) {
  return `${parent}[${JSON.stringify(String(key))}]`
}

const JSON_SCHEMA_SUPPORTED_KEYWORDS = new Set([
  '$defs', '$ref', 'additionalProperties', 'allOf', 'anyOf', 'const', 'enum',
  'exclusiveMaximum', 'exclusiveMinimum', 'items', 'maxItems', 'maxLength',
  'maxProperties', 'maximum', 'minItems', 'minLength', 'minProperties',
  'minimum', 'not', 'oneOf', 'pattern', 'properties', 'required', 'type',
])
const JSON_SCHEMA_IGNORED_KEYWORDS = new Set([
  '$anchor', '$comment', '$id', '$schema', 'default', 'deprecated', 'description',
  'examples', 'readOnly', 'title', 'writeOnly',
])

function resolveJsonSchemaPointer(rootSchema, reference) {
  if (reference === '#') return rootSchema
  if (typeof reference !== 'string' || !reference.startsWith('#/')) throw new Error(`external JSON Schema references are unsupported: ${reference}`)
  return reference.slice(2).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~')).reduce((current, part) => {
    if (current === undefined || current === null || !Object.hasOwn(current, part)) throw new Error(`JSON Schema reference not found: ${reference}`)
    return current[part]
  }, rootSchema)
}

function jsonSchemaProblems(value, schema, rootSchema = schema, instancePath = '$', depth = 0) {
  if (depth > MAX_JSON_SCHEMA_DEPTH) throw new Error(`JSON Schema nesting exceeds ${MAX_JSON_SCHEMA_DEPTH} levels`)
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('JSON Schema nodes must be objects')
  for (const key of Object.keys(schema)) {
    if (!JSON_SCHEMA_SUPPORTED_KEYWORDS.has(key) && !JSON_SCHEMA_IGNORED_KEYWORDS.has(key)) throw new Error(`unsupported JSON Schema keyword: ${key}`)
  }
  if (schema.$ref !== undefined) return jsonSchemaProblems(value, resolveJsonSchemaPointer(rootSchema, schema.$ref), rootSchema, instancePath, depth + 1)

  const problems = []
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.every(type => typeof type === 'string')) throw new Error(`${instancePath}: JSON Schema type must be a string or array of strings`)
    if (!types.some(type => jsonTypeMatches(value, type))) return [`${instancePath} must be ${types.join(' or ')}`]
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.some(candidate => jsonValuesEqual(value, candidate)))) problems.push(`${instancePath} is not an allowed value`)
  if (schema.const !== undefined && !jsonValuesEqual(value, schema.const)) problems.push(`${instancePath} must equal the schema const value`)

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${instancePath} must contain at least ${schema.minLength} characters`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push(`${instancePath} must contain at most ${schema.maxLength} characters`)
    if (schema.pattern !== undefined && !compileSafePatternForRuntime(schema.pattern, '', `${instancePath}.pattern`).test(value)) problems.push(`${instancePath} does not match the schema pattern`)
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${instancePath} must be at least ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${instancePath} must be at most ${schema.maximum}`)
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) problems.push(`${instancePath} must be greater than ${schema.exclusiveMinimum}`)
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) problems.push(`${instancePath} must be less than ${schema.exclusiveMaximum}`)
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${instancePath} must contain at least ${schema.minItems} items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${instancePath} must contain at most ${schema.maxItems} items`)
    if (schema.items && !Array.isArray(schema.items)) value.forEach((item, index) => problems.push(...jsonSchemaProblems(item, schema.items, rootSchema, jsonPathChild(instancePath, index), depth + 1)))
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value)
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) problems.push(`${instancePath} must contain at least ${schema.minProperties} properties`)
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) problems.push(`${instancePath} must contain at most ${schema.maxProperties} properties`)
    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required) || !schema.required.every(key => typeof key === 'string')) throw new Error(`${instancePath}: required must be an array of strings`)
      for (const key of schema.required) if (!Object.hasOwn(value, key)) problems.push(`${jsonPathChild(instancePath, key)} is required`)
    }
    const properties = schema.properties ?? {}
    if (typeof properties !== 'object' || Array.isArray(properties)) throw new Error(`${instancePath}: properties must be an object`)
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) problems.push(...jsonSchemaProblems(value[key], propertySchema, rootSchema, jsonPathChild(instancePath, key), depth + 1))
    }
    for (const key of keys.filter(key => !Object.hasOwn(properties, key))) {
      if (schema.additionalProperties === false) problems.push(`${jsonPathChild(instancePath, key)} is not allowed`)
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') problems.push(...jsonSchemaProblems(value[key], schema.additionalProperties, rootSchema, jsonPathChild(instancePath, key), depth + 1))
    }
  }

  for (const keyword of ['allOf']) {
    if (schema[keyword] !== undefined) {
      if (!Array.isArray(schema[keyword])) throw new Error(`${instancePath}: ${keyword} must be an array`)
      for (const childSchema of schema[keyword]) problems.push(...jsonSchemaProblems(value, childSchema, rootSchema, instancePath, depth + 1))
    }
  }
  for (const keyword of ['anyOf', 'oneOf']) {
    if (schema[keyword] === undefined) continue
    if (!Array.isArray(schema[keyword])) throw new Error(`${instancePath}: ${keyword} must be an array`)
    const matches = schema[keyword].filter(childSchema => jsonSchemaProblems(value, childSchema, rootSchema, instancePath, depth + 1).length === 0).length
    if ((keyword === 'anyOf' && matches === 0) || (keyword === 'oneOf' && matches !== 1)) problems.push(`${instancePath} does not satisfy ${keyword}`)
  }
  if (schema.not !== undefined && jsonSchemaProblems(value, schema.not, rootSchema, instancePath, depth + 1).length === 0) problems.push(`${instancePath} must not satisfy the schema`)
  return problems
}

function readArtifactContent(target, stat) {
  if (!stat.isFile()) return { content: null, problems: ['requires a file'] }
  try { return { content: fs.readFileSync(target, 'utf8'), problems: [] } } catch (error) { return { content: null, problems: [`could not read file: ${error.message}`] } }
}

function artifactValidatorLabel(artifact, index, descriptor) {
  return `artifact ${artifact.path} validator ${index + 1} (${descriptor.type})`
}

const ARTIFACT_VALIDATORS = Object.freeze({
  'non-empty': ({ target, stat }) => {
    const empty = (stat.isFile() && stat.size === 0) || (stat.isDirectory() && fs.readdirSync(target).length === 0)
    return empty ? ['artifact is empty'] : []
  },
  'markdown-heading': ({ descriptor, readContent }) => {
    const input = readContent()
    if (input.problems.length) return input.problems
    return markdownHeadingExists(input.content, descriptor.text, descriptor.level) ? [] : [`missing Markdown heading: ${descriptor.level ? `${'#'.repeat(descriptor.level)} ` : ''}${descriptor.text}`]
  },
  'json-schema': ({ root, target, descriptor, readContent }) => {
    const input = readContent()
    if (input.problems.length) return input.problems
    try {
      const value = JSON.parse(input.content)
      const schemaPath = resolveSafePath(root, descriptor.schema, 'validator schema')
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
      return jsonSchemaProblems(value, schema).map(problem => `JSON Schema violation: ${problem}`)
    } catch (error) {
      return [`JSON Schema validation failed: ${error.message}`]
    }
  },
  'yaml-valid': ({ readContent }) => {
    const input = readContent()
    if (input.problems.length) return input.problems
    try { parseYaml(input.content); return [] } catch (error) { return [`YAML validation failed: ${error.message}`] }
  },
  'contains-pattern': ({ descriptor, readContent }) => {
    const input = readContent()
    if (input.problems.length) return input.problems
    if (input.content.length > MAX_VALIDATOR_INPUT_LENGTH) return [`content exceeds the ${MAX_VALIDATOR_INPUT_LENGTH}-character pattern validation limit`]
    try {
      const pattern = compileSafePatternForRuntime(descriptor.pattern, descriptor.flags)
      return pattern.test(input.content) ? [] : [`pattern did not match: ${descriptor.pattern}`]
    } catch (error) { return [`pattern validation failed: ${error.message}`] }
  },
})

function artifactProblems(root, artifacts) {
  const problems = []
  for (const artifact of artifacts) {
    const target = resolveSafePath(root, artifact.path, 'artifact')
    if (!fs.existsSync(target)) { problems.push(`missing artifact: ${artifact.path}`); continue }
    const stat = fs.statSync(target)
    if (artifact.type === 'file' && !stat.isFile()) problems.push(`artifact is not a file: ${artifact.path}`)
    if (artifact.type === 'directory' && !stat.isDirectory()) problems.push(`artifact is not a directory: ${artifact.path}`)

    let cachedContent = null
    let contentLoaded = false
    const readContent = () => {
      if (!contentLoaded) {
        cachedContent = readArtifactContent(target, stat)
        contentLoaded = true
      }
      return cachedContent
    }

    if (artifact.non_empty) {
      const legacyProblems = ARTIFACT_VALIDATORS['non-empty']({ target, stat })
      for (const problem of legacyProblems) problems.push(`artifact ${artifact.path} validator legacy non_empty: ${problem}`)
    }
    if (stat.isFile() && artifact.sections.length) {
      const input = readContent()
      for (const section of artifact.sections) if (!input.problems.length && !input.content.includes(section)) problems.push(`artifact ${artifact.path} is missing section: ${section}`)
      for (const problem of input.problems) problems.push(`artifact ${artifact.path} validator legacy sections: ${problem}`)
    }
    for (const [index, descriptor] of (artifact.validators ?? []).entries()) {
      if (descriptor.type === 'non-empty' && artifact.non_empty) continue
      const label = artifactValidatorLabel(artifact, index, descriptor)
      const implementation = ARTIFACT_VALIDATORS[descriptor.type]
      const validatorProblems = implementation
        ? implementation({ root, target, stat, artifact, descriptor, readContent })
        : [`validator type is not implemented: ${descriptor.type}`]
      for (const problem of validatorProblems) problems.push(`${label}: ${problem}`)
    }
  }
  return problems
}

function safeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || path.isAbsolute(value)) return false
  return !value.replaceAll('\\', '/').split('/').includes('..')
}

function resolveSafePath(root, value, label = 'path') {
  assert(safeRelativePath(value), `${label} must be a safe repository-relative path`, 2)
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, value)
  assert(resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`), `${label} escapes the repository root`, 2)
  return resolved
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function hashPath(root, relativePath) {
  const target = resolveSafePath(root, relativePath, 'artifact')
  assert(fs.existsSync(target), `checkpoint artifact is missing: ${relativePath}`)
  const stat = fs.lstatSync(target)
  if (stat.isFile()) return { path: relativePath, kind: 'file', sha256: sha256File(target), size: stat.size }
  if (stat.isSymbolicLink()) return { path: relativePath, kind: 'symlink', sha256: createHash('sha256').update(fs.readlinkSync(target)).digest('hex') }
  assert(stat.isDirectory(), `checkpoint artifact must be a file, directory, or symlink: ${relativePath}`)
  const digest = createHash('sha256')
  let fileCount = 0
  const visit = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      const child = path.join(directory, entry.name)
      const childRelative = `${prefix}/${entry.name}`
      if (entry.isDirectory()) visit(child, childRelative)
      else {
        const childStat = fs.lstatSync(child)
        const childHash = childStat.isSymbolicLink()
          ? createHash('sha256').update(fs.readlinkSync(child)).digest('hex')
          : sha256File(child)
        digest.update(`${childRelative}\0${childHash}\n`)
        fileCount += 1
      }
    }
  }
  visit(target, relativePath)
  return { path: relativePath, kind: 'directory', sha256: digest.digest('hex'), files: fileCount }
}

function actorMetadata() {
  return {
    kind: 'agent',
    id: process.env.GO_BEAST_AGENT || process.env.AGENT || 'unknown',
    session_id: process.env.GO_BEAST_SESSION_ID || process.env.CODEX_SESSION_ID || 'unknown',
  }
}

function commandProvenance(root) {
  return {
    command: process.argv[2] ?? 'unknown',
    argv_sha256: createHash('sha256').update(JSON.stringify(process.argv.slice(1))).digest('hex'),
    cwd: path.resolve(root),
    exit_code: 0,
  }
}

function contextCompletionSummary(root, manifest, phase, contextPath) {
  const target = resolveSafePath(root, contextPath, 'context')
  let packet
  try { packet = JSON.parse(fs.readFileSync(target, 'utf8')) } catch (error) { fail(`context is not valid JSON: ${error.message}`, 2) }
  assert(packet?.kind === 'context_packet' && packet.schema_version === 1, 'context packet schema is unsupported', 2)
  assert(packet.workflow_id === manifest.id && packet.phase?.id === phase.id, 'context packet does not match the workflow phase', 2)
  const completion = packet.completion
  assert(completion && Array.isArray(completion.decisions) && Array.isArray(completion.open_questions) && Array.isArray(completion.validation_evidence) && Array.isArray(completion.provenance), 'context packet is not finalized', 2)
  const validationStatus = completion.validation_evidence.length > 0 && completion.validation_evidence.every(evidence => evidence.status === 'PASS') ? 'PASS' : 'FAIL'
  assert(validationStatus === 'PASS', 'context completion validation evidence is not PASS', 2)
  return {
    path: path.relative(root, target),
    sha256: sha256File(target),
    decisions_count: completion.decisions.length,
    open_questions_count: completion.open_questions.length,
    validation_status: validationStatus,
  }
}

function attemptProblems(phase, record) {
  if (record.attempts >= phaseRetryLimit(phase)) return [`retry limit reached for phase: ${phase.id}`]
  return []
}

function preconditionProblems(root, preconditions) {
  return preconditions.flatMap(precondition => {
    if (precondition.type === 'path_exists' && !fs.existsSync(path.resolve(root, precondition.path))) return [`precondition path does not exist: ${precondition.path}`]
    if (precondition.type === 'env' && !process.env[precondition.name]) return [`precondition environment variable is missing: ${precondition.name}`]
    return []
  })
}

function invalidateDependents(state, phases, phaseId, visited = new Set()) {
  const invalidated = []
  for (const phase of phases.values()) {
    if (phase.id === phaseId || !phase.depends_on.includes(phaseId)) continue
    if (visited.has(phase.id)) continue
    visited.add(phase.id)
    const record = state.phases[phase.id]
    if (['completed', 'running', 'handoff_pending'].includes(record.status)) {
      record.status = 'invalidated'
      delete record.started_at
      delete record.completed_at
      delete record.interrupted_at
      delete record.handoff
      invalidated.push(phase.id)
    }
    invalidated.push(...invalidateDependents(state, phases, phase.id, visited))
  }
  return invalidated
}

function unlockedProblems(root, phase, state, phases) {
  const problems = []
  for (const dependency of phase.depends_on) {
    if (state.phases[dependency].status !== 'completed') problems.push(`dependency is not complete: ${dependency}`)
    if (!phases.get(dependency).transitions.includes(phase.id)) problems.push(`transition is not allowed: ${dependency} -> ${phase.id}`)
  }
  problems.push(...attemptProblems(phase, state.phases[phase.id]))
  problems.push(...artifactProblems(root, phase.requires))
  problems.push(...preconditionProblems(root, phase.preconditions))
  return problems
}

function readyPhaseIds(root, state, phases, requestedPhase = null) {
  return [...phases.values()]
    .filter(phase => !requestedPhase || phase.id === requestedPhase)
    .filter(phase => ['pending', 'invalidated'].includes(state.phases[phase.id].status))
    .filter(phase => unlockedProblems(root, phase, state, phases).length === 0)
    .map(phase => phase.id)
}

function startPhaseRecord(state, phase, source) {
  const record = state.phases[phase.id]
  record.status = 'running'
  record.attempts = (record.attempts ?? 0) + 1
  record.started_at = new Date().toISOString()
  delete record.completed_at
  delete record.interrupted_at
  delete record.failed_at
  delete record.error
  record.handoff = null
  state.history.push({ event: 'begin', phase: phase.id, source, attempt: record.attempts, at: record.started_at })
  state.updated_at = record.started_at
}

function printStatus(state, phases) {
  const ready = [...phases.values()]
    .filter(phase => ['pending', 'invalidated'].includes(state.phases[phase.id].status))
    .filter(phase => phase.depends_on.every(dependency => state.phases[dependency].status === 'completed'))
    .map(phase => phase.id)
  console.log(JSON.stringify({
    workflow_id: state.workflow_id,
    mode: state.mode,
    schema_version: state.schema_version,
    revision: state.revision,
    ready,
    phases: Object.fromEntries([...phases.keys()].map(id => [id, state.phases[id].status])),
  }, null, 2))
}

function printRoute(route, format) {
  if (format === 'json') {
    console.log(JSON.stringify(route, null, 2))
    return
  }
  console.log(`Workflow route: ${route.workflow_id}`)
  console.log(`  order: ${route.order.join(' -> ')}`)
  for (const slice of route.parallel_slices) console.log(`  parallel ${slice.id}: ${slice.phases.join(', ')}`)
}

function commandHelp() {
  console.log('Usage: go-beast workflow <validate|plan|start|status|resume|continue|begin|complete|retry|checkpoint|handoff|unlock> [--root PATH] [--file PATH] [--mode off|warn|strict] [--phase ID] [--format text|json]')
}

function main() {
  const options = parseArgs()
  if (options.command === 'help') return commandHelp()
  assert(['text', 'json'].includes(options.format), '--format must be text or json', 2)
  const { packageRoot, projectRoot } = resolveWorkflowRoots({ explicitRoot: options.root })
  if (options.command === 'validate' && options.all) {
    const files = manifestFiles(projectRoot)
    assert(files.length > 0, 'no workflow manifests found')
    for (const filePath of files) {
      const manifest = loadDocument(filePath)
      validateWorkflowSchema(packageRoot)
      validateManifest(manifest, projectRoot)
      console.log(`Workflow manifest valid: ${path.relative(projectRoot, filePath)} (${manifest.phases.length} phases)`)
    }
    return
  }
  const { manifest, filePath } = loadManifest(projectRoot, options.file)
  validateWorkflowSchema(packageRoot)
  const phases = validateManifest(manifest, projectRoot)
  const mode = resolveMode(manifest, options.mode)
  if (options.command === 'validate') {
    console.log(`Workflow manifest valid: ${path.relative(projectRoot, filePath)} (${manifest.phases.length} phases)`)
    return
  }
  if (options.command === 'plan') {
    printRoute(compileRoute(manifest, phases), options.format)
    return
  }
  if (options.command === 'unlock') { unlockStale(projectRoot, manifest); return }
  if (mode === 'off') { console.log(`Workflow engine disabled (mode: off): ${manifest.id}`); return }
  if (options.command === 'start') {
    withLock(projectRoot, manifest, () => {
      const file = statePath(projectRoot, manifest)
      if (fs.existsSync(file)) printStatus(loadState(projectRoot, manifest), phases)
      else { const state = newState(manifest, mode, projectRoot); saveNewState(projectRoot, state); console.log(`Workflow started: ${manifest.id}`) }
    })
    return
  }
  if (options.command === 'status') { printStatus(loadState(projectRoot, manifest), phases); return }
  if (options.command === 'resume') {
    withLock(projectRoot, manifest, () => {
      const state = loadState(projectRoot, manifest)
      const expectedRevision = state.revision
      const interrupted = []
      for (const phase of phases.values()) {
        const record = state.phases[phase.id]
        if (record.status !== 'running') continue
        record.status = 'interrupted'
        record.interrupted_at = new Date().toISOString()
        record.error = 'execution interrupted; retry or begin the phase to continue'
        state.history.push({ event: 'interrupt', phase: phase.id, at: record.interrupted_at })
        state.updated_at = record.interrupted_at
        interrupted.push(phase.id)
      }
      if (state.__migrated || interrupted.length > 0) saveState(projectRoot, state, expectedRevision)
      if (options.format === 'json') console.log(JSON.stringify({ workflow_id: manifest.id, migrated: Boolean(state.__migrated), interrupted }, null, 2))
      else console.log(`Workflow resumed: ${manifest.id} (${interrupted.length} interrupted, ${state.__migrated ? 'v1 state migrated' : 'state current'})`)
    })
    return
  }
  if (options.command === 'continue') {
    withLock(projectRoot, manifest, () => {
      const state = loadState(projectRoot, manifest)
      const expectedRevision = state.revision
      state.mode = mode
      const candidates = [...phases.values()]
        .filter(phase => (!options.phase || phase.id === options.phase) && ['pending', 'invalidated'].includes(state.phases[phase.id].status))
        .filter(phase => phase.depends_on.every(dependency => state.phases[dependency].status === 'completed' && phases.get(dependency).transitions.includes(phase.id)))
      const warnings = candidates.flatMap(phase => unlockedProblems(projectRoot, phase, state, phases).map(message => `${phase.id}: ${message}`))
      if (violation(mode, warnings) && !candidates.every(phase => unlockedProblems(projectRoot, phase, state, phases).length === 0)) { process.exitCode = 1; return }
      const ready = candidates.filter(phase => unlockedProblems(projectRoot, phase, state, phases).length === 0)
      for (const phase of ready) startPhaseRecord(state, phase, 'continue')
      if (ready.length > 0 || state.__migrated) saveState(projectRoot, state, expectedRevision)
      if (options.format === 'json') console.log(JSON.stringify({ workflow_id: manifest.id, started: ready.map(phase => phase.id), parallel_slices: [...new Set(ready.map(phase => phase.parallel_group).filter(Boolean))] }, null, 2))
      else if (ready.length > 0) console.log(`Workflow phases started: ${ready.map(phase => phase.id).join(', ')}`)
      else console.log(`No workflow phases ready: ${manifest.id}`)
    })
    return
  }
  assert(['begin', 'complete', 'retry', 'checkpoint', 'handoff'].includes(options.command), `unknown workflow command: ${options.command}`, 2)
  assert(options.phase && phases.has(options.phase), '--phase must identify a phase in the manifest', 2)
  const phase = phases.get(options.phase)
  withLock(projectRoot, manifest, () => {
    const state = loadState(projectRoot, manifest)
    const expectedRevision = state.revision
    state.mode = mode
    const record = state.phases[phase.id]
    const warnings = []
    if (options.command === 'begin') {
      if (record.status === 'running') warnings.push(`phase is already running: ${phase.id}`)
      if (record.status === 'completed') {
        record.status = 'pending'
        delete record.completed_at
        warnings.push(...invalidateDependents(state, phases, phase.id).map(id => `dependent phase invalidated: ${id}`))
      }
      warnings.push(...unlockedProblems(projectRoot, phase, state, phases))
      if (violation(mode, warnings)) { process.exitCode = 1; return }
      startPhaseRecord(state, phase, 'begin')
      saveState(projectRoot, state, expectedRevision)
      console.log(`Phase unlocked: ${phase.id} (skill: ${phase.skill})`)
      return
    }
    if (options.command === 'retry') {
      assert(['interrupted', 'failed', 'handoff_pending'].includes(record.status), `phase is not retryable: ${phase.id}`)
      assert(record.attempts < phaseRetryLimit(phase), `retry limit reached for phase: ${phase.id}`)
      record.status = 'pending'
      record.retry_at = new Date().toISOString()
      delete record.started_at
      delete record.completed_at
      delete record.interrupted_at
      delete record.failed_at
      delete record.error
      record.handoff = null
      state.history.push({ event: 'retry', phase: phase.id, next_attempt: record.attempts + 1, at: record.retry_at })
      state.updated_at = record.retry_at
      saveState(projectRoot, state, expectedRevision)
      console.log(`Phase queued for retry: ${phase.id} (attempt ${record.attempts + 1})`)
      return
    }
    if (options.command === 'checkpoint') {
      assert(typeof options.name === 'string' && /^[A-Za-z0-9._-]+$/.test(options.name), '--name must be a non-empty checkpoint identifier', 2)
      assert(['running', 'handoff_pending', 'completed'].includes(record.status), `phase is not checkpointable: ${phase.id}`)
      const checkpointAt = new Date().toISOString()
      const checkpoint = {
        id: `${phase.id}:${options.name}:${record.checkpoints.length + 1}`,
        name: options.name,
        phase: phase.id,
        created_at: checkpointAt,
        actor: actorMetadata(),
        provenance: {
          command: commandProvenance(projectRoot),
          artifacts: options.artifact ? [hashPath(projectRoot, options.artifact)] : [],
        },
      }
      record.checkpoints.push(checkpoint)
      state.history.push({ event: 'checkpoint', phase: phase.id, checkpoint_id: checkpoint.id, at: checkpointAt })
      state.updated_at = checkpointAt
      saveState(projectRoot, state, expectedRevision)
      console.log(`Checkpoint recorded: ${checkpoint.id}`)
      return
    }
    if (options.command === 'handoff') {
      assert(typeof options.to === 'string' && /^[A-Za-z0-9._-]+$/.test(options.to), '--to must be a non-empty agent identifier', 2)
      assert(typeof options.note === 'string' && options.note.length <= 500, '--note must be provided and contain at most 500 characters', 2)
      assert(['running', 'handoff_pending'].includes(record.status), `phase is not handoff-ready: ${phase.id}`)
      if (phase.handoff?.targets && !phase.handoff.targets.includes(options.to)) fail(`handoff target is not allowed for ${phase.id}: ${options.to}`, 2)
      const handoffAt = new Date().toISOString()
      record.status = 'handoff_pending'
      record.handoff = {
        target: options.to,
        note: options.note,
        actor: actorMetadata(),
        checkpoint_id: record.checkpoints.at(-1)?.id ?? null,
        created_at: handoffAt,
      }
      state.history.push({ event: 'handoff', phase: phase.id, target: options.to, checkpoint_id: record.handoff.checkpoint_id, at: handoffAt })
      state.updated_at = handoffAt
      saveState(projectRoot, state, expectedRevision)
      console.log(`Phase handed off: ${phase.id} -> ${options.to}`)
      return
    }
    assert(record.status === 'running' || record.status === 'handoff_pending', `phase is not running: ${phase.id}`)
    const context = options.context ? contextCompletionSummary(projectRoot, manifest, phase, options.context) : null
    warnings.push(...artifactProblems(projectRoot, phase.produces))
    if (violation(mode, warnings)) { process.exitCode = 1; return }
    record.status = 'completed'
    record.completed_at = new Date().toISOString()
    if (context) record.context = context
    state.history.push({ event: 'complete', phase: phase.id, at: record.completed_at, ...(context ? { context_path: context.path, context_sha256: context.sha256 } : {}) })
    state.updated_at = record.completed_at
    saveState(projectRoot, state, expectedRevision)
    console.log(`Phase completed: ${phase.id}`)
  })
}

try { main() } catch (error) { if (error.code === 'ENOENT') fail(error.message); else fail(error.message) }
