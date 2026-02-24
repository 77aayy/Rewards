@echo off
REM Start local Vite server and open admin page. Run from project root only.
chcp 65001 >nul
cd /d "%~dp0"

if not exist "app\package.json" (
  echo ERROR: app\package.json not found. Run this script from the project root.
  pause
  exit /b 1
)

set "APP=%~dp0app"
set "REWARDS=%APP%\Rewards"
cd /d "%APP%"

echo ========================================
echo   Local server + Admin page
echo ========================================
echo/

REM Run Rewards watcher (auto-sync shared/ and Rewards/src → public/rewards)
start "Rewards Watch" cmd /k "cd /d \"%REWARDS%\" && node scripts/watch-and-predeploy.js"

REM Run Vite Dev Server
start "Vite Dev Server" cmd /k "cd /d \"%APP%\" && npm run dev"

echo Waiting for server on port 5180...
timeout /t 6 /nobreak >nul

start "" "http://localhost:5180/?admin=ayman5255"

echo/
echo Browser opened. Close the server window to stop.
echo/
pause
