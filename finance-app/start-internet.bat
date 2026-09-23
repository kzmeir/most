@echo off
chcp 65001 >nul
title MOST Финансы — сервер и доступ из интернета
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Не найден Node.js. Установите с https://nodejs.org (LTS) и запустите снова.
  pause
  exit /b 1
)
where cloudflared >nul 2>nul
if errorlevel 1 if not exist cloudflared.exe (
  echo.
  echo  Не найден cloudflared. Установите один раз:  winget install Cloudflare.cloudflared
  echo  (или скачайте cloudflared-windows-amd64.exe с https://github.com/cloudflare/cloudflared/releases,
  echo   переименуйте в cloudflared.exe и положите рядом с этим файлом)
  echo.
  pause
  exit /b 1
)
echo  Запуск сервера и туннеля. Публичный адрес появится ниже и в разделе «Настройки».
echo  Не закрывайте это окно. Для автозапуска при включении компьютера выполните install-autostart.bat
echo.
node tools\serve-internet.js
pause
