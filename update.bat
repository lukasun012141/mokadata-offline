@echo off
chcp 65001 >nul
title MokaData - Update
echo ============================================
echo   MokaData - Checking for Updates
echo ============================================
echo.
echo Downloading latest version from GitHub...
echo.

set "INSTALL_DIR=%~dp0"
if "%INSTALL_DIR:~-1%"=="\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"
set "TMP_ZIP=%TEMP%\mokadata_update.zip"
set "TMP_DIR=%TEMP%\mokadata_update_tmp"
set "DOWNLOAD_URL=https://github.com/lukasun012141/mokadata-offline/archive/refs/heads/main.zip"

if exist "%TMP_ZIP%" del /f /q "%TMP_ZIP%"
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"

powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%TMP_ZIP%' -UseBasicParsing"
if errorlevel 1 (
    echo ERROR: Download failed. Please check your network.
    pause
    exit /b 1
)
echo Download complete. Extracting...

powershell -NoProfile -Command "Expand-Archive -Path '%TMP_ZIP%' -DestinationPath '%TMP_DIR%' -Force"
if errorlevel 1 (
    echo ERROR: Extract failed.
    pause
    exit /b 1
)

set "SRC_DIR=%TMP_DIR%\mokadata-offline-main"

echo Updating server files...
copy /y "%SRC_DIR%\server\index.js" "%INSTALL_DIR%\server\index.js" >nul
copy /y "%SRC_DIR%\server\db.js" "%INSTALL_DIR%\server\db.js" >nul
copy /y "%SRC_DIR%\server\paramsRouter.js" "%INSTALL_DIR%\server\paramsRouter.js" >nul
if exist "%SRC_DIR%\server\uploadRouter.js" copy /y "%SRC_DIR%\server\uploadRouter.js" "%INSTALL_DIR%\server\uploadRouter.js" >nul

echo Updating frontend files...
if exist "%INSTALL_DIR%\client\dist" rmdir /s /q "%INSTALL_DIR%\client\dist"
mkdir "%INSTALL_DIR%\client\dist"
xcopy /E /I /Y /Q "%SRC_DIR%\client\dist\*" "%INSTALL_DIR%\client\dist\" >nul
if errorlevel 1 (
    echo ERROR: Frontend update failed.
    pause
    exit /b 1
)

if exist "%SRC_DIR%\package.json" copy /y "%SRC_DIR%\package.json" "%INSTALL_DIR%\package.json" >nul

del /f /q "%TMP_ZIP%" >nul 2>&1
rmdir /s /q "%TMP_DIR%" >nul 2>&1

echo.
echo ============================================
echo   Update complete! Starting MokaData...
echo ============================================
echo.
call "%INSTALL_DIR%\start.bat"
