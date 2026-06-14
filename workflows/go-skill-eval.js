export const meta = {
  name: 'go-skill-eval',
  description: 'Tests all go-* skills with structural eval + LLM-as-judge and A/B/C/D benchmark',
  phases: [
    { title: 'Skill Execution', detail: 'Runs skill×input combinations in parallel' },
    { title: 'Structural Eval', detail: 'Deterministic checklist per skill' },
    { title: 'LLM Judge', detail: 'Qualitative 4-dimension rubric, adversarially calibrated' },
    { title: 'Aggregation', detail: 'Consolidates results and generates report' },
  ],
}

const SKILLS = {
  'go-hawk': {
    description: 'Conducts structured discovery interviews, produces a versioned REQUIREMENTS.md, identifies unknowns and risks, and generates a go-beast handoff plan for a software project.',
    checklist: ['Problem statement', 'Users and roles', 'Functional requirements', 'Out of scope', 'Risks', 'handoff'],
  },
  'go-lark': {
    description: 'Explores the solution space for approved requirements — generates 3–5 distinct approaches, evaluates each against the project constraints, selects one with explicit rationale, and produces APPROACH.md as a decision record.',
    checklist: ['APPROACH.md', 'approaches considered', 'evaluation', 'selected approach', 'trade-offs', 'deferred decisions'],
  },
  'go-fox': {
    description: 'Translates approved requirements into an architecture decision record (ADR), technology stack selection, Mermaid component diagram, and interface contracts.',
    checklist: ['ADR', 'Mermaid', 'STACK.md', 'CONTRACTS.md'],
  },
  'go-beaver': {
    description: 'Creates a working, runnable project skeleton — monorepo or multi-repo structure, dependency install, linter, formatter, Git hooks, env files, and dev server validation.',
    checklist: ['.env.example', 'linter', 'formatter', 'Git hooks', 'scripts', 'dev server'],
  },
  'go-wolf': {
    description: 'Designs and implements REST or GraphQL APIs, business logic layers, authentication, authorization, middleware, and server-side validation following a strict layered architecture.',
    checklist: ['endpoints', 'handler', 'service', 'repository', 'auth', 'middleware', 'validation', 'error handling'],
  },
  'go-lynx': {
    description: 'Builds frontend UIs with correct component architecture, state management, API integration, accessibility, and responsive design — wired to a real backend, not mocked.',
    checklist: ['components', 'state management', 'API integration', 'accessibility', 'responsive'],
  },
  'go-otter': {
    description: 'Designs entity-relationship models, defines schemas with conventions, writes safe migrations with rollback, plans indexing strategy, and reviews queries for N+1 and sequential scans.',
    checklist: ['schema', 'migrations', 'rollback', 'indexes', 'entities', 'erDiagram', 'N+1'],
  },
  'go-eagle': {
    description: 'Designs the test pyramid, writes unit, integration, and end-to-end tests, establishes CI gates, and sets coverage policy for a software project.',
    checklist: ['test pyramid', 'unit tests', 'integration tests', 'e2e', 'coverage', 'CI gates', 'mocking strategy'],
  },
  'go-bear': {
    description: 'Runs a security review covering OWASP Top 10, authentication hardening, secrets management, dependency auditing, HTTP headers, and threat modeling for a software project.',
    checklist: ['OWASP', 'injection', 'authentication', 'secrets', 'THREAT_MODEL', 'SECURITY_REVIEW', 'severity', 'HTTP headers', 'dependency audit'],
  },
  'go-raven': {
    description: 'Designs CI/CD pipelines, environment promotion strategy, infrastructure-as-code, secrets management in CI, and release automation for a software project.',
    checklist: ['pipeline', 'staging', 'production', 'rollback', 'release', 'workflow', 'secrets in CI', 'environment promotion'],
  },
  'go-owl': {
    description: 'Audits and writes technical documentation for a software project — README, API reference, architecture docs, ADRs, runbooks, and changelog — ensuring every document is accurate, complete, and runnable.',
    checklist: ['README', 'API reference', 'runbook', 'CHANGELOG', 'DEPLOYMENT', 'ADR', 'numbered steps', 'code blocks'],
  },
  'go-jay': {
    description: 'Creates, audits, edits, and synchronizes AI context files — CLAUDE.md (global and project), AGENTS.md, GEMINI.md, CONTEXT.md, and memory files — improving AI agent behavior.',
    checklist: ['CLAUDE.md', 'AGENTS.md', 'instructions', 'regression check', 'conflict'],
  },
  'go-mole': {
    description: 'Scans and reads all documentation in a project — README, CHANGELOG, CONTRIBUTING, CLAUDE.md, AGENTS.md, /docs, /wiki, and key config files — then produces a compact briefing.',
    checklist: ['Purpose', 'Stack', 'Run', 'Test', 'Architecture notes', 'Gaps', 'Agent rules'],
  },
  'go-smith': {
    description: 'Designs, writes, and validates new skills for the go-* family — from gap analysis to SKILL.md authoring, naming, description quality, workflow structure, and integration into the pack handoff chain.',
    checklist: ['gap analysis', 'SKILL.md', 'when_to_use', 'workflow steps', 'checklist', 'position in chain', 'handoff'],
  },
  'go-swift': {
    description: 'Designs, writes, tests, and registers Claude Code hooks — shell scripts triggered by lifecycle events (SessionStart, PreToolUse, PostToolUse, Stop, SubagentStop, PreCompact). Produces hook scripts, wires them into settings.json, and verifies execution.',
    checklist: ['hook script', 'settings.json', 'event', 'chmod', 'verification'],
  },
  'go-kite': {
    description: 'Audits an existing system architecture across five dimensions — structure/modularity, observability, reliability, scalability, and security posture — and produces a prioritized findings report with capability gaps and concrete improvement proposals, each referencing the next beast to invoke.',
    checklist: ['structure', 'observability', 'reliability', 'scalability', 'security', 'capability gaps', 'recommendation'],
  },
  'go-crane': {
    description: 'Implements observability for a running system — structured logging with correlation IDs, metrics collection (Prometheus/OpenTelemetry), distributed tracing, health endpoints, alerting rules, and runbook-linked dashboards. Produces OBSERVABILITY.md documenting signal inventory, retention policy, and alert thresholds.',
    checklist: ['OBSERVABILITY.md', 'signal inventory', 'structured logging', 'correlation', 'metrics', 'tracing', 'health endpoints', 'alerting', 'runbooks', 'retention policy'],
  },
  'go-ant': {
    description: 'Profiles a running system to find real performance bottlenecks, establishes baseline measurements, applies targeted optimizations (query tuning, cache strategy, bundle reduction, async patterns), and validates improvement with before/after benchmarks. Produces PERF.md with evidence-backed findings and applied changes.',
    checklist: ['PERF.md', 'baseline', 'profiler output', 'bottleneck', 'root cause', 'benchmark results', 'before/after', 'optimization'],
  },
}

// Input A: simple project without real code — tests planning skills (go-hawk, go-lark, go-fox)
const INPUT_A = {
  nome: 'TaskFlow API',
  dominio: 'Personal task management',
  stack: 'Node.js + PostgreSQL',
  usuarios: 'Individual developers',
  complexidade: 'low',
}

// Input B: infra project without an application layer — tests filesystem-dependent skills with rich domain material
const INPUT_B = {
  nome: 'ServerWatch',
  dominio: 'Real-time server monitoring',
  stack: 'Go + InfluxDB + Grafana',
  usuarios: 'SREs and operations teams',
  complexidade: 'high — WebSockets, alerts, multiple services',
}

// Input C: mid-complexity project with simulated real files
// Purpose: test doc, security and CI skills with concrete partially incomplete material.
const INPUT_C = {
  nome: 'PayLink',
  dominio: 'Recurring payments platform for SaaS',
  stack: 'Python (FastAPI) + PostgreSQL + Redis + Stripe API',
  usuarios: 'SaaS product teams (B2B), 5–20 developers',
  complexidade: 'medium — OAuth2 auth, webhooks, async jobs, PCI-DSS compliance',
  docs_existentes: `
README.md: present (outdated — points to port 8080, app runs on 3000)
docs/ARCHITECTURE.md: present (ADR-001 FastAPI choice, ADR-002 Redis for jobs)
CHANGELOG.md: present (v1.2.0 last entry, 3 months ago)
CONTRIBUTING.md: present (PR standard, branch naming: feat/, fix/, chore/)
docs/DEPLOYMENT.md: absent
docs/runbooks/: absent
openapi.yaml: present at docs/openapi.yaml (v1.2.0, may be outdated)
.env.example: present`,
  files: {
    'README.md': `# PayLink

Recurring payments platform for SaaS.

## Setup

\`\`\`bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
\`\`\`

## Tests

\`\`\`bash
pytest
\`\`\`

## Stack

- Python 3.11 + FastAPI
- PostgreSQL 15
- Redis 7 (job queues via Celery)
- Stripe API (payments)

## Deploy

See docs/DEPLOYMENT.md (not yet written).
`,
    'CHANGELOG.md': `# Changelog

## [1.2.0] - 2026-03-10
### Added
- Support for multiple subscription plans per customer
- Webhook handler for Stripe events (payment_failed, subscription_cancelled)
### Fixed
- Race condition in recurring billing job processing

## [1.1.0] - 2026-01-15
### Added
- OAuth2 authentication with Google and GitHub
- Monthly revenue report endpoint (MRR)

## [1.0.0] - 2025-11-01
### Added
- MVP: subscription creation, billing via Stripe, customer portal
`,
    'CONTRIBUTING.md': `# Contributing

## Branch naming
- feat/<description>
- fix/<description>
- chore/<description>

## Pull Requests
- Minimum 2 approvals before merge
- CI must pass (lint + typecheck + tests)
- Squash merge required

## Commits
Follow Conventional Commits: feat:, fix:, chore:, docs:
`,
    'docs/ARCHITECTURE.md': `# Architecture

## ADR-001: FastAPI choice

**Status:** Accepted | **Date:** 2025-10-20

### Context
We needed a Python framework with native async support, type validation, and automatic OpenAPI spec generation.

### Decision
FastAPI with Pydantic v2.

### Consequences
- OpenAPI spec auto-generated at /docs
- Request/response validation at runtime
- Smaller learning curve than Django REST Framework

## ADR-002: Redis for job queues

**Status:** Accepted | **Date:** 2025-10-25

### Context
Recurring billing must be processed asynchronously without blocking HTTP requests.

### Decision
Celery + Redis as broker. Jobs scheduled via Celery Beat.

### Consequences
- Redis must be provisioned in production (additional cost)
- Job failures need a dead letter queue (not yet implemented)
`,
    // Arquivos Claude Code para go-swift e go-jay
    '.claude/settings.json': `{
  "hooks": {
    "SessionStart": [],
    "PreToolUse": [],
    "PostToolUse": [],
    "Stop": []
  }
}`,
    'CLAUDE.md': `# PayLink — Agent Context

## Stack
Python 3.11, FastAPI, PostgreSQL, Redis/Celery, Stripe API.

## Rules
- Never hardcode secrets — use .env
- Always run pytest before committing
- Follow Conventional Commits

## Known gaps
- No pre-commit hooks configured
- No deploy automation (DEPLOYMENT.md absent)
`,
    'AGENTS.md': `# PayLink — Agents Context

Currently identical to CLAUDE.md — needs sync review.
`,
  },
}

// Input D: adversarial legacy project — multiple deliberate critical violations.
// Purpose: test whether skills IDENTIFY real problems instead of producing generic outputs.
// Filesystem-dependent skills use this input — it has real code + Claude Code context.
const INPUT_D = {
  nome: 'ShopLegacy',
  dominio: 'Legacy e-commerce, B2C online store',
  stack: 'Python 2.7 + Flask + MySQL (no ORM) + jQuery',
  usuarios: 'End customers and internal administrators',
  complexidade: 'high — custom auth, payments, unsigned cookie sessions, zero tests, no CI',
  files: {
    'app.py': `import MySQLdb
from flask import Flask, request, session, redirect
import hashlib, os

app = Flask(__name__)
app.secret_key = "supersecret123"  # hardcoded

DB_PASS = "admin1234"  # hardcoded
conn = MySQLdb.connect(host="localhost", user="root", passwd=DB_PASS, db="shopdb")

@app.route('/login', methods=['POST'])
def login():
    user = request.form['username']
    pwd  = request.form['password']
    # SQL injection — direct concatenation
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username='" + user + "' AND password='" + hashlib.md5(pwd).hexdigest() + "'")
    row = cur.fetchone()
    if row:
        session['user_id'] = row[0]
        session['role'] = row[3]  # 'admin' or 'customer' — not validated server-side
        return redirect('/dashboard')
    return 'Login failed', 401

@app.route('/admin/orders')
def admin_orders():
    # no role check — any logged-in user can access
    cur = conn.cursor()
    cur.execute("SELECT * FROM orders")
    return str(cur.fetchall())

@app.route('/search')
def search():
    q = request.args.get('q', '')
    # SQL injection em GET param
    cur = conn.cursor()
    cur.execute("SELECT * FROM products WHERE name LIKE '%" + q + "%'")
    return str(cur.fetchall())

@app.route('/upload', methods=['POST'])
def upload():
    f = request.files['file']
    # no type or size validation
    f.save('/var/www/uploads/' + f.filename)
    return 'uploaded'

if __name__ == '__main__':
    app.run(debug=True)  # debug=True in production
`,
    'requirements.txt': `Flask==0.12.4
MySQL-python==1.2.5
# no pinned versions for other deps
requests
Pillow
`,
    'README.md': `# ShopLegacy

Legacy online store.

## Run

\`\`\`
python app.py
\`\`\`

## TODO
- Add tests (someday)
- Migrate to Python 3
- Fix the known security issues
`,
    'deploy.sh': `#!/bin/bash
# Manual deploy script
scp app.py root@prod-server:/var/www/shop/
ssh root@prod-server "cd /var/www/shop && python app.py &"
# database password in plain text in the script
mysql -h prod-server -u root -padmin1234 shopdb < schema.sql
`,
    // Arquivos Claude Code para go-swift e go-jay
    '.claude/settings.json': `{
  "hooks": {
    "SessionStart": [],
    "PreToolUse": [],
    "PostToolUse": [],
    "Stop": []
  }
}`,
    'CLAUDE.md': `# ShopLegacy — Agent Context

## Stack
Python 2.7, Flask, MySQL without ORM, jQuery.

## Known issues
- SQL injection in login and search
- Hardcoded secrets in app.py
- No tests, no CI
`,
    'AGENTS.md': `# ShopLegacy — Agent Context

Same as CLAUDE.md — not yet synchronized.
`,
  },
}

function buildPrompt(skillName, skillDesc, input, checklist) {
  const docsSection = input.docs_existentes
    ? `\nExisting project documentation:\n${input.docs_existentes}\n`
    : ''
  const filesSection = input.files
    ? '\n\nPROJECT FILE CONTENTS (use these as the primary source — do not simulate, read them):\n\n' +
      Object.entries(input.files)
        .map(([path, content]) => `### ${path}\n\`\`\`\n${content.trim()}\n\`\`\``)
        .join('\n\n')
    : ''
  const importanteNote = input.files
    ? 'IMPORTANT: The files above are the real project content. Use them as the primary source — identify real problems present in the code; do not invent or ignore what is written.'
    : 'IMPORTANT: This is a fictional project for test purposes — no real files exist to scan. Simulate what the skill would produce if the project existed with the stack and domain described above.'

  // Per-skill overrides to ensure complete output in the eval context
  const skillOverrides = {
    'go-kite': `EVAL CONTEXT: You do not have access to filesystem tools in this context. The files above are the repomix output equivalent — treat them as the complete codebase. Produce the full audit across all 5 dimensions (structure, observability, reliability, scalability, security) AND the capability gaps section AND at least 3 concrete recommendations referencing the provided files. DO NOT skip dimensions due to lack of tool access.`,
    'go-swift': `EVAL CONTEXT: You are generating the output go-swift would produce for a Claude Code project. The provided settings.json is the real file to be modified. Produce the complete hook script, show the settings.json changes, specify the event, and include chmod.`,
    'go-jay': `EVAL CONTEXT: The provided context files (CLAUDE.md, AGENTS.md) are the real files to be audited and edited. Produce the full analysis, proposed edits with before/after, and the regression check.`,
    'go-ant': `EVAL CONTEXT: The code files above are the real codebase. Simulate go-ant's complete output: baseline measurements, profiler output indicating bottlenecks, root cause analysis, applied optimization with before/after benchmark. Use the provided files as evidence.`,
  }
  const override = skillOverrides[skillName] ? `\n\n${skillOverrides[skillName]}` : ''

  return `You are the skill ${skillName}. Your function: ${skillDesc}

Project context:
- Name: ${input.nome}
- Domain: ${input.dominio}
- Stack: ${input.stack}
- Users: ${input.usuarios}
- Complexity: ${input.complexidade}${docsSection}${filesSection}

Execute your function as defined. Produce all expected artifacts in complete, detailed Markdown. Do not summarize — produce the real output the skill would generate.

MANDATORY ARTIFACTS: your output MUST explicitly contain all of the following items (use these exact terms in English):
${checklist.map(item => `- ${item}`).join('\n')}

${importanteNote}${override}`
}

// args.skills: array of names to filter (e.g. ['go-swift']). Default: all.
// Filesystem-dependent skills receive only C and D (real code).
// go-kite, go-ant, go-crane: require a codebase to function.
// go-owl, go-beaver, go-mole: confirmed collapse on A/B without a concrete project (eval 2026-06-13).
// go-swift: Claude Code-specific; B inputs without hook context collapse (eval 2026-06-13).
// go-jay: without real context files, completeness/adherence collapse on A (eval 2026-06-13).
const FILESYSTEM_SKILLS = new Set(['go-kite', 'go-ant', 'go-crane', 'go-owl', 'go-beaver', 'go-mole', 'go-swift', 'go-jay'])

const skillFilter = args?.skills ?? null
const RUNS = Object.entries(SKILLS)
  .filter(([skillName]) => !skillFilter || skillFilter.includes(skillName))
  .flatMap(([skillName, skillDef]) => {
    if (FILESYSTEM_SKILLS.has(skillName)) {
      // These skills require real code — use only C and D
      return [
        { skillName, skillDef, input: args?.inputC ?? INPUT_C, label: `${skillName}:C` },
        { skillName, skillDef, input: args?.inputD ?? INPUT_D, label: `${skillName}:D` },
      ]
    }
    return [
      { skillName, skillDef, input: args?.inputA ?? INPUT_A, label: `${skillName}:A` },
      { skillName, skillDef, input: args?.inputB ?? INPUT_B, label: `${skillName}:B` },
      { skillName, skillDef, input: args?.inputC ?? INPUT_C, label: `${skillName}:C` },
      { skillName, skillDef, input: args?.inputD ?? INPUT_D, label: `${skillName}:D` },
    ]
  })

const STRUCT_SCHEMA = {
  type: 'object',
  required: ['pass', 'missing', 'tokens_skill', 'latency_ms'],
  properties: {
    pass: { type: 'boolean' },
    missing: { type: 'array', items: { type: 'string' } },
    tokens_skill: { type: 'number' },
    latency_ms: { type: 'number' },
    error: { type: 'boolean' },
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
        relevance: { type: 'number' },
        completeness: { type: 'number' },
        clarity: { type: 'number' },
        adherence: { type: 'number' },
      },
    },
    rationale: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
  },
}

phase('Skill Execution')
log(`Running ${RUNS.length} skill×input combinations in parallel...`)

const results = await pipeline(
  RUNS,

  // Stage 1: Skill Execution
  async (run) => {
    const output = await agent(
      buildPrompt(run.skillName, run.skillDef.description, run.input, run.skillDef.checklist),
      {
        label: `exec:${run.label}`,
        phase: 'Skill Execution',
      }
    )
    const tokens_approx = Math.round((output?.length ?? 0) / 4)
    return { run, output, tokens_approx }
  },

  // Stage 2: Structural Eval
  async (prev) => {
    if (!prev) return null
    const { run, output, tokens_approx } = prev

    const checklistItems = run.skillDef.checklist.join(', ')
    const structResult = await agent(
      `You are a rigorous technical evaluator. Analyze the output below and verify whether it contains ALL of the following required items for skill ${run.skillName}: ${checklistItems}

Search rules:
- Search is CASE-INSENSITIVE: "Mermaid", "mermaid" and "MERMAID" are equivalent.
- Accept plural/singular and common suffix variants: "migration" accepts "migrations", "migrate".
- Accept mentions in file names, headings, and body text.
- Do not infer presence: if a concept is implicit but the term does not appear, mark it as absent.

Estimate the approximate number of tokens in the output (word count × 1.3 as a proxy).
Estimate latency in ms based on output size (use 10ms per 100 tokens as a proxy).

OUTPUT TO EVALUATE:
---
${output}
---

Return ONLY the structured JSON, no additional text.`,
      {
        label: `struct:${run.label}`,
        phase: 'Structural Eval',
        schema: STRUCT_SCHEMA,
      }
    )
    return { run, output, tokens_approx, structResult }
  },

  // Stage 3: LLM Judge
  async (prev) => {
    if (!prev) return null
    const { run, output, tokens_approx, structResult } = prev

    const judgeResult = await agent(
      `You are an adversarial evaluator of AI agent outputs. Your job is to find real gaps, not validate outputs. Evaluate the output below produced by skill ${run.skillName} for project "${run.input.nome}".

## Mandatory calibration

Score 3.5 is the expected baseline for a competent but generic output. Score 4 requires real project specificity. Score 5 is reserved for outputs a senior engineer would use without modification — must be rare (< 10% of cases). Scores below 3 indicate substantive failure.

**Automatic penalties (deduct 0.5 per occurrence, maximum -1.5 total):**
- Use of generic placeholders without substitution (e.g. "your-api-key", "<TOKEN>", "example.com" when the project has a concrete domain)
- Required skill sections present but empty or single-line
- For Input D (ShopLegacy with adversarial code): failing to identify SQL injection in app.py, hardcoded secret (secret_key, DB_PASS), or debug=True in production — each is -0.5

## Rubric with per-level anchors

### relevance — Is the output specific to this project?

- **1:** Entirely generic — does not mention the project name, stack, or domain.
- **2:** Mentions the project name but uses placeholder examples unrelated to the real domain.
- **3:** References stack and domain but misses critical specific elements.
- **4:** Clearly contextualized — entities, endpoints, and examples correspond to the project. For Input D: identifies at least 2 specific vulnerabilities from the provided code.
- **5:** Deeply specific — each artifact reflects the project with file:line evidence. For Input D: covers all critical vulnerabilities with exact code references.

### completeness — Does it cover all aspects expected of the skill?

- **1:** Covers only 1–2 aspects.
- **2:** Covers half the expected outputs.
- **3:** Most sections present, but at least one significantly shallow.
- **4:** All sections present with adequate depth.
- **5:** All sections present, developed beyond the minimum, no gaps.

### clarity — Is it well-structured and readable?

- **1:** No structure; wall of text.
- **2:** Inconsistent structure.
- **3:** Clear structure but verbose or repetitive prose.
- **4:** Headings, lists, and tables used appropriately; scannable.
- **5:** Exemplary organization; hierarchy immediately clear; formatting aids comprehension.

### adherence — Did it do what the skill promises?

- **1:** Output does not correspond to the skill's purpose.
- **2:** Partially follows, skips key steps.
- **3:** Follows general purpose but missing at least one required artifact.
- **4:** Delivers all core artifacts; minimal deviations.
- **5:** Fully delivers what the skill promises, following the workflow exactly.

## Final score

score = arithmetic mean of the 4 dimensions (round to 1 decimal place), minus applicable penalties.

PROJECT CONTEXT:
- Name: ${run.input.nome}
- Domain: ${run.input.dominio}
- Stack: ${run.input.stack}
- Skill evaluated: ${run.skillName}
- Input: ${run.label.split(':')[1]}

OUTPUT EVALUATED:
---
${output}
---

Return ONLY the structured JSON, no additional text.`,
      {
        label: `judge:${run.label}`,
        phase: 'LLM Judge',
        schema: JUDGE_SCHEMA,
      }
    )

    return { run, output, tokens_approx, structResult, judgeResult }
  }
)

phase('Aggregation')
log('Consolidating results and generating report...')

const validResults = results.filter(Boolean)

const INPUT_A_REF = args?.inputA ?? INPUT_A
const INPUT_B_REF = args?.inputB ?? INPUT_B
const INPUT_C_REF = args?.inputC ?? INPUT_C
const INPUT_D_REF = args?.inputD ?? INPUT_D

function getInputKey(input) {
  if (input === INPUT_A_REF) return 'A'
  if (input === INPUT_B_REF) return 'B'
  if (input === INPUT_C_REF) return 'C'
  return 'D'
}

const bySkill = {}
for (const r of validResults) {
  const { skillName } = r.run
  if (!bySkill[skillName]) bySkill[skillName] = {}
  bySkill[skillName][getInputKey(r.run.input)] = r
}

// Filesystem-dependent skills only run with C and D (real code).
// No inadequate inputs — SKIP was eliminated.
// go-bear and go-raven keep skip on A due to documented domain mismatch.
const SKIP_INPUTS_FOR_SCORE = {
  'go-bear':  ['A'],
  'go-raven': ['A'],
}

const skillScores = Object.entries(bySkill).map(([skillName, inputs]) => {
  const skip = SKIP_INPUTS_FOR_SCORE[skillName] ?? []
  const scores = Object.entries(inputs)
    .filter(([key]) => !skip.includes(key))
    .map(([, r]) => r.judgeResult?.score)
    .filter(s => s != null)
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  const totalTokens = Object.values(inputs)
    .map(r => r.tokens_approx ?? 0)
    .reduce((a, b) => a + b, 0)
  return { skillName, avgScore, totalTokens, inputs, skippedInputs: skip }
})

skillScores.sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))

const top3 = skillScores.slice(0, 3)
const bottom3 = skillScores.slice(-3).reverse()
const structFails = validResults.filter(r => r.structResult?.pass === false)

const outliers = []
for (const { skillName, inputs } of skillScores) {
  const entries = Object.entries(inputs)
    .map(([key, r]) => ({ key, score: r.judgeResult?.score ?? null }))
    .filter(e => e.score != null)
  if (entries.length < 2) continue
  for (const entry of entries) {
    const others = entries.filter(e => e.key !== entry.key).map(e => e.score)
    const median = others.sort((a, b) => a - b)[Math.floor(others.length / 2)]
    const deviation = Math.abs(entry.score - median)
    if (deviation >= 1.5) {
      outliers.push({ skillName, input: entry.key, score: entry.score, median, deviation })
    }
  }
}

const totalTokensAll = skillScores.reduce((sum, s) => sum + s.totalTokens, 0)
const estimatedCostUSD = ((totalTokensAll * 0.7 / 1_000_000) * 3) + ((totalTokensAll * 0.3 / 1_000_000) * 15)

const reportLines = []

reportLines.push(`# go-star-eval Report\n`)
reportLines.push(`**Skills tested:** ${Object.keys(SKILLS).length} go-* | **Inputs:** A (TaskFlow) · B (ServerWatch) · C (PayLink) · D (ShopLegacy adversarial)\n`)
reportLines.push(`**Note:** Filesystem-dependent skills (go-kite, go-ant, go-crane) run only with C and D (real code).\n`)
reportLines.push(`---\n`)

reportLines.push(`## 1. Results per Skill\n`)
reportLines.push(`| Skill | Input | Struct | Missing | Score | Dims (R/C/Cl/A) | Tokens | Latency |`)
reportLines.push(`|---|---|---|---|---|---|---|---|`)

for (const r of validResults) {
  const structPass = r.structResult?.pass ? '✓' : '✗'
  const missing = r.structResult?.missing?.join(', ') || '—'
  const judgeScore = r.judgeResult?.score?.toFixed(1) ?? 'n/a'
  const d = r.judgeResult?.dimensions
  const dims = d ? `R${d.relevance} C${d.completeness} Cl${d.clarity} A${d.adherence}` : '—'
  const tokens = r.tokens_approx?.toLocaleString() ?? '—'
  const latency = r.structResult?.latency_ms ? `${r.structResult.latency_ms.toLocaleString()} ms` : '—'
  reportLines.push(`| ${r.run.skillName} | ${getInputKey(r.run.input)} | ${structPass} | ${missing} | ${judgeScore} | ${dims} | ${tokens} | ${latency} |`)
}

reportLines.push(`\n## 2. Comparison per Skill\n`)
for (const [skillName, inputs] of Object.entries(bySkill)) {
  const scores = Object.entries(inputs).map(([k, r]) => `${k}:${r.judgeResult?.score?.toFixed(1) ?? 'n/a'}`).join(' | ')
  const tokens = Object.entries(inputs).map(([k, r]) => `${k}:${(r.tokens_approx ?? 0).toLocaleString()}`).join(' | ')
  const best = Object.entries(inputs)
    .filter(([, r]) => r.judgeResult?.score != null)
    .sort(([, a], [, b]) => b.judgeResult.score - a.judgeResult.score)
  const bestLabel = best.length === 0 ? 'n/a'
    : best[0][1].judgeResult.score === best[best.length - 1][1].judgeResult.score ? 'Empate'
    : `Input ${best[0][0]}`
  reportLines.push(`### ${skillName}`)
  reportLines.push(`- Score: ${scores}`)
  reportLines.push(`- Tokens: ${tokens}`)
  reportLines.push(`- Best input: **${bestLabel}**\n`)
}

reportLines.push(`## 3. Executive Summary\n`)
reportLines.push(`### Top 3 Skills (by average score)`)
for (const s of top3) {
  const skipNote = s.skippedInputs?.length ? ` _(excludes Input ${s.skippedInputs.join('+')} — domain mismatch)_` : ''
  reportLines.push(`- **${s.skillName}**: ${s.avgScore?.toFixed(1) ?? 'n/a'}${skipNote}`)
}
reportLines.push(`\n### Bottom 3 Skills (candidates for review)`)
for (const s of bottom3) {
  const skipNote = s.skippedInputs?.length ? ` _(excludes Input ${s.skippedInputs.join('+')} — domain mismatch)_` : ''
  reportLines.push(`- **${s.skillName}**: ${s.avgScore?.toFixed(1) ?? 'n/a'}${skipNote}`)
}
if (structFails.length > 0) {
  reportLines.push(`\n### Skills with structural failure ⚠️`)
  for (const r of structFails) {
    reportLines.push(`- **${r.run.skillName}** (Input ${getInputKey(r.run.input)}): missing: ${r.structResult?.missing?.join(', ')}`)
  }
}
if (outliers.length > 0) {
  reportLines.push(`\n### Outliers detected ⚠️`)
  reportLines.push(`_Score deviates ≥1.5 points from the median of other inputs for the same skill._`)
  for (const o of outliers) {
    reportLines.push(`- **${o.skillName}** Input ${o.input}: score ${o.score.toFixed(1)} vs mediana ${o.median.toFixed(1)} (Δ${o.deviation.toFixed(1)})`)
  }
}
reportLines.push(`\n### Cost Benchmark`)
reportLines.push(`- Total tokens (skills + evals): ${totalTokensAll.toLocaleString()}`)
reportLines.push(`- Estimated cost (Sonnet 4.6): ~$${estimatedCostUSD.toFixed(4)} USD`)
reportLines.push(`- Skills evaluated: ${Object.keys(bySkill).length}/${Object.keys(SKILLS).length}`)
reportLines.push(`- Runs with errors: ${results.filter(r => !r).length}`)

const reportContent = reportLines.join('\n')

await agent(
  `Save the following Markdown content to the file ~/.claude/workflows/go-star-eval/reports/report.md (create directories if needed using Bash or mcp__filesystem__create_directory). Use the Write tool to write the file.

CONTENT:
${reportContent}`,
  {
    label: 'save-report',
    phase: 'Aggregation',
  }
)

log('Report saved to ~/.claude/workflows/go-star-eval/reports/report.md')

return {
  totalRuns: RUNS.length,
  validResults: validResults.length,
  errors: results.filter(r => !r).length,
  structFails: structFails.length,
  top3: top3.map(s => ({ skill: s.skillName, score: s.avgScore })),
  bottom3: bottom3.map(s => ({ skill: s.skillName, score: s.avgScore })),
  totalTokens: totalTokensAll,
  estimatedCostUSD: parseFloat(estimatedCostUSD.toFixed(4)),
}
