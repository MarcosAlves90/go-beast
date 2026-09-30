import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

function resolveHermesHome({ home = os.homedir(), env = process.env, platform = process.platform } = {}) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  const userHome = home || os.homedir()
  const override = typeof env.HERMES_HOME === 'string' ? env.HERMES_HOME.trim() : ''

  if (override) return paths.resolve(userHome, override)
  if (platform === 'win32') {
    const localAppData = typeof env.LOCALAPPDATA === 'string' && env.LOCALAPPDATA.trim()
      ? env.LOCALAPPDATA.trim()
      : paths.join(userHome, 'AppData', 'Local')
    return paths.join(localAppData, 'hermes')
  }
  return paths.join(userHome, '.hermes')
}

export { resolveHermesHome }
