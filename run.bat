@echo off
REM THE-CLAW Universal Launcher for Windows
REM Automatically handles all bootstrap and startup tasks
REM Usage: run.bat  or  run.bat start

setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Parse arguments
set ACTION=%1
if "%ACTION%"=="" set ACTION=launch
if "%ACTION%"=="fg" set ACTION=foreground
if "%ACTION%"=="start" set ACTION=foreground

REM Run appropriate launcher
if "%ACTION%"=="foreground" (
    REM Run in foreground (visible window)
    call bootstrap.bat
    if errorlevel 1 exit /b 1
    echo.
    echo Starting THE-CLAW in foreground mode...
    echo.
    cd claude-control-browser
    npm start
) else (
    REM Run in background
    call launch.bat
)

exit /b 0
