#!/usr/bin/env node
// go-beast installer — cross-platform (macOS, Linux, Windows)
// No external dependencies. Requires Node.js 18+.
// Usage: node scripts/install.mjs [--all] [--uninstall]

import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { execSync } from 'child_process'

// ── Paths ─────────────────────────────────────────────────────────────────────
const REPO = path.resolve(import.meta.dirname, '..')
const HOME = os.homedir()
const IS_WIN = process.platform === 'win32'

const j = (...parts) => path.join(...parts)

// ── Agent registry ────────────────────────────────────────────────────────────
const AGENTS = [
  {
    name:      'claude-code',
    detect:    j(HOME, '.claude'),
    skills:    j(HOME, '.claude', 'skills'),
    hooks:     j(HOME, '.claude', 'hooks'),
    workflows: j(HOME, '.claude', 'workflows'),
    globalMd:  j(HOME, '.claude', 'CLAUDE.md'),
  },
  {
    name:    'cursor',
    detect:  j(HOME, '.cursor'),
    skills:  j(HOME, '.cursor', 'skills'),
    globalMd: j(HOME, '.cursor', 'rules'),
  },
  {
    name:    'gemini',
    detect:  j(HOME, '.gemini'),
    skills:  j(HOME, '.gemini', 'skills'),
    globalMd: j(HOME, '.gemini', 'GEMINI.md'),
  },
  {
    name:    'cline',
    detect:  j(HOME, '.cline'),
    skills:  j(HOME, '.cline', 'skills'),
    globalMd: j(HOME, '.cline', 'AGENTS.md'),
  },
  {
    name:    'copilot',
    detect:  j(HOME, '.github', 'copilot'),
    skills:  j(HOME, '.github', 'copilot', 'skills'),
    globalMd: j(HOME, '.github', 'copilot-instructions.md'),
  },
  {
    name:    'codex',
    detect:  j(HOME, '.codex'),
    skills:  j(HOME, '.codex', 'skills'),
    globalMd: j(HOME, '.codex', 'AGENTS.md'),
  },
  {
    name:    'agents',
    detect:  j(HOME, '.agents'),
    skills:  j(HOME, '.agents', 'skills'),
    globalMd: j(HOME, '.agents', 'AGENTS.md'),
  },
]

// ── Colours (disabled on Windows unless WT/ANSI) ──────────────────────────────
const hasColour = !IS_WIN || process.env.WT_SESSION || process.env.TERM
const c = {
  ok:   s => hasColour ? `\x1b[32m✓\x1b[0m ${s}` : `[ok] ${s}`,
  skip: s => hasColour ? `\x1b[36m–\x1b[0m ${s}` : `[--] ${s}`,
  warn: s => hasColour ? `\x1b[33m⚠\x1b[0m ${s}` : `[!!] ${s}`,
  err:  s => hasColour ? `\x1b[31m✗\x1b[0m ${s}` : `[xx] ${s}`,
  h:    s => hasColour ? `\n\x1b[1m── ${s} ──\x1b[0m` : `\n── ${s} ──`,
  b:    s => hasColour ? `\x1b[1m${s}\x1b[0m` : s,
  cy:   s => hasColour ? `\x1b[36m${s}\x1b[0m` : s,
}
const p  = s => process.stdout.write('  ' + s + '\n')
const ph = s => process.stdout.write(c.h(s) + '\n')

// ── readline prompt ───────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = q => new Promise(res => rl.question(q, res))

// ── Collectors ────────────────────────────────────────────────────────────────
function collectSkills() {
  return fs.readdirSync(REPO)
    .filter(n => n.startsWith('go-') && fs.existsSync(j(REPO, n, 'SKILL.md')))
    .sort()
}

function collectHooks() {
  return fs.readdirSync(j(REPO, 'hooks'))
    .filter(n => n.endsWith('.sh'))
    .sort()
}

function collectWorkflows() {
  return fs.readdirSync(j(REPO, 'workflows'))
    .filter(n => n.endsWith('.js'))
    .sort()
}

// ── Symlink helper ────────────────────────────────────────────────────────────
function linkItem(src, dir) {
  const name = path.basename(src)
  const dst  = j(dir, name)
  fs.mkdirSync(dir, { recursive: true })

  let stat
  try { stat = fs.lstatSync(dst) } catch { stat = null }
  if (stat) {
    if (stat.isSymbolicLink()) {
      try {
        const cur  = path.normalize(fs.readlinkSync(dst)).replace(/[/\\]+$/, '')
        const srcN = path.normalize(src).replace(/[/\\]+$/, '')
        if (cur === srcN) { p(c.skip(`${name}  (already linked)`)); return }
        p(c.warn(`${name}  (linked elsewhere — skipping)`))
      } catch {
        p(c.warn(`${name}  (exists — skipping)`))
      }
    } else {
      p(c.warn(`${name}  (file/dir exists — skipping)`))
    }
    return
  }

  try {
    fs.symlinkSync(src, dst, fs.statSync(src).isDirectory() ? 'dir' : 'file')
    p(c.ok(name))
  } catch (e) {
    p(c.err(`${name}  (${e.message})`))
  }
}

function cleanStale(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    const full = j(dir, entry)
    try {
      if (!fs.lstatSync(full).isSymbolicLink()) continue
      const dst = fs.readlinkSync(full)
      if (dst.startsWith(REPO) && !fs.existsSync(dst)) {
        fs.unlinkSync(full)
        p(c.warn(`removed stale: ${entry}`))
      }
    } catch { /* skip */ }
  }
}

// ── Uninstall ─────────────────────────────────────────────────────────────────
function uninstall() {
  ph('Uninstall')
  let total = 0
  const dirs = AGENTS.flatMap(a => [a.skills, a.hooks, a.workflows].filter(Boolean))
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir)) {
      const full = j(dir, entry)
      try {
        if (!fs.lstatSync(full).isSymbolicLink()) continue
        const dst = fs.readlinkSync(full)
        if (dst.startsWith(REPO)) { fs.unlinkSync(full); p(c.ok(`${entry}  ← ${path.basename(dir)}`)); total++ }
      } catch { /* skip */ }
    }
  }
  p(total === 0 ? c.skip('Nothing to remove.') : c.ok(`${total} symlink(s) removed.`))
}

// ── pick_items: a / n / p with numbered list and range support ────────────────
async function pickItems(prompt, items) {
  const count = items.length
  process.stdout.write(`\n  ${c.b(prompt)}  (${count} available)\n`)
  process.stdout.write(`  [a] all    [n] none    [p] pick\n`)

  while (true) {
    const choice = (await ask('  > ')).trim().toLowerCase()
    if (choice === 'a') return items
    if (choice === 'n') return []
    if (choice === 'p') break
    process.stdout.write('  a / n / p\n')
  }

  process.stdout.write('\n')
  items.forEach((item, i) => process.stdout.write(`  ${String(i + 1).padStart(3)}) ${item}\n`))
  process.stdout.write('\n')
  const raw = (await ask('  Numbers or range (e.g. 1 3 5  or  1-5): ')).trim()

  const result = []
  for (const token of raw.split(/\s+/)) {
    const range = token.match(/^(\d+)-(\d+)$/)
    if (range) {
      const lo = parseInt(range[1]), hi = parseInt(range[2])
      for (let i = lo; i <= hi; i++) {
        if (i >= 1 && i <= count) result.push(items[i - 1])
      }
    } else {
      const n = parseInt(token)
      if (n >= 1 && n <= count) result.push(items[n - 1])
    }
  }
  return result
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const flag = process.argv[2] ?? ''

  if (flag === '--uninstall') { uninstall(); rl.close(); return }

  process.stdout.write(`\n  ${c.b('go-beast')}  ${c.cy(REPO)}\n`)

  // 1. Detect agents
  ph('Agents available')
  const detected = AGENTS.filter(a => fs.existsSync(a.detect))
  if (detected.length === 0) { p(c.err('No supported agents found.')); rl.close(); return }
  detected.forEach(a => p(c.ok(`${a.name}  →  ${a.skills}`)))

  // 2. Select agents
  let selAgents
  if (flag === '--all') {
    selAgents = detected
  } else {
    selAgents = await pickItems('Install into which agents?', detected.map(a => a.name))
    selAgents = selAgents.map(n => detected.find(a => a.name === n))
  }
  if (selAgents.length === 0) { p(c.warn('No agents selected.')); rl.close(); return }

  // 3. Select skills
  const allSkills = collectSkills()
  let selSkills
  if (flag === '--all') {
    selSkills = allSkills
  } else {
    selSkills = await pickItems('Skills', allSkills)
  }

  // 4. Claude Code extras
  const cc = selAgents.find(a => a.name === 'claude-code')
  let selHooks = [], selWorkflows = []

  if (cc) {
    const allHooks = collectHooks()
    const allWf    = collectWorkflows()
    if (flag === '--all') {
      selHooks = allHooks; selWorkflows = allWf
    } else {
      if (allHooks.length)    selHooks     = await pickItems('Hooks  (Claude Code only)', allHooks)
      if (allWf.length)       selWorkflows = await pickItems('Workflows  (Claude Code only)', allWf)
    }
  }

  rl.close()

  // 5. Install
  ph('Installing')

  if (selSkills.length > 0) {
    for (const agent of selAgents) {
      process.stdout.write(`\n  ${c.b('skills → ' + agent.name)}\n`)
      cleanStale(agent.skills)
      for (const skill of selSkills) linkItem(j(REPO, skill), agent.skills)
    }
  }

  if (cc && selHooks.length > 0) {
    process.stdout.write(`\n  ${c.b('hooks → claude-code')}\n`)
    cleanStale(cc.hooks)
    for (const hook of selHooks) {
      linkItem(j(REPO, 'hooks', hook), cc.hooks)
      // chmod +x on Unix
      if (!IS_WIN) try { fs.chmodSync(j(REPO, 'hooks', hook), 0o755) } catch {}
    }
  }

  if (cc && selWorkflows.length > 0) {
    process.stdout.write(`\n  ${c.b('workflows → claude-code')}\n`)
    cleanStale(cc.workflows)
    for (const wf of selWorkflows) linkItem(j(REPO, 'workflows', wf), cc.workflows)
  }

  const globalSrc = j(REPO, 'AGENTS.global.md')
  if (fs.existsSync(globalSrc)) {
    process.stdout.write(`\n  ${c.b('global instructions')}\n`)
    for (const agent of selAgents) {
      if (!agent.globalMd) continue
      fs.mkdirSync(path.dirname(agent.globalMd), { recursive: true })
      fs.copyFileSync(globalSrc, agent.globalMd)
      p(c.ok(`${agent.name}  →  ${agent.globalMd}`))
    }
  }

  // Summary
  ph('Summary')
  p(`agents:    ${selAgents.length}  (${selAgents.map(a => a.name).join(', ')})`)
  p(`skills:    ${selSkills.length}`)
  if (cc && selHooks.length)     p(`hooks:     ${selHooks.length}`)
  if (cc && selWorkflows.length) p(`workflows: ${selWorkflows.length}`)
  process.stdout.write('\n')

  if (cc && selHooks.length > 0) {
    p(c.warn('Hooks are linked but not yet wired to events.'))
    p(`Add entries to ${c.cy('~/.claude/settings.json')} or run go-swift.`)
    process.stdout.write('\n')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
