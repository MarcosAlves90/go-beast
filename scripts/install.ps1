$ErrorActionPreference = 'Stop'

$scriptUrl = $env:GO_BEAST_INSTALLER_SCRIPT_URL
if ([string]::IsNullOrWhiteSpace($scriptUrl)) {
  $scriptUrl = 'https://raw.githubusercontent.com/MarcosAlves90/go-beast/main/scripts/install-from-release-archive.mjs'
}

$nodeCommand = Get-Command -Name node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $nodeCommand) {
  [Console]::Error.WriteLine('Node.js 18+ is required.')
  exit 1
}

$nodeVersion = [string](& $nodeCommand.Source --version)
$nodeVersionMatch = [regex]::Match($nodeVersion, '^v?(\d+)\.')
if ($LASTEXITCODE -ne 0 -or -not $nodeVersionMatch.Success) {
  [Console]::Error.WriteLine('Unable to determine the Node.js version. Node.js 18+ is required.')
  exit 1
}
if ([int]$nodeVersionMatch.Groups[1].Value -lt 18) {
  [Console]::Error.WriteLine('Node.js 18+ is required.')
  exit 1
}

$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("go-beast-installer-$([guid]::NewGuid().ToString('N'))")
$installerPath = Join-Path $tempDir 'install-from-release-archive.mjs'
$exitCode = 1

try {
  New-Item -ItemType Directory -Path $tempDir | Out-Null
  Invoke-WebRequest -Uri $scriptUrl -OutFile $installerPath -UseBasicParsing
  & $nodeCommand.Source $installerPath @args
  $exitCode = $LASTEXITCODE
} finally {
  Remove-Item -LiteralPath $tempDir -Recurse -Force
}

exit $exitCode
