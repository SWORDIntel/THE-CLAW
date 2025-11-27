@echo off
setlocal enabledelayedexpansion

echo 🚀 Bootstrapping THE-CLAW environment...

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js 16 or higher from https://nodejs.org/
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✓ Node.js version: %NODE_VERSION%

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm is not installed. Please install npm.
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✓ npm version: %NPM_VERSION%

REM Install dependencies
echo.
echo 📦 Installing dependencies for claude-control-browser...
cd claude-control-browser
call npm install
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    exit /b 1
)

cd ..
echo.
echo ✅ Bootstrap complete! Run 'launch.bat' to start the application.
exit /b 0
