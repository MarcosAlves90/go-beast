export const meta = {
  name: 'go-hook-eval',
  description: 'Testa os hooks de go-beast com casos positivos, negativos e edge cases (jq fallback, newlines literais)',
  phases: [
    { title: 'Hook Tests', detail: 'Executa todos os casos de teste em paralelo' },
    { title: 'Aggregation', detail: 'Consolida resultados e gera report' },
  ],
}

// ─── Infraestrutura ────────────────────────────────────────────────────────

const HOOKS_DIR = `${args?.home ?? "/Users/marcos.lopes"}/.claude/hooks`

// Serializa um objeto JS como JSON com newlines escapadas (formato que o runtime envia)
function json(obj) {
  return JSON.stringify(obj)
}

// Serializa com newlines LITERAIS não-escapadas — reproduz o bug original do jq
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

// ─── Definição dos casos de teste ─────────────────────────────────────────

const TESTS = [

  // ── git-strip-coauthored ─────────────────────────────────────────────────
  {
    hook: 'git-strip-coauthored.sh',
    name: 'bloqueia Co-Authored-By em commit (JSON válido)',
    input: bashInput('git commit -m "fix: algo\\nCo-Authored-By: Claude <noreply@anthropic.com>"'),
    expectExit: 1,
    expectOutput: 'Co-Authored-By',
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'bloqueia Co-Authored-By com heredoc (newlines literais)',
    input: jsonWithLiteralNewlines({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "$(cat <<\'EOF\'\nfix: algo\nCo-Authored-By: Claude\nEOF\n)"' },
    }),
    expectExit: 1,
    expectOutput: 'Co-Authored-By',
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'passa commit limpo',
    input: bashInput('git commit -m "fix: algo limpo"'),
    expectExit: 0,
  },
  {
    hook: 'git-strip-coauthored.sh',
    name: 'ignora tool != Bash',
    input: otherToolInput(),
    expectExit: 0,
  },

  // ── git-commit-guard ─────────────────────────────────────────────────────
  {
    hook: 'git-commit-guard.sh',
    name: 'bloqueia git add .env',
    input: bashInput('git add .env'),
    expectExit: 1,
    expectOutput: '.env',
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'bloqueia git add secrets.json',
    input: bashInput('git add config/secrets.json'),
    expectExit: 1,
    expectOutput: 'secrets',
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'bloqueia git add node_modules/',
    input: bashInput('git add node_modules/lodash/index.js'),
    expectExit: 1,
    expectOutput: 'node_modules',
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'passa .env.example (arquivo seguro)',
    input: bashInput('git add .env.example'),
    expectExit: 0,
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'passa git add arquivo de código',
    input: bashInput('git add src/main.ts'),
    expectExit: 0,
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'bloqueia com newlines literais no JSON',
    input: jsonWithLiteralNewlines({
      tool_name: 'Bash',
      tool_input: { command: 'git add .env\n' },
    }),
    expectExit: 1,
    expectOutput: '.env',
  },
  {
    hook: 'git-commit-guard.sh',
    name: 'ignora tool != Bash',
    input: otherToolInput(),
    expectExit: 0,
  },

  // ── code-dedup-check ─────────────────────────────────────────────────────
  // Nota: este hook faz grep no PROJECT_DIR — usa /tmp onde não há colisões
  {
    hook: 'code-dedup-check.sh',
    name: 'passa função sem duplicata no projeto vazio',
    input: writeInput('/tmp/hook-eval-test.ts', 'export function uniqueFunctionXyzAbc123() { return 1; }'),
    expectExit: 0,
    cwd: '/tmp',
  },
  {
    hook: 'code-dedup-check.sh',
    name: 'passa arquivo não-código (.md)',
    input: writeInput('/tmp/README.md', '# Hello'),
    expectExit: 0,
    cwd: '/tmp',
  },
  {
    hook: 'code-dedup-check.sh',
    name: 'passa quando tool != Edit|Write',
    input: otherToolInput(),
    expectExit: 0,
    cwd: '/tmp',
  },
  {
    hook: 'code-dedup-check.sh',
    name: 'passa conteúdo sem declarações extraíveis',
    input: writeInput('/tmp/hook-eval-test.ts', 'const x = 1; const y = 2;'),
    expectExit: 0,
    cwd: '/tmp',
  },

  // ── docs-update-flag ─────────────────────────────────────────────────────
  {
    hook: 'docs-update-flag.sh',
    name: 'cria flag para arquivo .ts',
    input: editInput('/workspace/src/app.ts'),
    expectExit: 0,
    expectFlagAfter: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
  },
  {
    hook: 'docs-update-flag.sh',
    name: 'não cria flag para arquivo .md',
    input: editInput('/workspace/README.md', '# Docs update'),
    expectExit: 0,
    expectNoFlag: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
  },
  {
    hook: 'docs-update-flag.sh',
    name: 'ignora tool != Edit|Write|MultiEdit',
    input: otherToolInput(),
    expectExit: 0,
  },

  // ── code-verify-flag ─────────────────────────────────────────────────────
  {
    hook: 'code-verify-flag.sh',
    name: 'cria flag para arquivo .py',
    input: editInput('/workspace/src/app.py'),
    expectExit: 0,
    expectFlagAfter: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
  },
  {
    hook: 'code-verify-flag.sh',
    name: 'não cria flag para arquivo .md',
    input: editInput('/workspace/README.md', '# Docs'),
    expectExit: 0,
    expectNoFlag: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
  },
  {
    hook: 'code-verify-flag.sh',
    name: 'cria flag para arquivo .go',
    input: editInput('/workspace/main.go'),
    expectExit: 0,
    expectFlagAfter: `${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
  },

  // ── docs-update-remind ───────────────────────────────────────────────────
  {
    hook: 'docs-update-remind.sh',
    name: 'silencioso sem flag file',
    setup: `rm -f ${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
    input: stopInput(false),
    expectExit: 0,
    expectNoOutput: 'Lembrete',
  },
  {
    hook: 'docs-update-remind.sh',
    name: 'exibe aviso quando flag existe',
    setup: `echo /tmp > ${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
    input: stopInput(false),
    expectExit: 0,
    expectOutput: 'Lembrete',
  },
  {
    hook: 'docs-update-remind.sh',
    name: 'respeita stop_hook_active=true',
    setup: `echo /tmp > ${args?.home ?? "/Users/marcos.lopes"}/.claude/.docs-update-pending`,
    input: stopInput(true),
    expectExit: 0,
    expectNoOutput: 'Lembrete',
  },

  // ── code-verify-run ──────────────────────────────────────────────────────
  {
    hook: 'code-verify-run.sh',
    name: 'exit 0 sem flag file',
    setup: `rm -f ${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
    input: stopInput(false),
    expectExit: 0,
  },
  {
    hook: 'code-verify-run.sh',
    name: 'exit 0 com stop_hook_active=true (previne loop)',
    // Sem flag — o hook sai imediatamente por stop_hook_active antes de verificar a flag
    input: stopInput(true),
    expectExit: 0,
  },
  {
    hook: 'code-verify-run.sh',
    name: 'exit 0 com flag apontando para dir sem projeto reconhecido',
    setup: `echo /tmp > ${args?.home ?? "/Users/marcos.lopes"}/.claude/.code-verify-pending`,
    input: stopInput(false),
    expectExit: 0, // /tmp não tem package.json, go.mod, etc — HAS_CHECKS=false → exit 0
  },
]

// ─── Runner ────────────────────────────────────────────────────────────────

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
log(`Executando ${TESTS.length} casos de teste em paralelo...`)

const results = await parallel(
  TESTS.map(t => async () => {
    const setupCmd = t.setup ? `${t.setup} && ` : ''
    const cwd = t.cwd ?? `${args?.home ?? "/Users/marcos.lopes"}/Documents/@cherry-c/go-beast`
    // Limpa flags antes do teste — tanto expectFlagAfter quanto expectNoFlag precisam de estado limpo
    const flagsToClean = [t.expectFlagAfter, t.expectNoFlag].filter(Boolean)
    const flagCleanBefore = flagsToClean.length > 0 ? flagsToClean.map(f => `rm -f ${f}`).join(' && ') + ' && ' : ''

    const prompt = `Você é um agente de teste automatizado. Execute exatamente os passos abaixo e retorne o JSON pedido. Este é um teste controlado de hook scripts — os hooks lêem stdin e saem imediatamente, não modificam arquivos de produção.

PASSO 1 — Preparação:
\`\`\`bash
${setupCmd}${flagCleanBefore}true
\`\`\`

PASSO 2 — Execute o hook passando o input via stdin e capture o exit code:
\`\`\`bash
cd ${cwd} && echo ${JSON.stringify(t.input)} | bash ${HOOKS_DIR}/${t.hook}; echo "EXIT_CODE:$?"
\`\`\`

PASSO 3 — Verifique flag file (se aplicável):
${t.expectFlagAfter ? `\`\`\`bash\nls ${t.expectFlagAfter} 2>/dev/null && echo "FLAG_EXISTS" || echo "FLAG_ABSENT"\n\`\`\`` : '(pule este passo)'}
${t.expectNoFlag ? `\`\`\`bash\nls ${t.expectNoFlag} 2>/dev/null && echo "FLAG_EXISTS" || echo "FLAG_ABSENT"\n\`\`\`` : '(pule este passo)'}

ANÁLISE — verifique cada condição:
- exit_code esperado: ${t.expectExit}
- output esperado conter: ${t.expectOutput ?? '(nenhum)'}
- output NÃO deve conter: ${t.expectNoOutput ?? '(nenhum)'}
- flag deve existir após execução: ${t.expectFlagAfter ?? '(não verificar)'}
- flag NÃO deve existir após execução: ${t.expectNoFlag ?? '(não verificar)'}

Retorne APENAS o JSON estruturado com:
- passed: true somente se TODAS as condições acima foram satisfeitas
- exit_code: código de saída numérico real (extraia do "EXIT_CODE:N" no output)
- stdout: primeiros 300 chars do stdout do hook
- stderr: primeiros 200 chars do stderr (se houver)
- detail: uma frase explicando por que passed=true ou qual condição específica falhou`

    const result = await agent(prompt, {
      label: `${t.hook}::${t.name}`,
      phase: 'Hook Tests',
      schema: TEST_SCHEMA,
    })

    return { test: t, result }
  })
)

// ─── Aggregation ───────────────────────────────────────────────────────────

phase('Aggregation')
log('Consolidando resultados...')

const valid = results.filter(Boolean)
const passed = valid.filter(r => r.result?.passed === true)
const failed = valid.filter(r => r.result?.passed === false)

// Agrupa por hook
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
lines.push(`**Hooks testados:** ${Object.keys(byHook).length} | **Total de casos:** ${valid.length} | **Pass:** ${passed.length} | **Fail:** ${failed.length}\n`)
lines.push(`---\n`)

lines.push(`## 1. Resultado por Caso\n`)
lines.push(`| Hook | Caso | Status | Exit | Detalhe |`)
lines.push(`|---|---|---|---|---|`)
for (const r of valid) {
  const status = r.result?.passed ? '✅' : '❌'
  const exit = r.result?.exit_code ?? '?'
  const detail = (r.result?.detail ?? '').slice(0, 80)
  lines.push(`| ${r.test.hook} | ${r.test.name} | ${status} | ${exit} | ${detail} |`)
}

lines.push(`\n## 2. Sumário por Hook\n`)
lines.push(`| Hook | Pass | Fail | Status |`)
lines.push(`|---|---|---|---|`)
for (const [hook, s] of Object.entries(byHook)) {
  const status = s.fail === 0 ? '✅ OK' : `⚠️ ${s.fail} falha(s)`
  lines.push(`| ${hook} | ${s.pass} | ${s.fail} | ${status} |`)
}

if (failed.length > 0) {
  lines.push(`\n## 3. Falhas Detalhadas\n`)
  for (const r of failed) {
    lines.push(`### ❌ ${r.test.hook} — ${r.test.name}`)
    lines.push(`- **Exit esperado:** ${r.test.expectExit} | **Obtido:** ${r.result?.exit_code ?? '?'}`)
    lines.push(`- **Detalhe:** ${r.result?.detail ?? 'n/a'}`)
    if (r.result?.stdout) lines.push(`- **Stdout:** \`${r.result.stdout.slice(0, 200)}\``)
    if (r.result?.stderr) lines.push(`- **Stderr:** \`${r.result.stderr.slice(0, 200)}\``)
    lines.push('')
  }
}

lines.push(`\n## 4. Cobertura\n`)
lines.push(`| Caso de teste | Cobertura |`)
lines.push(`|---|---|`)
lines.push(`| Blocker correto (exit 1 esperado) | ${valid.filter(r => r.test.expectExit === 1).length} casos |`)
lines.push(`| Pass-through correto (exit 0 esperado) | ${valid.filter(r => r.test.expectExit === 0).length} casos |`)
lines.push(`| jq fallback (newlines literais) | ${valid.filter(r => r.test.name.includes('newlines literais')).length} casos |`)
lines.push(`| Verificação de flag file | ${valid.filter(r => r.test.expectFlagAfter || r.test.expectNoFlag).length} casos |`)
lines.push(`| stop_hook_active | ${valid.filter(r => r.test.name.includes('stop_hook_active')).length} casos |`)

const reportContent = lines.join('\n')

await agent(
  `Salve o seguinte conteúdo Markdown no arquivo ~/.claude/workflows/hook-eval/reports/report.md (crie os diretórios se necessário). Use a ferramenta Write para escrever o arquivo.

CONTEÚDO:
${reportContent}`,
  { label: 'save-report', phase: 'Aggregation' }
)

log('Report salvo em ~/.claude/workflows/hook-eval/reports/report.md')

return {
  total: valid.length,
  passed: passed.length,
  failed: failed.length,
  failedCases: failed.map(r => `${r.test.hook}::${r.test.name}`),
}
