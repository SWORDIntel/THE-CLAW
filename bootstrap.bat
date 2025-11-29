@echo off
setlocal enabledelayedexpansion

echo 🚀 Bootstrapping THE-CLAW environment...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed
    echo.
    echo Installation options:
    echo   1) Download from https://nodejs.org/ ^(recommended^)
    echo   2) Use Chocolatey: choco install nodejs
    echo   3) Use Windows Package Manager: winget install OpenJS.NodeJS
    echo.
    echo Please install Node.js 16 or higher and re-run this script.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✓ Node.js version: %NODE_VERSION%

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm is not installed. Please reinstall Node.js.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✓ npm version: %NPM_VERSION%

REM Navigate to application directory
cd claude-control-browser

REM Check if node_modules exists and is valid
if exist "node_modules" (
    echo.
    echo 🔍 Checking existing installation...

    if not exist "node_modules\electron\index.js" (
        echo ⚠️  Corrupted installation detected. Reinstalling...
        rmdir /s /q node_modules
        if exist package-lock.json del package-lock.json
        call npm install
        if errorlevel 1 (
            cd ..
            echo ❌ Failed to install dependencies
            pause
            exit /b 1
        )
    ) else (
        echo ✓ Installation is valid
        call npm install --prefer-offline --no-audit >nul 2>&1
        if errorlevel 1 (
            call npm install
            if errorlevel 1 (
                cd ..
                echo ❌ Failed to install dependencies
                pause
                exit /b 1
            )
        )
    )
) else (
    echo.
    echo 📦 Installing dependencies for claude-control-browser...
    call npm install
    if errorlevel 1 (
        cd ..
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check for security vulnerabilities
echo.
echo 🔒 Checking for security vulnerabilities...
call npm audit --audit-level=high >nul 2>&1
if errorlevel 0 (
    echo ⚠️  Security vulnerabilities found. Run 'npm audit fix' to fix them.
)

cd ..
echo.
echo ✅ Bootstrap complete!
exit /b 0
