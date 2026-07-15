#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const mode = process.argv[2] ?? 'verify'
const repoRoot = process.cwd()

const lintChecks = [
  ['plugin synchronization', ['node', ['scripts/sync-plugin-skills.mjs']]],
  ['release and version consistency', ['node', ['scripts/release-version.mjs', 'check']]],
]

const testSuites = [
  ['plugin tests', 'tests/plugin'],
  ['installation tests', 'tests/install'],
]

function run(label, command, args) {
  console.log(`\n==> ${label}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    console.error(`Validation command failed to start: ${result.error.message}`)
    return 1
  }
  if (result.status !== 0) {
    console.error(`Validation failed: ${label} (exit ${result.status ?? 'signal'})`)
    return result.status || 1
  }
  return 0
}

function shellFiles(directory) {
  const files = []
  const visit = current => {
    for (const entry of fs.readdirSync(path.join(repoRoot, current), { withFileTypes: true })) {
      const relative = path.join(current, entry.name)
      if (entry.isDirectory()) visit(relative)
      else if (entry.isFile() && entry.name.endsWith('.sh')) files.push(relative)
    }
  }
  visit(directory)
  return files.sort()
}

function runDirectorySuite(label, directory) {
  for (const file of shellFiles(directory)) {
    const status = run(`${label}: ${file}`, 'bash', [file])
    if (status !== 0) return status
  }
  return 0
}

function gitStatus() {
  return execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

function runLint() {
  for (const [label, [command, args]] of lintChecks) {
    const status = run(label, command, args)
    if (status !== 0) return status
  }
  return 0
}

function runTests() {
  for (const [label, directory] of testSuites) {
    const status = runDirectorySuite(label, directory)
    if (status !== 0) return status
  }
  return 0
}

function runLiveTests() {
  for (const directory of ['tests/claude-code', 'tests/codex', 'tests/copilot']) {
    const status = runDirectorySuite('live tests', directory)
    if (status !== 0) return status
  }
  return 0
}

if (!['lint', 'test', 'verify', 'test:live'].includes(mode)) {
  console.error(`Unknown validation mode: ${mode}`)
  process.exit(2)
}

if (mode === 'test:live') {
  process.exit(runLiveTests())
}

const initialStatus = mode === 'verify' ? gitStatus() : null
const status = mode === 'lint' ? runLint() : mode === 'test' ? runTests() : (() => {
  const lintStatus = runLint()
  return lintStatus === 0 ? runTests() : lintStatus
})()

if (status !== 0) process.exit(status)

if (mode === 'verify') {
  const finalStatus = gitStatus()
  if (finalStatus !== initialStatus) {
    console.error('\nValidation changed the Git tree unexpectedly.')
    console.error('Changes before validation:')
    process.stderr.write(initialStatus || '(clean)\n')
    console.error('Changes after validation:')
    process.stderr.write(finalStatus || '(clean)\n')
    process.exit(1)
  }
}

console.log(`\nValidation passed: ${mode}`)
