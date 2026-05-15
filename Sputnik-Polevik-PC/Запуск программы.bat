@echo off
chcp 65001 >nul
title Спутник-Полевик
cd /d "%~dp0system"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo ================================================
    echo   ОШИБКА: Node.js не найден!
    echo.
    echo   Установите Node.js с флешки или скачайте с:
    echo   https://nodejs.org
    echo   После установки запустите эту программу снова.
    echo ================================================
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo.
    echo ================================================
    echo   ОШИБКА: Компоненты программы не установлены!
    echo.
    echo   Запустите один раз на компьютере с интернетом:
    echo   "Подготовка (один раз с интернетом).bat"
    echo.
    echo   Затем скопируйте всю папку сюда целиком
    echo   (папка system\node_modules должна присутствовать).
    echo ================================================
    echo.
    pause
    exit /b 1
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
