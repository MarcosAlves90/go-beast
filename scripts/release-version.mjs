#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { execFileSync } from 'child_process'

const REPO = path.resolve(import.meta.dirname, '..')
const CHANGELOG_PATH = path.join(REPO, 'CHANGELOG.md')
const README_PATH = path.join(REPO, 'README.md')
const PACKAGE_MD_PATH = path.join(REPO, 'PACKAGE.md')
const PACKAGE_JSON_PATH = path.join(REPO, 'package.json')
const CODEX_PLUGIN_PATH = path.join(REPO, 'plugins', 'go-beast', '.codex-plugin', 'plugin.json')
const CLAUDE_PLUGIN_PATH = path.join(REPO, 'plugins', 'go-beast', '.claude-plugin', 'plugin.json')
const RELEASE_CERT_PATH = path.join(REPO, 'release-certificate.json')
const GH_BIN = process.env.GH_BIN || 'gh'

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content)
}

function exists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

function readJson(filePath) {
  return JSON.parse(read(filePath))
}

function parseArgs(argv) {
  const args = { command: 'check', bump: '', date: '', version: '' }
  const [command, ...rest] = argv
  if (command === 'check' || command === 'release' || command === 'publish') args.command = command

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--bump') args.bump = rest[++i] ?? ''
    else if (arg === '--date') args.date = rest[++i] ?? ''
    else if (arg === '--version') args.version = rest[++i] ?? ''
  }

  return args
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function nowUtc() {
  return new Date().toISOString()
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
}

function gitMaybe(args) {
  try {
    return git(args)
  } catch {
    return ''
  }
}

function gh(args, options = {}) {
  return execFileSync(GH_BIN, args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
}

function ghMaybe(args) {
  try {
    return gh(args)
  } catch {
    return ''
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function remoteExists(remoteName) {
  return gitMaybe(['remote', 'get-url', remoteName]) !== ''
}

function remoteTagExists(remoteName, tagName) {
  if (!remoteExists(remoteName)) return false
  return gitMaybe(['ls-remote', '--tags', remoteName, tagName]) !== ''
}

function pushTagToRemote(tagName, remoteName = 'origin') {
  if (!remoteExists(remoteName)) return false
  if (remoteTagExists(remoteName, tagName)) return false
  git(['push', remoteName, tagName])
  return true
}

async function waitForReleasePublication(tagName, { timeoutMs = 5 * 60 * 1000, intervalMs = 5000 } = {}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const release = JSON.parse(gh(['release', 'view', tagName, '--json', 'isDraft,publishedAt']))
    if (release.isDraft === false && release.publishedAt) return release
    await sleep(intervalMs)
  }

  fail(`Timed out waiting for ${tagName} to be published`)
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) fail(`Invalid SemVer version: ${version}`)
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function bumpVersion(currentVersion, bump) {
  const { major, minor, patch } = parseSemver(currentVersion)
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  if (bump === 'major') return `${major + 1}.0.0`
  fail(`Unsupported bump level: ${bump}`)
}

function loadState() {
  const packageJson = readJson(PACKAGE_JSON_PATH)
  const codexPlugin = readJson(CODEX_PLUGIN_PATH)
  const claudePlugin = readJson(CLAUDE_PLUGIN_PATH)
  const readme = read(README_PATH)
  const packageMd = read(PACKAGE_MD_PATH)
  const changelog = read(CHANGELOG_PATH)
  const releaseCertificate = exists(RELEASE_CERT_PATH) ? readJson(RELEASE_CERT_PATH) : null

  const packageJsonVersion = packageJson.version
  const readmeVersion = /\*\*Version ([0-9]+\.[0-9]+\.[0-9]+)\*\*/.exec(readme)?.[1] ?? ''
  const packageMdVersion = /^version:\s*([0-9]+\.[0-9]+\.[0-9]+)$/m.exec(packageMd)?.[1] ?? ''
  const latestReleasedVersion = /^## \[([0-9]+\.[0-9]+\.[0-9]+)\] - /m.exec(changelog)?.[1] ?? ''

  return {
    packageJson,
    packageJsonVersion,
    codexPlugin,
    codexPluginVersion: codexPlugin.version ?? '',
    claudePlugin,
    claudePluginVersion: claudePlugin.version ?? '',
    readme,
    readmeVersion,
    packageMd,
    packageMdVersion,
    changelog,
    latestReleasedVersion,
    releaseCertificate,
  }
}

function unreleasedBodyBounds(changelog) {
  const startMatch = /^## \[Unreleased\]\n/m.exec(changelog)
  if (!startMatch) fail('CHANGELOG.md is missing the [Unreleased] section')
  const start = startMatch.index + startMatch[0].length

  const afterStart = changelog.slice(start)
  const nextHeaderMatch = /^## \[[0-9]+\.[0-9]+\.[0-9]+\] - /m.exec(afterStart)
  const end = nextHeaderMatch ? start + nextHeaderMatch.index : changelog.length

  return { start, end }
}

function unreleasedBody(changelog) {
  const { start, end } = unreleasedBodyBounds(changelog)
  return changelog.slice(start, end)
}

function unreleasedHasContent(changelog) {
  return unreleasedBody(changelog)
    .split('\n')
    .some(line => line.trim() !== '')
}

function releasedVersionDate(changelog) {
  const match = /^## \[([0-9]+\.[0-9]+\.[0-9]+)\] - ([0-9]{4}-[0-9]{2}-[0-9]{2})$/m.exec(changelog)
  if (!match) return { version: '', date: '' }
  return { version: match[1], date: match[2] }
}

function releaseSurfaceHashes() {
  const files = {
    'package.json': PACKAGE_JSON_PATH,
    'README.md': README_PATH,
    'PACKAGE.md': PACKAGE_MD_PATH,
    'CHANGELOG.md': CHANGELOG_PATH,
    'plugins/go-beast/.codex-plugin/plugin.json': CODEX_PLUGIN_PATH,
    'plugins/go-beast/.claude-plugin/plugin.json': CLAUDE_PLUGIN_PATH,
  }

  return Object.fromEntries(Object.entries(files).map(([label, filePath]) => [label, sha256(read(filePath))]))
}

function releaseCertificateChecksum() {
  return sha256(read(RELEASE_CERT_PATH))
}

function changelogSectionForVersion(changelog, version) {
  const headerPattern = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$`, 'm')
  const match = headerPattern.exec(changelog)
  if (!match) fail(`CHANGELOG.md does not contain a released section for ${version}`)

  const start = match.index + match[0].length
  const afterStart = changelog.slice(start)
  const nextHeaderMatch = /^## \[[0-9]+\.[0-9]+\.[0-9]+\] - /m.exec(afterStart)
  const end = nextHeaderMatch ? start + nextHeaderMatch.index : changelog.length
  return changelog.slice(start, end).replace(/^\n+/, '').trimEnd()
}

function buildReleaseCertificate(version, date) {
  return {
    version,
    tag: `v${version}`,
    date,
    canonicalVersionSource: 'package.json',
    generatedBy: 'scripts/release-version.mjs',
    generatedAt: nowUtc(),
    surfaces: releaseSurfaceHashes(),
  }
}

function certificateMatches(state, certificate) {
  if (!certificate) return false
  const expected = buildReleaseCertificate(state.packageJsonVersion, releasedVersionDate(state.changelog).date || certificate.date)
  return certificate.version === expected.version &&
    certificate.tag === expected.tag &&
    certificate.date === expected.date &&
    certificate.canonicalVersionSource === expected.canonicalVersionSource &&
    certificate.generatedBy === expected.generatedBy &&
    JSON.stringify(certificate.surfaces) === JSON.stringify(expected.surfaces)
}

function isReleasedState(state) {
  const latest = releasedVersionDate(state.changelog)
  return !unreleasedHasContent(state.changelog) && latest.version === state.packageJsonVersion
}

function check() {
  const state = loadState()
  const errors = []

  parseSemver(state.packageJsonVersion)

  if (state.readmeVersion !== state.packageJsonVersion) {
    errors.push(`README.md version (${state.readmeVersion || 'missing'}) does not match package.json (${state.packageJsonVersion})`)
  }

  if (state.packageMdVersion !== state.packageJsonVersion) {
    errors.push(`PACKAGE.md version (${state.packageMdVersion || 'missing'}) does not match package.json (${state.packageJsonVersion})`)
  }

  if (state.latestReleasedVersion !== state.packageJsonVersion) {
    errors.push(`Latest released CHANGELOG.md version (${state.latestReleasedVersion || 'missing'}) does not match package.json (${state.packageJsonVersion})`)
  }

  if (state.codexPluginVersion !== state.packageJsonVersion) {
    errors.push(`plugins/go-beast/.codex-plugin/plugin.json version (${state.codexPluginVersion || 'missing'}) does not match package.json (${state.packageJsonVersion})`)
  }

  if (state.claudePluginVersion !== state.packageJsonVersion) {
    errors.push(`plugins/go-beast/.claude-plugin/plugin.json version (${state.claudePluginVersion || 'missing'}) does not match package.json (${state.packageJsonVersion})`)
  }

  if (isReleasedState(state)) {
    if (!state.releaseCertificate) {
      errors.push('release-certificate.json is missing for the released version')
    } else if (!certificateMatches(state, state.releaseCertificate)) {
      errors.push('release-certificate.json does not match the released version surfaces')
    }
  }

  if (errors.length > 0) {
    fail(`Release version check failed:\n- ${errors.join('\n- ')}`)
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    canonicalVersion: state.packageJsonVersion,
    unreleasedHasContent: unreleasedHasContent(state.changelog),
  }, null, 2) + '\n')
}

function replaceRequired(content, pattern, replacement, label) {
  if (!pattern.test(content)) fail(`${label} does not contain the expected release-version marker`)
  return content.replace(pattern, replacement)
}

function replaceReadmeVersion(readme, version) {
  return replaceRequired(
    readme,
    /\*\*Version [0-9]+\.[0-9]+\.[0-9]+\*\*/,
    `**Version ${version}**`,
    'README.md',
  )
}

function replacePackageMd(packageMd, version, date) {
  let next = replaceRequired(
    packageMd,
    /^version:\s*[0-9]+\.[0-9]+\.[0-9]+$/m,
    `version: ${version}`,
    'PACKAGE.md version line',
  )
  next = replaceRequired(
    next,
    /^date:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}$/m,
    `date:    ${date}`,
    'PACKAGE.md date line',
  )
  return next
}

async function release({ bump, version, date }) {
  const state = loadState()
  const nextDate = date || todayUtc()
  const nextVersion = version || bumpVersion(state.packageJsonVersion, bump)
  parseSemver(nextVersion)

  if (!unreleasedHasContent(state.changelog)) {
    fail('CHANGELOG.md has no [Unreleased] content to release')
  }

  const { start, end } = unreleasedBodyBounds(state.changelog)
  const unreleased = state.changelog.slice(start, end).replace(/^\n+/, '\n')
  const releaseHeader = `## [${nextVersion}] - ${nextDate}\n`
  const nextChangelog = `${state.changelog.slice(0, start)}\n${releaseHeader}${unreleased}${state.changelog.slice(end)}`

  state.packageJson.version = nextVersion
  state.codexPlugin.version = nextVersion
  state.claudePlugin.version = nextVersion
  write(PACKAGE_JSON_PATH, `${JSON.stringify(state.packageJson, null, 2)}\n`)
  write(CODEX_PLUGIN_PATH, `${JSON.stringify(state.codexPlugin, null, 2)}\n`)
  write(CLAUDE_PLUGIN_PATH, `${JSON.stringify(state.claudePlugin, null, 2)}\n`)
  write(README_PATH, replaceReadmeVersion(state.readme, nextVersion))
  write(PACKAGE_MD_PATH, replacePackageMd(state.packageMd, nextVersion, nextDate))
  write(CHANGELOG_PATH, nextChangelog)
  write(RELEASE_CERT_PATH, `${JSON.stringify(buildReleaseCertificate(nextVersion, nextDate), null, 2)}\n`)

  process.stdout.write(JSON.stringify({
    ok: true,
    releasedVersion: nextVersion,
    date: nextDate,
  }, null, 2) + '\n')
}

async function publish() {
  const state = loadState()
  const { version, date } = releasedVersionDate(state.changelog)
  if (!version || !date) {
    fail('publish requires a released changelog section to exist')
  }

  if (unreleasedHasContent(state.changelog)) {
    fail('publish requires an empty [Unreleased] section')
  }

  if (!state.releaseCertificate) {
    fail('publish requires release-certificate.json')
  }

  if (!certificateMatches(state, state.releaseCertificate)) {
    fail('publish requires a release certificate that matches the current release surfaces')
  }

  const tagName = `v${version}`
  const dirty = git(['status', '--porcelain'])
  if (dirty) {
    fail('publish requires a clean working tree')
  }

  const existingTag = gitMaybe(['rev-list', '-n', '1', tagName])
  const head = git(['rev-parse', 'HEAD'])
  let tagStatus = 'already-exists'
  if (existingTag) {
    if (existingTag !== head) {
      fail(`tag already exists on a different commit: ${tagName}`)
    }
  } else {
    const message = [
      `go-beast ${version}`,
      '',
      `Release certificate: release-certificate.json`,
      `Date: ${date}`,
    ].join('\n')

    git(['tag', '-a', tagName, '-m', message])
    tagStatus = 'created'
  }

  try {
    const releaseExists = ghMaybe(['release', 'view', tagName, '--json', 'tagName']) !== ''
    if (releaseExists) {
      process.stdout.write(JSON.stringify({
        ok: true,
        tag: tagName,
        tagStatus,
        status: 'already-exists',
      }, null, 2) + '\n')
      return
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-release-notes-'))
    const notesPath = path.join(tmpDir, 'notes.md')
    const notes = changelogSectionForVersion(state.changelog, version)
    write(notesPath, `${notes}\n`)

    pushTagToRemote(tagName)

    gh(['release', 'create', tagName, '--draft', '--title', `go-beast ${version}`, '--notes-file', notesPath, '--verify-tag'])

    gh([
      'workflow',
      'run',
      'release-finalize.yml',
      '--ref',
      'main',
      '-f',
      `tag_name=${tagName}`,
    ])

    await waitForReleasePublication(tagName)

    process.stdout.write(JSON.stringify({
      ok: true,
      tag: tagName,
      tagStatus,
      status: 'published',
    }, null, 2) + '\n')
  } catch (error) {
    fail(`publish requires GitHub CLI access via ${GH_BIN}: ${error.stderr?.toString?.() || error.message}`)
  } finally {
    if (typeof tmpDir !== 'undefined') {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.command === 'check') {
    check()
    return
  }

  if (args.command === 'release') {
    if (!args.bump && !args.version) {
      fail('release requires --bump <patch|minor|major> or --version <x.y.z>')
    }
    await release(args)
    return
  }

  if (args.command === 'publish') {
    await publish()
    return
  }

  fail(`Unsupported command: ${args.command}`)
}

main().catch(error => {
  fail(error?.stderr?.toString?.() || error?.message || String(error))
})
