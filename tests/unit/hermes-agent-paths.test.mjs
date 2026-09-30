import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { resolveHermesHome } from '../../scripts/agent-paths.mjs'

test('Hermes home defaults to the platform data directory', () => {
  assert.equal(
    resolveHermesHome({ home: '/Users/example', env: {}, platform: 'darwin' }),
    '/Users/example/.hermes',
  )
  assert.equal(
    resolveHermesHome({ home: '/home/example', env: { LOCALAPPDATA: 'C:\\Users\\example\\AppData\\Local' }, platform: 'linux' }),
    '/home/example/.hermes',
  )
  assert.equal(
    resolveHermesHome({ home: 'C:\\Users\\example', env: { LOCALAPPDATA: 'C:\\Users\\example\\AppData\\Local' }, platform: 'win32' }),
    'C:\\Users\\example\\AppData\\Local\\hermes',
  )
})

test('Hermes home has a deterministic Windows fallback when LOCALAPPDATA is unset', () => {
  assert.equal(
    resolveHermesHome({ home: 'C:\\Users\\example', env: {}, platform: 'win32' }),
    'C:\\Users\\example\\AppData\\Local\\hermes',
  )
})

test('HERMES_HOME overrides platform defaults and relative overrides resolve from user home', () => {
  assert.equal(
    resolveHermesHome({ home: '/home/example', env: { HERMES_HOME: '/data/hermes-profile' }, platform: 'linux' }),
    '/data/hermes-profile',
  )
  assert.equal(
    resolveHermesHome({ home: 'C:\\Users\\example', env: { HERMES_HOME: 'HermesProfiles\\coder' }, platform: 'win32' }),
    path.win32.join('C:\\Users\\example', 'HermesProfiles', 'coder'),
  )
})
