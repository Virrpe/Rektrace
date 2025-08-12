$ProgressPreference='SilentlyContinue'
$rel = Invoke-RestMethod 'https://api.github.com/repos/coreybutler/nvm-windows/releases/latest'
$asset = $rel.assets | Where-Object { $_.name -like 'nvm-setup*.exe' } | Select-Object -First 1
if (-not $asset) { Write-Error 'Cannot find installer asset'; exit 1 }
$exe = Join-Path $env:TEMP 'nvm-setup.exe'
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $exe
Write-Host "Downloaded: $exe"
Start-Process -FilePath $exe
