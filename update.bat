@echo off
chcp 65001 >nul
title MokaData - Update
echo ============================================
echo   MokaData - Checking for Updates
echo ============================================
echo.
echo 正在从 GitHub 下载最新版本...
echo.

:: 获取脚本所在目录（即 MokaData 安装目录）
set "INSTALL_DIR=%~dp0"
set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"
set "TMP_ZIP=%TEMP%\mokadata_update.zip"
set "TMP_DIR=%TEMP%\mokadata_update_tmp"
set "DOWNLOAD_URL=https://github.com/lukasun012141/mokadata-offline/archive/refs/heads/main.zip"

:: 删除旧临时文件
if exist "%TMP_ZIP%" del /f /q "%TMP_ZIP%"
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"

:: 用 PowerShell 下载 ZIP
powershell -NoProfile -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%TMP_ZIP%' -UseBasicParsing }"
if errorlevel 1 (
    echo.
    echo ERROR: 下载失败，请检查网络连接。
    pause
    exit /b 1
)
echo 下载完成，正在解压...

:: 用 PowerShell 解压
powershell -NoProfile -Command "Expand-Archive -Path '%TMP_ZIP%' -DestinationPath '%TMP_DIR%' -Force"
if errorlevel 1 (
    echo.
    echo ERROR: 解压失败。
    pause
    exit /b 1
)

:: GitHub ZIP 解压后子目录名为 mokadata-offline-main
set "SRC_DIR=%TMP_DIR%\mokadata-offline-main"

:: 更新 server 文件
echo 正在更新 server 文件...
copy /y "%SRC_DIR%\server\index.js" "%INSTALL_DIR%\server\index.js" >nul
copy /y "%SRC_DIR%\server\db.js" "%INSTALL_DIR%\server\db.js" >nul
copy /y "%SRC_DIR%\server\paramsRouter.js" "%INSTALL_DIR%\server\paramsRouter.js" >nul
if exist "%SRC_DIR%\server\uploadRouter.js" copy /y "%SRC_DIR%\server\uploadRouter.js" "%INSTALL_DIR%\server\uploadRouter.js" >nul

:: 更新前端文件（先清空 client\dist，再复制新版）
echo 正在更新前端文件...
if exist "%INSTALL_DIR%\client\dist" rmdir /s /q "%INSTALL_DIR%\client\dist"
mkdir "%INSTALL_DIR%\client\dist"
xcopy /E /I /Y /Q "%SRC_DIR%\client\dist" "%INSTALL_DIR%\client\dist" >nul
if errorlevel 1 (
    echo.
    echo ERROR: 前端文件更新失败。
    pause
    exit /b 1
)

:: 更新 package.json
if exist "%SRC_DIR%\package.json" copy /y "%SRC_DIR%\package.json" "%INSTALL_DIR%\package.json" >nul

:: 清理临时文件
del /f /q "%TMP_ZIP%" >nul 2>&1
rmdir /s /q "%TMP_DIR%" >nul 2>&1

echo.
echo ============================================
echo   更新完成！正在启动 MokaData...
echo ============================================
echo.
call start.bat
