@echo off
chcp 65001 >nul 2>&1
title MokaData - 自动更新

echo ================================================
echo   MokaData - 自动更新
echo ================================================
echo.

:: 获取脚本所在目录（安装目录）
set "INSTALL_DIR=%~dp0"
if "%INSTALL_DIR:~-1%"=="\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

echo 安装目录: %INSTALL_DIR%
echo.

:: CDN 基础地址（jsdelivr，国内可访问，无需 VPN）
set "CDN=https://cdn.jsdelivr.net/gh/lukasun012141/mokadata-offline@main"

:: 检查 PowerShell 是否可用
where powershell >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 PowerShell，无法自动更新
    pause
    exit /b 1
)

echo 正在检查网络连接...
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%CDN%/server/index.js' -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null; Write-Host 'OK' } catch { Write-Host 'FAIL'; exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [错误] 无法连接到更新服务器（cdn.jsdelivr.net）
    echo 请检查网络连接后重试
    pause
    exit /b 1
)

echo 网络连接正常，开始下载更新...
echo.

:: 停止正在运行的 MokaData 服务
echo [1/3] 停止 MokaData 服务...
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

:: 下载并更新服务器文件
echo [2/3] 更新服务器文件...
call :download "server/index.js"
call :download "server/db.js"
call :download "server/paramsRouter.js"
call :download "server/uploadRouter.js"

:: 下载并更新前端文件
echo [3/3] 更新前端文件...
call :download "client/dist/assets/ParamsPage-DkJ0YVAm.js"
call :download "client/dist/assets/BusinessPage-BC5qJ7mK.js"
call :download "client/dist/assets/DashboardPage-CxRQoivE.js"
call :download "client/dist/assets/WorkflowsPage-DUMgCUyy.js"
call :download "client/dist/assets/ReportsPage-DBv5Uz8g.js"
call :download "client/dist/assets/KnowledgePage-DeG5uDOf.js"
call :download "client/dist/assets/FilesPage-EQdd3wlg.js"
call :download "client/dist/assets/SettingsPage-DoSqe2-Q.js"
call :download "client/dist/assets/index-B-cibgTD.js"
call :download "client/dist/assets/index-C_xek34J.css"

echo.
echo ================================================
echo   更新完成！正在重新启动 MokaData...
echo ================================================
echo.

timeout /t 1 /nobreak >nul
start "" "%INSTALL_DIR%\start.bat"

echo MokaData 已启动，请在浏览器按 Ctrl+Shift+R 强制刷新
echo.
pause
exit /b 0

:: ─── 下载单个文件的子程序 ─────────────────────────────────────────────────────
:download
set "_SRC=%~1"
set "_DEST=%INSTALL_DIR%\%_SRC:/=\%"

:: 确保目标目录存在
for %%F in ("%_DEST%") do (
    if not exist "%%~dpF" mkdir "%%~dpF" >nul 2>&1
)

powershell -NoProfile -Command ^
    "try {" ^
    "  Invoke-WebRequest -Uri '%CDN%/%_SRC%' -OutFile '%_DEST%' -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop;" ^
    "  Write-Host '  [OK] %_SRC%'" ^
    "} catch {" ^
    "  Write-Host '  [跳过] %_SRC%'" ^
    "}"
exit /b 0
