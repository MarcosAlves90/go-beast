#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TRANSACTION_SCHEMA_VERSION = 1
const INTEGRITY_SCHEMA_VERSION = 1

function isWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function writeJsonAtomic(filePath, value) {
  const target = path.resolve(filePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporaryDirectory = fs.mkdtempSync(path.join(path.dirname(target), `.${path.basename(target)}-`))
  const temporaryPath = path.join(temporaryDirectory, path.basename(target))
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temporaryPath, target)
  } finally {
    try { fs.rmSync(temporaryDirectory, { recursive: true, force: true }) } catch {}
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`)
  }
}

function removeTarget(target) {
  let stat
  try { stat = fs.lstatSync(target) } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  if (stat.isDirectory() && !stat.isSymbolicLink()) throw new Error(`refusing to remove directory target: ${target}`)
  fs.unlinkSync(target)
}

function snapshotTarget(target, backupDirectory, index) {
  try {
    const stat = fs.lstatSync(target)
    if (stat.isSymbolicLink()) return { target, state: 'symlink', link: fs.readlinkSync(target), mode: stat.mode & 0o7777 }
    if (stat.isFile()) {
      const backup = `file-${index}.bak`
      fs.copyFileSync(target, path.join(backupDirectory, backup))
      return { target, state: 'file', backup, mode: stat.mode & 0o7777 }
    }
    if (stat.isDirectory()) return { target, state: 'directory', mode: stat.mode & 0o7777 }
    return { target, state: 'other', mode: stat.mode & 0o7777 }
  } catch (error) {
    if (error?.code === 'ENOENT') return { target, state: 'absent' }
    throw error
  }
}

function restoreSnapshot(snapshot, backupDirectory) {
  if (snapshot.state === 'directory') {
    let current
    try { current = fs.lstatSync(snapshot.target) } catch (error) {
      if (error?.code === 'ENOENT') {
        fs.mkdirSync(snapshot.target, { recursive: false, mode: snapshot.mode })
        return
      }
      throw error
    }
    if (!current.isDirectory() || current.isSymbolicLink()) throw new Error(`cannot restore directory target: ${snapshot.target}`)
    fs.chmodSync(snapshot.target, snapshot.mode)
    return
  }

  removeTarget(snapshot.target)
  if (snapshot.state === 'absent') return
  fs.mkdirSync(path.dirname(snapshot.target), { recursive: true })
  if (snapshot.state === 'symlink') fs.symlinkSync(snapshot.link, snapshot.target)
  else if (snapshot.state === 'file') {
    fs.copyFileSync(path.join(backupDirectory, snapshot.backup), snapshot.target)
    fs.chmodSync(snapshot.target, snapshot.mode)
  } else throw new Error(`unsupported snapshot state: ${snapshot.state}`)
}

function recordPathFor(home, id) {
  return path.join(path.resolve(home), '.go-beast', 'install-transactions', id, 'transaction.json')
}

function transactionId() {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
}

function createInstallTransaction({ home = os.homedir(), targets = [], metadata = {} } = {}) {
  const resolvedHome = path.resolve(home)
  const id = transactionId()
  const root = path.join(resolvedHome, '.go-beast', 'install-transactions', id)
  const backupDirectory = path.join(root, 'backups')
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 })
  const uniqueTargets = [...new Set(targets.map(target => path.resolve(target)))]
  for (const target of uniqueTargets) {
    if (!isWithin(resolvedHome, target)) throw new Error(`transaction target is outside home: ${target}`)
  }
  const snapshots = uniqueTargets.map((target, index) => snapshotTarget(target, backupDirectory, index))
  const record = {
    schema_version: TRANSACTION_SCHEMA_VERSION,
    id,
    status: 'pending',
    home: resolvedHome,
    created_at: new Date().toISOString(),
    metadata,
    snapshots,
  }
  const recordPath = path.join(root, 'transaction.json')
  writeJsonAtomic(recordPath, record)

  const rollback = () => {
    const failures = []
    for (const snapshot of [...snapshots].reverse()) {
      try { restoreSnapshot(snapshot, backupDirectory) } catch (error) { failures.push(error.message) }
    }
    record.status = failures.length ? 'rollback_failed' : 'rolled_back'
    record.rolled_back_at = new Date().toISOString()
    if (failures.length) record.rollback_errors = failures
    writeJsonAtomic(recordPath, record)
    if (failures.length) throw new Error(`install rollback failed: ${failures.join('; ')}`)
    return { id, status: record.status, restored: snapshots.length }
  }

  const commit = (commitMetadata = {}) => {
    record.status = 'committed'
    record.committed_at = new Date().toISOString()
    record.metadata = { ...record.metadata, ...commitMetadata }
    writeJsonAtomic(recordPath, record)
    return { id, status: record.status, recordPath, snapshots: snapshots.length }
  }

  return { id, root, recordPath, snapshots, rollback, commit }
}

function sourceDigest(source) {
  const stat = fs.lstatSync(source)
  if (stat.isSymbolicLink()) {
    const link = fs.readlinkSync(source)
    return { sha256: crypto.createHash('sha256').update(`symlink:${link}`).digest('hex'), size: Buffer.byteLength(link), files: 1 }
  }
  if (stat.isFile()) {
    const content = fs.readFileSync(source)
    return { sha256: crypto.createHash('sha256').update(content).digest('hex'), size: content.length, files: 1 }
  }
  if (!stat.isDirectory()) throw new Error(`unsupported integrity source type: ${source}`)

  const entries = []
  let totalSize = 0
  const visit = (current, relative) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(current, entry.name)
      const entryRelative = path.join(relative, entry.name).split(path.sep).join('/')
      const entryStat = fs.lstatSync(entryPath)
      if (entryStat.isDirectory() && !entryStat.isSymbolicLink()) {
        visit(entryPath, entryRelative)
        continue
      }
      if (entryStat.isSymbolicLink()) {
        const link = fs.readlinkSync(entryPath)
        const digest = crypto.createHash('sha256').update(`symlink:${link}`).digest('hex')
        entries.push(`${entryRelative}\0symlink\0${digest}\n`)
        totalSize += Buffer.byteLength(link)
        continue
      }
      if (!entryStat.isFile()) throw new Error(`unsupported integrity source entry: ${entryPath}`)
      const content = fs.readFileSync(entryPath)
      const digest = crypto.createHash('sha256').update(content).digest('hex')
      entries.push(`${entryRelative}\0file\0${digest}\n`)
      totalSize += content.length
    }
  }
  visit(source, '')
  return {
    sha256: crypto.createHash('sha256').update(entries.join('')).digest('hex'),
    size: totalSize,
    files: entries.length,
  }
}

function buildIntegrityManifest({ repoRoot, assets = [], packageVersion = null, transactionId = null } = {}) {
  const unique = new Map()
  for (const asset of assets) {
    const source = path.resolve(asset.source)
    const key = `${asset.agent ?? ''}:${asset.kind}:${asset.name}:${source}`
    if (unique.has(key)) continue
    const digest = sourceDigest(source)
    unique.set(key, {
      agent: asset.agent ?? null,
      kind: asset.kind,
      name: asset.name,
      source,
      ...digest,
    })
  }
  return {
    schema_version: INTEGRITY_SCHEMA_VERSION,
    repository: path.resolve(repoRoot),
    package_version: packageVersion,
    generated_at: new Date().toISOString(),
    transaction_id: transactionId,
    assets: [...unique.values()].sort((left, right) => `${left.kind}:${left.name}:${left.agent ?? ''}`.localeCompare(`${right.kind}:${right.name}:${right.agent ?? ''}`)),
  }
}

function writeIntegrityManifest(filePath, manifest) {
  writeJsonAtomic(filePath, manifest)
  return path.resolve(filePath)
}

function verifyIntegrityManifest({ manifestPath, repoRoot } = {}) {
  const manifest = readJson(manifestPath, 'integrity manifest')
  if (manifest.schema_version !== INTEGRITY_SCHEMA_VERSION) throw new Error(`unsupported integrity manifest version: ${manifest.schema_version ?? 'missing'}`)
  if (path.resolve(manifest.repository) !== path.resolve(repoRoot)) throw new Error('integrity manifest repository differs from current source root')
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) throw new Error('integrity manifest has no assets')
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.source !== 'string') throw new Error('integrity manifest contains an invalid asset')
    let digest
    try { digest = sourceDigest(asset.source) } catch (error) { throw new Error(`integrity mismatch for ${asset.source}: ${error.message}`) }
    if (digest.sha256 !== asset.sha256 || digest.size !== asset.size || digest.files !== asset.files) {
      throw new Error(`integrity mismatch for ${asset.source}`)
    }
  }
  return { valid: true, manifest: path.resolve(manifestPath), assets: manifest.assets.length }
}

function targetInfo(target, action = 'mutate') {
  const resolved = path.resolve(target)
  let state = 'missing'
  let mode = null
  try {
    const stat = fs.lstatSync(resolved)
    state = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'file'
    mode = (stat.mode & 0o7777).toString(8)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  let parentMode = null
  try { parentMode = (fs.statSync(path.dirname(resolved)).mode & 0o7777).toString(8) } catch {}
  return { target: resolved, action, state, mode, parent_mode: parentMode }
}

function buildPermissionPreview({ home = os.homedir(), targets = [] } = {}) {
  const entries = targets.map(item => typeof item === 'string' ? { target: item, action: 'mutate' } : item)
  const unique = new Map(entries.map(item => [path.resolve(item.target), item.action ?? 'mutate']))
  return {
    schema_version: 1,
    home: path.resolve(home),
    targets: [...unique.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([target, action]) => targetInfo(target, action)),
  }
}

function readTransaction(recordPath, home) {
  const record = readJson(recordPath, 'transaction record')
  if (record.schema_version !== TRANSACTION_SCHEMA_VERSION || !record.id || !Array.isArray(record.snapshots)) throw new Error(`invalid transaction record: ${recordPath}`)
  if (path.resolve(record.home) !== path.resolve(home)) throw new Error('transaction belongs to a different home')
  const root = path.dirname(recordPath)
  const backupDirectory = path.join(root, 'backups')
  if (!isWithin(path.join(path.dirname(root), '..'), root)) throw new Error('unsafe transaction path')
  for (const snapshot of record.snapshots) {
    if (!isWithin(record.home, snapshot.target)) throw new Error(`unsafe rollback target: ${snapshot.target}`)
    if (snapshot.backup && !isWithin(root, path.join(root, snapshot.backup))) throw new Error(`unsafe rollback backup: ${snapshot.backup}`)
  }
  return { record, recordPath, root, backupDirectory }
}

function rollbackLastInstall({ home = os.homedir(), id = null } = {}) {
  const root = path.join(path.resolve(home), '.go-beast', 'install-transactions')
  if (!fs.existsSync(root)) throw new Error('no install transaction is available')
  const records = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const recordPath = path.join(root, entry.name, 'transaction.json')
    if (!fs.existsSync(recordPath)) continue
    const transaction = readTransaction(recordPath, home)
    if (id && transaction.record.id !== id) continue
    if (['pending', 'committed'].includes(transaction.record.status)) records.push(transaction)
  }
  records.sort((left, right) => String(right.record.created_at).localeCompare(String(left.record.created_at)))
  const selected = records[0]
  if (!selected) throw new Error(id ? `install transaction not found: ${id}` : 'no reversible install transaction is available')
  const failures = []
  for (const snapshot of [...selected.record.snapshots].reverse()) {
    try { restoreSnapshot(snapshot, selected.backupDirectory) } catch (error) { failures.push(error.message) }
  }
  selected.record.status = failures.length ? 'rollback_failed' : 'rolled_back'
  selected.record.rolled_back_at = new Date().toISOString()
  if (failures.length) selected.record.rollback_errors = failures
  writeJsonAtomic(selected.recordPath, selected.record)
  if (failures.length) throw new Error(`install rollback failed: ${failures.join('; ')}`)
  return { id: selected.record.id, status: selected.record.status, restored: selected.record.snapshots.length }
}

export {
  buildIntegrityManifest,
  buildPermissionPreview,
  createInstallTransaction,
  rollbackLastInstall,
  verifyIntegrityManifest,
  writeIntegrityManifest,
}
