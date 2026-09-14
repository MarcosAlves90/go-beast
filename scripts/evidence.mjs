#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { checkTrace } from './conformance.mjs'

const SCHEMA_VERSION = 2
const HASH_PATTERN = /^[a-f0-9]{64}$/
const EVENT_TYPES = new Set([
  'skill_invoked',
  'artifact',
  'approval',
  'red',
  'implementation',
  'green',
  'review',
  'finish',
  'command',
  'phase',
])
const TRUST_STATUSES = new Set(['declared', 'observed', 'verified', 'failed'])
const ACTOR_KINDS = new Set(['agent', 'human', 'tool'])
const TASK_KINDS = new Set(['feature', 'bugfix', 'refactor', 'docs'])
const ADAPTERS = {
  'claude-code': 'go-beast-claude-code',
  codex: 'go-beast-codex',
  copilot: 'go-beast-copilot',
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function rejectUnknownKeys(value, allowed, label, errors) {
  if (!isObject(value)) return
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} contains unsupported field: ${key}`)
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().flatMap(key => {
    if (value[key] === undefined) return []
    return [[key, stableValue(value[key])]]
  }))
}

function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hashEvent(event) {
  const content = { ...event }
  delete content.event_hash
  return sha256(stableJson(content))
}

function safeArtifactPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return false
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false
  const segments = value.replaceAll('\\', '/').split('/')
  return !segments.includes('..')
}

function validateSource(source, label, errors) {
  if (!isObject(source)) {
    errors.push(`${label} must be an object`)
    return
  }
  rejectUnknownKeys(source, new Set(['harness', 'adapter']), label, errors)
  if (!Object.hasOwn(ADAPTERS, source.harness)) errors.push(`${label}.harness is unsupported: ${source.harness ?? 'missing'}`)
  if (typeof source.adapter !== 'string' || source.adapter.length === 0) {
    errors.push(`${label}.adapter is required`)
  } else if (ADAPTERS[source.harness] && source.adapter !== ADAPTERS[source.harness]) {
    errors.push(`unsupported adapter: ${source.adapter} for harness ${source.harness}`)
  }
}

function validateHash(value, label, errors) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) errors.push(`${label} must be a lowercase SHA-256 hash`)
}

function validateActor(actor, label, errors) {
  if (!isObject(actor)) {
    errors.push(`${label} must be an object`)
    return
  }
  rejectUnknownKeys(actor, new Set(['kind', 'id']), label, errors)
  if (!ACTOR_KINDS.has(actor.kind) || typeof actor.id !== 'string' || actor.id.length === 0) errors.push(`${label} is invalid`)
}

function validateCommand(command, label, errors) {
  if (!isObject(command)) {
    errors.push(`${label} must be an object`)
    return
  }
  rejectUnknownKeys(command, new Set(['argv', 'cwd', 'exit_code', 'stdout_sha256', 'stderr_sha256']), label, errors)
  if (!Array.isArray(command.argv) || command.argv.some(item => typeof item !== 'string')) errors.push(`${label}.argv must be an array of strings`)
  if (typeof command.cwd !== 'string' || command.cwd.length === 0) errors.push(`${label}.cwd is required`)
  if (!Number.isInteger(command.exit_code)) errors.push(`${label}.exit_code must be an integer`)
  validateHash(command.stdout_sha256, `${label}.stdout_sha256`, errors)
  validateHash(command.stderr_sha256, `${label}.stderr_sha256`, errors)
  if (Object.hasOwn(command, 'stdout') || Object.hasOwn(command, 'stderr')) errors.push(`${label} must store output digests, not raw command output`)
}

function validateArtifact(artifact, label, errors) {
  if (!isObject(artifact)) {
    errors.push(`${label} must be an object`)
    return
  }
  rejectUnknownKeys(artifact, new Set(['path', 'sha256', 'kind']), label, errors)
  if (!safeArtifactPath(artifact.path)) errors.push(`${label}.path is not a safe repository-relative path`)
  validateHash(artifact.sha256, `${label}.sha256`, errors)
  if (typeof artifact.kind !== 'string' || artifact.kind.length === 0) errors.push(`${label}.kind is required`)
}

function validateProvenance(provenance, label, errors) {
  if (!isObject(provenance)) {
    errors.push(`${label} must be an object`)
    return
  }
  rejectUnknownKeys(provenance, new Set(['command', 'artifact']), label, errors)
  if (Object.hasOwn(provenance, 'command')) validateCommand(provenance.command, `${label}.command`, errors)
  if (Object.hasOwn(provenance, 'artifact')) validateArtifact(provenance.artifact, `${label}.artifact`, errors)
}

function auditLedger(events) {
  const trust = { declared: 0, observed: 0, verified: 0, failed: 0 }
  const provenance = { commands: 0, artifacts: 0 }
  const types = {}
  for (const event of events) {
    if (!isObject(event)) continue
    if (Object.hasOwn(trust, event.status)) trust[event.status] += 1
    if (EVENT_TYPES.has(event.type)) types[event.type] = (types[event.type] ?? 0) + 1
    if (isObject(event.provenance)) {
      if (Object.hasOwn(event.provenance, 'command')) provenance.commands += 1
      if (Object.hasOwn(event.provenance, 'artifact')) provenance.artifacts += 1
    }
  }
  return { event_count: events.length, trust, provenance, types }
}

function toTrace(ledger) {
  return {
    version: 1,
    kind: ledger.kind ?? 'feature',
    source: ledger.source,
    events: ledger.events.map(event => ({ ...event.payload, type: event.type })),
  }
}

function validateLedger(ledger, { protocol = false } = {}) {
  const errors = []
  const events = Array.isArray(ledger?.events) ? ledger.events : []
  if (!isObject(ledger)) {
    errors.push('ledger must be a JSON object')
    return { errors, audit: auditLedger([]), conformance: null }
  }
  rejectUnknownKeys(ledger, new Set(['schema_version', 'ledger_id', 'task_id', 'kind', 'created_at', 'source', 'events']), 'ledger', errors)
  if (ledger.schema_version !== SCHEMA_VERSION) errors.push(`unsupported evidence schema version: ${ledger.schema_version ?? 'missing'}`)
  if (typeof ledger.ledger_id !== 'string' || ledger.ledger_id.length === 0) errors.push('ledger_id is required')
  if (typeof ledger.task_id !== 'string' || ledger.task_id.length === 0) errors.push('task_id is required')
  if (ledger.kind !== undefined && !TASK_KINDS.has(ledger.kind)) errors.push(`unsupported task kind: ${ledger.kind}`)
  if (ledger.created_at !== undefined && (typeof ledger.created_at !== 'string' || Number.isNaN(Date.parse(ledger.created_at)))) errors.push('created_at must be an ISO timestamp')
  validateSource(ledger.source, 'source', errors)
  if (!Array.isArray(ledger.events)) errors.push('events must be an array')

  const ids = new Set()
  let previousHash = null
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    const label = `event ${index + 1}`
    if (!isObject(event)) {
      errors.push(`${label} must be an object`)
      continue
    }
    rejectUnknownKeys(event, new Set(['event_id', 'sequence', 'type', 'status', 'task_id', 'source', 'actor', 'payload', 'provenance', 'recorded_at', 'previous_hash', 'event_hash']), label, errors)
    if (typeof event.event_id !== 'string' || event.event_id.length === 0) errors.push(`${label}.event_id is required`)
    else if (ids.has(event.event_id)) errors.push(`duplicate event_id: ${event.event_id}`)
    else ids.add(event.event_id)
    if (event.sequence !== index + 1) errors.push(`${label} sequence must be ${index + 1}`)
    if (!EVENT_TYPES.has(event.type)) errors.push(`${label}.type is unsupported: ${event.type ?? 'missing'}`)
    if (!TRUST_STATUSES.has(event.status)) errors.push(`${label}.status is unsupported: ${event.status ?? 'missing'}`)
    if (event.task_id !== ledger.task_id) errors.push(`${label}.task_id does not match ledger task_id`)
    validateSource(event.source, `${label}.source`, errors)
    if (stableJson(event.source) !== stableJson(ledger.source)) errors.push(`${label}.source does not match ledger source`)
    validateActor(event.actor, `${label}.actor`, errors)
    if (!isObject(event.payload)) errors.push(`${label}.payload must be an object`)
    validateProvenance(event.provenance, `${label}.provenance`, errors)
    if (typeof event.recorded_at !== 'string' || Number.isNaN(Date.parse(event.recorded_at))) errors.push(`${label}.recorded_at must be an ISO timestamp`)
    if (event.previous_hash !== previousHash) errors.push(`${label}.previous_hash does not match the preceding event`)
    if (event.previous_hash !== null) validateHash(event.previous_hash, `${label}.previous_hash`, errors)
    if (typeof event.event_hash !== 'string' || !HASH_PATTERN.test(event.event_hash)) {
      errors.push(`${label}.event_hash must be a lowercase SHA-256 hash`)
    } else if (hashEvent(event) !== event.event_hash) {
      errors.push(`event hash mismatch at sequence ${event.sequence ?? index + 1}`)
    }
    previousHash = typeof event.event_hash === 'string' ? event.event_hash : null
  }

  const audit = auditLedger(events)
  let conformance = null
  if (protocol && errors.length === 0) conformance = checkTrace(toTrace(ledger), ledger.kind ?? 'feature')
  return { errors, audit, conformance }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`)
  }
}

function writeJsonAtomic(filePath, value) {
  const target = path.resolve(filePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, target)
}

function requireOption(options, name) {
  if (!options[name]) throw new Error(`--${name} is required`)
  return options[name]
}

function assertAdapter(harness, adapter) {
  if (!Object.hasOwn(ADAPTERS, harness)) throw new Error(`unsupported harness: ${harness ?? 'missing'}`)
  if (adapter !== ADAPTERS[harness]) throw new Error(`unsupported adapter: ${adapter ?? 'missing'} for harness ${harness}`)
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = [...argv]
  const command = args.shift() ?? 'help'
  const options = {
    command,
    output: null,
    ledger: null,
    event: null,
    task: null,
    harness: null,
    adapter: null,
    ledgerId: null,
    kind: null,
    protocol: false,
    format: 'text',
  }
  while (args.length) {
    const arg = args.shift()
    if (arg === '--protocol') options.protocol = true
    else if (['--output', '--ledger', '--event', '--task', '--harness', '--adapter', '--ledger-id', '--kind', '--format'].includes(arg)) {
      const value = args.shift()
      if (!value) throw new Error(`${arg} requires a value`)
      const key = arg === '--ledger-id' ? 'ledgerId' : arg.slice(2)
      options[key] = value
    } else if (arg === '--help' || arg === '-h') options.command = 'help'
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!['text', 'json'].includes(options.format)) throw new Error(`unsupported output format: ${options.format}`)
  return options
}

function initLedger(options) {
  const output = requireOption(options, 'output')
  const task = requireOption(options, 'task')
  const harness = requireOption(options, 'harness')
  const adapter = requireOption(options, 'adapter')
  assertAdapter(harness, adapter)
  if (options.kind && !TASK_KINDS.has(options.kind)) throw new Error(`unsupported task kind: ${options.kind}`)
  const safeId = (options.ledgerId ?? `${task}-${Date.now()}`).replace(/[^A-Za-z0-9._:-]+/g, '-')
  const ledger = {
    schema_version: SCHEMA_VERSION,
    ledger_id: safeId,
    task_id: task,
    ...(options.kind ? { kind: options.kind } : {}),
    source: { harness, adapter },
    created_at: new Date().toISOString(),
    events: [],
  }
  writeJsonAtomic(output, ledger)
  return { schema_version: SCHEMA_VERSION, command: 'init', ledger: path.resolve(output), ledger_id: ledger.ledger_id, task_id: task, source: ledger.source }
}

function appendEvent(options) {
  const ledgerPath = requireOption(options, 'ledger')
  const eventPath = requireOption(options, 'event')
  const ledger = readJson(ledgerPath, 'ledger')
  const current = validateLedger(ledger)
  if (current.errors.length) throw new Error(`cannot append to invalid ledger: ${current.errors.join('; ')}`)
  const input = readJson(eventPath, 'event')
  if (!isObject(input)) throw new Error('event must be a JSON object')
  for (const field of ['event_id', 'sequence', 'task_id', 'source', 'previous_hash', 'event_hash']) {
    if (Object.hasOwn(input, field)) throw new Error(`event append does not accept ${field}; it is assigned by the ledger`)
  }
  if (!EVENT_TYPES.has(input.type)) throw new Error(`unsupported event type: ${input.type ?? 'missing'}`)
  if (!TRUST_STATUSES.has(input.status)) throw new Error(`unsupported trust status: ${input.status ?? 'missing'}`)
  const sequence = ledger.events.length + 1
  const event = {
    event_id: `${ledger.ledger_id}:${sequence}`,
    sequence,
    type: input.type,
    status: input.status,
    task_id: ledger.task_id,
    source: ledger.source,
    actor: input.actor,
    payload: input.payload ?? {},
    provenance: input.provenance ?? {},
    recorded_at: input.recorded_at ?? new Date().toISOString(),
    previous_hash: ledger.events.length ? ledger.events[ledger.events.length - 1].event_hash : null,
  }
  event.event_hash = hashEvent(event)
  const next = { ...ledger, events: [...ledger.events, event] }
  const result = validateLedger(next)
  if (result.errors.length) throw new Error(`event is invalid: ${result.errors.join('; ')}`)
  writeJsonAtomic(ledgerPath, next)
  return { schema_version: SCHEMA_VERSION, command: 'append', ledger: path.resolve(ledgerPath), event }
}

function verifyLedger(options) {
  const ledgerPath = requireOption(options, 'ledger')
  const ledger = readJson(ledgerPath, 'ledger')
  const result = validateLedger(ledger, { protocol: options.protocol })
  const valid = result.errors.length === 0 && (!options.protocol || Boolean(result.conformance?.passed))
  return {
    schema_version: SCHEMA_VERSION,
    command: 'verify',
    valid,
    event_count: result.audit.event_count,
    errors: result.errors,
    audit: result.audit,
    conformance: result.conformance,
  }
}

function auditLedgerCommand(options) {
  const ledgerPath = requireOption(options, 'ledger')
  const ledger = readJson(ledgerPath, 'ledger')
  const result = validateLedger(ledger)
  return {
    schema_version: SCHEMA_VERSION,
    command: 'audit',
    valid: result.errors.length === 0,
    event_count: result.audit.event_count,
    trust: result.audit.trust,
    provenance: result.audit.provenance,
    types: result.audit.types,
    errors: result.errors,
  }
}

function printResult(result, format) {
  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  if (result.command === 'init') console.log(`Evidence ledger initialized: ${result.ledger}`)
  else if (result.command === 'append') console.log(`Evidence event appended: ${result.event.event_id}`)
  else console.log(`Evidence ${result.command}: ${result.valid ? 'PASS' : 'FAIL'} (${result.event_count} events)`)
  if (result.errors?.length) console.error(result.errors.join('\n'))
  if (result.conformance && !result.conformance.passed) console.error(result.conformance.violations.join('\n'))
}

function help() {
  console.log('Usage: go-beast evidence <init|append|verify|audit> [options]')
  console.log('  init --output PATH --task ID --harness claude-code|codex|copilot --adapter ID [--kind KIND]')
  console.log('  append --ledger PATH --event PATH')
  console.log('  verify --ledger PATH [--protocol] [--format text|json]')
  console.log('  audit --ledger PATH [--format text|json]')
}

function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
    let result
    if (options.command === 'help') {
      help()
      return
    }
    if (options.command === 'init') result = initLedger(options)
    else if (options.command === 'append') result = appendEvent(options)
    else if (options.command === 'verify') result = verifyLedger(options)
    else if (options.command === 'audit') result = auditLedgerCommand(options)
    else throw new Error(`unknown evidence command: ${options.command}`)
    printResult(result, options.format)
    if (result.valid === false) process.exitCode = 1
  } catch (error) {
    const format = options?.format ?? (argv.includes('--format') && argv[argv.indexOf('--format') + 1] === 'json' ? 'json' : 'text')
    const result = { schema_version: SCHEMA_VERSION, valid: false, errors: [error.message] }
    if (format === 'json') console.log(JSON.stringify(result, null, 2))
    else console.error(`Evidence command failed: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()

export { hashEvent, main, validateLedger }
