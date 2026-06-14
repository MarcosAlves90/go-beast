export const meta = {
  name: 'go-hook-eval',
  description: 'Tests go-beast hooks with positive, negative, and edge cases (jq fallback, literal newlines)',
  phases: [
    { title: 'Hook Tests', detail: 'Runs all test cases in parallel' },
    { title: 'Aggregation', detail: 'Consolidates results and generates report' },
  ],
}

// ─── Infrastructure ────────────────────────────────────────────────────────

const HOOKS_DIR = `${args?.home ?? "/Users/marcos.lopes"}/.claude/hooks`

// Serialize a JS object as JSON with escaped newlines (the format the runtime sends)
function json(obj) {
  return JSON.stringify(obj)
}

// Serialize with LITERAL unescaped newlines — reproduces the original jq bug
function jsonWithLiteralNewlines(obj) {
  return JSON.stringify(obj).replace(/\\n/g, '\n')
}

function bashInput(command) {
  return json({ tool_name: 'Bash', tool_input: { command } })
}

function editInput(filePath, newString = 'function myFunc() {}') {
  return json({ tool_name: 'Edit', tool_input: { file_path: filePath, new_string: newString, old_string: '' } })
}

function writeInput(filePath, content = 'function myFunc() {}') {
  return json({ tool_name: 'Write', tool_input: { file_path: filePath, content } })
}

function stopInput(stopHookActive = false) {
  return json({ stop_hook_active: stopHookActive })
}

function otherToolInput() {
  return json({ tool_name: 'Read', tool_input: { file_path: '/some/file.ts' } })
}

// ─── Test case definitions ─────────────────────────────────────────────────

const TESTS = [

  // ── git-strip-coauthored ─────────────────────────────────────────────────
  {
    hook: 'git-strip-coauthored.sh',
    name: 'blocks Co-Authored-By in commit (valid JSON)',
    input: bashInput('git commit -m "fix: something\\nCo-Authored-By: Claude <noreply@anthropic.com>"'),
    expectExit: 1,
    expectOutput: 'Co-Authored-By',
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'blocks Co-Authored-By via heredoc (literal newlines)',
    input: jsonWithLiteralNewlines({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "$(cat <<\'EOF\'\nfix: something\nCo-Authored-By: Claude\nEOF\n)"' },
    }),
    expectExit: 1,
    expectOutput: 'Co-Authored-By',
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'passes clean commit',
    input: bashInput('git commit -m "fix: clean message"'),
    expectExit: 0,
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'ignores tool != Bash',
    input: otherToolInput(),
    expectExit: 0,
  },

  // ── git-commit-guard ─────────────────────────────────────────────────────
  {
    hook: 'git-commit-guard.sh',
    name: 'blocks git add .env',
    input: bashInput('git add .env'),
    expectExit: 1,
    expectOutput: '.env',
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'blocks git add secrets.json',
    input: bashInput('git add config/secrets.json'),
    expectExit: 1,
    expectOutput: 'secrets',
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'blocks git add node_modules/',
    input: bashInput('git add node_modules/lodash/index.js'),
    expectExit: 1,
    expectOutput: 'node_modules',
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'passes .env.example (safe file)',
    input: bashInput('git add .env.example'),
    expectExit: 0,
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'passes git add source file',
    input: bashInput('git add src/main.ts'),
    expectExit: 0,
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'blocks with literal newlines in JSON',
    input: jsonWithLiteralNewlines({
      tool_name: 'Bash',
      tool_input: { command: 'git add .env\n' },
    }),
    expectExit: 1,
    expectOutput: '.env',
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'ignores tool != Bash',
    input: otherToolInput(),
    expectExit: 0,
  },

  // ── code-dedup-check ─────────────────────────────────────────────────────
  // Note: this hook greps PROJECT_DIR — uses /tmp to avoid collisions
  {
    hook: 'code-dedup-check.sh',
    name: 'passes function with no duplicate in empty project',
    input: writeInput('/tmp/hook-eval-test.ts', 'export function uniqueFunctionXyzAbc123() { return 1; }'),
    expectExit: 0,
    cwd: '/tmp',
  },
  {
    hook: 'code-dedup-check.sh',
    name: 'passes non-code file (.md)',
    input: writeInput('/tmp/README.md', '# Hello'),
    expectExit: 0,
    cwd: '/tmp',
  },
  {
    hook: 'code-dedup-check.sh',
    name: 'passes when tool != Edit|Write',
    input: otherToolInput(),
    expectExit: 0,
    cwd: '/tmp',
  },
  {
    hook: 'code-dedup-check.sh',
    name: 'passes content with no extractable declarations',
    input: writeInput('/tmp/hook-eval-test.ts', 'const x = 1; const y = 2;'),
    expectExit: 0,
    cwd: '/tmp',
  },

  // ── docs-update-flag ─────────────────────────────────────────────────────
  {
    hook: 'docs-update-flag.sh',
    name: 'creates flag for .ts file',
    input: editInput('/workspace/src/app.ts'),
    expectExit: 0,
    expectFlagAfter: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
  },
  {
    hook: 'docs-update-flag.sh',
    name: 'does not create flag for .md file',
    input: editInput('/workspace/README.md', '# Docs update'),
    expectExit: 0,
    expectNoFlag: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
  },
  {
    hook: 'docs-update-flag.sh',
    name: 'ignores tool != Edit|Write|MultiEdit',
    input: otherToolInput(),
    expectExit: 0,
  },

  // ── code-verify-flag ─────────────────────────────────────────────────────
  {
    hook: 'code-verify-flag.sh',
    name: 'creates flag for .py file',
    input: editInput('/workspace/src/app.py'),
    expectExit: 0,
    expectFlagAfter: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
  },
  {
    hook: 'code-verify-flag.sh',
    name: 'does not create flag for .md file',
    input: editInput('/workspace/README.md', '# Docs'),
    expectExit: 0,
    expectNoFlag: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
  },
  {
    hook: 'code-verify-flag.sh',
    name: 'creates flag for .go file',
    input: editInput('/workspace/main.go'),
    expectExit: 0,
    expectFlagAfter: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
  },

  // ── docs-update-remind ───────────────────────────────────────────────────
  {
    hook: 'docs-update-remind.sh',
    name: 'silent when no flag file',
    setup: `rm -f ${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
    input: stopInput(false),
    expectExit: 0,
    expectNoOutput: 'Reminder',
  },
  {
    hook: 'docs-update-remind.sh',
    name: 'shows reminder when flag exists (exit 2 — re-triggers Claude)',
    setup: `echo /tmp > ${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
    input: stopInput(false),
    expectExit: 2,
    expectOutput: 'Reminder',
  },
  {
    hook: 'docs-update-remind.sh',
    name: 'respects stop_hook_active=true',
    setup: `echo /tmp > ${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
    input: stopInput(true),
    expectExit: 0,
    expectNoOutput: 'Reminder',
  },

  // ── code-verify-run ──────────────────────────────────────────────────────
  {
    hook: 'code-verify-run.sh',
    name: 'exit 0 when no flag file',
    setup: `rm -f ${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
    input: stopInput(false),
    expectExit: 0,
  },
  {
    hook: 'code-verify-run.sh',
    name: 'exit 0 with stop_hook_active=true (prevents loop)',
    // No flag — hook exits immediately on stop_hook_active before checking the flag
    input: stopInput(true),
    expectExit: 0,
  },
  {
    hook: 'code-verify-run.sh',
    name: 'exit 0 with flag pointing to dir with no recognized project',
    setup: `echo /tmp > ${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
    input: stopInput(false),
    expectExit: 0, // /tmp has no package.json, go.mod, etc — HAS_CHECKS=false → exit 0
  },
]

// ─── Runner ───────────────────────────────────────────────────────────────

const TEST_SCHEMA = {
  type: 'object',
  required: ['passed', 'exit_code', 'stdout', 'stderr', 'detail'],
  properties: {
    passed: { type: 'boolean' },
    exit_code: { type: 'number' },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
    detail: { type: 'string' },
  },
}

phase('Hook Tests')
log(`Running ${TESTS.length} test cases in parallel...`)

const results = await parallel(
  TESTS.map(t => async () => {
    const setupCmd = t.setup ? `${t.setup} && ` : ''
    const cwd = t.cwd ?? `${args?.home ?? "/Users/marcos.lopes"}/Documents/@cherry-c/go-beast`
    // Limpa flags antes do teste — tanto expectFlagAfter quanto expectNoFlag precisam de estado limpo
    const flagsToClean = [t.expectFlagAfter, t.expectNoFlag].filter(Boolean)
    const flagCleanBefore = flagsToClean.length > 0 ? flagsToClean.map(f => `rm -f ${f}`).join(' && ') + ' && ' : ''

    const prompt = `You are an automated test agent. Execute the steps below exactly and return the requested JSON. This is a controlled hook script test — hooks read stdin and exit immediately, they do not modify production files.

STEP 1 — Setup:
\`\`\`bash
${setupCmd}${flagCleanBefore}true
\`\`\`

STEP 2 — Run the hook passing input via stdin and capture the exit code:
\`\`\`bash
cd ${cwd} && echo ${JSON.stringify(t.input)} | bash ${HOOKS_DIR}/${t.hook}; echo "EXIT_CODE:$?"
\`\`\`

STEP 3 — Check flag file (if applicable):
${t.expectFlagAfter ? `\`\`\`bash\nls ${t.expectFlagAfter} 2>/dev/null && echo "FLAG_EXISTS" || echo "FLAG_ABSENT"\n\`\`\`` : '(skip this step)'}
${t.expectNoFlag ? `\`\`\`bash\nls ${t.expectNoFlag} 2>/dev/null && echo "FLAG_EXISTS" || echo "FLAG_ABSENT"\n\`\`\`` : '(skip this step)'}

ANALYSIS — verify each condition:
- expected exit_code: ${t.expectExit}
- output must contain: ${t.expectOutput ?? '(none)'}
- output must NOT contain: ${t.expectNoOutput ?? '(none)'}
- flag must exist after execution: ${t.expectFlagAfter ?? '(do not check)'}
- flag must NOT exist after execution: ${t.expectNoFlag ?? '(do not check)'}

Return ONLY the structured JSON with:
- passed: true only if ALL conditions above are satisfied
- exit_code: actual numeric exit code (extract from "EXIT_CODE:N" in the output)
- stdout: first 300 chars of the hook's stdout
- stderr: first 200 chars of stderr (if any)
- detail: one sentence explaining why passed=true or which specific condition failed`

    const result = await agent(prompt, {
      label: `${t.hook}::${t.name}`,
      phase: 'Hook Tests',
      schema: TEST_SCHEMA,
    })

    return { test: t, result }
  })
)

// ─── Aggregation ──────────────────────────────────────────────────────────

phase('Aggregation')
log('Consolidating results...')

const valid = results.filter(Boolean)
const passed = valid.filter(r => r.result?.passed === true)
const failed = valid.filter(r => r.result?.passed === false)

// Group by hook
const byHook = {}
for (const r of valid) {
  const h = r.test.hook
  if (!byHook[h]) byHook[h] = { pass: 0, fail: 0, cases: [] }
  if (r.result?.passed) byHook[h].pass++
  else byHook[h].fail++
  byHook[h].cases.push(r)
}

const lines = []
lines.push(`# hook-eval Report\n`)
lines.push(`**Hooks tested:** ${Object.keys(byHook).length} | **Total cases:** ${valid.length} | **Pass:** ${passed.length} | **Fail:** ${failed.length}\n`)
lines.push(`---\n`)

lines.push(`## 1. Results per Case\n`)
lines.push(`| Hook | Case | Status | Exit | Detail |`)
lines.push(`|---|---|---|---|---|`)
for (const r of valid) {
  const status = r.result?.passed ? '✅' : '❌'
  const exit = r.result?.exit_code ?? '?'
  const detail = (r.result?.detail ?? '').slice(0, 80)
  lines.push(`| ${r.test.hook} | ${r.test.name} | ${status} | ${exit} | ${detail} |`)
}

lines.push(`\n## 2. Summary per Hook\n`)
lines.push(`| Hook | Pass | Fail | Status |`)
lines.push(`|---|---|---|---|`)
for (const [hook, s] of Object.entries(byHook)) {
  const status = s.fail === 0 ? '✅ OK' : `⚠️ ${s.fail} failure(s)`
  lines.push(`| ${hook} | ${s.pass} | ${s.fail} | ${status} |`)
}

if (failed.length > 0) {
  lines.push(`\n## 3. Failure Details\n`)
  for (const r of failed) {
    lines.push(`### ❌ ${r.test.hook} — ${r.test.name}`)
    lines.push(`- **Expected exit:** ${r.test.expectExit} | **Got:** ${r.result?.exit_code ?? '?'}`)
    lines.push(`- **Detail:** ${r.result?.detail ?? 'n/a'}`)
    if (r.result?.stdout) lines.push(`- **Stdout:** \`${r.result.stdout.slice(0, 200)}\``)
    if (r.result?.stderr) lines.push(`- **Stderr:** \`${r.result.stderr.slice(0, 200)}\``)
    lines.push('')
  }
}

lines.push(`\n## 4. Coverage\n`)
lines.push(`| Test case | Coverage |`)
lines.push(`|---|---|`)
lines.push(`| Correct blocker (exit 1 expected) | ${valid.filter(r => r.test.expectExit === 1).length} cases |`)
lines.push(`| Correct pass-through (exit 0 expected) | ${valid.filter(r => r.test.expectExit === 0).length} cases |`)
lines.push(`| jq fallback (literal newlines) | ${valid.filter(r => r.test.name.includes('literal newlines')).length} cases |`)
lines.push(`| Flag file check | ${valid.filter(r => r.test.expectFlagAfter || r.test.expectNoFlag).length} cases |`)
lines.push(`| stop_hook_active | ${valid.filter(r => r.test.name.includes('stop_hook_active')).length} cases |`)

const reportContent = lines.join('\n')

await agent(
  `Save the following Markdown content to the file ~/.claude/workflows/hook-eval/reports/report.md (create directories if needed). Use the Write tool to write the file.

CONTENT:
${reportContent}`,
  { label: 'save-report', phase: 'Aggregation' }
)

log('Report saved to ~/.claude/workflows/hook-eval/reports/report.md')

return {
  total: valid.length,
  passed: passed.length,
  failed: failed.length,
  failedCases: failed.map(r => `${r.test.hook}::${r.test.name}`),
}
