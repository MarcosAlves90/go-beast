import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const HERMES_PROFILE_NAME = /^[A-Za-z0-9_-]+$/

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

function resolveHermesProfileHome({ home = os.homedir(), env = process.env, platform = process.platform, profile = null } = {}) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  if (profile === null || profile === undefined || profile === '') {
    return resolveHermesHome({ home, env, platform })
  }
  if (profile !== 'default' && !HERMES_PROFILE_NAME.test(profile)) {
    throw new Error(`invalid Hermes profile name: ${profile}`)
  }

  const configuredHome = resolveHermesHome({ home, env, platform })
  const parent = paths.dirname(configuredHome)
  const baseHome = paths.basename(parent).toLowerCase() === 'profiles'
    ? paths.dirname(parent)
    : configuredHome
  if (profile === 'default') return paths.resolve(baseHome)
  return paths.join(baseHome, 'profiles', profile)
}

export { resolveHermesHome, resolveHermesProfileHome }
