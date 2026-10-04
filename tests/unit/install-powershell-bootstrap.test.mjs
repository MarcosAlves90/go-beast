import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const launcherPath = path.join(repoRoot, 'scripts', 'install.ps1')

test('PowerShell release-archive bootstrap exists and avoids POSIX shell command parsing', () => {
  assert.ok(
    fs.existsSync(launcherPath),
    'PowerShell release-archive bootstrap is missing: scripts/install.ps1',
  )

  const launcher = fs.readFileSync(launcherPath, 'utf8')
  assert.match(launcher, /\bInvoke-WebRequest\b/)
  assert.match(launcher, /(?:^|\s)-UseBasicParsing\b/)
  assert.match(launcher, /\$installerPath\s+@args\b/)
  assert.match(launcher, /\bfinally\b[\s\S]*\bRemove-Item\b/)
  assert.match(launcher, /Node\.js 18\+/)
  assert.doesNotMatch(launcher, /\bcurl(?:\.exe)?\b|\bbash\b/i)

  for (const relativePath of ['README.md', 'docs/GETTING_STARTED.md']) {
    const documentation = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    assert.match(documentation, /PowerShell/i, `${relativePath} must identify PowerShell instructions`)
    assert.match(documentation, /scripts\/install\.ps1/i, `${relativePath} must link the PowerShell bootstrap`)
    assert.match(documentation, /--interactive/, `${relativePath} must document interactive installation`)
    assert.match(documentation, /--all/, `${relativePath} must document non-interactive installation`)
  }
})

if (process.platform === 'win32') {
  test('Windows PowerShell forwards installer modes and cleans temporary files', async t => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'go beast powershell installer test-'))
    t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

    const bootstrapSource = '// controlled PowerShell installer test fixture\n'
    let requestCount = 0
    const server = http.createServer((request, response) => {
      requestCount += 1
      if (request.url === '/download-failure.mjs') {
        response.writeHead(500, { 'Content-Type': 'text/plain' })
        response.end('controlled download failure')
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(bootstrapSource)
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    t.after(() => new Promise(resolve => server.close(resolve)))

    const address = server.address()
    const serverUrl = `http://127.0.0.1:${address.port}`
    const tempRoot = process.env.TEMP || os.tmpdir()
    const launcherTempDirs = () => fs.readdirSync(tempRoot)
      .filter(name => name.startsWith('go-beast-installer-'))
      .sort()

    function makeMockNode(name, { version = 'v20.0.0', exitCode = '0' } = {}) {
      const mockBin = path.join(fixtureRoot, `mock node ${name}`)
      fs.mkdirSync(mockBin)
      const argsLog = path.join(fixtureRoot, `${name}-args.txt`)
      const installerPathLog = path.join(fixtureRoot, `${name}-installer-path.txt`)
      const downloadedCopy = path.join(fixtureRoot, `${name}-downloaded.mjs`)
      const command = [
        '@echo off',
        'if "%~1"=="--version" (',
        '  echo %GO_BEAST_TEST_NODE_VERSION%',
        '  exit /b 0',
        ')',
        '> "%GO_BEAST_TEST_ARGS_LOG%" echo %2 %3 %4 %5 %6 %7 %8 %9',
        '> "%GO_BEAST_TEST_INSTALLER_PATH_LOG%" echo %~1',
        'copy /Y "%~1" "%GO_BEAST_TEST_DOWNLOADED_COPY%" >nul',
        'exit /b %GO_BEAST_TEST_NODE_EXIT_CODE%',
        '',
      ].join('\r\n')
      fs.writeFileSync(path.join(mockBin, 'node.cmd'), command, 'ascii')
      return {
        argsLog,
        downloadedCopy,
        installerPathLog,
        mockBin,
        env: {
          GO_BEAST_TEST_NODE_VERSION: version,
          GO_BEAST_TEST_NODE_EXIT_CODE: exitCode,
          GO_BEAST_TEST_ARGS_LOG: argsLog,
          GO_BEAST_TEST_INSTALLER_PATH_LOG: installerPathLog,
          GO_BEAST_TEST_DOWNLOADED_COPY: downloadedCopy,
        },
      }
    }

    function invokeLauncher(args, node, scriptUrl = `${serverUrl}/bootstrap.mjs`) {
      const before = new Set(launcherTempDirs())
      const env = {
        ...process.env,
        ...node.env,
        PATH: `${node.mockBin}${path.delimiter}${process.env.PATH || ''}`,
        GO_BEAST_INSTALLER_SCRIPT_URL: scriptUrl,
      }
      const result = spawnSync(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', launcherPath, ...args],
        { cwd: repoRoot, encoding: 'utf8', env, timeout: 30_000, windowsHide: true },
      )
      assert.ifError(result.error)
      return { before, result }
    }

    for (const scenario of [
      { name: 'interactive', args: ['--interactive'], expectedArgs: '--interactive' },
      {
        name: 'non-interactive',
        args: ['--all', '--bootstrap', '--hermes-profile', 'researcher'],
        expectedArgs: '--all --bootstrap --hermes-profile researcher',
      },
    ]) {
      const node = makeMockNode(scenario.name)
      const { before, result } = invokeLauncher(scenario.args, node)
      assert.equal(result.status, 0, `${scenario.name} failed:\n${result.stdout}\n${result.stderr}`)
      assert.equal(fs.readFileSync(node.argsLog, 'utf8').trim(), scenario.expectedArgs)
      assert.equal(fs.readFileSync(node.downloadedCopy, 'utf8'), bootstrapSource)
      const downloadedInstaller = fs.readFileSync(node.installerPathLog, 'utf8').trim()
      assert.ok(downloadedInstaller.endsWith('install-from-release-archive.mjs'))
      assert.equal(fs.existsSync(path.dirname(downloadedInstaller)), false)
      assert.deepEqual(launcherTempDirs().filter(name => !before.has(name)), [])
    }

    const oldNode = makeMockNode('old-node', { version: 'v16.20.0' })
    const requestsBeforeOldNode = requestCount
    const oldNodeRun = invokeLauncher(['--all'], oldNode)
    assert.notEqual(oldNodeRun.result.status, 0)
    assert.match(`${oldNodeRun.result.stdout}\n${oldNodeRun.result.stderr}`, /Node\.js 18\+/)
    assert.equal(requestCount, requestsBeforeOldNode)
    assert.equal(fs.existsSync(oldNode.argsLog), false)

    const failedDownload = makeMockNode('download-failure')
    const requestsBeforeDownloadFailure = requestCount
    const failedDownloadRun = invokeLauncher(
      ['--all'],
      failedDownload,
      `${serverUrl}/download-failure.mjs`,
    )
    assert.notEqual(failedDownloadRun.result.status, 0)
    assert.equal(requestCount, requestsBeforeDownloadFailure + 1)
    assert.equal(fs.existsSync(failedDownload.argsLog), false)
    assert.deepEqual(launcherTempDirs().filter(name => !failedDownloadRun.before.has(name)), [])

    const failingNode = makeMockNode('node-failure', { exitCode: '9' })
    const failedNodeRun = invokeLauncher(['--all'], failingNode)
    assert.equal(failedNodeRun.result.status, 9)
    const downloadedInstaller = fs.readFileSync(failingNode.installerPathLog, 'utf8').trim()
    assert.equal(fs.existsSync(path.dirname(downloadedInstaller)), false)
    assert.deepEqual(launcherTempDirs().filter(name => !failedNodeRun.before.has(name)), [])
  })
}
