@echo off
setlocal
set "LAUNCHER=%SystemRoot%\Sysnative\wsl.exe"
if exist "%SystemRoot%\System32\wsl.exe" set "LAUNCHER=%SystemRoot%\System32\wsl.exe"
"%LAUNCHER%" -e bash -lc "%*"

