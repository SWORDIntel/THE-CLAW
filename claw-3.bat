@echo off
REM THE-CLAW: Launch Profile X
setlocal enabledelayedexpansion

cd /d "%~dp0"

if not exist "claude-control-browser\node_modules" (
    echo 📦 Auto-bootstrapping...
    call bootstrap.bat > nul 2>&1
    if errorlevel 1 exit /b 1
)

set CLAW_PROFILES=3
set NODE_OPTIONS=--max-old-space-size=4096 --enable-source-maps
set ELECTRON_DISABLE_SANDBOX=1
set ENABLE_V8_CODE_CACHE=1

echo 🚀 Launching Profile 3...
start /B cmd /c "cd claude-control-browser && npm start"
exit /b 0
