@echo off
chcp 65001 >nul
cd /d "%~dp0app"

echo ========================================
echo   السيرفر المحلي + صفحة الأدمن
echo ========================================
echo.

start "Vite Dev Server" cmd /k "npm run dev"

echo انتظار تشغيل السيرفر...
timeout /t 6 /nobreak >nul

start "" "http://localhost:5173/?admin=ayman5255"

echo.
echo تم فتح المتصفح على صفحة الأدمن.
echo نافذة السيرفر تبقى مفتوحة؛ للإيقاف اغلقها.
echo.
pause
