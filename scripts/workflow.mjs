#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseYaml } from './transversal-rules.mjs'

const ROOT = process.cwd()
const STATE_DIR = path.join('.go-beast', 'workflows')
const MODES = new Set(['off', 'warn', 'strict'])

function fail(message, code = 1) {
  console.error(`Workflow validation failed: ${message}`)
  process.exit(code)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const command = args.shift() ?? 'help'
  const options = { command, file: null, mode: null, phase: null, all: false }
  while (args.length) {
    const arg = args.shift()
    if (arg === '--all') options.all = true
    else if (['--file', '--mode', '--phase'].includes(arg)) {
      const value = args.shift()
      if (!value) fail(`${arg} requires a value`, 2)
      options[arg.slice(2)] = value
    } else if (arg === '--help' || arg === '-h') options.command = 'help'
    else fail(`unknown option: ${arg}`, 2)
  }
  return options
}

function assert(condition, message) {
  if (!condition) fail(message)
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

function loadManifest(root, file) {
  const candidates = file ? [path.resolve(root, file)] : manifestFiles(root)
  assert(candidates.length === 1, file ? `manifest not found: ${file}` : 'use --file when workflows/ contains multiple manifests')
  const filePath = candidates[0]
  assert(fs.existsSync(filePath), `manifest not found: ${filePath}`)
  let manifest
  try { manifest = loadDocument(filePath) } catch (error) { fail(`${path.relative(root, filePath)} is not valid JSON/YAML: ${error.message}`) }
  return { manifest, filePath }
}

function validateWorkflowSchema(root) {
  const schemaPath = path.join(root, 'go-beast.workflow.schema.json')
  assert(fs.existsSync(schemaPath), 'workflow schema is missing: go-beast.workflow.schema.json')
  let schema
  try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) } catch (error) { fail(`workflow schema is not valid JSON: ${error.message}`) }
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

function saveState(root, state) {
  const filePath = statePath(root, state.manifest)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
  fs.renameSync(temporary, filePath)
}

function loadState(root, manifest) {
  const filePath = statePath(root, manifest)
  assert(fs.existsSync(filePath), `no persisted state for ${manifest.id}; run workflow start first`)
  const state = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  assert(state.workflow_id === manifest.id && state.manifest_version === manifest.version, 'persisted state does not match the manifest version')
  return state
}

function newState(manifest, mode) {
  const now = new Date().toISOString()
  return {
    schema_version: 1,
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

function invalidateDependents(state, phases, phaseId) {
  const invalidated = []
  for (const phase of phases.values()) {
    if (phase.id === phaseId || !phase.depends_on.includes(phaseId)) continue
    const record = state.phases[phase.id]
    if (record.status === 'completed' || record.status === 'running') {
      record.status = 'invalidated'
      delete record.started_at
      delete record.completed_at
      invalidated.push(phase.id)
    }
    invalidated.push(...invalidateDependents(state, phases, phase.id))
  }
  return [...new Set(invalidated)]
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
  console.log('Usage: go-beast workflow <validate|start|status|resume|begin|complete> [--file PATH] [--mode off|warn|strict] [--phase ID]')
}

function main() {
  const options = parseArgs()
  if (options.command === 'help') return commandHelp()
  if (options.command === 'validate' && options.all) {
    const files = manifestFiles(ROOT)
    assert(files.length > 0, 'no workflow manifests found')
    for (const filePath of files) {
      const manifest = loadDocument(filePath)
      validateWorkflowSchema(ROOT)
      validateManifest(manifest, ROOT)
      console.log(`Workflow manifest valid: ${path.relative(ROOT, filePath)} (${manifest.phases.length} phases)`)
    }
    return
  }
  const { manifest, filePath } = loadManifest(ROOT, options.file)
  validateWorkflowSchema(ROOT)
  const phases = validateManifest(manifest, ROOT)
  const mode = resolveMode(manifest, options.mode)
  if (options.command === 'validate') {
    console.log(`Workflow manifest valid: ${path.relative(ROOT, filePath)} (${manifest.phases.length} phases)`)
    return
  }
  if (mode === 'off') { console.log(`Workflow engine disabled (mode: off): ${manifest.id}`); return }
  if (options.command === 'start') {
    const file = statePath(ROOT, manifest)
    if (fs.existsSync(file)) printStatus(loadState(ROOT, manifest), phases)
    else { const state = newState(manifest, mode); saveState(ROOT, state); console.log(`Workflow started: ${manifest.id}`) }
    return
  }
  const state = loadState(ROOT, manifest)
  state.mode = mode
  if (options.command === 'status' || options.command === 'resume') { printStatus(state, phases); return }
  assert(['begin', 'complete'].includes(options.command), `unknown workflow command: ${options.command}`, 2)
  assert(options.phase && phases.has(options.phase), '--phase must identify a phase in the manifest', 2)
  const phase = phases.get(options.phase)
  const record = state.phases[phase.id]
  const warnings = []
  if (options.command === 'begin') {
    if (record.status === 'running') warnings.push(`phase is already running: ${phase.id}`)
    if (record.status === 'completed') {
      record.status = 'pending'
      delete record.completed_at
      warnings.push(...invalidateDependents(state, phases, phase.id).map(id => `dependent phase invalidated: ${id}`))
    }
    warnings.push(...unlockedProblems(ROOT, phase, state, phases))
    if (violation(mode, warnings)) return process.exitCode = 1
    record.status = 'running'
    record.started_at = new Date().toISOString()
    state.history.push({ event: 'begin', phase: phase.id, at: record.started_at })
    state.updated_at = record.started_at
    saveState(ROOT, state)
    console.log(`Phase unlocked: ${phase.id} (skill: ${phase.skill})`)
    return
  }
  assert(record.status === 'running', `phase is not running: ${phase.id}`)
  warnings.push(...artifactProblems(ROOT, phase.produces))
  if (violation(mode, warnings)) return process.exitCode = 1
  record.status = 'completed'
  record.completed_at = new Date().toISOString()
  state.history.push({ event: 'complete', phase: phase.id, at: record.completed_at })
  state.updated_at = record.completed_at
  saveState(ROOT, state)
  console.log(`Phase completed: ${phase.id}`)
}

try { main() } catch (error) { if (error.code === 'ENOENT') fail(error.message); else fail(error.message) }
