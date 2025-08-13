$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Show-Step($step, $total, $status) {
  $pct = [int](($step / $total) * 100)
  Write-Progress -Activity "Configuring Node 20 LTS" -Status $status -PercentComplete $pct
}

function Test-Command($name) {
  try { return (Get-Command $name -ErrorAction SilentlyContinue) -ne $null } catch { return $false }
}

function Ensure-Nvm() {
  if (Test-Command 'nvm') { return $true }
  $installer = Join-Path $env:TEMP 'nvm-setup.exe'
  if (-not (Test-Path $installer)) {
    Show-Step 1 8 'Downloading nvm-windows installer...'
    $rel = Invoke-RestMethod 'https://api.github.com/repos/coreybutler/nvm-windows/releases/latest'
    $asset = $rel.assets | Where-Object { $_.name -like 'nvm-setup*.exe' } | Select-Object -First 1
    if (-not $asset) { throw 'Cannot locate nvm-windows installer asset' }
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer | Out-Null
  }
  Show-Step 2 8 'Installing nvm-windows (silent)...'
  # Inno Setup silent flags
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $installer
  $psi.Arguments = '/VERYSILENT /NORESTART /SP-'
  $psi.Verb = 'runas'
  $psi.UseShellExecute = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.WaitForExit()
  Start-Sleep -Seconds 1
  # Refresh session PATH for nvm
  $nvmPath = 'C:\Program Files\nvm'
  if (Test-Path (Join-Path $nvmPath 'nvm.exe')) {
    $env:PATH = "$nvmPath;$env:PATH"
  }
  return (Test-Command 'nvm') -or (Test-Path (Join-Path $nvmPath 'nvm.exe'))
}

function Invoke-Nvm($args) {
  if (Test-Command 'nvm') { & nvm @args }
  else { & 'C:\Program Files\nvm\nvm.exe' @args }
}

Show-Step 0 8 'Starting...'
if (-not (Ensure-Nvm)) { throw 'nvm install failed (or requires UAC confirmation). Retry after accepting UAC.' }

Show-Step 3 8 'Enabling nvm...'
try { Invoke-Nvm @('on') | Out-Null } catch {}

$target = '20.15.0'
$installed = $false
Show-Step 4 8 "Installing Node $target..."
try { Invoke-Nvm @('install', $target) | Out-Null; $installed = $true } catch {}
if (-not $installed) {
  Show-Step 4 8 'Installing latest Node 20.x...'
  try {
    $avail = Invoke-Nvm @('list', 'available') | Select-String -Pattern '(^\s*20\.[0-9]+\.[0-9]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -First 1
    if ($avail) { Invoke-Nvm @('install', $avail) | Out-Null; $target = $avail; $installed = $true }
  } catch {}
}
if (-not $installed) { throw 'Could not install any 20.x version' }

Show-Step 5 8 "Activating Node $target..."
Invoke-Nvm @('use', $target) | Out-Null

Show-Step 6 8 'Removing other Node versions...'
try {
  $list = Invoke-Nvm @('list') | Select-String -Pattern '(^\s*([0-9]+\.[0-9]+\.[0-9]+))' | ForEach-Object { $_.Matches[0].Groups[1].Value }
  foreach ($v in $list) { if ($v -notmatch '^20\.') { try { Invoke-Nvm @('uninstall', $v) | Out-Null } catch {} } }
} catch {}

Show-Step 7 8 'Enabling pnpm via corepack...'
try { corepack enable | Out-Null } catch {}
try { corepack prepare pnpm@latest --activate | Out-Null } catch {}

Show-Step 8 8 'Done'
Write-Host "Active Node: $(node -v)"

