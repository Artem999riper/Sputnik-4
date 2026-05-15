@echo off
chcp 65001 >nul
title Спутник-Полевик ПК

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден!
    echo Установите Node.js с сайта https://nodejs.org и повторите попытку.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Первый запуск: устанавливаем зависимости...
    npm install --prefer-offline
    if errorlevel 1 (
        echo [ОШИБКА] Не удалось установить зависимости.
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

echo Запуск Спутник-Полевик ПК на http://localhost:3100 ...
start "" "http://localhost:3100"
node server.js
