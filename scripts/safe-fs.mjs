import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HELPER_DIRECTORY = path.join(REPO_ROOT, 'scripts', 'safe-fs', 'bin')
const ARCHITECTURES = new Set(['x64', 'arm64'])
const PLATFORMS = new Set(['darwin', 'linux', 'win32'])

function relativePathWithinRoot(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Hermes filesystem target is outside its root: ${target}`)
  }
  return relative.split(path.sep).join('/')
}

function helperPath({ platform = process.platform, architecture = process.arch } = {}) {
  if (!PLATFORMS.has(platform) || !ARCHITECTURES.has(architecture)) {
    throw new Error(`Hermes safe filesystem helper does not support ${platform}/${architecture}`)
  }
  const extension = platform === 'win32' ? '.exe' : ''
  return path.join(HELPER_DIRECTORY, `go-beast-safe-fs-${platform}-${architecture}${extension}`)
}

function runSafeFs(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Hermes safe filesystem request must be an object')
  }

  const binary = helperPath()
  if (!fs.existsSync(binary)) {
    throw new Error(`Hermes safe filesystem helper is missing for ${process.platform}/${process.arch}: ${binary}`)
  }
  const result = childProcess.spawnSync(binary, [], {
    input: `${JSON.stringify(request)}\n`,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 60_000,
  })
  if (result.error) throw new Error(`Hermes safe filesystem helper could not run: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').trim()
    throw new Error(`Hermes safe filesystem operation failed${detail ? `: ${detail}` : ` (exit ${result.status})`}`)
  }

  let response
  try {
    response = JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`Hermes safe filesystem helper returned invalid JSON: ${error.message}`)
  }
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('Hermes safe filesystem helper returned an invalid response')
  }
  return response
}

export { helperPath, relativePathWithinRoot, runSafeFs }
