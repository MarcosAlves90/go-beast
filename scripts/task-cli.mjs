#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildRegistry } from './capabilities.mjs'
import { getAdapter, loadAdapterManifest } from './adapters.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const V1_NAMESPACES = ['capabilities', 'conformance', 'context', 'delivery', 'doctor', 'evidence', 'integration', 'workflow']
const FORMATS = new Set(['text', 'json'])
const KINDS = new Set(['feature', 'bugfix', 'refactor', 'docs'])
const SURFACES = new Set(['agnostic', 'backend', 'frontend', 'full'])
const MODES = new Set(['strict', 'warn', 'off'])

function fail(message, code = 1) {
  throw Object.assign(new Error(message), { exitCode: code })
}

function assertId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) fail(`task ID must match ^[a-z0-9][a-z0-9-]{0,63}$: ${value}`, 2)
  return value
}

function resolveRoot(value) {
  const root = path.resolve(value ?? process.cwd())
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`project root is not a directory: ${root}`, 2)
  return root
}

function relativePath(root, target) {
  const relative = path.relative(root, target).split(path.sep).join('/')
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) fail(`path escapes project root: ${target}`, 2)
  return relative
}

function taskPath(root, taskId) {
  return path.join(root, '.go-beast', 'tasks', `${taskId}.json`)
}

function planPath(root, taskId) {
  return path.join(root, '.go-beast', 'tasks', taskId, 'plan.json')
}

function manifestPath(root, taskId) {
  return path.join(root, '.go-beast', 'workflows', 'manifests', `${taskId}.json`)
}

function statePath(root, taskId) {
  return path.join(root, '.go-beast', 'workflows', `${taskId}.json`)
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`)
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, filePath)
}

function loadTask(root, taskId) {
  const filePath = taskPath(root, assertId(taskId))
  if (!fs.existsSync(filePath)) fail(`task does not exist: ${taskId}`, 2)
  return { filePath, task: readJson(filePath, 'task record') }
}

function updateTask(root, taskId, patch) {
  const current = loadTask(root, taskId)
  const task = { ...current.task, ...patch, updated_at: new Date().toISOString() }
  writeJson(current.filePath, task)
  return task
}

function createTask(root, options) {
  const taskId = assertId(options.id)
  const filePath = taskPath(root, taskId)
  if (fs.existsSync(filePath)) fail(`task already exists: ${taskId}`, 2)
  if (options.agent) {
    const adapter = getAdapter(loadAdapterManifest(REPO), options.agent)
    if (!adapter) fail(`unsupported agent: ${options.agent}`, 2)
  }
  const now = new Date().toISOString()
  const task = {
    schema_version: 2,
    kind: 'task',
    task_id: taskId,
    status: 'initialized',
    agent: options.agent ?? null,
    profile: options.profile ?? null,
    adapter: options.agent ? getAdapter(loadAdapterManifest(REPO), options.agent)?.id ?? null : null,
    paths: {
      task_record: relativePath(root, filePath),
      plan: null,
      manifest: null,
      state: null,
    },
    compatibility: {
      v1_namespaces: [...V1_NAMESPACES],
      v2_facade: true,
    },
    created_at: now,
    updated_at: now,
  }
  writeJson(filePath, task)
  return task
}

function parseOptionalJson(output) {
  const trimmed = String(output ?? '').trim()
  if (!trimmed) return null
  try { return JSON.parse(trimmed) } catch { return trimmed }
}

function runScript(root, scriptName, args) {
  const result = spawnSync(process.execPath, [path.join(REPO, 'scripts', scriptName), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (result.error) fail(`${scriptName} could not start: ${result.error.message}`)
  if (result.status !== 0) fail(output || `${scriptName} failed with exit code ${result.status}`)
  return output
}

function ensureTask(root, options) {
  if (!options.task && !options.id) fail('--task or --id is required', 2)
  const taskId = assertId(options.task ?? options.id)
  return loadTask(root, taskId)
}

function taskRecordOutput(command, task) {
  return { schema_version: 2, command, task_id: task.task_id, task }
}

function commandInit(options) {
  const task = createTask(options.root, options)
  emit(taskRecordOutput('init', task), options.format)
}

function commandPlan(options) {
  const { task } = ensureTask(options.root, options)
  if (!KINDS.has(options.kind)) fail(`unsupported task kind: ${options.kind}`, 2)
  if (!SURFACES.has(options.surface)) fail(`unsupported implementation surface: ${options.surface}`, 2)
  if (!MODES.has(options.mode)) fail(`unsupported workflow mode: ${options.mode}`, 2)
  const output = runScript(options.root, 'delivery.mjs', [
    'plan', '--root', options.root, '--kind', options.kind, '--surface', options.surface,
    '--mode', options.mode, '--id', task.task_id, '--format', 'json',
  ])
  const plan = parseOptionalJson(output)
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.phases)) fail('delivery planner did not return a valid plan')
  const target = planPath(options.root, task.task_id)
  writeJson(target, plan)
  const next = updateTask(options.root, task.task_id, { status: 'planned', paths: { ...task.paths, plan: relativePath(options.root, target) } })
  emit({ schema_version: 2, command: 'plan', task_id: next.task_id, plan_path: next.paths.plan, plan }, options.format)
}

function commandRun(options) {
  const { task } = ensureTask(options.root, options)
  const source = options.plan ? path.resolve(options.root, options.plan) : task.paths.plan ? path.resolve(options.root, task.paths.plan) : null
  if (!source || !fs.existsSync(source)) fail('run requires an existing --plan or a planned task', 2)
  const plan = readJson(source, 'plan')
  if (!Array.isArray(plan.phases) || !plan.id) fail('plan is missing an ID or phases', 2)
  let adapter = null
  if (options.adapter) {
    adapter = getAdapter(loadAdapterManifest(REPO), options.adapter)
    if (!adapter) fail(`unsupported adapter: ${options.adapter}`, 2)
  }
  const target = manifestPath(options.root, task.task_id)
  const manifest = {
    schema_version: 2,
    id: task.task_id,
    version: 1,
    mode: plan.mode ?? options.mode,
    route: { strategy: 'compiled' },
    phases: plan.phases,
  }
  writeJson(target, manifest)
  const manifestRelative = relativePath(options.root, target)
  const engineOutput = runScript(options.root, 'workflow.mjs', ['start', '--root', options.root, '--file', manifestRelative, '--mode', manifest.mode, '--format', 'json'])
  const next = updateTask(options.root, task.task_id, {
    status: 'running',
    adapter: adapter?.id ?? task.adapter ?? null,
    paths: { ...task.paths, manifest: manifestRelative, state: relativePath(options.root, statePath(options.root, task.task_id)) },
  })
  emit({ schema_version: 2, command: 'run', task_id: next.task_id, adapter: next.adapter, manifest_path: next.paths.manifest, state_path: next.paths.state, engine_output: parseOptionalJson(engineOutput) }, options.format)
}

function workflowCommand(options, command) {
  const { task } = ensureTask(options.root, options)
  const manifest = task.paths.manifest ? path.resolve(options.root, task.paths.manifest) : manifestPath(options.root, task.task_id)
  if (!fs.existsSync(manifest)) fail(`workflow manifest does not exist for task: ${task.task_id}`, 2)
  const output = runScript(options.root, 'workflow.mjs', [command, '--root', options.root, '--file', relativePath(options.root, manifest), '--mode', options.mode, '--format', 'json'])
  const next = command === 'resume' ? updateTask(options.root, task.task_id, { status: 'running' }) : task
  emit({ schema_version: 2, command, task_id: next.task_id, workflow: parseOptionalJson(output) }, options.format)
}

function commandStatus(options) {
  workflowCommand(options, 'status')
}

function commandResume(options) {
  workflowCommand(options, 'resume')
}

function commandExplain(options) {
  if (options.subject === 'capability') {
    const registry = buildRegistry(REPO)
    const capability = registry.capabilities.find(item => item.id === options.id)
    if (!capability) fail(`capability not found: ${options.id}`, 2)
    emit({ schema_version: 2, command: 'explain', subject: 'capability', id: capability.id, capability }, options.format)
    return
  }
  if (options.subject === 'task') {
    const { task } = loadTask(options.root, options.id)
    emit({ schema_version: 2, command: 'explain', subject: 'task', id: task.task_id, task }, options.format)
    return
  }
  fail(`unsupported explanation subject: ${options.subject}`, 2)
}

function commandAudit(options) {
  const { task } = ensureTask(options.root, options)
  const checks = {
    task_record: fs.existsSync(taskPath(options.root, task.task_id)),
    plan: Boolean(task.paths.plan && fs.existsSync(path.resolve(options.root, task.paths.plan))),
    manifest: Boolean(task.paths.manifest && fs.existsSync(path.resolve(options.root, task.paths.manifest))),
    workflow_state: Boolean(task.paths.state && fs.existsSync(path.resolve(options.root, task.paths.state))),
  }
  emit({
    schema_version: 2,
    command: 'audit',
    task_id: task.task_id,
    passed: Object.values(checks).every(Boolean),
    checks,
    claims: { execution: 'not_verified', evidence: 'structural task files only' },
  }, options.format)
}

function emit(value, format) {
  if (format === 'json') process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  else if (typeof value === 'string') process.stdout.write(`${value}\n`)
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = [...argv]
  const command = args.shift() ?? 'help'
  const options = {
    command,
    root: process.cwd(),
    id: null,
    task: null,
    agent: null,
    profile: null,
    kind: 'feature',
    surface: 'agnostic',
    mode: 'strict',
    adapter: null,
    plan: null,
    subject: null,
    format: 'text',
  }
  while (args.length) {
    const arg = args.shift()
    if (['--root', '--id', '--task', '--agent', '--profile', '--kind', '--surface', '--mode', '--adapter', '--plan', '--format'].includes(arg)) {
      const value = args.shift()
      if (!value) fail(`${arg} requires a value`, 2)
      options[arg.slice(2).replaceAll('-', '_')] = value
    } else if (arg === '--help' || arg === '-h') options.command = 'help'
    else if (!arg.startsWith('-') && options.command === 'explain' && !options.subject) options.subject = arg
    else if (!arg.startsWith('-') && options.command === 'explain' && !options.id) options.id = arg
    else fail(`unknown option: ${arg}`, 2)
  }
  options.root = resolveRoot(options.root)
  if (!FORMATS.has(options.format)) fail(`unsupported output format: ${options.format}`, 2)
  if (!['help', 'init', 'plan', 'run', 'status', 'explain', 'resume', 'audit'].includes(options.command)) fail(`unknown task command: ${options.command}`, 2)
  if (options.command === 'init' && !options.id) fail('init requires --id', 2)
  if (['status', 'resume', 'audit'].includes(options.command) && !options.task && !options.id) fail(`${options.command} requires --task`, 2)
  if (options.command === 'explain' && (!options.subject || !options.id)) fail('explain requires a subject and ID', 2)
  return options
}

function help() {
  return [
    'Usage: go-beast <init|doctor|plan|run|status|explain|resume|audit> [options]',
    '',
    '  init --id TASK [--agent NAME] [--profile NAME]   Initialize a project-local task',
    '  plan --task TASK [--kind KIND] [--surface SURFACE]  Compile a delivery plan',
    '  run --task TASK [--plan PATH] [--adapter NAME]    Start the workflow engine',
    '  status --task TASK                              Inspect workflow state',
    '  explain capability ID                           Explain registry metadata',
    '  resume --task TASK                              Recover interrupted workflow state',
    '  audit --task TASK                               Audit structural task evidence',
    '  doctor                                           Existing v1 doctor namespace remains available',
    '  --root PATH --format text|json                  Select project root and output format',
    '',
    `Compatibility namespaces remain available: ${V1_NAMESPACES.join(', ')}`,
  ].join('\n')
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv)
    if (options.command === 'help') return emit(help(), options.format)
    if (options.command === 'init') return commandInit(options)
    if (options.command === 'plan') return commandPlan(options)
    if (options.command === 'run') return commandRun(options)
    if (options.command === 'status') return commandStatus(options)
    if (options.command === 'resume') return commandResume(options)
    if (options.command === 'explain') return commandExplain(options)
    if (options.command === 'audit') return commandAudit(options)
  } catch (error) {
    console.error(`go-beast task: ${error.message}`)
    process.exitCode = error.exitCode ?? 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main()

export { main, parseArgs }
