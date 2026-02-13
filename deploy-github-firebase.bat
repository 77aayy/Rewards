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
echo ظ‚ط¨ظ„ ط§ظ„ط±ظپط¹: ط±ط§ط¬ط¹ app\PRE-DEPLOY-STEPS.md (طھظ‚ظٹظٹط¯ API key + ط§ط®طھط¨ط§ط±).
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
  echo WARN: ظ„ط§ ظٹظˆط¬ط¯ ظ…ط³طھظˆط¯ط¹ Git. ظ„طھظپط¹ظٹظ„ ط§ظ„ط±ظپط¹ ط¹ظ„ظ‰ GitHub:
  echo   git init
  echo   git add .
  echo   git commit -m "initial"
  echo   git remote add origin https://github.com/USER/REPO.git
  echo   ط«ظ… ط´ط؛ظ‘ظ„ ظ‡ط°ط§ ط§ظ„ظ…ظ„ظپ ظ…ط±ط© ط£ط®ط±ظ‰.
  echo.
  echo طھط®ط·ظٹ ط§ظ„ط®ط·ظˆط© 2 ظˆ 3.
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
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo WARN: ظ„ظ… ظٹظڈط¶ظپ remote ط¨ط§ط³ظ… origin ط¨ط¹ط¯.
  echo   ظ…ط±ط© ظˆط§ط­ط¯ط© ظ†ظپظ‘ط° ظ…ظ† ط¬ط°ط± ط§ظ„ظ…ط´ط±ظˆط¹:
  echo   git remote add origin https://github.com/USER/REPO.git
  echo   ط«ظ… ط´ط؛ظ‘ظ„ ظ‡ط°ط§ ط§ظ„ظ…ظ„ظپ ظ…ط±ط© ط£ط®ط±ظ‰ ظ„ظ„ط±ظپط¹.
  echo.
  echo طھط®ط·ظٹ ط§ظ„ط®ط·ظˆط© 3. Firebase طھظ… ظ†ط´ط±ظ‡ ط¨ظ†ط¬ط§ط­.
  pause
  exit /b 0
)
git push origin HEAD
if errorlevel 1 (
  echo ERROR: Git push failed. طھط£ظƒط¯ ظ…ظ†: git remoteطŒ ط§ظ„ظپط±ط¹طŒ ظˆطھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ (token ط£ظˆ SSH).
  pause
  exit /b 1
)

echo.
echo Done: Firebase and GitHub updated.
pause
