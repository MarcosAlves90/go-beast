#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegistry } from './capabilities.mjs'
import { AGENTS as HOOK_AGENTS } from './hook-wire.mjs'
import {
  SKILL_AGENTS,
  hookNames,
  profilePath,
  reconcileAgent,
  skillNames,
} from './integration-profile.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = os.homedir()
const V2_PROFILE_VERSION = 2
const POLICY_KINDS = ['skills', 'hooks']
const SURFACE_NAMES = [...new Set([...Object.keys(SKILL_AGENTS), ...Object.keys(HOOK_AGENTS)])].sort()

function sorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function sourceDefinitions({ home = HOME, projectRoot = process.cwd(), sessionId = null, sessionPath = null } = {}) {
  const sources = [{
    scope: 'global',
    precedence: 1,
    path: profilePath(home),
  }, {
    scope: 'project',
    precedence: 2,
    path: path.join(projectRoot, '.go-beast', 'profile.json'),
  }]
  if (sessionId || sessionPath) {
    sources.push({
      scope: 'session',
      precedence: 3,
      path: sessionPath
        ? path.resolve(sessionPath)
        : path.join(projectRoot, '.go-beast', 'sessions', `${sessionId}.json`),
    })
  }
  return sources
}

function normalizePolicy(value, allowed, label) {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  if (value.mode === 'all') {
    if (!Array.isArray(value.disabled)) throw new Error(`${label}.disabled must be an array`)
    const disabled = sorted(value.disabled)
    const unknown = disabled.filter(name => !allowed.includes(name))
    if (unknown.length) throw new Error(`${label}.disabled contains unknown assets: ${unknown.join(', ')}`)
    return { mode: 'all', disabled }
  }
  if (value.mode === 'selected') {
    if (!Array.isArray(value.enabled)) throw new Error(`${label}.enabled must be an array`)
    const enabled = sorted(value.enabled)
    const unknown = enabled.filter(name => !allowed.includes(name))
    if (unknown.length) throw new Error(`${label}.enabled contains unknown assets: ${unknown.join(', ')}`)
    return { mode: 'selected', enabled }
  }
  throw new Error(`${label}.mode must be all or selected`)
}

function policyNames(policy, names) {
  if (!policy) return null
  if (policy.mode === 'selected') return new Set(policy.enabled)
  const disabled = new Set(policy.disabled)
  return new Set(names.filter(name => !disabled.has(name)))
}

function loadSource(source, { agentName, names }) {
  if (!fs.existsSync(source.path)) return { ...source, status: 'missing', policies: {} }
  let document
  try {
    document = readJson(source.path)
  } catch (error) {
    throw new Error(`profile source ${source.scope} is not readable JSON: ${error.message}`)
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`profile source ${source.scope} must be a JSON object`)
  }
  if (![1, V2_PROFILE_VERSION].includes(document.schemaVersion)) {
    throw new Error(`unsupported profile schemaVersion in ${source.path}: ${document.schemaVersion ?? 'missing'}`)
  }
  if (document.schemaVersion === V2_PROFILE_VERSION && document.kind !== 'go-beast-profile') {
    throw new Error(`unsupported profile kind in ${source.path}: ${document.kind ?? 'missing'}`)
  }
  if (!document.agents || typeof document.agents !== 'object' || Array.isArray(document.agents)) {
    throw new Error(`profile agents must be an object in ${source.path}`)
  }
  const agent = document.agents[agentName] ?? {}
  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
    throw new Error(`profile agent ${agentName} must be an object in ${source.path}`)
  }
  const policies = {
    skills: normalizePolicy(agent.skills, names.skills, `${source.scope}.${agentName}.skills`),
  }
  if (HOOK_AGENTS[agentName]) {
    policies.hooks = normalizePolicy(agent.hooks, names.hooks, `${source.scope}.${agentName}.hooks`)
  } else if (agent.hooks !== undefined) {
    throw new Error(`profile source ${source.scope} declares hooks for unsupported agent ${agentName}`)
  }
  return {
    ...source,
    status: 'loaded',
    schema_version: document.schemaVersion,
    policies,
  }
}

function inspectTarget(target, source) {
  try {
    const stat = fs.lstatSync(target)
    if (stat.isSymbolicLink()) {
      const resolved = path.resolve(path.dirname(target), fs.readlinkSync(target))
      if (path.normalize(resolved) === path.normalize(source)) return { state: 'managed', ownership: 'managed' }
    }
    return { state: 'unmanaged', ownership: 'unmanaged' }
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'missing', ownership: 'absent' }
    throw error
  }
}

function assetPaths({ home, repoRoot, agentName, kind, name }) {
  const source = path.join(repoRoot, kind === 'skill' ? 'skills' : 'hooks', name)
  const targetRoot = kind === 'skill'
    ? SKILL_AGENTS[agentName].skillsDir(home)
    : HOOK_AGENTS[agentName].hookDir(home)
  return { source, target: path.join(targetRoot, name) }
}

function ownership({ home, repoRoot, agentName, kind, names }) {
  return names.map(name => {
    const paths = assetPaths({ home, repoRoot, agentName, kind, name })
    return { name, ...inspectTarget(paths.target, paths.source), source: paths.source, target: paths.target }
  })
}

function capabilityDiagnostics({ repoRoot, agentName, effective }) {
  const registry = buildRegistry(repoRoot)
  const byId = new Map(registry.capabilities.map(capability => [capability.id, capability]))
  const enabledByKind = {
    skill: new Set(effective.skills),
    hook: new Set(effective.hooks),
  }
  const capabilityGaps = []
  const unsupported = []
  const conflicts = []

  for (const kind of ['skill', 'hook']) {
    for (const id of enabledByKind[kind]) {
      const capability = byId.get(id)
      if (!capability) {
        capabilityGaps.push({ asset: id, kind, dependency: id, reason: 'missing-registry-entry' })
        continue
      }
      if (capability.supports?.[agentName] !== true) {
        unsupported.push({ asset: id, kind, reason: 'agent-not-supported' })
      }
      for (const dependency of capability.depends_on) {
        const dependencyCapability = byId.get(dependency)
        if (!dependencyCapability) {
          capabilityGaps.push({ asset: id, kind, dependency, reason: 'missing-registry-entry' })
        } else if (['skill', 'hook'].includes(dependencyCapability.kind)
          && !enabledByKind[dependencyCapability.kind].has(dependency)) {
          capabilityGaps.push({ asset: id, kind, dependency, reason: 'disabled-or-not-selected' })
        } else if (!['skill', 'hook'].includes(dependencyCapability.kind)) {
          capabilityGaps.push({ asset: id, kind, dependency, reason: 'not-profile-managed' })
        }
      }
      for (const conflict of capability.conflicts_with) {
        const conflictCapability = byId.get(conflict)
        if (conflictCapability && enabledByKind[conflictCapability.kind]?.has(conflict)) {
          conflicts.push({ asset: id, kind, conflict, reason: 'mutually-conflicting-capabilities' })
        }
      }
    }
  }

  return {
    capability_gaps: [...new Map(capabilityGaps.map(item => [`${item.kind}:${item.asset}:${item.dependency}`, item])).values()]
      .sort((left, right) => `${left.kind}:${left.asset}:${left.dependency}`.localeCompare(`${right.kind}:${right.asset}:${right.dependency}`)),
    unsupported: [...new Map(unsupported.map(item => [`${item.kind}:${item.asset}`, item])).values()]
      .sort((left, right) => `${left.kind}:${left.asset}`.localeCompare(`${right.kind}:${right.asset}`)),
    conflicts: [...new Map(conflicts.map(item => [`${item.kind}:${item.asset}:${item.conflict}`, item])).values()]
      .sort((left, right) => `${left.kind}:${left.asset}:${left.conflict}`.localeCompare(`${right.kind}:${right.asset}:${right.conflict}`)),
  }
}

function dryRunMutations({ home, repoRoot, agentName, effective }) {
  const syntheticProfile = {
    schemaVersion: 1,
    agents: {
      [agentName]: {
        skills: { mode: 'selected', enabled: effective.skills },
        ...(HOOK_AGENTS[agentName]
          ? { hooks: { mode: 'selected', enabled: effective.hooks } }
          : {}),
      },
    },
    presets: {},
  }
  const result = reconcileAgent({
    home,
    repoRoot,
    agentName,
    profile: syntheticProfile,
    kinds: ['skill', ...(HOOK_AGENTS[agentName] ? ['hook'] : [])],
    dryRun: true,
  })
  return {
    dry_run: true,
    skills: result.skills.filter(item => item.action !== 'none'),
    hooks: result.hooks.filter(item => item.action !== 'none'),
    config: result.config
      ? {
          path: result.config.path,
          add: result.config.add ?? [],
          remove: result.config.remove ?? [],
        }
      : null,
  }
}

function resolveEffectiveProfile({
  home = HOME,
  repoRoot = REPO,
  projectRoot = process.cwd(),
  agentName,
  sessionId = null,
  sessionPath = null,
} = {}) {
  if (!SKILL_AGENTS[agentName]) throw new Error(`unsupported profile agent: ${agentName}`)
  const resolvedProjectRoot = path.resolve(projectRoot)
  const names = {
    skills: skillNames(repoRoot),
    hooks: HOOK_AGENTS[agentName] ? hookNames(repoRoot, agentName) : [],
  }
  const errors = []
  const sources = []
  for (const definition of sourceDefinitions({ home, projectRoot: resolvedProjectRoot, sessionId, sessionPath })) {
    try {
      sources.push(loadSource(definition, { agentName, names }))
    } catch (error) {
      sources.push({ ...definition, status: 'error', error: error.message })
      errors.push(error.message)
    }
  }

  const effective = {
    skills: sorted(names.skills),
    hooks: sorted(names.hooks),
  }
  const decisions = []
  for (const kind of POLICY_KINDS) {
    const field = kind
    const kindName = kind.slice(0, -1)
    for (const name of names[field]) {
      decisions.push({ asset: name, kind: kindName, value: 'enabled', source: 'default', precedence: 0 })
    }
  }

  for (const source of sources) {
    if (source.status !== 'loaded') continue
    for (const field of POLICY_KINDS) {
      const policy = source.policies[field]
      if (!policy) continue
      const desired = policyNames(policy, names[field])
      effective[field] = sorted([...desired])
      const kind = field.slice(0, -1)
      for (const name of names[field]) {
        const existing = decisions.find(item => item.asset === name && item.kind === kind)
        const decision = { asset: name, kind, value: desired.has(name) ? 'enabled' : 'disabled', source: source.scope, precedence: source.precedence }
        if (existing) Object.assign(existing, decision)
        else decisions.push(decision)
      }
    }
  }

  decisions.sort((left, right) => `${left.kind}:${left.asset}`.localeCompare(`${right.kind}:${right.asset}`))
  const diagnostics = capabilityDiagnostics({ repoRoot, agentName, effective })
  const ownershipReport = {
    skills: ownership({ home, repoRoot, agentName, kind: 'skill', names: names.skills }),
    hooks: HOOK_AGENTS[agentName]
      ? ownership({ home, repoRoot, agentName, kind: 'hook', names: names.hooks })
      : [],
  }
  const unmanaged = [...ownershipReport.skills, ...ownershipReport.hooks]
    .filter(item => item.state === 'unmanaged' && effective[item.name?.endsWith('.sh') ? 'hooks' : 'skills']?.includes(item.name))
    .map(item => ({ asset: item.name, reason: 'unmanaged-target', target: item.target }))
  const blocked = [
    ...diagnostics.capability_gaps.map(item => ({ ...item, reason: item.reason ?? 'capability-gap' })),
    ...diagnostics.conflicts,
    ...unmanaged,
  ].sort((left, right) => `${left.kind ?? ''}:${left.asset}`.localeCompare(`${right.kind ?? ''}:${right.asset}`))

  return {
    schema_version: V2_PROFILE_VERSION,
    valid: errors.length === 0,
    agent: agentName,
    project_root: resolvedProjectRoot,
    session_id: sessionId,
    sources: sources.map(source => ({
      scope: source.scope,
      path: source.path,
      precedence: source.precedence,
      status: source.status,
      schema_version: source.schema_version,
      ...(source.error ? { error: source.error } : {}),
    })),
    effective,
    decisions,
    unsupported: diagnostics.unsupported,
    capability_gaps: diagnostics.capability_gaps,
    conflicts: diagnostics.conflicts,
    ownership: ownershipReport,
    blocked,
    mutations: errors.length === 0
      ? dryRunMutations({ home, repoRoot, agentName, effective })
      : { dry_run: true, skills: [], hooks: [], config: null },
    warnings: errors,
  }
}

export {
  resolveEffectiveProfile,
  sourceDefinitions,
}
