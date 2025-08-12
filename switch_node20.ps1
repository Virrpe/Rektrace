$ErrorActionPreference = 'Stop'

function Ensure-NvmInstalled {
  if (Get-Command nvm -ErrorAction SilentlyContinue) { return $true }
  $tmp = Join-Path $env:TEMP 'nvm-setup.exe'
  if (Test-Path $tmp) {
    Write-Host "Launching nvm-windows installer: $tmp"
    Start-Process -FilePath $tmp
  } else {
    Write-Warning "nvm not found and installer is missing. Run download_nvm.ps1 first or install from releases."
  }
  return $false
}

if (-not (Ensure-NvmInstalled)) {
  Write-Error 'nvm is not installed yet. Complete the installer, open a new PowerShell, and re-run this script.'
  exit 1
}

Write-Host 'nvm detected. Enabling manager...'
try { nvm on | Out-Null } catch {}

# Try a known Node 20 LTS first
$target = '20.15.0'
$installedOk = $false
try {
  nvm install $target
  $installedOk = $true
} catch {
  Write-Warning "Failed to install $target. Falling back to latest available 20.x"
}

if (-not $installedOk) {
  try {
    $avail = nvm list available | Select-String -Pattern '(^\s*20\.[0-9]+\.[0-9]+)' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -First 1
    if ($avail) {
      Write-Host "Installing latest available 20.x: $avail"
      nvm install $avail
      $target = $avail
      $installedOk = $true
    }
  } catch {}
}

if (-not $installedOk) {
  Write-Error 'Could not install a 20.x Node version via nvm.'
  exit 1
}

Write-Host "Activating Node $target"
$nvmUseExit = 0
try { nvm use $target } catch { $nvmUseExit = 1 }
if ($nvmUseExit -ne 0) {
  Write-Error "Failed to switch to Node $target"
  exit 1
}

# Remove other installed versions (keep only 20.x)
try {
  $installed = nvm list | Select-String -Pattern '(^\s*([0-9]+\.[0-9]+\.[0-9]+))' | ForEach-Object { $_.Matches[0].Groups[1].Value }
  foreach ($v in $installed) {
    if ($v -notmatch '^20\.') {
      Write-Host "Uninstalling old Node version: $v"
      try { nvm uninstall $v | Out-Null } catch {}
    }
  }
} catch {}

# Confirm active version
try { node -v } catch {}

# Enable pnpm via corepack
try { corepack enable | Out-Null } catch {}
try { corepack prepare pnpm@latest --activate | Out-Null } catch {}

Write-Host 'Done. Active Node:'
node -v
