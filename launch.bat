@echo off
REM THE-CLAW Launcher for Windows - Runs THE-CLAW in the background without a terminal window
REM Usage: launch.bat

setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Check if dependencies are installed
if not exist "claude-control-browser\node_modules" (
    echo Dependencies not found. Installing...
    call bootstrap.bat
    if errorlevel 1 (
        echo Failed to install dependencies
        exit /b 1
    )
)

REM Run the application in the background
echo Starting THE-CLAW... 🚀
start /B npm start --prefix claude-control-browser -- ^
  --enable-gpu-rasterization ^
  --enable-features=V8CodeCaching ^
  --disable-device-discovery-notifications ^
  --disable-background-networking ^
  --disable-breakpad ^
  --disable-client-side-phishing-detection ^
  --disable-component-extensions-with-background-pages ^
  --disable-default-apps ^
  --disable-extensions ^
  --disable-popup-blocking ^
  --disable-prompt-on-repost ^
  --disable-sync ^
  --disable-translate ^
  --metrics-recording-only ^
  --no-default-browser-check ^
  --no-pings

exit /b 0
