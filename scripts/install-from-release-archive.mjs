#!/usr/bin/env node
// go-beast release-archive bootstrap installer
// Downloads or uses a local GitHub source archive, extracts it to a persistent
// cache under ~/.go-beast/source/, then runs the canonical installer from that
// extracted tree.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const HOME = os.homedir()
const CACHE_ROOT = path.join(HOME, '.go-beast', 'source')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv) {
  const args = {
    archive: '',
    archiveUrl: '',
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
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })

  try {
    execFileSync('tar', ['-xzf', archivePath, '-C', targetDir, '--strip-components=1'], {
      stdio: 'inherit',
    })
  } catch (error) {
    fail(`Failed to extract release archive with tar: ${error.message}`)
  }
}

function readRepoNameFromPackageJson(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json')
  const raw = fs.readFileSync(packageJsonPath, 'utf8')
  const repository = JSON.parse(raw).repository?.url ?? ''
  return repository
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.archive && !args.archiveUrl) {
    fail('Usage: node scripts/install-from-release-archive.mjs --archive <path> | --archive-url <url> [installer flags]')
  }

  const sourceLabel = args.archive
    ? safeSlug(path.basename(args.archive))
    : safeSlug(path.basename(new URL(args.archiveUrl).pathname))

  const installRoot = path.join(CACHE_ROOT, sourceLabel)
  const archivePath = args.archive || path.join(CACHE_ROOT, `${sourceLabel}.tar.gz`)

  if (args.archiveUrl) {
    await downloadArchive(args.archiveUrl, archivePath)
  } else if (!fs.existsSync(archivePath)) {
    fail(`Archive not found: ${archivePath}`)
  }

  extractArchive(archivePath, installRoot)

  const installerPath = path.join(installRoot, 'scripts', 'install.mjs')
  if (!fs.existsSync(installerPath)) {
    fail(`Extracted archive does not contain scripts/install.mjs: ${installerPath}`)
  }

  const child = spawnSync(process.execPath, [installerPath, ...args.passthrough], {
    stdio: 'inherit',
    env: {
      ...process.env,
      GO_BEAST_RELEASE_ARCHIVE_ROOT: installRoot,
      GO_BEAST_RELEASE_ARCHIVE_NAME: sourceLabel,
      GO_BEAST_RELEASE_SOURCE_REPOSITORY: readRepoNameFromPackageJson(installRoot),
    },
  })

  if (child.error) {
    fail(child.error.message)
  }
  if (child.status !== 0) {
    process.exit(child.status ?? 1)
  }
}

main().catch(error => {
  fail(error?.message || String(error))
})
