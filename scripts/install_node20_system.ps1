# Installs Node.js 20 LTS system-wide (non-standalone), then installs pnpm globally.
# Strategy: winget → choco → MSI fallback.
param()

$ErrorActionPreference = 'Continue'

Write-Host "[install_node20_system] Starting system Node.js 20 LTS installation..."

function Test-Command($name) {
  try { Get-Command $name -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

function Install-WithWinget {
  if (Test-Command 'winget') {
    Write-Host '[winget] Installing OpenJS.NodeJS.LTS...'
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent --accept-package-agreements --accept-source-agreements
    return $LASTEXITCODE -eq 0
  }
  return $false
}

function Install-WithChoco {
  if (Test-Command 'choco') {
    Write-Host '[choco] Installing nodejs-lts...'
    choco install nodejs-lts -y --no-progress
    return $LASTEXITCODE -eq 0
  }
  return $false
}

function Install-WithMsi {
  try {
    $tmp = New-Item -ItemType Directory -Force -Path (Join-Path $env:TEMP 'node_msi')
    $msi = Join-Path $tmp.FullName 'node-v20-x64.msi'
    $url = 'https://nodejs.org/dist/latest-v20.x/node-v20.15.0-x64.msi'
    Write-Host "[msi] Downloading $url ..."
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
    Write-Host '[msi] Installing silently...'
    Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn" -Wait -NoNewWindow
    return $true
  } catch {
    Write-Warning "[msi] Failed: $($_.Exception.Message)"
    return $false
  }
}

$ok = $false
if (-not $ok) { $ok = Install-WithWinget }
if (-not $ok) { $ok = Install-WithChoco }
if (-not $ok) { $ok = Install-WithMsi }

if (-not $ok) {
  Write-Error '[install_node20_system] Failed to install Node.js 20 LTS. Please run as admin or install manually.'
  exit 1
}

# Ensure current process can find node/npm
$nodeBin = Join-Path ${env:ProgramFiles} 'nodejs'
if (Test-Path $nodeBin) {
  $env:PATH = "$nodeBin;${env:PATH}"
}

Write-Host "[verify] node: $(node -v 2>$null)"
Write-Host "[verify] npm:  $(npm -v 2>$null)"

if (-not (Test-Command 'node')) { Write-Error '[verify] node not available in current session'; exit 1 }

# Prefer corepack when available; otherwise install pnpm globally
if (Test-Command 'corepack') {
  Write-Host '[corepack] Enabling corepack and activating pnpm@10.14.0 ...'
  corepack enable
  corepack prepare pnpm@10.14.0 --activate
} else {
  Write-Host '[npm] Installing pnpm@10.14.0 globally ...'
  npm i -g pnpm@10.14.0
}

Write-Host "[verify] pnpm: $(pnpm -v 2>$null)"
Write-Host '[install_node20_system] Completed.'


