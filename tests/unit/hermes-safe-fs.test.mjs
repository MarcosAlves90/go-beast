import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { helperPath, relativePathWithinRoot, runSafeFs } from '../../scripts/safe-fs.mjs'
import { sourceDigest } from '../../scripts/install-transaction.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function legacyTargetFingerprint(target) {
  const rootStat = fs.lstatSync(target)
  const rootState = rootStat.isSymbolicLink() ? 'symlink' : rootStat.isDirectory() ? 'directory' : rootStat.isFile() ? 'file' : 'other'
  const digest = crypto.createHash('sha256')
  const visit = (current, relative) => {
    const stat = fs.lstatSync(current)
    const name = relative || '.'
    const mode = (stat.mode & 0o7777).toString(8)
    if (stat.isSymbolicLink()) {
      digest.update(`${name}\0symlink\0${mode}\0${fs.readlinkSync(current)}\n`)
    } else if (stat.isDirectory()) {
      digest.update(`${name}\0directory\0${mode}\n`)
      for (const entry of fs.readdirSync(current).sort((left, right) => left.localeCompare(right))) {
        const childRelative = relative ? `${relative}/${entry}` : entry
        visit(path.join(current, entry), childRelative)
      }
    } else if (stat.isFile()) {
      digest.update(`${name}\0file\0${mode}\0`)
      digest.update(fs.readFileSync(current))
      digest.update('\n')
    } else {
      digest.update(`${name}\0other\0${mode}\n`)
    }
  }
  visit(target, '')
  return { state: rootState, mode: rootStat.mode & 0o7777, sha256: digest.digest('hex') }
}

test('helper path maps the six bundled targets', () => {
  for (const [platform, architecture, filename] of [
    ['darwin', 'arm64', 'go-beast-safe-fs-darwin-arm64'],
    ['darwin', 'x64', 'go-beast-safe-fs-darwin-x64'],
    ['linux', 'arm64', 'go-beast-safe-fs-linux-arm64'],
    ['linux', 'x64', 'go-beast-safe-fs-linux-x64'],
    ['win32', 'arm64', 'go-beast-safe-fs-win32-arm64.exe'],
    ['win32', 'x64', 'go-beast-safe-fs-win32-x64.exe'],
  ]) {
    assert.equal(path.basename(helperPath({ platform, architecture })), filename)
  }
})

test('helper path rejects unsupported targets without fallback', () => {
  assert.throws(() => helperPath({ platform: 'freebsd', architecture: 'x64' }), /does not support/)
  assert.throws(() => helperPath({ platform: 'linux', architecture: 'ppc64' }), /does not support/)
})

test('relative target paths stay beneath the lexical Hermes home', () => {
  assert.equal(
    relativePathWithinRoot('/tmp/hermes-link', '/tmp/hermes-link/skills/go-beast/go-fox'),
    'skills/go-beast/go-fox',
  )
  assert.throws(() => relativePathWithinRoot('/tmp/hermes-link', '/tmp/outside/skill'), /outside its root/)
  assert.throws(() => relativePathWithinRoot('/tmp/hermes-link', '/tmp/hermes-link'), /outside its root/)
})

test('native ownership digest matches the Node integrity manifest digest', () => {
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-safe-fs-digest-'))
  const sourceRoot = path.join(repositoryRoot, 'skills')
  const targetRoot = path.join(hermesHome, 'skills', 'go-beast')
  try {
    fs.mkdirSync(targetRoot, { recursive: true })
    const skills = fs.readdirSync(sourceRoot).filter(name => {
      const stat = fs.lstatSync(path.join(sourceRoot, name))
      return name.startsWith('go-') && stat.isDirectory() && !stat.isSymbolicLink()
    })
    assert.ok(skills.length > 0, 'canonical go-* skills should be present')
    for (const name of skills) {
      const source = path.join(sourceRoot, name)
      const target = path.join(targetRoot, name)
      fs.cpSync(source, target, { recursive: true, verbatimSymlinks: true })
      const response = runSafeFs({
        operation: 'inspect',
        root: hermesHome,
        path: `skills/go-beast/${name}`,
      })
      assert.equal(response.state, 'directory', `${name} should be a directory`)
      assert.equal(response.sha256, sourceDigest(target).sha256, `${name} digest should match`)
    }
  } finally {
    fs.rmSync(hermesHome, { recursive: true, force: true })
  }
})

test('native transaction fingerprint remains compatible with existing Node records', () => {
  const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-safe-fs-fingerprint-'))
  const sourceRoot = path.join(repositoryRoot, 'skills')
  const targetRoot = path.join(hermesHome, 'skills', 'go-beast')
  try {
    fs.mkdirSync(targetRoot, { recursive: true })
    const skills = fs.readdirSync(sourceRoot).filter(name => {
      const stat = fs.lstatSync(path.join(sourceRoot, name))
      return name.startsWith('go-') && stat.isDirectory() && !stat.isSymbolicLink()
    })
    assert.ok(skills.length > 0, 'canonical go-* skills should be present')
    for (const name of skills) {
      const source = path.join(sourceRoot, name)
      const target = path.join(targetRoot, name)
      fs.cpSync(source, target, { recursive: true, verbatimSymlinks: true })
      const response = runSafeFs({
        operation: 'fingerprint',
        root: hermesHome,
        path: `skills/go-beast/${name}`,
      })
      assert.deepEqual(
        { state: response.state, mode: response.mode, sha256: response.sha256 },
        legacyTargetFingerprint(target),
        `${name} transaction fingerprint should match existing Node records`,
      )
    }
  } finally {
    fs.rmSync(hermesHome, { recursive: true, force: true })
  }
})
