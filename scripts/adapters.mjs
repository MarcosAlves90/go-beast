#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = path.join(REPO, 'adapters', 'manifest.json')
const SCHEMA_VERSION = 2
const CONTRACT_VERSION = 2
const SUPPORTED_HARNESSES = new Set(['claude-code', 'codex', 'copilot'])
const CAPABILITIES = new Set(['configuration', 'hooks', 'install', 'lifecycle-events', 'prompt-context', 'skills', 'tool-events'])
const EVENT_KEYS = ['session_start', 'user_prompt_submit', 'stop', 'pre_tool_use', 'post_tool_use']
const EVENT_CANONICAL = new Set(['session-start', 'user-prompt-submit', 'stop', 'pre-tool-use', 'post-tool-use'])
const ADAPTER_KEYS = new Set(['id', 'harness', 'contract_version', 'capabilities', 'events', 'config_paths', 'install', 'degradation', 'compatibility', 'ownership', 'source'])

function fail(message) {
  throw new Error(message)
}

function readJson(filePath, label = 'adapter manifest') {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`)
  }
}

function isSafeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !path.posix.isAbsolute(value)
    && !value.replaceAll('\\', '/').split('/').includes('..')
}

function validateAdapterManifest(manifest, { repoRoot = null, requireSources = false } = {}) {
  const errors = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['adapter manifest must be an object']
  if (manifest.schema_version !== SCHEMA_VERSION) errors.push(`unsupported schema_version: ${manifest.schema_version}`)
  if (manifest.contract_version !== CONTRACT_VERSION) errors.push(`unsupported contract_version: ${manifest.contract_version}`)
  if (!Array.isArray(manifest.generated_from) || manifest.generated_from.length === 0 || manifest.generated_from.some(item => typeof item !== 'string' || item.length === 0)) {
    errors.push('generated_from must be a non-empty array of strings')
  }
  if (!Array.isArray(manifest.adapters) || manifest.adapters.length === 0) return [...errors, 'adapters must be a non-empty array']

  const ids = new Set()
  const harnesses = new Set()
  for (const [index, adapter] of manifest.adapters.entries()) {
    const label = `adapters[${index}]`
    if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
      errors.push(`${label} must be an object`)
      continue
    }
    for (const key of Object.keys(adapter)) if (!ADAPTER_KEYS.has(key)) errors.push(`${label} has unknown field: ${key}`)
    for (const key of ADAPTER_KEYS) if (!Object.hasOwn(adapter, key)) errors.push(`${label} is missing ${key}`)
    if (typeof adapter.id !== 'string' || !/^go-beast-[a-z0-9-]+$/.test(adapter.id ?? '')) errors.push(`${label}.id is invalid`)
    if (ids.has(adapter.id)) errors.push(`duplicate adapter ID: ${adapter.id}`)
    ids.add(adapter.id)
    if (!SUPPORTED_HARNESSES.has(adapter.harness)) errors.push(`${label}.harness is unsupported: ${adapter.harness}`)
    if (harnesses.has(adapter.harness)) errors.push(`duplicate adapter harness: ${adapter.harness}`)
    harnesses.add(adapter.harness)
    if (adapter.contract_version !== CONTRACT_VERSION) errors.push(`${label}.contract_version is unsupported`)

    if (!Array.isArray(adapter.capabilities) || adapter.capabilities.length === 0 || adapter.capabilities.some(value => typeof value !== 'string' || !CAPABILITIES.has(value))) {
      errors.push(`${label}.capabilities contains an unsupported value`)
    } else if (new Set(adapter.capabilities).size !== adapter.capabilities.length) errors.push(`${label}.capabilities contains duplicates`)

    if (!adapter.events || typeof adapter.events !== 'object' || Array.isArray(adapter.events)) {
      errors.push(`${label}.events must be an object`)
    } else {
      for (const eventKey of EVENT_KEYS) {
        const event = adapter.events[eventKey]
        if (!event || typeof event !== 'object' || typeof event.native !== 'string' || !event.native || !EVENT_CANONICAL.has(event.canonical) || typeof event.supported !== 'boolean') {
          errors.push(`${label}.events.${eventKey} is invalid`)
        }
      }
      for (const key of Object.keys(adapter.events)) if (!EVENT_KEYS.includes(key)) errors.push(`${label}.events has unknown event: ${key}`)
    }

    if (!Array.isArray(adapter.config_paths) || adapter.config_paths.length === 0 || adapter.config_paths.some(value => typeof value !== 'string' || !value)) errors.push(`${label}.config_paths must be a non-empty array of strings`)
    if (!adapter.install || typeof adapter.install !== 'object' || adapter.install.preserves_unmanaged !== true || !['claude', 'copilot'].includes(adapter.install.native_format)) errors.push(`${label}.install must declare native format and preservation`)
    if (adapter.install?.config_path !== adapter.config_paths?.[0]) errors.push(`${label}.install.config_path must match config_paths[0]`)
    if (!Array.isArray(adapter.degradation) || adapter.degradation.length === 0 || adapter.degradation.some(item => !item || typeof item.capability !== 'string' || typeof item.when !== 'string' || typeof item.behavior !== 'string')) errors.push(`${label}.degradation must contain actionable entries`)
    if (!adapter.compatibility || typeof adapter.compatibility.contract_range !== 'string' || typeof adapter.compatibility.min_node !== 'string' || adapter.compatibility.trace_version !== 1) errors.push(`${label}.compatibility is invalid`)
    if (!adapter.ownership || adapter.ownership.managed_by !== 'go-beast' || adapter.ownership.preserves_unmanaged !== true || typeof adapter.ownership.key_strategy !== 'string') errors.push(`${label}.ownership is invalid`)
    if (!isSafeRelativePath(adapter.source)) errors.push(`${label}.source must be a safe relative path`)
    else if (requireSources && repoRoot && !fs.existsSync(path.join(repoRoot, adapter.source))) errors.push(`${label}.source does not exist: ${adapter.source}`)
  }

  const orderedIds = manifest.adapters.map(item => item?.id).filter(Boolean)
  if (orderedIds.join('\n') !== [...orderedIds].sort((left, right) => left.localeCompare(right)).join('\n')) errors.push('adapter IDs must be sorted')
  return [...new Set(errors)]
}

function loadAdapterManifest(repoRoot = REPO) {
  const manifestPath = path.join(repoRoot, 'adapters', 'manifest.json')
  const manifest = readJson(manifestPath)
  const errors = validateAdapterManifest(manifest, { repoRoot, requireSources: true })
  if (errors.length) fail(`adapter manifest is invalid: ${errors.join('; ')}`)
  return manifest
}

function getAdapter(manifest, identity) {
  return manifest.adapters.find(adapter => adapter.id === identity || adapter.harness === identity) ?? null
}

function requireAdapter(manifest, identity) {
  const adapter = getAdapter(manifest, identity)
  if (!adapter) fail(`unsupported adapter: ${identity}`)
  return adapter
}

function capabilityMatrix(manifest) {
  return manifest.adapters.map(adapter => ({
    id: adapter.id,
    harness: adapter.harness,
    contract_version: adapter.contract_version,
    capabilities: [...adapter.capabilities],
    events: adapter.events,
    config_paths: [...adapter.config_paths],
    install: adapter.install,
    degradation: adapter.degradation,
    compatibility: adapter.compatibility,
    ownership: adapter.ownership,
    source: adapter.source,
  }))
}

function diagnoseAdapter(manifest, identity, requestedCapabilities = [], requestedEvents = []) {
  const adapter = requireAdapter(manifest, identity)
  const capabilities = [...new Set(requestedCapabilities.filter(Boolean))]
  const events = [...new Set(requestedEvents.filter(Boolean))]
  const unsupported = capabilities.filter(capability => !adapter.capabilities.includes(capability))
  const unsupportedEvents = events.filter(event => {
    const entry = Object.values(adapter.events).find(candidate => candidate.native === event || candidate.canonical === event)
    return !entry || entry.supported !== true
  })
  const degradation = [
    ...adapter.degradation.filter(item => unsupported.includes(item.capability)),
    ...unsupported.map(capability => ({
      capability,
      when: 'requested capability is not declared by the adapter',
      behavior: 'fall back to the harness-neutral Markdown contract and report the unsupported capability',
    })),
    ...unsupportedEvents.map(event => ({
      capability: `event:${event}`,
      when: 'requested event is not declared by the adapter',
      behavior: 'skip the native event and report a degraded lifecycle trace',
    })),
  ]
  return {
    schema_version: SCHEMA_VERSION,
    contract_version: CONTRACT_VERSION,
    adapter: adapter.id,
    harness: adapter.harness,
    passed: unsupported.length === 0 && unsupportedEvents.length === 0,
    requested: { capabilities, events },
    supported: { capabilities: adapter.capabilities, events: Object.keys(adapter.events).filter(key => adapter.events[key].supported) },
    unsupported,
    unsupported_events: unsupportedEvents,
    degradation,
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = [...argv]
  const command = args.shift() ?? 'help'
  const options = { command, repo: REPO, input: null, format: 'text', id: null, agent: null, capabilities: [], events: [] }
  while (args.length) {
    const arg = args.shift()
    if (arg === '--repo') options.repo = path.resolve(args.shift() ?? fail('--repo requires a path'))
    else if (arg === '--input') options.input = path.resolve(args.shift() ?? fail('--input requires a path'))
    else if (arg === '--format') options.format = args.shift() ?? fail('--format requires a value')
    else if (arg === '--id') options.id = args.shift() ?? fail('--id requires a value')
    else if (arg === '--agent') options.agent = args.shift() ?? fail('--agent requires a value')
    else if (arg === '--capabilities') options.capabilities = (args.shift() ?? '').split(',').map(value => value.trim()).filter(Boolean)
    else if (arg === '--events') options.events = (args.shift() ?? '').split(',').map(value => value.trim()).filter(Boolean)
    else if (arg === '--help' || arg === '-h') options.command = 'help'
    else if (!arg.startsWith('-') && options.command === 'show' && !options.id) options.id = arg
    else fail(`unknown option: ${arg}`)
  }
  if (!['help', 'validate', 'list', 'show', 'matrix', 'diagnose'].includes(options.command)) fail(`unknown adapters command: ${options.command}`)
  if (!['text', 'json'].includes(options.format)) fail(`unsupported output format: ${options.format}`)
  return options
}

function emit(value, format) {
  if (format === 'json' || typeof value !== 'string') process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  else process.stdout.write(`${value}\n`)
}

function usage() {
  return [
    'Usage: go-beast adapters <validate|list|show|matrix|diagnose> [options]',
    '',
    '  validate [--input PATH]          Validate the shared adapter manifest',
    '  list                             List adapter IDs and harnesses',
    '  show <id|harness>                Show one adapter contract',
    '  matrix                           Show the lifecycle/capability matrix',
    '  diagnose --agent NAME            Diagnose requested capabilities/events',
    '  --capabilities a,b              Capabilities to diagnose',
    '  --events a,b                    Native or canonical events to diagnose',
    '  --format text|json              Select output format',
  ].join('\n')
}

function run(options) {
  if (options.command === 'help') return emit(usage(), options.format)
  const manifest = options.input ? readJson(options.input) : loadAdapterManifest(options.repo)
  const errors = validateAdapterManifest(manifest, { repoRoot: options.input ? null : options.repo, requireSources: !options.input })
  if (errors.length) {
    emit({ schema_version: SCHEMA_VERSION, command: options.command, valid: false, errors }, options.format)
    process.exitCode = 1
    return
  }
  if (options.command === 'validate') return emit(options.format === 'json'
    ? { schema_version: SCHEMA_VERSION, command: 'validate', valid: true, count: manifest.adapters.length, adapters: manifest.adapters.map(adapter => adapter.id) }
    : `Adapter manifest valid: ${manifest.adapters.length} adapters`, options.format)
  if (options.command === 'list') return emit({ schema_version: SCHEMA_VERSION, command: 'list', adapters: manifest.adapters.map(adapter => ({ id: adapter.id, harness: adapter.harness, contract_version: adapter.contract_version })) }, options.format)
  if (options.command === 'matrix') return emit({ schema_version: SCHEMA_VERSION, command: 'matrix', adapters: capabilityMatrix(manifest) }, options.format)
  if (options.command === 'show') {
    const adapter = requireAdapter(manifest, options.id)
    return emit({ schema_version: SCHEMA_VERSION, command: 'show', adapter }, options.format)
  }
  if (options.command === 'diagnose') {
    const report = diagnoseAdapter(manifest, options.agent ?? options.id, options.capabilities, options.events)
    emit(report, options.format)
    if (!report.passed) process.exitCode = 1
  }
}

function main(argv = process.argv.slice(2)) {
  try {
    run(parseArgs(argv))
  } catch (error) {
    console.error(`go-beast adapters: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main()

export {
  CAPABILITIES,
  EVENT_KEYS,
  capabilityMatrix,
  diagnoseAdapter,
  getAdapter,
  loadAdapterManifest,
  main,
  validateAdapterManifest,
}
