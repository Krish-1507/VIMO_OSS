@echo off
where node >nul 2>&1
if %errorlevel% neq 0 (
  start https://nodejs.org/en/download 
  echo Node.js is required. Your browser has opened the download page.
  echo Install Node.js and then double-click this file again.
  pause
  exit /b 1
)
cd /d "%~dp0"
echo Starting VIMO...
call npm install --silent
start cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start http://localhost:5173
