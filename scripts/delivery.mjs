#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const KINDS = new Set(['feature', 'bugfix', 'refactor', 'docs'])
const SURFACES = new Set(['agnostic', 'backend', 'frontend', 'full'])
const MODES = new Set(['strict', 'warn', 'off'])

function fail(message, code = 2) {
  console.error(`Delivery command failed: ${message}`)
  process.exit(code)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const command = args.shift() ?? 'help'
  const options = {
    command,
    root: process.cwd(),
    kind: 'feature',
    surface: 'agnostic',
    mode: 'strict',
    format: 'text',
    id: null,
    singleApproach: false,
  }

  while (args.length) {
    const arg = args.shift()
    if (arg === '--single-approach') options.singleApproach = true
    else if (['--root', '--kind', '--surface', '--mode', '--format', '--id'].includes(arg)) {
      const value = args.shift()
      if (!value) fail(`${arg} requires a value`)
      options[arg.slice(2).replace('-', '')] = value
    } else if (arg === '--help' || arg === '-h') options.command = 'help'
    else fail(`unknown option: ${arg}`)
  }

  if (!KINDS.has(options.kind)) fail(`unsupported task kind: ${options.kind}`)
  if (!SURFACES.has(options.surface)) fail(`unsupported implementation surface: ${options.surface}`)
  if (!MODES.has(options.mode)) fail(`unsupported workflow mode: ${options.mode}`)
  if (!['text', 'json'].includes(options.format)) fail(`unsupported output format: ${options.format}`)
  options.root = path.resolve(options.root)
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) fail(`project root is not a directory: ${options.root}`)
  return options
}

function artifact(filePath, sections = []) {
  return { path: filePath, type: 'file', non_empty: true, sections }
}

function phase(id, skill, dependsOn, requires, produces, transitions) {
  return {
    id,
    skill,
    depends_on: dependsOn,
    preconditions: [],
    requires,
    produces,
    transitions,
  }
}

function checkpoint(name) {
  return artifact(`.go-beast/checkpoints/${name}.md`, [`# ${name}`])
}

function implementationPhases(surface) {
  if (surface === 'full') {
    return [
      phase(
        'implement-backend',
        'go-wolf',
        ['red'],
        [artifact('SPEC.md'), checkpoint('RED')],
        [checkpoint('IMPLEMENTATION_BACKEND')],
        ['implement-frontend'],
      ),
      phase(
        'implement-frontend',
        'go-lynx',
        ['implement-backend'],
        [artifact('SPEC.md'), checkpoint('RED'), checkpoint('IMPLEMENTATION_BACKEND')],
        [checkpoint('IMPLEMENTATION_FRONTEND')],
        ['green'],
      ),
    ]
  }

  const skill = { agnostic: 'go-bee', backend: 'go-wolf', frontend: 'go-lynx' }[surface]
  const checkpointName = surface === 'agnostic' ? 'IMPLEMENTATION' : `IMPLEMENTATION_${surface.toUpperCase()}`
  return [phase(
    'implement',
    skill,
    ['red'],
    [artifact('SPEC.md'), checkpoint('RED')],
    [checkpoint(checkpointName)],
    ['green'],
  )]
}

function buildPhases(options) {
  const requirements = artifact('.go-beast/REQUIREMENTS.md', ['# Requirements'])
  const approach = artifact('.go-beast/APPROACH.md', ['# Approach'])
  const requirementsApproval = checkpoint('REQUIREMENTS_APPROVED')
  const approachApproval = checkpoint('APPROACH_APPROVED')
  const architectureArtifacts = [
    artifact('docs/architecture/task-artifacts/ADR.md'),
    artifact('docs/architecture/task-artifacts/STACK.md'),
    artifact('docs/architecture/task-artifacts/DIAGRAM.md'),
    artifact('docs/architecture/task-artifacts/CONTRACTS.md'),
  ]
  const specification = artifact('SPEC.md', ['# Behavioral Specification'])
  const red = checkpoint('RED')
  const implementation = implementationPhases(options.surface)
  const implementationIds = implementation.map(item => item.id)
  const implementationArtifacts = implementation.flatMap(item => item.produces)
  const lastImplementation = implementation.at(-1).id

  const phases = [
    phase('discover', 'go-hawk', [], [], [requirements], ['approve-requirements']),
    phase('approve-requirements', 'go-chat', ['discover'], [requirements], [requirementsApproval], ['explore']),
    phase('explore', options.singleApproach ? 'go-chat' : 'go-lark', ['approve-requirements'], [requirements, requirementsApproval], [approach], ['approve-approach']),
    phase('approve-approach', 'go-chat', ['explore'], [requirements, approach], [approachApproval], ['architecture']),
    phase('architecture', 'go-fox', ['approve-approach'], [requirements, approach, approachApproval], architectureArtifacts, ['specify']),
    phase('specify', 'go-snipe', ['architecture'], [requirements, artifact('docs/architecture/task-artifacts/CONTRACTS.md')], [specification], ['red']),
    phase('red', 'go-snipe', ['specify'], [specification], [red], [implementationIds[0]]),
    ...implementation,
    phase('green', 'go-eagle', [lastImplementation], [specification, ...implementationArtifacts], [checkpoint('GREEN')], ['spec-review']),
    phase('spec-review', 'go-tern', ['green'], [requirements, specification, checkpoint('GREEN')], [checkpoint('SPEC_REVIEW')], ['quality-review']),
    phase('quality-review', 'go-score', ['spec-review'], [checkpoint('SPEC_REVIEW'), checkpoint('GREEN')], [checkpoint('QUALITY_REVIEW')], ['finish']),
    phase('finish', 'go-owl', ['quality-review'], [checkpoint('SPEC_REVIEW'), checkpoint('QUALITY_REVIEW')], [checkpoint('FINISH')], []),
  ]

  return phases
}

function deliveryPlan(options) {
  const id = options.id ?? `delivery-${options.kind}-${options.surface}`
  return {
    schema_version: 1,
    id,
    kind: options.kind,
    surface: options.surface,
    mode: options.mode,
    policy: {
      strict: options.mode === 'strict',
      approvals: true,
      tdd: true,
      reviews: true,
      finish_gate: true,
    },
    notes: [
      'The controller coordinates skills and evidence; it does not execute substantive implementation work.',
      'Use --surface to select the implementation specialist when the task is not agent-agnostic.',
      'Generated manifests and state under .go-beast/ are disposable workflow state.',
    ],
    phases: buildPhases(options),
  }
}

function manifestFromPlan(plan) {
  return {
    schema_version: 1,
    id: plan.id,
    version: 1,
    mode: plan.mode,
    phases: plan.phases,
  }
}

function printPlan(plan, format) {
  if (format === 'json') {
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  console.log(`Delivery plan: ${plan.id}`)
  console.log(`Kind: ${plan.kind} | Surface: ${plan.surface} | Mode: ${plan.mode}`)
  console.log('Policy: approvals, red-green TDD, specification review, quality review, finish gate')
  for (const [index, item] of plan.phases.entries()) console.log(`${String(index + 1).padStart(2, '0')}. ${item.id} [${item.skill}]`)
}

function manifestPath(root, id) {
  return path.join(root, '.go-beast', 'workflows', 'manifests', `${id}.json`)
}

function assertId(id) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) fail(`id must match ^[a-z0-9][a-z0-9-]{0,63}$: ${id}`)
}

function runWorkflow(root, manifestRelativePath, command, mode, format) {
  const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'workflow.mjs')
  const args = [scriptPath, command, '--root', root, '--file', manifestRelativePath, '--mode', mode]
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (result.error) fail(`workflow engine could not start: ${result.error.message}`)
  if (result.status !== 0) {
    if (output) process.stderr.write(`${output}\n`)
    process.exit(result.status || 1)
  }
  return format === 'json' ? output : output
}

function commandPlan(options) {
  const plan = deliveryPlan(options)
  printPlan(plan, options.format)
}

function commandStart(options) {
  const id = options.id ?? `delivery-${options.kind}-${options.surface}`
  assertId(id)
  const plan = deliveryPlan({ ...options, id })
  const target = manifestPath(options.root, id)
  if (fs.existsSync(target)) fail(`delivery manifest already exists: ${path.relative(options.root, target)}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(manifestFromPlan(plan), null, 2)}\n`, { flag: 'wx' })
  const relative = path.relative(options.root, target).split(path.sep).join('/')
  const engineOutput = runWorkflow(options.root, relative, 'start', options.mode, options.format)
  const result = {
    delivery_id: id,
    manifest_path: relative,
    state_path: `.go-beast/workflows/${id}.json`,
    engine_output: engineOutput,
  }
  if (options.format === 'json') console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`Delivery started: ${id}`)
    console.log(`Manifest: ${relative}`)
    console.log(engineOutput)
  }
}

function commandEngine(options, command) {
  const id = options.id
  if (!id) fail('--id is required for delivery status or validate')
  assertId(id)
  const target = manifestPath(options.root, id)
  if (!fs.existsSync(target)) fail(`delivery manifest does not exist: ${path.relative(options.root, target)}`)
  const relative = path.relative(options.root, target).split(path.sep).join('/')
  const output = runWorkflow(options.root, relative, command, options.mode, options.format)
  if (options.format === 'json') {
    try { console.log(JSON.stringify({ delivery_id: id, command, result: JSON.parse(output) }, null, 2)) } catch { console.log(output) }
  } else console.log(output)
}

function help() {
  console.log('Usage: go-beast delivery <plan|start|status|validate> [--root PATH] [--kind feature|bugfix|refactor|docs] [--surface agnostic|backend|frontend|full] [--id ID] [--mode strict|warn|off] [--format text|json]')
}

const options = parseArgs()
if (options.command === 'help') help()
else if (options.command === 'plan') commandPlan(options)
else if (options.command === 'start') commandStart(options)
else if (options.command === 'status') commandEngine(options, 'status')
else if (options.command === 'validate') commandEngine(options, 'validate')
else fail(`unknown delivery command: ${options.command}`)
