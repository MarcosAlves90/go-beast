#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { relativePathWithinRoot, runSafeFs } from './safe-fs.mjs'

const TRANSACTION_SCHEMA_VERSION = 1
const INTEGRITY_SCHEMA_VERSION = 1

function isWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function mostSpecificRoot(roots, target) {
  return roots
    .map(root => path.resolve(root))
    .filter(root => isWithin(root, target))
    .sort((left, right) => right.length - left.length)[0] ?? null
}

function assertNoSymlinkedAncestors(root, target) {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedRoot, resolvedTarget)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`transaction target is outside allowed root: ${resolvedTarget}`)
  }

  let current = resolvedRoot
  for (const component of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, component)
    let stat
    try { stat = fs.lstatSync(current) } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    if (stat.isSymbolicLink()) throw new Error(`refusing transaction target through symlinked ancestor: ${current}`)
    if (!stat.isDirectory()) throw new Error(`transaction target ancestor is not a directory: ${current}`)
  }
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

function targetExists(target) {
  try {
    fs.lstatSync(target)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function snapshotTarget(target, backupDirectory, index, allowedRoots = []) {
  const allowedRoot = mostSpecificRoot(allowedRoots, target)
  if (allowedRoot) {
    assertNoSymlinkedAncestors(allowedRoot, target)
    const backupPath = path.join(backupDirectory, `hermes-${index}.bak`)
    const result = runSafeFs({
      operation: 'snapshot',
      root: allowedRoot,
      path: relativePathWithinRoot(allowedRoot, target),
      backup_path: backupPath,
    })
    if (!result.snapshot || typeof result.snapshot.state !== 'string') {
      throw new Error(`Hermes filesystem helper returned an invalid snapshot for ${target}`)
    }
    return { target, ...result.snapshot }
  }
  try {
    const stat = fs.lstatSync(target)
    if (stat.isSymbolicLink()) return { target, state: 'symlink', link: fs.readlinkSync(target), mode: stat.mode & 0o7777 }
    if (stat.isFile()) {
      const backup = `file-${index}.bak`
      fs.copyFileSync(target, path.join(backupDirectory, backup))
      return { target, state: 'file', backup, mode: stat.mode & 0o7777 }
    }
    if (stat.isDirectory()) {
      const backup = `directory-${index}.bak`
      fs.cpSync(target, path.join(backupDirectory, backup), { recursive: true, verbatimSymlinks: true })
      return { target, state: 'directory', backup, mode: stat.mode & 0o7777 }
    }
    return { target, state: 'other', mode: stat.mode & 0o7777 }
  } catch (error) {
    if (error?.code === 'ENOENT') return { target, state: 'absent' }
    throw error
  }
}

function restoreSnapshotState(snapshot, backupDirectory, targetMustBeAbsent = false) {
  if (snapshot.state === 'directory') {
    if (!snapshot.backup) {
      let current
      try { current = fs.lstatSync(snapshot.target) } catch (error) {
        if (error?.code === 'ENOENT') {
          fs.mkdirSync(snapshot.target, { recursive: false, mode: snapshot.mode })
          return
        }
        throw error
      }
      if (targetMustBeAbsent && current) throw new Error(`cannot restore over changed target: ${snapshot.target}`)
      if (!current.isDirectory() || current.isSymbolicLink()) throw new Error(`cannot restore directory target: ${snapshot.target}`)
      fs.chmodSync(snapshot.target, snapshot.mode)
      return
    }

    let current
    try { current = fs.lstatSync(snapshot.target) } catch (error) {
      if (error?.code === 'ENOENT') current = null
      else throw error
    }
    if (current && (!current.isDirectory() || current.isSymbolicLink())) {
      throw new Error(`cannot restore directory target: ${snapshot.target}`)
    }
    if (targetMustBeAbsent && current) throw new Error(`cannot restore over changed target: ${snapshot.target}`)
    if (current) fs.rmSync(snapshot.target, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(snapshot.target), { recursive: true })
    try {
      fs.cpSync(path.join(backupDirectory, snapshot.backup), snapshot.target, { recursive: true, verbatimSymlinks: true })
      fs.chmodSync(snapshot.target, snapshot.mode)
    } catch (error) {
      throw new Error(`cannot restore directory target ${snapshot.target}: ${error.message}`)
    }
    return
  }

  if (snapshot.state === 'absent') {
    let current
    try { current = fs.lstatSync(snapshot.target) } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    if (targetMustBeAbsent && current) throw new Error(`cannot restore absent target over changed path: ${snapshot.target}`)
    if (current.isDirectory() && !current.isSymbolicLink()) {
      fs.rmSync(snapshot.target, { recursive: true, force: true })
      return
    }
    removeTarget(snapshot.target)
    return
  }

  if (targetMustBeAbsent && targetExists(snapshot.target)) {
    throw new Error(`cannot restore over changed target: ${snapshot.target}`)
  }
  removeTarget(snapshot.target)
  fs.mkdirSync(path.dirname(snapshot.target), { recursive: true })
  if (snapshot.state === 'symlink') fs.symlinkSync(snapshot.link, snapshot.target)
  else if (snapshot.state === 'file') {
    fs.copyFileSync(path.join(backupDirectory, snapshot.backup), snapshot.target)
    fs.chmodSync(snapshot.target, snapshot.mode)
  } else throw new Error(`unsupported snapshot state: ${snapshot.state}`)
}

function helperRecoveryPaths(result, allowedRoot) {
  const relativePaths = [
    ...(Array.isArray(result.recovery_paths) ? result.recovery_paths : []),
    ...(result.recovery_path ? [result.recovery_path] : []),
  ]
  return [...new Set(relativePaths)].map(relative => {
    if (typeof relative !== 'string' || path.isAbsolute(relative)) {
      throw new Error('Hermes filesystem helper returned an invalid recovery path')
    }
    const resolved = path.resolve(allowedRoot, relative)
    if (!isWithin(allowedRoot, resolved) || resolved === path.resolve(allowedRoot)) {
      throw new Error('Hermes filesystem helper returned a recovery path outside the Hermes root')
    }
    return resolved
  })
}

function appendRollbackRecoveryPaths(destination, target, paths = []) {
  for (const recoveryPath of paths) destination.push({ target, path: recoveryPath })
}

function restoreSnapshot(snapshot, backupDirectory, expectedInstalledState = null, allowedRoot = null) {
  if (allowedRoot) {
    assertNoSymlinkedAncestors(allowedRoot, snapshot.target)
    const result = runSafeFs({
      operation: 'restore',
      root: allowedRoot,
      path: relativePathWithinRoot(allowedRoot, snapshot.target),
      backup_path: backupDirectory,
      snapshot: {
        state: snapshot.state,
        ...(snapshot.mode === undefined ? {} : { mode: snapshot.mode }),
        ...(snapshot.link === undefined ? {} : { link: snapshot.link }),
        ...(snapshot.backup === undefined ? {} : { backup: snapshot.backup }),
      },
      ...(expectedInstalledState ? { expected_state: expectedInstalledState } : {}),
    })
    const recoveryPaths = helperRecoveryPaths(result, allowedRoot)
    if (result.status === 'failed') {
      const error = new Error(`Hermes filesystem helper failed to restore ${snapshot.target}${result.error ? `: ${result.error}` : ''}`)
      error.recovery_paths = recoveryPaths
      throw error
    }
    if (result.status !== 'restored' && result.status !== 'preserved') {
      const error = new Error(`Hermes filesystem helper returned an invalid restore status for ${snapshot.target}`)
      error.recovery_paths = recoveryPaths
      throw error
    }
    return {
      preserved: result.status === 'preserved',
      recovery_paths: recoveryPaths,
      ...(recoveryPaths.length ? { recovery_path: recoveryPaths[0] } : {}),
    }
  }
  if (!expectedInstalledState) {
    restoreSnapshotState(snapshot, backupDirectory)
    return { preserved: false }
  }

  if (allowedRoot) assertNoSymlinkedAncestors(allowedRoot, snapshot.target)
  const currentState = targetFingerprint(snapshot.target)
  if (JSON.stringify(currentState) !== JSON.stringify(expectedInstalledState)) {
    return { preserved: true }
  }
  if (currentState.state === 'absent') {
    restoreSnapshotState(snapshot, backupDirectory, true)
    return { preserved: false }
  }

  const parent = path.dirname(snapshot.target)
  const temporaryDirectory = fs.mkdtempSync(path.join(parent, `.${path.basename(snapshot.target)}-rollback-`))
  const quarantined = path.join(temporaryDirectory, 'current')
  let movedCurrent = false
  let preserveTemporaryDirectory = false
  try {
    if (allowedRoot) assertNoSymlinkedAncestors(allowedRoot, snapshot.target)
    if (JSON.stringify(targetFingerprint(snapshot.target)) !== JSON.stringify(expectedInstalledState)) {
      return { preserved: true }
    }

    fs.renameSync(snapshot.target, quarantined)
    movedCurrent = true
    if (allowedRoot) assertNoSymlinkedAncestors(allowedRoot, snapshot.target)
    if (JSON.stringify(targetFingerprint(quarantined)) !== JSON.stringify(expectedInstalledState)) {
      if (targetExists(snapshot.target)) {
        preserveTemporaryDirectory = true
        throw new Error(`target changed during rollback; concurrent copy retained at ${quarantined}`)
      }
      fs.renameSync(quarantined, snapshot.target)
      movedCurrent = false
      return { preserved: true }
    }

    if (targetExists(snapshot.target)) throw new Error(`target appeared during rollback: ${snapshot.target}`)
    restoreSnapshotState(snapshot, backupDirectory, true)

    if (JSON.stringify(targetFingerprint(quarantined)) !== JSON.stringify(expectedInstalledState)) {
      preserveTemporaryDirectory = true
      throw new Error(`target changed during rollback; concurrent copy retained at ${quarantined}`)
    }
    fs.rmSync(quarantined, { recursive: true, force: false })
    movedCurrent = false
    return { preserved: false }
  } catch (error) {
    if (movedCurrent && !targetExists(snapshot.target)) {
      try {
        if (allowedRoot) assertNoSymlinkedAncestors(allowedRoot, snapshot.target)
        fs.renameSync(quarantined, snapshot.target)
        movedCurrent = false
      } catch (restoreError) {
        preserveTemporaryDirectory = true
        throw new Error(`${error.message}; failed to restore current target; backup retained at ${quarantined}: ${restoreError.message}`)
      }
    } else if (movedCurrent) {
      preserveTemporaryDirectory = true
      throw new Error(`${error.message}; current target retained at ${quarantined}`)
    }
    throw error
  } finally {
    if (!preserveTemporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

function recordPathFor(home, id) {
  return path.join(path.resolve(home), '.go-beast', 'install-transactions', id, 'transaction.json')
}

function transactionId() {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
}

function targetFingerprint(target, allowedRoot = null) {
  if (allowedRoot) {
    const fingerprint = runSafeFs({
      operation: 'fingerprint',
      root: allowedRoot,
      path: relativePathWithinRoot(allowedRoot, target),
    })
    return {
      state: fingerprint.state,
      ...(fingerprint.mode === undefined ? {} : { mode: fingerprint.mode }),
      ...(fingerprint.sha256 === undefined ? {} : { sha256: fingerprint.sha256 }),
    }
  }
  let rootStat
  try { rootStat = fs.lstatSync(target) } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'absent' }
    throw error
  }
  const rootState = rootStat.isSymbolicLink() ? 'symlink' : rootStat.isDirectory() ? 'directory' : rootStat.isFile() ? 'file' : 'other'
  const digest = crypto.createHash('sha256')
  const visit = (current, relative) => {
    const stat = fs.lstatSync(current)
    const name = relative || '.'
    const mode = (stat.mode & 0o7777).toString(8)
    if (stat.isSymbolicLink()) {
      digest.update(`${name}\0symlink\0${mode}\0${fs.readlinkSync(current)}\n`)
    } else if (stat.isDirectory()) {
      digest.update(`${name}\0directory\0${mode}\n`)
      for (const entry of fs.readdirSync(current).sort((left, right) => left.localeCompare(right))) {
        const childRelative = relative ? `${relative}/${entry}` : entry
        visit(path.join(current, entry), childRelative)
      }
    } else if (stat.isFile()) {
      digest.update(`${name}\0file\0${mode}\0`)
      digest.update(fs.readFileSync(current))
      digest.update('\n')
    } else {
      digest.update(`${name}\0other\0${mode}\n`)
    }
  }
  visit(target, '')
  return { state: rootState, mode: rootStat.mode & 0o7777, sha256: digest.digest('hex') }
}

function matchesInstalledFingerprint(snapshot, { allowMissing = false, allowedRoot = null } = {}) {
  if (!snapshot.installed_state) return allowMissing
  return JSON.stringify(targetFingerprint(snapshot.target, allowedRoot)) === JSON.stringify(snapshot.installed_state)
}

function isValidInstalledFingerprint(fingerprint) {
  if (!fingerprint || typeof fingerprint !== 'object' || Array.isArray(fingerprint)) return false
  const keys = Object.keys(fingerprint).sort()
  if (fingerprint.state === 'absent') return keys.length === 1 && keys[0] === 'state'
  if (!['directory', 'file', 'other', 'symlink'].includes(fingerprint.state)) return false
  return keys.length === 3
    && keys[0] === 'mode'
    && keys[1] === 'sha256'
    && keys[2] === 'state'
    && Number.isInteger(fingerprint.mode)
    && fingerprint.mode >= 0
    && fingerprint.mode <= 0o7777
    && typeof fingerprint.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(fingerprint.sha256)
}

function createInstallTransaction({ home = os.homedir(), targets = [], allowedRoots = [], metadata = {} } = {}) {
  const resolvedHome = path.resolve(home)
  const explicitRoots = [...new Set(allowedRoots.map(root => path.resolve(root)))]
  const roots = [...new Set([resolvedHome, ...explicitRoots])]
  const uniqueTargets = [...new Set(targets.map(target => path.resolve(target)))]
  for (const target of uniqueTargets) {
    if (!roots.some(allowedRoot => isWithin(allowedRoot, target))) {
      throw new Error(`transaction target is outside allowed roots: ${target}`)
    }
    const explicitRoot = mostSpecificRoot(explicitRoots, target)
    if (explicitRoot) assertNoSymlinkedAncestors(explicitRoot, target)
  }
  const id = transactionId()
  const root = path.join(resolvedHome, '.go-beast', 'install-transactions', id)
  const backupDirectory = path.join(root, 'backups')
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 })
  const snapshots = uniqueTargets.map((target, index) => snapshotTarget(target, backupDirectory, index, explicitRoots))
  const record = {
    schema_version: TRANSACTION_SCHEMA_VERSION,
    id,
    status: 'pending',
    home: resolvedHome,
    allowed_roots: roots,
    created_at: new Date().toISOString(),
    metadata,
    snapshots,
  }
  const recordPath = path.join(root, 'transaction.json')
  writeJsonAtomic(recordPath, record)

  const rollback = () => {
    const failures = []
    const preserved = []
    const recoveryPaths = []
    let restored = 0
    for (const snapshot of [...snapshots].reverse()) {
      try {
        const explicitRoot = mostSpecificRoot(explicitRoots, snapshot.target)
        if (explicitRoot) assertNoSymlinkedAncestors(explicitRoot, snapshot.target)
        if (!matchesInstalledFingerprint(snapshot, { allowMissing: true, allowedRoot: explicitRoot })) {
          preserved.push(snapshot.target)
          continue
        }
        const result = restoreSnapshot(snapshot, backupDirectory, snapshot.installed_state, explicitRoot)
        if (result.preserved) preserved.push(snapshot.target)
        else restored++
        appendRollbackRecoveryPaths(recoveryPaths, snapshot.target, result.recovery_paths ?? (result.recovery_path ? [result.recovery_path] : []))
      } catch (error) {
        failures.push(error.message)
        appendRollbackRecoveryPaths(recoveryPaths, snapshot.target, error.recovery_paths ?? [])
      }
    }
    record.status = failures.length ? 'rollback_failed' : 'rolled_back'
    record.rolled_back_at = new Date().toISOString()
    if (failures.length) record.rollback_errors = failures
    if (preserved.length) record.rollback_preserved = preserved
    if (recoveryPaths.length) record.rollback_recovery_paths = recoveryPaths
    writeJsonAtomic(recordPath, record)
    if (failures.length) throw new Error(`install rollback failed: ${failures.join('; ')}`)
    return { id, status: record.status, restored, preserved, recoveryPaths }
  }

  const commit = (commitMetadata = {}) => {
    for (const snapshot of snapshots) {
      const explicitRoot = mostSpecificRoot(explicitRoots, snapshot.target)
      snapshot.installed_state = targetFingerprint(snapshot.target, explicitRoot)
    }
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

function readTransaction(recordPath, home, allowedRoots = [], record = undefined) {
  if (record === undefined) record = readJson(recordPath, 'transaction record')
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || record.schema_version !== TRANSACTION_SCHEMA_VERSION || !record.id || !Array.isArray(record.snapshots)) {
    throw new Error(`invalid transaction record: ${recordPath}`)
  }
  if (path.resolve(record.home) !== path.resolve(home)) throw new Error('transaction belongs to a different home')
  const trustedRoots = [...new Set([path.resolve(home), ...allowedRoots.map(root => path.resolve(root))])]
  const recordedRoots = Array.isArray(record.allowed_roots)
    ? [...new Set(record.allowed_roots.map(root => path.resolve(root)))]
    : [path.resolve(record.home)]
  if (!recordedRoots.includes(path.resolve(record.home)) || recordedRoots.some(root => !trustedRoots.includes(root))) {
    throw new Error('transaction contains an untrusted rollback root')
  }
  const root = path.dirname(recordPath)
  const backupDirectory = path.join(root, 'backups')
  if (!isWithin(path.join(path.dirname(root), '..'), root)) throw new Error('unsafe transaction path')
  for (const snapshot of record.snapshots) {
    if (!recordedRoots.some(allowedRoot => isWithin(allowedRoot, snapshot.target))) throw new Error(`unsafe rollback target: ${snapshot.target}`)
    if (!trustedRoots.some(allowedRoot => isWithin(allowedRoot, snapshot.target))) throw new Error(`rollback target is outside the current allowed roots: ${snapshot.target}`)
    const explicitRoot = mostSpecificRoot(allowedRoots, snapshot.target)
    if (explicitRoot) assertNoSymlinkedAncestors(explicitRoot, snapshot.target)
    if (snapshot.backup && !isWithin(root, path.join(root, snapshot.backup))) throw new Error(`unsafe rollback backup: ${snapshot.backup}`)
  }
  return { record, recordPath, root, backupDirectory }
}

function transactionRootsCompatible(record, home, allowedRoots) {
  const trustedRoots = new Set([path.resolve(home), ...allowedRoots.map(root => path.resolve(root))])
  const recordedRoots = Array.isArray(record?.allowed_roots)
    ? record.allowed_roots
    : [record?.home]
  return recordedRoots.every(root => typeof root === 'string' && trustedRoots.has(path.resolve(root)))
}

function rollbackLastInstall({ home = os.homedir(), allowedRoots = [], id = null } = {}) {
  const root = path.join(path.resolve(home), '.go-beast', 'install-transactions')
  if (!fs.existsSync(root)) throw new Error('no install transaction is available')
  const candidates = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const recordPath = path.join(root, entry.name, 'transaction.json')
    if (!fs.existsSync(recordPath)) continue
    const record = readJson(recordPath, 'transaction record')
    if (id && record?.id !== id) continue
    if (!id && !transactionRootsCompatible(record, home, allowedRoots)) continue
    if (['pending', 'committed'].includes(record?.status)) candidates.push({ record, recordPath })
  }
  candidates.sort((left, right) => String(right.record.created_at).localeCompare(String(left.record.created_at)))
  const candidate = candidates[0]
  if (!candidate) throw new Error(id ? `install transaction not found: ${id}` : 'no reversible install transaction is available')
  const selected = readTransaction(candidate.recordPath, home, allowedRoots, candidate.record)
  const failures = []
  const preserved = []
  const recoveryPaths = []
  let restored = 0
  for (const snapshot of [...selected.record.snapshots].reverse()) {
    try {
      const explicitRoot = mostSpecificRoot(allowedRoots, snapshot.target)
      if (explicitRoot) assertNoSymlinkedAncestors(explicitRoot, snapshot.target)
      if (!isValidInstalledFingerprint(snapshot.installed_state)) {
        const reason = snapshot.installed_state === undefined || snapshot.installed_state === null ? 'missing' : 'invalid'
        failures.push(`cannot safely rollback ${snapshot.target}: ${reason} installed-state fingerprint`)
        preserved.push(snapshot.target)
        continue
      }
      if (!matchesInstalledFingerprint(snapshot, { allowedRoot: explicitRoot })) {
        preserved.push(snapshot.target)
        continue
      }
      const result = restoreSnapshot(snapshot, selected.backupDirectory, snapshot.installed_state, explicitRoot)
      if (result.preserved) preserved.push(snapshot.target)
      else restored++
      appendRollbackRecoveryPaths(recoveryPaths, snapshot.target, result.recovery_paths ?? (result.recovery_path ? [result.recovery_path] : []))
    } catch (error) {
      failures.push(error.message)
      appendRollbackRecoveryPaths(recoveryPaths, snapshot.target, error.recovery_paths ?? [])
    }
  }
  selected.record.status = failures.length ? 'rollback_failed' : 'rolled_back'
  selected.record.rolled_back_at = new Date().toISOString()
  if (failures.length) selected.record.rollback_errors = failures
  if (preserved.length) selected.record.rollback_preserved = preserved
  if (recoveryPaths.length) selected.record.rollback_recovery_paths = recoveryPaths
  writeJsonAtomic(selected.recordPath, selected.record)
  if (failures.length) throw new Error(`install rollback failed: ${failures.join('; ')}`)
  return { id: selected.record.id, status: selected.record.status, restored, preserved, recoveryPaths }
}

export {
  buildIntegrityManifest,
  buildPermissionPreview,
  createInstallTransaction,
  rollbackLastInstall,
  sourceDigest,
  verifyIntegrityManifest,
  writeIntegrityManifest,
}
