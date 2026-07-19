#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { parseYaml } from './transversal-rules.mjs'
import { resolveWorkflowRoots } from './workflow-roots.mjs'

const STATE_DIR = path.join('.go-beast', 'workflows')
const LOCK_DIR = path.join(STATE_DIR, 'locks')
const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000
const MODES = new Set(['off', 'warn', 'strict'])

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
  const options = { command, file: null, mode: null, phase: null, root: null, all: false }
  while (args.length) {
    const arg = args.shift()
    if (arg === '--all') options.all = true
    else if (['--file', '--mode', '--phase', '--root'].includes(arg)) {
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
  assert(schema.type === 'object' && schema.title && schema.$defs?.artifact, 'workflow schema has an invalid structural contract')
  for (const key of ['schema_version', 'id', 'version', 'phases']) assert(schema.required?.includes(key), `workflow schema is missing required field: ${key}`)
}

function validateArtifactDescriptor(artifact, label) {
  assert(artifact && typeof artifact === 'object' && !Array.isArray(artifact), `${label} must be an object`)
  for (const key of Object.keys(artifact)) assert(['path', 'type', 'non_empty', 'sections'].includes(key), `${label} has unknown key ${key}`)
  assert(typeof artifact.path === 'string' && artifact.path.length > 0, `${label}.path must be non-empty`)
  assert(!path.isAbsolute(artifact.path) && !artifact.path.split('/').includes('..'), `${label}.path must stay within the repository`)
  assert(['file', 'directory'].includes(artifact.type), `${label}.type must be file or directory`)
  assert(typeof artifact.non_empty === 'boolean', `${label}.non_empty must be boolean`)
  if (artifact.sections === undefined) artifact.sections = []
  assert(Array.isArray(artifact.sections) && artifact.sections.every(section => typeof section === 'string' && section.length > 0), `${label}.sections must be an array of non-empty strings`)
}

function validateManifest(manifest, root) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest must be an object')
  for (const key of Object.keys(manifest)) assert(['schema_version', 'id', 'version', 'mode', 'phases'].includes(key), `manifest has unknown key ${key}`)
  for (const key of ['schema_version', 'id', 'version', 'phases']) assert(Object.hasOwn(manifest, key), `manifest is missing ${key}`)
  assert(manifest.schema_version === 1, `unsupported schema_version ${manifest.schema_version}`)
  assert(typeof manifest.id === 'string' && /^[a-z0-9-]+$/.test(manifest.id), 'id must match ^[a-z0-9-]+$')
  assert(Number.isInteger(manifest.version) && manifest.version >= 1, 'version must be a positive integer')
  if (manifest.mode !== undefined) assert(MODES.has(manifest.mode), `mode must be one of ${[...MODES].join(', ')}`)
  assert(Array.isArray(manifest.phases) && manifest.phases.length > 0, 'phases must be a non-empty array')

  const phases = new Map()
  for (const [index, phase] of manifest.phases.entries()) {
    const label = `phases[${index}]`
    assertKeys(phase, ['id', 'skill', 'depends_on', 'preconditions', 'requires', 'produces', 'transitions'], label)
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
  assert(state.schema_version === 1, `persisted state schema version is incompatible: ${state.schema_version ?? 'missing'}`)
  assert(state.workflow_id === manifest.id && state.manifest_version === manifest.version, 'persisted state does not match the manifest version')
  assert(state.phases && typeof state.phases === 'object' && !Array.isArray(state.phases), 'persisted state is incomplete: phases are missing')
  for (const phase of manifest.phases) {
    assert(state.phases[phase.id] && typeof state.phases[phase.id] === 'object', `persisted state is incomplete: phase ${phase.id} is missing`)
    assert(typeof state.phases[phase.id].status === 'string', `persisted state is incomplete: phase ${phase.id} status is missing`)
  }
  if (!Number.isInteger(state.revision)) state.revision = 0
  return state
}

function newState(manifest, mode) {
  const now = new Date().toISOString()
  return {
    schema_version: 1,
    revision: 0,
    workflow_id: manifest.id,
    manifest_version: manifest.version,
    mode,
    created_at: now,
    updated_at: now,
    phases: Object.fromEntries(manifest.phases.map(phase => [phase.id, { status: 'pending', skill: phase.skill }])),
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

function artifactProblems(root, artifacts) {
  const problems = []
  for (const artifact of artifacts) {
    const target = path.resolve(root, artifact.path)
    if (!fs.existsSync(target)) { problems.push(`missing artifact: ${artifact.path}`); continue }
    const stat = fs.statSync(target)
    if (artifact.type === 'file' && !stat.isFile()) problems.push(`artifact is not a file: ${artifact.path}`)
    if (artifact.type === 'directory' && !stat.isDirectory()) problems.push(`artifact is not a directory: ${artifact.path}`)
    if (artifact.non_empty && ((stat.isFile() && stat.size === 0) || (stat.isDirectory() && fs.readdirSync(target).length === 0))) problems.push(`artifact is empty: ${artifact.path}`)
    if (stat.isFile() && artifact.sections.length) {
      const content = fs.readFileSync(target, 'utf8')
      for (const section of artifact.sections) if (!content.includes(section)) problems.push(`artifact ${artifact.path} is missing section: ${section}`)
    }
  }
  return problems
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
    if (record.status === 'completed' || record.status === 'running') {
      record.status = 'invalidated'
      delete record.started_at
      delete record.completed_at
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
  problems.push(...artifactProblems(root, phase.requires))
  problems.push(...preconditionProblems(root, phase.preconditions))
  return problems
}

function printStatus(state, phases) {
  console.log(JSON.stringify({ workflow_id: state.workflow_id, mode: state.mode, phases: Object.fromEntries([...phases.keys()].map(id => [id, state.phases[id].status])) }, null, 2))
}

function commandHelp() {
  console.log('Usage: go-beast workflow <validate|start|status|resume|begin|complete|unlock> [--root PATH] [--file PATH] [--mode off|warn|strict] [--phase ID]')
}

function main() {
  const options = parseArgs()
  if (options.command === 'help') return commandHelp()
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
  if (options.command === 'unlock') { unlockStale(projectRoot, manifest); return }
  if (mode === 'off') { console.log(`Workflow engine disabled (mode: off): ${manifest.id}`); return }
  if (options.command === 'start') {
    withLock(projectRoot, manifest, () => {
      const file = statePath(projectRoot, manifest)
      if (fs.existsSync(file)) printStatus(loadState(projectRoot, manifest), phases)
      else { const state = newState(manifest, mode); saveNewState(projectRoot, state); console.log(`Workflow started: ${manifest.id}`) }
    })
    return
  }
  if (options.command === 'status' || options.command === 'resume') { printStatus(loadState(projectRoot, manifest), phases); return }
  assert(['begin', 'complete'].includes(options.command), `unknown workflow command: ${options.command}`, 2)
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
      record.status = 'running'
      record.started_at = new Date().toISOString()
      state.history.push({ event: 'begin', phase: phase.id, at: record.started_at })
      state.updated_at = record.started_at
      saveState(projectRoot, state, expectedRevision)
      console.log(`Phase unlocked: ${phase.id} (skill: ${phase.skill})`)
      return
    }
    assert(record.status === 'running', `phase is not running: ${phase.id}`)
    warnings.push(...artifactProblems(projectRoot, phase.produces))
    if (violation(mode, warnings)) { process.exitCode = 1; return }
    record.status = 'completed'
    record.completed_at = new Date().toISOString()
    state.history.push({ event: 'complete', phase: phase.id, at: record.completed_at })
    state.updated_at = record.completed_at
    saveState(projectRoot, state, expectedRevision)
    console.log(`Phase completed: ${phase.id}`)
  })
}

try { main() } catch (error) { if (error.code === 'ENOENT') fail(error.message); else fail(error.message) }
