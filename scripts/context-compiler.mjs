#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { collectRecords, parseSpec, resolveReference, selectRecords, validateRecord } from '../skills/go-squirrel/scripts/kb-tool.mjs'
import { parseYaml } from './transversal-rules.mjs'

const COMPILER_VERSION = '1.0.0'
const CONTEXT_SCHEMA_VERSION = 1
const MAX_NOTE_LENGTH = 500
const REVIEW_STATUSES = new Set(['draft', 'stale', 'archived'])
const REVIEW_EPISTEMIC = new Set(['inferred', 'hypothesis', 'unknown', 'disputed'])

function fail(message, code = 1) {
  throw Object.assign(new Error(message), { exitCode: code })
}

function parseArgs(argv) {
  const command = argv.shift() ?? 'help'
  const options = {}
  const values = new Set([
    'kb-root', 'workflow-file', 'phase', 'task', 'records', 'query',
    'max-records', 'max-tokens', 'output', 'format', 'packet', 'completion',
    'generated-at',
  ])
  while (argv.length > 0) {
    const token = argv.shift()
    if (!token.startsWith('--')) fail(`unexpected argument: ${token}`, 2)
    const name = token.slice(2)
    if (!values.has(name)) fail(`unknown option: --${name}`, 2)
    const value = argv.shift()
    if (value === undefined || value.startsWith('--')) fail(`--${name} requires a value`, 2)
    options[name.replaceAll('-', '_')] = value
  }
  return { command, options }
}

function required(options, name) {
  const value = options[name]
  if (value === undefined || value === '') fail(`missing required option --${name}`, 2)
  return value
}

function resolveExisting(value, label) {
  const target = path.resolve(value)
  if (!fs.existsSync(target)) fail(`${label} does not exist: ${value}`)
  return target
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
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporary, filePath)
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function estimateTokens(value) {
  return Math.ceil(String(value ?? '').length / 4)
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value) || value.includes('\0') || value.replaceAll('\\', '/').split('/').includes('..')) {
    fail(`${label} must be a safe relative path`, 2)
  }
  return value
}

function loadWorkflow(workflowFile) {
  const text = fs.readFileSync(workflowFile, 'utf8')
  try {
    return workflowFile.endsWith('.json') ? JSON.parse(text) : parseYaml(text)
  } catch (error) {
    fail(`workflow manifest is invalid: ${error.message}`)
  }
}

function loadPhase(workflowFile, phaseId) {
  const manifest = loadWorkflow(workflowFile)
  if (!manifest || !Array.isArray(manifest.phases)) fail('workflow manifest does not contain phases')
  const phase = manifest.phases.find(candidate => candidate.id === phaseId)
  if (!phase) fail(`phase is not present in workflow manifest: ${phaseId}`)
  return { manifest, phase }
}

function validationEvidence(kbRoot) {
  const relativePath = 'KB_VALIDATION.md'
  const filePath = path.join(kbRoot, relativePath)
  if (!fs.existsSync(filePath)) return { path: relativePath, status: 'MISSING', sha256: null, errors: [], warnings: [] }
  const text = fs.readFileSync(filePath, 'utf8')
  const status = /Status:\s*PASS\b/.test(text) ? 'PASS' : /Status:\s*FAIL\b/.test(text) ? 'FAIL' : 'UNKNOWN'
  const errors = [...text.matchAll(/- ERROR:\s*(.+)/g)].map(match => match[1])
  const warnings = [...text.matchAll(/- WARNING:\s*(.+)/g)].map(match => match[1])
  return { path: relativePath, status, sha256: sha256File(filePath), errors, warnings }
}

function validateKnowledgeBase(kbRoot, entries) {
  const spec = parseSpec(kbRoot)
  const errors = []
  const warnings = []
  for (const item of entries.items) {
    const result = validateRecord(item.record, entries, item.path)
    errors.push(...result.errors)
    warnings.push(...result.warnings)
  }
  if (errors.length > 0) fail(`go-squirrel records are invalid: ${errors.join('; ')}`)
  const validation = validationEvidence(kbRoot)
  if (validation.status !== 'PASS') fail(`go-squirrel validation evidence is not PASS: ${validation.status}`)
  return { spec, validation, warnings }
}

function selectionWithGraph(entries, options) {
  const requested = String(options.records ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const maxRecords = Number(options.max_records ?? 8)
  if (!Number.isInteger(maxRecords) || maxRecords < 1) fail('--max-records must be a positive integer', 2)
  const selected = selectRecords(entries, {
    records: requested.length > 0 ? requested : [],
    query: options.query ?? '',
    'max-records': maxRecords,
  }).selected
  const reasons = new Map(selected.map(item => [item.record.id, requested.includes(item.record.id) ? 'explicitly requested for the phase' : 'lexical match for the phase task']))
  const result = []
  const add = (item, reason) => {
    if (!item || result.some(existing => existing.record.id === item.record.id) || result.length >= maxRecords) return
    result.push(item)
    reasons.set(item.record.id, reason)
  }
  for (const item of selected) add(item, reasons.get(item.record.id))
  for (const item of [...result]) {
    for (const reference of item.record.references ?? []) {
      add(resolveReference(reference, entries), `local graph reference from ${item.record.id}`)
    }
  }
  return { selected: result, reasons, maxRecords }
}

function boundedRecords(selection, maxTokens) {
  const result = []
  let usedTokens = 0
  let truncated = false
  for (const item of selection.selected) {
    const record = item.record
    const sourceSummary = String(record.summary ?? '')
    const fullContent = String(record.content ?? '')
    const remainingTokens = maxTokens - usedTokens
    if (remainingTokens <= 0) {
      truncated = true
      break
    }
    const remainingChars = remainingTokens * 4
    const summary = sourceSummary.slice(0, remainingChars)
    const separator = summary.length > 0 && fullContent.length > 0 && summary.length < remainingChars ? '\n' : ''
    const contentBudget = Math.max(0, remainingChars - summary.length - separator.length)
    const excerpt = fullContent.slice(0, contentBudget)
    if (summary.length < sourceSummary.length || excerpt.length < fullContent.length) truncated = true
    const used = estimateTokens(`${summary}${separator}${excerpt}`)
    if (used <= 0) continue
    usedTokens += used
    result.push({
      id: record.id,
      path: item.path,
      title: record.title,
      reason: selection.reasons.get(record.id),
      status: record.status,
      confidence: record.confidence,
      summary,
      content_excerpt: excerpt,
      references: [...(record.references ?? [])],
      sha256: sha256File(item.filePath),
      estimated_tokens: used,
      record_type: record.record_type,
      epistemic_status: record.epistemic_status,
      provenance: Array.isArray(record.provenance) ? record.provenance : [],
    })
  }
  return { records: result, usedTokens, truncated }
}

function deriveSections(records, entries) {
  const decisions = records.filter(item => item.record_type === 'decision').map(item => ({ id: item.id, path: item.path, summary: item.summary, confidence: item.confidence }))
  const openQuestions = records
    .filter(item => item.record_type === 'hypothesis' || item.record_type === 'task' || item.epistemic_status === 'disputed' || (entries.byId.get(item.id)?.record.tags ?? []).includes('open-question'))
    .map(item => ({ id: item.id, path: item.path, question: item.summary, epistemic_status: item.epistemic_status }))
  const conflicts = records
    .filter(item => REVIEW_STATUSES.has(item.status) || REVIEW_EPISTEMIC.has(item.epistemic_status))
    .map(item => ({ id: item.id, path: item.path, reason: `review required: ${item.status}/${item.epistemic_status}` }))
  const selectedIds = new Set(records.map(item => item.id))
  const nextReads = [...new Set(records
    .flatMap(item => item.references)
    .map(reference => ({ reference, resolved: resolveReference(reference, entries) }))
    .filter(({ resolved }) => resolved && !selectedIds.has(resolved.id))
    .map(({ resolved }) => resolved.path))].sort()
  return { decisions, openQuestions, conflicts, nextReads }
}

function buildPacket(options) {
  const kbRoot = resolveExisting(required(options, 'kb_root'), 'KB root')
  const workflowFile = resolveExisting(required(options, 'workflow_file'), 'workflow manifest')
  const phaseId = required(options, 'phase')
  const task = required(options, 'task')
  const { manifest, phase } = loadPhase(workflowFile, phaseId)
  const entries = collectRecords(kbRoot)
  if (entries.items.length === 0) fail('KB contains no records')
  const { spec, validation, warnings } = validateKnowledgeBase(kbRoot, entries)
  const selection = selectionWithGraph(entries, options)
  const maxTokens = Number(options.max_tokens ?? 2500)
  if (!Number.isInteger(maxTokens) || maxTokens < 1) fail('--max-tokens must be a positive integer', 2)
  const bounded = boundedRecords(selection, maxTokens)
  const sections = deriveSections(bounded.records, entries)
  const generatedAt = options.generated_at ?? new Date().toISOString()
  return {
    kind: 'context_packet',
    schema_version: CONTEXT_SCHEMA_VERSION,
    compiler_version: COMPILER_VERSION,
    workflow_id: manifest.id,
    phase: {
      id: phase.id,
      skill: phase.skill,
      depends_on: [...(phase.depends_on ?? [])],
      requires: [...(phase.requires ?? [])],
      produces: [...(phase.produces ?? [])],
    },
    task,
    scope: 'phase-entry',
    generated_at: generatedAt,
    budget: {
      max_records: selection.maxRecords,
      max_tokens: maxTokens,
      used_records: bounded.records.length,
      used_tokens: bounded.usedTokens,
      truncated: bounded.truncated || selection.selected.length < entries.items.length,
    },
    records: bounded.records,
    decisions: sections.decisions,
    open_questions: sections.openQuestions,
    conflicts: sections.conflicts,
    unresolved: validation.errors,
    next_reads: sections.nextReads,
    validation_evidence: validation,
    provenance: {
      source: 'go-squirrel-local',
      compiler: COMPILER_VERSION,
      workflow_manifest: { path: workflowFile, sha256: sha256File(workflowFile) },
      kb_spec: { path: 'KB_SPEC.md', sha256: sha256File(path.join(kbRoot, 'KB_SPEC.md')) },
      record_hashes: Object.fromEntries(bounded.records.map(record => [record.id, record.sha256])),
      selection: {
        mode: options.records ? 'explicit-or-graph' : 'lexical-or-graph',
        query: options.query ?? null,
      },
      warnings,
    },
    completion: null,
  }
}

function verifyPacket(packet, kbRoot) {
  if (!packet || packet.kind !== 'context_packet' || packet.schema_version !== CONTEXT_SCHEMA_VERSION) fail('context packet schema is unsupported')
  const entries = collectRecords(kbRoot)
  for (const record of packet.records ?? []) {
    const item = entries.byId.get(record.id)
    if (!item) fail(`stale record missing from KB: ${record.id}`)
    const digest = sha256File(item.filePath)
    if (digest !== record.sha256) fail(`stale record digest: ${record.id}`)
  }
  const manifest = packet.provenance?.workflow_manifest
  if (!manifest || !fs.existsSync(manifest.path) || sha256File(manifest.path) !== manifest.sha256) fail('stale workflow manifest digest')
  const validation = validationEvidence(kbRoot)
  if (validation.status !== packet.validation_evidence?.status || validation.sha256 !== packet.validation_evidence?.sha256) fail('stale validation evidence digest')
  return { records: packet.records.length, status: 'PASS' }
}

function validateCompletion(completion, kbRoot) {
  if (!completion || typeof completion !== 'object' || Array.isArray(completion)) fail('completion must be a JSON object')
  for (const field of ['decisions', 'open_questions', 'validation_evidence', 'provenance']) if (!Array.isArray(completion[field])) fail(`completion.${field} must be an array`)
  for (const decision of completion.decisions) {
    if (!decision || typeof decision.id !== 'string' || typeof decision.summary !== 'string' || decision.summary.length > MAX_NOTE_LENGTH) fail('completion decisions must contain bounded id and summary')
  }
  for (const question of completion.open_questions) {
    if (!question || typeof question.id !== 'string' || typeof question.question !== 'string' || question.question.length > MAX_NOTE_LENGTH) fail('completion open questions must contain bounded id and question')
  }
  const validationEvidence = completion.validation_evidence.map(evidence => {
    if (!evidence || typeof evidence.path !== 'string' || !['PASS', 'FAIL', 'UNKNOWN'].includes(evidence.status)) fail('completion validation evidence is invalid')
    const relativePath = safeRelativePath(evidence.path, 'completion validation evidence path')
    const filePath = path.join(kbRoot, relativePath)
    if (!fs.existsSync(filePath)) fail(`completion validation evidence is missing: ${relativePath}`)
    return { path: relativePath, status: evidence.status, sha256: sha256File(filePath) }
  })
  for (const provenance of completion.provenance) {
    if (!provenance || typeof provenance.origin !== 'string' || typeof provenance.actor !== 'string' || typeof provenance.source !== 'string' || typeof provenance.captured_at !== 'string') fail('completion provenance is invalid')
  }
  return { ...completion, validation_evidence: validationEvidence, completed_at: new Date().toISOString() }
}

function runCompile(options) {
  const packet = buildPacket(options)
  const output = path.resolve(required(options, 'output'))
  writeJson(output, packet)
  console.log(JSON.stringify({ command: 'compile', packet: output, workflow_id: packet.workflow_id, phase: packet.phase.id, records: packet.budget.used_records, tokens: packet.budget.used_tokens }, null, 2))
}

function runVerify(options) {
  const kbRoot = resolveExisting(required(options, 'kb_root'), 'KB root')
  const packetPath = resolveExisting(required(options, 'packet'), 'context packet')
  const packet = readJson(packetPath, 'context packet')
  const result = verifyPacket(packet, kbRoot)
  console.log(JSON.stringify({ command: 'verify', packet: packetPath, ...result }, null, 2))
}

function runFinalize(options) {
  const kbRoot = resolveExisting(required(options, 'kb_root'), 'KB root')
  const packetPath = resolveExisting(required(options, 'packet'), 'context packet')
  const completionPath = resolveExisting(required(options, 'completion'), 'completion')
  const packet = readJson(packetPath, 'context packet')
  verifyPacket(packet, kbRoot)
  const completion = validateCompletion(readJson(completionPath, 'completion'), kbRoot)
  const output = path.resolve(required(options, 'output'))
  writeJson(output, { ...packet, scope: 'phase-completion', completion })
  console.log(JSON.stringify({ command: 'finalize', packet: output, decisions: completion.decisions.length, open_questions: completion.open_questions.length, validation: completion.validation_evidence.length }, null, 2))
}

function help() {
  console.log('Usage: go-beast context <compile|verify|finalize> [options]')
  console.log('  compile --kb-root PATH --workflow-file PATH --phase ID --task TEXT --output PATH [--records IDS] [--query TEXT] [--max-records N] [--max-tokens N] [--generated-at ISO-8601]')
  console.log('  verify --kb-root PATH --packet PATH')
  console.log('  finalize --kb-root PATH --packet PATH --completion PATH --output PATH')
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv)
  if (command === 'help') return help()
  if (command === 'compile') return runCompile(options)
  if (command === 'verify') return runVerify(options)
  if (command === 'finalize') return runFinalize(options)
  fail(`unknown context command: ${command}`, 2)
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try { main() } catch (error) { console.error(`Context command failed: ${error.message}`); process.exitCode = error.exitCode ?? 1 }
}

export { buildPacket, main, verifyPacket }
