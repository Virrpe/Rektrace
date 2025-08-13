param([Parameter(ValueFromRemainingArguments=$true)][string[]]$ArgsPassThru)

# Prefer persisted launcher if present
$persistPath = Join-Path -Path (Get-Location) -ChildPath ".wsl_launcher.txt"
$L = $null
if (Test-Path $persistPath) {
  try {
    $cand = Get-Content -Raw -Encoding Ascii $persistPath
    if ($cand -and (Test-Path $cand)) { $L = $cand.Trim() }
  } catch {}
}

if (-not $L) {
  $launchers=@($env:SystemRoot+"\Sysnative\wsl.exe",$env:SystemRoot+"\System32\wsl.exe")
  foreach($p in $launchers){ if(Test-Path $p){ try{ & $p -e bash -lc 'echo OK' *> $null; if($LASTEXITCODE -eq 0){ $L=$p; break } }catch{} } }
}

if(-not $L){ Write-Error "No working wsl.exe found"; exit 1 }

$cmd=($ArgsPassThru -join ' ')
& $L -e bash -lc $cmd
exit $LASTEXITCODE

