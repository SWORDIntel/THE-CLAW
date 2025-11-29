@echo off
REM THE-CLAW Universal Launcher for Windows
REM Automatically handles all bootstrap and startup tasks
REM Usage:
REM   run.bat                  - Launch all profiles in background
REM   run.bat start            - Launch all profiles in foreground
REM   run.bat profile          - Interactive profile selector
REM   run.bat profile 1        - Launch profile 1 only
REM   run.bat profile 1-7      - Launch profiles 1-7

setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Parse arguments
set ACTION=%1
set PROFILE=%2
if "%ACTION%"=="" set ACTION=launch
if "%PROFILE%"=="" set PROFILE=all
if "%ACTION%"=="fg" set ACTION=foreground
if "%ACTION%"=="start" set ACTION=foreground

REM Run appropriate launcher
if /i "%ACTION%"=="profile" (
    call profile-selector.bat
) else if "%ACTION%"=="foreground" (
    REM Run in foreground (visible window)
    set CLAW_PROFILES=%PROFILE%
    call bootstrap.bat
    if errorlevel 1 exit /b 1
    echo.
    echo Starting THE-CLAW in foreground mode...
    echo.
    cd claude-control-browser
    npm start
) else (
    REM Run in background
    set CLAW_PROFILES=%PROFILE%
    call launch.bat
)

exit /b 0
