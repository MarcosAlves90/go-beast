import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildRegistry, validateRegistry } from '../../scripts/capabilities.mjs'
import { checkTrace, normalizeTrace } from '../../scripts/conformance.mjs'
import { hashEvent, validateLedger } from '../../scripts/evidence.mjs'
import { resolveEffectiveProfile } from '../../scripts/profile-resolver.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('capability registry is deterministic and valid against canonical sources', () => {
  const first = buildRegistry(REPO_ROOT)
  const second = buildRegistry(REPO_ROOT)
  assert.deepEqual(first, second)
  assert.equal(validateRegistry(first, { repoRoot: REPO_ROOT, requireSources: true }).length, 0)
  assert.ok(first.capabilities.length >= 50)
})

test('profile resolver applies project precedence without mutating its inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-v2-unit-'))
  const home = path.join(root, 'home')
  const project = path.join(root, 'project')
  fs.mkdirSync(path.join(home, '.go-beast'), { recursive: true })
  fs.mkdirSync(path.join(project, '.go-beast'), { recursive: true })
  const globalProfile = {
    schemaVersion: 1,
    agents: { codex: { skills: { mode: 'all', disabled: ['go-bear'] }, hooks: { mode: 'all', disabled: [] } } },
    presets: {},
  }
  const projectProfile = {
    schemaVersion: 2,
    kind: 'go-beast-profile',
    agents: { codex: { skills: { mode: 'selected', enabled: ['go-hawk'] }, hooks: { mode: 'selected', enabled: ['go-beast-session-state.sh'] } } },
  }
  const globalPath = path.join(home, '.go-beast', 'config.json')
  const projectPath = path.join(project, '.go-beast', 'profile.json')
  fs.writeFileSync(globalPath, `${JSON.stringify(globalProfile, null, 2)}\n`)
  fs.writeFileSync(projectPath, `${JSON.stringify(projectProfile, null, 2)}\n`)
  const before = [fs.readFileSync(globalPath, 'utf8'), fs.readFileSync(projectPath, 'utf8')]

  try {
    const report = resolveEffectiveProfile({ home, repoRoot: REPO_ROOT, projectRoot: project, agentName: 'codex' })
    assert.equal(report.valid, true)
    assert.deepEqual(report.effective.skills, ['go-hawk'])
    assert.deepEqual(report.effective.hooks, ['go-beast-session-state.sh'])
    assert.equal(report.decisions.find(item => item.asset === 'go-hawk' && item.kind === 'skill')?.source, 'project')
    assert.equal(report.mutations.dry_run, true)
    assert.deepEqual([fs.readFileSync(globalPath, 'utf8'), fs.readFileSync(projectPath, 'utf8')], before)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('conformance normalization preserves v1 aliases and reports ordering violations', () => {
  const normalized = normalizeTrace({
    version: 1,
    harness: 'codex',
    events: [{ event: 'skill', phase: 'discovery', skill: 'go-hawk' }],
  })
  assert.equal(normalized.events[0].type, 'skill_invoked')
  assert.equal(normalized.events[0].phase, 'discover')

  const verdict = checkTrace({
    version: 1,
    kind: 'feature',
    events: [
      { type: 'implementation', status: 'completed' },
      { type: 'red', status: 'failed' },
    ],
  })
  assert.equal(verdict.passed, false)
  assert.ok(verdict.violations.includes('implementation evidence precedes red'))
})

test('evidence validation is pure and detects payload tampering', () => {
  const source = { harness: 'codex', adapter: 'go-beast-codex' }
  const event = {
    event_id: 'unit:1',
    sequence: 1,
    type: 'command',
    status: 'observed',
    task_id: 'unit',
    source,
    actor: { kind: 'tool', id: 'unit-test' },
    payload: { command: 'true' },
    provenance: {
      command: {
        argv: ['true'],
        cwd: '.',
        exit_code: 0,
        stdout_sha256: 'a'.repeat(64),
        stderr_sha256: 'a'.repeat(64),
      },
    },
    recorded_at: '2026-09-14T00:00:00.000Z',
    previous_hash: null,
  }
  event.event_hash = hashEvent(event)
  const ledger = { schema_version: 2, ledger_id: 'unit', task_id: 'unit', source, events: [event] }
  const snapshot = JSON.stringify(ledger)
  assert.deepEqual(validateLedger(ledger).errors, [])
  assert.equal(JSON.stringify(ledger), snapshot)

  const tampered = JSON.parse(snapshot)
  tampered.events[0].payload.command = 'false'
  assert.ok(validateLedger(tampered).errors.some(error => error.includes('event hash mismatch')))
})
