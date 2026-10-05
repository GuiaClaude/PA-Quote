@echo off
cd /d "%~dp0finance"
echo Stopping the Print Amplified Finance preview (your test data is kept)...
docker compose stop
echo Stopped.
timeout /t 4 >nul
