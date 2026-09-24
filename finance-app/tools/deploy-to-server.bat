@echo off
setlocal
title MOST - выкладка на сервер
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-to-server.ps1" -Target "\\MostServer\Documents\MOST-Финансы" -Port 3000 %*
set "RC=%errorlevel%"
if %RC% neq 0 goto :failed

echo.
echo  Выкладка завершена успешно.
pause
exit /b 0

:failed
echo.
echo  Выкладка завершилась с ошибкой. Подробности выше и в логе (data\logs\deploy-*.log или %TEMP%).
pause
exit /b 1
