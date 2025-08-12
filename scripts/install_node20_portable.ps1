$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Install a portable Node 20 under user profile without admin, and make it active for current & future sessions
$target = Join-Path $env:USERPROFILE 'node20'
New-Item -ItemType Directory -Force -Path $target | Out-Null

$version = '20.15.0'
$zipUrl = "https://nodejs.org/dist/v$version/node-v$version-win-x64.zip"
$zipPath = Join-Path $env:TEMP ("node-v$version-win-x64.zip")

Write-Host "Downloading Node v$version..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath

Write-Host "Extracting to $target ..."
try {
  Expand-Archive -Path $zipPath -DestinationPath $target -Force
} catch {
  # Fallback to .NET ZipFile without overwrite flag (older PS)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $target)
}

$extracted = Join-Path $target ("node-v$version-win-x64")
if (-not (Test-Path (Join-Path $extracted 'node.exe'))) {
  throw "Extraction failed; node.exe not found in $extracted"
}

# Update PATH for current session
$nodeBin = $extracted
if ($env:PATH -notlike "*$nodeBin*") {
  $env:PATH = "$nodeBin;" + $env:PATH
}

# Persist PATH for user (prepend)
try {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath -notlike "*$nodeBin*") {
    [Environment]::SetEnvironmentVariable('Path', "$nodeBin;" + $userPath, 'User')
  }
} catch {}

Write-Host "Enabling pnpm via corepack..."
try { corepack enable | Out-Null } catch {}
try { corepack prepare pnpm@latest --activate | Out-Null } catch {}

Write-Host ("Node: " + (node -v))
Write-Host ("npm:  " + (npm -v))
try { Write-Host ("pnpm: " + (pnpm -v)) } catch { Write-Host "pnpm: error" }

Write-Host "Portable Node 20 is active for this session. Open a new terminal to inherit updated PATH."

