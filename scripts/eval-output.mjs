import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const GO_BEAST_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_EVAL_KEEP_RUNS = 10

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function readGoBeastVersion(repoRoot = GO_BEAST_REPO_ROOT) {
  const packageJsonPath = path.join(repoRoot, 'package.json')
  const raw = fs.readFileSync(packageJsonPath, 'utf8')
  return JSON.parse(raw).version
}

export function formatEvalRunId(workflowName, date = new Date()) {
  const timestamp = [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join('') + '-' + [
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
  ].join('')

  return `${workflowName}-${timestamp}`
}

export function getEvalRetentionLimit() {
  const parsed = Number.parseInt(process.env.EVAL_KEEP_RUNS ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_EVAL_KEEP_RUNS
  return parsed
}

export function writeEvalOutputFile({
  workflowName,
  outputDir,
  summary,
  inputs,
  meta,
  detail,
  startedAtMs,
  keepRuns = getEvalRetentionLimit(),
  log = () => {},
}) {
  const runDate = new Date()
  const runId = formatEvalRunId(workflowName, runDate)
  const timestamp = runDate.toISOString()
  const durationMs = Math.max(0, Date.now() - startedAtMs)
  const payload = {
    schema_version: 1,
    workflow: workflowName,
    run_id: runId,
    timestamp,
    duration_ms: durationMs,
    summary,
    inputs,
    meta,
    detail,
  }

  fs.mkdirSync(outputDir, { recursive: true })

  const existing = fs.readdirSync(outputDir)
    .filter(name => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))

  const keepExisting = Math.max(0, keepRuns - 1)
  const stale = existing.slice(0, Math.max(0, existing.length - keepExisting))

  for (const name of stale) {
    const filePath = path.join(outputDir, name)
    try {
      fs.rmSync(filePath, { force: true })
    } catch (error) {
      log(`WARNING: failed to remove stale eval output ${filePath}: ${error.message}`)
    }
  }

  const filePath = path.join(outputDir, `${runId}.json`)
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  try {
    const written = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const validationErrors = []
    if (written.schema_version !== 1) validationErrors.push('schema_version !== 1')
    if (written.workflow !== workflowName) validationErrors.push('workflow mismatch')
    if (written.run_id !== runId) validationErrors.push('run_id mismatch')
    if (written.timestamp !== timestamp) validationErrors.push('timestamp mismatch')
    if (typeof written.duration_ms !== 'number' || !Number.isFinite(written.duration_ms) || written.duration_ms < 0) {
      validationErrors.push('duration_ms is not a non-negative number')
    }
    if (validationErrors.length > 0) {
      log(`WARNING: eval output validation failed for ${filePath}: ${validationErrors.join(', ')}`)
    }
  } catch (error) {
    log(`WARNING: failed to validate eval output ${filePath}: ${error.message}`)
  }

  return { filePath, runId, timestamp, durationMs, payload }
}

export function writeMarkdownOutputFile({
  filePath,
  content,
  log = () => {},
}) {
  const normalizedContent = content.endsWith('\n') ? content : `${content}\n`

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, normalizedContent, 'utf8')

  try {
    const written = fs.readFileSync(filePath, 'utf8')
    if (written !== normalizedContent) {
      log(`WARNING: markdown output validation failed for ${filePath}: content mismatch`)
    }
  } catch (error) {
    log(`WARNING: failed to validate markdown output ${filePath}: ${error.message}`)
  }

  return { filePath, bytes: Buffer.byteLength(normalizedContent, 'utf8') }
}
