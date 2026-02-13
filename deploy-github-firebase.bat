@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"
set "ROOT=%~dp0"
set "APP=%ROOT%app"

echo ========================================
echo   Deploy: GitHub + Firebase
echo ========================================
echo.
echo قبل الرفع: راجع app\PRE-DEPLOY-STEPS.md (تقييد API key + اختبار).
echo.
echo [1/3] Sync + Build + Firebase deploy (from app)...
cd /d "%APP%"
if not exist "package.json" (
  echo ERROR: app\package.json not found.
  pause
  exit /b 1
)

call npm run deploy
if errorlevel 1 (
  echo ERROR: Deploy failed. Check: firebase login or FIREBASE_TOKEN, and npm run build.
  pause
  exit /b 1
)
echo.

echo [2/3] Git add and commit...
cd /d "%ROOT%"
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo WARN: لا يوجد مستودع Git. لتفعيل الرفع على GitHub:
  echo   git init
  echo   git add .
  echo   git commit -m "initial"
  echo   git remote add origin https://github.com/USER/REPO.git
  echo   ثم شغّل هذا الملف مرة أخرى.
  echo.
  echo تخطي الخطوة 2 و 3.
  pause
  exit /b 0
)
git add -A 2>nul

git status
set "MSG=deploy: update %date% %time%"
git commit -m "%MSG%" 2>nul
if errorlevel 1 (
  echo No changes to commit.
) else (
  echo Commit done.
)
echo.

echo [3/3] Push to GitHub...
git remote get-url origin 2>nul
git push origin HEAD
if errorlevel 1 (
  echo ERROR: Git push failed. Check remote, branch, and login (token/SSH).
  pause
  exit /b 1
)

echo.
echo Done: Firebase and GitHub updated.
pause
