@echo off
title MokaData Update

set "INSTALL_DIR=%~dp0"
if "%INSTALL_DIR:~-1%"=="\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

set "COMMIT=0998de0319adecacb1d324d869dcadbc9b817b8d"
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

echo [1/4] Stopping MokaData...
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo Done

echo [2/4] Removing old frontend files...
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
echo Done

echo [3/4] Updating server files...
call :download "server/index.js"
call :download "server/db.js"
call :download "server/paramsRouter.js"
call :download "server/uploadRouter.js"

echo [4/4] Updating frontend files...
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
powershell -NoProfile -Command ^
    "try {" ^
    "  Invoke-WebRequest -Uri '%CDN%/%_SRC%' -OutFile '%_DEST%' -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop;" ^
    "  Write-Host '  [OK] %_SRC%'" ^
    "} catch {" ^
    "  Write-Host '  [FAIL] %_SRC%: ' + $_.Exception.Message" ^
    "}"
exit /b 0
