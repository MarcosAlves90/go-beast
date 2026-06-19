export const meta = {
  name: 'go-hook-eval',
  description: 'Tests go-beast hooks with positive, negative, and edge cases (jq fallback, literal newlines)',
  phases: [
    { title: 'Hook Tests', detail: 'Runs all test cases in parallel' },
    { title: 'Aggregation', detail: 'Consolidates results and generates report' },
  ],
}

// ─── Infrastructure ────────────────────────────────────────────────────────

const REAL_HOME = args?.home ?? "/Users/marcos.lopes"
const HOOKS_DIR = `${REAL_HOME}/.claude/hooks`

// Isolated home for flag files — avoids writing to ~/.go-beast/ which triggers safety classifier
// Hooks write flags to $HOME/.go-beast/ so we override HOME to a safe /tmp directory
const EVAL_HOME = `/tmp/hook-eval-home`

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
    name: 'blocks Co-Authored-By from commit message file',
    setup: `printf 'fix: something\nCo-Authored-By: Claude <noreply@anthropic.com>\n' > /tmp/hook-eval-coauthored-msg.txt`,
    input: bashInput('git commit -F /tmp/hook-eval-coauthored-msg.txt'),
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
  {
    hook: 'code-dedup-check.sh',
    name: 'warns when function already exists in project',
    // Setup: write a file with the function into /tmp first, then try to add it again
    setup: `mkdir -p /tmp/hook-eval-dup && echo 'export function duplicateFunctionAlpha() { return 1; }' > /tmp/hook-eval-dup/existing.ts`,
    input: writeInput('/tmp/hook-eval-dup/new.ts', 'export function duplicateFunctionAlpha() { return 2; }'),
    expectExit: 1,
    expectOutput: 'duplicateFunctionAlpha',
    cwd: '/tmp/hook-eval-dup',
  },

  // ── docs-update-flag (git-aware logic) ──────────────────────────────────
  {
    hook: 'docs-update-flag.sh',
    name: 'creates flag for .sh file in git repo',
    setup: `mkdir -p /tmp/hook-eval-gitrepo && git -C /tmp/hook-eval-gitrepo init -q 2>/dev/null || true && touch /tmp/hook-eval-gitrepo/script.sh && git -C /tmp/hook-eval-gitrepo add script.sh 2>/dev/null || true`,
    input: editInput('/tmp/hook-eval-gitrepo/script.sh'),
    expectExit: 0,
    expectFlagAfter: `${EVAL_HOME}/.go-beast/docs-update.pending`,
    cwd: '/tmp/hook-eval-gitrepo',
  },
  {
    hook: 'docs-update-flag.sh',
    name: 'does not create flag for .gitignore',
    input: editInput('/tmp/.gitignore', 'node_modules/'),
    expectExit: 0,
    expectNoFlag: `${EVAL_HOME}/.go-beast/docs-update.pending`,
  },
  {
    hook: 'docs-update-flag.sh',
    name: 'creates flag for non-git project any extension',
    input: editInput('/tmp/hook-eval-nongit-script.sh', '#!/bin/bash'),
    expectExit: 0,
    expectFlagAfter: `${EVAL_HOME}/.go-beast/docs-update.pending`,
    cwd: '/tmp',
  },

  // ── git-commit-remind-flag ───────────────────────────────────────────────
  {
    hook: 'git-commit-remind-flag.sh',
    name: 'creates flag when Edit occurs in git repo',
    input: editInput(`${REAL_HOME}/Documents/@cherry-c/go-beast/hooks/git-commit-remind.sh`),
    expectExit: 0,
    expectFlagAfter: `${EVAL_HOME}/.go-beast/git-commit-remind.pending`,
  },
  {
    hook: 'git-commit-remind-flag.sh',
    name: 'does not create flag when Edit is outside git repo',
    input: editInput('/tmp/not-a-git-file.sh'),
    expectExit: 0,
    expectNoFlag: `${EVAL_HOME}/.go-beast/git-commit-remind.pending`,
  },
  {
    hook: 'git-commit-remind-flag.sh',
    name: 'ignores non-Edit tools',
    input: otherToolInput(),
    expectExit: 0,
    expectNoFlag: `${EVAL_HOME}/.go-beast/git-commit-remind.pending`,
  },

  // ── git-commit-remind ────────────────────────────────────────────────────
  {
    hook: 'git-commit-remind.sh',
    name: 'silent when no flag file',
    setup: `rm -f ${EVAL_HOME}/.go-beast/git-commit-remind.pending`,
    input: stopInput(false),
    expectExit: 0,
    expectNoOutput: 'uncommitted',
  },
  {
    hook: 'git-commit-remind.sh',
    name: 'respects stop_hook_active=true',
    setup: `echo ${REAL_HOME}/Documents/@cherry-c/go-beast > ${EVAL_HOME}/.go-beast/git-commit-remind.pending`,
    input: stopInput(true),
    expectExit: 0,
    expectNoOutput: 'uncommitted',
  },
  {
    hook: 'git-commit-remind.sh',
    name: 'shows reminder when flag exists and repo has changes (exit 2)',
    setup: `echo ${REAL_HOME}/Documents/@cherry-c/go-beast > ${EVAL_HOME}/.go-beast/git-commit-remind.pending`,
    input: stopInput(false),
    expectExit: 2,
    expectOutput: 'Conventional Commits',
  },

  // ── code-verify-flag ─────────────────────────────────────────────────────
  {
    hook: 'code-verify-flag.sh',
    name: 'creates flag for .ts file',
    input: editInput('/workspace/src/app.ts'),
    expectExit: 0,
    expectFlagAfter: `${EVAL_HOME}/.go-beast/code-verify.pending`,
  },
  {
    hook: 'code-verify-flag.sh',
    name: 'creates flag for .py file',
    input: editInput('/workspace/src/app.py'),
    expectExit: 0,
    expectFlagAfter: `${EVAL_HOME}/.go-beast/code-verify.pending`,
  },
  {
    hook: 'code-verify-flag.sh',
    name: 'does not create flag for .md file',
    input: editInput('/workspace/README.md', '# Docs'),
    expectExit: 0,
    expectNoFlag: `${EVAL_HOME}/.go-beast/code-verify.pending`,
  },
  {
    hook: 'code-verify-flag.sh',
    name: 'creates flag for .go file',
    input: editInput('/workspace/main.go'),
    expectExit: 0,
    expectFlagAfter: `${EVAL_HOME}/.go-beast/code-verify.pending`,
  },

  // ── docs-update-remind ───────────────────────────────────────────────────
  {
    hook: 'docs-update-remind.sh',
    name: 'silent when no flag file',
    setup: `rm -f ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(false),
    expectExit: 0,
    expectNoOutput: 'Reminder',
  },
  {
    hook: 'docs-update-remind.sh',
    name: 'shows reminder when flag exists (exit 2 — re-triggers Claude)',
    setup: `echo /tmp > ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(false),
    expectExit: 2,
    expectOutput: 'Reminder',
  },
  {
    hook: 'docs-update-remind.sh',
    name: 'respects stop_hook_active=true',
    setup: `echo /tmp > ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(true),
    expectExit: 0,
    expectNoOutput: 'Reminder',
  },

  // ── code-verify-run ──────────────────────────────────────────────────────
  {
    hook: 'code-verify-run.sh',
    name: 'exit 0 when no flag file',
    setup: `rm -f ${EVAL_HOME}/.go-beast/code-verify.pending`,
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
    setup: `echo /tmp > ${EVAL_HOME}/.go-beast/code-verify.pending`,
    input: stopInput(false),
    expectExit: 0, // /tmp has no package.json, go.mod, etc — HAS_CHECKS=false → exit 0
  },
  {
    hook: 'code-verify-run.sh',
    name: 'exit 1 when tsc reports type errors in flagged project',
    // Requires tsc on PATH (npx --no-install tsc). Skipped gracefully if tsc unavailable.
    setup: `dir=$(mktemp -d /tmp/hook-eval-ts-XXXXXX) && echo '{"compilerOptions":{"strict":true,"noEmit":true}}' > "$dir/tsconfig.json" && echo 'const x: number = "not a number";' > "$dir/bad.ts" && echo "$dir" > ${EVAL_HOME}/.go-beast/code-verify.pending`,
    input: stopInput(false),
    expectExit: 1,
    expectOutput: 'check',
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
    // Each test gets its own isolated home directory — no flag contamination between parallel tests
    const testId   = `${t.hook.replace('.sh','')}-${t.name.replace(/[^a-z0-9]/gi,'-').slice(0,20)}`
    const testHome = `/tmp/hook-eval-${testId}`
    const ensureTestHome = `mkdir -p ${testHome}/.go-beast ${testHome}/.claude`

    // Replace EVAL_HOME placeholder in setup with this test's isolated testHome
    const rawSetup = t.setup ? t.setup.replaceAll(EVAL_HOME, testHome) : ''
    const setupCmd = rawSetup ? `${rawSetup} && ` : ''
    const cwd = t.cwd ?? `${REAL_HOME}/Documents/@cherry-c/go-beast`

    // Re-map flag paths for this test's isolated home
    const remapFlag = (f) => f ? f.replace(`${EVAL_HOME}/.go-beast/`, `${testHome}/.go-beast/`) : f
    const expectFlagAfter = remapFlag(t.expectFlagAfter)
    const expectNoFlag    = remapFlag(t.expectNoFlag)

    const prompt = `CONTEXT: This is a go-beast hook integration test. You are running a controlled test of a shell script hook. The hook reads JSON from stdin and exits immediately. Each test runs in its own isolated temp directory (${testHome}) so tests cannot interfere with each other.

TEST: ${t.hook} — ${t.name}

STEP 1 — Create isolated test environment and run any test-specific setup:
\`\`\`bash
${ensureTestHome} && ${setupCmd}true
\`\`\`

STEP 2 — Execute the hook with isolated HOME=${testHome} (flag files go to ${testHome}/.go-beast/, not ~/.go-beast/):
\`\`\`bash
cd ${cwd} && echo ${JSON.stringify(t.input)} | HOME=${testHome} bash ${HOOKS_DIR}/${t.hook}; echo "EXIT_CODE:$?"
\`\`\`

STEP 3 — Verify flag file state (if applicable):
${expectFlagAfter ? `\`\`\`bash\ntest -e ${expectFlagAfter} && echo "FLAG_EXISTS" || echo "FLAG_ABSENT"\n\`\`\`` : '(skip)'}
${expectNoFlag ? `\`\`\`bash\ntest -e ${expectNoFlag} && echo "FLAG_EXISTS" || echo "FLAG_ABSENT"\n\`\`\`` : '(skip)'}

VERIFY these conditions and return JSON:
- expected exit_code: ${t.expectExit}
- output must contain: ${t.expectOutput ?? '(none)'}
- output must NOT contain: ${t.expectNoOutput ?? '(none)'}
- flag must exist: ${t.expectFlagAfter ?? '(skip)'}
- flag must NOT exist: ${t.expectNoFlag ?? '(skip)'}

Return ONLY:
- passed: true only if ALL conditions satisfied
- exit_code: numeric exit code from "EXIT_CODE:N"
- stdout: first 300 chars of hook stdout
- stderr: first 200 chars of stderr
- detail: one sentence — why passed or which condition failed`

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
