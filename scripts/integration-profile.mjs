#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseYaml } from './transversal-rules.mjs'
import {
  AGENTS as HOOK_AGENTS,
  commandFor,
  hooksForAgent,
  loadHookManifest,
  planHookConfig as planNativeHookConfig,
  syncAgentHooks,
  wireAgentConfig,
} from './hook-wire.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = os.homedir()
const PROFILE_VERSION = 1
const PROFILE_RELATIVE_PATH = path.join('.go-beast', 'config.json')

const SKILL_AGENTS = {
  'claude-code': { skillsDir: home => path.join(home, '.claude', 'skills') },
  cursor: { skillsDir: home => path.join(home, '.cursor', 'skills') },
  gemini: { skillsDir: home => path.join(home, '.gemini', 'skills') },
  cline: { skillsDir: home => path.join(home, '.cline', 'skills') },
  copilot: { skillsDir: home => path.join(home, '.copilot', 'skills') },
  codex: { skillsDir: home => path.join(home, '.codex', 'skills') },
  agents: { skillsDir: home => path.join(home, '.agents', 'skills') },
}

const PRESET_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

function profilePath(home) {
  return path.join(home, PROFILE_RELATIVE_PATH)
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tempPath, filePath)
}

function unique(values) {
  return [...new Set(values)]
}

function sortedNames(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function validatePresetName(name) {
  if (!PRESET_NAME_PATTERN.test(name)) {
    throw new Error(`invalid preset name: ${name}`)
  }
  return name
}

function isPresetRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && value.kind === 'go-beast-agent-profile'
}

function normalizePresetStore(profile, filePath) {
  const entries = Object.entries(profile.presets)
  if (entries.length === 0) return

  const isFlat = entries.every(([name, preset]) =>
    PRESET_NAME_PATTERN.test(name) && isPresetRecord(preset),
  )
  if (isFlat) {
    const nested = {}
    for (const [name, preset] of entries) {
      if (!SKILL_AGENTS[preset.agent]) {
        throw new Error(`profile preset ${name} has unsupported agent ${preset.agent} in ${filePath}`)
      }
      const agentPresets = nested[preset.agent] ?? (nested[preset.agent] = {})
      agentPresets[name] = preset
    }
    profile.presets = nested
    return
  }

  for (const [agentName, presets] of entries) {
    if (!SKILL_AGENTS[agentName]) {
      throw new Error(`profile preset namespace ${agentName} is unsupported in ${filePath}`)
    }
    if (!presets || typeof presets !== 'object' || Array.isArray(presets)) {
      throw new Error(`profile preset namespace ${agentName} must be an object in ${filePath}`)
    }
    for (const [name, preset] of Object.entries(presets)) {
      validatePresetName(name)
      if (!isPresetRecord(preset) || preset.agent !== agentName) {
        throw new Error(`profile preset ${agentName}/${name} is invalid in ${filePath}`)
      }
    }
  }
}

function skillNames(repoRoot) {
  const root = path.join(repoRoot, 'skills')
  if (!fs.existsSync(root)) return []
  return sortedNames(fs.readdirSync(root).filter(name =>
    name.startsWith('go-') && fs.existsSync(path.join(root, name, 'SKILL.md')),
  ))
}

function hookNames(repoRoot, agentName) {
  if (!HOOK_AGENTS[agentName]) return []
  return sortedNames(hooksForAgent(loadHookManifest(repoRoot), agentName).map(spec => spec.name))
}

function dependencyNames(value) {
  return sortedNames([...new Set(String(value).match(/\bgo-[a-z0-9-]+\b/g) ?? [])])
}

function dependencyClause(expression, explicitNames = null) {
  const names = explicitNames ?? dependencyNames(expression)
  return {
    expression: String(expression),
    mode: /\bor\b/i.test(String(expression)) ? 'any' : 'all',
    names,
  }
}

function skillRules(repoRoot) {
  const manifestPath = path.join(repoRoot, 'go-beast.manifest.yaml')
  const manifest = parseYaml(fs.readFileSync(manifestPath, 'utf8'))
  return Object.fromEntries(Object.entries(manifest.skills ?? {}).map(([name, entry]) => [name, {
    dependencies: (entry.depends_on ?? []).map(dependency => dependencyClause(dependency)).filter(clause => clause.names.length > 0),
    conflicts: sortedNames(dependencyNames((entry.conflicts_with ?? []).join(' '))),
  }]))
}

function dependencyRules(repoRoot, kind, agentName) {
  if (kind === 'skill') return skillRules(repoRoot)
  hookAgent(agentName)
  return Object.fromEntries(hooksForAgent(loadHookManifest(repoRoot), agentName).map(entry => [entry.name, {
    dependencies: entry.dependsOn.map(dependency => dependencyClause(dependency, [dependency])),
    conflicts: [],
  }]))
}

function skillAgent(agentName) {
  const agent = SKILL_AGENTS[agentName]
  if (!agent) throw new Error(`Unsupported skill agent: ${agentName}`)
  return agent
}

function hookAgent(agentName) {
  const agent = HOOK_AGENTS[agentName]
  if (!agent) throw new Error(`Agent ${agentName} does not expose a supported hook surface`)
  return agent
}

function allNames(repoRoot, agentName, kind) {
  if (kind === 'skill') {
    skillAgent(agentName)
    return skillNames(repoRoot)
  }
  if (kind === 'hook') {
    hookAgent(agentName)
    return hookNames(repoRoot, agentName)
  }
  throw new Error(`Unsupported integration kind: ${kind}`)
}

function sourcePath(repoRoot, kind, name) {
  return path.join(repoRoot, kind === 'skill' ? 'skills' : 'hooks', name)
}

function targetDirectory(home, agentName, kind) {
  if (kind === 'skill') return skillAgent(agentName).skillsDir(home)
  return hookAgent(agentName).hookDir(home)
}

function targetPath(home, agentName, kind, name) {
  return path.join(targetDirectory(home, agentName, kind), name)
}

function linkTarget(target) {
  try {
    const stat = fs.lstatSync(target)
    if (!stat.isSymbolicLink()) return null
    return path.resolve(path.dirname(target), fs.readlinkSync(target))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function samePath(left, right) {
  return path.normalize(left) === path.normalize(right)
}

function inspectTarget(target, source) {
  let stat
  try {
    stat = fs.lstatSync(target)
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'missing', installed: false, ownership: 'absent' }
    throw error
  }

  if (stat.isSymbolicLink() && samePath(linkTarget(target), source)) {
    return { state: 'managed', installed: true, ownership: 'managed' }
  }
  return { state: 'unmanaged', installed: true, ownership: 'unmanaged' }
}

function normalizeList(value, allowed, field) {
  if (!Array.isArray(value)) throw new Error(`profile field ${field} must be an array`)
  const result = unique(value)
  const unknown = result.filter(name => !allowed.includes(name))
  if (unknown.length) {
    throw new Error(`profile field ${field} contains unknown assets: ${unknown.join(', ')}`)
  }
  return sortedNames(result)
}

function normalizePolicy(value, allowed, field) {
  if (!value) return null
  if (typeof value !== 'object') throw new Error(`profile field ${field} must be an object`)
  if (value.mode === 'all') {
    return { mode: 'all', disabled: normalizeList(value.disabled ?? [], allowed, `${field}.disabled`) }
  }
  if (value.mode === 'selected') {
    return { mode: 'selected', enabled: normalizeList(value.enabled ?? [], allowed, `${field}.enabled`) }
  }
  throw new Error(`profile field ${field}.mode must be all or selected`)
}

function defaultProfile() {
  return { schemaVersion: PROFILE_VERSION, agents: {}, presets: {} }
}

function adoptPolicy({ home, repoRoot, agentName, kind, names }) {
  const managed = names.filter(name => inspectTarget(
    targetPath(home, agentName, kind, name),
    sourcePath(repoRoot, kind, name),
  ).state === 'managed')

  if (managed.length > 0 && managed.length < names.length) {
    return { mode: 'selected', enabled: managed }
  }
  return { mode: 'all', disabled: [] }
}

function loadProfile({ home = HOME } = {}) {
  const filePath = profilePath(home)
  const profile = readJson(filePath)
  if (!profile) return { profile: defaultProfile(), exists: false, path: filePath }
  if (profile.schemaVersion !== PROFILE_VERSION) {
    throw new Error(`unsupported profile schemaVersion in ${filePath}`)
  }
  if (!profile.agents || typeof profile.agents !== 'object' || Array.isArray(profile.agents)) {
    throw new Error(`profile agents must be an object in ${filePath}`)
  }
  for (const [agentName, agentProfile] of Object.entries(profile.agents)) {
    if (!agentProfile || typeof agentProfile !== 'object' || Array.isArray(agentProfile)) {
      throw new Error(`profile agent ${agentName} must be an object in ${filePath}`)
    }
  }
  if (profile.presets === undefined) profile.presets = {}
  if (!profile.presets || typeof profile.presets !== 'object' || Array.isArray(profile.presets)) {
    throw new Error(`profile presets must be an object in ${filePath}`)
  }
  normalizePresetStore(profile, filePath)
  return { profile, exists: true, path: filePath }
}

function ensureAgentProfile({ profile, home, repoRoot, agentName }) {
  skillAgent(agentName)
  const names = skillNames(repoRoot)
  const current = profile.agents[agentName] ?? {}
  const skills = normalizePolicy(
    current.skills,
    names,
    `agents.${agentName}.skills`,
  ) ?? adoptPolicy({ home, repoRoot, agentName, kind: 'skill', names })

  const agentProfile = { ...current, skills }

  if (HOOK_AGENTS[agentName]) {
    const hooks = hookNames(repoRoot, agentName)
    agentProfile.hooks = normalizePolicy(
      current.hooks,
      hooks,
      `agents.${agentName}.hooks`,
    ) ?? adoptPolicy({ home, repoRoot, agentName, kind: 'hook', names: hooks })
  }

  profile.agents[agentName] = agentProfile
  return agentProfile
}

function profileDocument({ profile, home, repoRoot, agentName }) {
  const agentProfile = ensureAgentProfile({ profile, home, repoRoot, agentName })
  const document = {
    schemaVersion: PROFILE_VERSION,
    kind: 'go-beast-agent-profile',
    agent: agentName,
    skills: cloneJson(agentProfile.skills),
  }
  if (HOOK_AGENTS[agentName]) document.hooks = cloneJson(agentProfile.hooks)
  return document
}

function normalizeProfileDocument({ document, repoRoot, agentName }) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('profile import must contain a JSON object')
  }
  if (document.schemaVersion !== PROFILE_VERSION) {
    throw new Error(`unsupported imported profile schemaVersion: ${document.schemaVersion}`)
  }
  if (document.kind !== 'go-beast-agent-profile') {
    throw new Error(`unsupported imported profile kind: ${document.kind ?? 'missing'}`)
  }
  if (document.agent && document.agent !== agentName) {
    throw new Error(`imported profile belongs to ${document.agent}, not ${agentName}`)
  }

  const skills = normalizePolicy(document.skills, skillNames(repoRoot), 'import.skills')
  if (!skills) throw new Error('import.skills is required')

  const normalized = { skills }
  if (HOOK_AGENTS[agentName]) {
    const hooks = normalizePolicy(document.hooks, hookNames(repoRoot, agentName), 'import.hooks')
    if (!hooks) throw new Error(`import.hooks is required for ${agentName}`)
    normalized.hooks = hooks
  } else if (document.hooks !== undefined) {
    throw new Error(`import.hooks is not supported for ${agentName}`)
  }
  return normalized
}

function reconcileImportedPolicy({
  home,
  repoRoot,
  agentName,
  policy,
  profile,
  filePath,
  dryRun,
}) {
  const agentProfile = ensureAgentProfile({ profile, home, repoRoot, agentName })
  agentProfile.skills = policy.skills
  const kinds = ['skill']
  if (policy.hooks) {
    agentProfile.hooks = policy.hooks
    kinds.push('hook')
  }
  const result = reconcileAgent({ home, repoRoot, agentName, profile, kinds, dryRun })
  if (!dryRun) writeJsonAtomic(filePath, profile)
  return { ...result, profilePath: filePath }
}

function exportProfile({
  home = HOME,
  repoRoot = REPO,
  agentName,
  outputPath,
}) {
  if (!outputPath) throw new Error('--output is required for export')
  const { profile, path: filePath } = loadProfile({ home })
  const document = profileDocument({ profile, home, repoRoot, agentName })
  const resolvedOutputPath = path.resolve(outputPath)
  writeJsonAtomic(resolvedOutputPath, document)
  return {
    command: 'export',
    agent: agentName,
    profilePath: filePath,
    outputPath: resolvedOutputPath,
    document,
  }
}

function importProfile({
  home = HOME,
  repoRoot = REPO,
  agentName,
  inputPath,
  dryRun = false,
}) {
  if (!inputPath) throw new Error('--input is required for import')
  const resolvedInputPath = path.resolve(inputPath)
  const document = readJson(resolvedInputPath)
  if (!document) throw new Error(`profile import file not found: ${resolvedInputPath}`)
  const policy = normalizeProfileDocument({ document, repoRoot, agentName })
  const { profile, path: filePath } = loadProfile({ home })
  const result = reconcileImportedPolicy({
    home,
    repoRoot,
    agentName,
    policy,
    profile,
    filePath,
    dryRun,
  })
  return {
    command: 'import',
    agent: agentName,
    inputPath: resolvedInputPath,
    document: cloneJson(document),
    ...result,
  }
}

function presetRecord({ profile, home, repoRoot, agentName }) {
  return profileDocument({ profile, home, repoRoot, agentName })
}

function listPresets({ home = HOME, agentName = null }) {
  const { profile, path: filePath } = loadProfile({ home })
  const presets = Object.entries(profile.presets)
    .filter(([presetAgent]) => !agentName || presetAgent === agentName)
    .flatMap(([presetAgent, agentPresets]) => Object.entries(agentPresets).map(([name, preset]) => ({
      name,
      agent: presetAgent,
      hasHooks: Boolean(preset.hooks),
    })))
    .sort((left, right) => `${left.name}:${left.agent}`.localeCompare(`${right.name}:${right.agent}`))
  return { command: 'preset list', agent: agentName, profilePath: filePath, presets }
}

function savePreset({
  home = HOME,
  repoRoot = REPO,
  agentName,
  presetName,
}) {
  validatePresetName(presetName)
  const { profile, path: filePath } = loadProfile({ home })
  ensureAgentProfile({ profile, home, repoRoot, agentName })
  const agentPresets = profile.presets[agentName] ?? (profile.presets[agentName] = {})
  agentPresets[presetName] = presetRecord({ profile, home, repoRoot, agentName })
  writeJsonAtomic(filePath, profile)
  return {
    command: 'preset save',
    agent: agentName,
    preset: presetName,
    profilePath: filePath,
  }
}

function applyPreset({
  home = HOME,
  repoRoot = REPO,
  agentName,
  presetName,
  dryRun = false,
}) {
  validatePresetName(presetName)
  const { profile, path: filePath } = loadProfile({ home })
  const preset = profile.presets[agentName]?.[presetName]
  if (!preset) throw new Error(`unknown preset: ${presetName}`)
  const policy = normalizeProfileDocument({ document: preset, repoRoot, agentName })
  const result = reconcileImportedPolicy({
    home,
    repoRoot,
    agentName,
    policy,
    profile,
    filePath,
    dryRun,
  })
  return {
    command: 'preset apply',
    agent: agentName,
    preset: presetName,
    ...result,
  }
}

function deletePreset({ home = HOME, agentName = null, presetName }) {
  validatePresetName(presetName)
  const { profile, path: filePath } = loadProfile({ home })
  const candidates = agentName
    ? (profile.presets[agentName]?.[presetName]
      ? [[agentName, profile.presets[agentName][presetName]]]
      : [])
    : Object.entries(profile.presets)
      .filter(([, presets]) => presets[presetName])
      .map(([presetAgent, presets]) => [presetAgent, presets[presetName]])
  if (candidates.length === 0) throw new Error(`unknown preset: ${presetName}`)
  if (candidates.length > 1) {
    throw new Error(`--agent is required to delete shared preset name: ${presetName}`)
  }
  const [presetAgent, preset] = candidates[0]
  delete profile.presets[presetAgent][presetName]
  if (Object.keys(profile.presets[presetAgent]).length === 0) delete profile.presets[presetAgent]
  writeJsonAtomic(filePath, profile)
  return {
    command: 'preset delete',
    agent: presetAgent,
    preset: presetName,
    profilePath: filePath,
  }
}

function desiredNames(policy, names) {
  if (policy.mode === 'selected') return new Set(policy.enabled)
  const disabled = new Set(policy.disabled)
  return new Set(names.filter(name => !disabled.has(name)))
}

function clauseMissing(clause, available) {
  if (clause.mode === 'any') {
    return clause.names.some(name => available.has(name)) ? [] : clause.names
  }
  return clause.names.filter(name => !available.has(name))
}

function dependencyDiagnostics({ repoRoot, kind, agentName, name, desired, available = desired }) {
  const rules = dependencyRules(repoRoot, kind, agentName)
  const rule = rules[name] ?? { dependencies: [], conflicts: [] }
  const missing = rule.dependencies.flatMap(clause => clauseMissing(clause, available))
  const conflicts = rule.conflicts.filter(conflict => desired.has(conflict))
  return {
    satisfied: missing.length === 0 && conflicts.length === 0,
    missing: sortedNames([...new Set(missing)]),
    conflicts: sortedNames([...new Set(conflicts)]),
    clauses: rule.dependencies,
  }
}

function effectiveNames({ home, repoRoot, agentName, kind, names, desired }) {
  const configured = kind === 'hook'
    ? configCommands(readJson(hookAgent(agentName).configPath(home)), agentName)
    : null
  return new Set(names.filter(name => {
    if (!desired.has(name)) return false
    const target = inspectTarget(
      targetPath(home, agentName, kind, name),
      sourcePath(repoRoot, kind, name),
    )
    if (target.state !== 'managed') return false
    return kind !== 'hook' || configured.has(commandFor(agentName, name))
  }))
}

function impactedDependents({ home, repoRoot, kind, agentName, names, desired, available, disabledName }) {
  const after = new Set(desired)
  after.delete(disabledName)
  const afterAvailable = effectiveNames({ home, repoRoot, agentName, kind, names, desired: after })
  const rules = dependencyRules(repoRoot, kind, agentName)
  const impacts = []

  for (const candidate of names) {
    if (!desired.has(candidate) || candidate === disabledName) continue
    const before = dependencyDiagnostics({
      repoRoot,
      kind,
      agentName,
      name: candidate,
      desired,
      available,
    })
    const afterDiagnostics = dependencyDiagnostics({
      repoRoot,
      kind,
      agentName,
      name: candidate,
      desired: after,
      available: afterAvailable,
    })
    const newMissing = afterDiagnostics.missing.filter(value => !before.missing.includes(value))
    const newConflicts = afterDiagnostics.conflicts.filter(value => !before.conflicts.includes(value))
    if (newMissing.length || newConflicts.length) {
      impacts.push({
        name: candidate,
        missing: newMissing,
        conflicts: newConflicts,
        expression: (rules[candidate]?.dependencies ?? []).map(clause => clause.expression),
      })
    }
  }
  return impacts
}

function planLinks({ home, repoRoot, agentName, kind, names, desired }) {
  const operations = []
  for (const name of names) {
    const source = sourcePath(repoRoot, kind, name)
    const target = targetPath(home, agentName, kind, name)
    const current = inspectTarget(target, source)
    const enabled = desired.has(name)

    if (enabled && current.state === 'missing') {
      operations.push({ name, action: 'create', source, target, status: 'pending' })
    } else if (!enabled && current.state === 'managed') {
      operations.push({ name, action: 'remove', source, target, status: 'pending' })
    } else if (current.state === 'unmanaged') {
      operations.push({ name, action: 'preserve', source, target, status: 'unmanaged' })
    } else {
      operations.push({ name, action: 'none', source, target, status: enabled ? 'enabled' : 'disabled' })
    }
  }
  return operations
}

function executeLinkPlan(operations, dryRun) {
  if (dryRun) {
    return operations.map(operation => ({
      ...operation,
      status: operation.status === 'pending' ? operation.action : operation.status,
    }))
  }

  return operations.map(operation => {
    if (operation.status !== 'pending') return operation
    try {
      if (operation.action === 'create') {
        fs.mkdirSync(path.dirname(operation.target), { recursive: true })
        const sourceStat = fs.statSync(operation.source)
        fs.symlinkSync(
          operation.source,
          operation.target,
          sourceStat.isDirectory() ? 'dir' : 'file',
        )
      } else if (operation.action === 'remove') {
        fs.unlinkSync(operation.target)
      }
      return { ...operation, status: operation.action === 'create' ? 'enabled' : 'disabled' }
    } catch (error) {
      return { ...operation, status: 'error', note: error.message }
    }
  })
}

function configCommands(config, agentName) {
  const agent = hookAgent(agentName)
  const commands = new Set()
  const buckets = config?.hooks && typeof config.hooks === 'object' ? config.hooks : {}
  for (const entries of Object.values(buckets)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (agent.format === 'copilot') {
        if (entry?.type === 'command' && entry.bash) commands.add(entry.bash)
      } else {
        for (const hook of Array.isArray(entry?.hooks) ? entry.hooks : []) {
          if (hook?.type === 'command' && hook.command) commands.add(hook.command)
        }
      }
    }
  }
  return commands
}

function planHookConfig({ home, repoRoot, agentName, selectedNames }) {
  const agent = hookAgent(agentName)
  const config = readJson(agent.configPath(home))
  const manifest = loadHookManifest(repoRoot)
  const managed = hooksForAgent(manifest, agentName)
  const selected = hooksForAgent(manifest, agentName, selectedNames)
  return {
    path: agent.configPath(home),
    ...planNativeHookConfig({ config, agentName, selected, managed }),
  }
}

function reconcileAgent({
  home = HOME,
  repoRoot = REPO,
  agentName,
  profile,
  kinds = ['skill', 'hook'],
  dryRun = false,
}) {
  const agentProfile = profile.agents[agentName]
  const result = { agent: agentName, dryRun, skills: [], hooks: [], config: null }
  const skillNamesForAgent = skillNames(repoRoot)

  if (kinds.includes('skill')) {
    const desired = desiredNames(agentProfile.skills, skillNamesForAgent)
    const plan = planLinks({
      home,
      repoRoot,
      agentName,
      kind: 'skill',
      names: skillNamesForAgent,
      desired,
    })
    result.skills = executeLinkPlan(plan, dryRun)
  }

  if (kinds.includes('hook') && HOOK_AGENTS[agentName]) {
    const hookNamesForAgent = hookNames(repoRoot, agentName)
    const desired = desiredNames(agentProfile.hooks, hookNamesForAgent)
    const selectedNames = sortedNames(desired)

    if (dryRun) {
      const plan = planLinks({
        home,
        repoRoot,
        agentName,
        kind: 'hook',
        names: hookNamesForAgent,
        desired,
      })
      result.hooks = executeLinkPlan(plan, true)
      result.config = planHookConfig({ home, repoRoot, agentName, selectedNames })
    } else {
      const synced = syncAgentHooks({
        repoRoot,
        home,
        agentName,
        hookNames: selectedNames,
      })
      result.hooks = synced.results
      result.config = wireAgentConfig({
        repoRoot,
        home,
        agentName,
        hookNames: selectedNames,
      })
    }
  }

  result.changed = [
    ...result.skills,
    ...result.hooks,
  ].some(item => ['create', 'remove', 'new', 'replaced'].includes(item.action ?? item.status))
    || Boolean(result.config?.changed || result.config?.add?.length || result.config?.remove?.length)
  return result
}

function setPolicySelection(policy, names, mode) {
  if (mode === 'all') return { mode: 'all', disabled: [] }
  return { mode: 'selected', enabled: sortedNames(names) }
}

function configureAgent({
  home = HOME,
  repoRoot = REPO,
  agentName,
  skillNames: selectedSkillNames,
  skillsMode = 'selected',
  hookNames: selectedHookNames,
  hooksMode = 'selected',
  dryRun = false,
}) {
  const { profile, path: filePath } = loadProfile({ home })
  const agentProfile = ensureAgentProfile({ profile, home, repoRoot, agentName })
  const availableSkills = skillNames(repoRoot)
  agentProfile.skills = setPolicySelection(
    agentProfile.skills,
    selectedSkillNames ?? availableSkills,
    skillsMode,
  )

  const kinds = ['skill']
  if (HOOK_AGENTS[agentName] && selectedHookNames !== undefined) {
    const availableHooks = hookNames(repoRoot, agentName)
    agentProfile.hooks = setPolicySelection(
      agentProfile.hooks,
      selectedHookNames ?? availableHooks,
      hooksMode,
    )
    kinds.push('hook')
  }

  const result = reconcileAgent({ home, repoRoot, agentName, profile, kinds, dryRun })
  if (!dryRun) writeJsonAtomic(filePath, profile)
  return { ...result, profilePath: filePath }
}

function mutationWarnings({ home, repoRoot, agentName, kind, name, policy, names, enabled }) {
  const desired = desiredNames(policy, names)
  const available = effectiveNames({ home, repoRoot, agentName, kind, names, desired })
  if (enabled) {
    const after = new Set(desired)
    after.add(name)
    const afterAvailable = effectiveNames({
      home,
      repoRoot,
      agentName,
      kind,
      names,
      desired: after,
    })
    const diagnostics = dependencyDiagnostics({
      repoRoot,
      kind,
      agentName,
      name,
      desired: after,
      available: afterAvailable,
    })
    const warnings = []
    if (diagnostics.missing.length) {
      warnings.push(`Enabling ${name} has missing dependencies: ${diagnostics.missing.join(', ')}`)
    }
    if (diagnostics.conflicts.length) {
      warnings.push(`Enabling ${name} conflicts with enabled assets: ${diagnostics.conflicts.join(', ')}`)
    }
    return warnings
  }

  return impactedDependents({
    home,
    repoRoot,
    kind,
    agentName,
    names,
    desired,
    available,
    disabledName: name,
  }).map(impact => {
    const detail = impact.missing.length
      ? `missing ${impact.missing.join(', ')}`
      : `conflicts with ${impact.conflicts.join(', ')}`
    return `Disabling ${name} leaves dependent ${kind} ${impact.name} incomplete (${detail})`
  })
}

function mutate({
  command,
  home = HOME,
  repoRoot = REPO,
  agentName,
  kind,
  name,
  dryRun = false,
  cascade = false,
}) {
  if (!['enable', 'disable'].includes(command)) throw new Error(`Unsupported integration command: ${command}`)
  if (!['skill', 'hook'].includes(kind)) throw new Error('--kind must be skill or hook')
  const { profile, path: filePath } = loadProfile({ home })
  const agentProfile = ensureAgentProfile({ profile, home, repoRoot, agentName })
  const names = allNames(repoRoot, agentName, kind)
  if (!names.includes(name)) throw new Error(`Unknown ${kind} for ${agentName}: ${name}`)

  const field = kind === 'skill' ? 'skills' : 'hooks'
  let policy = agentProfile[field]
  const warnings = mutationWarnings({
    home,
    repoRoot,
    agentName,
    kind,
    name,
    policy,
    names,
    enabled: command === 'enable',
  })

  const update = (assetName, shouldEnable) => {
    if (policy.mode === 'all') {
      const disabled = new Set(policy.disabled)
      if (shouldEnable) disabled.delete(assetName)
      else disabled.add(assetName)
      policy = { mode: 'all', disabled: sortedNames([...disabled]) }
    } else {
      const enabled = new Set(policy.enabled)
      if (shouldEnable) enabled.add(assetName)
      else enabled.delete(assetName)
      policy = { mode: 'selected', enabled: sortedNames([...enabled]) }
    }
  }

  const shouldEnable = command === 'enable'
  const cascadeDisabled = []
  if (shouldEnable) {
    update(name, true)
  } else {
    const pending = [name]
    const visited = new Set()
    while (pending.length) {
      const current = pending.shift()
      if (visited.has(current)) continue
      visited.add(current)
      const before = desiredNames(policy, names)
      update(current, false)
      const after = desiredNames(policy, names)
      if (!cascade) continue
      const beforeAvailable = effectiveNames({
        home,
        repoRoot,
        agentName,
        kind,
        names,
        desired: before,
      })
      const afterAvailable = effectiveNames({
        home,
        repoRoot,
        agentName,
        kind,
        names,
        desired: after,
      })

      for (const candidate of names) {
        if (!before.has(candidate) || !after.has(candidate)) continue
        const beforeDiagnostics = dependencyDiagnostics({
          repoRoot,
          kind,
          agentName,
          name: candidate,
          desired: before,
          available: beforeAvailable,
        })
        const afterDiagnostics = dependencyDiagnostics({
          repoRoot,
          kind,
          agentName,
          name: candidate,
          desired: after,
          available: afterAvailable,
        })
        if (beforeDiagnostics.satisfied && !afterDiagnostics.satisfied) {
          pending.push(candidate)
          if (candidate !== name) cascadeDisabled.push(candidate)
        }
      }
    }
  }

  agentProfile[field] = policy
  const result = reconcileAgent({
    home,
    repoRoot,
    agentName,
    profile,
    kinds: [kind],
    dryRun,
  })
  if (!dryRun) writeJsonAtomic(filePath, profile)

  return {
    command,
    agent: agentName,
    kind,
    name,
    cascade,
    cascadeDisabled: sortedNames([...new Set(cascadeDisabled)]),
    warnings,
    profilePath: filePath,
    ...result,
  }
}

function sync({
  home = HOME,
  repoRoot = REPO,
  agentName,
  dryRun = false,
}) {
  const { profile, path: filePath } = loadProfile({ home })
  ensureAgentProfile({ profile, home, repoRoot, agentName })
  const result = reconcileAgent({
    home,
    repoRoot,
    agentName,
    profile,
    dryRun,
  })
  if (!dryRun) writeJsonAtomic(filePath, profile)
  return { command: 'sync', profilePath: filePath, ...result }
}

function statusAsset({ home, repoRoot, agentName, kind, name, desired, desiredNames, availableNames }) {
  const source = sourcePath(repoRoot, kind, name)
  const target = targetPath(home, agentName, kind, name)
  const inspected = inspectTarget(target, source)
  const dependencies = desired
    ? dependencyDiagnostics({
        repoRoot,
        kind,
        agentName,
        name,
        desired: desiredNames,
        available: availableNames,
      })
    : { satisfied: true, missing: [], conflicts: [], clauses: [] }
  const base = {
    name,
    desired: desired ? 'enabled' : 'disabled',
    installed: inspected.installed,
    ownership: inspected.ownership,
    blocked: false,
    classification: desired ? 'missing' : 'disabled',
    dependencies,
  }

  if (inspected.state === 'unmanaged') {
    return {
      ...base,
      state: 'unmanaged',
      classification: 'conflict',
      blocked: desired,
    }
  }

  if (kind === 'hook') {
    const command = commandFor(agentName, name)
    const wired = configCommands(
      readJson(hookAgent(agentName).configPath(home)),
      agentName,
    ).has(command)
    base.configured = wired

    if (desired && inspected.state === 'managed' && wired) {
      base.state = 'enabled'
      base.classification = dependencies.satisfied ? 'enabled' : 'dependency-missing'
      base.blocked = !dependencies.satisfied
      return base
    }
    if (desired && inspected.state === 'managed') {
      base.state = 'missing'
      base.classification = 'config-missing'
      base.blocked = true
      return base
    }
    if (!desired && (inspected.state === 'managed' || wired)) {
      return { ...base, state: 'drift', classification: 'drift' }
    }
    return { ...base, state: desired ? 'missing' : 'disabled' }
  }

  if (desired && inspected.state === 'managed') {
    base.state = 'enabled'
    base.classification = dependencies.satisfied ? 'enabled' : 'dependency-missing'
    base.blocked = !dependencies.satisfied
    return base
  }
  if (!desired && inspected.state === 'managed') {
    return { ...base, state: 'drift', classification: 'drift' }
  }
  return { ...base, state: desired ? 'missing' : 'disabled' }
}

function statusAgent({ home = HOME, repoRoot = REPO, agentName }) {
  const { profile, path: filePath } = loadProfile({ home })
  const agentProfile = ensureAgentProfile({ profile, home, repoRoot, agentName })
  const skills = skillNames(repoRoot)
  const desiredSkills = desiredNames(agentProfile.skills, skills)
  const availableSkills = effectiveNames({
    home,
    repoRoot,
    agentName,
    kind: 'skill',
    names: skills,
    desired: desiredSkills,
  })
  const result = {
    agent: agentName,
    profilePath: filePath,
    skills: skills.map(name => statusAsset({
      home,
      repoRoot,
      agentName,
      kind: 'skill',
      name,
      desired: desiredSkills.has(name),
      desiredNames: desiredSkills,
      availableNames: availableSkills,
    })),
    hooks: [],
  }

  if (HOOK_AGENTS[agentName]) {
    const hooks = hookNames(repoRoot, agentName)
    const desiredHooks = desiredNames(agentProfile.hooks, hooks)
    const availableHooks = effectiveNames({
      home,
      repoRoot,
      agentName,
      kind: 'hook',
      names: hooks,
      desired: desiredHooks,
    })
    result.hooks = hooks.map(name => statusAsset({
      home,
      repoRoot,
      agentName,
      kind: 'hook',
      name,
      desired: desiredHooks.has(name),
      desiredNames: desiredHooks,
      availableNames: availableHooks,
    }))
  }
  return result
}

function parseArgs(argv) {
  const args = [...argv]
  const command = args.shift() ?? 'status'
  const subcommand = command === 'preset' ? (args.shift() ?? 'list') : null
  const presetName = command === 'preset' && !['list'].includes(subcommand)
    ? args.shift() ?? null
    : null
  const options = {
    command,
    subcommand,
    presetName,
    agent: null,
    kind: null,
    name: null,
    inputPath: null,
    outputPath: null,
    format: 'text',
    home: HOME,
    repoRoot: REPO,
    dryRun: false,
    cascade: false,
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--agent') options.agent = args[++index]
    else if (arg === '--kind') options.kind = args[++index]
    else if (arg === '--name') options.name = args[++index]
    else if (arg === '--input') options.inputPath = args[++index]
    else if (arg === '--output') options.outputPath = args[++index]
    else if (arg === '--format') options.format = args[++index]
    else if (arg === '--home') options.home = args[++index]
    else if (arg === '--repo') options.repoRoot = args[++index]
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--cascade') options.cascade = true
    else if (arg === '--help' || arg === '-h') options.command = 'help'
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!['status', 'enable', 'disable', 'sync', 'export', 'import', 'preset', 'help'].includes(options.command)) {
    throw new Error(`unsupported integration command: ${options.command}`)
  }
  if (!['text', 'json'].includes(options.format)) {
    throw new Error('--format must be text or json')
  }
  if (options.command === 'preset' && !['list', 'save', 'apply', 'delete'].includes(options.subcommand)) {
    throw new Error(`unsupported preset command: ${options.subcommand}`)
  }
  options.home = path.resolve(options.home)
  options.repoRoot = path.resolve(options.repoRoot)
  return options
}

function textResult(result) {
  const lines = [`${result.command ?? 'status'}: ${result.agent ?? 'all'}`]
  if (result.profilePath) lines.push(`profile: ${result.profilePath}`)
  for (const kind of ['skills', 'hooks']) {
    for (const item of result[kind] ?? []) {
      const state = item.status ?? item.state ?? item.action
      if (state && state !== 'none') lines.push(`${kind.slice(0, -1)} ${item.name}: ${state}`)
    }
  }
  for (const warning of result.warnings ?? []) lines.push(`warning: ${warning}`)
  if (result.config?.path) lines.push(`hooks config: ${result.config.path}`)
  if (result.inputPath) lines.push(`input: ${result.inputPath}`)
  if (result.outputPath) lines.push(`output: ${result.outputPath}`)
  if (result.preview) {
    lines.push(
      `preview: ${result.preview.skillChanges} skill changes, `
      + `${result.preview.hookChanges} hook changes, `
      + `${result.preview.configChanges} config changes`,
    )
  }
  for (const preset of result.presets ?? []) {
    lines.push(`preset ${preset.name}: ${preset.agent}${preset.hasHooks ? ' (hooks)' : ''}`)
  }
  for (const name of result.cascadeDisabled ?? []) lines.push(`cascade disabled: ${name}`)
  return lines.join('\n')
}

function printResult(result, format) {
  const visible = result.command === 'import' && result.dryRun
    ? (() => {
        const { skills, hooks, config, ...summary } = result
        return {
          ...summary,
          preview: {
            skillChanges: (skills ?? []).filter(item => item.action !== 'none').length,
            hookChanges: (hooks ?? []).filter(item => item.action !== 'none').length,
            configChanges: (config?.add?.length ?? 0) + (config?.remove?.length ?? 0),
          },
        }
      })()
    : result.dryRun
    ? {
        ...result,
        skills: (result.skills ?? []).filter(item => item.action !== 'none'),
        hooks: (result.hooks ?? []).filter(item => item.action !== 'none'),
      }
    : result
  process.stdout.write(format === 'json'
    ? `${JSON.stringify(visible, null, 2)}\n`
    : `${textResult(visible)}\n`)
}

function usage() {
  return [
    'Usage: go-beast integration <status|enable|disable|sync|export|import|preset> [options]',
    '       go-beast integration preset <list|save|apply|delete> [name] [options]',
    '',
    'Options:',
    '  --agent <name>                 Agent profile to inspect or mutate',
    '  --kind <skill|hook>            Asset kind for enable/disable',
    '  --name <asset>                 Asset name for enable/disable',
    '  --input <path>                 Profile JSON to import',
    '  --output <path>                Destination JSON for export',
    '  --format <text|json>            Output format',
    '  --dry-run                      Show reconciliation without changing files',
    '  --cascade                      Disable dependent hooks too',
    '  --home <path>                  Override the user home directory',
    '  --repo <path>                  Override the go-beast repository',
  ].join('\n')
}

function requireMutationOptions(options) {
  if (!options.agent) throw new Error('--agent is required for this command')
  if (!options.kind) throw new Error('--kind is required for this command')
  if (!options.name) throw new Error('--name is required for this command')
}

function run(options) {
  if (options.command === 'help') {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (options.command === 'status') {
    if (options.agent) {
      printResult(statusAgent({ ...options, agentName: options.agent }), options.format)
    } else {
      const agents = Object.keys(SKILL_AGENTS).map(agent => statusAgent({ ...options, agentName: agent }))
      printResult({ command: 'status', profilePath: profilePath(options.home), agents }, options.format)
    }
    return
  }
  if (options.command === 'sync') {
    if (!options.agent) throw new Error('--agent is required for sync')
    printResult(sync({ ...options, agentName: options.agent }), options.format)
    return
  }
  if (options.command === 'export') {
    if (!options.agent) throw new Error('--agent is required for export')
    printResult(exportProfile({ ...options, agentName: options.agent }), options.format)
    return
  }
  if (options.command === 'import') {
    if (!options.agent) throw new Error('--agent is required for import')
    printResult(importProfile({ ...options, agentName: options.agent }), options.format)
    return
  }
  if (options.command === 'preset') {
    if (options.subcommand === 'list') {
      printResult(listPresets({ ...options, agentName: options.agent }), options.format)
      return
    }
    if (!options.presetName) throw new Error('preset name is required')
    if (options.subcommand === 'delete') {
      printResult(deletePreset({ ...options, agentName: options.agent }), options.format)
      return
    }
    if (!options.agent) throw new Error(`--agent is required for preset ${options.subcommand}`)
    if (options.subcommand === 'save') {
      printResult(savePreset({ ...options, agentName: options.agent }), options.format)
      return
    }
    printResult(applyPreset({ ...options, agentName: options.agent }), options.format)
    return
  }
  requireMutationOptions(options)
  printResult(mutate({ ...options, agentName: options.agent }), options.format)
}

function main(argv = process.argv.slice(2)) {
  try {
    run(parseArgs(argv))
  } catch (error) {
    console.error(`go-beast integration: ${error.message}`)
    process.exitCode = 1
  }
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}

export {
  PROFILE_VERSION,
  SKILL_AGENTS,
  configureAgent,
  deletePreset,
  exportProfile,
  hookNames,
  importProfile,
  loadProfile,
  listPresets,
  main,
  mutate,
  applyPreset,
  profilePath,
  reconcileAgent,
  savePreset,
  skillNames,
  statusAgent,
  sync,
}
