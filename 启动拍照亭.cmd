@echo off
setlocal
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Portable runtime missing. Extract the complete Windows demo ZIP first.
  pause
  exit /b 1
)
if not exist ".env" (
  echo Missing .env configuration. Ask the demo package owner for the API configuration.
  pause
  exit /b 1
)
set "GENERATION_MODE=seedream"
set "IMAGE_COUNT=1"
set "BOOTH_OPEN_BROWSER=1"
set "BOOTH_FRESH_INSTANCE=1"
set "PATH=%~dp0runtime;%PATH%"
echo Starting SNAP CLUB. The browser will open when ready.
echo Keep this window open. Press Ctrl+C to stop.
"%~dp0runtime\node.exe" --import ./node_modules/tsx/dist/loader.mjs apps/server/index.ts
if errorlevel 1 (
  echo Startup failed. Check the message above.
  pause
)
