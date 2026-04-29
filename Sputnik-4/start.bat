@echo off
title PurGeoCom Launcher
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo Download from: https://nodejs.org
    pause
    exit /b 1
)

if not exist node_modules (
    echo First launch - installing dependencies...
    npm install
    echo.
    pause
)

:MENU
cls
echo.
echo  ==========================================
echo    PurGeoCom  -  Server Management
echo  ==========================================
echo.

set "SV=STOPPED"
for /f "tokens=*" %%i in ('netstat -an 2^>nul ^| findstr "0.0.0.0:3000"') do set "SV=RUNNING"
if "%SV%"=="RUNNING" (
    echo    Server:  [ RUNNING ]  http://localhost:3000
) else (
    echo    Server:  [ STOPPED ]
)

echo.
echo    ----------------------------------------
echo    1.  Start server
echo    2.  Open in browser
echo    3.  Reinstall dependencies
echo    4.  Exit
echo    ----------------------------------------
echo.
set choice=
set /p choice=   Action (1-4):

if "%choice%"=="1" goto START
if "%choice%"=="2" goto BROWSER
if "%choice%"=="3" goto INSTALL
if "%choice%"=="4" goto QUIT
goto MENU

:START
set "SV2=STOPPED"
for /f "tokens=*" %%i in ('netstat -an 2^>nul ^| findstr "0.0.0.0:3000"') do set "SV2=RUNNING"
if "%SV2%"=="RUNNING" (
    echo.
    echo    Server is already running!
    timeout /t 2 /nobreak >nul
    goto MENU
)
echo.
echo    Starting server...
start "PurGeoCom Server" /d "%~dp0" cmd /k node server.js
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
goto MENU

:BROWSER
start "" http://localhost:3000
goto MENU

:INSTALL
echo.
echo    Reinstalling dependencies...
if exist node_modules rmdir /s /q node_modules
npm install
echo.
echo    Done!
pause
goto MENU

:QUIT
exit /b 0
