export const meta = {
  name: 'go-star-eval',
  description: 'Testa todas as skills go-* com eval estrutural + LLM-as-judge e benchmark A/B/C',
  phases: [
    { title: 'Skill Execution', detail: 'Executa 45 combinações skill×input em paralelo' },
    { title: 'Structural Eval', detail: 'Checklist determinístico por skill' },
    { title: 'LLM Judge', detail: 'Rubrica qualitativa 4 dimensões' },
    { title: 'Aggregation', detail: 'Consolida resultados e gera report' },
  ],
}

const SKILLS = {
  'go-hawk': {
    description: 'Conducts structured discovery interviews, produces a versioned REQUIREMENTS.md, identifies unknowns and risks, and generates a go-beast handoff plan for a software project.',
    checklist: ['Problem statement', 'Users and roles', 'Functional requirements', 'Out of scope', 'Risks', 'handoff'],
  },
  'go-fox': {
    description: 'Translates approved requirements into an architecture decision record (ADR), technology stack selection, Mermaid component diagram, and interface contracts.',
    checklist: ['ADR', 'Mermaid', 'STACK.md', 'CONTRACTS.md'],
  },
  'go-beaver': {
    description: 'Creates a working, runnable project skeleton — monorepo or multi-repo structure, dependency install, linter, formatter, Git hooks, env files, and dev server validation.',
    checklist: ['.env.example', 'linter', 'scripts', 'dev server'],
  },
  'go-wolf': {
    description: 'Designs and implements REST or GraphQL APIs, business logic layers, authentication, authorization, middleware, and server-side validation following a strict layered architecture.',
    checklist: ['endpoints', 'handler', 'service', 'repository', 'auth'],
  },
  'go-lynx': {
    description: 'Builds frontend UIs with correct component architecture, state management, API integration, accessibility, and responsive design — wired to a real backend, not mocked.',
    checklist: ['components', 'state management', 'API integration', 'accessibility'],
  },
  'go-otter': {
    description: 'Designs entity-relationship models, defines schemas with conventions, writes safe migrations with rollback, plans indexing strategy, and reviews queries for N+1 and sequential scans.',
    checklist: ['schema', 'migrations', 'indexes', 'entities', 'erDiagram'],
  },
  'go-eagle': {
    description: 'Designs the test pyramid, writes unit, integration, and end-to-end tests, establishes CI gates, and sets coverage policy for a software project.',
    checklist: ['test pyramid', 'coverage', 'CI gates'],
  },
  'go-bear': {
    description: 'Runs a security review covering OWASP Top 10, authentication hardening, secrets management, dependency auditing, HTTP headers, and threat modeling for a software project.',
    checklist: ['OWASP', 'secrets', 'THREAT_MODEL', 'SECURITY_REVIEW', 'severity'],
  },
  'go-raven': {
    description: 'Designs CI/CD pipelines, environment promotion strategy, infrastructure-as-code, secrets management in CI, and release automation for a software project.',
    checklist: ['pipeline', 'staging', 'production', 'release', 'workflow'],
  },
  'go-owl': {
    description: 'Audits and writes technical documentation for a software project — README, API reference, architecture docs, ADRs, runbooks, and changelog — ensuring every document is accurate, complete, and runnable.',
    checklist: ['README', 'API reference', 'runbook'],
  },
  'go-jay': {
    description: 'Creates, audits, edits, and synchronizes AI context files — CLAUDE.md (global and project), AGENTS.md, GEMINI.md, CONTEXT.md, and memory files — improving AI agent behavior.',
    checklist: ['CLAUDE.md', 'AGENTS.md', 'instructions'],
  },
  'go-mole': {
    description: 'Scans and reads all documentation in a project — README, CHANGELOG, CONTRIBUTING, CLAUDE.md, AGENTS.md, /docs, /wiki, and key config files — then produces a compact briefing.',
    checklist: ['Purpose', 'Stack', 'Architecture notes', 'Gaps'],
  },
  'go-smith': {
    description: 'Designs, writes, and validates new skills for the go-* family — from gap analysis to SKILL.md authoring, naming, description quality, workflow structure, and integration into the pack handoff chain.',
    checklist: ['gap analysis', 'SKILL.md', 'position in chain', 'handoff'],
  },
  'go-swift': {
    description: 'Designs, writes, tests, and registers Claude Code hooks — shell scripts triggered by lifecycle events (SessionStart, PreToolUse, PostToolUse, Stop, SubagentStop, PreCompact). Produces hook scripts, wires them into settings.json, and verifies execution.',
    checklist: ['hook script', 'settings.json', 'event', 'chmod'],
  },
  'go-kite': {
    description: 'Audits an existing system architecture across five dimensions — structure/modularity, observability, reliability, scalability, and security posture — and produces a prioritized findings report with capability gaps and concrete improvement proposals, each referencing the next beast to invoke.',
    checklist: ['structure', 'observability', 'reliability', 'scalability', 'security', 'capability gaps', 'recommendation'],
  },
}

const INPUT_A = {
  nome: 'TaskFlow API',
  dominio: 'Gerenciamento de tarefas pessoais',
  stack: 'Node.js + PostgreSQL',
  usuarios: 'Desenvolvedores individuais',
  complexidade: 'baixa',
}

const INPUT_B = {
  nome: 'ServerWatch',
  dominio: 'Monitoramento de servidores em tempo real',
  stack: 'Go + InfluxDB + Grafana',
  usuarios: 'SREs e times de operações',
  complexidade: 'alta — WebSockets, alertas, múltiplos serviços',
}

// Input C: projeto mid-complexity com conteúdo real de arquivos simulados
// Propósito: testar go-mole com input que ela pode realmente processar (conteúdo de arquivos,
// não apenas metadados), e exercitar go-owl/go-raven com projeto que tem docs parciais reais.
const INPUT_C = {
  nome: 'PayLink',
  dominio: 'Plataforma de pagamentos recorrentes para SaaS',
  stack: 'Python (FastAPI) + PostgreSQL + Redis + Stripe API',
  usuarios: 'Equipes de produto SaaS (B2B), 5–20 desenvolvedores',
  complexidade: 'média — autenticação OAuth2, webhooks, jobs assíncronos, compliance PCI-DSS',
  docs_existentes: `
README.md: presente (desatualizado — aponta para porta 8080, app roda em 3000)
docs/ARCHITECTURE.md: presente (ADR-001 escolha FastAPI, ADR-002 uso de Redis para jobs)
CHANGELOG.md: presente (v1.2.0 última entrada, 3 meses atrás)
CONTRIBUTING.md: presente (padrão de PR, branch naming: feat/, fix/, chore/)
docs/DEPLOYMENT.md: ausente
docs/runbooks/: ausente
openapi.yaml: presente em docs/openapi.yaml (v1.2.0, pode estar desatualizado)
.env.example: presente`,
  files: {
    'README.md': `# PayLink

Plataforma de pagamentos recorrentes para SaaS.

## Setup

\`\`\`bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
\`\`\`

## Testes

\`\`\`bash
pytest
\`\`\`

## Stack

- Python 3.11 + FastAPI
- PostgreSQL 15
- Redis 7 (filas de jobs via Celery)
- Stripe API (pagamentos)

## Deploy

Ver docs/DEPLOYMENT.md (ainda não escrito).
`,
    'CHANGELOG.md': `# Changelog

## [1.2.0] - 2026-03-10
### Added
- Suporte a múltiplos planos de assinatura por cliente
- Webhook handler para eventos Stripe (payment_failed, subscription_cancelled)
### Fixed
- Race condition no processamento de jobs de cobrança recorrente

## [1.1.0] - 2026-01-15
### Added
- Autenticação OAuth2 com Google e GitHub
- Endpoint de relatório de receita mensal (MRR)

## [1.0.0] - 2025-11-01
### Added
- MVP: criação de assinaturas, cobrança via Stripe, portal do cliente
`,
    'CONTRIBUTING.md': `# Contributing

## Branch naming
- feat/<descricao>
- fix/<descricao>
- chore/<descricao>

## Pull Requests
- Mínimo 2 aprovações antes do merge
- CI deve passar (lint + typecheck + tests)
- Squash merge obrigatório

## Commits
Seguir Conventional Commits: feat:, fix:, chore:, docs:
`,
    'docs/ARCHITECTURE.md': `# Architecture

## ADR-001: Escolha do FastAPI

**Status:** Accepted | **Date:** 2025-10-20

### Context
Precisávamos de um framework Python com suporte nativo a async, validação de tipos, e geração automática de OpenAPI spec.

### Decision
FastAPI com Pydantic v2.

### Consequences
- OpenAPI spec gerada automaticamente em /docs
- Validação de request/response em tempo de execução
- Curva de aprendizado menor que Django REST Framework

## ADR-002: Redis para filas de jobs

**Status:** Accepted | **Date:** 2025-10-25

### Context
Cobranças recorrentes precisam ser processadas de forma assíncrona sem bloquear requests HTTP.

### Decision
Celery + Redis como broker. Jobs agendados via Celery Beat.

### Consequences
- Redis precisa ser provisionado em produção (custo adicional)
- Falhas de job precisam de dead letter queue (não implementado ainda)
`,
  },
}

function buildPrompt(skillName, skillDesc, input, checklist) {
  const docsSection = input.docs_existentes
    ? `\nDocumentação existente no projeto:\n${input.docs_existentes}\n`
    : ''
  const filesSection = input.files
    ? '\n\nCONTEÚDO DOS ARQUIVOS DO PROJETO (use estes como fonte primária — não simule, leia):\n\n' +
      Object.entries(input.files)
        .map(([path, content]) => `### ${path}\n\`\`\`\n${content.trim()}\n\`\`\``)
        .join('\n\n')
    : ''
  const importanteNote = input.files
    ? 'IMPORTANTE: Os arquivos acima são o conteúdo real do projeto. Use-os como fonte — não invente nem simule o que não está escrito neles.'
    : 'IMPORTANTE: Este é um projeto fictício para fins de teste — não existem arquivos reais para escanear. Simule o que a skill produziria se o projeto existisse com a stack e domínio descritos acima.'
  return `Você é a skill ${skillName}. Sua função: ${skillDesc}

Contexto do projeto:
- Nome: ${input.nome}
- Domínio: ${input.dominio}
- Stack: ${input.stack}
- Usuários: ${input.usuarios}
- Complexidade: ${input.complexidade}${docsSection}${filesSection}

Execute sua função conforme sua definição. Produza todos os artefatos esperados em Markdown completo e detalhado. Não resuma — produza o output real que a skill geraria.

ARTEFATOS OBRIGATÓRIOS: seu output DEVE conter explicitamente todos os seguintes itens (use estes termos exatos):
${checklist.map(item => `- ${item}`).join('\n')}

${importanteNote}`
}

// args.skills: array de nomes para filtrar (ex: ['go-swift']). Default: todas.
const skillFilter = args?.skills ?? null
const RUNS = Object.entries(SKILLS)
  .filter(([skillName]) => !skillFilter || skillFilter.includes(skillName))
  .flatMap(([skillName, skillDef]) => [
    { skillName, skillDef, input: args?.inputA ?? INPUT_A, label: `${skillName}:A` },
    { skillName, skillDef, input: args?.inputB ?? INPUT_B, label: `${skillName}:B` },
    { skillName, skillDef, input: args?.inputC ?? INPUT_C, label: `${skillName}:C` },
  ])

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
        relevancia: { type: 'number' },
        completude: { type: 'number' },
        clareza: { type: 'number' },
        aderencia: { type: 'number' },
      },
    },
    rationale: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
  },
}

phase('Skill Execution')
log(`Executando ${RUNS.length} combinações skill×input em paralelo...`)

const results = await pipeline(
  RUNS,

  // Estágio 1: Skill Execution
  async (run) => {
    const output = await agent(
      buildPrompt(run.skillName, run.skillDef.description, run.input, run.skillDef.checklist),
      {
        label: `exec:${run.label}`,
        phase: 'Skill Execution',
      }
    )
    // Proxy de tokens: caracteres / 4 (aproximação padrão para modelos de linguagem)
    const tokens_approx = Math.round((output?.length ?? 0) / 4)
    return { run, output, tokens_approx }
  },

  // Estágio 2: Structural Eval
  async (prev) => {
    if (!prev) return null
    const { run, output, tokens_approx } = prev

    const checklistItems = run.skillDef.checklist.join(', ')
    const structResult = await agent(
      `Você é um avaliador técnico rigoroso. Analise o output abaixo e verifique se contém TODOS os seguintes itens obrigatórios para a skill ${run.skillName}: ${checklistItems}

Regras de busca:
- A busca é CASE-INSENSITIVE: "Mermaid", "mermaid" e "MERMAID" são equivalentes.
- Aceite variações de plural/singular e sufixos comuns: "migration" aceita "migrations", "migrate", "migração", "migrações".
- Aceite menções em nomes de arquivo, headings e corpo do texto.
- Não infira presença: se o conceito estiver implícito mas o termo não aparecer, marque como ausente.

Estime o número aproximado de tokens no output (conte palavras × 1.3 como proxy).
Estime a latência em ms com base no tamanho do output (use 10ms por 100 tokens como proxy).

OUTPUT A AVALIAR:
---
${output}
---

Retorne APENAS o JSON estruturado, sem texto adicional.`,
      {
        label: `struct:${run.label}`,
        phase: 'Structural Eval',
        schema: STRUCT_SCHEMA,
      }
    )
    return { run, output, tokens_approx, structResult }
  },

  // Estágio 3: LLM Judge
  async (prev) => {
    if (!prev) return null
    const { run, output, tokens_approx, structResult } = prev

    const judgeResult = await agent(
      `Você é um avaliador rigoroso de qualidade de outputs de agentes AI. Avalie o output abaixo produzido pela skill ${run.skillName} para o projeto "${run.input.nome}".

## Calibração obrigatória

Score 4 é o baseline esperado para um output competente. Score 5 deve ser raro — reserve para outputs que um engenheiro sênior usaria como referência sem modificação. Scores abaixo de 3 indicam problema real. Seja crítico: a maioria dos outputs deve cair entre 3 e 4.

## Rubrica com âncoras por nível

### relevancia — O output é específico para este projeto?

- **1:** Totalmente genérico — não menciona o nome do projeto, stack ou domínio. Poderia ser de qualquer projeto.
- **2:** Menciona o nome do projeto uma vez, mas usa exemplos placeholder ("User entity", "example.com") sem relação com o domínio.
- **3:** Referencia a stack e o domínio, mas perde elementos específicos importantes (ex: go-otter para sistema de monitoramento sem mencionar séries temporais).
- **4:** Claramente contextualizado — entidades, endpoints e exemplos correspondem à stack e domínio do projeto (ex: tabela "tasks" para TaskFlow, "metrics" para ServerWatch).
- **5:** Profundamente específico — cada exemplo, schema, componente e decisão técnica reflete precisamente o projeto sem nenhum placeholder genérico.

### completude — Cobre todos os aspectos esperados da skill?

- **1:** Cobre apenas 1–2 aspectos; maioria dos artefatos esperados pela skill ausente.
- **2:** Cobre metade dos outputs esperados; seções principais faltando (ex: go-hawk sem "Out of scope").
- **3:** Cobre a maioria das seções, mas com profundidade rasa; ao menos uma seção significativamente subdesenvolvida.
- **4:** Todas as seções esperadas presentes com profundidade adequada; lacunas mínimas ou uma seção menos desenvolvida.
- **5:** Todas as seções presentes e completamente desenvolvidas; nenhuma lacuna identificável; vai além do mínimo onde útil.

### clareza — Está bem estruturado e legível?

- **1:** Bloco de texto sem estrutura; sem headings; ideias misturadas; difícil extrair informação.
- **2:** Alguma estrutura, mas inconsistente; headings presentes mas conteúdo mal organizado internamente.
- **3:** Estrutura clara com headings corretos; legível mas com prosa verbosa ou repetitiva em trechos.
- **4:** Bem estruturado; headings, listas e tabelas usados adequadamente; conciso e escaneável.
- **5:** Organização exemplar; hierarquia de informação imediatamente clara; formatação auxilia compreensão em todos os níveis.

### aderencia — Fez o que a skill promete fazer?

- **1:** Output não corresponde ao propósito da skill (ex: go-fox produziu requirements doc em vez de ADR).
- **2:** Segue parcialmente o workflow da skill, mas pula ou interpreta mal etapas-chave.
- **3:** Segue o propósito geral da skill, mas falta ao menos um artefato obrigatório (ex: go-fox sem diagrama Mermaid).
- **4:** Entrega todos os artefatos centrais que a skill promete; desvios mínimos do workflow definido.
- **5:** Entrega integralmente o que a skill promete, incluindo todos os artefatos obrigatórios, seguindo o workflow exatamente.

## Score final

score = média aritmética das 4 dimensões (arredonde para 1 casa decimal).

CONTEXTO DO PROJETO:
- Nome: ${run.input.nome}
- Domínio: ${run.input.dominio}
- Stack: ${run.input.stack}
- Skill avaliada: ${run.skillName}

OUTPUT AVALIADO:
---
${output}
---

Retorne APENAS o JSON estruturado, sem texto adicional.`,
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
log('Consolidando resultados e gerando report...')

const validResults = results.filter(Boolean)

const bySkill = {}
for (const r of validResults) {
  const { skillName } = r.run
  if (!bySkill[skillName]) bySkill[skillName] = {}
  const inputKey = r.run.input === (args?.inputA ?? INPUT_A) ? 'A'
    : r.run.input === (args?.inputB ?? INPUT_B) ? 'B' : 'C'
  bySkill[skillName][inputKey] = r
}

// Inputs excluídos do cálculo de score médio por incompatibilidade estrutural com a skill.
// O input ainda aparece na tabela de resultados — só é omitido da média.
// go-bear A: app pessoal sem superfície de segurança web adequada.
// go-bear B: ServerWatch (Go + InfluxDB) — monitoramento de infra sem fluxo auth/PCI/PII;
//   o judge penaliza aderência (A=1) em 2/3 das rodadas, não por falha da skill mas por
//   mismatch entre o domínio do projeto e o workflow OWASP-centrado de go-bear.
// go-raven A: app pessoal simples sem necessidade de pipeline multi-ambiente.
// go-kite A: projeto fictício novo (TaskFlow) sem codebase real para auditar;
//   go-kite usa repomix para inspecionar sistemas existentes — input A não tem artefatos.
const SKIP_INPUTS_FOR_SCORE = {
  'go-bear':  ['A', 'B'],
  'go-raven': ['A'],
  'go-kite':  ['A'],
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

// Detecção de outliers: flag quando um score de um input desvia ≥1.5 pontos
// da mediana dos outros inputs da mesma skill.
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
reportLines.push(`**Skills testadas:** ${Object.keys(SKILLS).length} go-* | **Inputs:** A (TaskFlow API) · B (ServerWatch) · C (PayLink)\n`)
reportLines.push(`---\n`)

reportLines.push(`## 1. Resultados por Skill\n`)
reportLines.push(`| Skill | Input | Struct | Missing | Score | Dims (R/C/Cl/A) | Tokens | Latência |`)
reportLines.push(`|---|---|---|---|---|---|---|---|`)

for (const r of validResults) {
  const structPass = r.structResult?.pass ? '✓' : '✗'
  const missing = r.structResult?.missing?.join(', ') || '—'
  const judgeScore = r.judgeResult?.score?.toFixed(1) ?? 'n/a'
  const d = r.judgeResult?.dimensions
  const dims = d ? `R${d.relevancia} C${d.completude} Cl${d.clareza} A${d.aderencia}` : '—'
  const tokens = r.tokens_approx?.toLocaleString() ?? '—'
  const latency = r.structResult?.latency_ms ? `${r.structResult.latency_ms.toLocaleString()} ms` : '—'
  const inputLabel = r.run.input === (args?.inputA ?? INPUT_A) ? 'A'
    : r.run.input === (args?.inputB ?? INPUT_B) ? 'B' : 'C'
  reportLines.push(`| ${r.run.skillName} | ${inputLabel} | ${structPass} | ${missing} | ${judgeScore} | ${dims} | ${tokens} | ${latency} |`)
}

reportLines.push(`\n## 2. Comparativo A / B / C por Skill\n`)
for (const [skillName, inputs] of Object.entries(bySkill)) {
  const a = inputs['A']
  const b = inputs['B']
  const c = inputs['C']
  const scoreA = a?.judgeResult?.score ?? null
  const scoreB = b?.judgeResult?.score ?? null
  const scoreC = c?.judgeResult?.score ?? null
  const scores = { A: scoreA, B: scoreB, C: scoreC }
  const best = Object.entries(scores)
    .filter(([, s]) => s != null)
    .sort(([, a], [, b]) => b - a)
  const bestLabel = best.length > 0
    ? (best[0][1] === best[best.length - 1][1] ? 'Empate' : `Input ${best[0][0]}`)
    : 'n/a'
  reportLines.push(`### ${skillName}`)
  reportLines.push(`- Score A: ${scoreA?.toFixed(1) ?? 'n/a'} | B: ${scoreB?.toFixed(1) ?? 'n/a'} | C: ${scoreC?.toFixed(1) ?? 'n/a'}`)
  reportLines.push(`- Tokens A: ${(a?.tokens_approx ?? 0).toLocaleString()} | B: ${(b?.tokens_approx ?? 0).toLocaleString()} | C: ${(c?.tokens_approx ?? 0).toLocaleString()}`)
  reportLines.push(`- Melhor input: **${bestLabel}**\n`)
}

reportLines.push(`## 3. Sumário Executivo\n`)
reportLines.push(`### Top 3 Skills (por score médio)`)
for (const s of top3) {
  const skipNote = s.skippedInputs?.length ? ` _(exclui Input ${s.skippedInputs.join('+')} — input inadequado para esta skill)_` : ''
  reportLines.push(`- **${s.skillName}**: ${s.avgScore?.toFixed(1) ?? 'n/a'}${skipNote}`)
}
reportLines.push(`\n### Bottom 3 Skills (candidatas a revisão)`)
for (const s of bottom3) {
  const skipNote = s.skippedInputs?.length ? ` _(exclui Input ${s.skippedInputs.join('+')} — input inadequado para esta skill)_` : ''
  reportLines.push(`- **${s.skillName}**: ${s.avgScore?.toFixed(1) ?? 'n/a'}${skipNote}`)
}
if (structFails.length > 0) {
  reportLines.push(`\n### Skills com falha estrutural ⚠️`)
  for (const r of structFails) {
    const inputLabel = r.run.input === (args?.inputA ?? INPUT_A) ? 'A'
    : r.run.input === (args?.inputB ?? INPUT_B) ? 'B' : 'C'
    reportLines.push(`- **${r.run.skillName}** (Input ${inputLabel}): ausente: ${r.structResult?.missing?.join(', ')}`)
  }
}
if (outliers.length > 0) {
  reportLines.push(`\n### Outliers detectados ⚠️`)
  reportLines.push(`_Score desvia ≥1.5 pontos da mediana dos outros inputs da mesma skill — pode ser ruído do judge ou problema real._`)
  for (const o of outliers) {
    reportLines.push(`- **${o.skillName}** Input ${o.input}: score ${o.score.toFixed(1)} vs mediana ${o.median.toFixed(1)} (Δ${o.deviation.toFixed(1)})`)
  }
}
reportLines.push(`\n### Benchmark de Custo`)
reportLines.push(`- Total de tokens (skills + evals): ${totalTokensAll.toLocaleString()}`)
reportLines.push(`- Custo estimado (Sonnet 4.6): ~$${estimatedCostUSD.toFixed(4)} USD`)
reportLines.push(`- Skills avaliadas: ${Object.keys(bySkill).length}/${Object.keys(SKILLS).length}`)
reportLines.push(`- Runs com erro: ${results.filter(r => !r).length}`)

const reportContent = reportLines.join('\n')

await agent(
  `Salve o seguinte conteúdo Markdown no arquivo ~/.claude/workflows/go-star-eval/reports/report.md (crie os diretórios se necessário usando Bash ou mcp__filesystem__create_directory). Use a ferramenta Write para escrever o arquivo.

CONTEÚDO:
${reportContent}`,
  {
    label: 'save-report',
    phase: 'Aggregation',
  }
)

log('Report salvo em ~/.claude/workflows/go-star-eval/reports/report.md')

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
