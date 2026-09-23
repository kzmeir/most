@echo off
chcp 65001 >nul
title MOST Финансы — доступ из интернета
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Не найден Node.js. Установите с https://nodejs.org (LTS) и запустите снова.
  pause
  exit /b 1
)
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Не найден cloudflared. Установите один раз:  winget install Cloudflare.cloudflared
  echo  (или скачайте с https://github.com/cloudflare/cloudflared/releases и положите cloudflared.exe рядом с этим файлом)
  echo.
  pause
  exit /b 1
)
echo  Запуск сервера (с доверием заголовкам туннеля)...
set TRUST_PROXY=1
start "MOST Финансы — сервер" cmd /k "set TRUST_PROXY=1 && node server.js"
timeout /t 3 >nul
echo.
echo  Открываю туннель. Ниже появится адрес вида https://....trycloudflare.com —
echo  его и отправьте сотрудникам вместе с логином и паролем. Адрес меняется при каждом запуске;
echo  постоянный адрес — см. README, раздел «Доступ из интернета».
echo.
if exist tunnel.txt (
  for /f "usebackq delims=" %%t in ("tunnel.txt") do cloudflared tunnel run %%t
) else (
  cloudflared tunnel --url http://localhost:3000
)
pause
