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
REM Admin key: من app\.env أو ADMIN_KEY أو VITE_ADMIN_SECRET_KEY. بدون مفتاح لا وصول.
set "ADMIN_KEY=%ADMIN_KEY%"
if "%ADMIN_KEY%"=="" set "ADMIN_KEY=%VITE_ADMIN_SECRET_KEY%"
if "%ADMIN_KEY%"=="" (
  for /f "usebackq delims=" %%a in (`cd /d "%~dp0app" ^&^& node scripts\read-admin-key.cjs`) do set "ADMIN_KEY=%%a"
)
if "%ADMIN_KEY%"=="" (
  echo ERROR: لا يوجد مفتاح أدمن. أنشئ app\.env وضَع: VITE_ADMIN_SECRET_KEY=مفتاحك_السري
  echo أو شغّل: set VITE_ADMIN_SECRET_KEY=مفتاحك قبل تشغيل هذا السكربت.
  pause
  exit /b 1
)

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
