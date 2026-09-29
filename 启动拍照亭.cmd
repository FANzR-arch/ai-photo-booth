@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  call start-photo-booth.cmd
  exit /b
)
if not exist ".env" (
  echo Missing .env configuration. Copy .env.example and configure the Seedream API first.
  pause
  exit /b 1
)
set "GENERATION_MODE=seedream"
set "NODE_ENV=production"
rem The kiosk always generates one portrait; IMAGE_COUNT is no longer used.
set "BOOTH_OPEN_BROWSER=1"
set "BOOTH_FRESH_INSTANCE=0"
set "PATH=%~dp0runtime;%PATH%"
echo Starting SNAP CLUB. The browser will open when ready.
echo Keep this window open. Press Ctrl+C to stop.
"%~dp0runtime\node.exe" --import ./node_modules/tsx/dist/loader.mjs apps/server/index.ts
if errorlevel 1 (
  echo Startup failed. Check the message above.
  pause
)
