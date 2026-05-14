@echo off
title Sputnik-Polevik-PC
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found.
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies, please wait...
    npm install --prefer-offline
    if errorlevel 1 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)

if not exist "public\lib\xlsx.bundle.js" (
    if exist "node_modules\xlsx-js-style\dist\xlsx.bundle.js" (
        if not exist "public\lib" mkdir "public\lib"
        copy /y "node_modules\xlsx-js-style\dist\xlsx.bundle.js" "public\lib\xlsx.bundle.js" >nul
    )
)

echo Starting server on http://localhost:3100 ...
start "" "http://localhost:3100"
node server.js
