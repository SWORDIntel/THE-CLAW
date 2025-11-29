@echo off
REM THE-CLAW Launcher for Windows - Runs THE-CLAW in the background without a terminal window
REM Usage: launch.bat

setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Auto-bootstrap check
if not exist "claude-control-browser\node_modules" (
    echo 🔧 Auto-bootstrapping dependencies...
    call bootstrap.bat
    if errorlevel 1 (
        echo ⚠️  Auto-bootstrap failed
        echo Run 'bootstrap.bat' manually to fix issues
        pause
        exit /b 1
    )
) else (
    if not exist "claude-control-browser\node_modules\electron\index.js" (
        echo ⚠️  Corrupted installation detected. Reinstalling...
        call bootstrap.bat
        if errorlevel 1 (
            echo Failed to reinstall
            pause
            exit /b 1
        )
    )
)

REM Run the application in the background
echo ✅ THE-CLAW is starting...
echo 📝 Logs are stored in: %TEMP%\claw-logs.txt
echo.

REM Set up performance environment variables
setlocal
set NODE_OPTIONS=--max-old-space-size=4096 --enable-source-maps
set ELECTRON_DISABLE_SANDBOX=1
set ENABLE_V8_CODE_CACHE=1

REM Run in background with logging
start /B cmd /c "npm start --prefix claude-control-browser -- ^
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
  --no-pings >> %TEMP%\claw-logs.txt 2>&1"

timeout /t 2 /nobreak >nul

echo.
echo To stop THE-CLAW, close the window or run: taskkill /IM electron.exe /F
echo To view logs: type %TEMP%\claw-logs.txt

exit /b 0
