@echo off
chcp 65001 >nul
title MOST Финансы
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Не найден Node.js. Установите один раз с https://nodejs.org (кнопка LTS), затем запустите этот файл снова.
  echo.
  pause
  exit /b 1
)
echo  Запуск MOST Финансы...
start "" http://localhost:3000
node server.js
pause
