$ErrorActionPreference = 'Stop'
$ts = Get-Date -Format yyyyMMdd_HHmmss

function Backup-IfExists($path) {
  if (Test-Path $path) {
    $bak = "$path.bak.$ts"
    try {
      Write-Host "Backing up: $path -> $bak"
      Rename-Item -Path $path -NewName $bak -Force
    } catch {
      Write-Warning "Failed to backup $path. Try running as Administrator."
      throw
    }
  }
}

Backup-IfExists 'C:\Program Files\nodejs'
Backup-IfExists 'C:\Program Files\nvm'

# Run the installer/switch script elevated for UAC operations
Write-Host 'Launching Node 20 ensure script with elevation...'
Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','."\ensure_node20.ps1"' -Verb runas

