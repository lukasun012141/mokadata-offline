@echo off
chcp 65001 >nul
title MokaData 数据库修复工具
echo.
echo ============================================
echo   MokaData 数据库修复工具
echo   修复参数配置上传 NOT NULL 报错问题
echo ============================================
echo.

:: 检查 Node.js 是否存在
if exist "runtime\node.exe" (
    set NODE_EXE=runtime\node.exe
) else if exist "node_modules\.bin\node.exe" (
    set NODE_EXE=node_modules\.bin\node.exe
) else (
    where node >nul 2>&1
    if %errorlevel% == 0 (
        set NODE_EXE=node
    ) else (
        echo [错误] 找不到 Node.js，请确认 MokaData 安装完整
        pause
        exit /b 1
    )
)

echo 正在运行数据库修复脚本...
echo.
%NODE_EXE% fix_db.js
echo.
if %errorlevel% == 0 (
    echo 修复成功！请重新启动 MokaData（双击 start.bat）
) else (
    echo 修复过程中出现错误，请截图发给开发者
)
echo.
pause
