@echo off
chcp 65001 >nul
title MokaData - Install

echo ============================================
echo   MokaData - First Time Setup
echo ============================================
echo.

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found.
    echo Please install Node.js v18+ from https://nodejs.org
    pause
    exit /b 1
)

REM Check Git
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git not found.
    echo Please install Git from https://git-scm.com
    pause
    exit /b 1
)

echo Node.js and Git found. Installing dependencies...
echo.

npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

if not exist "data" mkdir data
if not exist "data\uploads" mkdir data\uploads

echo.
echo ============================================
echo   Installation complete!
echo   Run start.bat to launch MokaData
echo ============================================
pause
