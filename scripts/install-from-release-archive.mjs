#!/usr/bin/env node
// go-beast release-archive bootstrap installer
// Downloads or uses a local GitHub source archive, extracts it into a versioned
// cache under ~/.go-beast/source/go-beast-release-archive/, then updates the
// active source pointer before running the canonical installer from that tree.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'

const HOME = os.homedir()
const DEFAULT_REPO_SLUG = 'MarcosAlves90/go-beast'
const RELEASE_ROOT = path.join(HOME, '.go-beast', 'source', 'go-beast-release-archive')
const VERSION_ROOT = path.join(RELEASE_ROOT, 'versions')
const CURRENT_ROOT = path.join(RELEASE_ROOT, 'current')
const INSTALL_ROOT = CURRENT_ROOT

function fail(message) {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {
    archive: '',
    archiveUrl: '',
    latest: false,
    release: '',
    repo: DEFAULT_REPO_SLUG,
    passthrough: [],
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--archive') {
      args.archive = argv[++i] ?? ''
      continue
    }
    if (arg === '--archive-url') {
      args.archiveUrl = argv[++i] ?? ''
      continue
    }
    if (arg === '--latest') {
      args.latest = true
      continue
    }
    if (arg === '--release') {
      args.release = argv[++i] ?? ''
      continue
    }
    if (arg === '--repo') {
      args.repo = argv[++i] ?? ''
      continue
    }
    args.passthrough.push(arg)
  }

  return args
}

function safeSlug(value) {
  return value
    .replace(/^v/, '')
    .replace(/\.tar\.gz$/i, '')
    .replace(/\.tgz$/i, '')
    .replace(/\.tar$/i, '')
    .replace(/\.zip$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function hashFile(filePath) {
  const content = fs.readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

function normalizeRepoSlug(repo) {
  if (!repo) {
    fail('Missing repository value')
  }

  if (/^[^/]+\/[^/]+$/.test(repo)) {
    return repo
  }

  const normalized = repo
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    fail(`Invalid repository value: ${repo}`)
  }

  if (parsed.hostname !== 'github.com') {
    fail(`Unsupported repository host for release discovery: ${parsed.hostname}`)
  }

  const [owner, repoName] = parsed.pathname.replace(/^\/+/, '').split('/')
  if (!owner || !repoName) {
    fail(`Invalid repository value: ${repo}`)
  }

  return `${owner}/${repoName}`
}

async function fetchJson(url, failureMessage) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'go-beast-install-from-release-archive',
    },
  })

  if (!response.ok) {
    fail(`${failureMessage}: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

async function resolveLatestReleaseArchive(repoSlug) {
  const apiUrl = process.env.GO_BEAST_RELEASE_LATEST_API_URL || `https://api.github.com/repos/${repoSlug}/releases/latest`
  const latest = await fetchJson(apiUrl, 'Failed to resolve latest release')
  const archiveUrl = latest.tarball_url
  const tagName = latest.tag_name

  if (!archiveUrl || !tagName) {
    fail('Latest release payload is missing tarball_url or tag_name')
  }

  return { archiveUrl, sourceLabel: safeSlug(tagName), tagName }
}

async function resolveReleaseList(repoSlug) {
  const apiUrl = process.env.GO_BEAST_RELEASES_API_URL || `https://api.github.com/repos/${repoSlug}/releases?per_page=20`
  const releases = await fetchJson(apiUrl, 'Failed to list releases')
  if (!Array.isArray(releases)) {
    fail('Release list payload is not an array')
  }

  return releases
    .filter(release => !release.draft && release.tag_name && release.tarball_url)
    .map(release => ({
      tagName: release.tag_name,
      archiveUrl: release.tarball_url,
      publishedAt: release.published_at || '',
    }))
}

function releaseToArchive(release) {
  return {
    archiveUrl: release.archiveUrl,
    sourceLabel: safeSlug(release.tagName),
  }
}

function ask(question) {
  process.stdout.write(question)

  const input = []
  const buffer = Buffer.alloc(1)

  while (true) {
    const bytesRead = fs.readSync(0, buffer, 0, 1, null)
    if (bytesRead === 0) break

    const char = buffer.toString('utf8', 0, bytesRead)
    if (char === '\n') break
    if (char !== '\r') input.push(char)
  }

  return input.join('')
}

async function promptForRelease(repoSlug) {
  const latest = await resolveLatestReleaseArchive(repoSlug)
  const releases = await resolveReleaseList(repoSlug)

  console.log('go-beast release installer')
  console.log('')
  console.log(`1) Install latest release (${latest.tagName})`)
  console.log('2) Choose a specific release')
  const mode = ask('Select an option [1]: ').trim()

  if (!mode || mode === '1') {
    return latest
  }
  if (mode !== '2') {
    fail(`Invalid option: ${mode}`)
  }

  console.log('')
  console.log('Available releases:')
  releases.forEach((release, index) => {
    const suffix = safeSlug(release.tagName) === latest.sourceLabel ? ' (latest)' : ''
    console.log(`${index + 1}) ${release.tagName}${suffix}`)
  })

  const selection = ask('Select a release: ').trim()
  const selectedIndex = Number(selection) - 1
  const selected = releases[selectedIndex]

  if (!selected) {
    fail(`Invalid release selection: ${selection}`)
  }

  return releaseToArchive(selected)
}

async function resolveRequestedRelease(args) {
  const repoSlug = normalizeRepoSlug(args.repo)

  if (args.release) {
    const releases = await resolveReleaseList(repoSlug)
    const selected = releases.find(release => release.tagName === args.release)
    if (!selected) {
      fail(`Release not found: ${args.release}`)
    }
    return releaseToArchive(selected)
  }

  if (args.latest || (!process.stdin.isTTY && process.env.GO_BEAST_FORCE_RELEASE_MENU !== '1')) {
    return resolveLatestReleaseArchive(repoSlug)
  }

  return promptForRelease(repoSlug)
}

function downloadArchive(url, destination) {
  return fetch(url).then(async response => {
    if (!response.ok) {
      fail(`Failed to download release archive: ${response.status} ${response.statusText}`)
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, bytes)
  })
}

function extractArchive(archivePath, targetDir) {
  const stagingDir = `${targetDir}.staging-${process.pid}-${Date.now()}`
  fs.rmSync(stagingDir, { recursive: true, force: true })
  fs.mkdirSync(stagingDir, { recursive: true })

  try {
    execFileSync('tar', ['-xzf', archivePath, '-C', stagingDir, '--strip-components=1'], {
      stdio: 'inherit',
    })
    if (!fs.existsSync(targetDir)) {
      fs.renameSync(stagingDir, targetDir)
      return
    }
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true })
    fail(`Failed to extract release archive with tar: ${error.message}`)
  }

  fs.rmSync(stagingDir, { recursive: true, force: true })
}

function readRepoNameFromPackageJson(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json')
  const raw = fs.readFileSync(packageJsonPath, 'utf8')
  const repository = JSON.parse(raw).repository?.url ?? ''
  return repository
}

function updateCurrentPointer(versionDir) {
  fs.mkdirSync(path.dirname(CURRENT_ROOT), { recursive: true })

  const tempLink = path.join(path.dirname(CURRENT_ROOT), `.current.tmp-${process.pid}-${Date.now()}`)
  fs.rmSync(tempLink, { recursive: true, force: true })
  fs.symlinkSync(versionDir, tempLink, 'dir')

  try {
    fs.renameSync(tempLink, CURRENT_ROOT)
  } catch (error) {
    fs.rmSync(CURRENT_ROOT, { recursive: true, force: true })
    fs.renameSync(tempLink, CURRENT_ROOT)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  let sourceLabel = ''

  let archivePath = args.archive
  let tempDir = ''

  if (args.archive) {
    sourceLabel = safeSlug(path.basename(args.archive))
  } else if (args.archiveUrl) {
    sourceLabel = safeSlug(path.basename(new URL(args.archiveUrl).pathname))
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-release-archive-'))
    archivePath = path.join(tempDir, `${sourceLabel}.tar.gz`)
    await downloadArchive(args.archiveUrl, archivePath)
  } else {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-release-archive-'))
    const selectedRelease = await resolveRequestedRelease(args)
    sourceLabel = selectedRelease.sourceLabel
    archivePath = path.join(tempDir, `${sourceLabel}.tar.gz`)
    await downloadArchive(selectedRelease.archiveUrl, archivePath)
  }

  if (!archivePath || !fs.existsSync(archivePath)) {
    fail(`Archive not found: ${archivePath}`)
  }

  const archiveHash = hashFile(archivePath)
  const versionDir = path.join(VERSION_ROOT, `${sourceLabel}-${archiveHash}`)

  if (!fs.existsSync(versionDir)) {
    extractArchive(archivePath, versionDir)
  }
  updateCurrentPointer(versionDir)

  const installerPath = path.join(INSTALL_ROOT, 'scripts', 'install.mjs')
  if (!fs.existsSync(installerPath)) {
    fail(`Extracted archive does not contain scripts/install.mjs: ${installerPath}`)
  }

  const child = spawnSync(process.execPath, [installerPath, ...args.passthrough], {
    stdio: 'inherit',
    env: {
      ...process.env,
      GO_BEAST_INSTALL_ROOT: INSTALL_ROOT,
      GO_BEAST_RELEASE_ARCHIVE_ROOT: INSTALL_ROOT,
      GO_BEAST_RELEASE_ARCHIVE_NAME: sourceLabel,
      GO_BEAST_RELEASE_SOURCE_REPOSITORY: readRepoNameFromPackageJson(versionDir),
    },
  })

  if (child.error) {
    fail(child.error.message)
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  if (child.status !== 0) {
    process.exit(child.status ?? 1)
  }
}

main().catch(error => {
  fail(error?.message || String(error))
})
