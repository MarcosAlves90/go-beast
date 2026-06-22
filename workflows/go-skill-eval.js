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
  'go-snipe': {
    description: 'Translates interface contracts and functional requirements into BDD scenario files (Given/When/Then), an acceptance test skeleton, and a SPEC.md that go-wolf and go-lynx must satisfy before implementation begins.',
    checklist: ['SPEC.md', 'acceptance criteria', 'Given', 'When', 'Then', 'test skeleton', 'unhappy path', 'open questions'],
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
  'go-mule': {
    description: 'Initializes go-beast explicitly for a new agent session or environment as an alternative to SessionStart sync-hook instrumentation, separating canonical core setup from optional harness-specific wiring and validating readiness before work begins.',
    checklist: ['INITIALIZATION PLAN', 'CORE SETUP', 'OPTIONAL HARNESS STEPS', 'VALIDATION REPORT', 'NEXT BEAST HANDOFF', 'install.mjs', 'AGENTS.global.md', 'skills/'],
  },
  'go-tern': {
    description: 'Reviews a diff, branch, task, or named artifact against requirements, behavioral risk, security, and regression potential; produces severity-ranked findings, open questions, and a merge recommendation.',
    checklist: ['REVIEW FINDINGS', 'Critical', 'Important', 'OPEN QUESTIONS', 'MERGE RECOMMENDATION'],
  },
  'go-marten': {
    description: 'Plans, creates, validates, and cleans up isolated git worktrees for parallel development, risky refactors, or review staging; records provenance and safe cleanup rules.',
    checklist: ['WORKTREE PLAN', 'WORKTREE STATE', 'CLEANUP RULES', 'branch', 'provenance'],
  },
  'go-swift': {
    description: 'Designs, writes, tests, and registers lifecycle hooks for hook-capable coding agents — currently Claude Code and Codex. Produces hook scripts, wires them into the agent hook configuration, and verifies execution.',
    checklist: ['hook script', 'hook configuration', 'event', 'chmod', 'verification'],
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
  'go-wren': {
    description: 'Audits an existing Claude Code or Codex hook script, classifies the requested change (threshold, condition, behaviour, or bug fix), applies the minimal edit preserving the exit-code contract, and re-validates with go-hook-eval. Never rewrites a working hook from scratch.',
    checklist: ['HOOK CONTRACT', 'change type', 'PROPOSED DIFF', 'exit code', 'TEST EVIDENCE', 'happy path'],
  },
  'go-finch': {
    description: 'Audits an existing go-* SKILL.md, identifies the specific weakness (vague step, missing rule, incomplete output, eval-driven gap), applies the minimal edit, bumps the version, and verifies internal consistency. Never rewrites a working skill from scratch.',
    checklist: ['SKILL AUDIT', 'change type', 'PROPOSED EDIT', 'version bump', 'consistency check', 'CHECKLIST ASSESSMENT', 'CHANGELOG'],
  },
  'go-vole': {
    description: 'Designs and maintains Obsidian vaults — folder structure, naming conventions, wikilink strategy, plugin configuration (Dataview, Templater, Tasks), MOC architecture, and note templates. Produces VAULT.md specification and ready-to-use template files.',
    checklist: ['VAULT AUDIT', 'STRUCTURE', 'NAMING', 'LINKING', 'VAULT.md', 'template', 'plugin'],
  },
  'go-bee': {
    description: 'Designs and implements Workflow scripts (.js files that use agent(), pipeline(), parallel(), phase(), log(), and schema) for multi-agent orchestration. Covers decomposing tasks into phases, choosing the correct orchestration primitive, defining JSON schemas, writing the meta block, and registering the workflow.',
    checklist: ['meta', 'phase', 'pipeline', 'schema', 'label', 'return'],
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
    'go-swift': `EVAL CONTEXT: You are generating the output go-swift would produce for a Claude Code project. The provided settings.json is the real hook configuration file to be modified. Produce the complete hook script, show the hook configuration changes, specify the event, and include chmod.`,
    'go-jay': `EVAL CONTEXT: The provided context files (CLAUDE.md, AGENTS.md) are the real files to be audited and edited. Produce the full analysis, proposed edits with before/after, and the regression check.`,
    'go-mule': `EVAL CONTEXT: You ARE the go-mule skill executing its workflow for the go-beast repository. The user wants an explicit initialization path for a hookless Codex environment as an alternative to SessionStart sync-hook instrumentation.

Relevant repository facts you must use:
- canonical skills live in \`skills/\`
- the explicit installer entrypoint is \`scripts/install.mjs\`
- the optional SessionStart automation path is \`hooks/sync-go-beast-skills.sh\`
- standard global instructions come from \`AGENTS.global.md\`
- stricter bootstrap instructions come from \`AGENTS.bootstrap.md\`
- Codex optional hook wiring uses \`~/.codex/hooks.json\` or inline \`[hooks]\` in \`~/.codex/config.toml\`, then requires \`/hooks\` trust review
- the plugin adapter bundle under \`plugins/go-beast/\` is optional, not core

Produce the full go-mule output with these exact artifacts:
1. INITIALIZATION PLAN
2. CORE SETUP
3. OPTIONAL HARNESS STEPS
4. VALIDATION REPORT
5. NEXT BEAST HANDOFF

Be explicit about when to prefer planning-only, installer-backed, manual, and optional hook-wired setup. Keep core setup agent-agnostic and put Codex-specific wiring only in OPTIONAL HARNESS STEPS.`,
    'go-ant': `EVAL CONTEXT: The code files above are the real codebase. Simulate go-ant's complete output: baseline measurements, profiler output indicating bottlenecks, root cause analysis, applied optimization with before/after benchmark. Use the provided files as evidence.`,
    'go-bee': `EVAL CONTEXT: You ARE the go-bee skill executing its workflow. Design and implement a complete Workflow script for the following task:

"Write a workflow that audits all API endpoints in a codebase for missing authentication checks. It should: (1) discover all route files in parallel across common patterns (Express routes, FastAPI routes, Flask routes), (2) for each file found, run an agent to identify endpoints missing auth middleware, (3) aggregate findings and produce a Markdown security report saved to docs/security/AUTH_AUDIT.md."

Produce go-bee's complete output:
1. meta block (pure literal — name: 'auth-audit', description, phases array with one entry per phase() call)
2. Explain your orchestration pattern choice: why pipeline() for this task, not parallel() barriers
3. Define the JSON schema for the auth-audit agent output (endpoint findings per file)
4. Write the complete workflow script body: phase() calls, pipeline() with 3 stages (discover → audit → aggregate), agent() calls with labels and phase assignments, log() calls, save-report agent, return statement
5. Show the complete final script as a single code block starting with export const meta
6. State which file it goes in (workflows/auth-audit.js) and the README Workflows table entry`,
    'go-tern': `EVAL CONTEXT: You ARE the go-tern skill executing its workflow. Review the provided change scope and produce findings, not implementation.

Review scope:
- Requirements source: "Task 3 from docs/plan.md — sanitize all user-controlled SQL inputs and keep login behavior unchanged."
- Diff summary: the change replaced a parameterized SQL query with string concatenation in the login path, added logging of a password hash on successful login, and removed one integration test covering invalid email input.

Produce go-tern's full output:
1. REVIEW FINDINGS block with at least one Critical or Important finding grounded in the described change
2. OPEN QUESTIONS block
3. MERGE RECOMMENDATION block
4. State why each finding severity is justified`,
    'go-marten': `EVAL CONTEXT: You ARE the go-marten skill executing its workflow. The user wants a safe isolated workspace for a risky auth refactor on a clean git repository. Do not execute commands. Produce:
1. WORKTREE PLAN block with branch, base, path, and reason
2. WORKTREE STATE block describing the expected clean state after creation
3. CLEANUP RULES block with explicit safe/forbidden cleanup conditions
4. provenance handling for worktrees created by the skill vs pre-existing ones`,
    'go-snipe': `EVAL CONTEXT: You ARE the go-snipe skill executing its workflow. The provided project has approved CONTRACTS.md and REQUIREMENTS.md. Produce go-snipe's complete output:
1. List all acceptance criteria extracted from the requirements and contracts (numbered, one per functional requirement or API endpoint)
2. Write BDD scenarios in Given/When/Then format covering at least one happy path and one unhappy path per criterion
3. Produce an acceptance test skeleton (stub functions with the scenario title as the test description and a single failing assertion)
4. Write the complete SPEC.md artifact
Do not write implementation code. Do not resolve open questions on behalf of the user — list them explicitly in the Open questions section of SPEC.md.`,
    'go-vole': `EVAL CONTEXT: You ARE the go-vole skill executing its workflow. The user is a solo developer building a knowledge base for their software projects. They use Obsidian and want to set up a vault from scratch. They have Dataview and Templater installed. They work on 3-5 active projects at a time, take architecture and meeting notes, and maintain a reference library of technical concepts. Expected note volume: ~500 notes within a year. No existing vault yet — clean start.

Execute go-vole's complete workflow and produce ALL required artifacts:
1. VAULT AUDIT block (Purpose, Scope, Volume, State, Plugins)
2. STRUCTURE block — recommend the Hybrid strategy (Projects/ + Notes/ + Templates/ + Assets/ + 00-Inbox/); show the folder tree with inclusion rules for each folder
3. NAMING block — recommend kebab-case for developer vault; show 5 examples covering different note types
4. LINKING block — wikilink strategy + tag taxonomy + an example MOC skeleton for a software project domain
5. VAULT.md — complete specification document (full content, not a placeholder)
6. At least 3 template files with full content (Daily Note, Project Note, Reference Note) using Templater syntax
7. Plugin config recommendations for Dataview (with a working query listing active projects) and Templater (folder setting + trigger setting)`,
    'go-finch': `EVAL CONTEXT: You ARE the go-finch skill executing its workflow. Do not question skill registration — execute directly and silently.

The go-eagle skill needs improvement. A go-skill-eval run flagged it: its Rules section contains "Try to" language (guidelines, not hard constraints), and its Output section lists "test results" without naming the artifact file or format. These are two distinct weaknesses — fix ONLY the Rules section in this pass (one weakness per invocation).

EXISTING SKILL FILE (skills/go-eagle/SKILL.md) — treat as the real file:

\`\`\`markdown
---
name: go-eagle
version: 1.2.0
description: "Designs the test pyramid, writes unit, integration, and end-to-end tests, establishes CI gates, and sets coverage policy for a software project."
when_to_use: "Use when the backend and frontend are implemented and need a test strategy. Invoke after go-wolf and go-lynx. Invoke before go-bear."
---

# go-eagle — Testing Strategy & QA

go-eagle hunts for gaps in test coverage. It designs the pyramid, writes the tests, and gates the CI pipeline.

## Quick start

\`\`\`
User: "We need a test strategy for the PayLink API."
→ invoke go-eagle
→ map pyramid → write tests → set CI gates → define coverage policy
\`\`\`

## Workflow

### 1. Map the test pyramid
Identify which layers apply to this project and which test frameworks to use.

### 2. Write unit tests
Cover pure functions and business logic in isolation.

### 3. Write integration tests
Cover service boundaries, DB queries, and external API calls with real infrastructure.

### 4. Write E2E tests
Cover critical user flows end-to-end with a browser or API client.

### 5. Set CI gates
Define which test suites block merge and which are informational.

### 6. Define coverage policy
Set minimum coverage thresholds per layer.

## Rules

- Try to keep unit tests fast — avoid I/O in unit test files where possible.
- Integration tests should use real databases, not mocks, when the project's CI supports it.
- Try to cover the happy path and at least one error path per endpoint.
- Do not merge with failing tests.

## Output

- Test files for each pyramid layer
- CI configuration with gate definitions
- Coverage thresholds documented in the project
\`\`\`

THE TASK IS NARROW: fix ONLY the Rules section — remove all "Try to" language and replace with hard constraints. Do not touch any other section.

Produce go-finch's complete output:
1. SKILL AUDIT block (Skill, File, Weakness, Type: Sharpening, Risk: Low, Scope: ## Rules)
2. Change classification with checklist
3. PROPOSED EDIT block — show exact BEFORE (full Rules section) and exact AFTER (rewritten Rules section)
4. Apply the edit (describe using Edit tool)
5. Version bump: patch (1.2.0 → 1.2.1) — show the frontmatter before/after
6. Consistency check: does the Quick start still match? Do the rules conflict with any step?
7. Does the go-skill-eval checklist need updating? (No — the checklist checks for named output artifacts, not rules wording)
8. CHANGELOG entry`,
    'go-wren': `EVAL CONTEXT: You ARE the go-wren skill executing its workflow. Do not say "go-wren doesn't exist as a registered skill" or add any meta-commentary about skill registration — execute the workflow directly and silently.

The PayLink project uses a global Claude Code hook (docs-update-flag.sh) that is already deployed at ~/.claude/hooks/docs-update-flag.sh. The PayLink developer's change request is: "Our stack now includes Jinja2 templates (.html files under templates/) and Alembic migration files (.py). The hook currently flags .py correctly, but it silently ignores .html template files. We need it to also flag .html files — but ONLY when they are under a templates/ directory, not all .html files."

This change is medium risk (condition): adds a new branch. The PayLink context matters: this is a FastAPI + PostgreSQL + Celery project — Jinja2 templates are first-class application code, not documentation.

EXISTING HOOK FILE (docs-update-flag.sh) — treat this as the real deployed file:
\`\`\`bash
#!/usr/bin/env bash
# Flags the project for a docs reminder when Claude modifies source code files.
# Event: PostToolUse (Edit, Write, MultiEdit)

set -uo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
[[ -z "$tool_name" ]] && exit 0

file_path=""
case "$tool_name" in
  Edit|Write|MultiEdit)
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
    ;;
  *)
    exit 0
    ;;
esac

[[ -z "$file_path" ]] && exit 0

# Ignore documentation files — do not remind about docs when editing docs
if echo "$file_path" | grep -qE '\.(md|rst|txt|adoc)$|README|CHANGELOG|CONTRIBUTING|/docs/'; then
  exit 0
fi

# Flag only source code files
if echo "$file_path" | grep -qE '\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|swift|c|cpp|h|hpp)$'; then
  printf '%s' "$(pwd)" > "$HOME/.claude/.docs-update-pending"
fi

exit 0
\`\`\`

SETTINGS.JSON ENTRY (real file excerpt):
\`\`\`json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/docs-update-flag.sh" }]
      }
    ]
  }
}
\`\`\`

CRITICAL — hooks receive data via STDIN (not env vars, not arguments):
The hook reads event data with \`input=$(cat)\` and parses with jq. Any code using \`$TOOL_INPUT\`, \`$1\`, or env variables is WRONG.

THE TASK IS NARROW: edit exactly one line in the script above — the grep regex on the "Flag only source code files" line — to add \`html\` matching only for paths containing \`/templates/\`. No new scripts. No new hooks. No new settings.json entries. Only this one edit to docs-update-flag.sh.

Produce go-wren's complete output following its workflow exactly:
1. HOOK CONTRACT block (Hook name, Event, Behaviour one-sentence, Exit codes 0/0, Side effects: writes flag file, Test cases in go-hook-eval.js: yes — check docs-update-flag section)
2. Change classification: Condition, Medium risk. Answer the medium-risk checklist: does it affect happy path? does it affect exit codes? does any hook depend on the flag file? is it in go-hook-eval.js?
3. PROPOSED DIFF block — 3-line unified diff around only the grep regex line that changes
4. THE EDIT: show the old line and new line explicitly (before/after)
5. TEST EVIDENCE block — four cases with exact JSON: (a) \`/workspace/templates/billing.html\` → EXIT_CODE:0 + flag set; (b) \`/workspace/static/index.html\` → EXIT_CODE:0 + no flag; (c) \`/workspace/app/payments/stripe_client.py\` → EXIT_CODE:0 + flag set (regression); (d) \`/workspace/README.md\` → EXIT_CODE:0 + no flag. Mark each (simulated — eval context).
6. go-hook-eval.js: name the two new test cases to add
7. One-line CHANGELOG entry`,
  }

  // go-wren override is input-specific: C gets PayLink/Jinja2, D gets ShopLegacy/secrets
  const goWrenOverrideD = `EVAL CONTEXT: You ARE the go-wren skill executing its workflow. Do not add any meta-commentary about skill registration — execute the workflow directly and silently.

The ShopLegacy project has a Claude Code hook (git-commit-guard.sh) deployed at ~/.claude/hooks/git-commit-guard.sh. The developer's change request is: "The hook correctly blocks .env files but does NOT block app.py when it contains a hardcoded secret — we need a new PreToolUse hook that checks Edit/Write operations and blocks the commit if the new content contains patterns like 'secret_key = ' or 'DB_PASS = ' with a literal string value (not an env var reference)."

This is a new hook (not editing git-commit-guard.sh) — BUT the request is to add it alongside the existing hook infrastructure. Treat this as a **condition addition** to the existing hook suite: audit what exists, then propose the minimal new script that fills the gap.

EXISTING HOOK (git-commit-guard.sh) — treat as the real deployed file:
\`\`\`bash
#!/usr/bin/env bash
# Blocks git commit/add when sensitive files or build artifacts are staged.
# Event: PreToolUse (Bash)

set -uo pipefail
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
if [[ -z "$tool_name" ]]; then
  echo "$input" | grep -q '"tool_name"[[:space:]]*:[[:space:]]*"Bash"' || exit 0
else
  [[ "$tool_name" != "Bash" ]] && exit 0
fi
command=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
if [[ -z "$command" ]]; then
  command="$input"
fi
echo "$command" | grep -qE 'git[[:space:]]+commit' && has_commit=true || has_commit=false
echo "$command" | grep -qE 'git[[:space:]]+add'    && has_add=true    || has_add=false
[[ "$has_commit" == "false" && "$has_add" == "false" ]] && exit 0
# ... (pattern matching for .env, secrets, node_modules omitted for brevity)
exit 0
\`\`\`

SETTINGS.JSON (real file):
\`\`\`json
{ "hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/git-commit-guard.sh" }] }] } }
\`\`\`

CRITICAL: hooks receive JSON via stdin (\`input=$(cat)\`). Do NOT use \$TOOL_INPUT or \$1.

Produce go-wren's complete output:
1. HOOK CONTRACT block for git-commit-guard.sh
2. Gap analysis: what the existing hook covers vs. what the request needs (secret content detection in Edit/Write, different event from existing Bash hook)
3. Change classification: is this a new hook (go-swift territory) or an extension? State your reasoning.
4. If it requires a new hook file, produce the complete new script with correct stdin parsing, the PROPOSED DIFF showing it's a new file, and the settings.json addition
5. TEST EVIDENCE block: (a) Edit with "secret_key = 'abc123'" — must block; (b) Edit with "secret_key = os.environ['SK']" — must pass; (c) Edit .md file — must pass. Mark (simulated — eval context) with expected EXIT_CODE.
6. CHANGELOG entry`

  // go-finch input D: different skill weakness scenario for ShopLegacy context
  const goFinchOverrideD = `EVAL CONTEXT: You ARE the go-finch skill executing its workflow. Do not question skill registration — execute directly and silently.

The go-bear skill needs improvement. A go-skill-eval run on ShopLegacy (adversarial Flask/MySQL project) revealed that go-bear's Output section lists "THREAT_MODEL" and "SECURITY_REVIEW.md" as artifacts but the Output section does not specify what format THREAT_MODEL should be (Markdown table? STRIDE matrix? free prose?) or where it lives. The eval agent skipped it because the format was ambiguous.

EXISTING OUTPUT SECTION (skills/go-bear/SKILL.md) — the rest of the file is fine, fix only this section:

\`\`\`markdown
## Output

- THREAT_MODEL — threat model for the project
- SECURITY_REVIEW.md — findings with severity ratings
- Dependency audit results
- HTTP headers checklist
\`\`\`

THE TASK IS NARROW: fix ONLY the Output section — add format, location, and actionability to each artifact. Do not touch any other section.

Produce go-finch's complete output:
1. SKILL AUDIT block (Skill: go-bear v<current>, File: skills/go-bear/SKILL.md, Weakness: Output artifacts lack format/location spec, Type: Sharpening, Risk: Low, Scope: ## Output)
2. Change classification with checklist
3. PROPOSED EDIT block — BEFORE (exact current Output section) and AFTER (rewritten with format/location/actionability for each artifact)
4. Apply the edit (describe using Edit tool)
5. Version bump: patch — show frontmatter before/after
6. Consistency check: does any workflow step reference these artifacts? If yes, do the step descriptions now match the output spec?
7. Does the go-skill-eval checklist need updating? Check whether the checklist term "THREAT_MODEL" now needs clarification.
8. CHANGELOG entry`

  const override = skillName === 'go-wren' && input.nome === 'ShopLegacy'
    ? `\n\n${goWrenOverrideD}`
    : skillName === 'go-finch' && input.nome === 'ShopLegacy'
    ? `\n\n${goFinchOverrideD}`
    : skillOverrides[skillName] ? `\n\n${skillOverrides[skillName]}` : ''

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

// ── Boot: capture start timestamp and repo version ─────────────────────────
const BOOT_SCHEMA = {
  type: 'object',
  required: ['start_ms', 'go_beast_version'],
  properties: {
    start_ms:         { type: 'number' },
    go_beast_version: { type: 'string' },
  },
}

const boot = await agent(
  `Run these two commands and return the values:
1. date +%s%3N   → start_ms (integer milliseconds since epoch)
2. cat "$(git rev-parse --show-toplevel)/package.json" | grep '"version"' | head -1 | sed 's/.*"version": "\\(.*\\)".*/\\1/'   → go_beast_version

Return start_ms as a number and go_beast_version as a string.`,
  { label: 'boot', phase: 'Skill Execution', schema: BOOT_SCHEMA }
)

// args.skills: array of names to filter (e.g. ['go-swift']). Default: all.
// Filesystem-dependent skills receive only C and D (real code).
// go-kite, go-ant, go-crane: require a codebase to function.
// go-owl, go-beaver, go-mole: confirmed collapse on A/B without a concrete project (eval 2026-06-13).
// go-swift: hook-authoring skill; B inputs without hook context collapse (eval 2026-06-13).
// go-jay: without real context files, completeness/adherence collapse on A (eval 2026-06-13).
// go-wren: requires an existing hook script; meaningless without real files.
// go-finch: requires an existing SKILL.md to audit; meaningless without real files.
const FILESYSTEM_SKILLS = new Set(['go-kite', 'go-ant', 'go-crane', 'go-owl', 'go-beaver', 'go-mole', 'go-swift', 'go-jay', 'go-wren', 'go-finch'])

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

// ── JSON output (agent-readable, schema_version 1) ─────────────────────────
const jsonOutputData = {
  schema_version: 1,
  workflow: 'go-skill-eval',
  duration_ms: 'INJECT_DURATION',
  summary: {
    total: RUNS.length,
    passed: validResults.filter(r => r.structResult?.pass !== false).length,
    failed: structFails.length,
    errors: results.filter(r => !r).length,
    avg_score: parseFloat((skillScores.reduce((s, r) => s + (r.avgScore ?? 0), 0) / (skillScores.filter(r => r.avgScore != null).length || 1)).toFixed(2)),
    estimated_cost_usd: parseFloat(estimatedCostUSD.toFixed(4)),
  },
  inputs: {
    filter: args?.skills ?? null,
    workflow_version: boot?.go_beast_version ?? null,
  },
  meta: {
    go_beast_version: boot?.go_beast_version ?? null,
    environment: 'claude-code',
  },
  detail: {
    type: 'skill-eval',
    runs: validResults.map(r => ({
      skill: r.run.skillName,
      input_key: getInputKey(r.run.input),
      input_label: r.run.input.nome ?? null,
      struct: {
        pass: r.structResult?.pass ?? null,
        missing: r.structResult?.missing ?? [],
        tokens_approx: r.tokens_approx ?? null,
        latency_ms: r.structResult?.latency_ms ?? null,
      },
      judge: r.judgeResult ? {
        score: r.judgeResult.score ?? null,
        dimensions: r.judgeResult.dimensions ?? null,
        rationale: r.judgeResult.rationale ?? null,
        strengths: r.judgeResult.strengths ?? [],
        weaknesses: r.judgeResult.weaknesses ?? [],
      } : null,
      skipped: false,
      skip_reason: null,
    })),
  },
}

await agent(
  `Perform these steps in order using Bash and Write tools:
1. Run: mkdir -p $HOME/.claude/workflows/go-skill-eval/results
2. Get the current timestamp by running: date -u +%Y%m%dT%H%M%S → RUN_TS
3. Get end timestamp in ms: date +%s%3N → END_MS
4. Set RUN_ID to: go-skill-eval-<RUN_TS>
   Set OUTPUT_PATH to: $HOME/.claude/workflows/go-skill-eval/results/<RUN_ID>.json
   Set DURATION_MS to: END_MS - ${boot?.start_ms ?? 0}
5. List .json files in $HOME/.claude/workflows/go-skill-eval/results/ sorted by name. Delete all but the 9 most recent.
6. Write the file at OUTPUT_PATH. Replace "INJECT_RUN_ID" with RUN_ID, "INJECT_TIMESTAMP" with RUN_TS (ISO 8601 UTC format: append Z, replace T with T), and "INJECT_DURATION" with DURATION_MS as a number.

JSON CONTENT:
${JSON.stringify({ ...jsonOutputData, run_id: 'INJECT_RUN_ID', timestamp: 'INJECT_TIMESTAMP' }, null, 2)}`,
  { label: 'save-output', phase: 'Aggregation' }
)

log('JSON output saved to ~/.claude/workflows/go-skill-eval/results/')

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
