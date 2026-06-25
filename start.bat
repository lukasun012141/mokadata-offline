@echo off
chcp 65001 >nul
title MokaData

node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js v18+
    pause
    exit /b 1
)

REM Check critical dependencies (body-parser is a key indicator)
set NEED_INSTALL=0
if not exist "node_modules\express" set NEED_INSTALL=1
if not exist "node_modules\body-parser" set NEED_INSTALL=1
if not exist "node_modules\multer" set NEED_INSTALL=1
if not exist "node_modules\superjson" set NEED_INSTALL=1

if "%NEED_INSTALL%"=="1" (
    echo Installing dependencies, please wait...
    if exist "node_modules" rmdir /s /q node_modules
    npm install
    if errorlevel 1 (
        echo ERROR: npm install failed. Please check your network connection.
        pause
        exit /b 1
    )
    echo Dependencies installed successfully.
)

if not exist "data" mkdir data
if not exist "data\uploads" mkdir data\uploads

start "" cmd /c "timeout /t 3 >nul && start http://localhost:3737"

set PORT=3737
node server/index.js
pause
