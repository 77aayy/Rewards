@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul || (
  echo ERROR: Node.js not found. Install Node and add it to PATH.
  pause
  exit /b 1
)

if not exist "app\package.json" (
  echo ERROR: app\package.json not found. Run this script from project root.
  echo Current dir: %CD%
  pause
  exit /b 1
)

echo ========================================
echo   Local server + Admin
echo ========================================
echo.
REM Admin key: ADMIN_KEY > VITE_ADMIN_SECRET_KEY > default. Set env before running to override.
if defined ADMIN_KEY goto :adminset
if defined VITE_ADMIN_SECRET_KEY (set "ADMIN_KEY=%VITE_ADMIN_SECRET_KEY%") else (set "ADMIN_KEY=ayman5255")
:adminset

set "REWARDS=%~dp0app\Rewards"
if exist "%REWARDS%\scripts\watch-and-predeploy.js" (
  pushd "%REWARDS%"
  start /b "Watcher" node scripts\watch-and-predeploy.js
  popd
  echo Watcher started.
)

start /b cmd /c "ping -n 9 127.0.0.1 >nul & start http://localhost:5180/?admin=%ADMIN_KEY%"

cd /d "%~dp0app"

echo If port 5180 is in use, close the other server window then run this again.
echo.
npm run dev

echo.
pause
