@echo off
where node >nul 2>&1
if %errorlevel% neq 0 (
  start https://nodejs.org/en/download
  echo Node.js is required. Your browser has opened the download page.
  echo Install the LTS version of Node.js, then double-click this file again.
  pause
  exit /b 1
)
cd /d "%~dp0"
node "packages\cli\bin\vimo.mjs" %*
pause
