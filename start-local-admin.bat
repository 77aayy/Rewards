@echo off
REM Start local Vite server and open admin page. Run from project root only.
chcp 65001 >nul
cd /d "%~dp0"

if not exist "app\package.json" (
  echo ERROR: app\package.json not found. Run this script from the project root.
  pause
  exit /b 1
)

cd /d "%~dp0app"

echo ========================================
echo   Local server + Admin page
echo ========================================
echo/

start "Vite Dev Server" cmd /k "npm run dev"

echo Waiting for server on port 5173...
timeout /t 6 /nobreak >nul

start "" "http://localhost:5173/?admin=ayman5255"

echo/
echo Browser opened. Close the server window to stop.
echo/
pause
