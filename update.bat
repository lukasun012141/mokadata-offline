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
echo [1/4] 停止 MokaData 服务...
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo      完成

:: 清理旧版本前端文件（避免新旧文件共存）
echo [2/4] 清理旧版本前端文件...
del /F /Q "%INSTALL_DIR%\client\dist\assets\ParamsPage-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\BusinessPage-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\DashboardPage-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\WorkflowsPage-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\ReportsPage-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\KnowledgePage-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\FilesPage-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\SettingsPage-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\NotFound-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\index-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\index-*.css" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\button-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\circle-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\download-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\eye-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\input-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\loader-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\plus-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\refresh-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\save-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\select-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\table-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\tabs-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\tag-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\textarea-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\trash-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\truck-*.js" >nul 2>&1
del /F /Q "%INSTALL_DIR%\client\dist\assets\zh-CN-*.js" >nul 2>&1
echo      完成

:: 下载并更新服务器文件
echo [3/4] 更新服务器文件...
call :download "server/index.js"
call :download "server/db.js"
call :download "server/paramsRouter.js"
call :download "server/uploadRouter.js"

:: 下载并更新前端文件
echo [4/4] 更新前端文件...
call :download "client/dist/index.html"
call :download "client/dist/assets/ParamsPage-Drrnsky5.js"
call :download "client/dist/assets/BusinessPage-DJxqt7aW.js"
call :download "client/dist/assets/DashboardPage-F3s81qqJ.js"
call :download "client/dist/assets/WorkflowsPage-CSIk30Bj.js"
call :download "client/dist/assets/ReportsPage-BhFqPFEI.js"
call :download "client/dist/assets/KnowledgePage-BFyoI-94.js"
call :download "client/dist/assets/FilesPage-CCCCqgCM.js"
call :download "client/dist/assets/SettingsPage-0vFkoEDC.js"
call :download "client/dist/assets/NotFound--faEOIsp.js"
call :download "client/dist/assets/index-BgIpdxy9.js"
call :download "client/dist/assets/index-BRMQEhit.js"
call :download "client/dist/assets/index-Djk_fNla.js"
call :download "client/dist/assets/index-gG-crZc2.css"
call :download "client/dist/assets/button-Cr1DvYw-.js"
call :download "client/dist/assets/circle-alert-C9AFU1oT.js"
call :download "client/dist/assets/circle-check-h-2kJT2B.js"
call :download "client/dist/assets/download-BeGla2lH.js"
call :download "client/dist/assets/eye-CAxEoaEc.js"
call :download "client/dist/assets/input-iRZ_-bva.js"
call :download "client/dist/assets/loader-circle-CtdZQ17C.js"
call :download "client/dist/assets/plus-CIaGjrOT.js"
call :download "client/dist/assets/refresh-cw-CWC2OB-Q.js"
call :download "client/dist/assets/save-lTikd9nI.js"
call :download "client/dist/assets/select-BQxF0tU4.js"
call :download "client/dist/assets/table-DMwRPCKH.js"
call :download "client/dist/assets/tabs-DJR6qiTX.js"
call :download "client/dist/assets/tag-B-SZn5-M.js"
call :download "client/dist/assets/textarea-DLQRUGKf.js"
call :download "client/dist/assets/trash-2-Cm2gsLOQ.js"
call :download "client/dist/assets/truck-8bsIEJkw.js"
call :download "client/dist/assets/zh-CN-BSzAfSfA.js"

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
    "  Write-Host '  [失败] %_SRC%: ' + $_.Exception.Message" ^
    "}"
exit /b 0
