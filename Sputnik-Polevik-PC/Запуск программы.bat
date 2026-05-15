@echo off
chcp 65001 >nul
title Спутник-Полевик
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo ================================================
    echo   ОШИБКА: Node.js не найден!
    echo.
    echo   Установите Node.js и запустите снова.
    echo   Скачать: https://nodejs.org
    echo ================================================
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo.
    echo ================================================
    echo   Компоненты не установлены!
    echo.
    echo   Запустите один раз с интернетом:
    echo   "Подготовка (один раз с интернетом).bat"
    echo.
    echo   Или при наличии интернета: npm install
    echo ================================================
    echo.
    pause
    exit /b 1
)

echo Запуск на http://localhost:3100 ...
echo Не закрывайте это окно пока программа работает.
echo.
start "" "http://localhost:3100"
node server.js
if errorlevel 1 (
    echo.
    echo Программа завершилась с ошибкой. Нажмите любую клавишу...
    pause >nul
)
