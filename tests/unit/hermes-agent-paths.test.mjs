import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { resolveHermesHome, resolveHermesProfileHome } from '../../scripts/agent-paths.mjs'

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

test('Hermes profile selection resolves default, named, active, and custom homes independently', () => {
  assert.equal(
    resolveHermesProfileHome({ home: '/Users/example', profile: 'default', env: {}, platform: 'darwin' }),
    '/Users/example/.hermes',
  )
  assert.equal(
    resolveHermesProfileHome({ home: '/home/example', profile: 'coder', env: {}, platform: 'linux' }),
    '/home/example/.hermes/profiles/coder',
  )
  assert.equal(
    resolveHermesProfileHome({
      home: '/home/example',
      profile: 'research',
      env: { HERMES_HOME: '/home/example/.hermes/profiles/coder' },
      platform: 'linux',
    }),
    '/home/example/.hermes/profiles/research',
  )
  assert.equal(
    resolveHermesProfileHome({
      home: '/home/example',
      profile: 'default',
      env: { HERMES_HOME: '/home/example/.hermes/profiles/coder' },
      platform: 'linux',
    }),
    '/home/example/.hermes',
  )
  assert.equal(
    resolveHermesProfileHome({
      home: '/Users/example',
      profile: 'coder',
      env: { HERMES_HOME: '/data/hermes-root' },
      platform: 'darwin',
    }),
    '/data/hermes-root/profiles/coder',
  )
  assert.equal(
    resolveHermesProfileHome({
      home: 'C:\\Users\\example',
      profile: 'coder',
      env: { LOCALAPPDATA: 'C:\\Users\\example\\AppData\\Local' },
      platform: 'win32',
    }),
    path.win32.join('C:\\Users\\example\\AppData\\Local', 'hermes', 'profiles', 'coder'),
  )
})

test('Hermes profile selection rejects path traversal and invalid names', () => {
  assert.throws(
    () => resolveHermesProfileHome({ home: '/home/example', profile: '../other', env: {}, platform: 'linux' }),
    /invalid Hermes profile name/,
  )
})
