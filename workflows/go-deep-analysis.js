export const meta = {
  name: 'go-deep-analysis',
  description: 'Performs deep multi-dimensional analysis of a codebase and produces a complete Markdown document for each dimension: architecture, security, performance, testing, documentation gaps, and dependency health.',
  phases: [
    { title: 'Discovery', detail: 'Reads repo structure, tech stack, and key files' },
    { title: 'Analysis', detail: 'Runs all 6 dimension analyses in parallel' },
    { title: 'Documentation', detail: 'Saves each analysis as a Markdown doc' },
    { title: 'Aggregation', detail: 'Writes index and returns summary' },
  ],
}

// args.repoPath  — absolute path to the repository root (required)
// args.outputDir — where to write docs (default: <repoPath>/docs/analysis)
// args.dimensions — array to filter, e.g. ['architecture','security'] (default: all 6)

const REPO = args?.repoPath
if (!REPO) {
  log('ERROR: args.repoPath is required')
  return { error: 'args.repoPath is required' }
}

const OUTPUT_DIR = args?.outputDir ?? `${REPO}/docs/analysis`

const ALL_DIMENSIONS = [
  {
    id: 'architecture',
    title: 'Architecture',
    focus: `Analyze the codebase architecture. Cover:
- High-level component structure and responsibilities
- Design patterns in use (MVC, layered, event-driven, etc.)
- Module boundaries and coupling
- Data flow between components
- Identified architectural risks or anti-patterns
- Recommendations for improvement`,
  },
  {
    id: 'security',
    title: 'Security',
    focus: `Perform a security analysis of the codebase. Cover:
- OWASP Top 10 surface scan (injection, auth, XSS, etc.)
- Hardcoded secrets, credentials, or sensitive values
- Authentication and authorization patterns
- Input validation and sanitization
- Dependency vulnerabilities (based on package manifests found)
- Security debt and remediation priority`,
  },
  {
    id: 'performance',
    title: 'Performance',
    focus: `Analyze performance characteristics and potential bottlenecks. Cover:
- Database query patterns (N+1 risks, missing indexes)
- Synchronous blocking operations that could be async
- Bundle size and lazy loading (for frontend code)
- Caching opportunities
- Memory allocation patterns
- Identified hotspots and optimization priority`,
  },
  {
    id: 'testing',
    title: 'Testing',
    focus: `Analyze the testing strategy and coverage. Cover:
- Test pyramid assessment (unit vs integration vs E2E ratio)
- Missing test coverage for critical paths
- Test quality issues (flaky patterns, mock overuse, no assertions)
- CI gate configuration
- Hardest-to-test areas and why
- Recommended test additions by priority`,
  },
  {
    id: 'documentation',
    title: 'Documentation Gaps',
    focus: `Audit documentation completeness. Cover:
- Missing or outdated README sections
- Undocumented public APIs and functions
- Missing architecture decision records (ADRs)
- Onboarding documentation gaps
- Runbook and operational docs status
- Documentation debt ranked by impact`,
  },
  {
    id: 'dependencies',
    title: 'Dependency Health',
    focus: `Analyze dependency health. Cover:
- Outdated packages (major/minor/patch lag)
- Known vulnerability surface (based on package manifest)
- Unused or redundant dependencies
- License compatibility issues
- Packages with no recent maintenance
- Upgrade priority and effort estimate`,
  },
]

const dimFilter = args?.dimensions ?? null
const DIMENSIONS = ALL_DIMENSIONS.filter(d => !dimFilter || dimFilter.includes(d.id))

if (DIMENSIONS.length === 0) {
  log('No dimensions matched the filter.')
  return { total: 0, files: [] }
}

// ── Schema for discovery agent ─────────────────────────────────────────────
const DISCOVERY_SCHEMA = {
  type: 'object',
  required: ['structure_summary', 'tech_stack', 'key_files', 'repo_summary'],
  properties: {
    structure_summary: { type: 'string' },
    tech_stack: { type: 'array', items: { type: 'string' } },
    key_files: { type: 'array', items: { type: 'string' } },
    repo_summary: { type: 'string' },
  },
}

// ── Phase 1: Discovery ─────────────────────────────────────────────────────
phase('Discovery')
log(`Scanning repository: ${REPO}`)

const discovery = await agent(
  `Analyze the repository at ${REPO} to build context for a deep analysis.

Use mcp__filesystem__list_directory and mcp__filesystem__read_text_file to explore:
1. Root directory structure (list ${REPO})
2. Key config files: package.json, pyproject.toml, Cargo.toml, go.mod, tsconfig.json, Dockerfile, docker-compose.yml, .github/workflows/
3. README.md (first 100 lines)
4. Main source directory structure (src/, lib/, app/, or equivalent)

Return a structured summary with:
- structure_summary: 2-3 sentence description of how the repo is organized
- tech_stack: array of detected languages, frameworks, and key tools
- key_files: array of the 10 most important files for analysis (absolute paths)
- repo_summary: one paragraph describing what this project does`,
  { label: 'discover', phase: 'Discovery', schema: DISCOVERY_SCHEMA }
)

if (!discovery) {
  log('Discovery failed — cannot proceed.')
  return { error: 'Discovery failed', repoPath: REPO }
}

log(`Detected stack: ${discovery.tech_stack.join(', ')}`)
log(`Running ${DIMENSIONS.length} dimension analyses in parallel...`)

// ── Phase 2: Analysis ─────────────────────────────────────────────────────
// All dimensions are independent → parallel() for maximum throughput.
// We need ALL results together for the index → genuine barrier.
phase('Analysis')

const analysisResults = await parallel(
  DIMENSIONS.map(dim => async () => {
    const content = await agent(
      `You are performing a deep ${dim.title} analysis of a software repository.

REPOSITORY: ${REPO}
TECH STACK: ${discovery.tech_stack.join(', ')}
STRUCTURE: ${discovery.structure_summary}
KEY FILES: ${discovery.key_files.join(', ')}
PROJECT: ${discovery.repo_summary}

${dim.focus}

Use mcp__filesystem__read_text_file to read relevant source files before making claims.
Read at minimum 3-5 files most relevant to ${dim.title.toLowerCase()} analysis.

Produce a COMPLETE Markdown document with:
# ${dim.title} Analysis — <Project Name>

## Executive Summary
<2-3 sentences on the overall state>

## Findings
<Detailed findings organized by sub-topic, with specific file references>

## Issues by Severity
### Critical
### High
### Medium
### Low / Info

## Recommendations
<Prioritized, actionable recommendations with effort estimates>

## Conclusion
<One paragraph summary>`,
      { label: `analyze-${dim.id}`, phase: 'Analysis' }
    )
    if (!content) return null
    return { dim, content }
  })
)

const validResults = analysisResults.filter(Boolean)
if (validResults.length === 0) {
  log('All analyses failed.')
  return { total: 0, files: [] }
}

log(`${validResults.length}/${DIMENSIONS.length} analyses completed.`)

// ── Phase 3: Documentation ─────────────────────────────────────────────────
phase('Documentation')

const savedFiles = await parallel(
  validResults.map(r => async () => {
    const filePath = `${OUTPUT_DIR}/${r.dim.id}.md`
    await agent(
      `Save the following Markdown content to ${filePath}.
Create directories if needed using mcp__filesystem__create_directory or Bash mkdir.
Use the Write tool (mcp__filesystem__write_file or the Write tool) to write the file.

CONTENT:
${r.content}`,
      { label: `save-${r.dim.id}`, phase: 'Documentation' }
    )
    return { id: r.dim.id, title: r.dim.title, path: filePath }
  })
)

const validFiles = savedFiles.filter(Boolean)

// ── Phase 4: Aggregation ──────────────────────────────────────────────────
phase('Aggregation')

const indexLines = []
indexLines.push(`# Deep Analysis — ${discovery.repo_summary.split('.')[0]}`)
indexLines.push('')
indexLines.push(`> Auto-generated by go-deep-analysis workflow.`)
indexLines.push('')
indexLines.push(`**Repository:** \`${REPO}\``)
indexLines.push(`**Tech stack:** ${discovery.tech_stack.join(', ')}`)
indexLines.push('')
indexLines.push(`## Analysis Documents`)
indexLines.push('')
indexLines.push(`| Dimension | Document |`)
indexLines.push(`|---|---|`)
for (const f of validFiles) {
  indexLines.push(`| ${f.title} | [${f.id}.md](./${f.id}.md) |`)
}
indexLines.push('')
indexLines.push(`## Repository Overview`)
indexLines.push('')
indexLines.push(discovery.repo_summary)
indexLines.push('')
indexLines.push(`### Structure`)
indexLines.push('')
indexLines.push(discovery.structure_summary)

const indexPath = `${OUTPUT_DIR}/index.md`
await agent(
  `Save the following Markdown to ${indexPath}.
Create directories if needed. Use the Write tool.

CONTENT:
${indexLines.join('\n')}`,
  { label: 'save-index', phase: 'Aggregation' }
)

log(`Analysis complete. ${validFiles.length} documents written to ${OUTPUT_DIR}`)

return {
  total: validFiles.length,
  outputDir: OUTPUT_DIR,
  files: validFiles.map(f => f.path),
  techStack: discovery.tech_stack,
  repoSummary: discovery.repo_summary,
}
