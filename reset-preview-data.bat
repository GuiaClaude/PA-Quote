@echo off
cd /d "%~dp0finance"
echo This deletes everything you entered in the preview and starts again with fresh demo data.
choice /c YN /m "Continue"
if errorlevel 2 exit /b 0
docker compose down -v
call "%~dp0start-preview.bat"
