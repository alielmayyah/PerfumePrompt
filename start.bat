@echo off
title Perfume Prompt Preparer
echo ========================================================
echo   Perfume Prompt Preparer
echo ========================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [Notice] Node.js is not installed on this computer.
    if exist "dist\PerfumePrompt.exe" (
        echo Starting portable edition...
        start dist\PerfumePrompt.exe
        exit /b 0
    ) else (
        echo You can download the portable edition with zero install from:
        echo https://github.com/alielmayyah/PerfumePrompt/releases
        echo.
        pause
        exit /b 1
    )
)

REM If Node.js is installed, auto-install packages if needed and start
if not exist "node_modules" (
    echo First-time setup: installing dependencies...
    call npm install
)

echo Starting application on http://localhost:3000...
start http://localhost:3000
call npm run dev
pause
