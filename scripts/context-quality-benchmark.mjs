#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { collectRecords, selectRecords, validateRecord } from '../skills/go-squirrel/scripts/kb-tool.mjs'

const REPORT_SCHEMA_VERSION = 1
const CASES = [
  {
    id: 'cache-policy',
    query: 'cache benchmark',
    max_records: 2,
    expected_relevant_ids: ['cache-decision', 'cache-risk'],
    forbidden_ids: ['auth-decision', 'ui-note'],
    expected_uncertain_ids: ['cache-risk'],
  },
  {
    id: 'scoped-authorization',
    query: 'scoped token authorization',
    max_records: 1,
    expected_relevant_ids: ['auth-decision'],
    forbidden_ids: ['cache-decision', 'release-fact'],
    expected_uncertain_ids: [],
  },
  {
    id: 'release-integrity',
    query: 'release checksum',
    max_records: 1,
    expected_relevant_ids: ['release-fact'],
    forbidden_ids: ['cache-decision', 'ui-note'],
    expected_uncertain_ids: [],
  },
]

function fail(message, code = 2) {
  console.error(`Context quality benchmark failed: ${message}`)
  process.exitCode = code
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { kbRoot: null, output: null, format: 'json' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--kb-root') options.kbRoot = argv[++index] ?? ''
    else if (arg === '--output') options.output = argv[++index] ?? ''
    else if (arg === '--format') options.format = argv[++index] ?? ''
    else if (arg === '--help' || arg === '-h') return { help: true, ...options }
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!options.kbRoot) throw new Error('--kb-root is required')
  if (!['json', 'markdown'].includes(options.format)) throw new Error(`unsupported format: ${options.format}`)
  return options
}

function help() {
  return [
    'Usage: node scripts/context-quality-benchmark.mjs --kb-root PATH [options]',
    '',
    '  --kb-root PATH          Validated go-squirrel Markdown knowledge base',
    '  --output PATH          Write the report instead of stdout',
    '  --format json|markdown  Select the report projection (default: json)',
  ].join('\n')
}

function ratio(numerator, denominator) {
  if (denominator === 0) return 1
  return Math.round((numerator / denominator) * 1000) / 1000
}

function intersection(left, right) {
  const rightSet = new Set(right)
  return [...new Set(left)].filter(value => rightSet.has(value))
}

function validateInput(kbRoot, entries) {
  const validationPath = path.join(kbRoot, 'KB_VALIDATION.md')
  if (!fs.existsSync(validationPath)) throw new Error('KB_VALIDATION.md is missing')
  const validation = fs.readFileSync(validationPath, 'utf8')
  if (!/Status:\s*PASS\b/.test(validation)) throw new Error('KB validation evidence is not PASS')
  const errors = entries.items.flatMap(item => validateRecord(item.record, entries, item.path).errors ?? [])
  if (errors.length > 0) throw new Error(`KB records are invalid: ${errors.join('; ')}`)
}

function benchmarkCase(entries, definition) {
  const selection = selectRecords(entries, {
    query: definition.query,
    'max-records': definition.max_records,
  })
  const selectedIds = selection.selected.map(item => item.record.id)
  const relevant = intersection(selectedIds, definition.expected_relevant_ids)
  const forbidden = intersection(selectedIds, definition.forbidden_ids)
  const uncertain = intersection(selectedIds, definition.expected_uncertain_ids)
  const provenanceComplete = selection.selected.filter(item => Array.isArray(item.record.provenance) && item.record.provenance.length > 0).length
  const metrics = {
    recall: ratio(relevant.length, definition.expected_relevant_ids.length),
    precision: ratio(relevant.length, selectedIds.length),
    irrelevant_exclusion: forbidden.length === 0,
    uncertainty_capture: ratio(uncertain.length, definition.expected_uncertain_ids.length),
    provenance_coverage: ratio(provenanceComplete, selectedIds.length),
  }
  const passed = selectedIds.length <= definition.max_records
    && metrics.recall === 1
    && metrics.precision === 1
    && metrics.irrelevant_exclusion
    && metrics.uncertainty_capture === 1
    && metrics.provenance_coverage === 1
  return {
    id: definition.id,
    query: definition.query,
    max_records: definition.max_records,
    selected_ids: selectedIds,
    expected_relevant_ids: definition.expected_relevant_ids,
    forbidden_selected_ids: forbidden,
    expected_uncertain_ids: definition.expected_uncertain_ids,
    ...metrics,
    passed,
  }
}

function buildReport(kbRoot) {
  const root = path.resolve(kbRoot)
  const entries = collectRecords(root)
  validateInput(root, entries)
  const cases = CASES.map(definition => benchmarkCase(entries, definition))
  const average = key => ratio(cases.reduce((sum, item) => sum + (typeof item[key] === 'number' ? item[key] : item[key] ? 1 : 0), 0), cases.length)
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    kind: 'go_beast_context_quality_report',
    status: cases.every(item => item.passed) ? 'PASS' : 'FAIL',
    scope: {
      retrieval: 'local lexical selection with bounded record limits',
      fixture: 'caller-provided validated go-squirrel knowledge base',
      semantic_quality: 'not measured',
    },
    kb_root: root,
    records: entries.items.length,
    cases: {
      total: cases.length,
      passed: cases.filter(item => item.passed).length,
      failed: cases.filter(item => !item.passed).length,
      results: cases,
    },
    metrics: {
      macro_recall: average('recall'),
      macro_precision: average('precision'),
      irrelevant_exclusion_rate: average('irrelevant_exclusion'),
      uncertainty_capture_rate: average('uncertainty_capture'),
      provenance_coverage_rate: average('provenance_coverage'),
    },
    limitations: [
      'Expected IDs and forbidden IDs are deterministic fixture labels, not human-independent relevance truth.',
      'Lexical term matching does not measure semantic retrieval, model usefulness, or LLM output quality.',
      'The benchmark measures bounded selection and evidence completeness; it does not replace stale-record or workflow integration tests.',
    ],
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Go Beast context-quality baseline',
    '',
    `Status: **${report.status}**`,
    `Records: ${report.records}`,
    `Cases: ${report.cases.passed}/${report.cases.total} passed`,
    '',
    '## Metrics',
    '',
    `- Macro recall: **${report.metrics.macro_recall}**`,
    `- Macro precision: **${report.metrics.macro_precision}**`,
    `- Irrelevant exclusion: **${report.metrics.irrelevant_exclusion_rate}**`,
    `- Uncertainty capture: **${report.metrics.uncertainty_capture_rate}**`,
    `- Provenance coverage: **${report.metrics.provenance_coverage_rate}**`,
    '',
    '## Cases',
    '',
    '| Case | Query | Selected | Recall | Precision | Pass |',
    '| --- | --- | --- | ---: | ---: | --- |',
    ...report.cases.results.map(item => `| ${item.id} | ${item.query} | ${item.selected_ids.join(', ')} | ${item.recall} | ${item.precision} | ${item.passed ? 'yes' : 'no'} |`),
    '',
    '## Scope and limitations',
    '',
    `- Retrieval mode: ${report.scope.retrieval}.`,
    `- Semantic quality: **${report.scope.semantic_quality}**.`,
    ...report.limitations.map(item => `- ${item}`),
    '',
  ]
  return lines.join('\n')
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      console.log(help())
      return
    }
    const report = buildReport(options.kbRoot)
    const content = options.format === 'markdown' ? renderMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`
    if (!options.output) process.stdout.write(content)
    else {
      const output = path.resolve(options.output)
      fs.mkdirSync(path.dirname(output), { recursive: true })
      fs.writeFileSync(output, content)
      process.stdout.write(JSON.stringify({ output, format: options.format, status: report.status }) + '\n')
    }
    if (report.status !== 'PASS') process.exitCode = 1
  } catch (error) {
    fail(error.message)
  }
}

main()

export { buildReport, renderMarkdown }
