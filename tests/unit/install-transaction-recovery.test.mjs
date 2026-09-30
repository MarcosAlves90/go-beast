import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createInstallTransaction, rollbackLastInstall } from '../../scripts/install-transaction.mjs'

function makeTransaction({ targetState }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-rollback-recovery-'))
  const home = path.join(tempRoot, 'metadata-home')
  const hermesHome = path.join(tempRoot, 'hermes-home')
  const target = path.join(hermesHome, 'skills', 'go-beast', 'owned')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'pre-install')

  const transaction = createInstallTransaction({
    home,
    targets: [target],
    allowedRoots: [hermesHome],
  })

  if (targetState === 'installed') {
    fs.rmSync(target, { recursive: true })
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, 'SKILL.md'), 'installed')
  } else {
    fs.rmSync(target, { recursive: true })
  }
  transaction.commit()

  const backupDirectory = path.join(transaction.root, 'backups')
  const preservedBackupDirectory = `${backupDirectory}-preserved`
  fs.renameSync(backupDirectory, preservedBackupDirectory)
  fs.mkdirSync(backupDirectory, { mode: 0o700 })

  return { tempRoot, home, hermesHome, target, transaction, preservedBackupDirectory }
}

function readTransactionRecord(transaction) {
  return JSON.parse(fs.readFileSync(transaction.recordPath, 'utf8'))
}

test('rollback records a failed restore and reports the retained installed copy', t => {
  const state = makeTransaction({ targetState: 'installed' })
  t.after(() => fs.rmSync(state.tempRoot, { recursive: true, force: true }))

  assert.ok(fs.existsSync(path.join(state.preservedBackupDirectory, state.transaction.snapshots[0].backup)))
  assert.throws(
    () => rollbackLastInstall({ home: state.home, allowedRoots: [state.hermesHome], id: state.transaction.id }),
    /install rollback failed/,
  )

  const record = readTransactionRecord(state.transaction)
  assert.equal(record.status, 'rollback_failed')
  assert.ok(record.rollback_errors?.length > 0)
  assert.ok(record.rollback_recovery_paths?.length > 0)
  const recovery = record.rollback_recovery_paths[0].path
  assert.equal(fs.readFileSync(path.join(recovery, 'SKILL.md'), 'utf8'), 'installed')
})

test('rollback does not claim success when restoring an absent target fails', t => {
  const state = makeTransaction({ targetState: 'absent' })
  t.after(() => fs.rmSync(state.tempRoot, { recursive: true, force: true }))

  assert.ok(fs.existsSync(path.join(state.preservedBackupDirectory, state.transaction.snapshots[0].backup)))
  assert.throws(
    () => rollbackLastInstall({ home: state.home, allowedRoots: [state.hermesHome], id: state.transaction.id }),
    /install rollback failed/,
  )

  const record = readTransactionRecord(state.transaction)
  assert.equal(record.status, 'rollback_failed')
  assert.ok(record.rollback_errors?.length > 0)
  assert.equal(fs.existsSync(state.target), false)
})

function makeTransactionWithoutInstalledState({ committed }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-rollback-missing-state-'))
  const home = path.join(tempRoot, 'metadata-home')
  const hermesHome = path.join(tempRoot, 'hermes-home')
  const target = path.join(hermesHome, 'skills', 'go-beast', 'owned')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'pre-install')

  const transaction = createInstallTransaction({ home, targets: [target], allowedRoots: [hermesHome] })
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'installed')
  if (committed) transaction.commit()

  const record = readTransactionRecord(transaction)
  assert.equal(record.schema_version, 1)
  assert.equal(record.status, committed ? 'committed' : 'pending')
  delete record.snapshots[0].installed_state
  fs.writeFileSync(transaction.recordPath, JSON.stringify(record, null, 2))
  return { tempRoot, home, hermesHome, target, transaction }
}

for (const { label, committed } of [
  { label: 'pending transaction', committed: false },
  { label: 'legacy schema-v1 transaction', committed: true },
]) {
  test(`rollback safely fails for ${label} without an installed-state fingerprint`, t => {
    const state = makeTransactionWithoutInstalledState({ committed })
    t.after(() => fs.rmSync(state.tempRoot, { recursive: true, force: true }))

    assert.throws(
      () => rollbackLastInstall({ home: state.home, allowedRoots: [state.hermesHome], id: state.transaction.id }),
      /install rollback failed: .*missing installed-state fingerprint/,
    )

    const record = readTransactionRecord(state.transaction)
    assert.equal(record.status, 'rollback_failed')
    assert.ok(record.rollback_errors.some(error => error.includes('missing installed-state fingerprint')))
    assert.deepEqual(record.rollback_preserved, [state.target])
    assert.equal(fs.readFileSync(path.join(state.target, 'SKILL.md'), 'utf8'), 'installed')
  })
}

test('persisted rollback fails closed for a malformed installed-state fingerprint', t => {
  const state = makeTransactionWithoutInstalledState({ committed: false })
  t.after(() => fs.rmSync(state.tempRoot, { recursive: true, force: true }))
  const record = readTransactionRecord(state.transaction)
  record.snapshots[0].installed_state = {}
  fs.writeFileSync(state.transaction.recordPath, JSON.stringify(record, null, 2))

  assert.throws(
    () => rollbackLastInstall({ home: state.home, allowedRoots: [state.hermesHome], id: state.transaction.id }),
    /install rollback failed: .*invalid installed-state fingerprint/,
  )

  const failedRecord = readTransactionRecord(state.transaction)
  assert.equal(failedRecord.status, 'rollback_failed')
  assert.ok(failedRecord.rollback_errors.some(error => error.includes('invalid installed-state fingerprint')))
  assert.deepEqual(failedRecord.rollback_preserved, [state.target])
  assert.equal(fs.readFileSync(path.join(state.target, 'SKILL.md'), 'utf8'), 'installed')
})

test('immediate rollback restores a pending snapshot when installed_state is absent', t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'go-beast-immediate-rollback-missing-state-'))
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))
  const home = path.join(tempRoot, 'metadata-home')
  const hermesHome = path.join(tempRoot, 'hermes-home')
  const target = path.join(hermesHome, 'skills', 'go-beast', 'owned')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'pre-install')
  const transaction = createInstallTransaction({ home, targets: [target], allowedRoots: [hermesHome] })
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'installed')

  const result = transaction.rollback()

  assert.equal(result.status, 'rolled_back')
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'pre-install')
  assert.equal(readTransactionRecord(transaction).status, 'rolled_back')
})
