@echo off
title MokaData Update

set "INSTALL_DIR=%~dp0"
if "%INSTALL_DIR:~-1%"=="\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

set "COMMIT=1dcfe2a1b903c2afc84640e630337a8c63ba8084"
set "CDN=https://cdn.jsdelivr.net/gh/lukasun012141/mokadata-offline@%COMMIT%"

where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PowerShell not found
    pause
    exit /b 1
)

echo Checking network...
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%CDN%/server/index.js' -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Cannot connect to cdn.jsdelivr.net
    pause
    exit /b 1
)
echo Network OK

echo [1/3] Stopping MokaData...
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo Done

echo [2/3] Updating server files...
call :download "server/index.js"
call :download "server/db.js"
call :download "server/paramsRouter.js"
call :download "server/uploadRouter.js"

echo [3/3] Updating frontend files...
call :download "client/dist/index.html"
call :download "client/dist/assets/ParamsPage.js"
call :download "client/dist/assets/BusinessPage.js"
call :download "client/dist/assets/DashboardPage.js"
call :download "client/dist/assets/WorkflowsPage.js"
call :download "client/dist/assets/ReportsPage.js"
call :download "client/dist/assets/KnowledgePage.js"
call :download "client/dist/assets/FilesPage.js"
call :download "client/dist/assets/SettingsPage.js"
call :download "client/dist/assets/NotFound.js"
call :download "client/dist/assets/index.js"
call :download "client/dist/assets/index2.js"
call :download "client/dist/assets/index3.js"
call :download "client/dist/assets/index.css"
call :download "client/dist/assets/button.js"
call :download "client/dist/assets/circle-alert.js"
call :download "client/dist/assets/circle-check.js"
call :download "client/dist/assets/download.js"
call :download "client/dist/assets/eye.js"
call :download "client/dist/assets/input.js"
call :download "client/dist/assets/loader-circle.js"
call :download "client/dist/assets/plus.js"
call :download "client/dist/assets/refresh-cw.js"
call :download "client/dist/assets/save.js"
call :download "client/dist/assets/select.js"
call :download "client/dist/assets/table.js"
call :download "client/dist/assets/tabs.js"
call :download "client/dist/assets/tag.js"
call :download "client/dist/assets/textarea.js"
call :download "client/dist/assets/trash-2.js"
call :download "client/dist/assets/truck.js"
call :download "client/dist/assets/zh-CN.js"

echo.
echo ===== Update complete! Restarting MokaData... =====
echo.
timeout /t 1 /nobreak >nul
start "" "%INSTALL_DIR%\start.bat"
echo MokaData started. Press Ctrl+Shift+R in browser to hard refresh.
echo.
pause
exit /b 0

:download
set "_SRC=%~1"
set "_DEST=%INSTALL_DIR%\%_SRC:/=\%"
for %%F in ("%_DEST%") do (
    if not exist "%%~dpF" mkdir "%%~dpF" >nul 2>&1
)
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%CDN%/%_SRC%' -OutFile '%_DEST%' -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop; Write-Host '  [OK] %_SRC%' } catch { Write-Host '  [FAIL] %_SRC%: ' + $_.Exception.Message }"
exit /b 0
