@echo off
chcp 65001 >nul
title MokaData - Update

echo ============================================
echo   MokaData - Checking for Updates
echo ============================================
echo.

git pull origin main
if errorlevel 1 (
    echo ERROR: Update failed. Please check your network connection.
    pause
    exit /b 1
)

echo.
echo Update complete! Starting MokaData...
echo.

call start.bat
