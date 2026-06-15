#!/usr/bin/env node
// go-beast installer — cross-platform (macOS, Linux, Windows)
// No external dependencies. Requires Node.js 18+.
// Usage: ./scripts/install.mjs [--all] [--uninstall]

import fs   from 'fs'
import path from 'path'
import os   from 'os'
import readline from 'readline'

const REPO   = path.resolve(import.meta.dirname, '..')
const HOME   = os.homedir()
const IS_WIN = process.platform === 'win32'
const W      = process.stdout.columns || 60
const j      = (...p) => path.join(...p)

// ── ANSI ──────────────────────────────────────────────────────────────────────
const TTY = process.stdout.isTTY && (!IS_WIN || process.env.WT_SESSION || process.env.TERM)
const A = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
  bgDark: '\x1b[48;5;235m',
}
const s  = (codes, t) => TTY ? `${codes}${t}${A.reset}` : t
const bold   = t => s(A.bold, t)
const dim    = t => s(A.dim, t)
const green  = t => s(A.green, t)
const cyan   = t => s(A.cyan, t)
const yellow = t => s(A.yellow, t)
const red    = t => s(A.red, t)
const gray   = t => s(A.gray, t)

// ── Layout helpers ─────────────────────────────────────────────────────────────
const out = s => process.stdout.write(s)
const ln  = s => out((s ?? '') + '\n')
const pad = (s, n) => s.padEnd(n)

function box(title, lines) {
  const inner = Math.min(W - 4, 54)
  const top   = TTY ? `╭─ ${bold(title)} ${'─'.repeat(inner - title.length - 1)}╮` : `┌─ ${title} ${'─'.repeat(inner - title.length - 1)}┐`
  const bot   = TTY ? `╰${'─'.repeat(inner + 2)}╯` : `└${'─'.repeat(inner + 2)}┘`
  const sep   = TTY ? `├${'─'.repeat(inner + 2)}┤` : `├${'─'.repeat(inner + 2)}┤`
  const row   = l => {
    const clean = l.replace(/\x1b\[[0-9;]*m/g, '')
    const fill  = inner - clean.length
    return (TTY ? '│' : '│') + ' ' + l + ' '.repeat(Math.max(0, fill)) + ' ' + (TTY ? '│' : '│')
  }
  ln(top)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '---') { ln(sep); continue }
    ln(row(lines[i]))
  }
  ln(bot)
}

function section(title) {
  ln()
  if (TTY) {
    out(`  ${A.bold}${A.cyan}▸${A.reset} ${bold(title)}\n`)
  } else {
    out(`  ▸ ${title}\n`)
  }
}

const icon = {
  ok:   TTY ? `${A.green}✓${A.reset}` : '[ok]',
  skip: TTY ? `${A.gray}–${A.reset}`  : '[--]',
  warn: TTY ? `${A.yellow}⚠${A.reset}` : '[!!]',
  err:  TTY ? `${A.red}✗${A.reset}`   : '[xx]',
  link: TTY ? `${A.cyan}→${A.reset}`  : '->',
  new:  TTY ? `${A.green}+${A.reset}` : '[+]',
}

const row = (ico, label, note) =>
  `  ${ico} ${label}${note ? `  ${dim(note)}` : ''}`

// ── Agent registry ─────────────────────────────────────────────────────────────
const AGENTS = [
  { name: 'claude-code', detect: j(HOME,'.claude'),           skills: j(HOME,'.claude','skills'),           hooks: j(HOME,'.claude','hooks'), workflows: j(HOME,'.claude','workflows'), globalMd: j(HOME,'.claude','CLAUDE.md'), hookConfig: j(HOME,'.claude','settings.json'), hookConfigHint: '~/.claude/settings.json or run go-swift' },
  { name: 'cursor',      detect: j(HOME,'.cursor'),           skills: j(HOME,'.cursor','skills'),           globalMd: j(HOME,'.cursor','rules') },
  { name: 'gemini',      detect: j(HOME,'.gemini'),           skills: j(HOME,'.gemini','skills'),           globalMd: j(HOME,'.gemini','GEMINI.md') },
  { name: 'cline',       detect: j(HOME,'.cline'),            skills: j(HOME,'.cline','skills'),            globalMd: j(HOME,'.cline','AGENTS.md') },
  { name: 'copilot',     detect: j(HOME,'.github','copilot'), skills: j(HOME,'.github','copilot','skills'), globalMd: j(HOME,'.github','copilot-instructions.md') },
  { name: 'codex',       detect: j(HOME,'.codex'),            skills: j(HOME,'.codex','skills'),            hooks: j(HOME,'.codex','hooks'), globalMd: j(HOME,'.codex','AGENTS.md'), hookConfig: j(HOME,'.codex','hooks.json'), hookConfigAlt: j(HOME,'.codex','config.toml'), hookConfigHint: '~/.codex/hooks.json or inline [hooks] in ~/.codex/config.toml, then review with /hooks' },
  { name: 'agents',      detect: j(HOME,'.agents'),           skills: j(HOME,'.agents','skills'),           globalMd: j(HOME,'.agents','AGENTS.md') },
]

// ── Collectors ────────────────────────────────────────────────────────────────
const collectSkills    = () => fs.readdirSync(REPO).filter(n => n.startsWith('go-') && fs.existsSync(j(REPO,n,'SKILL.md'))).sort()
const collectHooks     = () => fs.readdirSync(j(REPO,'hooks')).filter(n => n.endsWith('.sh')).sort()
const collectWorkflows = () => fs.readdirSync(j(REPO,'workflows')).filter(n => n.endsWith('.js')).sort()

// ── Symlink ───────────────────────────────────────────────────────────────────
function linkItem(src, dir, results) {
  const name = path.basename(src)
  const dst  = j(dir, name)
  fs.mkdirSync(dir, { recursive: true })

  let stat = null
  try { stat = fs.lstatSync(dst) } catch {}

  if (stat) {
    if (stat.isSymbolicLink()) {
      try {
        const cur  = path.normalize(fs.readlinkSync(dst)).replace(/[/\\]+$/, '')
        const srcN = path.normalize(src).replace(/[/\\]+$/, '')
        if (cur === srcN) { results.push({ ico: icon.skip, name, note: 'already linked' }); return }
        results.push({ ico: icon.warn, name, note: 'linked elsewhere — skipped' }); return
      } catch {}
    }
    results.push({ ico: icon.warn, name, note: 'exists — skipped' }); return
  }

  try {
    fs.symlinkSync(src, dst, fs.statSync(src).isDirectory() ? 'dir' : 'file')
    results.push({ ico: icon.new, name })
  } catch (e) {
    results.push({ ico: icon.err, name, note: e.message })
  }
}

function cleanStale(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    const full = j(dir, entry)
    try {
      if (!fs.lstatSync(full).isSymbolicLink()) continue
      const dst = fs.readlinkSync(full)
      if (dst.startsWith(REPO) && !fs.existsSync(dst)) { fs.unlinkSync(full); ln(row(icon.warn, entry, 'stale — removed')) }
    } catch {}
  }
}

// ── Uninstall ─────────────────────────────────────────────────────────────────
function uninstall() {
  section('Uninstall')
  let total = 0
  const dirs = AGENTS.flatMap(a => [a.skills, a.hooks, a.workflows].filter(Boolean))
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir)) {
      const full = j(dir, entry)
      try {
        if (!fs.lstatSync(full).isSymbolicLink()) continue
        const dst = fs.readlinkSync(full)
        if (dst.startsWith(REPO)) { fs.unlinkSync(full); ln(row(icon.ok, entry, `← ${path.basename(dir)}`)); total++ }
      } catch {}
    }
  }
  ln()
  ln(total === 0 ? row(icon.skip, 'Nothing to remove.') : row(icon.ok, `${total} symlink(s) removed.`))
}

// ── Prompt ────────────────────────────────────────────────────────────────────
const rl  = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = q => new Promise(res => rl.question(q, res))

async function pickItems(label, items) {
  ln()
  box(label, [
    `${items.length} available`,
    '---',
    `${cyan('a')}  install all`,
    `${cyan('n')}  none / skip`,
    `${cyan('p')}  pick individually`,
  ])

  while (true) {
    const v = (await ask(`  ${cyan('›')} `)).trim().toLowerCase()
    if (v === 'a') return items
    if (v === 'n') return []
    if (v === 'p') break
    ln(`  ${gray('type a, n, or p')}`)
  }

  ln()
  // Two-column layout for pick
  const half = Math.ceil(items.length / 2)
  for (let i = 0; i < half; i++) {
    const left  = `${gray(String(i + 1).padStart(3))}  ${items[i]}`
    const right = items[i + half] ? `${gray(String(i + half + 1).padStart(3))}  ${items[i + half]}` : ''
    ln(`  ${pad(left, 30)}${right}`)
  }
  ln()
  const raw = (await ask(`  ${cyan('›')} numbers or range (e.g. ${gray('1 3 5')} or ${gray('1-5')}): `)).trim()

  const result = []
  for (const token of raw.split(/\s+/)) {
    const range = token.match(/^(\d+)-(\d+)$/)
    if (range) {
      for (let i = +range[1]; i <= +range[2]; i++)
        if (i >= 1 && i <= items.length) result.push(items[i-1])
    } else {
      const n = +token
      if (n >= 1 && n <= items.length) result.push(items[n-1])
    }
  }
  return result
}

// ── Install section with tabular output ───────────────────────────────────────
function printResults(results) {
  const newOnes  = results.filter(r => r.ico === icon.new)
  const skipped  = results.filter(r => r.ico === icon.skip)
  const warnings = results.filter(r => r.ico === icon.warn || r.ico === icon.err)

  for (const r of newOnes)  ln(row(r.ico, r.name))
  for (const r of warnings) ln(row(r.ico, r.name, r.note))
  if (skipped.length > 0)
    ln(`  ${icon.skip} ${dim(`${skipped.length} already linked`)}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const flag = process.argv[2] ?? ''
  if (flag === '--uninstall') { uninstall(); rl.close(); return }

  // Header
  ln()
  box('go-beast', [
    bold('skills pack installer'),
    '---',
    dim(REPO.replace(HOME, '~')),
  ])

  // 1. Agents
  section('Detected agents')
  const detected = AGENTS.filter(a => fs.existsSync(a.detect))
  if (!detected.length) { ln(row(icon.err, 'No supported agents found.')); rl.close(); return }
  for (const a of detected) ln(row(icon.ok, bold(a.name), a.skills.replace(HOME, '~')))

  // 2. Select agents
  let selAgents
  if (flag === '--all') {
    selAgents = detected
  } else {
    const names = await pickItems('Agents', detected.map(a => a.name))
    selAgents = names.map(n => detected.find(a => a.name === n))
  }
  if (!selAgents.length) { ln(); ln(row(icon.warn, 'No agents selected.')); rl.close(); return }

  // 3. Skills
  const allSkills = collectSkills()
  const selSkills = flag === '--all' ? allSkills : await pickItems('Skills', allSkills)

  // 4. Hook-capable agent extras
  const cc = selAgents.find(a => a.name === 'claude-code')
  const hookAgents = selAgents.filter(a => a.hooks)
  let selHooks = [], selWorkflows = []
  if (hookAgents.length) {
    const allHooks = collectHooks()
    if (flag === '--all') {
      selHooks = allHooks
    } else {
      if (allHooks.length) selHooks = await pickItems(`Hooks  (${hookAgents.map(a => a.name).join(', ')})`, allHooks)
    }
  }

  // 5. Claude Code workflow extras
  if (cc) {
    const allWf = collectWorkflows()
    if (flag === '--all') {
      selWorkflows = allWf
    } else {
      if (allWf.length) selWorkflows = await pickItems('Workflows  (Claude Code only)', allWf)
    }
  }

  rl.close()

  // 6. Install
  section('Installing')

  const counts = { new: 0, skip: 0, warn: 0 }

  if (selSkills.length) {
    for (const agent of selAgents) {
      ln(); ln(`  ${icon.link} ${bold('skills')} ${dim('→')} ${cyan(agent.name)}`)
      cleanStale(agent.skills)
      const results = []
      for (const skill of selSkills) linkItem(j(REPO, skill), agent.skills, results)
      printResults(results)
      for (const r of results) {
        if (r.ico === icon.new)  counts.new++
        if (r.ico === icon.skip) counts.skip++
        if (r.ico === icon.warn || r.ico === icon.err) counts.warn++
      }
    }
  }

  if (hookAgents.length && selHooks.length) {
    for (const agent of hookAgents) {
      ln(); ln(`  ${icon.link} ${bold('hooks')} ${dim('→')} ${cyan(agent.name)}`)
      cleanStale(agent.hooks)
      const results = []
      for (const hook of selHooks) {
        linkItem(j(REPO, 'hooks', hook), agent.hooks, results)
        if (!IS_WIN) try { fs.chmodSync(j(REPO, 'hooks', hook), 0o755) } catch {}
      }
      printResults(results)
    }
  }

  if (cc && selWorkflows.length) {
    ln(); ln(`  ${icon.link} ${bold('workflows')} ${dim('→')} ${cyan('claude-code')}`)
    cleanStale(cc.workflows)
    const results = []
    for (const wf of selWorkflows) linkItem(j(REPO, 'workflows', wf), cc.workflows, results)
    printResults(results)
  }

  const globalSrc = j(REPO, 'AGENTS.global.md')
  if (fs.existsSync(globalSrc)) {
    ln(); ln(`  ${icon.link} ${bold('global instructions')}`)
    for (const agent of selAgents) {
      if (!agent.globalMd) continue
      fs.mkdirSync(path.dirname(agent.globalMd), { recursive: true })
      fs.copyFileSync(globalSrc, agent.globalMd)
      ln(row(icon.ok, cyan(agent.name), agent.globalMd.replace(HOME, '~')))
    }
  }

  // Summary box
  ln()
  box('Done', [
    `agents     ${bold(String(selAgents.length))}  ${dim(selAgents.map(a => a.name).join(', '))}`,
    `skills     ${bold(String(selSkills.length))}`,
    ...(hookAgents.length && selHooks.length ? [`hooks      ${bold(String(selHooks.length))}  ${dim(hookAgents.map(a => a.name).join(', '))}`] : []),
    ...(cc && selWorkflows.length ? [`workflows  ${bold(String(selWorkflows.length))}`] : []),
    '---',
    `${green(String(counts.new))} new  ${gray(String(counts.skip))} already linked  ${counts.warn ? yellow(String(counts.warn)) + ' warnings' : dim('0 warnings')}`,
  ])

  if (hookAgents.length && selHooks.length) {
    for (const agent of hookAgents) {
      let configText = ''
      for (const file of [agent.hookConfig, agent.hookConfigAlt].filter(Boolean)) {
        try { configText += fs.readFileSync(file, 'utf8') + '\n' } catch {}
      }
      const unwired = selHooks.filter(h => !configText.includes(h))
      if (!unwired.length) continue

      ln()
      ln(`  ${icon.warn} ${yellow(`Some hooks are not yet wired for ${agent.name}:`)}`)
      for (const h of unwired) ln(`  ${dim('  –')} ${h}`)
      ln(`  ${dim('Add entries to')} ${cyan(agent.hookConfigHint)}${dim('.')}`)
    }
  }
  ln()
}

main().catch(e => { console.error(e); process.exit(1) })
