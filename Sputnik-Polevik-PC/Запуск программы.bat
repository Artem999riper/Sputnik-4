@echo off
chcp 65001 >nul
title Спутник-Полевик
cd /d "%~dp0system"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo ================================================
    echo  ОШИБКА: Node.js не найден!
    echo  Скачайте и установите Node.js: https://nodejs.org
    echo  После установки перезапустите программу.
    echo ================================================
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Первый запуск: установка компонентов, подождите...
    echo.
    npm install
    if errorlevel 1 (
        echo.
        echo ================================================
        echo  ОШИБКА: установка компонентов не удалась.
        echo  Проверьте подключение к интернету и повторите.
        echo ================================================
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Компоненты установлены успешно.
    echo.
)

if not exist "public\lib\xlsx.bundle.js" (
    if exist "node_modules\xlsx-js-style\dist\xlsx.bundle.js" (
        if not exist "public\lib" mkdir "public\lib"
        copy /y "node_modules\xlsx-js-style\dist\xlsx.bundle.js" "public\lib\xlsx.bundle.js" >nul
    )
)

echo Запуск программы на http://localhost:3100 ...
echo Не закрывайте это окно пока программа работает.
echo.
start "" "http://localhost:3100"
node server.js
if errorlevel 1 (
    echo.
    echo Программа завершилась с ошибкой. Нажмите любую клавишу...
    pause >nul
)
