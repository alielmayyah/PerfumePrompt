@echo off
title Perfume Prompt Preparer
echo ========================================================
echo   Perfume Prompt Preparer
echo ========================================================
echo.

REM 1. Auto-update from GitHub if git repository is present
where git >nul 2>nul
if %ERRORLEVEL% equ 0 (
    if exist ".git" (
        echo [1/3] Checking for latest updates from GitHub...
        git pull --quiet origin main 2>nul
        if %ERRORLEVEL% equ 0 (
            echo   ✓ Up to date with latest GitHub version!
        ) else (
            echo   ⚠️ Offline or remote unreachable. Continuing with local version...
        )
        echo.
    )
)

REM 2. Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [Notice] Node.js is not installed on this computer.
    if exist "dist\PerfumePrompt.exe" (
        echo Starting portable self-updating edition...
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

REM 3. Install packages if missing
if not exist "node_modules" (
    echo [2/3] First-time setup: installing dependencies...
    call npm install
    echo.
)

REM 4. Start the application
echo [3/3] Starting application on http://localhost:3000...
start http://localhost:3000
call npm run dev
pause
