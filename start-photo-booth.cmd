@echo off
setlocal
set "GENERATION_MODE=seedream"
set "IMAGE_COUNT=1"
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 or newer is required. Install from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
)
echo Building the local photo booth...
call npm run build
if errorlevel 1 goto fail
echo Open http://localhost:4377 in your browser.
echo Keep this window open. Press Ctrl+C to stop.
call npm start
if errorlevel 1 goto fail
exit /b 0
:fail
echo Startup failed. Read the error above.
pause
exit /b 1
