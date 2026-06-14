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
// args.repoPath  — absolute path to go-beast repo root. Falls back to args.home derivation.
// args.home      — home directory, used to derive default repoPath.

const WORKFLOWS = {
  'go-skill-eval': {
    description: 'Evaluates all go-* skills with structural checklist, LLM-as-judge, and adversarial A/B/C/D inputs.',
    type: 'skill-eval',
    checklist: ['SKILLS', 'skillOverrides', 'FILESYSTEM_SKILLS', 'pipeline', 'STRUCT_SCHEMA', 'JUDGE_SCHEMA', 'label', 'return'],
  },
  'go-hook-eval': {
    description: 'Tests go-beast hooks with positive, negative, and edge cases including jq fallback and stop_hook_active.',
    type: 'hook-eval',
    checklist: ['TESTS', 'expectExit', 'expectOutput', 'stop_hook_active', 'parallel', 'label', 'return', 'setup'],
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

const REPO = args?.repoPath
  ?? (args?.home ? `${args.home}/Documents/@cherry-c/go-beast` : null)

if (!REPO) {
  log('ERROR: pass args.repoPath or args.home')
  return { error: 'args.repoPath required' }
}

phase('Source Collection')
log(`Reading ${RUNS.length} workflow source file(s)...`)

const results = await pipeline(
  RUNS,

  // ── Stage 1: Read source ────────────────────────────────────────────────────
  // No schema — large files stall when schema forces JSON wrapping of huge strings.
  // Agent returns the raw source text directly.
  async ([name, wf]) => {
    const src = await agent(
      `Use mcp__filesystem__read_text_file to read ${REPO}/workflows/${name}.js with limit=600.
Then read again with offset=600, limit=600.
Concatenate both results and return the raw source text — no JSON wrapping, no explanation, just the source code.`,
      { label: `read:${name}`, phase: 'Source Collection' }
    )
    if (!src || src.length < 100) {
      log(`WARNING: could not read ${name}.js (got: ${src?.length ?? 0} chars)`)
      return null
    }
    return { name, wf, src }
  },

  // ── Stage 2: Structural eval ────────────────────────────────────────────────
  async (prev) => {
    if (!prev) return null
    const { name, wf, src } = prev
    const items = wf.checklist.join(', ')

    const structResult = await agent(
      `You are a rigorous code reviewer analyzing a Workflow script.

Verify the source below contains ALL of: ${items}

Also flag these issues if present:
- meta block uses computed values (variables, function calls, template strings) — it must be a pure literal
- agent() calls that lack a label parameter
- Missing return statement at the end
- No null guard (filter(Boolean)) before accessing pipeline results
- Discovery agents that return arrays but have no schema (agent without schema returns a string, not a parsed object)

Search case-insensitive. Accept plural/singular variants.

SOURCE:
---
${src.slice(0, 10000)}
---

Return ONLY the structured JSON.`,
      { label: `struct:${name}`, phase: 'Structural Eval', schema: STRUCT_SCHEMA }
    )
    return { name, wf, src, structResult }
  },

  // ── Stage 3: LLM Judge ──────────────────────────────────────────────────────
  async (prev) => {
    if (!prev) return null
    const { name, wf, src, structResult } = prev

    const typeGuide = wf.type === 'skill-eval'
      ? `This is a SKILL EVALUATION HARNESS. Also judge:
- Are all go-* skills registered in SKILLS with specific, artifact-named checklists (not vague concepts)?
- Do skillOverrides exist for every skill in FILESYSTEM_SKILLS so the eval agent gets real content to work with?
- Are the 4 input profiles (A/B/C/D) meaningfully different — simple, infra-heavy, mid-complexity with real files, adversarial code?
- Does the LLM judge prompt have per-level anchors that calibrate scores (not just labels)?
- Is the aggregation report complete — results table, comparison, top/bottom 3, cost benchmark?`
      : `This is a HOOK TEST HARNESS. Also judge:
- Does TESTS cover BOTH expectExit:1 (blocking) and expectExit:0 (passing) cases for EACH hook?
- Are edge cases present: literal newlines in JSON (jq fallback bug), stop_hook_active=true preventing loops, flag file creation and absence?
- Do test case names clearly describe the scenario (e.g. "blocks git add .env" not "test 1")?
- Does the aggregation show per-hook pass/fail summary AND a coverage section by case type?
- Is cleanup (removing flag files before each test) handled to prevent cross-test contamination?`

    const judgeResult = await agent(
      `You are an adversarial code reviewer evaluating the Workflow script "${name}".

Purpose: ${wf.description}

Score calibration:
- 3.5 = functional but has meaningful gaps in coverage or correctness
- 4.0 = solid and production-ready, minor issues only
- 4.5 = comprehensive, well-designed, covers edge cases
- 5.0 = exemplary — passes code review without changes, no gaps

Automatic penalties (-0.5 per occurrence, max -1.5 total):
- meta block is not a pure literal (contains variables, function calls, or template strings)
- agent() call has no label parameter
- No return statement
- Discovery agent returns an array but has no schema (would silently return a string)

Rubric dimensions:
- correctness: Are primitives used correctly? (pipeline vs parallel barrier, schema on array-returning agents, labels on all agent() calls, no Date.now()/Math.random())
- completeness: All structural elements present — meta, phases, schemas, labels, null guards, return?
- coverage: ${typeGuide}
- clarity: Descriptive phase/label names, readable code, pattern choices commented where non-obvious?

score = mean of 4 dimensions minus penalties, rounded to 1 decimal.

SOURCE (up to 10k chars):
---
${src.slice(0, 10000)}
---

Return ONLY the structured JSON.`,
      { label: `judge:${name}`, phase: 'LLM Judge', schema: JUDGE_SCHEMA }
    )
    return { name, wf, src, structResult, judgeResult }
  }
)

// ── Aggregation ────────────────────────────────────────────────────────────────
phase('Aggregation')
log('Consolidating results...')

const valid = results.filter(Boolean)
const avgScore = valid.length > 0
  ? valid.reduce((s, r) => s + (r.judgeResult?.score ?? 0), 0) / valid.length
  : 0

const reportLines = []
reportLines.push(`# go-workflow-eval Report\n`)
reportLines.push(`**Workflows evaluated:** ${valid.length}  |  **Average score:** ${avgScore.toFixed(1)}\n`)
reportLines.push(`---\n`)

reportLines.push(`## Results\n`)
reportLines.push(`| Workflow | Type | Struct | Missing | Score | Co/Cm/Cv/Cl |`)
reportLines.push(`|---|---|---|---|---|---|`)

for (const r of valid) {
  const sp    = r.structResult?.pass ? '✓' : '✗'
  const miss  = (r.structResult?.missing ?? []).join(', ') || '—'
  const score = r.judgeResult?.score?.toFixed(1) ?? 'n/a'
  const d     = r.judgeResult?.dimensions
  const dims  = d ? `${d.correctness}/${d.completeness}/${d.coverage}/${d.clarity}` : '—'
  reportLines.push(`| ${r.name} | ${r.wf.type} | ${sp} | ${miss} | ${score} | ${dims} |`)
}

if (valid.some(r => r.structResult?.issues?.length)) {
  reportLines.push(`\n## Structural Issues\n`)
  for (const r of valid) {
    if (!r.structResult?.issues?.length) continue
    reportLines.push(`### ${r.name}`)
    for (const i of r.structResult.issues) reportLines.push(`- ${i}`)
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

await agent(
  `Save the following Markdown to ${reportPath} (create directories if needed using Bash or mcp__filesystem__create_directory). Use the Write tool.

CONTENT:
${reportContent}`,
  { label: 'save-report', phase: 'Aggregation' }
)

log(`Report saved to ${reportPath}`)

return {
  total: valid.length,
  avgScore: parseFloat(avgScore.toFixed(1)),
  scores: valid.map(r => ({ name: r.name, score: r.judgeResult?.score, dims: r.judgeResult?.dimensions })),
  structFails: valid.filter(r => r.structResult?.pass === false).length,
  weaknesses: valid.map(r => ({ name: r.name, w: r.judgeResult?.weaknesses })),
}
