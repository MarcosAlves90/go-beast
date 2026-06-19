#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

const REPO = path.resolve(import.meta.dirname, '..')
const CHANGELOG_PATH = path.join(REPO, 'CHANGELOG.md')
const README_PATH = path.join(REPO, 'README.md')
const PACKAGE_MD_PATH = path.join(REPO, 'PACKAGE.md')
const PACKAGE_JSON_PATH = path.join(REPO, 'package.json')
const CODEX_PLUGIN_PATH = path.join(REPO, 'plugins', 'go-beast', '.codex-plugin', 'plugin.json')
const CLAUDE_PLUGIN_PATH = path.join(REPO, 'plugins', 'go-beast', '.claude-plugin', 'plugin.json')

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content)
}

function parseArgs(argv) {
  const args = { command: 'check', bump: '', date: '', version: '' }
  const [command, ...rest] = argv
  if (command === 'check' || command === 'release') args.command = command

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
  const packageJson = JSON.parse(read(PACKAGE_JSON_PATH))
  const codexPlugin = JSON.parse(read(CODEX_PLUGIN_PATH))
  const claudePlugin = JSON.parse(read(CLAUDE_PLUGIN_PATH))
  const readme = read(README_PATH)
  const packageMd = read(PACKAGE_MD_PATH)
  const changelog = read(CHANGELOG_PATH)

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

function release({ bump, version, date }) {
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

  process.stdout.write(JSON.stringify({
    ok: true,
    releasedVersion: nextVersion,
    date: nextDate,
  }, null, 2) + '\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.command === 'check') {
    check()
    return
  }

  if (args.command === 'release') {
    if (!args.bump && !args.version) {
      fail('release requires --bump <patch|minor|major> or --version <x.y.z>')
    }
    release(args)
    return
  }

  fail(`Unsupported command: ${args.command}`)
}

main()
