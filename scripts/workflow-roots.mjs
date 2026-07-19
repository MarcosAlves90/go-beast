import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function hasWorkflowDirectory(root) {
  return fs.existsSync(path.join(root, 'workflows')) && fs.statSync(path.join(root, 'workflows')).isDirectory()
}

export function resolveProjectRoot({ cwd = process.cwd(), explicitRoot = null } = {}) {
  if (explicitRoot) {
    const projectRoot = path.resolve(cwd, explicitRoot)
    if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
      throw new Error(`project root does not exist or is not a directory: ${projectRoot}`)
    }
    return projectRoot
  }

  let current = path.resolve(cwd)
  while (true) {
    if (hasWorkflowDirectory(current)) return current
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return path.resolve(cwd)
}

export function resolveWorkflowRoots({ cwd = process.cwd(), explicitRoot = null } = {}) {
  return {
    packageRoot: PACKAGE_ROOT,
    projectRoot: resolveProjectRoot({ cwd, explicitRoot }),
  }
}
