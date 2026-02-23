@echo off
REM Rewards-only deploy from app\Rewards. For full app deploy use deploy-github-firebase.bat from root.
chcp 65001 >nul
echo ========================================
echo   رفع إلى GitHub + نشر Firebase
echo ========================================
echo.

cd /d "%~dp0"

if not exist "package.json" (
  echo ERROR: package.json not found. Run this script from app\Rewards.
  pause
  exit /b 1
)

echo [1/3] تجهيز مجلد public ونشر على Firebase...
call npm run deploy
if errorlevel 1 (
  echo فشل النشر. تأكد من: firebase login أو متغير FIREBASE_TOKEN
  pause
  exit /b 1
)
echo.

echo [2/3] إضافة التغييرات وعمل commit...
git add -A
git status
set /p MSG="رسالة الـ commit (Enter = استخدام الرسالة الافتراضية): "
if "%MSG%"=="" set MSG=deploy: تحديثات ورفع
git commit -m "%MSG%" 2>nul || echo لا توجد تغييرات جديدة لـ commit
echo.

echo [3/3] رفع إلى GitHub...
git push origin HEAD
if errorlevel 1 (
  echo فشل الرفع. تأكد من: git remote واسم الفرع وتسجيل الدخول - مثلاً عبر GitHub Desktop أو token.
  pause
  exit /b 1
)

echo.
echo تم: النشر على Firebase ورفع الكود إلى GitHub.
pause
