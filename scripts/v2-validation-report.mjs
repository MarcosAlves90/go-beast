#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const REPORT_SCHEMA_VERSION = 1
const WORKFLOW_SPECS = {
  'go-skill-eval': {
    file: 'workflows/go-skill-eval.js',
    markers: ['export const meta', 'phases:', 'agent(', 'write-report'],
  },
  'go-hook-eval': {
    file: 'workflows/go-hook-eval.js',
    markers: ['export const meta', 'phases:', 'TESTS', 'expectExit', 'stop_hook_active', 'parallel', 'write-report'],
  },
}
const LIVE_HARNESSES = [
  { id: 'claude-code', cli: 'claude' },
  { id: 'codex', cli: 'codex' },
  { id: 'copilot', cli: 'copilot' },
]

function fail(message, code = 2) {
  console.error(`V2 validation report failed: ${message}`)
  process.exitCode = code
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    repo: process.cwd(),
    output: null,
    format: 'json',
    live: false,
    verify: false,
    timeoutSeconds: 120,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--repo') options.repo = argv[++index] ?? ''
    else if (arg === '--output') options.output = argv[++index] ?? ''
    else if (arg === '--format') options.format = argv[++index] ?? ''
    else if (arg === '--timeout-seconds') options.timeoutSeconds = Number(argv[++index] ?? '')
    else if (arg === '--live') options.live = true
    else if (arg === '--verify') options.verify = true
    else if (arg === '--help' || arg === '-h') return { help: true, ...options }
    else throw new Error(`unknown option: ${arg}`)
  }

  if (!['json', 'markdown'].includes(options.format)) throw new Error(`unsupported format: ${options.format}`)
  if (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 1 || options.timeoutSeconds > 3600) {
    throw new Error('--timeout-seconds must be an integer from 1 to 3600')
  }
  return options
}

function help() {
  return [
    'Usage: node scripts/v2-validation-report.mjs [options]',
    '',
    '  --repo PATH                    Repository root (default: current directory)',
    '  --output PATH                 Write the report instead of stdout',
    '  --format json|markdown        Select the report projection (default: json)',
    '  --verify                      Measure npm run verify as an additional offline gate',
    '  --live                        Opt in to npm run test:live with a bounded timeout',
    '  --timeout-seconds N           Bound command execution (default: 120)',
  ].join('\n')
}

function gitValue(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  if (result.status !== 0) return null
  return result.stdout.trim() || null
}

function compactOutput(value) {
  const text = String(value ?? '').trim()
  if (text.length <= 800) return text
  return `…${text.slice(-800)}`
}

function commandResult({ command, args, cwd, env, timeoutSeconds }) {
  const startedAt = Date.now()
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: timeoutSeconds * 1000,
    killSignal: 'SIGTERM',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const timedOut = result.error?.code === 'ETIMEDOUT'
  const status = timedOut
    ? 'timeout'
    : result.status === 0
      ? 'passed'
      : 'failed'
  return {
    status,
    exit_code: result.status,
    signal: result.signal ?? null,
    duration_ms: Date.now() - startedAt,
    command: [command, ...args].join(' '),
    stdout_tail: compactOutput(result.stdout),
    stderr_tail: compactOutput(result.stderr),
  }
}

function unitTestFiles(repo) {
  const directory = path.join(repo, 'tests', 'unit')
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory)
    .filter(file => file.endsWith('.test.mjs'))
    .sort()
    .map(file => path.join(directory, file))
}

function measureUnitTests(repo, timeoutSeconds) {
  const files = unitTestFiles(repo)
  if (files.length === 0) {
    return { status: 'not_available', files: [], command: 'node --test', exit_code: null, duration_ms: 0 }
  }
  return {
    ...commandResult({
      command: process.execPath,
      args: ['--test', ...files],
      cwd: repo,
      env: process.env,
      timeoutSeconds,
    }),
    files: files.map(file => path.relative(repo, file)),
  }
}

function commandAvailable(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' })
  return result.status === 0 && Boolean(result.stdout.trim())
}

function inventoryLiveMatrix(repo) {
  const suites = LIVE_HARNESSES.map(harness => {
    const suitePath = path.join(repo, 'tests', harness.id)
    const present = fs.existsSync(suitePath)
    const files = present
      ? fs.readdirSync(suitePath).filter(file => file.endsWith('.sh')).sort()
      : []
    return {
      id: harness.id,
      cli: harness.cli,
      suite_present: present && files.length > 0,
      suite_files: files.map(file => `tests/${harness.id}/${file}`),
      cli_available: commandAvailable(harness.cli),
    }
  })
  return {
    status: suites.every(suite => suite.suite_present) ? 'passed' : 'failed',
    suites,
  }
}

function measureLiveExecution(repo, options) {
  if (!options.live) {
    return {
      status: 'not_requested',
      enabled: false,
      command: 'npm run test:live',
      exit_code: null,
      duration_ms: 0,
    }
  }
  return {
    ...commandResult({
      command: 'npm',
      args: ['run', 'test:live'],
      cwd: repo,
      env: { ...process.env, GO_BEAST_RUN_LIVE_AGENT_TESTS: '1' },
      timeoutSeconds: options.timeoutSeconds,
    }),
    enabled: true,
  }
}

function evaluateWorkflow(repo, name, spec) {
  const filePath = path.join(repo, spec.file)
  if (!fs.existsSync(filePath)) {
    return {
      source: spec.file,
      structural_status: 'failed',
      missing: ['source file'],
      execution_status: 'not_measured',
      execution_reason: 'The workflow source is unavailable.',
    }
  }
  const source = fs.readFileSync(filePath, 'utf8')
  const missing = spec.markers.filter(marker => !source.includes(marker))
  return {
    source: spec.file,
    structural_status: missing.length === 0 ? 'passed' : 'failed',
    markers_checked: spec.markers,
    missing,
    execution_status: 'not_measured',
    execution_reason: `${name} requires an agent workflow runtime and is outside the deterministic offline report.`,
  }
}

function buildReport(options) {
  const repo = path.resolve(options.repo)
  if (!fs.existsSync(path.join(repo, 'package.json'))) throw new Error(`repository does not contain package.json: ${repo}`)

  const deterministic = {
    unit_tests: measureUnitTests(repo, options.timeoutSeconds),
    verify: options.verify
      ? commandResult({
          command: 'npm',
          args: ['run', 'verify'],
          cwd: repo,
          env: process.env,
          timeoutSeconds: options.timeoutSeconds,
        })
      : { status: 'not_requested', command: 'npm run verify', exit_code: null, duration_ms: 0 },
  }
  const inventory = inventoryLiveMatrix(repo)
  const liveExecution = measureLiveExecution(repo, options)
  const workflowEvals = Object.fromEntries(
    Object.entries(WORKFLOW_SPECS).map(([name, spec]) => [name, evaluateWorkflow(repo, name, spec)])
  )
  const limitations = [
    'Live-agent execution is not measured unless --live is explicitly supplied; inventory presence is not runtime proof.',
    'go-skill-eval and go-hook-eval structural checks do not replace their agent-runtime execution.',
    'No statement, branch, mutation, or LLM quality score is inferred from this report.',
  ]
  if (liveExecution.status === 'timeout') limitations.push('The requested live-agent command exceeded its timeout and is recorded as timeout, not pass.')
  if (deterministic.verify.status === 'failed' || deterministic.verify.status === 'timeout') limitations.push('The requested npm run verify measurement did not complete successfully.')

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    kind: 'go_beast_v2_evaluation_report',
    captured_at: new Date().toISOString(),
    repository: {
      root: repo,
      branch: gitValue(repo, ['branch', '--show-current']),
      commit: gitValue(repo, ['rev-parse', 'HEAD']),
      version: JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version,
    },
    deterministic,
    live_matrix: {
      inventory,
      execution: liveExecution,
    },
    workflow_evals: workflowEvals,
    limitations,
  }
}

function statusLabel(status) {
  return String(status).toUpperCase()
}

function renderMarkdown(report) {
  const lines = [
    '# Go Beast v2 evaluation report',
    '',
    `Captured: ${report.captured_at}`,
    `Repository: ${report.repository.branch ?? 'detached'} at ${report.repository.commit ?? 'unknown'}`,
    `Version: ${report.repository.version}`,
    '',
    '## Deterministic evidence',
    '',
    `- Unit tests: **${statusLabel(report.deterministic.unit_tests.status)}** (${report.deterministic.unit_tests.files.length} files).`,
    `- Full npm run verify: **${statusLabel(report.deterministic.verify.status)}**.`,
    '',
    '## Live-agent matrix',
    '',
    `- Inventory: **${statusLabel(report.live_matrix.inventory.status)}** (${report.live_matrix.inventory.suites.length}/3 suites present).`,
    `- Execution: **${statusLabel(report.live_matrix.execution.status)}**; this status is not a pass unless the command completed successfully.`,
    '',
    '| Harness | Suite | CLI |',
    '| --- | --- | --- |',
    ...report.live_matrix.inventory.suites.map(suite => `| ${suite.id} | ${suite.suite_present ? 'present' : 'missing'} | ${suite.cli_available ? 'available' : 'absent'} |`),
    '',
    '## Workflow evaluations',
    '',
    '| Workflow | Structural source | Agent-runtime execution |',
    '| --- | --- | --- |',
    ...Object.entries(report.workflow_evals).map(([name, evaluation]) => `| ${name} | ${statusLabel(evaluation.structural_status)} | ${statusLabel(evaluation.execution_status)} |`),
    '',
    '## Limitations',
    '',
    ...report.limitations.map(item => `- ${item}`),
    '',
  ]
  return lines.join('\n')
}

function writeReport(report, options) {
  const content = options.format === 'markdown' ? renderMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`
  if (!options.output) {
    process.stdout.write(content)
    return
  }
  const output = path.resolve(options.output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, content)
  process.stdout.write(JSON.stringify({ output, format: options.format, status: 'written' }) + '\n')
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      console.log(help())
      return
    }
    writeReport(buildReport(options), options)
  } catch (error) {
    fail(error.message)
  }
}

main()

export { buildReport, renderMarkdown }
