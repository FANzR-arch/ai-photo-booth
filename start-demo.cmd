@echo off
setlocal
rem Demo mode: local sample images, no Seedream API calls or costs.
set "GENERATION_MODE=demo"
set "BOOTH_FRESH_INSTANCE=1"
rem The kiosk always generates one portrait; IMAGE_COUNT is no longer used.
set "BOOTH_OPEN_BROWSER=1"
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 or newer is required. Install from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm ci --include=dev --no-audit --no-fund
  if errorlevel 1 goto fail
)
echo Building the local photo booth...
call npm run build
if errorlevel 1 goto fail
echo Starting an isolated test instance with a free port and separate data.
echo Keep this window open. Press Ctrl+C to stop.
call npm start
if errorlevel 1 goto fail
exit /b 0
:fail
echo Startup failed. Read the error above.
pause
exit /b 1
