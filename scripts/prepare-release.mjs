#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO = path.resolve(import.meta.dirname, '..')
const CHANGELOG_PATH = path.join(REPO, 'CHANGELOG.md')
const RELEASE_VERSION_SCRIPT = path.join(REPO, 'scripts', 'release-version.mjs')
const GH_BIN = process.env.GH_BIN || 'gh'

const CATEGORY_LABELS = new Map([
  ['changelog:added', 'Added'],
  ['changelog:changed', 'Changed'],
  ['changelog:fixed', 'Fixed'],
  ['changelog:removed', 'Removed'],
  ['changelog:security', 'Security'],
])

const TYPE_CATEGORIES = new Map([
  ['feat', 'Added'],
  ['fix', 'Fixed'],
  ['perf', 'Changed'],
  ['refactor', 'Changed'],
  ['style', 'Changed'],
  ['build', 'Changed'],
  ['ci', 'Changed'],
  ['docs', 'Changed'],
  ['test', 'Changed'],
  ['chore', 'Changed'],
  ['revert', 'Changed'],
])

const BUMP_RANK = { patch: 0, minor: 1, major: 2 }

function fail(message) {
  console.error(message)
  process.exit(1)
}

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content)
}

function parseArgs(argv) {
  const args = { version: '', dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--version') args.version = argv[++index] ?? ''
    else if (argv[index] === '--dry-run') args.dryRun = true
    else fail(`Unsupported argument: ${argv[index]}`)
  }
  return args
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) fail(`Invalid SemVer version: ${version}`)
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function compareVersions(left, right) {
  const a = parseSemver(left)
  const b = parseSemver(right)
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

function bumpVersion(version, bump) {
  const { major, minor, patch } = parseSemver(version)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function latestReleaseTag() {
  try {
    return git(['describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0'])
  } catch {
    fail('Unable to find the latest release tag matching v<major>.<minor>.<patch>')
  }
}

function packageVersion() {
  return JSON.parse(read(path.join(REPO, 'package.json'))).version
}

function commitsSince(tag) {
  const raw = git(['log', `${tag}..HEAD`, '--format=%H%x1f%s%x1f%b%x1e'])
  if (!raw) return []

  return raw.split('\x1e')
    .filter(Boolean)
    .map(record => {
      const [sha, subject, body = ''] = record.split('\x1f')
      if (/^Merge /.test(subject)) return null
      const match = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s+(?<description>.+)$/.exec(subject)
      if (!match) fail(`Commit ${sha.slice(0, 8)} is not a Conventional Commit: ${subject}`)
      return {
        sha,
        subject,
        body,
        type: match.groups.type,
        scope: match.groups.scope || '',
        breaking: Boolean(match.groups.breaking) || /BREAKING(?: CHANGE|-CHANGE):/i.test(body),
      }
    })
    .filter(Boolean)
}

function pullRequestMetadata(commit) {
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) return { numbers: [], labels: [] }

  let pulls
  try {
    pulls = JSON.parse(execFileSync(GH_BIN, [
      'api',
      '-H',
      'Accept: application/vnd.github+json',
      `repos/${repository}/commits/${commit.sha}/pulls`,
    ], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }))
  } catch (error) {
    fail(`Unable to read pull request labels for ${commit.sha.slice(0, 8)}: ${error.message}`)
  }
  const numbers = pulls.map(pull => pull.number).filter(Number.isInteger)
  const labels = pulls.flatMap(pull => (pull.labels || []).map(label => label.name)).filter(Boolean)
  return { numbers, labels }
}

function classify(commit, metadata) {
  const labels = new Set(metadata.labels)
  const bumpLabel = [...labels].find(label => /^release:(major|minor|patch)$/.test(label))
  const categoryLabel = [...labels].find(label => CATEGORY_LABELS.has(label))
  const bump = bumpLabel?.slice('release:'.length) || (commit.breaking ? 'major' : commit.type === 'feat' ? 'minor' : 'patch')
  const category = CATEGORY_LABELS.get(categoryLabel) || TYPE_CATEGORIES.get(commit.type)
  if (!category) fail(`Unsupported Conventional Commit type: ${commit.type}`)
  return { bump, category }
}

function formatEntry(commit, metadata) {
  const scope = commit.scope ? `**${commit.scope}:** ` : ''
  const pullRequests = metadata.numbers.length > 0 ? ` (#${metadata.numbers.sort((a, b) => a - b).join(', #')})` : ''
  return `- ${scope}${commit.description}${pullRequests}`
}

function buildChangelog(commits) {
  const groups = new Map()
  let highestBump = 'patch'

  for (const commit of commits) {
    const metadata = pullRequestMetadata(commit)
    const classification = classify(commit, metadata)
    if (BUMP_RANK[classification.bump] > BUMP_RANK[highestBump]) highestBump = classification.bump
    if (!groups.has(classification.category)) groups.set(classification.category, new Set())
    groups.get(classification.category).add(formatEntry({ ...commit, description: commit.subject.replace(/^[^:]+:\s+/, '') }, metadata))
  }

  const order = ['Added', 'Changed', 'Fixed', 'Removed', 'Security']
  const body = order
    .filter(category => groups.has(category))
    .map(category => `### ${category}\n\n${[...groups.get(category)].sort().join('\n')}`)
    .join('\n\n')

  return { body, highestBump }
}

function replaceUnreleased(changelog, body) {
  const startMatch = /^## \[Unreleased\]\n/m.exec(changelog)
  if (!startMatch) fail('CHANGELOG.md is missing the [Unreleased] section')
  const start = startMatch.index + startMatch[0].length
  const rest = changelog.slice(start)
  const nextRelease = /^## \[[0-9]+\.[0-9]+\.[0-9]+\] - /m.exec(rest)
  const end = nextRelease ? start + nextRelease.index : changelog.length
  const prefix = changelog.slice(0, start)
  const suffix = changelog.slice(end).replace(/^\n*/, '\n')
  return `${prefix}${body ? `\n${body}\n` : '\n'}${suffix}`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const tag = latestReleaseTag()
  const currentVersion = packageVersion()
  const commits = commitsSince(tag)
  if (commits.length === 0) fail(`No Conventional Commit changes found since ${tag}`)

  const { body, highestBump } = buildChangelog(commits)
  const nextVersion = args.version || bumpVersion(currentVersion, highestBump)
  parseSemver(nextVersion)
  if (compareVersions(nextVersion, currentVersion) <= 0) {
    fail(`Release version ${nextVersion} must be greater than current version ${currentVersion}`)
  }

  if (!args.dryRun) {
    write(CHANGELOG_PATH, replaceUnreleased(read(CHANGELOG_PATH), body))
    execFileSync(process.execPath, [RELEASE_VERSION_SCRIPT, 'release', '--version', nextVersion], {
      cwd: REPO,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    baseTag: tag,
    currentVersion,
    nextVersion,
    bump: args.version ? 'manual' : highestBump,
    commits: commits.length,
    dryRun: args.dryRun,
  }, null, 2) + '\n')
}

main()
