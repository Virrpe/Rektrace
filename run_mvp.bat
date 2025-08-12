@echo off
setlocal ENABLEDELAYEDEXPANSION
cd /d %~dp0

echo [1/8] Checking Node.js version...
for /f "tokens=1* delims=v" %%A in ('node -v 2^>NUL') do set NODEVER=%%B
if not defined NODEVER (
  echo Node.js not found. Please install Node 20 LTS.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%A in ("%NODEVER%") do set NODEMAJOR=%%A
if %NODEMAJOR% LSS 20 (
  echo Detected Node %NODEVER%. Please use Node 20 LTS.
  pause
  exit /b 1
)

echo [2/8] Activating pnpm via corepack (safe if already active)...
corepack enable >NUL 2>&1
corepack prepare pnpm@latest --activate >NUL 2>&1

echo [3/8] Installing dependencies (pnpm i)...
pnpm i || (
  echo pnpm install failed.
  pause
  exit /b 1
)

echo [4/8] Bootstrapping .env.prod (backup + defaults)...
node scripts\env_bootstrap.cjs --fix
set BOOTRC=%ERRORLEVEL%
if %BOOTRC% EQU 2 (
  echo Missing required keys. Opening .env.prod in Notepad...
  start notepad .env.prod
  echo Please fill TELEGRAM_BOT_TOKEN and ADMIN_IDS. Save, close Notepad, and re-run this script.
  pause
  exit /b 2
)
if %BOOTRC% NEQ 0 (
  echo Environment bootstrap failed.
  pause
  exit /b 1
)

echo [5/8] Building project (includes RugScan target)...
pnpm run -s build || (
  echo Build failed.
  pause
  exit /b 1
)

echo [6/8] Starting bot (single process)...
set DIST=dist\rektrace-rugscan\rektrace-rugscan\src\index.js
if not exist %DIST% (
  echo Build artifact not found: %DIST%
  pause
  exit /b 1
)
start "rektrace-bot" cmd /c node %DIST%

echo [7/8] Probing health at /live (10 retries x 2s)...
set PORT=8081
for /f "tokens=2 delims==" %%A in ('findstr /r "^HEALTH_PORT=" .env.prod 2^>NUL') do set PORT=%%A
set PROBEURL=http://127.0.0.1:%PORT%/live
for /l %%i in (1,1,10) do (
  curl -fsS %PROBEURL% >nul 2>&1 && goto :ok
  timeout /t 2 >nul
)
echo Health probe failed. Check logs in the "rektrace-bot" window.
pause
exit /b 1
:ok

echo [8/8] Ready.
echo.
echo Next steps:
echo  - DM your bot in Telegram: /start, /help, /scan ink:^<token^>, /scan_plus ink:^<token^>, /snipers ink:^<token^>, /sniper 0x^<addr^>
echo  - Visit http://127.0.0.1:%PORT%/status and /metrics
echo  - To stop: close the "rektrace-bot" window (or end the node process)
echo.
pause


