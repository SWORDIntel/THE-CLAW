@echo off
REM THE-CLAW Profile Selector (Windows)
REM Interactive menu to select and launch specific profiles

setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Auto-bootstrap first
if not exist "claude-control-browser\node_modules" (
    echo 📦 Auto-bootstrapping dependencies...
    call bootstrap.bat > nul 2>&1
    if errorlevel 1 (
        echo ❌ Auto-bootstrap failed
        exit /b 1
    )
)

:menu
cls
echo.
echo ╔════════════════════════════════════════════════════╗
echo ║         THE-CLAW Profile Selector (Windows)       ║
echo ╚════════════════════════════════════════════════════╝
echo.
echo 📋 Available Profiles:
echo.
echo   1) Claude Code #1
echo   2) Claude Code #2
echo   3) Claude Code #3
echo   4) Claude Code #4
echo   5) Claude Workspace #5
echo   6) Claude Workspace #6
echo   7) Claude Workspace #7
echo   8) ChatGPT #8
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo   A) Launch All (1-8) - Full 4x2 grid
echo   C) Launch Claude Only (1-7)
echo   G) Launch GPT Verification (8)
echo.
echo   V) Open Control Server (http://127.0.0.1:7780/)
echo.
echo   Q) Quit
echo.

set /p choice="Choose an option (1-8, A, C, G, V, Q): "

if "%choice%"=="1" goto profile1
if "%choice%"=="2" goto profile2
if "%choice%"=="3" goto profile3
if "%choice%"=="4" goto profile4
if "%choice%"=="5" goto profile5
if "%choice%"=="6" goto profile6
if "%choice%"=="7" goto profile7
if "%choice%"=="8" goto profile8
if /i "%choice%"=="A" goto profile_all
if /i "%choice%"=="C" goto profile_claude
if /i "%choice%"=="G" goto profile_gpt
if /i "%choice%"=="V" goto open_server
if /i "%choice%"=="Q" goto quit
echo ❌ Invalid option
pause
goto menu

:profile1
set CLAW_PROFILES=1
echo 🚀 Launching Claude Code #1...
goto launch

:profile2
set CLAW_PROFILES=2
echo 🚀 Launching Claude Code #2...
goto launch

:profile3
set CLAW_PROFILES=3
echo 🚀 Launching Claude Code #3...
goto launch

:profile4
set CLAW_PROFILES=4
echo 🚀 Launching Claude Code #4...
goto launch

:profile5
set CLAW_PROFILES=5
echo 🚀 Launching Claude Workspace #5...
goto launch

:profile6
set CLAW_PROFILES=6
echo 🚀 Launching Claude Workspace #6...
goto launch

:profile7
set CLAW_PROFILES=7
echo 🚀 Launching Claude Workspace #7...
goto launch

:profile8
set CLAW_PROFILES=8
echo 🚀 Launching ChatGPT #8...
goto launch

:profile_all
set CLAW_PROFILES=1-8
echo 🚀 Launching All Profiles...
goto launch

:profile_claude
set CLAW_PROFILES=1-7
echo 🚀 Launching Claude Profiles (1-7)...
goto launch

:profile_gpt
set CLAW_PROFILES=8
echo 🚀 Launching ChatGPT #8...
goto launch

:launch
set NODE_OPTIONS=--max-old-space-size=4096 --enable-source-maps
set ELECTRON_DISABLE_SANDBOX=1
set ENABLE_V8_CODE_CACHE=1

echo ✅ Starting THE-CLAW...
echo 🌐 Control Server: http://127.0.0.1:7780/

start /B cmd /c "cd /d "%~dp0claude-control-browser" && npm start"
timeout /t 2 /nobreak >nul
goto menu

:open_server
echo Opening Control Server...
echo 🌐 URL: http://127.0.0.1:7780/
echo.
start http://127.0.0.1:7780/
timeout /t 1 /nobreak >nul
goto menu

:quit
echo Goodbye! 👋
exit /b 0
