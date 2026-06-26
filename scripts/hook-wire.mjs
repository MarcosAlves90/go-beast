#!/usr/bin/env node
import fs from 'fs'
import os from 'os'
import path from 'path'

const REPO = path.resolve(import.meta.dirname, '..')
const HOME = os.homedir()

// Copilot CLI uses camelCase event names and a flat entry format (no `hooks` wrapper).
// Event names differ from Claude Code / Codex PascalCase convention.
const COPILOT_EVENT_MAP = {
  SessionStart: 'sessionStart',
  UserPromptSubmit: 'userPromptSubmitted',
  Stop: 'agentStop',
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
}

const AGENTS = {
  'claude-code': {
    hookDir: home => path.join(home, '.claude', 'hooks'),
    configPath: home => path.join(home, '.claude', 'settings.json'),
    commandRoot: '~/.claude/hooks',
    format: 'claude',
  },
  codex: {
    hookDir: home => path.join(home, '.codex', 'hooks'),
    configPath: home => path.join(home, '.codex', 'hooks.json'),
    commandRoot: '~/.codex/hooks',
    format: 'claude',
  },
  copilot: {
    hookDir: home => path.join(home, '.copilot', 'hooks'),
    // Single managed file inside the hooks dir — Copilot loads all *.json from this dir.
    configPath: home => path.join(home, '.copilot', 'hooks', 'go-beast.json'),
    commandRoot: '~/.copilot/hooks',
    format: 'copilot',
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

function copilotEventName(event) {
  return COPILOT_EVENT_MAP[event] ?? event
}

// Claude / Codex: { matcher?, hooks: [{ type, command, statusMessage? }] }
// Copilot:        { type, bash, matcher? }  — flat, no wrapper
function buildEntry(spec, command, agentName) {
  const agent = AGENTS[agentName]
  if (agent?.format === 'copilot') {
    const entry = { type: 'command', bash: command }
    if (spec.matcher) entry.matcher = spec.matcher
    return entry
  }
  const entry = { hooks: [{ type: 'command', command }] }
  if (spec.matcher) entry.matcher = spec.matcher
  if (spec.statusMessage) entry.hooks[0].statusMessage = spec.statusMessage
  return entry
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

// Claude / Codex format: entries are { matcher?, hooks: [...] } wrappers.
// Copilot format: entries are flat { type, bash, matcher? } objects.
function existingHookKeys(config, agentName) {
  const agent = AGENTS[agentName]
  const keys = new Set()
  const buckets = config?.hooks && typeof config.hooks === 'object' ? config.hooks : {}
  for (const [event, entries] of Object.entries(buckets)) {
    if (!Array.isArray(entries)) continue
    if (agent?.format === 'copilot') {
      for (const entry of entries) {
        if (!entry || entry.type !== 'command' || !entry.bash) continue
        keys.add(`${event}::${entry.matcher ?? ''}::${entry.bash}`)
      }
    } else {
      for (const entry of entries) {
        const matcher = entry?.matcher ?? ''
        const hooks = Array.isArray(entry?.hooks) ? entry.hooks : []
        for (const hook of hooks) {
          if (!hook || hook.type !== 'command' || !hook.command) continue
          keys.add(`${event}::${matcher}::${hook.command}`)
        }
      }
    }
  }
  return keys
}

function refreshManagedConfigEntries(config, agentName, selected) {
  const agent = AGENTS[agentName]
  if (!config.hooks || typeof config.hooks !== 'object') config.hooks = {}

  const managedCommands = new Set(selected.map(spec => commandFor(agentName, spec.name)))
  let removed = 0

  for (const [event, entries] of Object.entries(config.hooks)) {
    if (!Array.isArray(entries)) continue

    if (agent?.format === 'copilot') {
      const nextEntries = entries.filter(entry => {
        if (!entry || entry.type !== 'command' || !entry.bash) return true
        if (!managedCommands.has(entry.bash)) return true
        removed++
        return false
      })
      config.hooks[event] = nextEntries
    } else {
      const nextEntries = []
      for (const entry of entries) {
        const hooks = Array.isArray(entry?.hooks) ? entry.hooks : []
        const keptHooks = hooks.filter(hook => {
          if (!hook || hook.type !== 'command' || !hook.command) return true
          if (!managedCommands.has(hook.command)) return true
          removed++
          return false
        })

        if (hooks.length > 0 && keptHooks.length === 0) continue
        if (keptHooks.length !== hooks.length) nextEntries.push({ ...entry, hooks: keptHooks })
        else nextEntries.push(entry)
      }
      config.hooks[event] = nextEntries
    }
  }

  return removed
}

function wireAgentConfig({ repoRoot = REPO, home = HOME, agentName, hookNames = null }) {
  const agent = AGENTS[agentName]
  if (!agent) throw new Error(`Unsupported agent: ${agentName}`)

  const isCopilot = agent.format === 'copilot'
  const manifest = loadHookManifest(repoRoot)
  const selected = hooksForAgent(manifest, agentName, hookNames)
  const configPath = agent.configPath(home)

  // Copilot config requires { version: 1, hooks: {} } as the root shape.
  const defaultConfig = isCopilot ? { version: 1, hooks: {} } : { hooks: {} }
  const config = readJson(configPath) ?? defaultConfig
  if (!config.hooks || typeof config.hooks !== 'object') config.hooks = {}
  if (isCopilot && config.version == null) config.version = 1

  const replaced = refreshManagedConfigEntries(config, agentName, selected)
  const existing = existingHookKeys(config, agentName)
  let added = 0

  for (const spec of selected) {
    const command = commandFor(agentName, spec.name)
    // Copilot uses camelCase event names; Claude Code / Codex use PascalCase.
    const eventKey = isCopilot ? copilotEventName(spec.event) : spec.event
    const key = `${eventKey}::${spec.matcher ?? ''}::${command}`
    if (existing.has(key)) continue

    const bucket = config.hooks[eventKey] ?? (config.hooks[eventKey] = [])
    bucket.push(buildEntry(spec, command, agentName))
    existing.add(key)
    added++
  }

  if (added > 0 || replaced > 0) writeJson(configPath, config)
  return { added, replaced, path: configPath, changed: added > 0 || replaced > 0 }
}

function isManagedHookTarget(targetPath, hookName) {
  if (path.basename(targetPath) !== hookName) return false

  const hookDir = path.dirname(targetPath)
  if (path.basename(hookDir) !== 'hooks') return false

  return fs.existsSync(path.join(hookDir, 'manifest.json'))
}

function ensureSymlink(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })

  let stat = null
  try { stat = fs.lstatSync(dst) } catch {}

  if (stat) {
    if (stat.isSymbolicLink()) {
      try {
        const cur = path.resolve(path.dirname(dst), fs.readlinkSync(dst))
        const srcN = path.normalize(src).replace(/[/\\]+$/, '')
        if (isManagedHookTarget(cur, path.basename(src))) {
          fs.unlinkSync(dst)
          fs.symlinkSync(src, dst, fs.statSync(src).isDirectory() ? 'dir' : 'file')
          return { status: 'replaced', note: cur === srcN ? 'refreshed go-beast hook' : 'replaced previous go-beast hook' }
        }
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
  isManagedHookTarget,
  loadHookManifest,
  refreshManagedConfigEntries,
  syncAgent,
  syncAgentHooks,
  syncAgents,
  wireAgentConfig,
}
