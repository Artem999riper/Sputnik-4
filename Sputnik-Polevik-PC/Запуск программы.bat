@echo off
chcp 65001 >nul
title Спутник-Полевик
cd /d "%~dp0system"

where node >nul 2>&1
if errorlevel 1 (
    echo ОШИБКА: Node.js не найден.
    echo Скачайте и установите Node.js с сайта https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Установка компонентов, подождите...
    npm install --prefer-offline
    if errorlevel 1 (
        echo ОШИБКА: установка не удалась.
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

echo Запуск программы на http://localhost:3100 ...
start "" "http://localhost:3100"
node server.js
