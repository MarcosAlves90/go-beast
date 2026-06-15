#!/usr/bin/env node
import fs from 'fs'
import os from 'os'
import path from 'path'

const REPO = path.resolve(import.meta.dirname, '..')
const HOME = os.homedir()

const AGENTS = {
  'claude-code': {
    hookDir: home => path.join(home, '.claude', 'hooks'),
    configPath: home => path.join(home, '.claude', 'settings.json'),
    commandRoot: '~/.claude/hooks',
  },
  codex: {
    hookDir: home => path.join(home, '.codex', 'hooks'),
    configPath: home => path.join(home, '.codex', 'hooks.json'),
    commandRoot: '~/.codex/hooks',
  },
}

function loadHookManifest(repoRoot = REPO) {
  const manifestPath = path.join(repoRoot, 'hooks', 'manifest.json')
  const raw = fs.readFileSync(manifestPath, 'utf8')
  const data = JSON.parse(raw)
  const hooks = Array.isArray(data) ? data : data.hooks
  if (!Array.isArray(hooks)) {
    throw new Error(`Invalid hook manifest: ${manifestPath}`)
  }
  return hooks.map(item => ({
    name: item.name,
    targets: Array.isArray(item.targets) ? item.targets : [],
    event: item.event,
    matcher: item.matcher ?? '',
    statusMessage: item.statusMessage ?? '',
  }))
}

function hooksForAgent(manifest, agentName, hookNames = null) {
  const allow = hookNames ? new Set(hookNames) : null
  return manifest.filter(item => {
    if (allow && !allow.has(item.name)) return false
    return item.targets.includes(agentName)
  })
}

function commandFor(agentName, hookName) {
  const agent = AGENTS[agentName]
  if (!agent) throw new Error(`Unsupported agent: ${agentName}`)
  return `bash ${agent.commandRoot}/${hookName}`
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function existingHookKeys(config) {
  const keys = new Set()
  const buckets = config?.hooks && typeof config.hooks === 'object' ? config.hooks : {}
  for (const [event, entries] of Object.entries(buckets)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const matcher = entry?.matcher ?? ''
      const hooks = Array.isArray(entry?.hooks) ? entry.hooks : []
      for (const hook of hooks) {
        if (!hook || hook.type !== 'command' || !hook.command) continue
        keys.add(`${event}::${matcher}::${hook.command}`)
      }
    }
  }
  return keys
}

function buildEntry(spec, command) {
  const entry = { hooks: [{ type: 'command', command }] }
  if (spec.matcher) entry.matcher = spec.matcher
  if (spec.statusMessage) entry.hooks[0].statusMessage = spec.statusMessage
  return entry
}

function wireAgentConfig({ repoRoot = REPO, home = HOME, agentName, hookNames = null }) {
  const agent = AGENTS[agentName]
  if (!agent) throw new Error(`Unsupported agent: ${agentName}`)

  const manifest = loadHookManifest(repoRoot)
  const selected = hooksForAgent(manifest, agentName, hookNames)
  const configPath = agent.configPath(home)
  const config = readJson(configPath) ?? { hooks: {} }
  if (!config.hooks || typeof config.hooks !== 'object') config.hooks = {}

  const existing = existingHookKeys(config)
  let added = 0
  let skipped = 0

  for (const spec of selected) {
    const command = commandFor(agentName, spec.name)
    const key = `${spec.event}::${spec.matcher ?? ''}::${command}`
    if (existing.has(key)) {
      skipped++
      continue
    }

    const bucket = config.hooks[spec.event] ?? (config.hooks[spec.event] = [])
    bucket.push(buildEntry(spec, command))
    existing.add(key)
    added++
  }

  if (added > 0) writeJson(configPath, config)
  return { added, skipped, path: configPath, changed: added > 0 }
}

function ensureSymlink(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })

  let stat = null
  try { stat = fs.lstatSync(dst) } catch {}

  if (stat) {
    if (stat.isSymbolicLink()) {
      try {
        const cur = path.normalize(fs.readlinkSync(dst)).replace(/[/\\]+$/, '')
        const srcN = path.normalize(src).replace(/[/\\]+$/, '')
        if (cur === srcN) return { status: 'skip', note: 'already linked' }
        return { status: 'warn', note: 'linked elsewhere — skipped' }
      } catch {
        return { status: 'warn', note: 'linked elsewhere — skipped' }
      }
    }
    return { status: 'warn', note: 'exists — skipped' }
  }

  try {
    fs.symlinkSync(src, dst, fs.statSync(src).isDirectory() ? 'dir' : 'file')
    return { status: 'new' }
  } catch (error) {
    return { status: 'err', note: error.message }
  }
}

function cleanStale(dir, repoRoot = REPO) {
  if (!fs.existsSync(dir)) return 0
  let removed = 0
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    try {
      if (!fs.lstatSync(full).isSymbolicLink()) continue
      const dst = fs.readlinkSync(full)
      if (dst.startsWith(path.join(repoRoot, 'hooks')) && !fs.existsSync(dst)) {
        fs.unlinkSync(full)
        removed++
      }
    } catch {}
  }
  return removed
}

function syncAgentHooks({ repoRoot = REPO, home = HOME, agentName, hookNames = null }) {
  const agent = AGENTS[agentName]
  if (!agent) throw new Error(`Unsupported agent: ${agentName}`)

  const manifest = loadHookManifest(repoRoot)
  const selected = hooksForAgent(manifest, agentName, hookNames)
  const hookDir = agent.hookDir(home)
  fs.mkdirSync(hookDir, { recursive: true })
  cleanStale(hookDir, repoRoot)

  const results = []
  for (const spec of selected) {
    const src = path.join(repoRoot, 'hooks', spec.name)
    if (!fs.existsSync(src)) {
      results.push({ name: spec.name, status: 'warn', note: 'source missing' })
      continue
    }
    try {
      if (process.platform !== 'win32') fs.chmodSync(src, 0o755)
    } catch {}
    const dst = path.join(hookDir, spec.name)
    results.push({ name: spec.name, ...ensureSymlink(src, dst) })
  }
  return { hookDir, results }
}

function syncAgent({ repoRoot = REPO, home = HOME, agentName, hookNames = null }) {
  const scripts = syncAgentHooks({ repoRoot, home, agentName, hookNames })
  const config = wireAgentConfig({ repoRoot, home, agentName, hookNames })
  return { scripts, config }
}

function syncAgents({ repoRoot = REPO, home = HOME, agentNames = Object.keys(AGENTS), hookNames = null }) {
  return agentNames.map(agentName => ({ agentName, ...syncAgent({ repoRoot, home, agentName, hookNames }) }))
}

function parseArgs(argv) {
  const args = { command: 'sync', home: HOME, agent: null, hooks: null, repoRoot: REPO }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--home') args.home = argv[++i]
    else if (arg === '--repo') args.repoRoot = argv[++i]
    else if (arg === '--agent') args.agent = argv[++i]
    else if (arg === '--hooks') args.hooks = argv[++i].split(',').map(s => s.trim()).filter(Boolean)
    else if (arg === 'sync' || arg === 'wire') args.command = arg
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const agentNames = args.agent ? [args.agent] : Object.keys(AGENTS)
  const hookNames = args.hooks?.length ? args.hooks : null

  if (args.command === 'wire') {
    const result = syncAgents({ repoRoot: args.repoRoot, home: args.home, agentNames, hookNames })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  const result = syncAgents({ repoRoot: args.repoRoot, home: args.home, agentNames, hookNames })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

export {
  AGENTS,
  cleanStale,
  commandFor,
  hooksForAgent,
  loadHookManifest,
  syncAgent,
  syncAgentHooks,
  syncAgents,
  wireAgentConfig,
}
