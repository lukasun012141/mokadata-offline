@echo off
chcp 65001 >nul
title MokaData Update
set "INSTALL_DIR=%~dp0"
if "%INSTALL_DIR:~-1%"=="\" set "INSTALL_DIR=%INSTALL_DIR:~0,-1%"

set "REPO=lukasun012141/mokadata-offline"
set "BRANCH=main"

echo ===================================================
echo  MokaData 更新程序
echo ===================================================
echo.

rem ─── 方案 C：优先检测本地 patch 文件夹 ──────────────────────────────────────
rem 如果 patch\ 目录存在且含有文件，直接走本地安装，跳过网络
if exist "%INSTALL_DIR%\patch\" (
    dir /b /s "%INSTALL_DIR%\patch\*" >nul 2>&1
    if not errorlevel 1 (
        echo [检测到本地补丁包] 将使用 patch\ 目录中的文件进行更新...
        echo.
        goto :local_patch
    )
)

rem ─── 方案 A：在线更新，依次尝试稳定镜像 ─────────────────────────────────────
echo [1/4] 检测网络连接...

rem 镜像1：mirror.ghproxy.com（目前最稳定的国内 GitHub 代理）
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://mirror.ghproxy.com/https://raw.githubusercontent.com/%REPO%/%BRANCH%/server/index.js' -UseBasicParsing -TimeoutSec 6 -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    set "CDN=https://mirror.ghproxy.com/https://raw.githubusercontent.com/%REPO%/%BRANCH%"
    echo     [OK] mirror.ghproxy.com
    goto :do_update
)

rem 镜像2：ghfast.top（备用代理）
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://ghfast.top/https://raw.githubusercontent.com/%REPO%/%BRANCH%/server/index.js' -UseBasicParsing -TimeoutSec 6 -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    set "CDN=https://ghfast.top/https://raw.githubusercontent.com/%REPO%/%BRANCH%"
    echo     [OK] ghfast.top
    goto :do_update
)

rem 镜像3：ghproxy.net（原有代理保留）
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://ghproxy.net/https://raw.githubusercontent.com/%REPO%/%BRANCH%/server/index.js' -UseBasicParsing -TimeoutSec 6 -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    set "CDN=https://ghproxy.net/https://raw.githubusercontent.com/%REPO%/%BRANCH%"
    echo     [OK] ghproxy.net
    goto :do_update
)

rem 镜像4：cdn.jsdelivr.net（CDN，有缓存延迟但覆盖广）
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://cdn.jsdelivr.net/gh/%REPO%@%BRANCH%/server/index.js' -UseBasicParsing -TimeoutSec 6 -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    set "CDN=https://cdn.jsdelivr.net/gh/%REPO%@%BRANCH%"
    echo     [OK] cdn.jsdelivr.net
    goto :do_update
)

rem 镜像5：raw.githubusercontent.com（直连，国内可能不通，作为兜底）
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/%REPO%/%BRANCH%/server/index.js' -UseBasicParsing -TimeoutSec 6 -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    set "CDN=https://raw.githubusercontent.com/%REPO%/%BRANCH%"
    echo     [OK] raw.githubusercontent.com
    goto :do_update
)

rem ─── 所有网络均不可用 ────────────────────────────────────────────────────────
echo.
echo [ERROR] 无法连接到任何更新服务器。
echo.
echo 解决方案：
echo   1. 检查网络连接后重试
echo   2. 使用离线补丁包更新：
echo      a. 将补丁包 .zip 解压到 patch\ 文件夹
echo         （即 %INSTALL_DIR%\patch\）
echo      b. 确保 patch\ 下有 server\ 或 client\ 子目录
echo      c. 再次双击 update.bat
echo.
pause
exit /b 1

rem ─── 在线更新流程 ────────────────────────────────────────────────────────────
:do_update
echo     来源: %CDN%
echo.

echo [2/4] 停止 MokaData...
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo     完成

echo [3/4] 更新服务端文件...
call :download "server/index.js"
call :download "server/db.js"
call :download "server/paramsRouter.js"
call :download "server/uploadRouter.js"

echo [4/4] 更新前端文件...
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

goto :finish

rem ─── 本地补丁包安装流程 ──────────────────────────────────────────────────────
:local_patch
echo [2/3] 停止 MokaData...
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo     完成

echo [3/3] 从本地 patch\ 目录安装文件...
rem 递归复制 patch\ 下所有文件到安装目录，保持目录结构
for /r "%INSTALL_DIR%\patch" %%F in (*) do (
    rem 计算相对路径
    set "_FULL=%%F"
    setlocal enabledelayedexpansion
    set "_REL=!_FULL:%INSTALL_DIR%\patch\=!"
    set "_DEST=%INSTALL_DIR%\!_REL!"
    rem 确保目标目录存在
    for %%D in ("!_DEST!") do (
        if not exist "%%~dpD" mkdir "%%~dpD" >nul 2>&1
    )
    copy /Y "%%F" "!_DEST!" >nul 2>&1
    echo   [OK] !_REL!
    endlocal
)

rem 安装完成后清空 patch 目录（避免下次误用旧补丁）
echo.
echo 清理 patch\ 目录...
rd /s /q "%INSTALL_DIR%\patch" >nul 2>&1
mkdir "%INSTALL_DIR%\patch" >nul 2>&1
echo     完成（patch\ 目录已清空，下次将走在线更新）

goto :finish

rem ─── 收尾：重启服务 ──────────────────────────────────────────────────────────
:finish
echo.
echo ===================================================
echo  更新完成！正在重启 MokaData...
echo ===================================================
echo.
timeout /t 1 /nobreak >nul
start "" "%INSTALL_DIR%\start.bat"
echo MokaData 已启动。
echo 请在浏览器按 Ctrl+Shift+R 强制刷新页面。
echo.
pause
exit /b 0

rem ─── 下载单个文件（在线模式使用）────────────────────────────────────────────
:download
set "_SRC=%~1"
set "_DEST=%INSTALL_DIR%\%_SRC:/=\%"
for %%F in ("%_DEST%") do (
    if not exist "%%~dpF" mkdir "%%~dpF" >nul 2>&1
)
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%CDN%/%_SRC%' -OutFile '%_DEST%' -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop; Write-Host '  [OK] %_SRC%' } catch { Write-Host '  [FAIL] %_SRC%: ' + $_.Exception.Message }"
exit /b 0
