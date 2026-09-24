@echo off
chcp 65001 >nul
title MOST Финансы — локальный запуск (без туннеля, временно)
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Не найден Node.js. Установите с https://nodejs.org (LTS) и запустите снова.
  echo.
  pause
  exit /b 1
)
echo  Временный локальный автозапуск (без Cloudflare Tunnel) — до переноса на Docker/NAS сисадмином.
echo  Если сервер с этой базой уже где-то запущен (например, из сессии Claude), это окно будет
echo  тихо ждать и само подхватит работу, как только тот процесс остановится.
echo  Не закрывайте это окно, пока приложением пользуются. Лог — в data\logs\server-<дата>.log
echo.
node tools\serve-local.js
pause
