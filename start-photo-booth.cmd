@echo off
setlocal
rem Real Seedream generation: requires .env with SEEDREAM_API_KEY and SEEDREAM_MODEL.
set "GENERATION_MODE=seedream"
set "NODE_ENV=production"
set "BOOTH_FRESH_INSTANCE=0"
rem The kiosk always generates one portrait; IMAGE_COUNT is no longer used.
set "BOOTH_OPEN_BROWSER=1"
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 or newer is required. Install from https://nodejs.org/
  pause
  exit /b 1
)
if not exist ".env" (
  echo Missing .env configuration. Copy .env.example to .env and fill in the Seedream key first.
  echo Seedream mode does not fall back to demo images.
  pause
  exit /b 1
)
findstr /r /c:"^SEEDREAM_API_KEY=..*" ".env" >nul 2>nul
if errorlevel 1 (
  echo SEEDREAM_API_KEY is empty in .env. Fill it in before starting the real-generation booth.
  echo Seedream mode does not fall back to demo images.
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
echo Starting the booth. The browser opens at http://localhost:4377 when ready.
echo If the booth is already running, this window just reopens it and exits.
echo Keep this window open. Press Ctrl+C to stop.
call npm start
if errorlevel 1 goto fail
exit /b 0
:fail
echo Startup failed. Read the error above.
pause
exit /b 1
