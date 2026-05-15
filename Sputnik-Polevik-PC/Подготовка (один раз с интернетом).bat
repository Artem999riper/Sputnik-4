@echo off
chcp 65001 >nul
title Спутник-Полевик — Подготовка к офлайн-установке
cd /d "%~dp0system"

echo ================================================
echo   Спутник-Полевик — Подготовка к установке
echo ================================================
echo.
echo Этот батник нужно запустить ОДИН РАЗ на компьютере
echo с доступом в интернет.
echo.
echo После завершения скопируйте всю папку Sputnik-Polevik-PC
echo (вместе с папкой system\node_modules) на нужный компьютер.
echo На том компьютере достаточно только установленного Node.js.
echo.
echo Для офлайн-установки Node.js скачайте установщик (.msi):
echo   https://nodejs.org/en/download
echo Скопируйте его на флешку вместе с папкой программы.
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ОШИБКА: Node.js не найден. Сначала установите Node.js.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo Найден Node.js %NODEVER%
echo.
echo Установка компонентов (требуется интернет)...
echo.

npm install
if errorlevel 1 (
    echo.
    echo ОШИБКА: установка не удалась. Проверьте интернет.
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Готово! Компоненты установлены для Node.js %NODEVER%
echo.
echo   ВАЖНО: копируйте программу на другие ПК только
echo   с той же версией Node.js (%NODEVER%).
echo   Иначе запустите этот батник повторно на новом ПК.
echo ================================================
echo.
pause
