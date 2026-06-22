export const meta = {
  name: 'go-hook-eval',
  description: 'Tests go-beast hooks: authoritative shell suites, targeted cases, harness variants, channel separation, adversarial verify',
  phases: [
    { title: 'Shell Suite', detail: 'Run authoritative bash test suites (git-strip-coauthored, drift hooks)' },
    { title: 'Hook Tests', detail: 'Targeted cases with deterministic bash harness' },
    { title: 'Adversarial Verify', detail: 'Independent re-verification of any failures' },
    { title: 'Aggregation', detail: 'Consolidate results and write report' },
  ],
}

// ─── Environment discovery ─────────────────────────────────────────────────

const ENV_SCHEMA = {
  type: 'object',
  required: ['home', 'repo_root'],
  properties: {
    home: { type: 'string' },
    repo_root: { type: 'string' },
  },
}

const env = args?.home && args?.repoPath
  ? { home: args.home, repo_root: args.repoPath }
  : await agent(
      'Run the following two commands and return the values:\n```bash\necho "$HOME"\ngit rev-parse --show-toplevel\n```\nReturn home (first line) and repo_root (second line).',
      { label: 'discover-env', phase: 'Shell Suite', schema: ENV_SCHEMA }
    )

const REAL_HOME = env.home
const REPO_ROOT = env.repo_root
const HOOKS_DIR = `${REAL_HOME}/.claude/hooks`

// Each targeted test gets its own isolated HOME to prevent flag-file contamination.
// EVAL_HOME is a placeholder replaced per-test with the test's own tmpdir.
const EVAL_HOME = `/tmp/hook-eval-home`

// ─── Payload helpers ───────────────────────────────────────────────────────

function json(obj) { return JSON.stringify(obj) }

// Serialize with LITERAL unescaped newlines — reproduces the jq-parse-failure path
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

function stopInputWithMessage(message, stopHookActive = false) {
  return json({
    session_id: 'hook-eval-session',
    cwd: '/tmp/hook-eval-project',
    stop_hook_active: stopHookActive,
    last_assistant_message: message,
  })
}

function sessionStartInput() {
  return json({
    session_id: 'hook-eval-session',
    cwd: '/tmp/hook-eval-project',
    source: 'startup',
  })
}

function otherToolInput() {
  return json({ tool_name: 'Read', tool_input: { file_path: '/some/file.ts' } })
}

// ─── Bash harness builder ─────────────────────────────────────────────────
//
// Builds a self-contained bash script that:
//   1. Creates an isolated HOME dir
//   2. Runs any test-specific setup
//   3. Runs the hook, capturing stdout/stderr/exit separately
//   4. Evaluates ALL conditions deterministically in bash (no agent interpretation)
//   5. Emits tagged lines: HOOK_EXIT, PASSED, REASON, STDOUT, STDERR
//
// The agent running this script only needs to read those tagged lines —
// it performs no logical interpretation.

function buildHarness({ testHome, testId, cwd, hookPath, inputJson, envVars, setup, expectExit, expectOutput, expectNoOutput, expectFlagAfter, expectNoFlag, expectFlagContent }) {
  const extraEnv = envVars ? Object.entries(envVars).map(([k, v]) => `${k}='${v}'`).join(' ') : ''
  // Double-stringify for safe embedding in bash echo "..."
  // echo "..." processes \" as " and \\" as \" — round-trips valid JSON
  // Write input to a temp file so literal newlines, single quotes, and shell metacharacters
  // in the payload survive intact — echo/printf quoting breaks on payloads with literal newlines
  // or single quotes (e.g. heredoc payloads from jsonWithLiteralNewlines).
  const inputFile = `/tmp/hook-input-${testId}.json`
  // Use a unique heredoc delimiter that cannot appear inside any hook payload
  const DELIM = `HOOKEVAL_INPUT_EOF_${testId.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`
  const inputRaw = typeof inputJson === 'string' ? inputJson : JSON.stringify(inputJson)

  const lines = [
    'set -uo pipefail',
    `mkdir -p '${testHome}/.go-beast' '${testHome}/.claude'`,
    // Write payload to file via heredoc — handles any content safely
    `cat > '${inputFile}' <<'${DELIM}'`,
    inputRaw,
    DELIM,
  ]

  if (setup) lines.push(setup)

  lines.push(
    `hook_exit=0`,
    `tmpstderr='/tmp/hook-stderr-${testId}.txt'`,
    // Feed hook from file — avoids all quoting issues
    `hook_stdout=$(cd '${cwd}' && cat '${inputFile}' | HOME='${testHome}' ${extraEnv} bash '${hookPath}' 2>"$tmpstderr") || hook_exit=$?`,
    `hook_stderr=$(cat "$tmpstderr" 2>/dev/null || true)`,
    `rm -f "$tmpstderr" '${inputFile}'`,
    `passed=true`,
    `fail_reason=''`,
  )

  // Exit code
  lines.push(
    `if [[ "$hook_exit" -ne ${String(expectExit)} ]]; then`,
    `  passed=false`,
    `  fail_reason="exit $hook_exit != expected ${String(expectExit)}"`,
    `fi`,
  )

  // Must contain (stdout)
  if (expectOutput) {
    lines.push(
      `if [[ "$passed" == "true" ]]; then`,
      `  if ! printf '%s' "$hook_stdout" | grep -qF ${JSON.stringify(expectOutput)}; then`,
      `    passed=false`,
      `    fail_reason=${JSON.stringify('stdout missing: ' + expectOutput)}`,
      `  fi`,
      `fi`,
    )
  }

  // Must NOT contain (stdout)
  if (expectNoOutput) {
    lines.push(
      `if [[ "$passed" == "true" ]]; then`,
      `  if printf '%s' "$hook_stdout" | grep -qF ${JSON.stringify(expectNoOutput)}; then`,
      `    passed=false`,
      `    fail_reason=${JSON.stringify('stdout has forbidden: ' + expectNoOutput)}`,
      `  fi`,
      `fi`,
    )
  }

  // Flag must exist
  if (expectFlagAfter) {
    lines.push(
      `if [[ "$passed" == "true" ]]; then`,
      `  if [[ ! -e '${expectFlagAfter}' ]]; then`,
      `    passed=false`,
      `    fail_reason='flag missing: ${expectFlagAfter}'`,
      `  fi`,
      `fi`,
    )
    // Flag content
    if (expectFlagContent) {
      lines.push(
        `if [[ "$passed" == "true" ]]; then`,
        `  if ! grep -qF ${JSON.stringify(expectFlagContent)} '${expectFlagAfter}' 2>/dev/null; then`,
        `    passed=false`,
        `    fail_reason=${JSON.stringify('flag content missing: ' + expectFlagContent)}`,
        `  fi`,
        `fi`,
      )
    }
  }

  // Flag must NOT exist
  if (expectNoFlag) {
    lines.push(
      `if [[ "$passed" == "true" ]]; then`,
      `  if [[ -e '${expectNoFlag}' ]]; then`,
      `    passed=false`,
      `    fail_reason='unexpected flag: ${expectNoFlag}'`,
      `  fi`,
      `fi`,
    )
  }

  lines.push(
    `echo "HOOK_EXIT:$hook_exit"`,
    `echo "PASSED:$passed"`,
    `if [[ -n "$fail_reason" ]]; then echo "REASON:$fail_reason"; else echo "REASON:all conditions met"; fi`,
    'printf \'STDOUT:%s\\n\' "${hook_stdout:0:400}"',
    'printf \'STDERR:%s\\n\' "${hook_stderr:0:200}"',
  )

  return lines.join('\n')
}

// ─── Test case definitions ─────────────────────────────────────────────────
//
// Fields:
//   hook            — filename under ~/.claude/hooks/
//   name            — test description
//   input           — JSON string piped to the hook via stdin
//   expectExit      — required exit code (0, 1, or 2)
//   expectOutput    — string that MUST appear in stdout
//   expectNoOutput  — string that must NOT appear in stdout
//   expectFlagAfter — path (relative to EVAL_HOME) that must exist after hook runs
//   expectNoFlag    — path (relative to EVAL_HOME) that must NOT exist
//   expectFlagContent — substring that must appear inside expectFlagAfter file
//   setup           — bash commands to run before the hook (EVAL_HOME is replaced with testHome)
//   cwd             — working directory for hook execution (default: REPO_ROOT)
//   envVars         — extra env vars injected alongside HOME (e.g. GO_BEAST_HARNESS_OVERRIDE)

const TESTS = [

  // ── git-strip-coauthored ─────────────────────────────────────────────────
  {
    hook: 'git-strip-coauthored.sh',
    name: 'blocks Co-Authored-By in commit (valid JSON)',
    input: bashInput('git commit -m "fix: something\\nCo-Authored-By: Claude <noreply@anthropic.com>"'),
    expectExit: 1,
    expectOutput: 'Blocked',
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'blocks Co-Authored-By with git -C /path commit (regression: -C flag)',
    input: bashInput('git -C /tmp/testrepo commit -m "fix: something\\nCo-Authored-By: Claude <noreply@anthropic.com>"'),
    expectExit: 1,
    expectOutput: 'Blocked',
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'passes clean commit with git -C /path commit',
    input: bashInput('git -C /tmp/testrepo commit -m "fix: clean message"'),
    expectExit: 0,
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'ignores Co-Authored-By outside commit command in malformed JSON',
    input: '{"tool_name":"Bash","note":"Co-Authored-By: Example Agent <agent@example.com>","tool_input":{"command":"git commit -m \\"fix: clean message\\""}',
    expectExit: 0,
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'blocks Co-Authored-By via heredoc (literal newlines in JSON)',
    input: jsonWithLiteralNewlines({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "$(cat <<\'EOF\'\nfix: something\nCo-Authored-By: Claude\nEOF\n)"' },
    }),
    expectExit: 1,
    expectOutput: 'Blocked',
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'blocks Co-Authored-By from commit message file (-F flag)',
    setup: `printf 'fix: something\nCo-Authored-By: Claude <noreply@anthropic.com>\n' > /tmp/hook-eval-coauthored-msg.txt`,
    input: bashInput('git commit -F /tmp/hook-eval-coauthored-msg.txt'),
    expectExit: 1,
    expectOutput: 'Blocked',
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'passes clean commit (no Co-Authored-By)',
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
    setup: `mkdir -p /tmp/hook-eval-dup && echo 'export function duplicateFunctionAlpha() { return 1; }' > /tmp/hook-eval-dup/existing.ts`,
    input: writeInput('/tmp/hook-eval-dup/new.ts', 'export function duplicateFunctionAlpha() { return 2; }'),
    expectExit: 1,
    expectOutput: 'duplicateFunctionAlpha',
    cwd: '/tmp/hook-eval-dup',
  },

  // ── docs-update-flag ────────────────────────────────────────────────────
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
    input: editInput(`${REPO_ROOT}/hooks/git-commit-remind.sh`),
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
    // flag points to a repo that may have changes — but hook must exit 0 regardless
    setup: `echo ${REPO_ROOT} > ${EVAL_HOME}/.go-beast/git-commit-remind.pending`,
    input: stopInput(true),
    expectExit: 0,
    expectNoOutput: 'uncommitted',
  },
  {
    hook: 'git-commit-remind.sh',
    name: 'shows reminder when flag exists and repo has uncommitted changes (exit 2)',
    // Create a throwaway git repo with an untracked file — guarantees changes exist
    setup: `rm -rf /tmp/hook-eval-commit-remind-repo && mkdir -p /tmp/hook-eval-commit-remind-repo && git -C /tmp/hook-eval-commit-remind-repo init -q && touch /tmp/hook-eval-commit-remind-repo/untracked.txt && echo /tmp/hook-eval-commit-remind-repo > ${EVAL_HOME}/.go-beast/git-commit-remind.pending`,
    input: stopInput(false),
    expectExit: 2,
    expectOutput: 'Conventional Commits',
  },
  {
    hook: 'git-commit-remind.sh',
    name: 'stdout is plain text (no box chars)',
    setup: `rm -rf /tmp/hook-eval-commit-remind-repo2 && mkdir -p /tmp/hook-eval-commit-remind-repo2 && git -C /tmp/hook-eval-commit-remind-repo2 init -q && touch /tmp/hook-eval-commit-remind-repo2/untracked.txt && echo /tmp/hook-eval-commit-remind-repo2 > ${EVAL_HOME}/.go-beast/git-commit-remind.pending`,
    input: stopInput(false),
    expectExit: 2,
    expectNoOutput: '╔',
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
    // stdout is now plain text — "Documentation review required" is the signal word
    expectNoOutput: 'Documentation review required',
  },
  {
    hook: 'docs-update-remind.sh',
    name: 'shows plain-text reminder when flag exists (exit 2)',
    setup: `echo /tmp > ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(false),
    expectExit: 2,
    // Verify the new plain-text output (not the old box format)
    expectOutput: 'Documentation review required',
  },
  {
    hook: 'docs-update-remind.sh',
    name: 'stdout has no box chars (channel separation)',
    setup: `echo /tmp > ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(false),
    expectExit: 2,
    expectNoOutput: '╔',
  },
  {
    hook: 'docs-update-remind.sh',
    name: 'respects stop_hook_active=true',
    setup: `echo /tmp > ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(true),
    expectExit: 0,
    expectNoOutput: 'Documentation review required',
  },

  // ── version-bump-remind ──────────────────────────────────────────────────
  {
    hook: 'version-bump-remind.sh',
    name: 'silent when no flag file',
    setup: `rm -f ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(false),
    expectExit: 0,
    expectNoOutput: 'unreleased content',
  },
  {
    hook: 'version-bump-remind.sh',
    name: 'shows plain-text reminder when flag and CHANGELOG [Unreleased] exist (exit 2)',
    setup: `mkdir -p /tmp/hook-eval-vbump && printf '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- something\n\n## [1.0.0] - 2026-01-01\n' > /tmp/hook-eval-vbump/CHANGELOG.md && echo /tmp/hook-eval-vbump > ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(false),
    expectExit: 2,
    expectOutput: 'unreleased content',
  },
  {
    hook: 'version-bump-remind.sh',
    name: 'stdout has no box chars (channel separation)',
    setup: `mkdir -p /tmp/hook-eval-vbump2 && printf '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- something\n\n## [1.0.0] - 2026-01-01\n' > /tmp/hook-eval-vbump2/CHANGELOG.md && echo /tmp/hook-eval-vbump2 > ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(false),
    expectExit: 2,
    expectNoOutput: '╔',
  },
  {
    hook: 'version-bump-remind.sh',
    name: 'respects stop_hook_active=true',
    setup: `mkdir -p /tmp/hook-eval-vbump3 && printf '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- something\n\n## [1.0.0] - 2026-01-01\n' > /tmp/hook-eval-vbump3/CHANGELOG.md && echo /tmp/hook-eval-vbump3 > ${EVAL_HOME}/.go-beast/docs-update.pending`,
    input: stopInput(true),
    expectExit: 0,
    expectNoOutput: 'unreleased content',
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
    input: stopInput(true),
    expectExit: 0,
  },
  {
    hook: 'code-verify-run.sh',
    name: 'exit 0 with flag pointing to dir with no recognized project',
    setup: `echo /tmp > ${EVAL_HOME}/.go-beast/code-verify.pending`,
    input: stopInput(false),
    expectExit: 0,
  },
  {
    hook: 'code-verify-run.sh',
    name: 'exit 1 when tsc reports type errors in flagged project',
    setup: `dir=$(mktemp -d /tmp/hook-eval-ts-XXXXXX) && echo '{"compilerOptions":{"strict":true,"noEmit":true}}' > "$dir/tsconfig.json" && echo 'const x: number = "not a number";' > "$dir/bad.ts" && echo "$dir" > ${EVAL_HOME}/.go-beast/code-verify.pending`,
    input: stopInput(false),
    expectExit: 1,
    expectOutput: 'check',
  },

  // ── go-beast-session-state (claude-code harness) ─────────────────────────
  {
    hook: 'go-beast-session-state.sh',
    name: 'initializes bootstrap anti-drift state (claude-code harness)',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled`,
    input: sessionStartInput(),
    expectExit: 0,
    expectFlagAfter: `${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json`,
    expectFlagContent: '"harness":"claude-code"',
  },
  {
    hook: 'go-beast-session-state.sh',
    name: 'initializes anti-drift state with codex harness override',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled`,
    input: sessionStartInput(),
    expectExit: 0,
    expectFlagAfter: `${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json`,
    expectFlagContent: '"harness":"codex"',
    envVars: { GO_BEAST_HARNESS_OVERRIDE: 'codex' },
  },

  // ── go-beast-stop-reanchor ───────────────────────────────────────────────
  {
    hook: 'go-beast-stop-reanchor.sh',
    name: 'first unanchored bootstrap stop stays passive (exit 0)',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast/anti-drift && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled
cat > ${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json <<'STATEEOF'
{"version":1,"session_id":"hook-eval-session","cwd":"/tmp/hook-eval-project","harness":"claude-code","mode":"bootstrap","active_beast":"go-hawk","required_artifact":"REQUIREMENTS.md","implementation_unlocked":false,"task_state":"active","task_id":"","unanchored_stop_count":0,"last_reanchor_reason":"","updated_at":"2026-06-19T00:00:00Z"}
STATEEOF`,
    input: stopInputWithMessage('Continuing with the task now.'),
    expectExit: 0,
  },
  {
    hook: 'go-beast-stop-reanchor.sh',
    name: 'second unanchored bootstrap stop forces re-anchor (exit 2)',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast/anti-drift && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled
cat > ${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json <<'STATEEOF'
{"version":1,"session_id":"hook-eval-session","cwd":"/tmp/hook-eval-project","harness":"claude-code","mode":"bootstrap","active_beast":"go-hawk","required_artifact":"REQUIREMENTS.md","implementation_unlocked":false,"task_state":"active","task_id":"","unanchored_stop_count":1,"last_reanchor_reason":"missing-state-frame","updated_at":"2026-06-19T00:00:00Z"}
STATEEOF`,
    input: stopInputWithMessage('Continuing with the task now.'),
    expectExit: 2,
    expectOutput: 'active beast',
  },
  {
    hook: 'go-beast-stop-reanchor.sh',
    name: 'anchored bootstrap stop resets drift counter',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast/anti-drift && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled
cat > ${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json <<'STATEEOF'
{"version":1,"session_id":"hook-eval-session","cwd":"/tmp/hook-eval-project","harness":"claude-code","mode":"bootstrap","active_beast":"go-hawk","required_artifact":"REQUIREMENTS.md","implementation_unlocked":false,"task_state":"active","task_id":"","unanchored_stop_count":1,"last_reanchor_reason":"missing-state-frame","updated_at":"2026-06-19T00:00:00Z"}
STATEEOF`,
    input: stopInputWithMessage('Re-anchor: active beast go-lark, required artifact APPROACH.md, implementation unlocked is false.'),
    expectExit: 0,
  },
  {
    hook: 'go-beast-stop-reanchor.sh',
    name: 'completed bootstrap task does not force re-anchor',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast/anti-drift && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled
cat > ${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json <<'STATEEOF'
{"version":1,"session_id":"hook-eval-session","cwd":"/tmp/hook-eval-project","harness":"claude-code","mode":"bootstrap","active_beast":"go-lark","required_artifact":"APPROACH.md","implementation_unlocked":true,"task_state":"complete","task_id":"task-1","unanchored_stop_count":1,"last_reanchor_reason":"missing-state-frame","updated_at":"2026-06-19T00:00:00Z"}
STATEEOF`,
    input: stopInputWithMessage('Continuing with a normal summary.'),
    expectExit: 0,
  },
  {
    hook: 'go-beast-stop-reanchor.sh',
    name: 'codex harness variant: second unanchored stop forces re-anchor',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast/anti-drift && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled
cat > ${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json <<'STATEEOF'
{"version":1,"session_id":"hook-eval-session","cwd":"/tmp/hook-eval-project","harness":"codex","mode":"bootstrap","active_beast":"go-hawk","required_artifact":"REQUIREMENTS.md","implementation_unlocked":false,"task_state":"active","task_id":"","unanchored_stop_count":1,"last_reanchor_reason":"missing-state-frame","updated_at":"2026-06-19T00:00:00Z"}
STATEEOF`,
    input: stopInputWithMessage('Continuing with the task now.'),
    expectExit: 2,
    expectOutput: 'active beast',
    envVars: { GO_BEAST_HARNESS_OVERRIDE: 'codex' },
  },

  // ── go-beast-user-prompt-context ─────────────────────────────────────────
  {
    hook: 'go-beast-user-prompt-context.sh',
    name: 'user prompt naming beast reopens completed task (claude-code)',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast/anti-drift && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled
cat > ${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json <<'STATEEOF'
{"version":1,"session_id":"hook-eval-session","cwd":"/tmp/hook-eval-project","harness":"claude-code","mode":"bootstrap","active_beast":"go-lark","required_artifact":"APPROACH.md","implementation_unlocked":true,"task_state":"complete","task_id":"task-1","unanchored_stop_count":0,"last_reanchor_reason":"","updated_at":"2026-06-19T00:00:00Z"}
STATEEOF`,
    input: json({
      session_id: 'hook-eval-session',
      cwd: '/tmp/hook-eval-project',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'use go-wren to adjust the hook',
    }),
    expectExit: 0,
    expectOutput: 'go-wren',
  },
  {
    hook: 'go-beast-user-prompt-context.sh',
    name: 'user prompt naming beast reopens completed task (codex harness)',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast/anti-drift && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled
cat > ${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json <<'STATEEOF'
{"version":1,"session_id":"hook-eval-session","cwd":"/tmp/hook-eval-project","harness":"codex","mode":"bootstrap","active_beast":"go-lark","required_artifact":"APPROACH.md","implementation_unlocked":true,"task_state":"complete","task_id":"task-1","unanchored_stop_count":0,"last_reanchor_reason":"","updated_at":"2026-06-19T00:00:00Z"}
STATEEOF`,
    input: json({
      session_id: 'hook-eval-session',
      cwd: '/tmp/hook-eval-project',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'use go-fox to design the architecture',
    }),
    expectExit: 0,
    expectOutput: 'go-fox',
    envVars: { GO_BEAST_HARNESS_OVERRIDE: 'codex' },
  },
  {
    hook: 'go-beast-user-prompt-context.sh',
    name: 'no beast in prompt still emits re-anchor context',
    setup: `mkdir -p ${EVAL_HOME}/.go-beast/anti-drift && touch ${EVAL_HOME}/.go-beast/bootstrap.enabled
cat > ${EVAL_HOME}/.go-beast/anti-drift/hook-eval-session.json <<'STATEEOF'
{"version":1,"session_id":"hook-eval-session","cwd":"/tmp/hook-eval-project","harness":"claude-code","mode":"bootstrap","active_beast":"go-hawk","required_artifact":"REQUIREMENTS.md","implementation_unlocked":false,"task_state":"active","task_id":"","unanchored_stop_count":0,"last_reanchor_reason":"","updated_at":"2026-06-19T00:00:00Z"}
STATEEOF`,
    input: json({
      session_id: 'hook-eval-session',
      cwd: '/tmp/hook-eval-project',
      prompt: 'what should we do next?',
    }),
    expectExit: 0,
    expectOutput: 'go-beast re-anchor',
  },
]

// ─── Phase 1: Authoritative Shell Suites ──────────────────────────────────
//
// These scripts are the ground-truth tests maintained alongside the hooks.
// Passing here is stronger evidence than any workflow-level case.

const SUITE_SCHEMA = {
  type: 'object',
  required: ['passed', 'suite', 'output'],
  properties: {
    passed: { type: 'boolean' },
    suite: { type: 'string' },
    output: { type: 'string' },
  },
}

phase('Shell Suite')
log('Running authoritative bash test suites...')

const suiteResults = await parallel([
  () => agent(
    `Run the following bash test script from the repository root and return whether it passed.

\`\`\`bash
cd '${REPO_ROOT}' && bash tests/plugin/test-git-strip-coauthored.sh 2>&1
\`\`\`

Return:
- passed: true if the output contains "STATUS: PASSED" and the script exits 0
- suite: "test-git-strip-coauthored"
- output: first 600 chars of combined output`,
    { label: 'suite::test-git-strip-coauthored', phase: 'Shell Suite', schema: SUITE_SCHEMA }
  ),
  () => agent(
    `Run the following bash test script from the repository root and return whether it passed.

\`\`\`bash
cd '${REPO_ROOT}' && bash tests/plugin/test-go-beast-drift-hooks.sh 2>&1
\`\`\`

Return:
- passed: true if the output contains "STATUS: PASSED" and the script exits 0
- suite: "test-go-beast-drift-hooks"
- output: first 600 chars of combined output`,
    { label: 'suite::test-go-beast-drift-hooks', phase: 'Shell Suite', schema: SUITE_SCHEMA }
  ),
])

const suitePassed = suiteResults.filter(Boolean).filter(r => r.passed)
const suiteFailed = suiteResults.filter(Boolean).filter(r => !r.passed)
log(`Shell suites: ${suitePassed.length}/${suiteResults.filter(Boolean).length} passed`)

// ─── Phase 2: Targeted Hook Tests ─────────────────────────────────────────

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
log(`Running ${TESTS.length} targeted test cases in parallel...`)

const testResults = await parallel(
  TESTS.map(t => async () => {
    const testId = `${t.hook.replace('.sh', '')}-${t.name.replace(/[^a-z0-9]/gi, '-').slice(0, 24)}`
    const testHome = `/tmp/hook-eval-${testId}`
    const cwd = t.cwd ?? REPO_ROOT
    const hookPath = `${HOOKS_DIR}/${t.hook}`

    // Replace EVAL_HOME placeholder in setup and flag paths
    const rawSetup = t.setup ? t.setup.replaceAll(EVAL_HOME, testHome) : ''
    const remapFlag = (f) => f ? f.replace(`${EVAL_HOME}/.go-beast/`, `${testHome}/.go-beast/`) : undefined
    const expectFlagAfter = remapFlag(t.expectFlagAfter)
    const expectNoFlag    = remapFlag(t.expectNoFlag)

    const script = buildHarness({
      testHome,
      testId,
      cwd,
      hookPath,
      inputJson: t.input,
      envVars: t.envVars,
      setup: rawSetup || undefined,
      expectExit: t.expectExit,
      expectOutput: t.expectOutput,
      expectNoOutput: t.expectNoOutput,
      expectFlagAfter,
      expectNoFlag,
      expectFlagContent: t.expectFlagContent,
    })

    const prompt = `You are running a go-beast hook integration test. The hooks are shell scripts designed to run inside Claude Code and Codex agent harnesses.

TEST: ${t.hook} — ${t.name}

Run this exact bash script as a SINGLE Bash tool call. All pass/fail logic is encoded in the script — you only need to read the tagged output lines and return the JSON schema.

\`\`\`bash
${script}
\`\`\`

Parse the output lines:
- HOOK_EXIT:N → exit_code (number)
- PASSED:true|false → passed (boolean)
- REASON:text → detail (string)
- STDOUT:text → stdout (string)
- STDERR:text → stderr (string)

Return the schema. Do not add interpretation — trust the PASSED line from the script.`

    const result = await agent(prompt, {
      label: `${t.hook}::${t.name}`,
      phase: 'Hook Tests',
      schema: TEST_SCHEMA,
    })

    return { test: t, result }
  })
)

// ─── Phase 3: Adversarial Verify ─────────────────────────────────────────
//
// For every failed test, an independent agent re-runs the exact same script
// from scratch to confirm the failure is real (not an agent misread).

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['confirmed_failure', 'exit_code', 'stdout', 'detail'],
  properties: {
    confirmed_failure: { type: 'boolean' },
    exit_code: { type: 'number' },
    stdout: { type: 'string' },
    detail: { type: 'string' },
  },
}

const failures = testResults.filter(Boolean).filter(r => r.result?.passed === false)

phase('Adversarial Verify')

const adversarialResults = failures.length > 0
  ? await parallel(
      failures.map(({ test: t, result: firstResult }) => async () => {
        const testId = `adv-${t.hook.replace('.sh', '')}-${t.name.replace(/[^a-z0-9]/gi, '-').slice(0, 20)}`
        const testHome = `/tmp/hook-eval-${testId}`
        const cwd = t.cwd ?? REPO_ROOT
        const hookPath = `${HOOKS_DIR}/${t.hook}`
        const rawSetup = t.setup ? t.setup.replaceAll(EVAL_HOME, testHome) : ''
        const remapFlag = (f) => f ? f.replace(`${EVAL_HOME}/.go-beast/`, `${testHome}/.go-beast/`) : undefined

        const script = buildHarness({
          testHome,
          testId,
          cwd,
          hookPath,
          inputJson: t.input,
          envVars: t.envVars,
          setup: rawSetup || undefined,
          expectExit: t.expectExit,
          expectOutput: t.expectOutput,
          expectNoOutput: t.expectNoOutput,
          expectFlagAfter: remapFlag(t.expectFlagAfter),
          expectNoFlag: remapFlag(t.expectNoFlag),
          expectFlagContent: t.expectFlagContent,
        })

        const result = await agent(
          `ADVERSARIAL VERIFICATION: A prior agent reported this hook test FAILED. Re-run the exact script independently to confirm whether the failure is real.

Context: ${t.hook} — ${t.name}
Prior agent reported: exit=${firstResult?.exit_code}, reason="${firstResult?.detail}"

Run this bash script fresh — do NOT assume the prior agent's result:

\`\`\`bash
${script}
\`\`\`

Return:
- confirmed_failure: true if PASSED line says "false" (failure confirmed), false if the re-run now passes
- exit_code: the HOOK_EXIT number
- stdout: STDOUT line content
- detail: one sentence — does this confirm the failure or contradict it?`,
          {
            label: `adversarial::${t.hook}::${t.name}`,
            phase: 'Adversarial Verify',
            schema: VERIFY_SCHEMA,
          }
        )

        return { test: t, firstResult, adversarial: result }
      })
    )
  : []

log(`Adversarial verify: ${adversarialResults.filter(Boolean).length} failures re-checked`)

// ─── Phase 4: Aggregation ─────────────────────────────────────────────────

phase('Aggregation')

const valid = testResults.filter(Boolean)
const passed = valid.filter(r => r.result?.passed === true)
const failed = valid.filter(r => r.result?.passed === false)

// Confirmed vs spurious (adversarial said it actually passes)
const confirmedFailures = adversarialResults.filter(Boolean).filter(r => r.adversarial?.confirmed_failure === true)
const spuriousFailures  = adversarialResults.filter(Boolean).filter(r => r.adversarial?.confirmed_failure === false)

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

// Suite results
lines.push(`## 0. Shell Suite Results\n`)
lines.push(`| Suite | Status | Output |`)
lines.push(`|---|---|---|`)
for (const r of suiteResults.filter(Boolean)) {
  const status = r.passed ? '✅ PASSED' : '❌ FAILED'
  lines.push(`| ${r.suite} | ${status} | ${(r.output ?? '').slice(0, 120).replace(/\n/g, ' ')} |`)
}
lines.push('')

// Summary
const totalSuites = suiteResults.filter(Boolean).length
const suitePassCount = suitePassed.length
lines.push(`**Shell suites:** ${suitePassCount}/${totalSuites} | **Targeted cases:** ${valid.length} | **Pass:** ${passed.length} | **Fail:** ${failed.length} | **Confirmed failures:** ${confirmedFailures.length} | **Spurious (adversarial cleared):** ${spuriousFailures.length}\n`)
lines.push(`---\n`)

lines.push(`## 1. Results per Case\n`)
lines.push(`| Hook | Case | Status | Exit | Adversarial | Detail |`)
lines.push(`|---|---|---|---|---|---|`)
for (const r of valid) {
  const status = r.result?.passed ? '✅' : '❌'
  const exit = r.result?.exit_code ?? '?'
  const detail = (r.result?.detail ?? '').slice(0, 70)
  const advEntry = adversarialResults.find(a => a?.test === r.test)
  const adv = advEntry ? (advEntry.adversarial?.confirmed_failure ? '🔴 confirmed' : '🟡 spurious') : '—'
  lines.push(`| ${r.test.hook} | ${r.test.name} | ${status} | ${exit} | ${adv} | ${detail} |`)
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
    const adv = adversarialResults.find(a => a?.test === r.test)
    const advNote = adv
      ? (adv.adversarial?.confirmed_failure ? ' **[adversarially confirmed]**' : ' **[adversarial re-run PASSED — may be spurious]**')
      : ''
    lines.push(`### ❌ ${r.test.hook} — ${r.test.name}${advNote}`)
    lines.push(`- **Expected exit:** ${r.test.expectExit} | **Got:** ${r.result?.exit_code ?? '?'}`)
    lines.push(`- **Detail:** ${r.result?.detail ?? 'n/a'}`)
    if (r.result?.stdout) lines.push(`- **Stdout:** \`${r.result.stdout.slice(0, 200)}\``)
    if (r.result?.stderr) lines.push(`- **Stderr:** \`${r.result.stderr.slice(0, 200)}\``)
    if (adv?.adversarial) {
      lines.push(`- **Adversarial re-run exit:** ${adv.adversarial.exit_code}`)
      lines.push(`- **Adversarial detail:** ${adv.adversarial.detail}`)
    }
    lines.push('')
  }
}

lines.push(`\n## 4. Coverage\n`)
lines.push(`| Dimension | Cases |`)
lines.push(`|---|---|`)
lines.push(`| Correct blocker (exit 1 expected) | ${valid.filter(r => r.test.expectExit === 1).length} |`)
lines.push(`| Re-trigger agent (exit 2 expected) | ${valid.filter(r => r.test.expectExit === 2).length} |`)
lines.push(`| Correct pass-through (exit 0 expected) | ${valid.filter(r => r.test.expectExit === 0).length} |`)
lines.push(`| Literal newlines in JSON (jq fallback path) | ${valid.filter(r => r.test.name.includes('literal newlines')).length} |`)
lines.push(`| Flag file existence check | ${valid.filter(r => r.test.expectFlagAfter || r.test.expectNoFlag).length} |`)
lines.push(`| Flag file content check | ${valid.filter(r => r.test.expectFlagContent).length} |`)
lines.push(`| stop_hook_active guard | ${valid.filter(r => r.test.input.includes('"stop_hook_active":true')).length} |`)
lines.push(`| Channel separation (no box chars on stdout) | ${valid.filter(r => r.test.expectNoOutput === '╔').length} |`)
lines.push(`| Codex harness variant | ${valid.filter(r => r.test.envVars?.GO_BEAST_HARNESS_OVERRIDE === 'codex').length} |`)
lines.push(`| git -C /path flag regression | ${valid.filter(r => r.test.name.includes('-C flag') || r.test.name.includes('-C /path')).length} |`)
lines.push(`| Adversarially verified failures | ${adversarialResults.filter(Boolean).length} |`)

const reportContent = lines.join('\n')
const reportPath = `${REPO_ROOT}/workflows/go-workflow-eval-reports/hook-eval-report.md`

await agent(
  `Save the following Markdown content to the file '${reportPath}' (create directories if needed). Use the Write tool.

CONTENT:
${reportContent}`,
  { label: 'save-report', phase: 'Aggregation' }
)

log(`Report saved to ${reportPath}`)

// ── JSON output (agent-readable, schema_version 1) ─────────────────────────
const jsonOutputData = {
  schema_version: 1,
  workflow: 'go-hook-eval',
  duration_ms: null,
  summary: {
    total: valid.length,
    passed: passed.length,
    failed: failed.length,
    errors: testResults.filter(r => !r).length,
    confirmed_failures: confirmedFailures.length,
    spurious_failures: spuriousFailures.length,
    suites_passed: suitePassCount,
    suites_total: totalSuites,
    avg_score: null,
    estimated_cost_usd: null,
  },
  inputs: {
    filter: null,
    workflow_version: null,
  },
  meta: {
    go_beast_version: null,
    environment: 'claude-code',
  },
  detail: {
    type: 'hook-eval',
    runs: valid.map(r => {
      const advEntry = adversarialResults.find(a => a?.test === r.test)
      return {
        hook: r.test.hook,
        case_name: r.test.name,
        expected_exit: r.test.expectExit,
        result: {
          passed: r.result?.passed ?? null,
          exit_code: r.result?.exit_code ?? null,
          stdout: (r.result?.stdout ?? '').slice(0, 200),
          stderr: (r.result?.stderr ?? '').slice(0, 200),
          detail: r.result?.detail ?? null,
        },
        adversarial: advEntry ? {
          run: true,
          confirmed_failure: advEntry.adversarial?.confirmed_failure ?? null,
          detail: advEntry.adversarial?.detail ?? null,
        } : {
          run: false,
          confirmed_failure: null,
          detail: null,
        },
      }
    }),
  },
}

await agent(
  `Perform these steps in order using Bash and Write tools:
1. Run: mkdir -p $HOME/.claude/workflows/go-hook-eval/results
2. Get the current timestamp by running: date -u +%Y%m%dT%H%M%S
   Use that value as RUN_TS.
3. Set RUN_ID to: go-hook-eval-<RUN_TS>
   Set OUTPUT_PATH to: $HOME/.claude/workflows/go-hook-eval/results/<RUN_ID>.json
4. List .json files in $HOME/.claude/workflows/go-hook-eval/results/ sorted by name. Delete all but the 9 most recent (to make room for the new file).
5. Write the file at OUTPUT_PATH. Inject the actual RUN_ID and RUN_TS into the JSON before writing — replace the placeholder strings "INJECT_RUN_ID" and "INJECT_TIMESTAMP" with the real values.

JSON CONTENT (write this after injecting RUN_ID and timestamp):
${JSON.stringify({ ...jsonOutputData, run_id: 'INJECT_RUN_ID', timestamp: 'INJECT_TIMESTAMP' }, null, 2)}`,
  { label: 'save-output', phase: 'Aggregation' }
)

log('JSON output saved to ~/.claude/workflows/go-hook-eval/results/')

return {
  suites: { total: totalSuites, passed: suitePassCount, failed: suiteFailed.length },
  cases: { total: valid.length, passed: passed.length, failed: failed.length },
  confirmedFailures: confirmedFailures.length,
  spuriousFailures: spuriousFailures.length,
  failedCases: failed.map(r => `${r.test.hook}::${r.test.name}`),
  suiteFailures: suiteFailed.map(r => r.suite),
}
