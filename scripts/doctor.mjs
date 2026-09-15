#!/usr/bin/env node

import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { SKILL_AGENTS } from './integration-profile.mjs'
import { resolveEffectiveProfile } from './profile-resolver.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const options = {
    agent: null,
    home: os.homedir(),
    project: process.cwd(),
    repo: REPO,
    session: null,
    sessionPath: null,
    format: 'text',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--agent') options.agent = argv[++index]
    else if (arg === '--home') options.home = argv[++index]
    else if (arg === '--project') options.project = argv[++index]
    else if (arg === '--repo') options.repo = argv[++index]
    else if (arg === '--session') options.session = argv[++index]
    else if (arg === '--session-file') options.sessionPath = argv[++index]
    else if (arg === '--format') options.format = argv[++index]
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`unknown option: ${arg}`)
  }
  if (!['text', 'json'].includes(options.format)) throw new Error('--format must be text or json')
  options.home = path.resolve(options.home)
  options.project = path.resolve(options.project)
  options.repo = path.resolve(options.repo)
  if (options.sessionPath) options.sessionPath = path.resolve(options.sessionPath)
  return options
}

function usage() {
  return [
    'Usage: go-beast doctor [options]',
    '',
    '  --agent NAME                   Inspect one agent; default is all supported agents',
    '  --project PATH                Project root containing .go-beast/profile.json',
    '  --session ID                  Resolve .go-beast/sessions/<ID>.json',
    '  --session-file PATH           Resolve an explicit session profile path',
    '  --home PATH                   Override the global profile home',
    '  --repo PATH                   Use another go-beast repository',
    '  --format text|json            Select output format',
  ].join('\n')
}

function summarize(report) {
  const changes = [
    ...(report.mutations?.skills ?? []),
    ...(report.mutations?.hooks ?? []),
  ].filter(item => item.action !== 'none').length
  return [
    `doctor: ${report.agent}`,
    `project: ${report.project_root}`,
    `sources: ${(report.sources ?? []).map(source => `${source.scope}=${source.status}`).join(', ')}`,
    `effective: ${report.effective.skills.length} skills, ${report.effective.hooks.length} hooks`,
    `gaps: ${report.capability_gaps.length}, conflicts: ${report.conflicts.length}, unsupported: ${report.unsupported.length}`,
    `blocked: ${report.blocked.length}`,
    `dry-run: ${changes} asset changes${report.mutations?.config ? `, ${report.mutations.config.add.length + report.mutations.config.remove.length} config changes` : ''}`,
    ...(report.warnings ?? []).map(warning => `warning: ${warning}`),
  ].join('\n')
}

function emit(value, format) {
  process.stdout.write(format === 'json' ? `${JSON.stringify(value, null, 2)}\n` : `${summarize(value)}\n`)
}

function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
    if (options.help) {
      process.stdout.write(`${usage()}\n`)
      return
    }
    const agents = options.agent ? [options.agent] : Object.keys(SKILL_AGENTS).sort()
    const reports = agents.map(agent => resolveEffectiveProfile({
      home: options.home,
      repoRoot: options.repo,
      projectRoot: options.project,
      agentName: agent,
      sessionId: options.session,
      sessionPath: options.sessionPath,
    }))
    const output = reports.length === 1
      ? { command: 'doctor', ...reports[0] }
      : { schema_version: 2, command: 'doctor', valid: reports.every(report => report.valid), agents: reports }
    emit(output, options.format)
    if (!output.valid) process.exitCode = 1
  } catch (error) {
    const output = { schema_version: 2, command: 'doctor', valid: false, errors: [error.message] }
    if (options?.format === 'json') process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    else console.error(`go-beast doctor: ${error.message}`)
    process.exitCode = 1
  }
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) main()

export { main, parseArgs }
