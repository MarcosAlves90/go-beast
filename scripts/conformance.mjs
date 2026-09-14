#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const KINDS = new Set(['feature', 'bugfix', 'refactor', 'docs'])
const SUPPORTED_HARNESSES = new Set(['claude-code', 'codex', 'copilot'])
const RAW_EVENT_TYPES = new Map([
  ['skill', 'skill_invoked'],
  ['skill_invoked', 'skill_invoked'],
  ['artifact', 'artifact'],
  ['approval', 'approval'],
  ['red', 'red'],
  ['implementation', 'implementation'],
  ['green', 'green'],
  ['review', 'review'],
  ['finish', 'finish'],
])
const CANONICAL_EVENT_FIELDS = {
  skill_invoked: ['phase', 'skill'],
  artifact: ['path', 'status'],
  approval: ['kind', 'status', 'artifact'],
  red: ['status', 'evidence'],
  implementation: ['status', 'skill', 'evidence'],
  green: ['status', 'evidence'],
  review: ['kind', 'status', 'evidence'],
  finish: ['status', 'evidence'],
}
const PHASE_ALIASES = new Map([
  ['discovery', 'discover'],
  ['discover', 'discover'],
  ['solution exploration', 'explore'],
  ['solution-exploration', 'explore'],
  ['explore', 'explore'],
  ['architecture', 'architecture'],
  ['specification', 'specify'],
  ['specify', 'specify'],
])

function fail(message, format = 'text') {
  if (format === 'json') console.log(JSON.stringify({ schema_version: 1, passed: false, errors: [message], missing: [], violations: [] }, null, 2))
  else console.error(`Conformance command failed: ${message}`)
  process.exit(2)
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = [...argv]
  const command = args.shift() ?? 'help'
  const options = { command, trace: null, kind: null, format: 'text' }
  while (args.length) {
    const arg = args.shift()
    if (['--trace', '--kind', '--format'].includes(arg)) {
      const value = args.shift()
      if (!value) fail(`${arg} requires a value`, options.format)
      options[arg.slice(2)] = value
    } else if (arg === '--help' || arg === '-h') options.command = 'help'
    else fail(`unknown option: ${arg}`, options.format)
  }
  if (!['text', 'json'].includes(options.format)) fail(`unsupported output format: ${options.format}`)
  return options
}

function eventMatches(event, predicate) {
  return event && typeof event === 'object' && !Array.isArray(event) && predicate(event)
}

function firstEvent(events, predicate) {
  const index = events.findIndex(event => eventMatches(event, predicate))
  return index < 0 ? null : { index, event: events[index] }
}

function firstArtifact(events, expectedPath, predicate = () => true) {
  return firstEvent(events, event => event.type === 'artifact' && event.path === expectedPath && (event.status === 'present' || event.status === 'completed') && predicate(event))
}

function firstImplementationArtifact(events) {
  return firstEvent(events, event => event.type === 'artifact'
    && typeof event.path === 'string'
    && /^\.go-beast\/checkpoints\/IMPLEMENTATION(?:_[A-Z]+)?\.md$/.test(event.path)
    && (event.status === 'present' || event.status === 'completed'))
}

function checkTrace(trace, requestedKind = null) {
  const kind = requestedKind ?? trace.kind
  if (!KINDS.has(kind)) return { schema_version: 1, kind, passed: false, checked: [], missing: [], violations: [`unsupported task kind: ${kind}`] }
  const events = trace.events
  const checks = [
    { id: 'discovery', label: 'go-hawk discovery', find: () => firstEvent(events, event => event.type === 'skill_invoked' && event.phase === 'discover' && event.skill === 'go-hawk') },
    { id: 'requirements', label: 'requirements artifact', find: () => firstArtifact(events, '.go-beast/REQUIREMENTS.md') },
    { id: 'requirements-approval', label: 'requirements approval', find: () => firstEvent(events, event => event.type === 'approval' && event.kind === 'requirements' && event.status === 'approved') },
    { id: 'exploration', label: 'solution exploration', find: () => firstEvent(events, event => event.type === 'skill_invoked' && event.phase === 'explore' && ['go-lark', 'go-chat'].includes(event.skill)) },
    { id: 'approach', label: 'approach artifact', find: () => firstArtifact(events, '.go-beast/APPROACH.md') },
    { id: 'approach-approval', label: 'approach approval', find: () => firstEvent(events, event => event.type === 'approval' && event.kind === 'approach' && event.status === 'approved') },
    { id: 'architecture', label: 'go-fox architecture', find: () => firstEvent(events, event => event.type === 'skill_invoked' && event.phase === 'architecture' && event.skill === 'go-fox') },
    { id: 'contracts', label: 'interface contracts artifact', find: () => firstArtifact(events, 'docs/architecture/task-artifacts/CONTRACTS.md') },
    { id: 'specification', label: 'go-snipe specification', find: () => firstEvent(events, event => event.type === 'skill_invoked' && event.phase === 'specify' && event.skill === 'go-snipe') },
    { id: 'spec', label: 'behavioral specification artifact', find: () => firstArtifact(events, 'SPEC.md') },
    { id: 'red', label: 'RED evidence', find: () => firstEvent(events, event => event.type === 'red' && event.status === 'failed') },
    { id: 'red-artifact', label: 'RED checkpoint artifact', find: () => firstArtifact(events, '.go-beast/checkpoints/RED.md') },
    { id: 'implementation', label: 'implementation evidence', find: () => firstEvent(events, event => event.type === 'implementation' && event.status === 'completed') },
    { id: 'implementation-artifact', label: 'implementation checkpoint artifact', find: () => firstImplementationArtifact(events) },
    { id: 'green', label: 'GREEN evidence', find: () => firstEvent(events, event => event.type === 'green' && event.status === 'passed') },
    { id: 'green-artifact', label: 'GREEN checkpoint artifact', find: () => firstArtifact(events, '.go-beast/checkpoints/GREEN.md') },
    { id: 'spec-review', label: 'specification review', find: () => firstEvent(events, event => event.type === 'review' && event.kind === 'spec' && event.status === 'passed') },
    { id: 'spec-review-artifact', label: 'specification review artifact', find: () => firstArtifact(events, '.go-beast/checkpoints/SPEC_REVIEW.md') },
    { id: 'quality-review', label: 'quality review', find: () => firstEvent(events, event => event.type === 'review' && event.kind === 'quality' && event.status === 'passed') },
    { id: 'quality-review-artifact', label: 'quality review artifact', find: () => firstArtifact(events, '.go-beast/checkpoints/QUALITY_REVIEW.md') },
    { id: 'finish', label: 'finish evidence', find: () => firstEvent(events, event => event.type === 'finish' && event.status === 'passed') },
    { id: 'finish-artifact', label: 'finish checkpoint artifact', find: () => firstArtifact(events, '.go-beast/checkpoints/FINISH.md') },
  ]

  const found = new Map(checks.map(check => [check.id, check.find()]))
  const missing = checks.filter(check => !found.get(check.id)).map(check => ({ id: check.id, evidence: check.label }))
  const violations = []
  const indexOf = id => found.get(id)?.index ?? -1
  const requireBefore = (beforeId, afterId, message) => {
    const before = indexOf(beforeId)
    const after = indexOf(afterId)
    if (before >= 0 && after >= 0 && before >= after) violations.push(message)
  }

  const implementation = indexOf('implementation')
  if (implementation >= 0) {
    for (const id of ['requirements-approval', 'approach-approval', 'red']) {
      const gate = indexOf(id)
      if (gate < 0) violations.push(`implementation evidence is missing prerequisite: ${id}`)
      else if (gate >= implementation) violations.push(`implementation evidence precedes ${id}`)
    }
  }
  const green = indexOf('green')
  if (green >= 0 && implementation < 0) violations.push('GREEN evidence exists without implementation evidence')
  if (green >= 0 && implementation >= green) violations.push('GREEN evidence precedes implementation evidence')
  const specReview = indexOf('spec-review')
  const qualityReview = indexOf('quality-review')
  const finish = indexOf('finish')
  if (specReview >= 0 && green < 0) violations.push('specification review exists without GREEN evidence')
  if (qualityReview >= 0 && specReview < 0) violations.push('quality review exists without specification review')
  if (finish >= 0 && qualityReview < 0) violations.push('finish evidence exists without quality review')

  const orderedIds = ['discovery', 'requirements', 'requirements-approval', 'exploration', 'approach', 'approach-approval', 'architecture', 'contracts', 'specification', 'spec', 'red', 'red-artifact', 'implementation', 'implementation-artifact', 'green', 'green-artifact', 'spec-review', 'spec-review-artifact', 'quality-review', 'quality-review-artifact', 'finish', 'finish-artifact']
  for (let index = 1; index < orderedIds.length; index += 1) {
    const previous = indexOf(orderedIds[index - 1])
    const current = indexOf(orderedIds[index])
    if (previous >= 0 && current >= 0 && previous >= current) violations.push(`${orderedIds[index]} is out of order after ${orderedIds[index - 1]}`)
  }

  return {
    schema_version: 1,
    kind,
    passed: missing.length === 0 && violations.length === 0,
    checked: checks.map(check => ({ id: check.id, present: Boolean(found.get(check.id)) })),
    missing,
    violations,
  }
}

function readJson(tracePath, format, label = 'trace') {
  try { return JSON.parse(fs.readFileSync(path.resolve(tracePath), 'utf8')) } catch (error) { fail(`${label} is not readable JSON: ${error.message}`, format) }
}

function loadTrace(tracePath, format) {
  const trace = readJson(tracePath, format)
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) fail('trace must be a JSON object', format)
  if (trace.version !== 1) fail(`unsupported trace version: ${trace.version ?? 'missing'}`, format)
  if (!Array.isArray(trace.events)) fail('trace.events must be an array', format)
  if (trace.events.some(event => !event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string')) fail('every trace event must be an object with a type', format)
  return trace
}

function normalizePhase(value) {
  if (typeof value !== 'string') return value
  return PHASE_ALIASES.get(value.trim().toLowerCase()) ?? value
}

function normalizeStatus(type, value) {
  if (typeof value !== 'string') return value
  if (type === 'artifact' && value === 'created') return 'present'
  if (type === 'artifact' && value === 'complete') return 'completed'
  if (type === 'implementation' && value === 'passed') return 'completed'
  if (type === 'red' && value === 'passed') return 'failed'
  return value
}

function normalizeEvent(rawEvent, index) {
  if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) throw new Error(`raw event ${index} must be an object`)
  const rawType = typeof rawEvent.event === 'string' ? rawEvent.event : rawEvent.type
  const type = RAW_EVENT_TYPES.get(rawType)
  if (!type) throw new Error(`unsupported raw event type: ${rawType ?? 'missing'}`)

  const event = { type }
  for (const field of CANONICAL_EVENT_FIELDS[type]) {
    if (rawEvent[field] === undefined) continue
    event[field] = field === 'phase'
      ? normalizePhase(rawEvent[field])
      : field === 'status'
        ? normalizeStatus(type, rawEvent[field])
        : rawEvent[field]
  }

  const requiredFields = type === 'skill_invoked'
    ? ['phase', 'skill']
    : type === 'artifact'
      ? ['path', 'status']
      : type === 'approval'
        ? ['kind', 'status']
        : ['status']
  for (const field of requiredFields) {
    if (typeof event[field] !== 'string' || event[field].length === 0) throw new Error(`raw event ${index} (${rawType}) is missing canonical field: ${field}`)
  }
  return event
}

function normalizeTrace(rawTrace, requestedKind = null) {
  if (!rawTrace || typeof rawTrace !== 'object' || Array.isArray(rawTrace)) throw new Error('raw trace must be a JSON object')
  if (rawTrace.version !== 1) throw new Error(`unsupported raw trace version: ${rawTrace.version ?? 'missing'}`)
  if (!SUPPORTED_HARNESSES.has(rawTrace.harness)) throw new Error(`unsupported harness: ${rawTrace.harness ?? 'missing'}`)
  if (!Array.isArray(rawTrace.events)) throw new Error('raw trace.events must be an array')

  const kind = requestedKind ?? rawTrace.kind ?? 'feature'
  if (!KINDS.has(kind)) throw new Error(`unsupported task kind: ${kind}`)
  return {
    version: 1,
    kind,
    source: {
      harness: rawTrace.harness,
      adapter: 'go-beast-conformance',
    },
    events: rawTrace.events.map(normalizeEvent),
  }
}

function printVerdict(verdict, format) {
  if (format === 'json') console.log(JSON.stringify(verdict, null, 2))
  else {
    console.log(`Conformance: ${verdict.passed ? 'PASS' : 'FAIL'}`)
    console.log(`Checked evidence: ${verdict.checked.filter(item => item.present).length}/${verdict.checked.length}`)
    console.log(`Missing evidence: ${verdict.missing.length ? verdict.missing.map(item => item.id).join(', ') : 'none'}`)
    console.log(`Violations: ${verdict.violations.length ? verdict.violations.join(' | ') : 'none'}`)
  }
  if (!verdict.passed) process.exitCode = 1
}

function printNormalized(trace, format) {
  if (format === 'json') console.log(JSON.stringify(trace, null, 2))
  else console.log(`Normalized trace: ${trace.source.harness} (${trace.events.length} events)`)
}

function help() {
  console.log('Usage: go-beast conformance <normalize|check|verify> --trace PATH [--kind feature|bugfix|refactor|docs] [--format text|json]')
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.command === 'help') help()
  else if (options.command === 'normalize') {
    try {
      printNormalized(normalizeTrace(readJson(options.trace ?? fail('--trace is required', options.format), options.format, 'raw trace'), options.kind), options.format)
    } catch (error) {
      fail(error.message, options.format)
    }
  } else if (options.command === 'check' || options.command === 'verify') {
    printVerdict(checkTrace(loadTrace(options.trace ?? fail('--trace is required', options.format), options.format), options.kind), options.format)
  }
  else fail(`unknown conformance command: ${options.command}`, options.format)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()

export { checkTrace, loadTrace, main, normalizeTrace }
