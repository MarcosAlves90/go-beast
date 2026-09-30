#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const moduleDirectory = scriptDirectory
const outputDirectory = path.join(scriptDirectory, 'bin')
const targets = [
  { goos: 'darwin', goarch: 'arm64', platform: 'darwin', architecture: 'arm64' },
  { goos: 'darwin', goarch: 'amd64', platform: 'darwin', architecture: 'x64' },
  { goos: 'linux', goarch: 'arm64', platform: 'linux', architecture: 'arm64' },
  { goos: 'linux', goarch: 'amd64', platform: 'linux', architecture: 'x64' },
  { goos: 'windows', goarch: 'arm64', platform: 'win32', architecture: 'arm64' },
  { goos: 'windows', goarch: 'amd64', platform: 'win32', architecture: 'x64' },
]
const checkOnly = process.argv.slice(2).includes('--check')
const unknownArgs = process.argv.slice(2).filter(argument => argument !== '--check')
if (unknownArgs.length > 0) {
  process.stderr.write(`Unknown argument(s): ${unknownArgs.join(', ')}\n`)
  process.exit(2)
}

function requireGo125() {
  let version
  try {
    version = execFileSync('go', ['env', 'GOVERSION'], { encoding: 'utf8' }).trim()
  } catch (error) {
    throw new Error(`Go 1.25 or later is required: ${error.message}`)
  }
  const match = version.match(/^go(\d+)\.(\d+)/)
  if (!match || Number(match[1]) < 1 || (Number(match[1]) === 1 && Number(match[2]) < 25)) {
    throw new Error(`Go 1.25 or later is required (found ${version || 'unknown'})`)
  }
  return version
}

function binaryName(platform, architecture) {
  return `go-beast-safe-fs-${platform}-${architecture}${platform === 'win32' ? '.exe' : ''}`
}

function buildOne(goos, goarch, outputPath) {
  const environment = {
    ...process.env,
    GOOS: goos,
    GOARCH: goarch,
    CGO_ENABLED: '0',
    GOFLAGS: '-buildvcs=false',
  }
  execFileSync('go', [
    'build',
    '-trimpath',
    '-buildvcs=false',
    '-ldflags=-s -w -buildid=',
    '-o', outputPath,
    '.',
  ], { cwd: moduleDirectory, env: environment, stdio: 'inherit' })
}

let temporaryDirectory = null
try {
  const version = requireGo125()
  process.stdout.write(`Go ${version}; building ${targets.length} safe-fs targets${checkOnly ? ' for comparison' : ''}\n`)
  if (checkOnly) {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-safe-fs-check-'))
  } else {
    fs.mkdirSync(outputDirectory, { recursive: true })
  }

  const mismatches = []
  for (const target of targets) {
    const { goos, goarch, platform, architecture } = target
    const name = binaryName(platform, architecture)
    const outputPath = checkOnly ? path.join(temporaryDirectory, name) : path.join(outputDirectory, name)
    buildOne(goos, goarch, outputPath)
    if (checkOnly) {
      const bundledPath = path.join(outputDirectory, name)
      if (!fs.existsSync(bundledPath)) {
        mismatches.push(`${name}: bundled binary is missing`)
      } else if (!fs.readFileSync(outputPath).equals(fs.readFileSync(bundledPath))) {
        mismatches.push(`${name}: bundled binary differs from reproducible build`)
      } else {
        process.stdout.write(`verified ${name}\n`)
      }
    } else {
      fs.chmodSync(outputPath, 0o755)
      process.stdout.write(`built ${path.relative(moduleDirectory, outputPath)}\n`)
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`binary verification failed:\n${mismatches.map(item => `- ${item}`).join('\n')}`)
  }
  process.stdout.write(checkOnly ? 'all bundled binaries match\n' : 'all targets built\n')
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
} finally {
  if (temporaryDirectory) {
    try {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true })
    } catch (error) {
      process.stderr.write(`warning: could not remove check directory ${temporaryDirectory}: ${error.message}\n`)
    }
  }
}
