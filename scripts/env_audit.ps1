$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

New-Item -ItemType Directory -Force -Path 'logs' | Out-Null
$out = @()

$out += "# Env Audit"
$out += ""

$out += "## OS & Shell"
$out += "### Windows"
try {
  $sys = (systeminfo | findstr /B /C:"OS Name" /C:"OS Version")
  $out += ($sys -join "`n")
} catch {}
$out += ""
$out += ("COMSPEC: " + ($env:COMSPEC))
$out += ""

$out += "## Runtimes & Package Tools"
function Try-Ver($label, $scriptBlock) {
  try { return (& $scriptBlock) } catch { return ("not found: " + $label) }
}
$out += "python:"
$out += (Try-Ver 'python' { python --version })
$out += (Try-Ver 'py' { py --version })
$out += "pip:"
$out += (Try-Ver 'pip' { pip --version })
$out += "conda/mamba:"
$out += (Try-Ver 'conda' { conda --version })
$out += (Try-Ver 'mamba' { mamba --version })
$out += "node/npm/pnpm/yarn:"
$out += (Try-Ver 'node' { node -v })
$out += (Try-Ver 'npm' { npm -v })
$out += (Try-Ver 'pnpm' { pnpm -v })
$out += (Try-Ver 'yarn' { yarn -v })
$out += "docker:"
$out += (Try-Ver 'docker' { docker --version })
$out += "git:"
$out += (Try-Ver 'git' { git --version })
$out += "nvidia-smi:"
$out += (Try-Ver 'nvidia-smi' { nvidia-smi })
$out += ""

$out += "## Project Files"
$files = @('pyproject.toml','requirements.txt','environment.yml','package.json','pnpm-workspace.yaml','Justfile','Makefile','Dockerfile','docker-compose.yml')
foreach ($f in $files) {
  if (Test-Path $f) { $out += "present: $f" } else { $out += "missing: $f" }
}
$out += ""

function Grep($pat) {
  try { return (Select-String -Path . -Pattern $pat -Recurse -ErrorAction SilentlyContinue | Select-Object -First 3 | ForEach-Object { $_.Path + ':' + $_.LineNumber + ':' + $_.Line }) } catch { return @() }
}

$out += "## Framework Scan"
$out += "FastAPI:"
$out += (Grep 'FastAPI')
$out += ""
$out += "Flask:"
$out += (Grep 'Flask')
$out += ""
$out += "SvelteKit:"
$out += (Grep 'SvelteKit')
$out += ""
$out += "Next.js:"
$out += (Grep 'next')
$out += ""
$out += "Vite:"
$out += (Grep 'vite')
$out += ""
$out += "Playwright/PyTest/Jest:"
$out += (Grep 'playwright|pytest|jest')
$out += ""

$out += "## Quant/Trading Signals indicators"
$out += (Grep 'ccxt|xgboost|lightgbm|heikin|backtest|signals')

$path = 'logs/env-audit.md'
$out | Out-File -FilePath $path -Encoding UTF8

Get-Content -Tail 50 $path

