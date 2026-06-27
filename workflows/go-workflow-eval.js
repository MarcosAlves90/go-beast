export const meta = {
  name: 'go-workflow-eval',
  description: 'Evaluates go-beast Workflow scripts: reads source via agent, runs structural checklist + LLM-as-judge for code quality, design patterns, and test coverage. Supports args.workflows filter and args.repoPath.',
  phases: [
    { title: 'Source Collection', detail: 'Reads each workflow source file via agent' },
    { title: 'Structural Eval', detail: 'Deterministic checklist per workflow' },
    { title: 'LLM Judge', detail: 'Code quality, correctness, and coverage review' },
    { title: 'Aggregation', detail: 'Consolidates results and generates report' },
  ],
}

// args.workflows — array of names to filter, e.g. ['go-skill-eval']. Default: all.
// args.repoPath  — absolute path to go-beast repo root. Falls back to process.cwd().

const WORKFLOWS = {
  'go-skill-eval': {
    description: 'Evaluates all go-* skills with structural checklist, LLM-as-judge, and adversarial A/B/C/D inputs.',
    type: 'skill-eval',
    checklist: ['SKILLS', 'skillOverrides', 'FILESYSTEM_SKILLS', 'pipeline', 'STRUCT_SCHEMA', 'JUDGE_SCHEMA', 'label', 'return', 'write-report', 'write-eval-json'],
  },
  'go-hook-eval': {
    description: 'Tests go-beast hooks with positive, negative, and edge cases including jq fallback and stop_hook_active.',
    type: 'hook-eval',
    checklist: ['TESTS', 'expectExit', 'expectOutput', 'stop_hook_active', 'parallel', 'return', 'setup', 'write-report', 'write-eval-json'],
  },
  'go-deep-analysis': {
    description: 'Performs deep multi-dimensional analysis of a codebase and produces a complete Markdown document for each dimension: architecture, security, performance, testing, documentation gaps, and dependency health.',
    type: 'analysis',
    checklist: ['DIMENSIONS', 'parallel', 'DISCOVERY_SCHEMA', 'label', 'return', 'outputDir'],
  },
}

// Extracted key elements from the workflow source — avoids passing truncated raw source to judge
const EXTRACT_SCHEMA = {
  type: 'object',
  required: ['meta_block', 'schemas', 'phases_called', 'agent_calls_sample', 'has_return', 'total_lines', 'patterns_found'],
  properties: {
    meta_block:         { type: 'string' },
    schemas:            { type: 'array', items: { type: 'string' } },
    phases_called:      { type: 'array', items: { type: 'string' } },
    agent_calls_sample: { type: 'array', items: { type: 'string' } },
    has_return:         { type: 'boolean' },
    total_lines:        { type: 'number' },
    patterns_found:     { type: 'array', items: { type: 'string' } },
  },
}

const STRUCT_SCHEMA = {
  type: 'object',
  required: ['pass', 'missing', 'issues'],
  properties: {
    pass: { type: 'boolean' },
    missing: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
}

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['score', 'dimensions', 'rationale', 'strengths', 'weaknesses'],
  properties: {
    score: { type: 'number' },
    dimensions: {
      type: 'object',
      properties: {
        correctness:  { type: 'number' },
        completeness: { type: 'number' },
        coverage:     { type: 'number' },
        clarity:      { type: 'number' },
      },
    },
    rationale:  { type: 'string' },
    strengths:  { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
  },
}

const wfFilter = args?.workflows ?? null
const RUNS = Object.entries(WORKFLOWS)
  .filter(([name]) => !wfFilter || wfFilter.includes(name))

if (RUNS.length === 0) {
  log('No workflows matched the filter.')
  return { total: 0, results: [] }
}

const HOME = args?.home ?? (await agent('Run: echo "$HOME" and return only the path string.', { label: 'discover-home', effort: 'low' }))?.trim() ?? '~'
const REPO = args?.repoPath ?? (await agent('Run: git rev-parse --show-toplevel and return only the path string.', { label: 'discover-repo', effort: 'low' }))?.trim() ?? '.'
const START_MS = args?.startedAtMs ?? 0
const GO_BEAST_VERSION = args?.version ?? (await agent(`Run: node -e "process.stdout.write(require('${REPO}/package.json').version)" and return only the version string.`, { label: 'discover-version', effort: 'low' }))?.trim() ?? 'unknown'

phase('Source Collection')
log(`Reading ${RUNS.length} workflow source file(s)...`)

const results = await pipeline(
  RUNS,

  // ── Stage 1: Read and extract key elements ──────────────────────────────────
  // Large files (go-skill-eval = 1010 lines) cannot be passed raw to a judge.
  // Instead: read in 3 chunks of 400 lines each, then extract structural elements.
  async ([name, wf]) => {
    const extracted = await agent(
      `The file ${REPO}/workflows/${name}.js is a Workflow script. Read it fully using mcp__filesystem__read_text_file:
1. Read offset=0, limit=400
2. Read offset=400, limit=400
3. Read offset=800, limit=400

Then extract and return a structured summary of the ENTIRE file. Do NOT read in a single call.

Extract:
- meta_block: the full export const meta = { ... } literal as a string
- schemas: names of all const *_SCHEMA = { ... } declarations
- phases_called: ALL phase references — both standalone phase('...') calls AND phase: '...' parameters inside agent() calls. List every unique phase name found by either pattern.
- agent_calls_sample: first label from each distinct agent() call (up to 15) — look for both label: '...' and label: \`...\` patterns
- has_return: does the file end with a return statement?
- total_lines: approximate line count
- patterns_found: which of these appear anywhere: ['pipeline', 'parallel', 'filter(Boolean)', 'skillOverrides', 'FILESYSTEM_SKILLS', 'TESTS', 'expectExit', 'expectOutput', 'stop_hook_active', 'setup', 'label', 'schema', 'DIMENSIONS', 'outputDir', 'repoPath', 'args?.repoPath', 'args?.outputDir', 'write-report', 'write-eval-json']`,
      { label: `extract:${name}`, phase: 'Source Collection', schema: EXTRACT_SCHEMA }
    )
    if (!extracted) {
      log(`WARNING: extraction failed for ${name}.js`)
      return null
    }
    return { name, wf, extracted }
  },

  // ── Stage 2: Structural eval ────────────────────────────────────────────────
  async (prev) => {
    if (!prev) return null
    const { name, wf, extracted } = prev
    const items = wf.checklist.join(', ')

    const structResult = await agent(
      `You are a rigorous code reviewer analyzing a Workflow script.

The following is a structural EXTRACT of ${name}.js (not the raw source — the full file was read and key elements extracted):

${JSON.stringify(extracted, null, 2)}

Verify this contains ALL of: ${items}

Also flag these issues if present:
- meta block uses computed values (variables, function calls, template strings) — it must be a pure literal
- agent() calls that lack a label (check agent_calls_sample)
- Missing return statement (check has_return)
- No filter(Boolean) null guard (check patterns_found)
- Discovery agents without schema (pipeline with no SCHEMA entries)

Search case-insensitive. Accept plural/singular variants.
Return ONLY the structured JSON.`,
      { label: `struct:${name}`, phase: 'Structural Eval', schema: STRUCT_SCHEMA }
    )
    return { name, wf, extracted, structResult }
  },

  // ── Stage 3: LLM Judge ──────────────────────────────────────────────────────
  async (prev) => {
    if (!prev) return null
    const { name, wf, extracted, structResult } = prev

    const typeGuide = wf.type === 'analysis'
      ? `This is a CODEBASE ANALYSIS workflow. Judge based on the extract:
- Is DIMENSIONS (the analysis dimensions array) present in patterns_found?
- Is parallel() used for the analysis phase? (6 independent analyses — correct pattern)
- Is DISCOVERY_SCHEMA declared for the structured discovery agent output?
- Are all agent() calls labeled (check agent_calls_sample for discover, analyze-*, save-*, save-index)?
- Is there a null guard (filter(Boolean)) after parallel() results?
- Does the workflow handle the case where repoPath is missing?
- Is the output directory configurable (outputDir in patterns_found or args)?`
      : wf.type === 'skill-eval'
      ? `This is a SKILL EVALUATION HARNESS. Judge based on the extract:
- Are skillOverrides present in patterns_found? (essential for filesystem-dependent skills to get real file content)
- Is FILESYSTEM_SKILLS present in patterns_found? (controls which skills get real-file inputs)
- Are there 4+ phases in phases_called (Skill Execution, Structural Eval, LLM Judge, Aggregation)?
- Are STRUCT_SCHEMA and JUDGE_SCHEMA both declared (check schemas)?
- Does agent_calls_sample include 'write-report' and 'write-eval-json'? (direct I/O via agent() — replaces writeMarkdownOutputFile/writeEvalOutputFile)
- Does the workflow persist the report and JSON via agent() calls?`
      : `This is a HOOK TEST HARNESS. Judge based on the extract:
- Is TESTS present in patterns_found? (the test cases array)
- Are both expectExit patterns present (blocking exit:1 AND passing exit:0)?
- Is stop_hook_active present (prevents infinite loops)?
- Is setup present (for test isolation — creating/removing files before test)?
- Are parallel and filter(Boolean) present (parallel execution, null guard)?
- Does agent_calls_sample include 'write-report' and 'write-eval-json'? (direct I/O via agent() — replaces writeMarkdownOutputFile/writeEvalOutputFile)`

    const judgeResult = await agent(
      `You are an adversarial code reviewer evaluating the Workflow script "${name}".

Purpose: ${wf.description}

You have a structural EXTRACT of the full file (all ${extracted.total_lines} lines were read):
${JSON.stringify(extracted, null, 2)}

Structural check result: ${JSON.stringify(structResult)}

Score calibration:
- 3.5 = functional but meaningful gaps in coverage or correctness
- 4.0 = solid and production-ready, minor issues only
- 4.5 = comprehensive, covers edge cases well
- 5.0 = exemplary, no gaps

Automatic penalties (-0.5 per occurrence, max -1.5 total):
- meta is not a pure literal (contains variables or function calls in meta_block)
- agent() calls lack labels (agent_calls_sample shows unnamed calls)
- has_return is false
- No schema declared for a pipeline that fans out to agents (schemas array is empty)

IMPORTANT: Do NOT penalize for elements that are present in patterns_found or extracted fields.
Only penalize for elements that are genuinely absent from the extract.

Rubric dimensions:
- correctness: pipeline vs parallel used correctly? labels on agents? return present? schemas for array agents?
- completeness: meta, schemas, phases, labels, null guard, return — all present per extract?
- coverage: ${typeGuide}
- clarity: phase/label names descriptive (from phases_called and agent_calls_sample)?

score = mean of 4 dimensions minus penalties, rounded to 1 decimal.

Return ONLY the structured JSON.`,
      { label: `judge:${name}`, phase: 'LLM Judge', schema: JUDGE_SCHEMA }
    )
    return { name, wf, extracted, structResult, judgeResult }
  }
)

// ── Aggregation ────────────────────────────────────────────────────────────────
phase('Aggregation')
log('Consolidating results...')

const valid = results.filter(Boolean)
const avgScore = valid.length > 0
  ? valid.reduce((s, r) => s + (r.judgeResult?.score ?? 0), 0) / valid.length
  : 0

// Token approximation: sum rationale + strengths + weaknesses text sizes
const totalTokensApprox = valid.reduce((sum, r) => {
  const text = JSON.stringify(r.judgeResult ?? '') + JSON.stringify(r.structResult ?? '')
  return sum + Math.round(text.length / 4 * 1.3)
}, 0)
const estimatedCostUSD = ((totalTokensApprox * 0.7 / 1_000_000) * 3) + ((totalTokensApprox * 0.3 / 1_000_000) * 15)

const reportLines = []
reportLines.push(`# go-workflow-eval Report\n`)
reportLines.push(`**Workflows evaluated:** ${valid.length}  |  **Average score:** ${avgScore.toFixed(1)}\n`)
reportLines.push(`---\n`)

reportLines.push(`## Results\n`)
reportLines.push(`| Workflow | Type | Struct | Missing | Score | Co/Cm/Cv/Cl | Lines |`)
reportLines.push(`|---|---|---|---|---|---|---|`)

for (const r of valid) {
  const sp    = r.structResult?.pass ? '✓' : '✗'
  const miss  = (r.structResult?.missing ?? []).join(', ') || '—'
  const score = r.judgeResult?.score?.toFixed(1) ?? 'n/a'
  const d     = r.judgeResult?.dimensions
  const dims  = d ? `${d.correctness}/${d.completeness}/${d.coverage}/${d.clarity}` : '—'
  const lines = r.extracted?.total_lines ?? '?'
  reportLines.push(`| ${r.name} | ${r.wf.type} | ${sp} | ${miss} | ${score} | ${dims} | ${lines} lines |`)
}

if (valid.some(r => r.structResult?.issues?.length || !r.structResult?.pass)) {
  reportLines.push(`\n## Structural Issues\n`)
  for (const r of valid) {
    const issues = r.structResult?.issues ?? []
    if (!issues.length && r.structResult?.pass) continue
    reportLines.push(`### ${r.name}  (pass: ${r.structResult?.pass ?? '?'})`)
    for (const i of issues) reportLines.push(`- ${i}`)
    if (r.structResult?.missing?.length) {
      reportLines.push(`Missing: ${r.structResult.missing.join(', ')}`)
    }
  }
}

reportLines.push(`\n## Detailed Findings\n`)
for (const r of valid) {
  const score = r.judgeResult?.score?.toFixed(1) ?? 'n/a'
  reportLines.push(`### ${r.name}  (score: ${score})\n`)
  reportLines.push(`**Rationale:** ${r.judgeResult?.rationale ?? '—'}\n`)
  reportLines.push(`**Strengths:**`)
  for (const s of (r.judgeResult?.strengths ?? [])) reportLines.push(`- ${s}`)
  reportLines.push(`\n**Weaknesses:**`)
  for (const w of (r.judgeResult?.weaknesses ?? [])) reportLines.push(`- ${w}`)
  reportLines.push('')
}

const reportContent = reportLines.join('\n')
const reportPath = `${REPO}/workflows/go-workflow-eval-reports/report.md`

await agent(`Save the following Markdown report to the file ${reportPath}.
Use the Write tool or mcp__filesystem__write_file. Create parent directories if needed.
Write this exact content (do not modify it):

${reportContent}`, { label: 'write-report', phase: 'Aggregation', effort: 'low' })

log(`Report saved to ${reportPath}`)

// ── JSON output (agent-readable, schema_version 1) ─────────────────────────
const evalPayload = JSON.stringify({
  schema_version: 1,
  workflow: 'go-workflow-eval',
  timestamp: args?.timestamp ?? 'unknown',
  summary: {
    total: valid.length,
    passed: valid.filter(r => r.structResult?.pass !== false).length,
    failed: valid.filter(r => r.structResult?.pass === false).length,
    errors: results.filter(r => !r).length,
    avg_score: parseFloat(avgScore.toFixed(2)),
    estimated_cost_usd: parseFloat(estimatedCostUSD.toFixed(4)),
  },
  inputs: { filter: args?.workflows ?? null, workflow_version: GO_BEAST_VERSION },
  meta: { go_beast_version: GO_BEAST_VERSION, environment: 'claude-code' },
  detail: {
    type: 'workflow-eval',
    runs: valid.map(r => ({
      workflow: r.name,
      type: r.wf.type,
      total_lines: r.extracted?.total_lines ?? null,
      struct: { pass: r.structResult?.pass ?? null, missing: r.structResult?.missing ?? [], issues: r.structResult?.issues ?? [] },
      judge: r.judgeResult ? { score: r.judgeResult.score ?? null, dimensions: r.judgeResult.dimensions ?? null, rationale: r.judgeResult.rationale ?? null, strengths: r.judgeResult.strengths ?? [], weaknesses: r.judgeResult.weaknesses ?? [] } : null,
    })),
  },
  startedAtMs: START_MS,
}, null, 2)
const evalOutputDir = `${HOME}/.claude/workflows/go-workflow-eval/results`
const evalOutputPath = `${evalOutputDir}/go-workflow-eval-${args?.runId ?? 'run'}.json`
await agent(`Save the following JSON to the file ${evalOutputPath}.
Use the Write tool or mcp__filesystem__write_file. Create parent directories if needed.
Write this exact content (do not modify it):

${evalPayload}`, { label: 'write-eval-json', phase: 'Aggregation', effort: 'low' })

return {
  total: valid.length,
  avgScore: parseFloat(avgScore.toFixed(1)),
  scores: valid.map(r => ({ name: r.name, score: r.judgeResult?.score, dims: r.judgeResult?.dimensions })),
  structFails: valid.filter(r => r.structResult?.pass === false).length,
  weaknesses: valid.map(r => ({ name: r.name, w: r.judgeResult?.weaknesses })),
}
