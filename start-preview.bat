@echo off
title Print Amplified Finance - local preview
cd /d "%~dp0finance"
echo.
echo  Print Amplified Finance - local preview (made-up demo data)
echo  ----------------------------------------------------------
where docker >nul 2>nul
if errorlevel 1 (
  echo  Docker Desktop is not installed. Opening the download page...
  start "" https://www.docker.com/products/docker-desktop/
  echo  Install it, open it once, then double-click this file again.
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo  Docker Desktop is not running. Open Docker Desktop, wait until it
  echo  shows "Engine running", then double-click this file again.
  pause
  exit /b 1
)
echo  Starting. The FIRST time takes about 5-10 minutes; later starts take seconds.
docker compose up -d --build
if errorlevel 1 (
  echo  Something went wrong while starting. Please send a screenshot of this window.
  pause
  exit /b 1
)
echo  Waiting for the app to be ready...
set /a tries=0
:wait
set /a tries+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:3000/login; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto ready
if %tries% GEQ 100 (
  echo  The app did not start. Showing its log:
  docker compose logs --tail 60 app
  pause
  exit /b 1
)
timeout /t 3 /nobreak >nul
goto wait
:ready
echo.
echo  Ready! Opening http://localhost:3000 in your browser.
echo  To stop it later, double-click stop-preview.bat.
start "" http://localhost:3000
timeout /t 8 >nul
